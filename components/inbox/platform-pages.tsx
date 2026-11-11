"use client";

import { ThemeChoice } from "@/components/theme-switch";
import type { NavId } from "@/lib/inbox/schema";
import { usePlatformStore } from "@/lib/inbox/store";
import { formatBytes } from "@/lib/usage";
import { useWorkspaces } from "@/lib/workspaces";
import { SUPPORT_EMAIL, supportHref } from "@/lib/plan";
import { usePlanView } from "@/lib/use-plan";
import { Check, Copy, FileText, Mail } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { usePresentedChrome } from "./chrome";
import { PlanLabel } from "./plan-label";
import { WorkspaceUsage } from "./usage-page";
import { UserAvatar } from "./user-avatar";

const GIB = 1024 * 1024 * 1024;
const INCLUDED_RAM = GIB;
const INCLUDED_DISK = 5 * GIB;
const INCLUDED = [
  "Deploy from GitHub, a zip, or a Dockerfile",
  "HTTPS on every app",
  "Custom domains",
  "Environment variables",
  "One isolated container per app",
  "Build and runtime logs",
];
const PRICING = [
  {
    step: "01",
    title: "Free for 30 days",
    body: "Every new account deploys free for its first 30 days. Every feature, no card on file.",
  },
  {
    step: "02",
    title: "Priced to fit",
    body: "After that, we set your price to fit what you already pay for hosting today. No list prices, no surprises.",
  },
  {
    step: "03",
    title: "Support, 24/7",
    body: "Real people who run your apps, around the clock. Write any time and someone replies.",
  },
] as const;

export function PlatformPage({ nav }: { nav: NavId }) {
  if (nav === "usage") {
    return (
      <div key={nav} className="flex flex-col gap-3">
        <WorkspaceUsage />
      </div>
    );
  }
  return (
    <div key={nav} className="st-page">
      {nav === "people" ? <PeoplePage /> : null}
      {nav === "general" ? <GeneralPage /> : null}
      {nav === "plans" ? <PlansPage /> : null}
      {nav === "billing" ? <BillingPage /> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ General */

function GeneralPage() {
  const user = usePlatformStore((state) => state.user);
  const listed = usePlatformStore((state) => state.listed);
  const count = usePlatformStore((state) => state.projects.length);
  const setNav = usePlatformStore((state) => state.setNav);
  const setDeployOpen = usePlatformStore((state) => state.setDeployOpen);
  const { name } = usePresentedChrome();
  const { active } = useWorkspaces(user?.id ?? "", name);
  const plan = usePlanView();

  if (!user) return <AccountPending />;

  const display = user.name || user.username;
  const google = user.hasPassword === false;
  const since = joined(user.createdAt);

  return (
    <>
      <header className="st-head st-head-profile">
        <UserAvatar name={display} src={user.avatarUrl} size={60} className="st-head-avatar" />
        <div className="min-w-0">
          <h1 className="st-title">{display}</h1>
          <p className="st-sub st-sub-inline">
            <span>@{user.username}</span>
            <span aria-hidden className="st-dot" />
            <span>{user.email}</span>
          </p>
          <div className="st-head-meta">
            <PlanLabel variant="pill" />
            <button type="button" className="st-link" onClick={() => setNav("plans")}>
              View plan
            </button>
          </div>
        </div>
      </header>

      <Card title="Profile" description={google ? "Your name and photo come from your Google account." : "How you appear across Runex."}>
        <Row label="Display name">{display}</Row>
        <Row label="Username" hint={google ? "Your handle on Runex." : "You can sign in with this or your email."}>
          <span>@{user.username}</span>
        </Row>
        <Row label="Email">{user.email}</Row>
        <Row label="Sign-in method">
          {google ? (
            <span className="st-chip">
              <GoogleMark /> Google
            </span>
          ) : (
            <span className="st-chip">
              <Mail size={13} strokeWidth={1.75} aria-hidden /> Email and password
            </span>
          )}
        </Row>
        <Row label="Plan" hint={plan.summary}>
          <PlanLabel />
        </Row>
        {since ? <Row label="Member since">{since}</Row> : null}
      </Card>

      <Card title="Workspace" description="Projects you deploy are grouped here.">
        <Row label="Name">{active.name}</Row>
        <Row label="Projects">
          {!listed ? (
            <span className="st-skeleton" aria-label="Loading projects" />
          ) : count === 0 ? (
            <span className="st-muted">None yet</span>
          ) : (
            <span className="st-num">
              {count} {count === 1 ? "project" : "projects"}
            </span>
          )}
        </Row>
        {listed && count === 0 ? (
          <div className="st-empty">
            <div>
              <p className="st-empty-title">Deploy your first project</p>
              <p className="st-empty-body">Connect a GitHub repo or upload a zip. Runex builds it and gives you a live HTTPS URL.</p>
            </div>
            <button
              type="button"
              className="st-btn st-btn-primary"
              onClick={() => {
                setNav("projects");
                setDeployOpen(true);
              }}
            >
              New project
            </button>
          </div>
        ) : listed ? (
          <div className="st-foot">
            <button type="button" className="st-link" onClick={() => setNav("projects")}>
              View projects →
            </button>
          </div>
        ) : null}
      </Card>

      <Card title="Appearance" description="System follows your device. Your choice is saved to this account and applies next time you sign in.">
        <div className="st-pad">
          <ThemeChoice />
        </div>
      </Card>

      <Card title="Account ID" description="Support may ask for this. You never need it to sign in.">
        <div className="st-pad st-idrow">
          <code className="st-code st-truncate">{user.id}</code>
          <CopyButton value={user.id} />
        </div>
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------- People */

function PeoplePage() {
  const user = usePlatformStore((state) => state.user);
  if (!user) return <AccountPending />;
  const label = user.name || user.username;
  const since = joined(user.createdAt);
  return (
    <>
      <PageHeader title="People" sub="Everyone with access to this workspace." />
      <Card title="Members" meta="1 member">
      <div className="st-person">
        <UserAvatar name={label} src={user.avatarUrl} size={40} />
        <span className="min-w-0 flex-1">
          <span className="st-strong st-truncate block">{label}</span>
          <span className="st-muted st-truncate block">{user.email}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="st-chip">Owner</span>
          {since ? (
            <span className="st-muted mt-1 block text-[12px]" suppressHydrationWarning>
              Joined {since}
            </span>
          ) : null}
        </span>
      </div>
      </Card>
    </>
  );
}

/* -------------------------------------------------------------------- Plans */

function PlansPage() {
  const usage = usePlatformStore((state) => state.usage);
  const email = usePlatformStore((state) => state.user?.email);
  const ram = usage?.totals.ramUsedBytes;
  const disk = usage?.totals.diskUsedBytes;
  const plan = usePlanView();
  return (
    <>
      <PageHeader
        title={plan.status === "expired" ? "Your trial has ended" : plan.status === "active" ? "Paid plan" : "Free trial"}
        sub={
          plan.status === "expired"
            ? `${plan.summary} Your code and variables are safe. Contact support to run your projects again.`
            : plan.status === "active"
              ? "Thanks for building on Runex. Questions about your plan go straight to support, any time."
              : `${plan.summary} Deploy real projects with every feature, and talk to us about pricing whenever you're ready.`
        }
      >
        <PlanLabel variant="pill" />
      </PageHeader>

      <Card title="How pricing works" description="Pricing is set with you, not from a list.">
        <ol className="st-steps">
          {PRICING.map((item) => (
            <li key={item.step} className="st-step">
              <span className="st-step-num" aria-hidden>
                {item.step}
              </span>
              <p className="st-strong">{item.title}</p>
              <p className="st-muted">{item.body}</p>
            </li>
          ))}
        </ol>
        <ContactStrip
          title="Want a price for your workload?"
          body="Tell us what you run and what you pay for hosting now. We reply with a plan that fits."
          subject="Runex pricing"
          email={email}
        />
      </Card>

      <Card title="Included resources" description="Shared across every project on this account.">
        <div className="st-meters">
          <Meter label="Memory" used={ram} total={INCLUDED_RAM} />
          <Meter label="Disk" used={disk} total={INCLUDED_DISK} />
        </div>
      </Card>

      <Card title="What's included">
        <ul className="st-checks">
          {INCLUDED.map((item) => (
            <li key={item}>
              <Check size={14} strokeWidth={2} aria-hidden />
              {item}
            </li>
          ))}
          <li>
            <Check size={14} strokeWidth={2} aria-hidden />
            Support from real people, 24/7
          </li>
        </ul>
      </Card>
    </>
  );
}

function Meter({ label, used, total }: { label: string; used: number | undefined; total: number }) {
  const known = typeof used === "number" && Number.isFinite(used);
  const ratio = known ? Math.min(1, Math.max(0, used / total)) : 0;
  const percent = Math.round(ratio * 100);
  return (
    <div className="st-meter">
      <div className="st-meter-head">
        <span className="st-strong">{label}</span>
        <span className="st-muted st-num">
          {known ? `${formatBytes(used)} of ${formatBytes(total)}` : `${formatBytes(total)} included`}
        </span>
      </div>
      <div
        className="st-bar"
        role="progressbar"
        aria-label={`${label} in use`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={known ? percent : undefined}
      >
        <span style={{ width: known ? `${Math.max(ratio > 0 ? 2 : 0, percent)}%` : "0%" }} data-high={ratio >= 0.85 ? "" : undefined} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Billing */

function BillingPage() {
  const user = usePlatformStore((state) => state.user);
  const paid = usePlanView().status === "active";
  return (
    <>
      <PageHeader
        title="Billing"
        sub={
          paid
            ? "Your plan is paid and active. Pricing was agreed with you directly, and billing questions go straight to support."
            : "Your first 30 days are free. After that, pricing is agreed with you directly, matched to what you already pay for hosting."
        }
      />

      <Card title="Summary">
        <Row label="Plan">
          <PlanLabel />
        </Row>
        <Row label="Billing email" hint="Where we reach you about billing.">
          {user?.email ? user.email : <span className="st-skeleton" aria-label="Loading" />}
        </Row>
        <Row label="Payment method">
          <span className="st-muted">{paid ? "Arranged with support" : "None on file"}</span>
        </Row>
      </Card>

      <Card title="Support" description="Pricing, invoices, or moving from another host.">
        <ContactStrip
          title="Talk to a person, 24/7"
          body="Write to us about anything billing related and the Runex team replies."
          subject="Runex billing"
          email={user?.email}
        />
      </Card>

      <Card title="Invoices">
        <Empty
          icon={<FileText size={18} strokeWidth={1.6} aria-hidden />}
          title="No invoices yet"
          body="When billing starts, every invoice is listed here."
        />
      </Card>
    </>
  );
}

/* ------------------------------------------------------------------- Pieces */

function PageHeader({ title, sub, children }: { title: string; sub?: string; children?: ReactNode }) {
  return (
    <header className="st-head">
      <div className="min-w-0">
        <h1 className="st-title">{title}</h1>
        {sub ? <p className="st-sub">{sub}</p> : null}
        {children ? <div className="st-head-meta">{children}</div> : null}
      </div>
    </header>
  );
}

function Card({
  title,
  description,
  meta,
  children,
}: {
  title: string;
  description?: string;
  meta?: string;
  children: ReactNode;
}) {
  return (
    <section className="st-group">
      <header className="st-group-head">
        <div className="min-w-0">
          <h2 className="st-group-title">{title}</h2>
          {description ? <p className="st-group-desc">{description}</p> : null}
        </div>
        {meta ? <span className="st-group-meta">{meta}</span> : null}
      </header>
      <div className="st-card">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="st-row">
      <div className="st-row-label">
        <span>{label}</span>
        {hint ? <span className="st-row-hint">{hint}</span> : null}
      </div>
      <div className="st-row-value">{children}</div>
    </div>
  );
}

function Empty({ icon, title, body }: { icon: ReactNode; title: string; body: string }) {
  return (
    <div className="st-blank">
      <span className="st-blank-icon">{icon}</span>
      <div className="min-w-0">
        <p className="st-strong">{title}</p>
        <p className="st-muted mt-0.5">{body}</p>
      </div>
    </div>
  );
}

function ContactStrip({
  title,
  body,
  subject,
  email,
}: {
  title: string;
  body: string;
  subject: string;
  email?: string | null;
}) {
  return (
    <div className="st-contact">
      <div className="min-w-0">
        <p className="st-strong">{title}</p>
        <p className="st-muted mt-0.5">{body}</p>
        <p className="st-contact-mail">{SUPPORT_EMAIL}</p>
      </div>
      <a className="st-btn st-btn-primary" href={supportHref(subject, email)}>
        Contact support
      </a>
    </div>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );
  return (
    <button
      type="button"
      className="st-btn st-btn-icon"
      aria-label={copied ? "Copied" : "Copy account ID"}
      onClick={() => {
        void navigator.clipboard?.writeText(value).then(
          () => {
            setCopied(true);
            if (timer.current) window.clearTimeout(timer.current);
            timer.current = window.setTimeout(() => setCopied(false), 1600);
          },
          () => undefined,
        );
      }}
    >
      {copied ? <Check size={14} strokeWidth={2} aria-hidden /> : <Copy size={14} strokeWidth={1.75} aria-hidden />}
      <span>{copied ? "Copied" : "Copy"}</span>
    </button>
  );
}

function AccountPending() {
  return (
    <>
      <header className="st-head st-head-profile" aria-busy>
        <span className="st-skeleton st-skeleton-avatar" />
        <div className="flex min-w-0 flex-col gap-2.5">
          <span className="st-skeleton h-5 w-44" />
          <span className="st-skeleton w-60" />
        </div>
      </header>
      <section className="st-group" aria-busy>
        <div className="st-card">
          <div className="st-pad flex flex-col gap-3 pt-5">
            <span className="st-skeleton w-1/3" />
            <span className="st-skeleton w-2/3" />
            <span className="st-skeleton w-1/2" />
          </div>
        </div>
      </section>
    </>
  );
}

function GoogleMark() {
  return (
    <svg width="13" height="13" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z" />
      <path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
    </svg>
  );
}

function joined(iso: string) {
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
