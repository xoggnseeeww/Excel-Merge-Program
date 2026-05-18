import { logger } from '@/lib/logger';
/**
 * store/useMergeAction.ts — 병합 오케스트레이터 훅 (Sprint 6 업데이트)
 *
 * Sprint 6 추가:
 *  - 10MB 초과 파일 존재 시 Worker 경로 자동 선택
 *  - OOM 런타임 경고 → Store telemetry 반영
 *  - Worker 인스턴스 Store 보관 → abortMerge() 연동
 */

'use client';

import { useCallback } from 'react';
import { useAppStore } from './useAppStore';
import { validateBatch } from '@/features/excel/validator';
import { parsePreview, parseSheetMeta } from '@/features/excel/parser';
import { runMerge, downloadBuffer } from '@/features/excel/merger';
import { runMergeInWorker } from '@/features/excel/merger/workerBridge';
import { ModeAHeaderMismatchError } from '@/features/excel/merger/modeA';
import type { ManagedFile } from '@/types';
import { estimateMemoryUsageBytes, OOM_HEAP_LIMIT_BYTES } from '@/lib/utils';

const WORKER_THRESHOLD_BYTES = 10 * 1024 * 1024;

let fileIdCounter = 0;
function nextId(): string {
  return `file_${++fileIdCounter}_${Date.now()}`;
}

export function useMergeAction() {
  const store = useAppStore();

  // ── 파일 추가 → 검증 → Preview ────────────
  const handleFilesAdded = useCallback(async (rawFiles: File[]) => {
    store.transitionTo('validating');

    const existingFiles = store.files.map((f) => f.file);

    // OOM 사전 추정 (#4)
    const estimatedMem = estimateMemoryUsageBytes([...existingFiles, ...rawFiles]);
    if (estimatedMem > OOM_HEAP_LIMIT_BYTES) {
      store.setFatalError('예상 메모리 사용량이 한계를 초과합니다 (E004). 파일 수를 줄여주세요.');
      store.transitionTo('failed');
      return;
    }

    const report = await validateBatch(rawFiles, existingFiles);

    if (report.exceedsTotalLimit) {
      store.setFatalError('총 파일 용량이 100MB를 초과합니다 (E004).');
      store.transitionTo('idle');
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

      let sheetNames: string[] | undefined;
      if (store.mergeMode === 'C') {
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

    store.addFiles(newManaged);

    if (report.exceedsWarnThreshold) {
      store.setTelemetry({ memory_warning_triggered: true });
    }

    const allValid = [...store.files, ...newManaged].filter((f) => f.status === 'valid');
    if (allValid.length === 0) { store.transitionTo('idle'); return; }

    await buildPreview(allValid);
  }, [store]);

  // ── Preview 빌드 ───────────────────────────
  const buildPreview = useCallback(async (validFiles: ManagedFile[]) => {
    store.transitionTo('parsing');
    try {
      const first = validFiles[0];
      if (!first) { store.transitionTo('idle'); return; }
      const preview = await parsePreview(first.file, first.extension);
      store.setPreviewData(preview);
      store.transitionTo('preview_ready');
    } catch (err) {
      store.setFatalError(err instanceof Error ? err.message : String(err));
      store.transitionTo('failed');
    }
  }, [store]);

  // ── re_validating → preview 재실행 ─────────
  const handleReValidate = useCallback(async () => {
    const validFiles = store.files.filter((f) => f.status === 'valid');
    if (validFiles.length === 0) { store.transitionTo('idle'); return; }
    store.transitionTo('parsing');
    await buildPreview(validFiles);
  }, [store, buildPreview]);

  // ── 병합 실행 (Worker 자동 분기) ───────────
  const handleMerge = useCallback(async () => {
    store.transitionTo('merging');

    const validFiles = store.files.filter((f) => f.status === 'valid');
    const mergeOpts = {
      mode: store.mergeMode,
      includeSourceFile: store.includeSourceFile,
      includeHiddenSheets: store.includeHiddenSheets,
    };

    // 10MB 초과 파일 존재 시 Worker 경로
    const needsWorker = validFiles.some((f) => f.file.size > WORKER_THRESHOLD_BYTES);

    try {
      let result: {
        buffer: ArrayBuffer;
        fileName: string;
        totalRows: number;
        warnings: Array<{ fileId: string; fileName: string; errorCode: Parameters<typeof store.pushWarning>[0]['errorCode']; message: string }>;
        telemetry: Partial<typeof store.telemetry>;
      };

      if (needsWorker) {
        // ── Worker 경로 ───────────────────────
        const workerResult = await runMergeInWorker(validFiles, {
          ...mergeOpts,
          onProgress: (percent, label) => {
            logger.debug(`[Worker] ${percent}% ${label}`);
          },
          onOomWarning: () => {
            store.setTelemetry({ memory_warning_triggered: true });
          },
        });
        result = workerResult;
        store.setTelemetry({ worker_used: true });
      } else {
        // ── 메인 스레드 경로 ──────────────────
        result = await runMerge(validFiles, mergeOpts);
      }

      for (const w of result.warnings) store.pushWarning(w);
      store.setOutputBlob(new Blob([result.buffer]));
      store.setTelemetry(result.telemetry);
      store.transitionTo('completed');

      downloadBuffer(result.buffer, result.fileName);

    } catch (err) {
      if (err instanceof ModeAHeaderMismatchError) {
        store.setFatalError(err.message);
        store.transitionTo('idle');
        return;
      }
      store.setFatalError(err instanceof Error ? err.message : String(err));
      store.transitionTo('failed');
    }
  }, [store]);

  return {
    handleFilesAdded,
    handleReValidate,
    handleMerge,
    abortMerge: store.abortMerge,
  };
}
