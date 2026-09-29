"use client";

import { usePlatformStore } from "@/lib/inbox/store";
import { Bell } from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { useEffect, useRef, useState } from "react";

export function NotificationBell() {
  const notices = usePlatformStore((state) => state.notices);
  const markNoticeRead = usePlatformStore((state) => state.markNoticeRead);
  const unread = notices.some((notice) => notice.unread);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={unread ? "Notifications, unread" : "Notifications"}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`relative grid h-8 w-8 place-items-center rounded-full transition-colors ${
          open ? "bg-[#f3f3f3] text-[#1a1a1a]" : "text-[#5c5c5c] hover:bg-[#f6f6f6] hover:text-[#1a1a1a]"
        }`}
      >
        <Bell size={16} strokeWidth={1.6} absoluteStrokeWidth aria-hidden />
        {unread ? (
          <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-[#FD4E00] ring-2 ring-white" />
        ) : null}
      </button>
      <AnimatePresence>
        {open ? (
          <m.div
            role="menu"
            aria-label="Notifications"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className="absolute top-[calc(100%+8px)] right-0 z-40 w-72 origin-top-right rounded-[14px] border border-[#ececec] bg-white p-1 shadow-[0_16px_40px_rgba(0,0,0,0.08)]"
          >
            <p className="px-2.5 py-2 text-[12px] font-medium text-[#8a8a8a]">Notifications</p>
            {notices.length === 0 ? (
              <p className="px-2.5 py-3 text-[13px] text-[#8a8a8a]">No deployments yet.</p>
            ) : (
            <ul>
              {notices.map((notice) => (
                <li key={notice.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => markNoticeRead(notice.id)}
                    className="flex w-full items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition-colors hover:bg-[#f6f6f6]"
                  >
                    <span className="mt-1.5 grid h-1.5 w-1.5 shrink-0 place-items-center">
                      {notice.unread ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-[#FD4E00]" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className="truncate text-[13px] font-medium text-[#1c1c1c]">
                          {notice.title}
                        </span>
                        <span className="shrink-0 text-[11px] text-[#9a9a9a]">{notice.time}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-[12px] text-[#8a8a8a]">
                        {notice.detail}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            )}
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
