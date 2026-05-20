/**
 * workers/mergeWorker.ts — 병합 Web Worker
 *
 * 책임:
 *  - 10MB 초과 파일 포함 시 메인 스레드 블로킹 방지
 *  - #4: performance.memory 런타임 OOM 폴링 (Chrome 전용)
 *  - Transferable ArrayBuffer로 결과 전송 (복사 비용 0)
 *  - 메시지 프로토콜: WorkerInMessage / WorkerOutMessage
 */

import { runMerge } from '@/features/excel/merger';
import type { ManagedFile, MergeMode, MergeWarning, Telemetry } from '@/types';
import { OOM_HEAP_LIMIT_BYTES } from '@/lib/utils';

// ─────────────────────────────────────────────
// 메시지 프로토콜
// ─────────────────────────────────────────────

export interface WorkerMergePayload {
  files: SerializedManagedFile[];
  mode: MergeMode;
  includeSourceFile: boolean;
  includeHiddenSheets: boolean;
}

/** File 객체는 Worker로 전송 불가 → ArrayBuffer + 메타데이터로 직렬화 */
export interface SerializedManagedFile {
  id: string;
  name: string;
  size: number;
  buffer: ArrayBuffer;
  extension: 'xlsx' | 'xls' | 'csv';
  selectedSheetIndices?: number[];
}

export type WorkerInMessage =
  | { type: 'MERGE'; payload: WorkerMergePayload }
  | { type: 'ABORT' };

export type WorkerOutMessage =
  | { type: 'PROGRESS'; percent: number; label: string }
  | { type: 'SUCCESS'; buffer: ArrayBuffer; fileName: string; totalRows: number; warnings: MergeWarning[]; telemetry: Partial<Telemetry> }
  | { type: 'ERROR'; message: string; isFatal: boolean }
  | { type: 'OOM_WARNING' };

// ─────────────────────────────────────────────
// OOM 런타임 폴링 (#4: Chrome 전용)
// ─────────────────────────────────────────────

/** Chrome 전용 비표준 API */
declare const performance: Performance & {
  memory?: {
    usedJSHeapSize: number;
    totalJSHeapSize: number;
    jsHeapSizeLimit: number;
  };
};

let oomPollInterval: ReturnType<typeof setInterval> | null = null;
let oomWarned = false;

function startOomPolling(onOom: () => void): void {
  if (!performance.memory) return; // Chrome 외 브라우저 → 폴링 스킵

  oomPollInterval = setInterval(() => {
    const used = performance.memory?.usedJSHeapSize ?? 0;
    if (used > OOM_HEAP_LIMIT_BYTES && !oomWarned) {
      oomWarned = true;
      onOom();
    }
  }, 500);
}

function stopOomPolling(): void {
  if (oomPollInterval !== null) {
    clearInterval(oomPollInterval);
    oomPollInterval = null;
  }
  oomWarned = false;
}

// ─────────────────────────────────────────────
// SerializedManagedFile → ManagedFile 복원
// ─────────────────────────────────────────────

function deserializeFile(s: SerializedManagedFile): ManagedFile {
  const file = new File([s.buffer], s.name, { type: '' });
  return {
    id: s.id,
    file,
    status: 'valid',
    extension: s.extension,
    selectedSheetIndices: s.selectedSheetIndices,
  };
}

// ─────────────────────────────────────────────
// Worker 메시지 핸들러
// ─────────────────────────────────────────────

let aborted = false;

self.onmessage = async (e: MessageEvent<WorkerInMessage>) => {
  const msg = e.data;

  if (msg.type === 'ABORT') {
    aborted = true;
    stopOomPolling();
    return;
  }

  if (msg.type !== 'MERGE') return;

  aborted = false;
  const { payload } = msg;

  // OOM 폴링 시작
  startOomPolling(() => {
    const out: WorkerOutMessage = { type: 'OOM_WARNING' };
    self.postMessage(out);
  });

  try {
    // 진행 상황 알림
    const progress = (percent: number, label: string) => {
      if (aborted) return;
      const out: WorkerOutMessage = { type: 'PROGRESS', percent, label };
      self.postMessage(out);
    };

    progress(5, '파일 복원 중…');
    const managedFiles = payload.files.map(deserializeFile);

    if (aborted) return;
    progress(15, '병합 준비 중…');

    const result = await runMerge(managedFiles, {
      mode: payload.mode,
      includeSourceFile: payload.includeSourceFile,
      includeHiddenSheets: payload.includeHiddenSheets,
    });

    if (aborted) return;
    progress(95, '파일 생성 중…');

    stopOomPolling();

    // Transferable로 전송 (복사 비용 0)
    const out: WorkerOutMessage = {
      type: 'SUCCESS',
      buffer: result.buffer,
      fileName: result.fileName,
      totalRows: result.totalRows,
      warnings: result.warnings,
      telemetry: result.telemetry,
    };
    self.postMessage(out, { transfer: [result.buffer] });

  } catch (err) {
    stopOomPolling();
    const message = err instanceof Error ? err.message : String(err);
    const isOom = message.toLowerCase().includes('memory') ||
                  message.toLowerCase().includes('allocation');

    const out: WorkerOutMessage = {
      type: 'ERROR',
      message,
      isFatal: isOom,
    };
    self.postMessage(out);
  }
};
