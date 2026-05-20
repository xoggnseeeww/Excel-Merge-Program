'use client';

import { useAppStore } from '@/store/useAppStore';

export function PreviewTable() {
  const preview = useAppStore((s) => s.previewData);
  const status  = useAppStore((s) => s.status);

  if (status === 'parsing' || status === 're_validating') {
    return (
      <div className="flex items-center justify-center gap-2 rounded-lg border border-slate-100 bg-slate-50 py-8 text-sm text-slate-400">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        미리보기 생성 중…
      </div>
    );
  }

  if (!preview || preview.headers.length === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">미리보기</p>
        <p className="text-xs text-slate-400 text-right">
          {preview.rows.length}행 / {preview.headers.length}열
          {preview.totalRows > preview.rows.length && (
            <span className="hidden sm:inline"> (전체 {preview.totalRows.toLocaleString()}행)</span>
          )}
        </p>
      </div>

      {/* 가로·세로 스크롤 + 스크롤바 항상 표시 */}
      <div className="overflow-auto scrollbar-thin rounded-lg border border-slate-100 max-h-56 sm:max-h-64">
        <table className="min-w-full text-xs">
          <thead className="sticky top-0 bg-slate-50 border-b border-slate-100 z-10">
            <tr>
              {preview.headers.map((h, i) => (
                <th key={i} className="px-3 py-2 text-left font-medium text-slate-500 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {preview.rows.map((row, ri) => (
              <tr key={ri} className="hover:bg-slate-50 transition-colors">
                {row.map((cell, ci) => (
                  <td key={ci} className="px-3 py-1.5 text-slate-600 whitespace-nowrap max-w-[140px] sm:max-w-[160px] truncate">
                    {cell == null ? <span className="text-slate-300">—</span> : String(cell)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-300 text-right">← 가로 스크롤 가능</p>
    </div>
  );
}
