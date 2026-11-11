"use client";

import { usePlatformStore } from "@/lib/inbox/store";
import { usePresentedChrome } from "./chrome";
import { ThemeChoice } from "@/components/theme-switch";
import { ChevronsUpDown, LifeBuoy, LogOut, Shield, UserRound } from "lucide-react";
import { supportHref } from "@/lib/plan";
import { PlanLabel } from "./plan-label";
import { UserAvatar } from "./user-avatar";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { useEffect, useRef, useState, type ReactNode } from "react";

export function ProfileMenu() {
  const logout = usePlatformStore((state) => state.logout);
  const role = usePlatformStore((state) => state.user?.role);
  const avatarUrl = usePlatformStore((state) => state.user?.avatarUrl);
  const email = usePlatformStore((state) => state.user?.email);
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
    return <span className={`block w-full ${collapsed ? "h-8" : "h-11"}`} />;
  }

  const label = name || "Account";

  return (
    <div ref={rootRef} className="pm-root">
      <button
        type="button"
        aria-label="Account"
        aria-haspopup="menu"
        aria-expanded={open}
        title={collapsed ? label : undefined}
        onClick={() => setOpen((current) => !current)}
        className={`pm-trigger ${collapsed ? "is-collapsed" : ""} ${open ? "is-open" : ""}`}
      >
        <UserAvatar name={label} src={avatarUrl} size={28} />
        {collapsed ? null : (
          <>
            <span className="pm-trigger-text">
              <span className="pm-trigger-name">{label}</span>
              <PlanLabel short className="pm-trigger-plan" />
            </span>
            <ChevronsUpDown size={14} strokeWidth={1.6} aria-hidden className="pm-trigger-icon" />
          </>
        )}
      </button>
      <AnimatePresence>
        {open ? (
          <m.div
            role="menu"
            aria-label="Account"
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98, transition: { duration: 0.12, ease: "easeOut" } }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className={`pm-menu ${collapsed ? "is-side" : "is-up"}`}
          >
            <div className="pm-head">
              <UserAvatar name={label} src={avatarUrl} size={34} />
              <div className="min-w-0 flex-1">
                <p className="pm-name">{label}</p>
                {email ? <p className="pm-email">{email}</p> : null}
              </div>
            </div>
            <div className="pm-sep" />
            {role === "admin" ? (
              <MenuOption
                icon={<Shield size={15} strokeWidth={1.5} absoluteStrokeWidth />}
                label="Admin"
                onClick={() => {
                  setOpen(false);
                  router.push("/admin");
                }}
              />
            ) : null}
            <MenuOption
              icon={<UserRound size={15} strokeWidth={1.5} absoluteStrokeWidth />}
              label="Account settings"
              onClick={() => {
                setOpen(false);
                setNav("general");
              }}
            />
            <a
              role="menuitem"
              className="pm-item"
              href={supportHref("Runex support", email)}
              onClick={() => setOpen(false)}
            >
              <LifeBuoy size={15} strokeWidth={1.5} absoluteStrokeWidth />
              <span className="min-w-0 flex-1 truncate">Contact support</span>
            </a>
            <div className="pm-theme">
              <span>Theme</span>
              <ThemeChoice size="sm" />
            </div>
            <div className="pm-sep" />
            <MenuOption
              icon={<LogOut size={15} strokeWidth={1.5} absoluteStrokeWidth />}
              label="Log out"
              quiet
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
  quiet = false,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  quiet?: boolean;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={quiet ? "pm-item is-quiet" : "pm-item"}
    >
      {icon}
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </button>
  );
}
