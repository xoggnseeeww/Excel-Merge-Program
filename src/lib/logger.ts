/**
 * lib/logger.ts
 * 운영 빌드에서 console.warn/debug 자동 제거
 * process.env.NODE_ENV === 'production' 시 no-op
 */

const isDev = process.env.NODE_ENV !== 'production';

export const logger = {
  warn: (...args: unknown[]) => { if (isDev) console.warn('[ExcelMerger]', ...args); },
  debug: (...args: unknown[]) => { if (isDev) console.debug('[ExcelMerger]', ...args); },
  error: (...args: unknown[]) => console.error('[ExcelMerger]', ...args), // 운영에서도 유지
};
