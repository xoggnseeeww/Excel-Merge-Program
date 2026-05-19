'use client';

/**
 * app/page.tsx — 메인 페이지
 *
 * 규칙:
 *  - 비즈니스 로직 0 (파싱/병합 코드 없음)
 *  - Store 구독 + useMergeAction() 호출만
 *  - re_validating 상태 감지 → handleReValidate() 자동 호출 (#7,#8)
 */


import { useEffect } from 'react';
import { useAppStore } from '@/store/useAppStore';
import { useMergeAction } from '@/store/useMergeAction';
import { FileDropZone } from '@/components/FileDropZone';
import { FileList } from '@/components/FileList';
import { ModeSelector } from '@/components/ModeSelector';
import { PreviewTable } from '@/components/PreviewTable';
import { MergeControls } from '@/components/MergeControls';
import { WarningLog } from '@/components/WarningLog';
import { LicenseModal } from '@/components/LicenseModal';

export default function HomePage() {
  const status      = useAppStore((s) => s.status);
  const files       = useAppStore((s) => s.files);
  const memWarn     = useAppStore((s) => s.telemetry.memory_warning_triggered);
  const reset       = useAppStore((s) => s.reset);

  const { handleFilesAdded, handleReValidate, handleMerge, abortMerge } = useMergeAction();

  // #7,#8: re_validating → preview 재생성 자동 트리거
  useEffect(() => {
    if (status === 're_validating') {
      handleReValidate();
    }
  }, [status, handleReValidate]);

  const isProcessing = ['validating', 'parsing', 're_validating', 'merging'].includes(status);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      {/* 헤더 */}
      <div className="mb-10 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 mb-4">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          서버 업로드 없음 · 브라우저 내 처리
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">Excel Merger</h1>
        <p className="mt-2 text-sm text-slate-500">여러 엑셀 파일을 빠르고 안전하게 합칩니다</p>
      </div>

      {/* 50MB 경고 */}
      {memWarn && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <svg className="w-4 h-4 flex-none" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" />
          </svg>
          총 파일 크기가 50MB를 초과합니다. 처리 시간이 길어질 수 있습니다.
        </div>
      )}

      <div className="space-y-6">
        {/* 파일 업로드 */}
        <FileDropZone onFiles={handleFilesAdded} disabled={isProcessing} />

        {/* 파일 목록 */}
        {files.length > 0 && <FileList />}

        {/* 병합 모드 선택 */}
        {files.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">병합 모드</p>
            <ModeSelector disabled={isProcessing} />
          </div>
        )}

        {/* 미리보기 */}
        <PreviewTable />

        {/* 병합 컨트롤 */}
        {files.length > 0 && (
          <MergeControls onMerge={handleMerge} onAbort={abortMerge} />
        )}

        {/* 경고/오류 로그 */}
        <WarningLog />

        {/* 완료 후 초기화 */}
        {status === 'completed' && (
          <button
            onClick={reset}
            className="w-full rounded-lg border border-slate-200 py-2.5 text-sm text-slate-500 hover:bg-slate-50 transition-colors"
          >
            새로 시작하기
          </button>
        )}
      </div>

      {/* 푸터 */}
      <footer className="mt-16 text-center text-xs text-slate-300 space-y-2">
        <p>파일은 브라우저 메모리에서만 처리됩니다 · 서버로 전송되지 않습니다</p>
        <p>Chrome · Firefox · Safari · Edge 최신 버전 지원 · IE 미지원</p>
        <div className="flex items-center justify-center gap-3">
          <a href="/privacy" className="hover:text-slate-400 underline underline-offset-2 transition-colors">개인정보처리방침</a>
          <span>·</span>
          <a href="/terms" className="hover:text-slate-400 underline underline-offset-2 transition-colors">이용약관</a>
          <span>·</span>
          <LicenseModal />
        </div>
      </footer>
    </main>
  );
}
