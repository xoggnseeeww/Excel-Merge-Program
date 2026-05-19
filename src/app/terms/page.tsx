import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: '서비스 이용약관 — Excel Merger',
};

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <Link href="/" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-600 mb-8 transition-colors">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        돌아가기
      </Link>

      <h1 className="text-2xl font-bold text-slate-900 mb-2">서비스 이용약관</h1>
      <p className="text-sm text-slate-400 mb-10">시행일: 2026년 1월 1일</p>

      <div className="space-y-8 text-sm text-slate-600 leading-relaxed">
        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-800">제1조 (목적)</h2>
          <p>본 약관은 Excel Merger(이하 "서비스")의 이용 조건 및 절차, 이용자와 운영자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-800">제2조 (서비스 내용)</h2>
          <p>서비스는 사용자의 브라우저에서 엑셀 파일을 병합하는 기능을 제공합니다. 모든 파일 처리는 사용자의 기기에서 이루어지며 서버로 전송되지 않습니다.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-800">제3조 (이용자의 의무)</h2>
          <ul className="list-disc list-inside space-y-1 text-slate-600">
            <li>타인의 개인정보가 포함된 파일을 처리할 경우 관련 법령을 준수할 책임은 이용자에게 있습니다.</li>
            <li>서비스를 불법적인 목적으로 이용하거나 서비스 운영을 방해하는 행위를 해서는 안 됩니다.</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-800">제4조 (책임의 한계)</h2>
          <p>운영자는 다음 각 호의 경우에 대하여 책임을 지지 않습니다.</p>
          <ul className="list-disc list-inside space-y-1 text-slate-600">
            <li>브라우저 환경 또는 사용자 기기의 문제로 인한 파일 처리 오류</li>
            <li>손상되거나 암호화된 파일로 인한 병합 실패</li>
            <li>서비스 이용으로 발생한 간접적·결과적 손해</li>
            <li>천재지변, 통신 장애 등 불가항력으로 인한 서비스 중단</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-800">제5조 (지원 브라우저)</h2>
          <p>본 서비스는 최신 버전의 Chrome, Firefox, Safari, Edge를 지원합니다. Internet Explorer는 지원하지 않습니다. 일부 기능(메모리 모니터링)은 Chrome에서만 동작합니다.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-800">제6조 (서비스 변경 및 중단)</h2>
          <p>운영자는 서비스의 내용을 변경하거나 중단할 수 있으며, 이로 인한 손해에 대해 별도의 보상을 하지 않습니다.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-800">제7조 (준거법 및 관할)</h2>
          <p>본 약관은 대한민국 법률에 따라 해석되며, 서비스와 관련된 분쟁은 대한민국 법원을 관할 법원으로 합니다.</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-base font-semibold text-slate-800">제8조 (문의)</h2>
          <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
            이메일: <span className="text-slate-400">xogns022@gmail.com</span>
          </div>
        </section>
      </div>
    </main>
  );
}
