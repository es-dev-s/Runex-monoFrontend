import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    viewBox: "0 0 24 24",
    fill: "none",
    "aria-hidden": true,
    ...props,
  } as const;
}

export function SparkMailIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M4.2 8.2h12.2a1.4 1.4 0 0 1 1.4 1.4v7.1a1.4 1.4 0 0 1-1.4 1.4H5.6a1.4 1.4 0 0 1-1.4-1.4V8.2Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M4.4 8.6 10.3 13l5.9-4.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        fill="currentColor"
        d="m17.55 3.15.48 1.28 1.28.48-1.28.48-.48 1.28-.48-1.28-1.28-.48 1.28-.48.48-1.28Z"
      />
    </svg>
  );
}

export function StackStarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect
        x="8.15"
        y="3.15"
        width="12.2"
        height="12.2"
        rx="3.1"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <rect
        x="3.55"
        y="8.05"
        width="12.2"
        height="12.2"
        rx="3.1"
        className="fill-[#fafafa] group-data-[active=true]:fill-white"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        fill="currentColor"
        d="m9.65 14.15 1.05-2.15 1.05 2.15 2.35.32-1.72 1.62.42 2.32-2.1-1.12-2.1 1.12.42-2.32-1.72-1.62 2.35-.32Z"
      />
    </svg>
  );
}

export function InboxGlyph({
  filled = false,
  ...props
}: IconProps & { filled?: boolean }) {
  if (filled) {
    return (
      <svg {...base(props)}>
        <path
          fill="currentColor"
          d="M6.15 3.85h11.7c.72 0 1.28.5 1.42 1.18l1.55 6.22h-4.55l-1.35 2.35H9.08L7.73 11.25H3.18l1.55-6.22c.14-.68.7-1.18 1.42-1.18Z"
        />
        <path
          fill="currentColor"
          d="M3.15 12.15h4.35l1.35 2.35h6.3l1.35-2.35h4.35V18.2c0 1.16-.94 2.1-2.1 2.1H5.25c-1.16 0-2.1-.94-2.1-2.1v-6.05Z"
        />
      </svg>
    );
  }

  return (
    <svg {...base(props)}>
      <path
        d="M4.2 12.2h3.9l1.25 2.15h5.3l1.25-2.15h3.9"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <path
        d="M5.35 12.15 6.9 6.15h10.2l1.55 6v5.85c0 .9-.75 1.65-1.65 1.65H7c-.9 0-1.65-.75-1.65-1.65v-5.85Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FolderIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        fill="currentColor"
        d="M3.4 8.05c0-1.16.94-2.1 2.1-2.1h3.15l1.45 1.7h8.4c1.16 0 2.1.94 2.1 2.1v7.35c0 1.16-.94 2.1-2.1 2.1H5.5c-1.16 0-2.1-.94-2.1-2.1V8.05Z"
      />
    </svg>
  );
}

export function OrgIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="5.1" r="2.15" fill="currentColor" />
      <circle cx="6.15" cy="17.4" r="2.15" fill="currentColor" />
      <circle cx="17.85" cy="17.4" r="2.15" fill="currentColor" />
      <path
        d="M12 7.25v3.15M12 10.4H7.15V15.2M12 10.4h4.85V15.2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ClipboardIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect
        x="6.2"
        y="4.7"
        width="11.6"
        height="15.2"
        rx="2.2"
        fill="currentColor"
      />
      <rect
        x="9.1"
        y="3.15"
        width="5.8"
        height="3.15"
        rx="1.15"
        fill="currentColor"
      />
      <path
        d="M8.7 10.15h6.6M8.7 13.15h4.7"
        stroke="white"
        strokeWidth="1.35"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function FileIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        fill="currentColor"
        d="M7.15 3.35h6.05l4.85 4.85V19.4c0 .95-.75 1.7-1.7 1.7H7.15c-.95 0-1.7-.75-1.7-1.7V5.05c0-.95.75-1.7 1.7-1.7Z"
      />
      <path fill="#fafafa" d="M13.15 3.45v4.15c0 .55.45 1 1 1h4.7" />
      <path
        d="M8.2 12.15h6.3M8.2 15.05h4.4"
        stroke="white"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ComposePlusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect
        x="3.2"
        y="5.1"
        width="13.4"
        height="10.6"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.8"
      />
      <path
        d="m3.7 6.4 6.2 4.35L16.1 6.4"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M18.2 14.2v6.2M15.1 17.3h6.2"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PaperPlaneIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M3.8 11.35 20.2 4.4l-5.7 15.15-2.15-6.05L3.8 11.35Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M12.35 13.5 20.2 4.4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function SunburstIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      {Array.from({ length: 8 }, (_, index) => (
        <line
          key={index}
          x1="12"
          y1="12"
          x2="12"
          y2="2.7"
          stroke="currentColor"
          strokeWidth="2.35"
          strokeLinecap="round"
          transform={`rotate(${index * 45} 12 12)`}
        />
      ))}
    </svg>
  );
}

export function ListIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M5 7.25h14M5 12h14M5 16.75h14"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="m5.2 12.2 4.15 4.15L18.8 7.7"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function VerifiedBadge(props: IconProps) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden {...props}>
      <circle cx="8" cy="8" r="8" fill="#44C1F7" />
      <path
        d="M4.55 8.15 6.85 10.4 11.5 5.7"
        fill="none"
        stroke="white"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8.2" r="3.15" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M5.4 18.4c.7-2.7 2.9-4.1 6.6-4.1s5.9 1.4 6.6 4.1"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M12 5.25v13.5M5.25 12h13.5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function DeployIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path
        d="M12 15.2V5.4M8.3 8.7 12 5l3.7 3.7"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 18.6h14"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ProjectsIcon({
  filled = false,
  ...props
}: IconProps & { filled?: boolean }) {
  if (filled) {
    return (
      <svg {...base(props)}>
        <rect x="3.4" y="3.4" width="7.2" height="7.2" rx="1.8" fill="currentColor" />
        <rect x="13.4" y="3.4" width="7.2" height="7.2" rx="1.8" fill="currentColor" />
        <rect x="3.4" y="13.4" width="7.2" height="7.2" rx="1.8" fill="currentColor" />
        <rect x="13.4" y="13.4" width="7.2" height="7.2" rx="1.8" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg {...base(props)}>
      <rect x="3.6" y="3.6" width="6.8" height="6.8" rx="1.7" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.6" y="3.6" width="6.8" height="6.8" rx="1.7" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3.6" y="13.6" width="6.8" height="6.8" rx="1.7" stroke="currentColor" strokeWidth="1.6" />
      <rect x="13.6" y="13.6" width="6.8" height="6.8" rx="1.7" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export function ServerIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="4.2" y="3.4" width="15.6" height="5.2" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <rect x="4.2" y="10.4" width="15.6" height="5.2" rx="1.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M7.2 6h.1M7.2 13h.1" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
