'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import './globals.css';
import { ibmPlexSansThai, inter } from './fonts';

export default function GlobalError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="th" className={`${ibmPlexSansThai.variable} ${inter.variable}`}>
      <body className="min-h-dvh bg-slate-50 text-slate-900 antialiased">
        <title>Application Error</title>
        <div className="flex min-h-dvh items-center justify-center px-6 py-12">
          <div className="w-full max-w-xl rounded-3xl border border-red-100 bg-white p-8 shadow-sm">
            <div className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-red-700">
              App Error
            </div>
            <h1 className="mt-4 text-2xl font-bold text-slate-900">The application hit an unexpected error.</h1>
            <p className="mt-2 text-sm text-slate-600">
              The app shell could not recover normally. Retry once, or return to the home screen.
            </p>
            {error.digest && (
              <p className="mt-3 text-xs text-slate-400">Error ID: {error.digest}</p>
            )}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => unstable_retry()}
                className="inline-flex items-center justify-center rounded-xl bg-primary-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
              >
                Retry
              </button>
              <Link
                href="/"
                className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Go Home
              </Link>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
