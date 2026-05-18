import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '개인정보처리방침 — Excel Merger',
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-8 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        돌아가기
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 mb-2">개인정보처리방침</h1>
      <p className="text-sm text-slate-400 mb-10">시행일: 2026년 1월 1일</p>

      <div className="space-y-8 text-sm text-slate-600 leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-800">1. 수집하는 개인정보</h2>
          <p>Excel Merger는 <strong>어떠한 개인정보도 수집하지 않습니다.</strong> 사용자가 업로드하는 파일은 브라우저 메모리 내에서만 처리되며, 외부 서버로 전송되지 않습니다. 파일 내용은 사용자의 기기를 벗어나지 않습니다.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-800">2. 쿠키 및 추적 기술</h2>
          <p>본 서비스는 쿠키, 웹 비콘, 로컬스토리지 등 사용자를 추적하는 기술을 사용하지 않습니다.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-800">3. 제3자 제공</h2>
          <p>수집하는 개인정보가 없으므로 제3자에게 제공되는 정보가 없습니다.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-800">4. 브라우저 내 데이터 처리</h2>
          <p>파일 처리는 전적으로 사용자의 브라우저에서 이루어집니다. 처리가 완료되거나 페이지를 닫으면 모든 데이터는 메모리에서 자동 삭제됩니다. 서버에는 어떠한 데이터도 저장되지 않습니다.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-800">5. 방침 변경</h2>
          <p>방침이 변경될 경우 본 페이지를 통해 공지합니다. 중요한 변경이 있을 경우 서비스 초기 화면을 통해 별도로 안내합니다.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-800">6. 문의</h2>
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
            이메일: <span className="text-slate-400">[운영자 이메일 입력]</span>
          </div>
        </section>
      </div>
    </main>
  );
}
