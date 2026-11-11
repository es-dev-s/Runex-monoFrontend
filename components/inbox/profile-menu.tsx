"use client";

import { usePlatformStore } from "@/lib/inbox/store";
import { usePresentedChrome } from "./chrome";
import { ThemeChoice } from "@/components/theme-switch";
import { ChevronsUpDown, CreditCard, Layers, LifeBuoy, LogOut, Shield, UserRound } from "lucide-react";
import { supportHref } from "@/lib/plan";
import { PlanLabel } from "./plan-label";
import { UserAvatar } from "./user-avatar";
import { useRouter } from "next/navigation";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { DURATION, EASE_OUT } from "@/lib/motion";

/**
 * Sidebar account pill and its menu. In the phone drawer (`sheet`) the rail is
 * never collapsed, so the pill keeps its full width and the menu opens upward
 * inside the drawer instead of sideways off-screen.
 */
export function ProfileMenu({ sheet = false }: { sheet?: boolean }) {
  const avatarUrl = usePlatformStore((state) => state.user?.avatarUrl);
  const { showAccount, name, openId } = usePresentedChrome();
  const collapsed = !sheet && openId !== null;
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
            exit={{ opacity: 0, y: 4, scale: 0.98, transition: { duration: DURATION.fast, ease: EASE_OUT } }}
            transition={{ duration: DURATION.base, ease: EASE_OUT }}
            className={`pm-menu ${collapsed ? "is-side" : "is-up"}`}
          >
            <AccountMenuBody onDone={() => setOpen(false)} />
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/**
 * Phone header account entry: the user's photo, opening the same account menu
 * as a bottom sheet. Hidden from md up, where the sidebar pill is always shown.
 */
export function MobileAccountButton() {
  const avatarUrl = usePlatformStore((state) => state.user?.avatarUrl);
  const { showAccount, name } = usePresentedChrome();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    sheetRef.current?.focus({ preventScroll: true });
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      trigger?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!showAccount) return null;
  const label = name || "Account";

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Account"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="pm-mobile-trigger md:hidden"
      >
        <UserAvatar name={label} src={avatarUrl} size={28} />
      </button>
      {typeof document === "undefined"
        ? null
        : createPortal(
            <AnimatePresence>
              {open ? (
                <m.div
                  key="account-scrim"
                  aria-hidden
                  className="pm-sheet-scrim md:hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: { duration: DURATION.fast, ease: EASE_OUT } }}
                  transition={{ duration: DURATION.base, ease: EASE_OUT }}
                  onClick={() => setOpen(false)}
                />
              ) : null}
              {open ? (
                <m.div
                  key="account-sheet"
                  ref={sheetRef}
                  role="dialog"
                  aria-modal="true"
                  aria-label="Account"
                  tabIndex={-1}
                  className="pm-menu is-sheet md:hidden"
                  initial={{ y: "100%" }}
                  animate={{ y: 0 }}
                  exit={{ y: "100%", transition: { duration: DURATION.base, ease: EASE_OUT } }}
                  transition={{ duration: DURATION.slow, ease: EASE_OUT }}
                >
                  <span className="pm-sheet-handle" aria-hidden />
                  <div role="menu" aria-label="Account">
                    <AccountMenuBody sheet onDone={() => setOpen(false)} />
                  </div>
                </m.div>
              ) : null}
            </AnimatePresence>,
            document.body,
          )}
    </>
  );
}

/**
 * The account menu's contents, shared by the sidebar popover and the phone
 * sheet so both run the exact same actions, including Log out.
 */
function AccountMenuBody({ onDone, sheet = false }: { onDone: () => void; sheet?: boolean }) {
  const logout = usePlatformStore((state) => state.logout);
  const role = usePlatformStore((state) => state.user?.role);
  const avatarUrl = usePlatformStore((state) => state.user?.avatarUrl);
  const email = usePlatformStore((state) => state.user?.email);
  const setNav = usePlatformStore((state) => state.setNav);
  const { name } = usePresentedChrome();
  const router = useRouter();
  const label = name || "Account";
  const iconSize = sheet ? 17 : 15;

  return (
    <>
      <div className="pm-head">
        <UserAvatar name={label} src={avatarUrl} size={sheet ? 40 : 34} />
        <div className="min-w-0 flex-1">
          <p className="pm-name">{label}</p>
          {email ? <p className="pm-email">{email}</p> : null}
          {sheet ? <PlanLabel className="pm-plan" /> : null}
        </div>
      </div>
      <div className="pm-sep" />
      {role === "admin" ? (
        <MenuOption
          icon={<Shield size={iconSize} strokeWidth={1.5} absoluteStrokeWidth />}
          label="Admin"
          onClick={() => {
            onDone();
            router.push("/admin");
          }}
        />
      ) : null}
      <MenuOption
        icon={<UserRound size={iconSize} strokeWidth={1.5} absoluteStrokeWidth />}
        label="Account settings"
        onClick={() => {
          onDone();
          setNav("general");
        }}
      />
      {sheet ? (
        <>
          <MenuOption
            icon={<Layers size={iconSize} strokeWidth={1.5} absoluteStrokeWidth />}
            label="Plans"
            onClick={() => {
              onDone();
              setNav("plans");
            }}
          />
          <MenuOption
            icon={<CreditCard size={iconSize} strokeWidth={1.5} absoluteStrokeWidth />}
            label="Billing"
            onClick={() => {
              onDone();
              setNav("billing");
            }}
          />
        </>
      ) : null}
      <a
        role="menuitem"
        className="pm-item"
        href={supportHref("Runex support", email)}
        onClick={onDone}
      >
        <LifeBuoy size={iconSize} strokeWidth={1.5} absoluteStrokeWidth />
        <span className="min-w-0 flex-1 truncate">Contact support</span>
      </a>
      <div className="pm-theme">
        <span>Theme</span>
        <ThemeChoice size="sm" />
      </div>
      <div className="pm-sep" />
      <MenuOption
        icon={<LogOut size={iconSize} strokeWidth={1.5} absoluteStrokeWidth />}
        label="Log out"
        quiet
        onClick={() => {
          onDone();
          void logout().then(() => router.replace("/sign-in"));
        }}
      />
    </>
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
