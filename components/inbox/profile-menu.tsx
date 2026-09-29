"use client";

import { usePlatformStore } from "@/lib/inbox/store";
import { usePresentedChrome } from "./chrome";
import { useTheme } from "@/components/theme-switch";
import { LogOut, Moon, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function ProfileMenu() {
  const logout = usePlatformStore((state) => state.logout);
  const { showAccount, name, openId } = usePresentedChrome();
  const router = useRouter();
  const setNav = usePlatformStore((state) => state.setNav);
  const collapsed = openId !== null;
  const [open, setOpen] = useState(false);
  const [collapseEpoch, setCollapseEpoch] = useState(collapsed);
  const rootRef = useRef<HTMLDivElement>(null);

  if (collapseEpoch !== collapsed) {
    setCollapseEpoch(collapsed);
    setOpen(false);
  }

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

  if (!showAccount) {
    return <span className="block h-8 w-full" />;
  }

  const label = name || "Account";
  const { dark, toggle } = useTheme();

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`flex h-8 w-full min-w-0 items-center rounded-lg text-left text-[13px] font-normal tracking-[-0.006em] text-[#6e6e73] transition-colors ${
          open ? "bg-black/[0.05] text-[#1d1d1f]" : "hover:bg-black/[0.04] hover:text-[#3a3a3c]"
        }`}
      >
        <span className="grid size-8 shrink-0 place-items-center">
          <span className="grid size-6 place-items-center rounded-full bg-[#1d1d1f] text-[11px] font-normal text-white">
            {label.slice(0, 1).toUpperCase()}
          </span>
        </span>
        {collapsed ? null : <span className="min-w-0 flex-1 truncate pr-2">{label}</span>}
      </button>
      <AnimatePresence>
        {open ? (
          <m.div
            role="menu"
            aria-label="Account"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={`absolute z-40 rounded-[12px] border border-[#ececec] bg-white p-1 shadow-[0_12px_32px_rgba(0,0,0,0.08)] ${
              collapsed
                ? "bottom-0 left-full ml-2 w-44 origin-bottom-left"
                : "bottom-[calc(100%+6px)] left-0 w-full origin-bottom"
            }`}
          >
            <MenuOption
              icon={<UserRound size={15} strokeWidth={1.5} absoluteStrokeWidth />}
              label="Account"
              onClick={() => {
                setOpen(false);
                setNav("general");
              }}
            />
            <div className="mx-1 my-1 h-px bg-fg/[0.08]" />
            <button
              type="button"
              role="switch"
              aria-checked={dark}
              onClick={toggle}
              suppressHydrationWarning
              className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left transition-colors hover:bg-[#f6f6f6]"
            >
              <span className="grid size-5 shrink-0 place-items-center text-[#8e8e93]">
                <Moon size={15} strokeWidth={1.5} absoluteStrokeWidth />
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-normal tracking-[-0.006em] text-[#3a3a3c]">
                Dark mode
              </span>
              <span aria-hidden className={`runex-switch ${dark ? "is-on" : ""}`}>
                <span />
              </span>
            </button>
            <MenuOption
              icon={<LogOut size={15} strokeWidth={1.5} absoluteStrokeWidth />}
              label="Log out"
              onClick={() => {
                setOpen(false);
                void logout().then(() => router.replace("/sign-in"));
              }}
            />
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function MenuOption({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] font-normal tracking-[-0.006em] text-[#3a3a3c] transition-colors hover:bg-[#f6f6f6]"
    >
      <span className="grid size-5 shrink-0 place-items-center text-[#8e8e93]">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
