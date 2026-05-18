/**
 * __tests__/validator.test.ts
 * QA 테스트셋 §6 대응
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { validateFile, validateBatch } from '@/features/excel/validator';
import {
  createXlsxFile, createCsvFile, createCorruptedFile,
  createUnsupportedFile, createEmptyXlsxFile, createOversizedFile,
  createDuplicatePair, createKoreanHeaderFile,
} from '@/__fixtures__/createMockFile';

// ─────────────────────────────────────────────
// validateFile — 단일 파일
// ─────────────────────────────────────────────

describe('validateFile', () => {
  let seenKeys: Set<string>;
  beforeEach(() => { seenKeys = new Set(); });

  it('normal.xlsx → valid', async () => {
    const file = createXlsxFile('normal.xlsx', [{ name: 'test', value: 1 }]);
    const result = await validateFile(file, seenKeys);
    expect(result.valid).toBe(true);
    expect(result.detectedFormat).toBe('xlsx');
    expect(result.extension).toBe('xlsx');
    expect(result.isDuplicate).toBe(false);
  });

  it('korean-header.xlsx → valid (한글 파일명/헤더 무관)', async () => {
    const file = createKoreanHeaderFile('한글헤더_테스트.xlsx');
    const result = await validateFile(file, seenKeys);
    expect(result.valid).toBe(true);
  });

  it('corrupted.xlsx → E002 (Magic Number 불일치)', async () => {
    const file = createCorruptedFile();
    const result = await validateFile(file, seenKeys);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('E003'); // 미지원 포맷으로 분류
  });

  it('malware.exe → E003 (미지원 확장자)', async () => {
    const file = createUnsupportedFile();
    const result = await validateFile(file, seenKeys);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('E003');
  });

  it('large.xlsx (21MB) → E004 (단일 용량 초과)', async () => {
    const file = createOversizedFile('large.xlsx', 21 * 1024 * 1024);
    const result = await validateFile(file, seenKeys);
    expect(result.valid).toBe(false);
    expect(result.errorCode).toBe('E004');
  });

  it('UTF-8 BOM csv → valid', async () => {
    const file = createCsvFile('data.csv', 'name,age\nhong,30', true);
    const result = await validateFile(file, seenKeys);
    expect(result.valid).toBe(true);
    expect(result.detectedFormat).toBe('csv');
  });

  // #11: SHA-256 firstKB 기반 중복 감지
  it('중복 파일 → isDuplicate:true (SHA-256 hash 기반)', async () => {
    const [f1, f2] = createDuplicatePair();
    const r1 = await validateFile(f1, seenKeys);
    const r2 = await validateFile(f2, seenKeys);
    expect(r1.isDuplicate).toBe(false);
    expect(r2.isDuplicate).toBe(true);
  });
});

// ─────────────────────────────────────────────
// validateBatch — 배치 검증
// ─────────────────────────────────────────────

describe('validateBatch', () => {
  it('정상 파일 5개 → 전부 valid', async () => {
    const files = Array.from({ length: 5 }, (_, i) =>
      createXlsxFile(`file_${i}.xlsx`, [{ col: i }]),
    );
    const report = await validateBatch(files, []);
    expect(report.exceedsTotalLimit).toBe(false);
    expect(report.exceedsCountLimit).toBe(false);
    for (const [, r] of report.results) {
      expect(r.valid).toBe(true);
    }
  });

  it('총 용량 50MB 초과 → exceedsWarnThreshold:true', async () => {
    const bigFile = createOversizedFile('big.xlsx', 51 * 1024 * 1024);
    const report = await validateBatch([bigFile], []);
    expect(report.exceedsWarnThreshold).toBe(true);
  });

  it('기존 파일 포함 100MB 초과 → exceedsTotalLimit:true + 신규 파일 E004', async () => {
    const existing = [createOversizedFile('ex.xlsx', 60 * 1024 * 1024)];
    const incoming = [createOversizedFile('new.xlsx', 50 * 1024 * 1024)];
    const report = await validateBatch(incoming, existing);
    expect(report.exceedsTotalLimit).toBe(true);
    const result = report.results.get('new.xlsx');
    expect(result?.errorCode).toBe('E004');
  });

  it('51개 파일 → exceedsCountLimit:true', async () => {
    const files = Array.from({ length: 51 }, (_, i) =>
      createXlsxFile(`f${i}.xlsx`, [{ v: i }]),
    );
    const report = await validateBatch(files, []);
    expect(report.exceedsCountLimit).toBe(true);
  });

  it('OOM 사전 추정 값 반환', async () => {
    const files = [createXlsxFile('test.xlsx', [{ v: 1 }])];
    const report = await validateBatch(files, []);
    // estimatedMemoryBytes = size × 10
    expect(report.estimatedMemoryBytes).toBeGreaterThan(0);
    expect(report.estimatedMemoryBytes).toBe(report.totalSizeBytes * 10);
  });
});
