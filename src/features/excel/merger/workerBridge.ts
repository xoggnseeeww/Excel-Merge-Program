/**
 * features/excel/merger/workerBridge.ts
 *
 * Worker 생성 / 메시지 송수신 / Abort 래퍼
 * useMergeAction에서 requiresWorker=true 시 runMerge 대신 호출
 */

import type {
  WorkerInMessage,
  WorkerOutMessage,
  SerializedManagedFile,
  WorkerMergePayload,
} from '@/workers/mergeWorker';
import type { ManagedFile, MergeMode, MergeWarning, Telemetry } from '@/types';

export interface WorkerMergeOptions {
  mode: MergeMode;
  includeSourceFile: boolean;
  includeHiddenSheets: boolean;
  onProgress?: (percent: number, label: string) => void;
  onOomWarning?: () => void;
}

export interface WorkerMergeResult {
  buffer: ArrayBuffer;
  fileName: string;
  totalRows: number;
  warnings: MergeWarning[];
  telemetry: Partial<Telemetry>;
  worker: Worker; // 호출부에서 Store에 보관 → Abort 용
}

/**
 * ManagedFile → SerializedManagedFile (ArrayBuffer 직렬화)
 * Transferable로 Worker에 전송 — 복사 비용 최소화
 */
async function serializeFiles(files: ManagedFile[]): Promise<{
  serialized: SerializedManagedFile[];
  transferables: ArrayBuffer[];
}> {
  const serialized: SerializedManagedFile[] = [];
  const transferables: ArrayBuffer[] = [];

  for (const f of files) {
    if (f.status !== 'valid') continue;
    const buffer = await f.file.arrayBuffer();
    serialized.push({
      id: f.id,
      name: f.file.name,
      size: f.file.size,
      buffer,
      extension: f.extension,
      selectedSheetIndices: f.selectedSheetIndices,
    });
    transferables.push(buffer);
  }

  return { serialized, transferables };
}

export function runMergeInWorker(
  files: ManagedFile[],
  opts: WorkerMergeOptions,
): Promise<WorkerMergeResult> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      new URL('@/workers/mergeWorker.ts', import.meta.url),
      { type: 'module' },
    );

    worker.onmessage = (e: MessageEvent<WorkerOutMessage>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'PROGRESS':
          opts.onProgress?.(msg.percent, msg.label);
          break;

        case 'OOM_WARNING':
          opts.onOomWarning?.();
          break;

        case 'SUCCESS':
          worker.terminate();
          resolve({
            buffer: msg.buffer,
            fileName: msg.fileName,
            totalRows: msg.totalRows,
            warnings: msg.warnings,
            telemetry: msg.telemetry,
            worker, // already terminated — 참조만 보관
          });
          break;

        case 'ERROR':
          worker.terminate();
          reject(new Error(msg.message));
          break;
      }
    };

    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(`Worker crash: ${e.message}`));
    };

    // 파일 직렬화 후 전송
    serializeFiles(files).then(({ serialized, transferables }) => {
      const payload: WorkerMergePayload = {
        files: serialized,
        mode: opts.mode,
        includeSourceFile: opts.includeSourceFile,
        includeHiddenSheets: opts.includeHiddenSheets,
      };

      const msg: WorkerInMessage = { type: 'MERGE', payload };
      // Transferable 전송 → 복사 없이 소유권 이전
      worker.postMessage(msg, transferables);
    });
  });
}
