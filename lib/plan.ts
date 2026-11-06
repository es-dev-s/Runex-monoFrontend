/**
 * Account plan, trial clock, and support contact, in one place.
 *
 * The API sends `user.plan` (status, trialEndsAt, daysLeft) and enforces the
 * rules itself. This module turns that into what the UI shows and keeps a
 * client-side compute lock so the dashboard never fires a request the API
 * would refuse. Nothing here imports app code, so anything can import it.
 */

export const SUPPORT_EMAIL = "support@runex.cloud";
export const TRIAL_DAYS = 30;
/** The free trial's stated value. Only the projects banner shows it. */
export const TRIAL_VALUE = "$20";
/** At or below this many days left, the trial timer turns red. */
export const URGENT_DAYS = 5;

export const TRIAL_ENDED_MESSAGE = "Your free trial has ended. Contact support to run this project again.";

export type PlanStatus = "trial" | "active" | "expired";

/** Shape of `user.plan` from /v1/auth/me. */
export type AccountPlan = {
  status: PlanStatus;
  trialDays: number;
  trialStartedAt: string;
  trialEndsAt: string;
  daysLeft: number;
};

export type PlanTone = "calm" | "urgent" | "ended" | "active";

export type PlanView = {
  /** False until the account (and its plan) has loaded. */
  ready: boolean;
  status: PlanStatus;
  daysLeft: number;
  endsAt: Date | null;
  /** Share of the trial already used, 0 to 1. */
  used: number;
  tone: PlanTone;
  /** True when the account may not build, start, or run anything. */
  locked: boolean;
  /** Full label: "Free trial · 23 days left", "Trial ended", "Active plan". */
  label: string;
  /** Compact label for tight spots like the sidebar. */
  short: string;
  /** One calm sentence for settings pages. */
  summary: string;
};

const DAY = 24 * 60 * 60 * 1000;

export function daysLeftUntil(endsAt: number, now: number) {
  const left = endsAt - now;
  return left > 0 ? Math.ceil(left / DAY) : 0;
}

/** Timer colour. Red once URGENT_DAYS or fewer remain on a trial, or when it has ended. */
export function planTone(status: PlanStatus, daysLeft: number): PlanTone {
  if (status === "active") return "active";
  if (status === "expired") return "ended";
  return daysLeft <= URGENT_DAYS ? "urgent" : "calm";
}

export function formatPlanDate(date: Date) {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function days(n: number) {
  return `${n} ${n === 1 ? "day" : "days"}`;
}

export function derivePlan(plan: AccountPlan | undefined | null, now: number): PlanView {
  const ends = plan ? Date.parse(plan.trialEndsAt) : NaN;
  if (!plan || !Number.isFinite(ends) || !now) {
    return {
      ready: false,
      status: "trial",
      daysLeft: TRIAL_DAYS,
      endsAt: null,
      used: 0,
      tone: "calm",
      locked: false,
      label: "Free trial",
      short: "Free trial",
      summary: `Your first ${TRIAL_DAYS} days on Runex are free.`,
    };
  }
  const total = Math.max(1, plan.trialDays || TRIAL_DAYS) * DAY;
  const status: PlanStatus =
    plan.status === "active" ? "active" : plan.status === "expired" || now >= ends ? "expired" : "trial";
  const daysLeft = status === "expired" ? 0 : daysLeftUntil(ends, now);
  const endsAt = new Date(ends);
  const used = Math.min(1, Math.max(0, 1 - (ends - now) / total));
  const tone = planTone(status, daysLeft);
  if (status === "active") {
    return {
      ready: true,
      status,
      daysLeft,
      endsAt,
      used,
      tone,
      locked: false,
      label: "Paid plan",
      short: "Paid plan",
      summary: "You're on a paid plan. Nothing is limited, and support is here 24/7.",
    };
  }
  if (status === "expired") {
    return {
      ready: true,
      status,
      daysLeft: 0,
      endsAt,
      used: 1,
      tone,
      locked: true,
      label: "Trial ended",
      short: "Trial ended",
      summary: `Your free trial ended on ${formatPlanDate(endsAt)}.`,
    };
  }
  return {
    ready: true,
    status,
    daysLeft,
    endsAt,
    used,
    tone,
    locked: false,
    label: `Free trial · ${days(daysLeft)} left`,
    short: `Trial · ${days(daysLeft)} left`,
    summary: `Your free trial runs until ${formatPlanDate(endsAt)}.`,
  };
}

/* ------------------------------------------------------------- compute lock */

let computeLocked = false;

export function setComputeLocked(locked: boolean) {
  computeLocked = locked;
}

export function isComputeLocked() {
  return computeLocked;
}

/** Asks the dashboard to show the trial-ended notice again. */
export const TRIAL_NOTICE_EVENT = "runex:trial-notice";

export function requestTrialNotice() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(TRIAL_NOTICE_EVENT));
}

/* ------------------------------------------------------------------ support */

/** mailto link to support, optionally prefilled so the team knows who is asking. */
export function supportHref(subject: string, from?: string | null) {
  const params = new URLSearchParams({ subject });
  if (from) params.set("body", `\n\n—\nRunex account: ${from}`);
  // URLSearchParams encodes spaces as "+", which mail clients show literally.
  return `mailto:${SUPPORT_EMAIL}?${params.toString().replace(/\+/g, "%20")}`;
}
