'use client';

import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import type {
  AppStatus,
  ManagedFile,
  MergeMode,
  MergeWarning,
  PreviewData,
  ReValidatingTrigger,
  Telemetry,
} from '@/types';

// ─────────────────────────────────────────────
// 허용 전이 테이블
// ─────────────────────────────────────────────

const VALID_TRANSITIONS: Record<AppStatus, AppStatus[]> = {
  idle:          ['validating'],
  validating:    ['parsing', 'idle', 'failed'],
  parsing:       ['preview_ready', 'failed', 'idle'],
  preview_ready: ['re_validating', 'merging'],
  re_validating: ['parsing', 'idle'],
  merging:       ['completed', 'failed', 'idle'],  // idle = abort
  completed:     ['idle'],
  failed:        ['idle'],
};

// ─────────────────────────────────────────────
// Store Interface
// ─────────────────────────────────────────────

interface AppStore {
  // ── 상태 머신 ──────────────────────────────
  status: AppStatus;
  reValidatingTrigger: ReValidatingTrigger | null;
  fatalError: string | null;

  // ── 파일 ──────────────────────────────────
  files: ManagedFile[];

  // ── 병합 설정 ─────────────────────────────
  mergeMode: MergeMode;
  includeSourceFile: boolean;  // 기본 ON
  includeHiddenSheets: boolean; // 기본 OFF

  // ── 결과 ──────────────────────────────────
  warnings: MergeWarning[];
  previewData: PreviewData | null;
  outputBlob: Blob | null;

  // ── 텔레메트리 ────────────────────────────
  telemetry: Partial<Telemetry>;

  // ── Worker ────────────────────────────────
  _worker: Worker | null;

  // ── Actions: 상태 전이 ────────────────────
  transitionTo: (next: AppStatus, trigger?: ReValidatingTrigger) => void;
  setFatalError: (message: string) => void;
  clearFatalError: () => void;

  // ── Actions: 파일 관리 ────────────────────
  addFiles: (files: ManagedFile[]) => void;
  removeFile: (id: string) => void;
  /** #8: dnd-kit onDragEnd → re_validating 트리거 */
  reorderFiles: (fromIndex: number, toIndex: number) => void;
  updateFile: (id: string, patch: Partial<ManagedFile>) => void;

  // ── Actions: 병합 설정 ────────────────────
  /** #7: 모드 변경 → preview_ready 상태면 re_validating 전이 */
  setMergeMode: (mode: MergeMode) => void;
  setIncludeSourceFile: (value: boolean) => void;
  setIncludeHiddenSheets: (value: boolean) => void;

  // ── Actions: 결과 ─────────────────────────
  pushWarning: (warning: MergeWarning) => void;
  setPreviewData: (data: PreviewData) => void;
  setOutputBlob: (blob: Blob) => void;
  setTelemetry: (patch: Partial<Telemetry>) => void;

  // ── Actions: Worker ───────────────────────
  setWorker: (worker: Worker | null) => void;
  /** Abort: worker terminate → idle 롤백 */
  abortMerge: () => void;

  // ── Actions: Reset ────────────────────────
  reset: () => void;
}

// ─────────────────────────────────────────────
// Initial State
// ─────────────────────────────────────────────

const initialState = {
  status: 'idle' as AppStatus,
  reValidatingTrigger: null,
  fatalError: null,
  files: [] as ManagedFile[],
  mergeMode: 'A' as MergeMode,
  includeSourceFile: true,
  includeHiddenSheets: false,
  warnings: [] as MergeWarning[],
  previewData: null,
  outputBlob: null,
  telemetry: {} as Partial<Telemetry>,
  _worker: null,
};

// ─────────────────────────────────────────────
// Store
// ─────────────────────────────────────────────

export const useAppStore = create<AppStore>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // ── 상태 전이 ──────────────────────────
      transitionTo: (next, trigger) => {
        const current = get().status;
        const allowed = VALID_TRANSITIONS[current];

        if (!allowed.includes(next)) {
          console.warn(`[Store] 금지된 전이: ${current} → ${next}`);
          return;
        }

        set(
          {
            status: next,
            reValidatingTrigger: next === 're_validating' ? (trigger ?? null) : null,
            // idle 진입 시 에러/경고 초기화
            ...(next === 'idle' && { fatalError: null, warnings: [] }),
            // re_validating 진입 시 이전 preview 초기화
            ...(next === 're_validating' && { previewData: null }),
            // completed/failed 진입 시 worker 정리
            ...((next === 'completed' || next === 'failed') && { _worker: null }),
          },
          false,
          `transitionTo/${current}→${next}`,
        );
      },

      setFatalError: (message) =>
        set({ fatalError: message }, false, 'setFatalError'),

      clearFatalError: () =>
        set({ fatalError: null }, false, 'clearFatalError'),

      // ── 파일 관리 ──────────────────────────
      addFiles: (incoming) => {
        const { status } = get();
        set(
          (s) => ({ files: [...s.files, ...incoming] }),
          false,
          'addFiles',
        );
        // preview_ready 중 파일 추가 → re_validating [#7]
        if (status === 'preview_ready') {
          get().transitionTo('re_validating', 'file_added');
        }
      },

      removeFile: (id) => {
        const { status } = get();
        set(
          (s) => ({ files: s.files.filter((f) => f.id !== id) }),
          false,
          'removeFile',
        );
        if (status === 'preview_ready') {
          get().transitionTo('re_validating', 'file_removed');
        }
      },

      /** #8: dnd-kit onDragEnd 핸들러에서 호출 */
      reorderFiles: (fromIndex, toIndex) => {
        set(
          (s) => {
            const next = [...s.files];
            const [moved] = next.splice(fromIndex, 1);
            if (moved === undefined) return {};
            next.splice(toIndex, 0, moved);
            return { files: next };
          },
          false,
          'reorderFiles',
        );
        // 재정렬 → 기준 헤더(index 0) 변경 가능 → re_validating [#8]
        if (get().status === 'preview_ready') {
          get().transitionTo('re_validating', 'file_reordered');
        }
      },

      updateFile: (id, patch) =>
        set(
          (s) => ({
            files: s.files.map((f) => (f.id === id ? { ...f, ...patch } : f)),
          }),
          false,
          'updateFile',
        ),

      // ── 병합 설정 ──────────────────────────
      /** #7: 모드 변경 → preview_ready면 re_validating */
      setMergeMode: (mode) => {
        set({ mergeMode: mode }, false, 'setMergeMode');
        if (get().status === 'preview_ready') {
          get().transitionTo('re_validating', 'mode_changed');
        }
      },

      setIncludeSourceFile: (value) =>
        set({ includeSourceFile: value }, false, 'setIncludeSourceFile'),

      setIncludeHiddenSheets: (value) =>
        set({ includeHiddenSheets: value }, false, 'setIncludeHiddenSheets'),

      // ── 결과 ───────────────────────────────
      pushWarning: (warning) =>
        set(
          (s) => ({ warnings: [...s.warnings, warning] }),
          false,
          'pushWarning',
        ),

      setPreviewData: (data) =>
        set({ previewData: data }, false, 'setPreviewData'),

      setOutputBlob: (blob) =>
        set({ outputBlob: blob }, false, 'setOutputBlob'),

      setTelemetry: (patch) =>
        set(
          (s) => ({ telemetry: { ...s.telemetry, ...patch } }),
          false,
          'setTelemetry',
        ),

      // ── Worker ─────────────────────────────
      setWorker: (worker) =>
        set({ _worker: worker }, false, 'setWorker'),

      abortMerge: () => {
        const { _worker, status } = get();
        if (_worker) {
          _worker.terminate();
        }
        set({ _worker: null }, false, 'abortMerge');
        // merging 또는 다른 중단 가능 상태에서만 idle 전이
        const abortable: AppStatus[] = ['merging', 'validating', 'parsing', 're_validating'];
        if (abortable.includes(status)) {
          get().transitionTo('idle');
        }
      },

      // ── Reset ──────────────────────────────
      reset: () => {
        const { _worker } = get();
        if (_worker) _worker.terminate();
        set(initialState, false, 'reset');
      },
    }),
    { name: 'ExcelMerger' },
  ),
);

// ─────────────────────────────────────────────
// Selectors (re-render 최소화)
// ─────────────────────────────────────────────

export const selectStatus = (s: AppStore) => s.status;
export const selectFiles = (s: AppStore) => s.files;
export const selectMergeMode = (s: AppStore) => s.mergeMode;
export const selectWarnings = (s: AppStore) => s.warnings;
export const selectPreviewData = (s: AppStore) => s.previewData;
export const selectTelemetry = (s: AppStore) => s.telemetry;
export const selectIsProcessing = (s: AppStore) =>
  s.status === 'validating' ||
  s.status === 'parsing' ||
  s.status === 're_validating' ||
  s.status === 'merging';
