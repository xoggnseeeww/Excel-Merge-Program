'use client';

import { logger } from '@/lib/logger';
/**
 * store/useMergeAction.ts — 병합 오케스트레이터 훅 (Sprint 6 업데이트)
 *
 * 수정사항:
 *  - stale closure 제거: useCallback 내부에서 useAppStore.getState() 사용
 *  - deps를 빈 배열로 → 함수 참조 안정화 → useEffect 무한루프 방지
 *  - 10MB 초과 파일 존재 시 Worker 경로 자동 선택
 *  - OOM 런타임 경고 → Store telemetry 반영
 *  - Worker 인스턴스 Store 보관 → abortMerge() 연동
 */

import { useCallback } from 'react';
import { useAppStore } from './useAppStore';
import { validateBatch } from '@/features/excel/validator';
import { parsePreview, parseSheetMeta } from '@/features/excel/parser';
import { runMerge, downloadBuffer } from '@/features/excel/merger';
import { runMergeInWorker } from '@/features/excel/merger/workerBridge';
import { ModeAHeaderMismatchError } from '@/features/excel/merger/modeA';
import type { ManagedFile, Telemetry } from '@/types';
import { estimateMemoryUsageBytes, OOM_HEAP_LIMIT_BYTES } from '@/lib/utils';

const WORKER_THRESHOLD_BYTES = 10 * 1024 * 1024;

let fileIdCounter = 0;
function nextId(): string {
  return `file_${++fileIdCounter}_${Date.now()}`;
}

/** Store 최신 상태를 항상 getState()로 읽는 안정적 함수 참조 반환 */
export function useMergeAction() {
  // ── Preview 빌드 ───────────────────────────
  const buildPreview = useCallback(async (validFiles: ManagedFile[]) => {
    const s = useAppStore.getState();
    // parsing 상태가 아닐 때만 전이
    if (s.status !== 'parsing') {
      s.transitionTo('parsing');
    }
    try {
      const first = validFiles[0];
      if (!first) {
        useAppStore.getState().transitionTo('idle');
        return;
      }
      const preview = await parsePreview(first.file, first.extension);
      const s2 = useAppStore.getState();
      s2.setPreviewData(preview);
      s2.transitionTo('preview_ready');
    } catch (err) {
      const s2 = useAppStore.getState();
      s2.setFatalError(err instanceof Error ? err.message : String(err));
      s2.transitionTo('failed');
    }
  }, []);

  // ── 파일 추가 → 검증 → Preview ────────────
  const handleFilesAdded = useCallback(async (rawFiles: File[]) => {
    const s = useAppStore.getState();
    // fatalError 잔류 방지: 새 flow 시작 시 clear
    s.clearFatalError();
    s.transitionTo('validating');

    const existingFiles = s.files.map((f) => f.file);

    // OOM 사전 추정 (#4)
    const estimatedMem = estimateMemoryUsageBytes([...existingFiles, ...rawFiles]);
    if (estimatedMem > OOM_HEAP_LIMIT_BYTES) {
      const s2 = useAppStore.getState();
      s2.setFatalError('예상 메모리 사용량이 한계를 초과합니다 (E004). 파일 수를 줄여주세요.');
      s2.transitionTo('failed');
      return;
    }

    const report = await validateBatch(rawFiles, existingFiles);

    if (report.exceedsTotalLimit) {
      const s2 = useAppStore.getState();
      s2.setFatalError('총 파일 용량이 100MB를 초과합니다 (E004).');
      s2.transitionTo('idle');
      return;
    }

    const newManaged: ManagedFile[] = [];

    for (const rawFile of rawFiles) {
      const result = report.results.get(rawFile.name);
      if (!result) continue;
      if (result.isDuplicate) continue;

      if (!result.valid || !result.extension) {
        newManaged.push({
          id: nextId(), file: rawFile, status: 'invalid',
          extension: result.extension ?? 'xlsx',
          errorCode: result.errorCode, errorMessage: result.errorMessage,
        });
        continue;
      }

      const currentMode = useAppStore.getState().mergeMode;
      let sheetNames: string[] | undefined;
      if (currentMode === 'C') {
        try {
          const meta = await parseSheetMeta(rawFile, result.extension);
          sheetNames = meta.sheetNames;
        } catch { /* 무시 */ }
      }

      newManaged.push({
        id: nextId(), file: rawFile, status: 'valid',
        extension: result.extension, sheetNames,
        selectedSheetIndices: sheetNames?.map((_, i) => i),
      });
    }

    useAppStore.getState().addFiles(newManaged);

    if (report.exceedsWarnThreshold) {
      useAppStore.getState().setTelemetry({ memory_warning_triggered: true });
    }

    // addFiles 후 최신 상태에서 valid 파일 조회
    const allValid = useAppStore.getState().files.filter((f) => f.status === 'valid');
    if (allValid.length === 0) {
      useAppStore.getState().transitionTo('idle');
      return;
    }

    await buildPreview(allValid);
  }, [buildPreview]);

  // ── re_validating → preview 재실행 ─────────
  const handleReValidate = useCallback(async () => {
    const s = useAppStore.getState();
    const validFiles = s.files.filter((f) => f.status === 'valid');
    if (validFiles.length === 0) {
      s.transitionTo('idle');
      return;
    }
    s.transitionTo('parsing');
    await buildPreview(validFiles);
  }, [buildPreview]);

  // ── 병합 실행 (Worker 자동 분기) ───────────
  const handleMerge = useCallback(async () => {
    const s = useAppStore.getState();
    // fatalError 잔류 방지
    s.clearFatalError();
    s.transitionTo('merging');

    const validFiles = s.files.filter((f) => f.status === 'valid');
    const mergeOpts = {
      mode: s.mergeMode,
      includeSourceFile: s.includeSourceFile,
      includeHiddenSheets: s.includeHiddenSheets,
    };

    // 10MB 초과 파일 존재 시 Worker 경로
    const needsWorker = validFiles.some((f) => f.file.size > WORKER_THRESHOLD_BYTES);

    try {
      let result: {
        buffer: ArrayBuffer;
        fileName: string;
        totalRows: number;
        warnings: Array<{ fileId: string; fileName: string; errorCode: Parameters<typeof s.pushWarning>[0]['errorCode']; message: string }>;
        telemetry: Partial<Telemetry>;
      };

      if (needsWorker) {
        const workerResult = await runMergeInWorker(validFiles, {
          ...mergeOpts,
          onProgress: (percent, label) => {
            logger.debug(`[Worker] ${percent}% ${label}`);
          },
          onOomWarning: () => {
            useAppStore.getState().setTelemetry({ memory_warning_triggered: true });
          },
        });
        result = workerResult;
        useAppStore.getState().setTelemetry({ worker_used: true });
      } else {
        result = await runMerge(validFiles, mergeOpts);
      }

      const s2 = useAppStore.getState();
      for (const w of result.warnings) s2.pushWarning(w);
      s2.setOutputBlob(new Blob([result.buffer]));
      s2.setTelemetry(result.telemetry);
      s2.transitionTo('completed');

      downloadBuffer(result.buffer, result.fileName);

    } catch (err) {
      const s2 = useAppStore.getState();
      if (err instanceof ModeAHeaderMismatchError) {
        s2.setFatalError(err.message);
        s2.transitionTo('failed');
        return;
      }
      s2.setFatalError(err instanceof Error ? err.message : String(err));
      s2.transitionTo('failed');
    }
  }, []);

  const abortMerge = useCallback(() => {
    useAppStore.getState().abortMerge();
  }, []);

  return {
    handleFilesAdded,
    handleReValidate,
    handleMerge,
    abortMerge,
  };
}
