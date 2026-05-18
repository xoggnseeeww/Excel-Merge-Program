'use client';

import { useAppStore } from '@/store/useAppStore';

const ERROR_LABELS: Record<string, string> = {
  E001: '암호화', E002: '손상', E003: '미지원', E004: '메모리', E005: '빈 시트',
};

export function WarningLog() {
  const warnings    = useAppStore((s) => s.warnings);
  const fatalError  = useAppStore((s) => s.fatalError);
  const status      = useAppStore((s) => s.status);

  const hasFatal = status === 'failed' && fatalError;
  if (!hasFatal && warnings.length === 0) return null;

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">오류 로그</p>

      {hasFatal && (
        <div className="flex gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
          <svg className="w-4 h-4 flex-none mt-0.5 text-red-500" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" />
          </svg>
          <p className="text-sm text-red-700 whitespace-pre-wrap">{fatalError}</p>
        </div>
      )}

      {warnings.length > 0 && (
        <ul className="space-y-1.5">
          {warnings.map((w, i) => (
            <li key={i} className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2">
              <span className="flex-none rounded bg-amber-200 px-1.5 py-0.5 text-xs font-mono font-bold text-amber-700">
                {w.errorCode}
              </span>
              <span className="flex-none text-xs font-medium text-amber-600">
                {ERROR_LABELS[w.errorCode] ?? w.errorCode}
              </span>
              <span className="text-xs text-amber-700 truncate">{w.message}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
