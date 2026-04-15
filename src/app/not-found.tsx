import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6 py-12">
      <div className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
          404
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Page not found.</h1>
        <p className="mt-2 text-sm text-slate-600">
          The route does not exist or the resource is no longer available.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-xl bg-primary-800 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
          >
            Go Home
          </Link>
          <Link
            href="/login"
            className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
