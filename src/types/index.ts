// ─────────────────────────────────────────────
// State Machine
// ─────────────────────────────────────────────

/** 허용된 전이:
 * idle → validating
 * validating → parsing | idle (validation fatal)
 * parsing → preview_ready | failed (OOM/crash)
 * preview_ready → re_validating (파일추가/재정렬/모드변경) [#7,#8]
 * preview_ready → merging
 * re_validating → parsing | idle
 * merging → completed | failed | idle (abort)
 */
export type AppStatus =
  | 'idle'
  | 'validating'
  | 'parsing'
  | 'preview_ready'
  | 're_validating'
  | 'merging'
  | 'completed'
  | 'failed';

export type ReValidatingTrigger =
  | 'file_added'
  | 'file_removed'
  | 'file_reordered'  // #8: dnd-kit reorder
  | 'mode_changed';   // #7: 모드 변경

// ─────────────────────────────────────────────
// Error & Warning
// ─────────────────────────────────────────────

/** E001: 암호화, E002: 손상, E003: 미지원 포맷
 *  E004: 메모리 초과, E005: 빈 시트 */
export type ErrorCode = 'E001' | 'E002' | 'E003' | 'E004' | 'E005';

export interface AppError {
  code: ErrorCode;
  message: string;
  fileId?: string;
}

/** Partial Failure → warnings[] 누적, completed 전이 유지 */
export interface MergeWarning {
  fileId: string;
  fileName: string;
  errorCode: ErrorCode;
  message: string;
}

// ─────────────────────────────────────────────
// File
// ─────────────────────────────────────────────

export type FileStatus = 'pending' | 'valid' | 'invalid' | 'skipped';

export type SupportedExtension = 'xlsx' | 'xls' | 'csv';

export interface ManagedFile {
  id: string;
  file: File;
  status: FileStatus;
  extension: SupportedExtension;
  errorCode?: ErrorCode;
  errorMessage?: string;
  /** Mode C: 선택된 시트 인덱스 목록 */
  selectedSheetIndices?: number[];
  /** Mode C 메타데이터 선파싱 결과 [#2] */
  sheetNames?: string[];
}

// ─────────────────────────────────────────────
// Merge
// ─────────────────────────────────────────────

/** A: 같은 양식 수직 병합
 *  B: 헤더 자동 매칭 병합
 *  C: 파일별 시트 유지 */
export type MergeMode = 'A' | 'B' | 'C';

/** Mode B 헤더 매칭 단계 (#3: 사전 매칭 제거 → 3단계) */
export type HeaderMatchStep =
  | 'exact'        // 완전 일치
  | 'normalized'   // 정규화 일치 (trim, lowercase)
  | 'similarity'   // 유사도 매칭 (Levenshtein)
  | 'new_column';  // 신규 열

export interface HeaderMatch {
  sourceHeader: string;
  targetHeader: string | null;  // null → new_column
  step: HeaderMatchStep;
  score: number;  // 0~1
}

// ─────────────────────────────────────────────
// Preview
// ─────────────────────────────────────────────

export type CellValue = string | number | boolean | null;

export interface PreviewData {
  headers: string[];
  rows: CellValue[][];
  /** 실제 전체 행수 (preview는 최대 10행/20열) */
  totalRows: number;
  totalCols: number;
}

// ─────────────────────────────────────────────
// OOM Guard [#4: 옵션 C — 추정 + 런타임 폴링]
// ─────────────────────────────────────────────

/** 파일 크기 합산 × 팽창계수(10x) 사전 추정 */
export const OOM_FILE_SIZE_LIMIT_BYTES = 100 * 1024 * 1024; // 100MB
export const OOM_EXPANSION_FACTOR = 10;
export const OOM_HEAP_LIMIT_BYTES = 1.5 * 1024 * 1024 * 1024; // 1.5GB (Chrome)

// ─────────────────────────────────────────────
// Telemetry
// ─────────────────────────────────────────────

export interface Telemetry {
  merge_duration_ms: number;
  parse_duration_ms: number;
  worker_used: boolean;
  total_rows: number;
  memory_warning_triggered: boolean;
}

// ─────────────────────────────────────────────
// Export [#10: Local Time 확정]
// ─────────────────────────────────────────────

export interface ExportPolicy {
  /** excel-merged_YYYYMMDD_HHmm.xlsx (Local Time) */
  generateFileName: () => string;
}

// ─────────────────────────────────────────────
// Release Gate [#12: 3분류 재정의]
// ─────────────────────────────────────────────

/** 성공: completed (warnings 유무 무관)
 *  경고: completed + warnings[] ≥ 1 (참고 지표)
 *  오류: failed 전이 */
export type GateResult = 'success' | 'warning' | 'error';
