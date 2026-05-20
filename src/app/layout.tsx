import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Excel Merger — 브라우저 엑셀 파일 병합기',
  description: '서버 업로드 없이 브라우저에서 여러 엑셀 파일을 안전하게 합칩니다.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 antialiased">
        {children}
      </body>
    </html>
  );
}
