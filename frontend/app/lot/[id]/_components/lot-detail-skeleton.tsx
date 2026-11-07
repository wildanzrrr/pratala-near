import { Skeleton } from "@/components/ui/skeleton";

export function LotDetailSkeleton() {
  return (
    <div className="page-max page-x flex flex-col gap-6 py-8 sm:py-12">
      <Skeleton className="h-5 w-24" />
      <Skeleton className="h-10 w-2/3" />
      <Skeleton className="h-16 w-full" />
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <Skeleton className="h-96" />
        <Skeleton className="h-64" />
      </div>
    </div>
  );
}
