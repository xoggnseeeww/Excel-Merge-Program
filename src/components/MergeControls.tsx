'use client';

import { useAppStore, selectIsProcessing } from '@/store/useAppStore';

interface MergeControlsProps {
  onMerge: () => void;
  onAbort: () => void;
}

export function MergeControls({ onMerge, onAbort }: MergeControlsProps) {
  const status         = useAppStore((s) => s.status);
  const files          = useAppStore((s) => s.files);
  const isProcessing   = useAppStore(selectIsProcessing);
  const includeSource  = useAppStore((s) => s.includeSourceFile);
  const includeHidden  = useAppStore((s) => s.includeHiddenSheets);
  const setSource      = useAppStore((s) => s.setIncludeSourceFile);
  const setHidden      = useAppStore((s) => s.setIncludeHiddenSheets);
  const telemetry      = useAppStore((s) => s.telemetry);

  const validCount = files.filter((f) => f.status === 'valid').length;
  const canMerge   = status === 'preview_ready' && validCount >= 1;
  const isMerging  = status === 'merging';

  return (
    <div className="space-y-4">
      {/* 옵션 */}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeSource}
            onChange={(e) => setSource(e.target.checked)}
            disabled={isProcessing}
            className="rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
          />
          <span className="text-sm text-slate-600">source_file 열 추가</span>
        </label>

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={includeHidden}
            onChange={(e) => setHidden(e.target.checked)}
            disabled={isProcessing}
            className="rounded border-slate-300 text-emerald-500 focus:ring-emerald-400"
          />
          <span className="text-sm text-slate-600">숨김 시트 포함</span>
        </label>
      </div>

      {/* 버튼 영역 */}
      <div className="flex items-center gap-3">
        {isMerging ? (
          <button
            onClick={onAbort}
            className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-5 py-2.5 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            병합 취소
          </button>
        ) : (
          <button
            onClick={onMerge}
            disabled={!canMerge}
            className={[
              'flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-semibold transition-all',
              canMerge
                ? 'bg-emerald-500 text-white hover:bg-emerald-600 active:scale-[0.98] shadow-sm shadow-emerald-200'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed',
            ].join(' ')}
          >
            {isProcessing ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                처리 중…
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                병합 후 다운로드
              </>
            )}
          </button>
        )}

        {/* 텔레메트리 — completed 상태에서 표시 */}
        {status === 'completed' && telemetry.merge_duration_ms != null && (
          <p className="text-xs text-slate-400 tabular-nums">
            병합 완료 · {telemetry.merge_duration_ms}ms · {(telemetry.total_rows ?? 0).toLocaleString()}행
            {telemetry.worker_used && ' · Worker'}
          </p>
        )}
      </div>
    </div>
  );
}
