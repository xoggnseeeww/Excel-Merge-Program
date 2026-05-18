'use client';

import { useState } from 'react';

const LICENSES = [
  {
    name: 'SheetJS Community Edition',
    url: 'https://sheetjs.com/',
    copyright: 'Copyright (C) 2012-present SheetJS LLC',
    license: 'Apache License 2.0',
    licenseUrl: 'https://www.apache.org/licenses/LICENSE-2.0',
  },
  {
    name: 'jschardet',
    url: 'https://github.com/aadsm/jschardet',
    copyright: 'Copyright (C) 2013 António Afonso',
    license: 'GNU LGPL 2.1',
    licenseUrl: 'https://www.gnu.org/licenses/lgpl-2.1.html',
  },
  {
    name: 'Zustand',
    url: 'https://github.com/pmndrs/zustand',
    copyright: 'Copyright (c) 2019 Paul Henschel',
    license: 'MIT',
    licenseUrl: 'https://opensource.org/licenses/MIT',
  },
  {
    name: '@dnd-kit',
    url: 'https://github.com/clauderic/dnd-kit',
    copyright: 'Copyright (c) 2021 Claudéric Demers',
    license: 'MIT',
    licenseUrl: 'https://opensource.org/licenses/MIT',
  },
  {
    name: 'Next.js',
    url: 'https://nextjs.org/',
    copyright: 'Copyright (c) 2024 Vercel, Inc.',
    license: 'MIT',
    licenseUrl: 'https://opensource.org/licenses/MIT',
  },
  {
    name: 'React',
    url: 'https://react.dev/',
    copyright: 'Copyright (c) Meta Platforms, Inc.',
    license: 'MIT',
    licenseUrl: 'https://opensource.org/licenses/MIT',
  },
] as const;

export function LicenseModal() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="text-slate-300 hover:text-slate-400 underline underline-offset-2 transition-colors"
      >
        오픈소스 라이선스
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl flex flex-col max-h-[80vh]">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">오픈소스 라이선스 고지</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                aria-label="닫기"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 본문 */}
            <div className="overflow-y-auto px-5 py-4 space-y-4">
              <p className="text-xs text-slate-500 leading-relaxed">
                이 소프트웨어는 아래 오픈소스 라이브러리를 사용합니다.
                각 라이브러리의 저작권 및 라이선스 조건은 아래와 같습니다.
              </p>

              {LICENSES.map((lib) => (
                <div key={lib.name} className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={lib.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-semibold text-emerald-600 hover:text-emerald-700"
                    >
                      {lib.name}
                    </a>
                    <a
                      href={lib.licenseUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-none rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600 hover:bg-slate-300 transition-colors"
                    >
                      {lib.license}
                    </a>
                  </div>
                  <p className="text-xs text-slate-400">{lib.copyright}</p>
                </div>
              ))}
            </div>

            {/* 푸터 */}
            <div className="px-5 py-3 border-t border-slate-100">
              <button
                onClick={() => setOpen(false)}
                className="w-full rounded-lg bg-slate-100 py-2 text-sm text-slate-600 hover:bg-slate-200 transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
