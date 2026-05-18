import { logger } from '@/lib/logger';
/**
 * features/excel/parser/encoding.ts
 * CSV 인코딩 감지 (#1: BOM → UTF-8 → jschardet → EUC-KR)
 */

const UTF8_BOM = new Uint8Array([0xef, 0xbb, 0xbf]);

function hasBom(buf: Uint8Array): boolean {
  return buf.length >= 3 &&
    buf[0] === UTF8_BOM[0] &&
    buf[1] === UTF8_BOM[1] &&
    buf[2] === UTF8_BOM[2];
}

function isValidUtf8(buf: Uint8Array): boolean {
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return true;
  } catch {
    return false;
  }
}

export async function decodeCsv(buf: ArrayBuffer): Promise<string> {
  const bytes = new Uint8Array(buf);

  // 1. UTF-8 BOM
  if (hasBom(bytes)) {
    return new TextDecoder('utf-8').decode(bytes.slice(3));
  }

  // 2. UTF-8 유효성
  if (isValidUtf8(bytes)) {
    return new TextDecoder('utf-8').decode(bytes);
  }

  // 3. jschardet (동적 import — 미설치 시 graceful fallback)
  try {
    const chardet = await import('jschardet');
    const sample = new TextDecoder('latin1').decode(bytes.slice(0, 4096));
    const detected = chardet.detect(sample);
    if (detected?.encoding) {
      const enc = detected.encoding.toLowerCase();
      const normalized = enc.includes('euc-kr') || enc.includes('cp949') ? 'euc-kr' : enc;
      try {
        return new TextDecoder(normalized, { fatal: true }).decode(bytes);
      } catch { /* 폴백으로 */ }
    }
  } catch {
    logger.warn('[Parser/Encoding] jschardet 미설치 — EUC-KR 폴백');
  }

  // 4. EUC-KR 폴백
  return new TextDecoder('euc-kr', { fatal: false }).decode(bytes);
}
