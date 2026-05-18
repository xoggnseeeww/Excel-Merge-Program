import { logger } from '@/lib/logger';
/**
 * merger/index.ts — Merger 진입점
 *
 * 책임:
 *  - ManagedFile[] → parseFile() → 모드별 merge 함수 호출
 *  - Partial Failure: 개별 파일 오류 catch → MergeWarning push → 진행
 *  - Fatal: E004(OOM) / Worker Crash → 상위로 throw
 *  - 출력: XLSX.write() → ArrayBuffer 반환
 *  - 텔레메트리 수집
 */

import * as XLSX from 'xlsx';
import type { ManagedFile, MergeMode, MergeWarning, Telemetry } from '@/types';
import { parseFile } from '../parser';
import type { SheetData } from '../parser';
import { mergeA, ModeAHeaderMismatchError } from './modeA';
import { mergeB } from './modeB';
import { mergeC } from './modeC';
import { generateExportFileName } from '@/lib/utils';

// ─────────────────────────────────────────────
// 입력/반환 타입
// ─────────────────────────────────────────────

export interface MergeOptions {
  mode: MergeMode;
  includeSourceFile: boolean;
  includeHiddenSheets: boolean;
}

export interface MergeResult {
  /** XLSX 파일 ArrayBuffer */
  buffer: ArrayBuffer;
  fileName: string;
  totalRows: number;
  warnings: MergeWarning[];
  telemetry: Partial<Telemetry>;
}

// ─────────────────────────────────────────────
// 파일 → SheetData[] 변환 헬퍼
// ─────────────────────────────────────────────

async function toSheetDataList(
  file: ManagedFile,
  opts: MergeOptions,
): Promise<SheetData[]> {
  const parsed = await parseFile(file.file, {
    extension: file.extension,
    includeHiddenSheets: opts.includeHiddenSheets,
    targetSheetIndices: file.selectedSheetIndices,
  });

  if (parsed.hasEmptySheet) {
    // E005는 warning — 전체 중단 없음
    logger.warn(`[Merger] 빈 시트 발견: ${file.file.name}`);
  }

  return parsed.sheets;
}

// ─────────────────────────────────────────────
// 메인 병합 함수
// ─────────────────────────────────────────────

export async function runMerge(
  files: ManagedFile[],
  opts: MergeOptions,
): Promise<MergeResult> {
  const mergeStart = performance.now();
  const warnings: MergeWarning[] = [];
  let totalRows = 0;
  let workerUsed = false;

  // ── 파싱 단계 ──────────────────────────────
  const parseStart = performance.now();

  interface InputEntry {
    fileId: string;
    fileName: string;
    sheets: SheetData[];
  }

  const inputs: InputEntry[] = [];

  for (const file of files) {
    if (file.status !== 'valid') continue;

    try {
      const parseResult = await parseFile(file.file, {
        extension: file.extension,
        includeHiddenSheets: opts.includeHiddenSheets,
        targetSheetIndices: file.selectedSheetIndices,
      });

      if (parseResult.requiresWorker) workerUsed = true;

      if (parseResult.sheets.length === 0) {
        warnings.push({
          fileId: file.id,
          fileName: file.file.name,
          errorCode: 'E005',
          message: `빈 시트만 존재하여 스킵: ${file.file.name}`,
        });
        continue;
      }

      inputs.push({
        fileId: file.id,
        fileName: file.file.name,
        sheets: parseResult.sheets,
      });
    } catch (err) {
      // 개별 파일 파싱 실패 → Partial Failure
      const msg = err instanceof Error ? err.message : String(err);

      // 암호화 파일 감지 (SheetJS 에러 메시지 기반)
      const isEncrypted = msg.toLowerCase().includes('password') || msg.toLowerCase().includes('encrypted');

      warnings.push({
        fileId: file.id,
        fileName: file.file.name,
        errorCode: isEncrypted ? 'E001' : 'E002',
        message: isEncrypted
          ? `암호화된 파일 스킵: ${file.file.name}`
          : `파일 손상 또는 읽기 실패 스킵: ${file.file.name} (${msg})`,
      });
    }
  }

  const parseDurationMs = performance.now() - parseStart;

  if (inputs.length === 0) {
    throw new Error('[Merger] 병합 가능한 파일이 없습니다. 오류 로그를 확인하세요.');
  }

  // ── 병합 단계 ──────────────────────────────
  let outputBuffer: ArrayBuffer;

  try {
    if (opts.mode === 'A') {
      // Mode A — ModeAHeaderMismatchError는 Partial Failure로 처리
      const safeInputs: InputEntry[] = [];
      for (const input of inputs) {
        try {
          // 기준 헤더 대비 개별 검증 (실제 병합은 mergeA 내부)
          safeInputs.push(input);
        } catch (e) {
          if (e instanceof ModeAHeaderMismatchError) {
            warnings.push({
              fileId: input.fileId,
              fileName: input.fileName,
              errorCode: 'E002',
              message: e.message,
            });
          } else throw e;
        }
      }

      let result;
      try {
        result = mergeA(safeInputs, { includeSourceFile: opts.includeSourceFile });
      } catch (e) {
        if (e instanceof ModeAHeaderMismatchError) {
          // 헤더 불일치는 Fatal이 아님 — UI에서 Mode B 제안 처리
          throw e;
        }
        throw e;
      }

      totalRows = result.totalRows;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, result.worksheet, 'Merged');
      outputBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    } else if (opts.mode === 'B') {
      const result = mergeB(inputs, { includeSourceFile: opts.includeSourceFile });
      totalRows = result.totalRows;
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, result.worksheet, 'Merged');
      outputBuffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;

    } else {
      // Mode C
      const result = mergeC(inputs);
      totalRows = result.totalSheets; // Mode C는 행 대신 시트 수
      outputBuffer = XLSX.write(result.workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    }
  } catch (err) {
    // OOM / 알 수 없는 Fatal → 상위(Store)에서 failed 전이 처리
    throw err;
  }

  const mergeDurationMs = performance.now() - mergeStart;

  return {
    buffer: outputBuffer,
    fileName: generateExportFileName(),
    totalRows,
    warnings,
    telemetry: {
      merge_duration_ms: Math.round(mergeDurationMs),
      parse_duration_ms: Math.round(parseDurationMs),
      worker_used: workerUsed,
      total_rows: totalRows,
      memory_warning_triggered: false,
    },
  };
}

// ─────────────────────────────────────────────
// 다운로드 트리거 (브라우저 전용)
// ─────────────────────────────────────────────

export function downloadBuffer(buffer: ArrayBuffer, fileName: string): void {
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}
