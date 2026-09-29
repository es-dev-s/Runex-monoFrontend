import type { SVGProps } from "react";

/** Filled database cylinder. The lid stays readable at the card's small size. */
export function PostgresMark({ size = 16, ...props }: SVGProps<SVGSVGElement> & { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="currentColor" aria-hidden="true" {...props}>
      <path
        fillRule="evenodd"
        d="M4 6.4C4 4.2 7.58 2.5 12 2.5s8 1.7 8 3.9v11.2c0 2.2-3.58 3.9-8 3.9s-8-1.7-8-3.9V6.4Zm1.7.1c0 1 2.8 2.1 6.3 2.1s6.3-1.1 6.3-2.1-2.8-2.1-6.3-2.1-6.3 1.1-6.3 2.1Z"
      />
    </svg>
  );
}
