"use client";

import { usePresentedChrome } from "@/components/inbox/chrome";
import { statusColor, statusLabel } from "@/lib/inbox/present";
import type { Service, ServiceStatus } from "@/lib/inbox/schema";
import { usePlatformStore } from "@/lib/inbox/store";
import { LayoutGrid, List, Menu, SquareCheck, Trash2 } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import type { ServiceNode } from "@/lib/api";
import { faceNodes, type BootNode } from "@/lib/boot";
import { CheckIcon } from "./icons";
import { ProjectCanvasFace } from "./project-canvas-card";

function toneFor(status: ServiceStatus) {
  return { color: statusColor(status), label: statusLabel(status) };
}

export function ServiceList({
  services,
  faces,
  label,
  banner,
}: {
  services: Service[];
  faces?: Record<string, BootNode[]>;
  label: string;
  banner?: ReactNode;
}) {
  const selectedIds = usePlatformStore((state) => state.selectedIds);
  const removeProjects = usePlatformStore((state) => state.removeProjects);
  const removing = usePlatformStore((state) => state.removing);
  const toggleSelected = usePlatformStore((state) => state.toggleSelected);
  const toggleAll = usePlatformStore((state) => state.toggleAll);
  const clearSelected = usePlatformStore((state) => state.clearSelected);
  const openProject = usePlatformStore((state) => state.openProject);
  const freshId = usePlatformStore((state) => state.freshId);
  const freshRow = useRef<HTMLLIElement>(null);
  const view = usePresentedChrome().listView;
  const setListView = usePlatformStore((state) => state.setListView);
  const [selecting, setSelecting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!freshId) return;
    freshRow.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    const timer = window.setTimeout(() => {
      usePlatformStore.setState({ freshId: null });
    }, 1400);
    return () => window.clearTimeout(timer);
  }, [freshId]);

  const ids = services.map((service) => service.id);
  const selectedCount = ids.filter((id) => selectedIds.includes(id)).length;

  function toggleSelecting() {
    if (selecting) clearSelected();
    setConfirmDelete(false);
    setSelecting((current) => !current);
  }

  function openService(event: ReactMouseEvent | ReactKeyboardEvent, id: string) {
    const naming = (event.target as HTMLElement).closest("[data-rename]");
    if (selecting) {
      if (naming) return;
      toggleSelected(id);
      return;
    }
    if (naming) return;
    openProject(id);
  }

  function confirmRemove() {
    const projectIds = ids.filter((id) => selectedIds.includes(id) && !id.startsWith("deploy:"));
    void removeProjects(projectIds).then((problem) => {
      if (problem) return;
      setConfirmDelete(false);
      setSelecting(false);
    });
  }

  const toolbar = (
    <ProjectToolbar
      view={view}
      selecting={selecting}
      selectedCount={selectedCount}
      ids={ids}
      selectedIds={selectedIds}
      confirmDelete={confirmDelete}
      removing={removing}
      overlay={Boolean(banner)}
      onToggleAll={() => toggleAll(ids)}
      onSelect={toggleSelecting}
      onView={(next) => {
        setConfirmDelete(false);
        setListView(next);
      }}
      onAskDelete={() => setConfirmDelete(true)}
      onCancelDelete={() => setConfirmDelete(false)}
      onConfirmDelete={confirmRemove}
    />
  );

  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[16px] border border-[#ececec] bg-white">
      {banner ? (
        <div className="relative z-20 -mb-px shrink-0">
          {banner}
          <div className="absolute inset-x-0 top-0 z-30 flex items-start justify-end p-3">{toolbar}</div>
        </div>
      ) : (
        <div className="flex h-12 shrink-0 items-center justify-between px-3.5">
          <p className="text-[13px] font-medium text-[#6a6a6a]">{label}</p>
          {toolbar}
        </div>
      )}

      {services.length === 0 ? (
        <p className="border-t border-[#f2f2f2] px-4 py-10 text-center text-sm text-[#8e8e8e]">
          Nothing in {label.toLowerCase()} yet.
        </p>
      ) : view === "grid" ? (
        <ul className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 content-start gap-4 overflow-y-auto p-3 sm:grid-cols-2 xl:grid-cols-3">
          {services.map((service) => {
            const selected = selectedIds.includes(service.id);
            const fresh = freshId === service.id;
            return (
              <li key={service.id} ref={fresh ? freshRow : undefined}>
                <ServiceSurface
                  service={service}
                  faces={faces}
                  selected={selected}
                  selecting={selecting}
                  fresh={fresh}
                  layout="grid"
                  onOpen={(event) => openService(event, service.id)}
                  onName={() => {
                    if (selecting) {
                      toggleSelected(service.id);
                      return;
                    }
                    openProject(service.id);
                  }}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 py-2">
          {services.map((service) => {
            const selected = selectedIds.includes(service.id);
            const fresh = freshId === service.id;
            return (
              <li key={service.id} ref={fresh ? freshRow : undefined}>
                <ServiceSurface
                  service={service}
                  faces={faces}
                  selected={selected}
                  selecting={selecting}
                  fresh={fresh}
                  layout="list"
                  onOpen={(event) => openService(event, service.id)}
                  onName={() => {
                    if (selecting) {
                      toggleSelected(service.id);
                      return;
                    }
                    openProject(service.id);
                  }}
                />
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function preferFace(live: ServiceNode[] | undefined, remembered: ServiceNode[] | undefined) {
  if (live) return live;
  return remembered ?? [];
}

function projectNodes(
  projects: { id: string; nodes?: ServiceNode[] }[],
  service: Service,
): ServiceNode[] | undefined {
  if (service.id.startsWith("deploy:")) return undefined;
  const project = projects.find((item) => item.id === service.projectId);
  if (!project || !Array.isArray(project.nodes)) return undefined;
  return project.nodes;
}

function ServiceSurface({
  service,
  faces,
  selected,
  selecting,
  fresh,
  layout,
  onOpen,
  onName,
}: {
  service: Service;
  faces?: Record<string, BootNode[]>;
  selected: boolean;
  selecting: boolean;
  fresh: boolean;
  layout: "list" | "grid";
  onOpen: (event: ReactMouseEvent | ReactKeyboardEvent) => void;
  onName: () => void;
}) {
  const tone = toneFor(service.status);
  const liveNodes = usePlatformStore((state) => projectNodes(state.projects, service));
  const saved =
    service.projectId && faces && Object.prototype.hasOwnProperty.call(faces, service.projectId)
      ? faces[service.projectId]
      : undefined;
  const remembered = saved ? faceNodes(service.projectId ?? service.id, saved) : undefined;
  const nodes = preferFace(liveNodes, remembered);
  const surface = fresh
    ? "bg-[#fff8f5]"
    : selected
      ? "bg-[#f2f2f4]"
      : "bg-transparent hover:bg-[#f7f7f8]";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={selecting ? selected : undefined}
      onClick={onOpen}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        if ((event.target as HTMLElement).closest("[data-rename], input")) return;
        event.preventDefault();
        onOpen(event);
      }}
      className={
        layout === "grid"
          ? "relative flex h-full cursor-pointer flex-col overflow-hidden rounded-[16px] border border-black/[0.06] bg-white text-left outline-none"
          : `relative flex w-full cursor-pointer items-center gap-3 rounded-[12px] py-2 pr-9 pl-2.5 text-left outline-none ${surface}`
      }
    >
      {selecting ? (
        <SelectMark on={selected} className="pointer-events-none absolute top-2.5 right-2.5 z-20" />
      ) : null}
      {layout === "grid" ? (
        <>
          <ProjectCanvasFace nodes={nodes} />
          <span
            className={`relative flex min-h-9 min-w-0 items-center justify-between gap-3 px-3 py-2 ${fresh ? "bg-[#fff8f5]" : ""}`}
          >
            <span className="flex min-w-0 items-center gap-2">
              <ServiceName name={service.name} onActivate={onName} />
              <StatusPill color={tone.color} label={tone.label} />
            </span>
            <span className="shrink-0 text-[12px] text-[#8e8e8e]">{service.time}</span>
          </span>
        </>
      ) : (
        <>
          <ProjectCanvasFace nodes={nodes} compact />
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <ServiceName name={service.name} onActivate={onName} />
                <StatusPill color={tone.color} label={tone.label} />
              </span>
              <span className="shrink-0 text-[12px] leading-5 text-[#8e8e8e]">{service.time}</span>
            </span>
            <span className="block truncate text-[13px] leading-5 text-[#86868b]">
              {service.detail}
            </span>
          </span>
        </>
      )}
    </div>
  );
}

function StatusPill({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-[#6f6f6f]">
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

function SelectMark({ on, className = "" }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] border shadow-[0_1px_2px_rgba(0,0,0,0.12)] ${className} ${
        on ? "border-[#161616] bg-[#161616] text-btn-fg" : "border-[#d5d5d5] bg-white"
      }`}
    >
      {on ? <CheckIcon className="h-3.5 w-3.5" /> : null}
    </span>
  );
}

function ViewMenu({
  view,
  selecting,
  overlay = false,
  onSelect,
  onView,
}: {
  view: "list" | "grid";
  selecting: boolean;
  overlay?: boolean;
  onSelect: () => void;
  onView: (view: "list" | "grid") => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label="Project options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`grid h-8 w-8 place-items-center rounded-full transition-colors ${
          overlay
            ? open
              ? "bg-white text-[#1c1c1c] shadow-[0_1px_4px_rgba(0,0,0,0.08)]"
              : "bg-white/75 text-[#3a3a3a] shadow-[0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur-md hover:bg-white"
            : open
              ? "bg-[#f3f3f3] text-[#1c1c1c]"
              : "text-[#8d8d8d] hover:bg-[#f6f6f6] hover:text-[#3a3a3a]"
        }`}
      >
        <Menu size={16} strokeWidth={1.75} absoluteStrokeWidth aria-hidden />
      </button>
      {open ? (
        <div
          role="menu"
          aria-label="Project options"
          className="absolute top-[calc(100%+6px)] right-0 z-40 flex w-44 flex-col gap-1 rounded-[14px] border border-[#ececec] bg-white p-1 shadow-[0_12px_32px_rgba(0,0,0,0.08)]"
        >
          <MenuItem
            icon={SquareCheck}
            label="Select"
            active={selecting}
            onClick={() => {
              onSelect();
              setOpen(false);
            }}
          />
          <MenuItem
            icon={view === "grid" ? List : LayoutGrid}
            label={view === "grid" ? "List view" : "Grid view"}
            active={view === "grid"}
            onClick={() => {
              onView(view === "grid" ? "list" : "grid");
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function MenuItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: typeof SquareCheck;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="menuitemcheckbox"
      aria-checked={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`flex h-9 w-full items-center gap-2 rounded-[10px] px-2.5 text-left text-[13px] font-medium ${
        active ? "bg-[#f4f4f4] text-[#1c1c1c]" : "text-[#2a2a2a] hover:bg-[#f6f6f6]"
      }`}
    >
      <Icon size={15} strokeWidth={1.75} absoluteStrokeWidth className="text-[#6a6a6a]" aria-hidden />
      {label}
    </button>
  );
}

function ServiceName({
  name,
  onActivate,
}: {
  name: string;
  onActivate: () => void;
}) {
  return (
    <span
      onClick={(event) => {
        event.stopPropagation();
        onActivate();
      }}
      className="truncate text-[14px] leading-5 font-medium tracking-[-0.01em] text-[#1c1c1c]"
    >
      {name}
    </span>
  );
}

function ProjectToolbar({
  view,
  selecting,
  selectedCount,
  ids,
  selectedIds,
  confirmDelete,
  removing,
  overlay,
  onToggleAll,
  onSelect,
  onView,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  view: "list" | "grid";
  selecting: boolean;
  selectedCount: number;
  ids: string[];
  selectedIds: string[];
  confirmDelete: boolean;
  removing: boolean;
  overlay: boolean;
  onToggleAll: () => void;
  onSelect: () => void;
  onView: (view: "list" | "grid") => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {selecting ? (
        <SelectAll
          ids={ids}
          label={selectedCount > 0 ? `${selectedCount} selected` : "All"}
          onToggle={onToggleAll}
          selectedIds={selectedIds}
          overlay={overlay}
        />
      ) : null}
      {selecting && selectedCount > 0 ? (
        <DeleteSelected
          count={selectedCount}
          confirming={confirmDelete}
          removing={removing}
          overlay={overlay}
          onAsk={onAskDelete}
          onCancel={onCancelDelete}
          onConfirm={onConfirmDelete}
        />
      ) : null}
      <ViewMenu view={view} selecting={selecting} overlay={overlay} onSelect={onSelect} onView={onView} />
    </div>
  );
}

function DeleteSelected({
  count,
  confirming,
  removing,
  overlay,
  onAsk,
  onCancel,
  onConfirm,
}: {
  count: number;
  confirming: boolean;
  removing: boolean;
  overlay: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Delete ${count} selected`}
        aria-expanded={confirming}
        onMouseDown={(event) => event.preventDefault()}
        onClick={onAsk}
        className={`grid h-8 w-8 place-items-center rounded-full text-[#b42318] ${
          overlay
            ? "bg-white/75 shadow-[0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur-md hover:bg-white"
            : confirming
              ? "bg-[#fff6f5]"
              : "hover:bg-[#fff6f5]"
        }`}
      >
        <Trash2 size={15} strokeWidth={1.75} absoluteStrokeWidth aria-hidden />
      </button>
      {confirming ? (
        <div className="absolute top-[calc(100%+6px)] right-0 z-40 w-56 rounded-[14px] border border-[#ececec] bg-white p-3 shadow-[0_12px_32px_rgba(0,0,0,0.08)]">
          <p className="text-[13px] font-medium tracking-[-0.01em] text-[#1c1c1c]">
            Delete {count} from the control plane?
          </p>
          <div className="mt-3 flex justify-end gap-1.5">
            <button
              type="button"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onCancel}
              className="h-8 rounded-full px-3 text-[12px] font-medium text-[#3a3a3a]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={removing}
              onMouseDown={(event) => event.preventDefault()}
              onClick={onConfirm}
              className="h-8 rounded-full bg-[#b42318] px-3 text-[12px] font-semibold text-white disabled:opacity-40"
            >
              Delete
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SelectAll({
  ids,
  label,
  selectedIds,
  onToggle,
  overlay = false,
}: {
  ids: string[];
  label: string;
  selectedIds: string[];
  onToggle: () => void;
  overlay?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const allSelected = ids.length > 0 && ids.every((id) => selectedIds.includes(id));
  const someSelected = ids.some((id) => selectedIds.includes(id));

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = someSelected && !allSelected;
    }
  }, [someSelected, allSelected]);

  return (
    <label
      className={
        overlay
          ? "flex h-8 items-center gap-2 rounded-full bg-white/75 px-2.5 text-[13px] font-medium text-[#1c1c1c] shadow-[0_1px_3px_rgba(0,0,0,0.06)] backdrop-blur-md"
          : "flex items-center gap-2 text-[13px] font-medium text-[#3a3a3a]"
      }
    >
      <span className="relative grid h-[18px] w-[18px] place-items-center">
        <input
          ref={inputRef}
          type="checkbox"
          checked={allSelected}
          onChange={onToggle}
          aria-label={`Select all in ${label}`}
          className="peer h-[18px] w-[18px] appearance-none rounded-[5px] border border-[#d5d5d5] bg-white checked:border-[#161616] checked:bg-[#161616] indeterminate:border-[#161616] indeterminate:bg-[#161616]"
        />
        <CheckIcon className="pointer-events-none absolute h-3.5 w-3.5 text-white opacity-0 peer-checked:opacity-100" />
        <span className="pointer-events-none absolute h-0.5 w-2 rounded-full bg-white opacity-0 peer-indeterminate:opacity-100" />
      </span>
      {label}
    </label>
  );
}
