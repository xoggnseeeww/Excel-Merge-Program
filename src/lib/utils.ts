/**
 * #10: Local Time 기준 파일명 생성
 * 포맷: excel-merged_YYYYMMDD_HHmm.xlsx
 */
export function generateExportFileName(): string {
  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');

  const yyyy = now.getFullYear();
  const mm   = pad(now.getMonth() + 1);
  const dd   = pad(now.getDate());
  const hh   = pad(now.getHours());
  const min  = pad(now.getMinutes());

  return `excel-merged_${yyyy}${mm}${dd}_${hh}${min}.xlsx`;
}

/**
 * #11: 중복 파일 감지 키 생성
 * filename + filesize + firstKB hash 조합
 * (lastModified 제외 — 복사 시 리셋으로 신뢰 불가)
 */
export async function generateFileKey(file: File): Promise<string> {
  const slice = file.slice(0, 1024);
  const buffer = await slice.arrayBuffer();
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${file.name}::${file.size}::${hashHex}`;
}

/**
 * #4: OOM 사전 추정 (파일 크기 × 팽창계수)
 * 런타임 폴링은 Worker 내부에서 performance.memory 사용 (Chrome)
 */
export function estimateMemoryUsageBytes(files: File[]): number {
  const totalBytes = files.reduce((sum, f) => sum + f.size, 0);
  const EXPANSION_FACTOR = 10;
  return totalBytes * EXPANSION_FACTOR;
}

export const OOM_HEAP_LIMIT_BYTES = 1.5 * 1024 * 1024 * 1024; // 1.5 GB
