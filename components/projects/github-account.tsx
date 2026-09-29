"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ExternalLink, Plus } from "lucide-react";
import { GithubMark } from "@/components/icons/github-mark";
import { chromeItem, chromePanel } from "@/lib/chrome";
import { cn } from "@/lib/cn";
import type { GitHubInstallation } from "@/lib/api";
import { MenuSelect } from "@/components/ui/menu-select";

export function installLabel(item: GitHubInstallation) {
  return item.account || `Installation ${item.id}`;
}

/**
 * GitHub's configure URL for this App installation.
 *
 * `/apps/{slug}/installations` 404s. The working pages are the App's
 * installation configure route, or the user/org settings page for that id.
 */
export function githubManageHref(
  slug?: string | null,
  installation?: Pick<GitHubInstallation, "id" | "account" | "type"> | null,
) {
  const app = slug?.trim();
  const id = installation?.id;
  if (app && id) {
    return `https://github.com/apps/${encodeURIComponent(app)}/installations/${id}`;
  }
  const account = installation?.account?.trim();
  if (id && installation?.type === "Organization" && account) {
    return `https://github.com/organizations/${encodeURIComponent(account)}/settings/installations/${id}`;
  }
  if (id) {
    return `https://github.com/settings/installations/${id}`;
  }
  if (app) {
    return `https://github.com/apps/${encodeURIComponent(app)}`;
  }
  return "https://github.com/settings/installations";
}

export function openGitHubHref(href: string) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener noreferrer";
  a.referrerPolicy = "no-referrer";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function GitHubAccountBar({
  installations,
  installationId,
  appSlug,
  onInstallChange,
  onAdd,
  locked = false,
  manageHost,
}: {
  installations: GitHubInstallation[];
  installationId?: number;
  appSlug?: string | null;
  onInstallChange?: (id: number) => void;
  onAdd: () => void;
  locked?: boolean;
  manageHost?: HTMLElement | null;
}) {
  const current = installations.find((item) => item.id === installationId) ?? installations[0];
  const canSwitch = !locked && installations.length > 1 && Boolean(onInstallChange);
  const manageHref = githubManageHref(appSlug, current);
  const docked = manageHost !== undefined;
  const manage = <ManageMenu compact onAdd={onAdd} manageHref={manageHref} />;

  return (
    <div className="flex h-7 items-center gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <GithubMark size={14} className="shrink-0 text-fg/45" />
        {canSwitch ? (
          <MenuSelect
            compact
            bare
            ariaLabel="GitHub account"
            value={String(installationId ?? current?.id ?? "")}
            options={installations.map((item) => ({
              value: String(item.id),
              label: installLabel(item),
              hint: item.type === "Organization" ? "Org" : "Personal",
            }))}
            onChange={(next) => onInstallChange?.(Number(next))}
          />
        ) : (
          <p className="min-w-0 max-w-[11rem] truncate text-[13px] leading-none tracking-tight text-fg">
            {current ? installLabel(current) : "Not connected"}
          </p>
        )}
      </div>
      <div className="ml-auto flex h-7 shrink-0 items-center">
        {docked ? (manageHost ? createPortal(manage, manageHost) : null) : manage}
      </div>
    </div>
  );
}

function ManageMenu({
  onAdd,
  manageHref,
  compact = false,
}: {
  onAdd: () => void;
  manageHref: string;
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  function place() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setBox({
      top: rect.bottom + 6,
      right: window.innerWidth - rect.right,
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setOpen(false);
    }
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex h-7 cursor-pointer items-center rounded-md px-2 text-[12px] font-medium leading-none tracking-tight transition-colors duration-150 ease-out",
          "text-fg/55 hover:bg-fg/[0.06] hover:text-fg",
          open && "bg-fg/[0.06] text-fg",
        )}
      >
        Manage
      </button>
      {open && box && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label="GitHub"
              style={{ position: "fixed", top: box.top, right: box.right, zIndex: 96 }}
              className={cn(chromePanel, "flex w-[15rem] flex-col gap-1 p-1.5")}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onAdd();
                }}
                className={chromeItem}
              >
                <Plus size={14} strokeWidth={1.75} className="shrink-0 text-fg/40" />
                Add another GitHub
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  openGitHubHref(manageHref);
                }}
                className={chromeItem}
              >
                <ExternalLink size={14} strokeWidth={1.75} className="shrink-0 text-fg/40" />
                Manage on GitHub
              </button>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
