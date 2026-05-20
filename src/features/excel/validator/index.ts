import { logger } from '@/lib/logger';
/**
 * features/excel/validator/index.ts — Sprint 2
 * 검증 순서: Magic Number → 확장자 → MIME(보조) → 용량 → 중복
 * #9: OLE2 XLS 2차 확인 / #11: SHA-256 firstKB 중복키
 */

import type { ErrorCode, SupportedExtension } from '@/types';
import { generateFileKey, estimateMemoryUsageBytes } from '@/lib/utils';

const MAX_SINGLE_BYTES  = 20  * 1024 * 1024;
const WARN_TOTAL_BYTES  = 50  * 1024 * 1024;
const MAX_TOTAL_BYTES   = 100 * 1024 * 1024;
const MAX_FILE_COUNT    = 50;

const MAGIC_XLSX     = Uint8Array.from([0x50, 0x4b, 0x03, 0x04]);
const MAGIC_OLE2     = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const MAGIC_UTF8_BOM = Uint8Array.from([0xef, 0xbb, 0xbf]);

const ALLOWED_EXTENSIONS = new Set(['xlsx', 'xls', 'csv']);
const ALLOWED_MIMES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv', 'text/plain', 'application/csv', '',
]);

export type DetectedFormat = 'xlsx' | 'xls' | 'csv' | 'unknown';

export interface ValidationResult {
  valid: boolean;
  errorCode?: ErrorCode;
  errorMessage?: string;
  detectedFormat: DetectedFormat;
  extension?: SupportedExtension;
  isDuplicate: boolean;
}

export interface BatchValidationReport {
  results: Map<string, ValidationResult>;
  totalSizeBytes: number;
  exceedsWarnThreshold: boolean;
  exceedsTotalLimit: boolean;
  exceedsCountLimit: boolean;
  estimatedMemoryBytes: number;
}

function startsWith(header: Uint8Array, magic: Uint8Array): boolean {
  if (header.length < magic.length) return false;
  for (let i = 0; i < magic.length; i++) {
    if (header[i] !== magic[i]) return false;
  }
  return true;
}

async function readHeader(file: File, bytes: number): Promise<Uint8Array> {
  return new Uint8Array((await file.slice(0, bytes).arrayBuffer()) as ArrayBuffer);
}

/**
 * #9: OLE2 Compound Document → XLS 여부 2차 확인
 * Directory Entry는 UTF-16LE → "Workbook" / "Book" 스트림 탐색
 */
async function isOle2Xls(file: File): Promise<boolean> {
  const buf = await readHeader(file, 8 * 1024);
  const text = new TextDecoder('utf-16le', { fatal: false }).decode(buf);
  return text.includes('Workbook') || text.includes('Book');
}

function extractExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? (parts[parts.length - 1] ?? '').toLowerCase() : '';
}

function isSupportedExtension(ext: string): ext is SupportedExtension {
  return ALLOWED_EXTENSIONS.has(ext);
}

async function detectFormat(file: File): Promise<DetectedFormat> {
  const header = await readHeader(file, 8);
  if (startsWith(header, MAGIC_XLSX)) return 'xlsx';
  if (startsWith(header, MAGIC_OLE2)) return (await isOle2Xls(file)) ? 'xls' : 'unknown';
  if (extractExtension(file.name) === 'csv') return 'csv';
  if (startsWith(header, MAGIC_UTF8_BOM)) return 'csv';
  return 'unknown';
}

export async function validateFile(
  file: File,
  seenKeys: Set<string>,
): Promise<ValidationResult> {
  // 1. Magic Number
  const detectedFormat = await detectFormat(file);
  if (detectedFormat === 'unknown') {
    return { valid: false, errorCode: 'E003', errorMessage: `지원하지 않는 포맷: ${file.name}`, detectedFormat, isDuplicate: false };
  }

  // 2. 확장자
  const rawExt = extractExtension(file.name);
  if (!isSupportedExtension(rawExt)) {
    return { valid: false, errorCode: 'E003', errorMessage: `허용되지 않는 확장자: .${rawExt}`, detectedFormat, isDuplicate: false };
  }

  // 3. MIME (보조 — 경고만)
  if (file.type !== '' && !ALLOWED_MIMES.has(file.type)) {
    logger.warn(`[Validator] MIME 불일치(${file.type}): ${file.name} — Magic 우선 적용`);
  }

  // 4. 단일 용량
  if (file.size > MAX_SINGLE_BYTES) {
    return {
      valid: false, errorCode: 'E004',
      errorMessage: `파일 크기 초과(최대 20MB): ${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`,
      detectedFormat, extension: rawExt, isDuplicate: false,
    };
  }

  // 5. 중복 (#11: SHA-256 firstKB)
  const fileKey = await generateFileKey(file);
  if (seenKeys.has(fileKey)) {
    return { valid: false, errorCode: 'E002', errorMessage: `중복 파일 스킵: ${file.name}`, detectedFormat, extension: rawExt, isDuplicate: true };
  }
  seenKeys.add(fileKey);

  return { valid: true, detectedFormat, extension: rawExt, isDuplicate: false };
}

export async function validateBatch(
  incoming: File[],
  existing: File[],
): Promise<BatchValidationReport> {
  const allFiles             = [...existing, ...incoming];
  const exceedsCountLimit    = allFiles.length > MAX_FILE_COUNT;
  const totalSizeBytes       = allFiles.reduce((s, f) => s + f.size, 0);
  const exceedsWarnThreshold = totalSizeBytes > WARN_TOTAL_BYTES;
  const exceedsTotalLimit    = totalSizeBytes > MAX_TOTAL_BYTES;
  const estimatedMemoryBytes = estimateMemoryUsageBytes(allFiles);

  const seenKeys = new Set<string>();
  await Promise.all(existing.map(async (f) => seenKeys.add(await generateFileKey(f))));

  const results = new Map<string, ValidationResult>();
  for (const file of incoming) {
    if (exceedsTotalLimit) {
      results.set(file.name, { valid: false, errorCode: 'E004', errorMessage: '총 파일 용량 초과(최대 100MB)', detectedFormat: 'unknown', isDuplicate: false });
      continue;
    }
    results.set(file.name, await validateFile(file, seenKeys));
  }

  return { results, totalSizeBytes, exceedsWarnThreshold, exceedsTotalLimit, exceedsCountLimit, estimatedMemoryBytes };
}
