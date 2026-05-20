'use client';

import { useCallback, useState } from 'react';

interface FileDropZoneProps {
  onFiles: (files: File[]) => void;
  disabled?: boolean;
}

export function FileDropZone({ onFiles, disabled }: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false);

  const extract = (items: DataTransferItemList | FileList): File[] => {
    const src = 'length' in items
      ? Array.from(items as FileList)
      : Array.from(items as DataTransferItemList).map((i) => i.getAsFile()).filter(Boolean) as File[];
    return src;
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (disabled) return;
    onFiles(extract(e.dataTransfer.items));
  }, [disabled, onFiles]);

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) onFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={onDrop}
      className={[
        'relative flex flex-col items-center justify-center gap-3',
        'rounded-xl border-2 border-dashed px-4 sm:px-8 py-8 sm:py-12 text-center',
        'transition-all duration-200',
        dragging
          ? 'border-emerald-400 bg-emerald-50 scale-[1.01]'
          : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-white',
        disabled ? 'pointer-events-none opacity-40' : 'cursor-pointer',
      ].join(' ')}
    >
      <div className={`rounded-full p-3 sm:p-4 ${dragging ? 'bg-emerald-100' : 'bg-white shadow-sm border border-slate-100'}`}>
        <svg className={`w-6 h-6 sm:w-7 sm:h-7 ${dragging ? 'text-emerald-500' : 'text-slate-400'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>

      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-700">
          {/* 모바일에서는 드래그 문구 숨김 */}
          <span className="hidden sm:inline">파일을 여기에 끌어다 놓거나 </span>
          <label className="cursor-pointer text-emerald-600 underline underline-offset-2 hover:text-emerald-700">
            파일 선택
            <input
              type="file"
              multiple
              accept=".xlsx,.xls,.csv"
              className="sr-only"
              onChange={onInputChange}
              disabled={disabled}
            />
          </label>
        </p>
        <p className="text-xs text-slate-400">xlsx · xls · csv — 최대 20MB/개, 총 100MB, 50개</p>
      </div>
    </div>
  );
}
