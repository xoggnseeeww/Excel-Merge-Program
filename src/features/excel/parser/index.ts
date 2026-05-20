/**
 * features/excel/parser/index.ts — Sprint 3
 *
 * 책임:
 *  - SheetJS 래퍼 (xlsx / xls / csv)
 *  - CSV 인코딩 감지 (#1: BOM → jschardet → EUC-KR 폴백)
 *  - Preview: 상위 10행 / 20열 (#2 spec §4.2)
 *  - Mode C 메타데이터 선파싱: 시트명만 추출, 데이터 파싱은 병합 시점 (#2 problem)
 *  - 날짜 Serial 보존, 수식 결과값만, 외부링크 수식 제거
 *  - 숨김 행/열 강제 포함, 빈 헤더 → unnamed_N 자동 부여
 *  - 병합 셀 → 좌상단 값만 (SheetJS 기본 동작)
 *  - 10MB 초과 → Worker 전환 플래그 반환 (실제 Worker 전환은 호출부 책임)
 *
 * 주의: jschardet 미설치 환경 대비 동적 import + graceful fallback
 */

import * as XLSX from 'xlsx';
import type { CellValue, PreviewData, SupportedExtension } from '@/types';
import { decodeCsv } from './encoding';

// ─────────────────────────────────────────────
// 상수
// ─────────────────────────────────────────────

const PREVIEW_MAX_ROWS = 10;
const PREVIEW_MAX_COLS = 20;
const WORKER_THRESHOLD_BYTES = 10 * 1024 * 1024; // 10MB

// ─────────────────────────────────────────────
// 반환 타입
// ─────────────────────────────────────────────

export interface SheetData {
  /** 헤더 행 (unnamed_N 처리 포함) */
  headers: string[];
  /** 전체 데이터 행 (CellValue[][]) */
  rows: CellValue[][];
  /** 원본 시트명 */
  sheetName: string;
}

export interface ParseResult {
  /** 파싱된 시트 데이터 목록 */
  sheets: SheetData[];
  /** 파일 내 전체 시트명 (Mode C 선파싱용) */
  sheetNames: string[];
  /** 10MB 초과 → true (호출부에서 Worker 전환 결정) */
  requiresWorker: boolean;
  /** 빈 시트 감지 여부 (E005) */
  hasEmptySheet: boolean;
}

export interface MetaParseResult {
  /** Mode C 선파싱: 시트명 목록만 */
  sheetNames: string[];
  requiresWorker: boolean;
}


// ─────────────────────────────────────────────
// 헤더 정규화
// ─────────────────────────────────────────────

/**
 * 빈 헤더 → unnamed_N 자동 부여
 * 중복 헤더 → suffix(_1, _2 ...) 부여
 */
function normalizeHeaders(raw: unknown[]): string[] {
  const counts = new Map<string, number>();
  return raw.map((cell, idx) => {
    const base = (cell != null && String(cell).trim() !== '')
      ? String(cell).trim()
      : `unnamed_${idx + 1}`;

    const prev = counts.get(base) ?? 0;
    counts.set(base, prev + 1);
    return prev === 0 ? base : `${base}_${prev}`;
  });
}

// ─────────────────────────────────────────────
// 외부 링크 수식 제거
// ─────────────────────────────────────────────

/**
 * 외부 링크 수식 패턴: =[파일명]시트명!셀주소
 * 해당 셀은 캐시된 결과값(v)만 사용, 수식(f) 제거
 */
function sanitizeWorkbook(wb: XLSX.WorkBook): void {
  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    for (const key of Object.keys(ws)) {
      if (key.startsWith('!')) continue;
      const cell = ws[key] as XLSX.CellObject;
      if (cell?.f && /^\[.+\]/.test(cell.f)) {
        // 외부 링크 수식 → f 제거, v(캐시값) 유지
        delete cell.f;
      }
    }
  }
}

// ─────────────────────────────────────────────
// 셀값 추출
// ─────────────────────────────────────────────

function extractCellValue(cell: XLSX.CellObject | undefined): CellValue {
  if (cell == null) return null;
  switch (cell.t) {
    case 'n': return typeof cell.v === 'number' ? cell.v : null;
    case 'b': return typeof cell.v === 'boolean' ? cell.v : null;
    case 'd': return cell.v instanceof Date ? cell.v.toISOString() : String(cell.v ?? '');
    case 'e': return null;  // 에러 셀 → null
    case 's':
    default:
      return cell.v != null ? String(cell.v) : null;
  }
}

// ─────────────────────────────────────────────
// 시트 → SheetData 변환
// ─────────────────────────────────────────────

function parseSheet(ws: XLSX.WorkSheet, sheetName: string): SheetData {
  // sheet_to_json으로 전체 데이터 추출 (header:1 → 배열 배열)
  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    blankrows: true,  // 빈 행 포함 (숨김 행 강제 포함과 동일 효과)
    raw: true,        // 날짜 Serial 보존
  });

  if (raw.length === 0) {
    return { headers: [], rows: [], sheetName };
  }

  const headerRow = raw[0] ?? [];
  const headers = normalizeHeaders(headerRow);
  const rows: CellValue[][] = [];

  for (let r = 1; r < raw.length; r++) {
    const rawRow = raw[r] ?? [];
    const row: CellValue[] = headers.map((_, c) => {
      const v = rawRow[c];
      if (v == null) return null;
      if (typeof v === 'number' || typeof v === 'boolean') return v;
      return String(v);
    });
    rows.push(row);
  }

  return { headers, rows, sheetName };
}

// ─────────────────────────────────────────────
// xlsx / xls 파싱
// ─────────────────────────────────────────────

function parseWorkbook(
  buf: ArrayBuffer,
  includeHiddenSheets: boolean,
  targetSheetIndices?: number[],  // Mode C: 선택된 시트만
): Omit<ParseResult, 'requiresWorker'> {
  const wb = XLSX.read(buf, {
    type: 'array',
    cellDates: true,   // 날짜 타입 보존
    cellFormula: true, // 수식 파싱 후 sanitize
    cellNF: true,      // dateNF 적용을 위해 포맷 보존
    dense: false,
  });

  sanitizeWorkbook(wb);

  const allSheetNames = wb.SheetNames;
  let targetNames: string[];

  if (targetSheetIndices && targetSheetIndices.length > 0) {
    // Mode C: 사용자가 선택한 시트만
    targetNames = targetSheetIndices
      .filter((i) => i >= 0 && i < allSheetNames.length)
      .map((i) => allSheetNames[i] ?? '')
      .filter(Boolean);
  } else {
    targetNames = allSheetNames;
  }

  let hasEmptySheet = false;
  const sheets: SheetData[] = [];

  for (const name of targetNames) {
    const ws = wb.Sheets[name];
    if (!ws) continue;

    // 숨김 시트 처리
    const visibility = wb.Workbook?.Sheets?.find((s) => s.name === name)?.Hidden;
    if (!includeHiddenSheets && visibility !== undefined && visibility !== 0) continue;

    const sheetData = parseSheet(ws, name);
    if (sheetData.headers.length === 0 && sheetData.rows.length === 0) {
      hasEmptySheet = true;
      continue; // E005: 빈 시트 스킵
    }
    sheets.push(sheetData);
  }

  return { sheets, sheetNames: allSheetNames, hasEmptySheet };
}

// ─────────────────────────────────────────────
// CSV 파싱
// ─────────────────────────────────────────────

async function parseCsv(buf: ArrayBuffer): Promise<Omit<ParseResult, 'requiresWorker'>> {
  const text = await decodeCsv(buf);
  const wb = XLSX.read(text, { type: 'string', cellDates: true, raw: true });
  const name = wb.SheetNames[0] ?? 'Sheet1';
  const ws = wb.Sheets[name];
  if (!ws) {
    return { sheets: [], sheetNames: [name], hasEmptySheet: true };
  }
  const sheetData = parseSheet(ws, name);
  return {
    sheets: [sheetData],
    sheetNames: [name],
    hasEmptySheet: sheetData.headers.length === 0,
  };
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

export interface ParseOptions {
  extension: SupportedExtension;
  includeHiddenSheets?: boolean;
  /** Mode C: 파싱할 시트 인덱스 목록 (미지정 시 전체) */
  targetSheetIndices?: number[];
}

/**
 * 단일 파일 전체 파싱 (병합 시점 호출)
 */
export async function parseFile(
  file: File,
  opts: ParseOptions,
): Promise<ParseResult> {
  const requiresWorker = file.size > WORKER_THRESHOLD_BYTES;
  const buf = (await file.arrayBuffer()) as ArrayBuffer;

  let result: Omit<ParseResult, 'requiresWorker'>;

  if (opts.extension === 'csv') {
    result = await parseCsv(buf);
  } else {
    result = parseWorkbook(buf, opts.includeHiddenSheets ?? false, opts.targetSheetIndices);
  }

  return { ...result, requiresWorker };
}

/**
 * Mode C 메타데이터 선파싱 (#2)
 * 시트명 목록만 추출 — 데이터 파싱 없음
 */
export async function parseSheetMeta(file: File, extension: SupportedExtension): Promise<MetaParseResult> {
  const requiresWorker = file.size > WORKER_THRESHOLD_BYTES;

  if (extension === 'csv') {
    return { sheetNames: [file.name.replace(/\.csv$/i, '')], requiresWorker };
  }

  const buf = (await file.arrayBuffer()) as ArrayBuffer;
  // SheetJS: SheetNames 추출만 — 셀 파싱 없음
  const wb = XLSX.read(buf, { type: 'array', bookSheets: true });
  return { sheetNames: wb.SheetNames, requiresWorker };
}

/**
 * Preview 전용 파싱 (#2 spec §4.2)
 * sheet_to_json range 옵션으로 상위 10행/20열만 렌더링
 */
export async function parsePreview(
  file: File,
  extension: SupportedExtension,
  sheetIndex = 0,
): Promise<PreviewData> {
  const buf = (await file.arrayBuffer()) as ArrayBuffer;
  let ws: XLSX.WorkSheet | undefined;

  if (extension === 'csv') {
    const text = await decodeCsv(buf);
    const wb = XLSX.read(text, { type: 'string', sheetRows: PREVIEW_MAX_ROWS + 1 });
    ws = wb.Sheets[wb.SheetNames[0] ?? ''];
  } else {
    const wb = XLSX.read(buf, {
      type: 'array',
      sheetRows: PREVIEW_MAX_ROWS + 1,  // 헤더 포함 +1
      cellDates: true,
    });
    ws = wb.Sheets[wb.SheetNames[sheetIndex] ?? wb.SheetNames[0] ?? ''];
  }

  if (!ws) {
    return { headers: [], rows: [], totalRows: 0, totalCols: 0 };
  }

  // range 옵션으로 20열 제한
  const ref = ws['!ref'];
  if (ref) {
    const range = XLSX.utils.decode_range(ref);
    range.e.c = Math.min(range.e.c, PREVIEW_MAX_COLS - 1);
    ws['!ref'] = XLSX.utils.encode_range(range);
  }

  const raw = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: null,
    raw: false,  // Preview는 포맷된 문자열로 표시
  });

  if (raw.length === 0) return { headers: [], rows: [], totalRows: 0, totalCols: 0 };

  const headers = normalizeHeaders(raw[0] ?? []);
  const rows = raw.slice(1).map((r) =>
    headers.map((_, c) => {
      const v = (r as unknown[])[c];
      return v != null ? String(v) : null;
    })
  );

  return {
    headers,
    rows,
    totalRows: raw.length - 1,
    totalCols: headers.length,
  };
}
