/**
 * merger/modeB.ts — 헤더 자동 매칭 병합
 *
 * 매칭 파이프라인 (#3: 사전 매칭 제거 → 3단계):
 *  1. exact       — 완전 일치
 *  2. normalized  — trim + lowercase 정규화 일치
 *  3. similarity  — Levenshtein 유사도 (임계값 0.75)
 *  → 미매핑 → new_column
 *
 * 정책:
 *  - 마스터 헤더: 모든 파일 헤더 union (등장 순서 보존)
 *  - 빈 헤더 → unnamed_N (Parser에서 이미 처리됨)
 *  - source_file 컬럼: includeSourceFile=true 시 A열 삽입
 */

import * as XLSX from 'xlsx';
import type { SheetData } from '../parser';
import type { CellValue, HeaderMatch, HeaderMatchStep } from '@/types';
import { SOURCE_FILE_COLUMN } from './modeA';

const SIMILARITY_THRESHOLD = 0.75;

// ─────────────────────────────────────────────
// Levenshtein 유사도
// ─────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i]![j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1]![j - 1]!
          : 1 + Math.min(dp[i - 1]![j]!, dp[i]![j - 1]!, dp[i - 1]![j - 1]!);
    }
  }
  return 1 - dp[m]![n]! / Math.max(m, n, 1);
}

function normalize(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ─────────────────────────────────────────────
// 단일 헤더 매칭
// ─────────────────────────────────────────────

export function matchHeader(
  source: string,
  masterHeaders: string[],
  usedTargets: Set<string>,
): HeaderMatch {
  const srcNorm = normalize(source);

  // 1. exact
  const exactIdx = masterHeaders.findIndex(
    (h) => h === source && !usedTargets.has(h),
  );
  if (exactIdx >= 0) {
    const target = masterHeaders[exactIdx]!;
    usedTargets.add(target);
    return { sourceHeader: source, targetHeader: target, step: 'exact', score: 1 };
  }

  // 2. normalized
  const normIdx = masterHeaders.findIndex(
    (h) => normalize(h) === srcNorm && !usedTargets.has(h),
  );
  if (normIdx >= 0) {
    const target = masterHeaders[normIdx]!;
    usedTargets.add(target);
    return { sourceHeader: source, targetHeader: target, step: 'normalized', score: 0.95 };
  }

  // 3. similarity (Levenshtein)
  let bestScore = 0;
  let bestTarget: string | null = null;
  for (const h of masterHeaders) {
    if (usedTargets.has(h)) continue;
    const score = levenshtein(srcNorm, normalize(h));
    if (score > bestScore) {
      bestScore = score;
      bestTarget = h;
    }
  }
  if (bestTarget !== null && bestScore >= SIMILARITY_THRESHOLD) {
    usedTargets.add(bestTarget);
    return { sourceHeader: source, targetHeader: bestTarget, step: 'similarity', score: bestScore };
  }

  // new_column
  return { sourceHeader: source, targetHeader: null, step: 'new_column', score: 0 };
}

// ─────────────────────────────────────────────
// 마스터 헤더 생성 (union, 등장 순서 보존)
// ─────────────────────────────────────────────

function buildMasterHeaders(inputs: ModeBInput[]): string[] {
  const seen = new Set<string>();
  const master: string[] = [];
  for (const input of inputs) {
    for (const sheet of input.sheets) {
      for (const h of sheet.headers) {
        if (!seen.has(h)) {
          seen.add(h);
          master.push(h);
        }
      }
    }
  }
  return master;
}

// ─────────────────────────────────────────────
// Mode B 병합
// ─────────────────────────────────────────────

export interface ModeBInput {
  fileId: string;
  fileName: string;
  sheets: SheetData[];
}

export interface ModeBOptions {
  includeSourceFile: boolean;
}

export interface ModeBResult {
  worksheet: XLSX.WorkSheet;
  totalRows: number;
  /** 매칭 리포트 (UI 로그용) */
  matchReport: HeaderMatch[];
}

export function mergeB(inputs: ModeBInput[], opts: ModeBOptions): ModeBResult {
  if (inputs.length === 0) throw new Error('[ModeB] 입력 파일 없음');

  const masterHeaders = buildMasterHeaders(inputs);
  const finalHeaders = opts.includeSourceFile
    ? [SOURCE_FILE_COLUMN, ...masterHeaders]
    : [...masterHeaders];

  const allRows: CellValue[][] = [];
  const matchReport: HeaderMatch[] = [];

  for (const input of inputs) {
    for (const sheet of input.sheets) {
      // 헤더 매칭
      const usedTargets = new Set<string>();
      const matches = sheet.headers.map((h) =>
        matchHeader(h, masterHeaders, usedTargets),
      );

      // 신규 컬럼 추가 (마스터에 없는 경우)
      for (const m of matches) {
        if (m.step === 'new_column' && m.sourceHeader && !masterHeaders.includes(m.sourceHeader)) {
          masterHeaders.push(m.sourceHeader);
          finalHeaders.push(m.sourceHeader);
          m.targetHeader = m.sourceHeader;
        }
      }

      matchReport.push(...matches);

      // 행 변환
      for (const rawRow of sheet.rows) {
        const row: CellValue[] = masterHeaders.map((masterH) => {
          const match = matches.find((m) => m.targetHeader === masterH);
          if (!match) return null;
          const srcIdx = sheet.headers.indexOf(match.sourceHeader);
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

  return { worksheet, totalRows: allRows.length, matchReport };
}
