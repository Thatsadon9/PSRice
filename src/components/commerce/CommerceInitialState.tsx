'use client';

type CommerceInitialStateProps = {
  status: string;
  onRetry: () => void;
  label?: string;
};

export function CommerceInitialState({ status, onRetry, label = 'กำลังเตรียมพื้นที่ทำงาน' }: CommerceInitialStateProps) {
  const isLoading = status.startsWith('กำลังโหลด');

  if (!isLoading) {
    return <div className="grid min-h-[68dvh] place-items-center"><section className="w-full max-w-md border border-slate-200 bg-white p-6 text-center shadow-sm"><p className="text-sm font-semibold text-slate-900">ยังโหลดข้อมูลไม่สำเร็จ</p><p className="mt-2 text-sm leading-6 text-slate-500">{status}</p><button type="button" onClick={onRetry} className="mt-5 h-10 bg-primary-800 px-4 text-sm font-medium text-white transition hover:bg-primary-900">ลองใหม่</button></section></div>;
  }

  return <div className="animate-pulse" aria-busy="true" aria-live="polite"><span className="sr-only">{label}</span><div className="mb-5 border-b border-slate-200 pb-4"><div className="h-3 w-32 rounded bg-slate-200" /><div className="mt-3 h-8 w-64 max-w-full rounded bg-slate-200" /><div className="mt-3 h-4 w-96 max-w-3/4 rounded bg-slate-100" /></div><div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem]"><section className="border border-slate-200 bg-white"><div className="flex items-center justify-between border-b border-slate-200 px-4 py-3"><div className="h-4 w-32 rounded bg-slate-100" /><div className="h-7 w-24 rounded bg-slate-100" /></div><div className="space-y-px p-4">{Array.from({ length: 7 }, (_, index) => <div key={index} className="grid h-13 grid-cols-[7rem_minmax(10rem,1fr)_6rem_5rem] items-center gap-4 border-b border-slate-100"><div className="h-3 w-16 rounded bg-slate-100" /><div className="h-4 w-4/5 rounded bg-slate-100" /><div className="h-3 w-14 rounded bg-slate-100" /><div className="h-3 w-12 justify-self-end rounded bg-slate-100" /></div>)}</div></section><aside className="border border-slate-200 bg-white"><div className="border-b border-slate-200 p-4"><div className="h-4 w-28 rounded bg-slate-100" /><div className="mt-3 h-3 w-4/5 rounded bg-slate-100" /></div><div className="space-y-4 p-4"><div className="h-10 w-full rounded bg-slate-100" /><div className="h-10 w-full rounded bg-slate-100" /><div className="h-10 w-full rounded bg-slate-100" /></div></aside></div><p className="mt-4 text-sm text-slate-500">{label}</p></div>;
}
