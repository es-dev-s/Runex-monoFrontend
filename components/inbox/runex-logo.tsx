import Image from "next/image";

export function RunexLogo({ className }: { className?: string }) {
  return (
    <Image
      src="/runex.svg"
      alt=""
      width={30}
      height={30}
      unoptimized
      className={`runex-logo block ${className ?? ""}`}
    />
  );
}
