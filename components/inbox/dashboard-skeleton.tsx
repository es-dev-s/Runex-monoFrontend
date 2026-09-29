export function DashboardSkeleton() {
  return (
    <div className="flex h-full w-full overflow-hidden bg-white">
      <div className="w-[216px] shrink-0 border-r border-[#eeeeee] bg-[#f6f6f6]" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="h-12 border-b border-[#f2f2f2]" />
        <div className="flex flex-1 flex-col gap-3 px-5 pt-4">
          <div className="h-[68px] animate-pulse rounded-[16px] bg-[#f6f6f6]" />
          <div className="h-80 animate-pulse rounded-[18px] bg-[#f6f6f6]" />
        </div>
      </div>
    </div>
  );
}
