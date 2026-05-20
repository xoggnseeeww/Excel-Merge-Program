'use client';

import { useAppStore, selectMergeMode } from '@/store/useAppStore';
import type { MergeMode } from '@/types';

const MODES: { id: MergeMode; label: string; desc: string }[] = [
  { id: 'A', label: '같은 양식 합치기',  desc: '열 구조가 동일한 파일 수직 병합' },
  { id: 'B', label: '열이 달라도 합치기', desc: '헤더 자동 매칭 후 병합' },
  { id: 'C', label: '파일별 시트 유지',   desc: '각 파일을 별도 시트로 보존' },
];

export function ModeSelector({ disabled }: { disabled?: boolean }) {
  const mode        = useAppStore(selectMergeMode);
  const setMergeMode = useAppStore((s) => s.setMergeMode);

  return (
    /* 모바일: 1열 세로 / sm 이상: 3열 가로 */
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
      {MODES.map((m) => {
        const active = mode === m.id;
        return (
          <button
            key={m.id}
            onClick={() => setMergeMode(m.id)}
            disabled={disabled}
            className={[
              'flex flex-row sm:flex-col items-center sm:items-start gap-3 sm:gap-1',
              'rounded-lg border px-3 py-3 text-left transition-all',
              'disabled:pointer-events-none disabled:opacity-40',
              active
                ? 'border-emerald-400 bg-emerald-50 ring-1 ring-emerald-400'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
            ].join(' ')}
          >
            {/* 배지 + 제목 */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={`rounded text-xs font-mono font-bold px-1.5 py-0.5 ${active ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-500'}`}>
                {m.id}
              </span>
              <span className={`text-xs font-semibold ${active ? 'text-emerald-700' : 'text-slate-700'}`}>
                {m.label}
              </span>
            </div>
            {/* 설명 — 모바일에서도 표시 */}
            <p className="text-xs text-slate-400 leading-snug">{m.desc}</p>
          </button>
        );
      })}
    </div>
  );
}
