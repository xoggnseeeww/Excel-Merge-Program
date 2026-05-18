/**
 * __tests__/merger.test.ts
 * Mode A / B / C 병합 로직 단위 테스트
 */

import { describe, it, expect } from 'vitest';
import { mergeA, calcJaccardSimilarity, ModeAHeaderMismatchError, MODE_A_SIMILARITY_THRESHOLD } from '@/features/excel/merger/modeA';
import { mergeB, matchHeader } from '@/features/excel/merger/modeB';
import { mergeC } from '@/features/excel/merger/modeC';
import type { SheetData } from '@/features/excel/parser';
import * as XLSX from 'xlsx';

// ─── 헬퍼 ─────────────────────────────────────

function makeSheet(headers: string[], rows: (string | number | null)[][]): SheetData {
  return { headers, rows, sheetName: 'Sheet1' };
}

function readWorksheet(ws: XLSX.WorkSheet): { headers: string[]; rows: unknown[][] } {
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
  const headers = (data[0] ?? []) as string[];
  const rows = data.slice(1) as unknown[][];
  return { headers, rows };
}

// ─────────────────────────────────────────────
// Mode A
// ─────────────────────────────────────────────

describe('mergeA', () => {
  it('동일 헤더 2파일 수직 병합', () => {
    const inputs = [
      { fileId: '1', fileName: 'a.xlsx', sheets: [makeSheet(['이름', '나이'], [['홍길동', 30]])] },
      { fileId: '2', fileName: 'b.xlsx', sheets: [makeSheet(['이름', '나이'], [['김철수', 25]])] },
    ];
    const { worksheet, totalRows } = mergeA(inputs, { includeSourceFile: false });
    const { headers, rows } = readWorksheet(worksheet);
    expect(headers).toEqual(['이름', '나이']);
    expect(totalRows).toBe(2);
    expect(rows).toHaveLength(2);
  });

  it('source_file 열 A열 삽입 (includeSourceFile:true)', () => {
    const inputs = [
      { fileId: '1', fileName: 'a.xlsx', sheets: [makeSheet(['이름'], [['홍길동']])] },
    ];
    const { worksheet } = mergeA(inputs, { includeSourceFile: true });
    const { headers } = readWorksheet(worksheet);
    expect(headers[0]).toBe('source_file');
    expect(headers[1]).toBe('이름');
  });

  it('#5: 열 순서가 달라도 90% 이상 → 병합 성공 (Set 비교)', () => {
    const inputs = [
      { fileId: '1', fileName: 'a.xlsx', sheets: [makeSheet(['A', 'B', 'C', 'D', 'E'], [[1, 2, 3, 4, 5]])] },
      { fileId: '2', fileName: 'b.xlsx', sheets: [makeSheet(['E', 'D', 'C', 'B', 'A'], [[5, 4, 3, 2, 1]])] },
    ];
    expect(() => mergeA(inputs, { includeSourceFile: false })).not.toThrow();
  });

  it('90% 미만 유사도 → ModeAHeaderMismatchError', () => {
    const inputs = [
      { fileId: '1', fileName: 'a.xlsx', sheets: [makeSheet(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'], [[1,2,3,4,5,6,7,8,9,10]])] },
      { fileId: '2', fileName: 'b.xlsx', sheets: [makeSheet(['X', 'Y', 'Z'], [[1, 2, 3]])] },
    ];
    expect(() => mergeA(inputs, { includeSourceFile: false }))
      .toThrow(ModeAHeaderMismatchError);
  });
});

describe('calcJaccardSimilarity', () => {
  it('동일 집합 → 1.0', () => {
    expect(calcJaccardSimilarity(['A', 'B', 'C'], ['A', 'B', 'C'])).toBe(1);
  });

  it('완전 다른 집합 → 0.0', () => {
    expect(calcJaccardSimilarity(['A', 'B'], ['C', 'D'])).toBe(0);
  });

  it('50% 겹침 → 0.33 (∩2/∪6)', () => {
    const sim = calcJaccardSimilarity(['A', 'B', 'C', 'D'], ['C', 'D', 'E', 'F']);
    expect(sim).toBeCloseTo(2 / 6, 2);
  });

  it('임계값 0.9 기준 확인', () => {
    // 10개 중 9개 일치
    const base = ['A','B','C','D','E','F','G','H','I','J'];
    const similar = ['A','B','C','D','E','F','G','H','I','X']; // 9/11
    const sim = calcJaccardSimilarity(base, similar);
    expect(sim).toBeGreaterThanOrEqual(MODE_A_SIMILARITY_THRESHOLD);
  });
});

// ─────────────────────────────────────────────
// Mode B
// ─────────────────────────────────────────────

describe('mergeB', () => {
  it('완전 일치 헤더 매칭 (exact)', () => {
    const usedTargets = new Set<string>();
    const match = matchHeader('이름', ['이름', '나이'], usedTargets);
    expect(match.step).toBe('exact');
    expect(match.targetHeader).toBe('이름');
    expect(match.score).toBe(1);
  });

  it('정규화 일치 매칭 (normalized) — 공백/대소문자', () => {
    const usedTargets = new Set<string>();
    const match = matchHeader(' Name ', ['name', '나이'], usedTargets);
    expect(match.step).toBe('normalized');
    expect(match.targetHeader).toBe('name');
  });

  it('유사도 매칭 (similarity) — "담당자명" vs "담당자"', () => {
    const usedTargets = new Set<string>();
    const match = matchHeader('담당자명', ['담당자', '부서'], usedTargets);
    expect(match.step).toBe('similarity');
    expect(match.targetHeader).toBe('담당자');
    expect(match.score).toBeGreaterThan(0.75);
  });

  it('매칭 불가 → new_column', () => {
    const usedTargets = new Set<string>();
    const match = matchHeader('완전히다른헤더xyzABC', ['이름', '나이'], usedTargets);
    expect(match.step).toBe('new_column');
    expect(match.targetHeader).toBeNull();
  });

  it('열 구조 다른 2파일 union 병합', () => {
    const inputs = [
      { fileId: '1', fileName: 'a.xlsx', sheets: [makeSheet(['이름', '나이'], [['홍길동', 30]])] },
      { fileId: '2', fileName: 'b.xlsx', sheets: [makeSheet(['이름', '부서'], [['김철수', '개발팀']])] },
    ];
    const { worksheet, totalRows } = mergeB(inputs, { includeSourceFile: false });
    const { headers } = readWorksheet(worksheet);
    expect(headers).toContain('이름');
    expect(headers).toContain('나이');
    expect(headers).toContain('부서');
    expect(totalRows).toBe(2);
  });

  it('duplicate-header.xlsx — unnamed_N 처리 후 병합', () => {
    // 빈 헤더 포함 시트 (Parser에서 unnamed_N 처리됨)
    const inputs = [
      { fileId: '1', fileName: 'dup.xlsx', sheets: [makeSheet(['이름', 'unnamed_2', '나이'], [['홍', '홍2', 30]])] },
    ];
    const { worksheet } = mergeB(inputs, { includeSourceFile: false });
    const { headers } = readWorksheet(worksheet);
    expect(headers).toContain('unnamed_2');
  });
});

// ─────────────────────────────────────────────
// Mode C
// ─────────────────────────────────────────────

describe('mergeC', () => {
  it('파일별 시트 개별 보존', () => {
    const inputs = [
      { fileId: '1', fileName: 'a.xlsx', sheets: [{ ...makeSheet(['col'], [['v1']]), sheetName: 'Jan' }] },
      { fileId: '2', fileName: 'b.xlsx', sheets: [{ ...makeSheet(['col'], [['v2']]), sheetName: 'Feb' }] },
    ];
    const { workbook, totalSheets } = mergeC(inputs);
    expect(totalSheets).toBe(2);
    expect(workbook.SheetNames).toContain('Jan');
    expect(workbook.SheetNames).toContain('Feb');
  });

  it('31자 초과 시트명 → Truncate', () => {
    const longName = 'A'.repeat(35);
    const inputs = [
      { fileId: '1', fileName: 'a.xlsx', sheets: [{ ...makeSheet(['col'], [['v']]), sheetName: longName }] },
    ];
    const { workbook } = mergeC(inputs);
    expect(workbook.SheetNames[0]!.length).toBeLessThanOrEqual(31);
  });

  it('중복 시트명 → _1 suffix 부여', () => {
    const inputs = [
      { fileId: '1', fileName: 'a.xlsx', sheets: [{ ...makeSheet(['col'], [['v1']]), sheetName: 'Sheet1' }] },
      { fileId: '2', fileName: 'b.xlsx', sheets: [{ ...makeSheet(['col'], [['v2']]), sheetName: 'Sheet1' }] },
    ];
    const { workbook } = mergeC(inputs);
    expect(workbook.SheetNames).toContain('Sheet1');
    expect(workbook.SheetNames).toContain('Sheet1_1');
  });

  it('#6: source_file 컬럼 미삽입 (Mode C는 시트명이 출처)', () => {
    const inputs = [
      { fileId: '1', fileName: 'a.xlsx', sheets: [makeSheet(['이름'], [['홍']])] },
    ];
    const { workbook } = mergeC(inputs);
    const ws = workbook.Sheets[workbook.SheetNames[0]!]!;
    const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1 });
    const headers = data[0] as string[];
    expect(headers).not.toContain('source_file');
  });
});
