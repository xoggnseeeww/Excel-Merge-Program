'use client';

import { useState } from 'react';
import {
  DndContext, closestCenter, PointerSensor,
  useSensor, useSensors, DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, useSortable,
  verticalListSortingStrategy, arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { ManagedFile } from '@/types';
import { useAppStore } from '@/store/useAppStore';

// ─── 상태 배지 ────────────────────────────────

const STATUS_CONFIG = {
  valid:   { label: '정상', cls: 'bg-emerald-100 text-emerald-700' },
  invalid: { label: '오류', cls: 'bg-red-100 text-red-600' },
  pending: { label: '대기', cls: 'bg-slate-100 text-slate-500' },
  skipped: { label: '스킵', cls: 'bg-amber-100 text-amber-600' },
} as const;

// ─── 단일 파일 행 (Sortable) ──────────────────

function SortableFileRow({ file, index, onRemove }: {
  file: ManagedFile;
  index: number;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: file.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const cfg = STATUS_CONFIG[file.status];
  const sizeKb = (file.file.size / 1024).toFixed(0);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[
        'flex items-center gap-3 rounded-lg border px-3 py-2.5',
        'bg-white transition-shadow',
        isDragging ? 'shadow-lg border-emerald-200' : 'border-slate-100 hover:border-slate-200',
      ].join(' ')}
    >
      {/* 드래그 핸들 */}
      <button
        {...attributes}
        {...listeners}
        className="flex-none cursor-grab active:cursor-grabbing text-slate-300 hover:text-slate-400 touch-none"
        aria-label="드래그하여 순서 변경"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M7 2a1 1 0 00-1 1v1a1 1 0 002 0V3a1 1 0 00-1-1zm0 5a1 1 0 00-1 1v1a1 1 0 002 0V8a1 1 0 00-1-1zm0 5a1 1 0 00-1 1v1a1 1 0 002 0v-1a1 1 0 00-1-1zm6-10a1 1 0 00-1 1v1a1 1 0 002 0V3a1 1 0 00-1-1zm0 5a1 1 0 00-1 1v1a1 1 0 002 0V8a1 1 0 00-1-1zm0 5a1 1 0 00-1 1v1a1 1 0 002 0v-1a1 1 0 00-1-1z" />
        </svg>
      </button>

      {/* 순번 */}
      <span className="flex-none w-5 text-xs font-mono text-slate-300">{index + 1}</span>

      {/* 파일명 */}
      <span className="flex-1 min-w-0 text-sm text-slate-700 truncate" title={file.file.name}>
        {file.file.name}
      </span>

      {/* 크기 */}
      <span className="flex-none text-xs text-slate-400 tabular-nums">{sizeKb}KB</span>

      {/* 상태 배지 */}
      <span className={`flex-none rounded-full px-2 py-0.5 text-xs font-medium ${cfg.cls}`}>
        {cfg.label}
      </span>

      {/* 오류 메시지 */}
      {file.errorMessage && (
        <span className="flex-none text-xs text-red-500 max-w-[120px] truncate" title={file.errorMessage}>
          {file.errorMessage}
        </span>
      )}

      {/* 삭제 버튼 */}
      <button
        onClick={() => onRemove(file.id)}
        className="flex-none rounded p-1 text-slate-300 hover:text-red-400 hover:bg-red-50 transition-colors"
        aria-label={`${file.file.name} 제거`}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ─── 파일 목록 (DnD 컨테이너) ─────────────────

export function FileList() {
  const files = useAppStore((s) => s.files);
  const removeFile = useAppStore((s) => s.removeFile);
  const reorderFiles = useAppStore((s) => s.reorderFiles); // #8

  const sensors = useSensors(useSensor(PointerSensor, {
    activationConstraint: { distance: 5 },
  }));

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = files.findIndex((f) => f.id === active.id);
    const newIdx = files.findIndex((f) => f.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    reorderFiles(oldIdx, newIdx); // → Store → re_validating 트리거 (#8)
  };

  if (files.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">
          파일 목록 ({files.length}개)
        </p>
        <p className="text-xs text-slate-400">드래그로 순서 변경 · Mode A 기준 헤더 = 1번 파일</p>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={files.map((f) => f.id)} strategy={verticalListSortingStrategy}>
          {files.map((file, idx) => (
            <SortableFileRow key={file.id} file={file} index={idx} onRemove={removeFile} />
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
