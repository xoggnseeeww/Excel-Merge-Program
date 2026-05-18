/**
 * merger/modeC.ts — 파일별 시트 유지
 *
 * 정책:
 *  - 원본 시트를 개별적으로 유지
 *  - 시트명 31자 초과 → Truncate
 *  - 중복 시트명 → _1, _2 Suffix
 *  - source_file 컬럼: Mode C는 삽입 안 함 (#6: 시트명이 출처 역할)
 *  - 사용자가 선택한 시트만 병합 (selectedSheetIndices 기준)
 */

import * as XLSX from 'xlsx';
import type { SheetData } from '../parser';

const SHEET_NAME_MAX_LEN = 31;

// ─────────────────────────────────────────────
// 시트명 정규화
// ─────────────────────────────────────────────

function truncateSheetName(name: string): string {
  return name.length > SHEET_NAME_MAX_LEN
    ? name.slice(0, SHEET_NAME_MAX_LEN)
    : name;
}

function resolveSheetName(base: string, usedNames: Set<string>): string {
  const truncated = truncateSheetName(base);
  if (!usedNames.has(truncated)) {
    usedNames.add(truncated);
    return truncated;
  }

  // suffix 부여: _1, _2 ...
  let suffix = 1;
  while (true) {
    const suffixStr = `_${suffix}`;
    // suffix 포함해서 31자 제한 재적용
    const candidate = truncateSheetName(
      truncated.slice(0, SHEET_NAME_MAX_LEN - suffixStr.length) + suffixStr,
    );
    if (!usedNames.has(candidate)) {
      usedNames.add(candidate);
      return candidate;
    }
    suffix++;
  }
}

// ─────────────────────────────────────────────
// Mode C 병합
// ─────────────────────────────────────────────

export interface ModeCInput {
  fileId: string;
  fileName: string;
  sheets: SheetData[];
}

export interface ModeCResult {
  workbook: XLSX.WorkBook;
  totalSheets: number;
}

export function mergeC(inputs: ModeCInput[]): ModeCResult {
  if (inputs.length === 0) throw new Error('[ModeC] 입력 파일 없음');

  const wb = XLSX.utils.book_new();
  const usedNames = new Set<string>();

  for (const input of inputs) {
    for (const sheet of input.sheets) {
      const resolvedName = resolveSheetName(sheet.sheetName, usedNames);

      // SheetData → XLSX.WorkSheet
      const wsData = [sheet.headers, ...sheet.rows];
      const ws = XLSX.utils.aoa_to_sheet(wsData);

      XLSX.utils.book_append_sheet(wb, ws, resolvedName);
    }
  }

  return { workbook: wb, totalSheets: wb.SheetNames.length };
}
