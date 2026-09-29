import type { SVGProps } from "react";

/** Isometric cube, the Redis mark, with a lighter top face. */
export function RedisMark({ size = 16, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2.4 21.2 7.6 12 12.8 2.8 7.6Z" opacity="0.55" />
      <path d="M12 12.8 21.2 7.6v9.2L12 21.6Z" />
      <path d="M12 12.8 2.8 7.6v9.2L12 21.6Z" opacity="0.78" />
    </svg>
  );
}
