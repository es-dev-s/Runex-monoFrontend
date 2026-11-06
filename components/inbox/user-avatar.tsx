"use client";

import { initials } from "@/lib/session";
import { useState } from "react";

/** Asks Google for a sharper square crop than the default 96px thumbnail. */
function sized(url: string, px: number) {
  if (!/^https:\/\/[a-z0-9.-]*googleusercontent\.com\//i.test(url)) return url;
  const target = Math.min(512, Math.max(64, Math.ceil(px * 2)));
  return /=s\d+(-c)?$/.test(url) ? url.replace(/=s\d+(-c)?$/, `=s${target}-c`) : `${url}=s${target}-c`;
}

/**
 * Profile photo with an initials fallback. The fallback also covers a photo
 * that fails to load, so a broken image icon never shows.
 */
export function UserAvatar({
  name,
  src,
  size = 32,
  className = "",
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState<string | null>(null);
  const url = src && src !== failed ? sized(src, size) : "";
  const label = initials(name || "?");
  return (
    <span
      className={`runex-avatar ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
      aria-hidden
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote provider photo, sized by the provider
        <img
          key={url}
          src={url}
          alt=""
          width={size}
          height={size}
          referrerPolicy="no-referrer"
          decoding="async"
          draggable={false}
          onError={() => setFailed(src ?? null)}
        />
      ) : (
        <span>{label}</span>
      )}
    </span>
  );
}
