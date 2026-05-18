/**
 * merger/modeA.ts — 같은 양식 수직 병합
 *
 * 정책:
 *  - 기준 헤더: files[0] (dnd-kit 재정렬 후 Store 순서 기준)
 *  - 헤더 유사도: Jaccard Set 비교 (#5: 순서 무관)
 *  - 90% 미만 → ModeAHeaderMismatchError → UI에서 Mode B 제안
 *  - source_file 컬럼: includeSourceFile=true 시 A열 삽입
 */

import * as XLSX from 'xlsx';
import type { SheetData } from '../parser';
import type { CellValue } from '@/types';

export const MODE_A_SIMILARITY_THRESHOLD = 0.9;
export const SOURCE_FILE_COLUMN = 'source_file';

// ─────────────────────────────────────────────
// 에러
// ─────────────────────────────────────────────

export class ModeAHeaderMismatchError extends Error {
  constructor(
    public readonly fileName: string,
    public readonly similarity: number,
  ) {
    super(
      `다른 양식으로 보입니다 (유사도 ${(similarity * 100).toFixed(0)}%): ${fileName}\n` +
      `'열이 달라도 합치기(Mode B)'를 추천합니다.`,
    );
    this.name = 'ModeAHeaderMismatchError';
  }
}

// ─────────────────────────────────────────────
// 유사도 계산 (#5: Jaccard Set 비교 — 순서 무관)
// ─────────────────────────────────────────────

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function calcJaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a.map(normalizeHeader));
  const setB = new Set(b.map(normalizeHeader));
  const intersection = [...setA].filter((x) => setB.has(x)).length;
  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 1 : intersection / union;
}

// ─────────────────────────────────────────────
// Mode A 병합
// ─────────────────────────────────────────────

export interface ModeAInput {
  fileId: string;
  fileName: string;
  sheets: SheetData[];
}

export interface ModeAOptions {
  includeSourceFile: boolean;
}

export interface ModeAResult {
  worksheet: XLSX.WorkSheet;
  totalRows: number;
}

export function mergeA(inputs: ModeAInput[], opts: ModeAOptions): ModeAResult {
  if (inputs.length === 0) throw new Error('[ModeA] 입력 파일 없음');

  // 기준 헤더: 첫 번째 파일 첫 번째 시트
  const baseHeaders = inputs[0]?.sheets[0]?.headers ?? [];

  const allRows: CellValue[][] = [];
  const finalHeaders = opts.includeSourceFile
    ? [SOURCE_FILE_COLUMN, ...baseHeaders]
    : [...baseHeaders];

  for (const input of inputs) {
    for (const sheet of input.sheets) {
      // 헤더 유사도 검사 (기준 파일 자신은 스킵)
      if (input !== inputs[0]) {
        const similarity = calcJaccardSimilarity(baseHeaders, sheet.headers);
        if (similarity < MODE_A_SIMILARITY_THRESHOLD) {
          throw new ModeAHeaderMismatchError(input.fileName, similarity);
        }
      }

      // 헤더 → 기준 헤더 컬럼 순서로 재정렬
      const normalizedBase = baseHeaders.map(normalizeHeader);
      const colMap = sheet.headers.map((h) =>
        normalizedBase.indexOf(normalizeHeader(h)),
      );

      for (const rawRow of sheet.rows) {
        const row: CellValue[] = baseHeaders.map((_, baseIdx) => {
          const srcIdx = colMap.indexOf(baseIdx);
          return srcIdx >= 0 ? (rawRow[srcIdx] ?? null) : null;
        });

        if (opts.includeSourceFile) {
          allRows.push([input.fileName, ...row]);
        } else {
          allRows.push(row);
        }
      }
    }
  }

  const wsData = [finalHeaders, ...allRows];
  const worksheet = XLSX.utils.aoa_to_sheet(wsData);

  return { worksheet, totalRows: allRows.length };
}
