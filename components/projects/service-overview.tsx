"use client";

import { type ReactNode } from "react";
import { ExternalLink, Play } from "lucide-react";
import type { Language, ServiceNode, StackItem } from "@/lib/api";
import type { DeployTab } from "@/components/projects/deploy-dialog";
import { FirstRunSource } from "@/components/projects/first-run-source";
import { useElapsedNow } from "@/hooks/use-elapsed-now";
import { isDatabaseNode, isEmptySlot, localServiceURL, servicePublicUrl, statusTone } from "@/lib/projects";
import { liveDeployClock } from "@/lib/relative-time";
import {
  formatLanguageShare,
  groupedStack,
  notableLanguages,
  stackColor,
} from "@/lib/stack-display";

export function ServiceOverview({
  projectId,
  node,
  onDeploy,
}: {
  projectId: string;
  node: ServiceNode;
  onDeploySource: (tab?: DeployTab) => void;
  onDeploy?: () => void;
}) {
  const empty = isEmptySlot(node);
  const tone = statusTone(node.status);
  const now = useElapsedNow(!empty && tone.busy);
  const elapsed = !empty ? liveDeployClock(node.status, node.startedAt, now) : "";
  const languages = notableLanguages(node.languages);
  const stack = groupedStack(node.stack);
  const source =
    node.sourceType === "github"
      ? node.sourceRef || "GitHub"
      : node.sourceType === "zip"
        ? node.sourceRef || "Uploaded archive"
        : node.sourceType || "—";

  if (empty) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center px-4 py-6">
        <FirstRunSource
          compact
          projectId={projectId}
          nodeId={node.id}
          onDeployed={() => undefined}
        />
      </div>
    );
  }

  if (isDatabaseNode(node)) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <dl className="flex flex-col px-4 py-1">
          <Row label="Status">
            <span className="inline-flex items-center gap-1.5">
              <span className="size-1.5 rounded-full" style={{ backgroundColor: tone.dot }} />
              {node.status === "building" ? "Starting" : tone.label}
            </span>
          </Row>
          <Row label="Engine">{node.kind === "redis" ? "Redis 7" : "PostgreSQL 16"}</Row>
        </dl>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <dl className="flex flex-col px-4 py-1">
        <Row label="Status">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full" style={{ backgroundColor: tone.dot }} />
            {tone.label}
            {elapsed ? (
              <span className="font-mono text-[12px] font-medium tabular-nums text-[#B45309]">{elapsed}</span>
            ) : null}
          </span>
        </Row>
        <Row label="Source">{source}</Row>
        {node.githubBranch ? <Row label="Branch">{node.githubBranch}</Row> : null}
        {node.sourceType === "github" ? (
          <Row label="Auto deploy">{node.autoDeploy ? "On push" : "Off"}</Row>
        ) : null}
        {node.framework && stack.length === 0 ? <Row label="Runtime">{node.framework}</Row> : null}
        {node.port && !node.url ? <Row label="Port">{String(node.port)}</Row> : null}
        {!node.url && localServiceURL(node) ? (
          <Row label="Local URL">
            <a
              href={localServiceURL(node)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-full items-center gap-1 truncate text-[#1d4ed8] hover:text-[#1e3a8a]"
            >
              <span className="truncate">{localServiceURL(node)}</span>
              <ExternalLink size={11} strokeWidth={1.75} className="shrink-0 opacity-70" />
            </a>
          </Row>
        ) : null}
        {node.url ? (
          <Row label={node.primaryKind === "custom" ? "Primary URL" : "URL"}>
            <span className="flex flex-col items-end gap-0.5">
              <a
                href={servicePublicUrl(node.url)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex max-w-full items-center gap-1 truncate text-[#1d4ed8] hover:text-[#1e3a8a]"
              >
                <span className="truncate">{servicePublicUrl(node.url)}</span>
                <ExternalLink size={11} strokeWidth={1.75} className="shrink-0 opacity-70" />
              </a>
              {node.status !== "running" ? (
                <span className="text-[11px] tracking-tight text-fg/40">
                  Reserved. It starts serving after a successful deploy.
                </span>
              ) : null}
            </span>
          </Row>
        ) : (
          <Row label="URL">
            <span className="text-fg/45">Assigned when this service is deployed.</span>
          </Row>
        )}
      </dl>

      {node.status === "ready" && onDeploy ? (
        <div className="border-t border-fg/[0.06] px-4 py-4">
          <button
            type="button"
            onClick={onDeploy}
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-btn px-3 text-[12px] font-medium tracking-tight text-btn-fg transition-colors duration-150 ease-out hover:bg-brand-hover"
          >
            <Play size={12} strokeWidth={1.9} />
            Deploy
          </button>
          <p className="mt-2 text-[12px] leading-relaxed tracking-tight text-fg/40">
            The codebase is ready. Deploy builds the container and publishes the URL above.
          </p>
        </div>
      ) : null}

      {languages.length > 0 ? (
        <section className="border-t border-fg/[0.06] px-4 py-4">
          <h3 className="text-[11px] font-medium tracking-[0.14em] text-fg/38 uppercase">
            Languages
          </h3>
          <LanguageBar languages={languages} />
          <ul className="mt-3.5 flex flex-col gap-2">
            {languages.map((item) => (
              <li key={item.name} className="flex items-center justify-between gap-3">
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="size-1.5 shrink-0 rounded-full"
                    style={{ backgroundColor: stackColor(item.name, item.color) }}
                  />
                  <span className="truncate text-[12px] tracking-tight text-fg/80">{item.name}</span>
                </span>
                <span className="shrink-0 font-mono text-[11px] tabular-nums text-fg/40">
                  {formatLanguageShare(item.percentage)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {stack.length > 0 ? (
        <section className="border-t border-fg/[0.06] px-4 py-4">
          <h3 className="text-[11px] font-medium tracking-[0.14em] text-fg/38 uppercase">Stack</h3>
          <div className="mt-3.5 flex flex-col gap-3.5">
            {stack.map((group) => (
              <div key={group.kind}>
                <p className="text-[11px] tracking-tight text-fg/35">{group.label}</p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {group.items.map((item) => (
                    <StackChip key={`${group.kind}-${item.name}`} item={item} />
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function LanguageBar({ languages }: { languages: Language[] }) {
  return (
    <div
      role="img"
      aria-label={languages.map((item) => `${item.name} ${formatLanguageShare(item.percentage)}`).join(", ")}
      className="mt-3 flex h-2 overflow-hidden rounded-full bg-fg/[0.06]"
    >
      {languages.map((item) => (
        <span
          key={item.name}
          className="h-full min-w-[2px]"
          style={{
            flexGrow: Math.max(item.percentage, 0.8),
            backgroundColor: stackColor(item.name, item.color),
          }}
        />
      ))}
    </div>
  );
}

function StackChip({ item }: { item: StackItem }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full bg-fg/[0.045] px-2.5 py-1 ring-1 ring-fg/[0.08]">
      <span
        aria-hidden="true"
        className="size-1.5 rounded-full"
        style={{ backgroundColor: stackColor(item.name, item.color) }}
      />
      <span className="text-[12px] tracking-tight text-fg/80">{item.name}</span>
    </li>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-fg/[0.05] py-2.5 last:border-b-0">
      <dt className="shrink-0 text-[12px] tracking-tight text-fg/40">{label}</dt>
      <dd className="min-w-0 text-right text-[12px] tracking-tight text-fg/85">{children}</dd>
    </div>
  );
}
