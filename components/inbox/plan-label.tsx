"use client";

import { usePlanView } from "@/lib/use-plan";

/**
 * The quiet plan caption shared by the sidebar, the account menu, and settings.
 * "pill" adds a hairline capsule for hero placements; "caption" is text only.
 * "short" trims the wording for the narrow sidebar.
 */
export function PlanLabel({
  variant = "caption",
  short = false,
  className = "",
}: {
  variant?: "caption" | "pill";
  short?: boolean;
  className?: string;
}) {
  const view = usePlanView();
  return (
    <span className={`plan-label is-${view.tone} ${variant === "pill" ? "is-pill" : ""} ${className}`}>
      <span className="plan-label-dot" aria-hidden />
      <span className="plan-label-text">{short ? view.short : view.label}</span>
    </span>
  );
}
