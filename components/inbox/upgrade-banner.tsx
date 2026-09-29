import Image from "next/image";

export function UpgradeBanner() {
  return (
    <div className="relative h-[168px] overflow-hidden bg-[var(--card)]">
      <Image
        src="/inbox-banner.png"
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 80vw, 100vw"
        className="object-cover object-[62%_42%] [mask-image:linear-gradient(to_bottom,#000_0%,#000_36%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_36%,transparent_100%)]"
      />
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-white/25 via-transparent to-transparent [mask-image:linear-gradient(to_bottom,#000_0%,#000_36%,transparent_100%)] [-webkit-mask-image:linear-gradient(to_bottom,#000_0%,#000_36%,transparent_100%)]"
      />
      <div className="relative flex h-full items-center px-7 pb-6">
        <div>
          <p className="text-[22px] font-semibold leading-[1.15] tracking-[-0.03em] text-[#1a2433]">
            Upgrade with AI
          </p>
          <p className="mt-1 text-[20px] font-medium leading-[1.15] tracking-[-0.03em] text-[#1a2433]">
            For more powerful deploys
          </p>
        </div>
      </div>
    </div>
  );
}
