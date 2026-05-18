/**
 * __fixtures__/createMockFile.ts
 * 테스트용 파일 생성 헬퍼
 *
 * SheetJS로 실제 xlsx/xls/csv 바이너리 생성 → Magic Number 검증까지 통과
 */

import * as XLSX from 'xlsx';
import type { ManagedFile } from '@/types';

// ─────────────────────────────────────────────
// Magic Number 상수
// ─────────────────────────────────────────────

const XLSX_MAGIC = new Uint8Array([0x50, 0x4b, 0x03, 0x04]);
const OLE2_MAGIC = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

// ─────────────────────────────────────────────
// xlsx 생성
// ─────────────────────────────────────────────

export function createXlsxBuffer(
  rows: Record<string, unknown>[],
  sheetName = 'Sheet1',
): ArrayBuffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return (buf as Uint8Array).buffer;
}

export function createXlsxFile(
  name: string,
  rows: Record<string, unknown>[],
  sheetName = 'Sheet1',
): File {
  const buf = createXlsxBuffer(rows, sheetName);
  return new File([buf], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// ─────────────────────────────────────────────
// csv 생성
// ─────────────────────────────────────────────

export function createCsvFile(name: string, content: string, withBom = false): File {
  const encoder = new TextEncoder();
  const body = encoder.encode(content);
  const data = withBom
    ? new Uint8Array([0xef, 0xbb, 0xbf, ...body])
    : body;
  return new File([data], name, { type: 'text/csv' });
}

// ─────────────────────────────────────────────
// 특수 케이스
// ─────────────────────────────────────────────

/** 손상된 파일 (E002) — 잘못된 시그니처 */
export function createCorruptedFile(name = 'corrupted.xlsx'): File {
  const garbage = new Uint8Array([0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0xfd]);
  return new File([garbage], name, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

/** 미지원 포맷 파일 (E003) */
export function createUnsupportedFile(name = 'malware.exe'): File {
  const data = new Uint8Array([0x4d, 0x5a, 0x90, 0x00]); // PE 시그니처
  return new File([data], name, { type: 'application/octet-stream' });
}

/** 빈 xlsx (E005) */
export function createEmptyXlsxFile(name = 'empty.xlsx'): File {
  return createXlsxFile(name, []);
}

/** 용량 초과 Mock (실제 20MB+ 생성 대신 size 프로퍼티 override) */
export function createOversizedFile(name = 'large.xlsx', sizeBytes = 21 * 1024 * 1024): File {
  // 실제 내용은 최소, File.size를 Proxy로 override
  const buf = createXlsxBuffer([{ col: 'val' }]);
  const file = new File([buf], name);
  return Object.defineProperty(file, 'size', { value: sizeBytes, configurable: true });
}

/** 중복 파일 쌍 */
export function createDuplicatePair(name = 'dup.xlsx'): [File, File] {
  const rows = [{ 이름: '홍길동', 나이: 30 }];
  const buf = createXlsxBuffer(rows);
  const f1 = new File([buf], name);
  const f2 = new File([buf], name); // 동일 내용
  return [f1, f2];
}

/** 한글 헤더 xlsx */
export function createKoreanHeaderFile(name = 'korean-header.xlsx'): File {
  return createXlsxFile(name, [
    { 이름: '홍길동', 부서: '개발팀', 입사일: '2020-01-01' },
    { 이름: '김철수', 부서: '기획팀', 입사일: '2021-03-15' },
  ]);
}

/** 수식 포함 xlsx (결과값만 보존 테스트) */
export function createFormulaXlsxFile(name = 'formula.xlsx'): File {
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {
    A1: { v: 10, t: 'n' },
    B1: { v: 20, t: 'n' },
    C1: { v: 30, f: 'A1+B1', t: 'n' }, // 수식 — 결과값 30 캐시됨
    '!ref': 'A1:C1',
  };
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new File([(buf as Uint8Array).buffer], name);
}

/** 숨김 시트 포함 xlsx */
export function createHiddenSheetXlsxFile(name = 'hidden-sheet.xlsx'): File {
  const wb = XLSX.utils.book_new();
  const ws1 = XLSX.utils.json_to_sheet([{ 공개: 'O' }]);
  const ws2 = XLSX.utils.json_to_sheet([{ 비밀: 'X' }]);
  XLSX.utils.book_append_sheet(wb, ws1, 'Public');
  XLSX.utils.book_append_sheet(wb, ws2, 'Hidden');
  // 숨김 시트 설정
  if (!wb.Workbook) wb.Workbook = { Sheets: [] };
  wb.Workbook.Sheets = [
    { name: 'Public', Hidden: 0 },
    { name: 'Hidden', Hidden: 1 },
  ];
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new File([(buf as Uint8Array).buffer], name);
}

/** 중복 헤더 xlsx */
export function createDuplicateHeaderFile(name = 'duplicate-header.xlsx'): File {
  const wb = XLSX.utils.book_new();
  const ws: XLSX.WorkSheet = {
    A1: { v: '이름', t: 's' },
    B1: { v: '이름', t: 's' }, // 중복
    C1: { v: '나이', t: 's' },
    A2: { v: '홍길동', t: 's' },
    B2: { v: '홍길동2', t: 's' },
    C2: { v: 30, t: 'n' },
    '!ref': 'A1:C2',
  };
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return new File([(buf as Uint8Array).buffer], name);
}

// ─────────────────────────────────────────────
// ManagedFile 생성 헬퍼
// ─────────────────────────────────────────────

let idCounter = 0;

export function toManagedFile(
  file: File,
  overrides: Partial<ManagedFile> = {},
): ManagedFile {
  const ext = file.name.split('.').pop()?.toLowerCase() as ManagedFile['extension'];
  return {
    id: `test_${++idCounter}`,
    file,
    status: 'valid',
    extension: ext ?? 'xlsx',
    ...overrides,
  };
}
