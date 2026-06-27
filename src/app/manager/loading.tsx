import Skeleton from '@/components/ui/Skeleton';

export default function ManagerLoading() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto w-full">
      <Skeleton className="h-8 w-1/3" />
      <Skeleton className="h-32 w-full" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </div>
  );
}
