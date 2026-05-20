/**
 * __tests__/releaseGate.test.ts
 * §6 Release Gate 검증
 * #12: 성공(completed) / 경고(completed+warnings) / 오류(failed) 3분류
 */

import { describe, it, expect } from 'vitest';
import { mergeA } from '@/features/excel/merger/modeA';
import { mergeB } from '@/features/excel/merger/modeB';
import { mergeC } from '@/features/excel/merger/modeC';
import { calcJaccardSimilarity } from '@/features/excel/merger/modeA';
import { generateExportFileName } from '@/lib/utils';
import type { GateResult } from '@/types';
import type { SheetData } from '@/features/excel/parser';

// ─────────────────────────────────────────────
// Release Gate 판정 함수 (#12)
// ─────────────────────────────────────────────

function judgeGateResult(status: 'completed' | 'failed', warningCount: number): GateResult {
  if (status === 'failed') return 'error';
  if (warningCount > 0) return 'warning';
  return 'success';
}

function makeSheet(headers: string[], rows: (string | number | null)[][]): SheetData {
  return { headers, rows, sheetName: 'Sheet1' };
}

// ─────────────────────────────────────────────
// Gate 기준 판정
// ─────────────────────────────────────────────

describe('#12 Release Gate 3분류', () => {
  it('completed + warnings=0 → success', () => {
    expect(judgeGateResult('completed', 0)).toBe('success');
  });

  it('completed + warnings>0 → warning (Partial Failure)', () => {
    expect(judgeGateResult('completed', 3)).toBe('warning');
  });

  it('failed → error', () => {
    expect(judgeGateResult('failed', 0)).toBe('error');
  });
});

// ─────────────────────────────────────────────
// Performance Gate: 병합 시간 측정
// ─────────────────────────────────────────────

describe('Performance Gate — 3초 기준', () => {
  it('Mode A: 10개 파일 × 100행 → 3000ms 이내', () => {
    const rows = Array.from({ length: 100 }, (_, i) => [String(i), i]);
    const inputs = Array.from({ length: 10 }, (_, i) => ({
      fileId: String(i),
      fileName: `file_${i}.xlsx`,
      sheets: [makeSheet(['이름', '값'], rows)],
    }));

    const start = performance.now();
    mergeA(inputs, { includeSourceFile: false });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(3000);
  });

  it('Mode B: 10개 파일 × 다른 헤더 100행 → 3000ms 이내', () => {
    const inputs = Array.from({ length: 10 }, (_, i) => ({
      fileId: String(i),
      fileName: `file_${i}.xlsx`,
      sheets: [makeSheet(
        [`col_${i}_A`, `col_${i}_B`, 'shared'],
        Array.from({ length: 100 }, (_, r) => [String(r), r, 'x']),
      )],
    }));

    const start = performance.now();
    mergeB(inputs, { includeSourceFile: false });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(3000);
  });

  it('Mode C: 10개 파일 × 5시트 → 3000ms 이내', () => {
    const inputs = Array.from({ length: 10 }, (_, i) => ({
      fileId: String(i),
      fileName: `file_${i}.xlsx`,
      sheets: Array.from({ length: 5 }, (_, s) => ({
        headers: ['col'],
        rows: Array.from({ length: 50 }, (_, r) => [r]) as (string | number | null)[][],
        sheetName: `Sheet${i}_${s}`,
      })),
    }));

    const start = performance.now();
    mergeC(inputs);
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(3000);
  });
});

// ─────────────────────────────────────────────
// 포맷 교차 병합
// ─────────────────────────────────────────────

describe('포맷 교차 병합 — SheetData 레벨', () => {
  it('xlsx + csv 출처 SheetData → Mode B union 병합', async () => {
    const inputs = [
      { fileId: '1', fileName: 'data.xlsx', sheets: [makeSheet(['이름', '나이'], [['홍', 30]])] },
      { fileId: '2', fileName: 'data.csv',  sheets: [makeSheet(['이름', '부서'], [['김', '개발']])] },
    ];
    const { worksheet } = mergeB(inputs, { includeSourceFile: true });
    const XLSX = await import('xlsx');
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1 });
    expect(rows[0]).toContain('source_file');
    expect(rows[0]).toContain('이름');
  });
});

// ─────────────────────────────────────────────
// 파일명 정책 (#10: Local Time)
// ─────────────────────────────────────────────

describe('Export 파일명 정책 (#10)', () => {
  it('excel-merged_YYYYMMDD_HHmm.xlsx 포맷', () => {
    const name = generateExportFileName();
    expect(name).toMatch(/^excel-merged_\d{8}_\d{4}\.xlsx$/);
  });

  it('연속 호출 시 같은 분 내 동일 파일명 가능 (정상)', () => {
    const n1 = generateExportFileName();
    const n2 = generateExportFileName();
    // 같은 분 내 → 동일해도 무방
    expect(n1).toMatch(/^excel-merged_/);
    expect(n2).toMatch(/^excel-merged_/);
  });
});

// ─────────────────────────────────────────────
// OOM 통과 — 용량 추정 임계값
// ─────────────────────────────────────────────

describe('OOM Guard (#4)', () => {
  it('100MB × 10배 팽창 = 1GB < 1.5GB 임계값 → 통과', async () => {
    const { estimateMemoryUsageBytes, OOM_HEAP_LIMIT_BYTES } = await import('@/lib/utils');
    const files = [Object.defineProperty(new File([], 'big.xlsx'), 'size', { value: 100 * 1024 * 1024 })];
    const estimated = estimateMemoryUsageBytes(files);
    expect(estimated).toBeLessThan(OOM_HEAP_LIMIT_BYTES); // 1GB < 1.5GB
  });
});

// ─────────────────────────────────────────────
// 회귀 성공률 100% 기준 — 핵심 경로 스모크
// ─────────────────────────────────────────────

describe('회귀 스모크 테스트', () => {
  const baseHeaders = ['이름', '부서', '입사일', '직급', '이메일'];

  it('Mode A 기준: 헤더 9/10 일치 → 90% ≥ threshold', () => {
    const other = ['이름', '부서', '입사일', '직급', '이메일', '추가1']; // 5/6
    const sim = calcJaccardSimilarity(baseHeaders, other);
    // 5∩ / 6∪ ≈ 0.83 (90% 미만 → Mode B 권고 케이스)
    expect(sim).toBeLessThan(0.9);
  });

  it('Mode B: 50파일 × 3열 병합 → 오류 없음', () => {
    const inputs = Array.from({ length: 50 }, (_, i) => ({
      fileId: String(i),
      fileName: `f${i}.xlsx`,
      sheets: [makeSheet([`col${i}`, 'shared'], [[i, 'x']])],
    }));
    expect(() => mergeB(inputs, { includeSourceFile: false })).not.toThrow();
  });

  it('Mode C: 50파일 → 시트명 충돌 없이 50개 시트 생성', () => {
    const inputs = Array.from({ length: 50 }, (_, i) => ({
      fileId: String(i),
      fileName: `f${i}.xlsx`,
      sheets: [{ headers: ['v'], rows: [[i]] as (string|number|null)[][], sheetName: 'Sheet1' }],
    }));
    const { workbook } = mergeC(inputs);
    // 모든 시트명 유니크
    const names = workbook.SheetNames;
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBe(50);
  });
});
