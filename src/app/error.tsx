'use client';

import Link from 'next/link';
import { useEffect } from 'react';

export default function Error({
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
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl rounded-3xl border border-red-100 bg-white p-8 shadow-sm">
        <div className="inline-flex rounded-full bg-red-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-red-700">
          Runtime Error
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Something went wrong.</h1>
        <p className="mt-2 text-sm text-slate-600">
          The page could not finish rendering. You can retry this route or return to the dashboard.
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
  );
}
