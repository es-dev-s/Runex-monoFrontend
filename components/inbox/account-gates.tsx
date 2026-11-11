"use client";

import { auth } from "@/lib/api";
import type { User } from "@/lib/api/types";
import { usePlatformStore } from "@/lib/inbox/store";
import { setComputeLocked, supportHref, TRIAL_DAYS, TRIAL_NOTICE_EVENT } from "@/lib/plan";
import { usePlanView } from "@/lib/use-plan";
import { ArrowUpRight, Check, PauseCircle } from "lucide-react";
import { AnimatePresence, useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { RunexLogo } from "./runex-logo";
import { DURATION, EASE_OUT } from "@/lib/motion";

const WELCOME_KEY = (id: string) => `runex.welcomed.${id}`;
const IGNORE_KEY = (id: string, ends: string) => `runex.trial-ignored.${id}.${ends}`;

function readStore(kind: "local" | "session", key: string) {
  try {
    return (kind === "local" ? window.localStorage : window.sessionStorage).getItem(key) === "1";
  } catch {
    return false;
  }
}

function writeStore(kind: "local" | "session", key: string, on: boolean) {
  try {
    const store = kind === "local" ? window.localStorage : window.sessionStorage;
    if (on) store.setItem(key, "1");
    else store.removeItem(key);
  } catch {
    // Private mode: the in-memory state still hides the module for this visit.
  }
}

type Preview = "welcome" | "ended" | null;

/**
 * `?preview=welcome` or `?preview=ended` shows a module for review only. It is
 * read once on mount, never calls the API, never touches the trial lock, and
 * its buttons just close it.
 */
function readPreview(): Preview {
  if (typeof window === "undefined") return null;
  const value = new URLSearchParams(window.location.search).get("preview");
  return value === "welcome" || value === "ended" ? value : null;
}

function clearPreviewParam() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("preview")) return;
    url.searchParams.delete("preview");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  } catch {
    // Leaving the query in place is harmless.
  }
}

/** Merge a fresh /me answer into the store, only if the same account is still signed in. */
function adoptUser(fresh: User) {
  usePlatformStore.setState((state) =>
    state.user && state.user.id === fresh.id ? { user: { ...state.user, ...fresh } } : {},
  );
}

/**
 * First-run welcome and trial-ended notice. Both are small floating modules
 * over the dashboard; neither replaces a route. The API is the source of
 * truth: `user.onboarded` and `user.plan` come from /v1/auth/me.
 */
export function AccountGates() {
  const user = usePlatformStore((state) => state.user);
  const session = usePlatformStore((state) => state.session);
  const view = usePlanView();
  const [welcomed, setWelcomed] = useState<string | null>(null);
  const [ignored, setIgnored] = useState<Record<string, boolean>>({});
  const [preview, setPreview] = useState<Preview>(readPreview);
  const savingRef = useRef(false);

  const userId = user?.id ?? "";
  const signedIn = session === "in" && Boolean(user);
  const endsKey = user?.plan?.trialEndsAt ?? "";

  // Mirror the lock for the API layer, which refuses compute calls before they leave the browser.
  useEffect(() => {
    setComputeLocked(signedIn && view.locked);
    return () => setComputeLocked(false);
  }, [signedIn, view.locked]);

  const locallyWelcomed = userId ? welcomed === userId || readStore("local", WELCOME_KEY(userId)) : false;
  const showWelcome = signedIn && user?.onboarded === false && !locallyWelcomed;

  // A Continue that could not reach the API is retried on the next visit.
  useEffect(() => {
    if (!signedIn || !userId || user?.onboarded !== false) return;
    if (!readStore("local", WELCOME_KEY(userId)) || savingRef.current) return;
    savingRef.current = true;
    auth
      .onboarding()
      .then(adoptUser)
      .catch(() => {})
      .finally(() => {
        savingRef.current = false;
      });
  }, [signedIn, userId, user?.onboarded]);

  const ignoreKey = userId && endsKey ? IGNORE_KEY(userId, endsKey) : "";
  const ignoredNow = ignoreKey ? (ignored[ignoreKey] ?? readStore("session", ignoreKey)) : false;
  const showEnded = signedIn && view.ready && view.locked && !showWelcome && !ignoredNow;

  // Any refused compute action brings the notice back and re-checks the account.
  useEffect(() => {
    if (!signedIn) return;
    let last = 0;
    function onNotice() {
      if (ignoreKey) {
        writeStore("session", ignoreKey, false);
        setIgnored((current) => ({ ...current, [ignoreKey]: false }));
      }
      const now = Date.now();
      if (now - last < 10_000) return;
      last = now;
      auth.me().then(adoptUser).catch(() => {});
    }
    window.addEventListener(TRIAL_NOTICE_EVENT, onNotice);
    return () => window.removeEventListener(TRIAL_NOTICE_EVENT, onNotice);
  }, [signedIn, ignoreKey]);

  // While locked, quietly re-check so an account support marks active unlocks without a reload.
  useEffect(() => {
    if (!signedIn || !view.locked) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      auth.me().then(adoptUser).catch(() => {});
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [signedIn, view.locked]);

  const finishWelcome = useCallback(() => {
    if (!userId || savingRef.current) return;
    savingRef.current = true;
    writeStore("local", WELCOME_KEY(userId), true);
    setWelcomed(userId);
    auth
      .onboarding()
      .then(adoptUser)
      .catch(() => {})
      .finally(() => {
        savingRef.current = false;
      });
  }, [userId]);

  const dismissEnded = useCallback(() => {
    if (!ignoreKey) return;
    writeStore("session", ignoreKey, true);
    setIgnored((current) => ({ ...current, [ignoreKey]: true }));
  }, [ignoreKey]);

  let gate: ReactNode = null;
  if (signedIn && preview) {
    const close = () => {
      clearPreviewParam();
      setPreview(null);
    };
    gate =
      preview === "welcome" ? (
        <Welcome key="welcome" onContinue={close} />
      ) : (
        <TrialEnded key="ended" email={user?.email} onDismiss={close} />
      );
  } else if (showWelcome) {
    gate = <Welcome key="welcome" onContinue={finishWelcome} />;
  } else if (showEnded) {
    gate = <TrialEnded key="ended" email={user?.email} onDismiss={dismissEnded} />;
  }
  return <AnimatePresence mode="wait">{gate}</AnimatePresence>;
}

/* ---------------------------------------------------------------- modules */

function Welcome({ onContinue }: { onContinue: () => void }) {
  const primary = useRef<HTMLButtonElement>(null);
  return (
    <FloatingModule labelledBy="gate-welcome-title" describedBy="gate-welcome-note" initialFocus={primary}>
      <span className="gate-mark" aria-hidden>
        <RunexLogo className="h-[22px] w-[22px]" />
      </span>
      <h2 id="gate-welcome-title" className="gate-title">
        Welcome to Runex Cloud
      </h2>
      <p id="gate-welcome-note" className="gate-note">
        From a GitHub push to a live HTTPS URL. Builds, containers and certificates, handled.
      </p>
      <ul className="gate-facts" aria-label="Included">
        {[`${TRIAL_DAYS}-day free trial`, "Isolated apps", "Support 24/7"].map((fact) => (
          <li key={fact}>
            <Check size={14} strokeWidth={2} aria-hidden />
            {fact}
          </li>
        ))}
      </ul>
      <div className="gate-actions">
        <button ref={primary} type="button" className="gate-btn gate-btn-primary" onClick={onContinue}>
          Continue
        </button>
      </div>
    </FloatingModule>
  );
}

function TrialEnded({ email, onDismiss }: { email?: string; onDismiss: () => void }) {
  const primary = useRef<HTMLAnchorElement>(null);
  return (
    <FloatingModule labelledBy="gate-ended-title" describedBy="gate-ended-note" initialFocus={primary}>
      <span className="gate-mark" aria-hidden>
        <PauseCircle size={20} strokeWidth={1.6} />
      </span>
      <h2 id="gate-ended-title" className="gate-title">
        Your free trial has ended
      </h2>
      <p id="gate-ended-note" className="gate-note">
        Your code, variables and settings are safe. Projects stay paused until your plan is set.
      </p>
      <div className="gate-actions">
        <a
          ref={primary}
          className="gate-btn gate-btn-primary"
          href={supportHref("Runex trial ended", email)}
          onClick={onDismiss}
        >
          Contact support
          <ArrowUpRight size={15} strokeWidth={1.8} aria-hidden />
        </a>
        <button type="button" className="gate-btn gate-btn-ghost" onClick={onDismiss}>
          Ignore for now
        </button>
      </div>
      <p className="gate-fine">You can still open your code and variables. Starting and deploying stay off.</p>
    </FloatingModule>
  );
}

/**
 * Centered card over a soft veil. Focus stays inside, Escape and outside clicks
 * do nothing (each module closes only through its own buttons), and the page
 * underneath cannot scroll while it is open. Unmounting restores everything.
 */
function FloatingModule({
  children,
  labelledBy,
  describedBy,
  initialFocus,
}: {
  children: ReactNode;
  labelledBy: string;
  describedBy: string;
  initialFocus: RefObject<HTMLElement | null>;
}) {
  const card = useRef<HTMLDivElement>(null);
  const still = useReducedMotion();

  useEffect(() => {
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    root.style.overflow = "hidden";
    initialFocus.current?.focus({ preventScroll: true });

    function focusables() {
      return Array.from(card.current?.querySelectorAll<HTMLElement>("a[href], button:not([disabled])") ?? []);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!card.current?.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    }
    function onFocusIn(event: FocusEvent) {
      if (card.current && !card.current.contains(event.target as Node)) {
        (initialFocus.current ?? focusables()[0])?.focus({ preventScroll: true });
      }
    }
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", onFocusIn);
      root.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [initialFocus]);

  return createPortal(
    <m.div
      className="gate-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: DURATION.fast, ease: EASE_OUT } }}
      transition={{ duration: DURATION.base, ease: EASE_OUT }}
    >
      <m.div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        className="gate-card"
        initial={still ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={still ? { opacity: 0 } : { opacity: 0, y: 4, scale: 0.99, transition: { duration: DURATION.fast, ease: EASE_OUT } }}
        transition={{ duration: DURATION.slow, ease: EASE_OUT }}
      >
        {children}
      </m.div>
    </m.div>,
    document.body,
  );
}
