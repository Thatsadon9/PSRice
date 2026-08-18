export default function BackofficeLoading() {
  return (
    <main className="mx-auto max-w-[1420px] px-3 py-5 sm:px-5" aria-label="กำลังโหลดหน้า Backoffice">
      <div className="border-b border-slate-200 pb-4">
        <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-7 w-52 animate-pulse rounded bg-slate-200" />
        <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-slate-100" />
      </div>
      <div className="mt-5 border border-slate-200 bg-white">
        <div className="h-14 animate-pulse border-b border-slate-200 bg-slate-50" />
        <div className="space-y-4 p-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="h-8 animate-pulse rounded bg-slate-100" />)}</div>
      </div>
    </main>
  );
}
