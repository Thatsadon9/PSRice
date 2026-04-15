export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" />
        <p className="text-sm font-medium text-slate-500">Loading workspace...</p>
      </div>
    </div>
  );
}
