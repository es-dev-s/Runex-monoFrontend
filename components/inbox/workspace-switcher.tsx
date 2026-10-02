"use client";

import { useWorkspaces, belongsToWorkspace, createWorkspace, selectWorkspace } from "@/lib/workspaces";
import { usePlatformStore } from "@/lib/inbox/store";
import { usePresentedChrome } from "./chrome";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export function WorkspaceSwitcher({ collapsed, sheet = false }: { collapsed: boolean; sheet?: boolean }) {
  const user = usePlatformStore((state) => state.user);
  const setNav = usePlatformStore((state) => state.setNav);
  const { name, openId } = usePresentedChrome();
  const userId = user?.id ?? "";
  const { active, items, ready } = useWorkspaces(userId, name);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [nameError, setNameError] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleId = useId();
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || sheet) return;
    function placePanel() {
      const aside = rootRef.current?.closest("aside");
      const row = rootRef.current?.querySelector("button");
      if (!aside || !row) return;
      const side = aside.getBoundingClientRect();
      const anchor = row.getBoundingClientRect();
      const height = panelRef.current?.offsetHeight ?? 0;
      const top = Math.max(8, Math.min(anchor.top, window.innerHeight - height - 12));
      setPlace({ top, left: Math.round(side.right) + 2 });
    }
    placePanel();
    window.addEventListener("resize", placePanel);
    return () => window.removeEventListener("resize", placePanel);
  }, [open, creating, nameError, items.length, sheet]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (creating) {
          setCreating(false);
          setDraft("");
          return;
        }
        setOpen(false);
      }
    }
    window.addEventListener("pointerdown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [creating, open]);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  useEffect(() => {
    if (!collapsed) return;
    setOpen(false);
  }, [collapsed]);

  function close() {
    setOpen(false);
    setCreating(false);
    setDraft("");
    setNameError("");
  }

  function choose(id: string) {
    if (!userId) return;
    selectWorkspace(userId, id);
    if (openId && !belongsToWorkspace(userId, openId, id)) setNav("projects");
    close();
  }

  function submit() {
    if (!userId) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    const taken = items.some((item) => item.name.toLowerCase() === trimmed.toLowerCase());
    if (taken) {
      setNameError("That workspace already exists.");
      return;
    }
    const id = createWorkspace(userId, trimmed);
    if (!id) return;
    if (openId && !belongsToWorkspace(userId, openId, id)) setNav("projects");
    close();
  }

  const menu = (
    <>
      <h2 id={titleId} className="sr-only">
        Workspaces
      </h2>
      {creating ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className={
            sheet
              ? "flex flex-col gap-2 rounded-xl bg-[#f6f6f6] p-2"
              : "flex h-8 items-center gap-1 rounded-lg bg-[#f6f6f6] pr-1 pl-2.5"
          }
        >
          <input
            ref={inputRef}
            value={draft}
            maxLength={40}
            placeholder="Workspace name"
            aria-label="Workspace name"
            onChange={(event) => {
              setDraft(event.target.value);
              setNameError("");
            }}
            className={
              sheet
                ? "h-11 w-full rounded-lg bg-white px-3 text-base tracking-[-0.011em] text-[#1d1d1f] outline-none placeholder:text-[#aeaeb2]"
                : "h-full min-w-0 flex-1 bg-transparent text-[12.5px] tracking-[-0.011em] text-[#1d1d1f] outline-none placeholder:text-[#aeaeb2]"
            }
          />
          <button
            type="submit"
            disabled={!draft.trim()}
            className={
              sheet
                ? "h-10 rounded-lg bg-[#1d1d1f] text-[14px] font-medium text-white disabled:bg-[#e8e8e8] disabled:text-[#aeaeb2]"
                : "h-6 shrink-0 rounded-md px-2 text-[11px] font-medium text-[#1d1d1f] disabled:text-[#c8c8c8]"
            }
          >
            Create
          </button>
        </form>
      ) : (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setNameError("");
            setCreating(true);
          }}
          className={`flex w-full items-center gap-1.5 rounded-lg border border-black/[0.08] px-2.5 font-medium tracking-[-0.011em] text-[#1d1d1f] transition-colors duration-150 ease-out hover:bg-black/[0.03] ${
            sheet ? "h-10 text-[13px]" : "h-8 text-[12px]"
          }`}
        >
          <Plus size={13} strokeWidth={1.75} absoluteStrokeWidth aria-hidden />
          Create workspace
        </button>
      )}
      {nameError ? (
        <p role="alert" className="px-2 pt-1.5 text-[11px] tracking-tight text-[#b42318]">
          {nameError}
        </p>
      ) : null}

      <ul className="mt-1.5 flex max-h-64 flex-col gap-1 overflow-y-auto" role="listbox" aria-label="Your workspaces">
        {items.map((item) => {
          const selected = item.id === active.id;
          return (
            <li key={item.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(item.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 text-left text-[13px] tracking-[-0.011em] transition-colors duration-150 ease-out ${
                  sheet ? "h-10" : "h-8"
                } ${selected ? "bg-black/[0.04] text-[#1d1d1f]" : "text-[#3a3a3c] hover:bg-black/[0.03]"}`}
              >
                <span className="min-w-0 flex-1 truncate">{item.name}</span>
                {selected ? (
                  <Check size={14} strokeWidth={1.75} absoluteStrokeWidth className="shrink-0 text-[#1d1d1f]" aria-hidden />
                ) : (
                  <span className="size-3.5 shrink-0" aria-hidden />
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );

  return (
    <div ref={rootRef} className="relative mt-3">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={collapsed ? (ready ? active.name : "Workspace") : undefined}
        aria-busy={!ready}
        onClick={() => setOpen((current) => !current)}
        className={`group relative flex h-8 min-w-0 items-center rounded-lg text-left text-[13px] tracking-[-0.011em] text-[#1d1d1f] transition-colors duration-150 ease-out ${
          collapsed ? "w-8" : "w-full"
        } ${open ? "bg-black/[0.05]" : "hover:bg-black/[0.04]"}`}
      >
        {collapsed ? (
          <span className="grid size-8 place-items-center text-[#6e6e73]">
            <ChevronsUpDown size={15} strokeWidth={1.75} absoluteStrokeWidth aria-hidden />
          </span>
        ) : (
          <>
            {ready ? (
              <span className="min-w-0 flex-1 truncate pl-2.5 font-medium">{active.name}</span>
            ) : (
              <span className="ml-2.5 h-3 w-28 rounded-full bg-black/[0.06]" />
            )}
            <span className="grid size-7 shrink-0 place-items-center text-[#8e8e93]">
              <ChevronsUpDown size={14} strokeWidth={1.75} absoluteStrokeWidth aria-hidden />
            </span>
          </>
        )}
        {collapsed && !open ? (
          <span aria-hidden className="pointer-events-none absolute top-1/2 left-full z-30 -translate-y-1/2 pl-2">
            <span className="block h-6 rounded-full border border-black/[0.06] bg-white px-2 text-[12px] leading-6 font-normal tracking-[-0.006em] whitespace-nowrap text-[#3a3a3c] opacity-0 shadow-[0_4px_14px_rgba(0,0,0,0.08)] transition-opacity duration-150 group-hover:opacity-100 group-hover:delay-75 group-focus-visible:opacity-100">
              {ready ? active.name : "Workspace"}
            </span>
          </span>
        ) : null}
      </button>

      {sheet ? (
        <AnimatePresence>
          {open ? (
            <m.div
              ref={panelRef}
              role="dialog"
              aria-labelledby={titleId}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="mt-1.5 w-full rounded-[14px] border border-[#ececec] bg-white p-1.5"
            >
              {menu}
            </m.div>
          ) : null}
        </AnimatePresence>
      ) : typeof document !== "undefined" ? (
        createPortal(
          <AnimatePresence>
            {open ? (
              <m.div
                ref={panelRef}
                role="dialog"
                aria-labelledby={titleId}
                initial={{ opacity: 0 }}
                animate={{ opacity: place ? 1 : 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
                style={{ top: place?.top ?? 0, left: place?.left ?? -9999 }}
                className="fixed z-50 w-[232px] rounded-[14px] border border-[#ececec] bg-white p-1.5 shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35),0_0_0_1px_rgba(0,0,0,0.02)]"
              >
                {menu}
              </m.div>
            ) : null}
          </AnimatePresence>,
          document.body,
        )
      ) : null}
    </div>
  );
}
