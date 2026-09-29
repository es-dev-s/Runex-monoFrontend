"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { ApiError, projects as projectsApi, type ServiceNode } from "@/lib/api";
import { CanvasContextMenu, type CanvasAddAction } from "@/components/projects/canvas-context-menu";
import { DeployDialog, type DeployTab } from "@/components/projects/deploy-dialog";
import { ProjectCanvas } from "@/components/projects/project-canvas";
import { ServicePanel } from "@/components/projects/service-panel";
import { FirstRunSource } from "@/components/projects/first-run-source";
import { SheetScrim, useBottomSheet } from "@/components/ui/bottom-sheet";
import { useInspectorWidth } from "@/hooks/use-inspector-width";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useProjectStream } from "@/hooks/use-project-stream";
import { isDraftId, isEmptySlot, isPlacedNode, needsSource } from "@/lib/projects";
import type { Point } from "@/lib/project-layout";
import { hideNode, showNode, usePlatformStore } from "@/lib/inbox/store";
import { forgetProjectLocal, readSelectedNode, rememberSelectedNode, rememberShell } from "@/lib/remember";

type DeployIntent = { nodeId?: string; tab: DeployTab };

function notify(title: string, detail: string) {
  usePlatformStore.setState((state) => ({
    notices: [
      { id: `canvas-${Date.now()}`, title, detail, time: "now", unread: true },
      ...state.notices,
    ].slice(0, 24),
  }));
}

function isDesktopViewport() {
  return typeof window !== "undefined" && window.matchMedia("(min-width: 768px)").matches;
}

export function ProjectWorkspace({ projectId }: { projectId: string }) {
  const { project, nodes, logs, loading, error, live, reload, noteBuilding, dropNode, restoreNode, upsertNode } =
    useProjectStream(projectId);
  const inspector = useInspectorWidth();
  const isDesktop = useMediaQuery("(min-width: 768px)", true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const pinnedRef = useRef<ServiceNode | null>(null);
  const [deployFor, setDeployFor] = useState<DeployIntent | null>(null);
  const [adding, setAdding] = useState<Partial<Record<"postgresql" | "redis", true>>>({});
  const addingRef = useRef(adding);
  const moves = useRef(new Map<string, AbortController>());
  const [canvasMenu, setCanvasMenu] = useState<{ clientX: number; clientY: number; world: Point } | null>(
    null,
  );

  useLayoutEffect(() => {
    setSelectedId(isDesktopViewport() ? readSelectedNode(projectId) : null);
    pinnedRef.current = null;
    setDeployFor(null);
    setCanvasMenu(null);
  }, [projectId]);

  const liveSelected = useMemo(() => {
    const node = nodes.find((item) => item.id === selectedId) ?? null;
    if (!node || isEmptySlot(node)) return null;
    return node;
  }, [nodes, selectedId]);
  if (liveSelected) pinnedRef.current = liveSelected;
  const pinned = pinnedRef.current;
  const selected = liveSelected ?? (pinned && pinned.id === selectedId ? pinned : null);

  const emptySlot = useMemo(() => nodes.find(isEmptySlot) ?? null, [nodes]);
  const placedNodes = useMemo(() => nodes.filter(isPlacedNode), [nodes]);
  const firstRun = needsSource(nodes);

  const selectNode = useCallback(
    (nodeId: string | null) => {
      setSelectedId(nodeId);
      rememberSelectedNode(projectId, nodeId);
    },
    [projectId],
  );
  const sheet = useBottomSheet(Boolean(selected), () => selectNode(null));

  // Restore the last selected placed service. Never open the empty slot — a
  // new project should ask for a codebase, not show a nameless node.
  const autoSelected = useRef(false);
  useEffect(() => {
    autoSelected.current = false;
  }, [projectId]);
  useEffect(() => {
    if (!isDesktopViewport()) return;
    if (selectedId && placedNodes.some((node) => node.id === selectedId)) {
      autoSelected.current = true;
      return;
    }
    if (autoSelected.current || selectedId || loading || firstRun) return;
    if (placedNodes.length === 0) return;
    autoSelected.current = true;
    const stored = readSelectedNode(projectId);
    const match = stored && placedNodes.some((node) => node.id === stored) ? stored : placedNodes[0].id;
    selectNode(match);
  }, [firstRun, loading, placedNodes, projectId, selectNode, selectedId]);

  const consumedSource = useRef(false);
  useEffect(() => {
    consumedSource.current = false;
  }, [projectId]);
  useEffect(() => {
    if (loading || consumedSource.current) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("source") !== "github") return;
    consumedSource.current = true;
    setDeployFor({ nodeId: firstRun ? emptySlot?.id : undefined, tab: "github" });
    window.history.replaceState({}, "", window.location.pathname);
  }, [emptySlot?.id, firstRun, loading]);

  const lastStatus = useRef(new Map<string, string>());
  useEffect(() => {
    lastStatus.current.clear();
  }, [projectId]);
  useEffect(() => {
    for (const node of nodes) {
      const previous = lastStatus.current.get(node.id);
      lastStatus.current.set(node.id, node.status);
      if (!previous || previous === node.status) continue;

      if (node.status === "running" || node.status === "failed") {
        notify(node.status === "running" ? "Deployment live" : "Build failed", node.title || node.id);
      }
    }
  }, [nodes]);

  const openAddService = useCallback((tab: DeployTab = "upload") => {
    setCanvasMenu(null);
    setDeployFor({ tab });
  }, []);

  const openDeploy = useCallback(
    (tab: DeployTab, nodeId?: string) => {
      setCanvasMenu(null);
      setDeployFor({
        tab,
        nodeId: nodeId ?? (firstRun ? emptySlot?.id : undefined),
      });
    },
    [emptySlot?.id, firstRun],
  );

  const addSidecar = useCallback(
    async (kind: "postgresql" | "redis", at?: Point) => {
      if (addingRef.current[kind]) return;
      if (isDraftId(projectId)) {
        notify("Saving the project", "Postgres and Redis can be added in a moment.");
        return;
      }
      addingRef.current = { ...addingRef.current, [kind]: true };
      setAdding(addingRef.current);
      const tempId = `draft_${kind}_${Date.now().toString(36)}`;
      upsertNode({
        id: tempId,
        projectId,
        kind,
        title: kind === "postgresql" ? "Postgresql" : "Redis",
        caption: "Starting",
        x: at?.x ?? 0,
        y: at?.y ?? 0,
        status: "building",
        startedAt: new Date().toISOString(),
      });
      selectNode(tempId);
      try {
        const node = await projectsApi.addNode(projectId, {
          kind,
          x: at?.x,
          y: at?.y,
        });
        dropNode(tempId);
        upsertNode(node);
        selectNode(node.id);
        void reload();
      } catch (cause) {
        dropNode(tempId);
        selectNode(null);
        notify(
          "Could not attach database",
          cause instanceof ApiError ? cause.message : "Could not attach the database.",
        );
      } finally {
        const next = { ...addingRef.current };
        delete next[kind];
        addingRef.current = next;
        setAdding(next);
      }
    },
    [dropNode, projectId, reload, selectNode, upsertNode],
  );

  const onCanvasAction = useCallback(
    (action: CanvasAddAction) => {
      const at = canvasMenu?.world;
      setCanvasMenu(null);
      if (action === "github" || action === "upload") {
        openAddService(action);
        return;
      }
      void addSidecar(action, at);
    },
    [addSidecar, canvasMenu?.world, openAddService],
  );

  if (loading && !project) {
    return (
      <div
        className="grid h-full place-items-center bg-panel"
        style={{
          backgroundImage:
            "radial-gradient(circle at center, var(--canvas-dot) 1px, transparent 1.15px)",
          backgroundSize: "18px 18px",
        }}
      >
        <Loader2 size={16} strokeWidth={1.75} className="animate-spin text-fg/25" />
        <span className="sr-only">Loading project</span>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="grid h-full place-items-center bg-panel px-6">
        <div className="text-center">
          <p className="text-[14px] font-medium tracking-tight text-fg">
            {error ?? "Project unavailable"}
          </p>
          <button
            type="button"
            onClick={() => usePlatformStore.setState({ openId: null })}
            className="mt-4 inline-flex h-9 cursor-pointer items-center rounded-lg bg-fg/[0.06] px-3.5 text-[13px] tracking-tight text-fg ring-1 ring-fg/[0.08] transition-colors duration-150 ease-out hover:bg-fg/[0.1]"
          >
            Back to projects
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-0 overflow-hidden">
      <div
        className="relative h-full min-h-0 w-full"
        style={{
          ["--harbor-inspector-inset" as string]:
            selected && isDesktop ? `${inspector.width}px` : "0px",
        }}
      >
        {error ? (
          <p
            role="status"
            className="pointer-events-none absolute top-3 left-3 z-10 max-w-sm rounded-lg bg-white/95 px-3 py-2 text-[12px] tracking-tight text-rose-700 shadow-sm ring-1 ring-rose-700/15"
          >
            {error}
          </p>
        ) : null}

        <ProjectCanvas
          projectId={projectId}
          nodes={placedNodes}
          selectedId={selectedId}
          onSelect={(node) => selectNode(node.id)}
          onDeselect={sheet.requestClose}
          onAdd={() => openAddService("upload")}
          onCanvasMenu={setCanvasMenu}
          chromeInsetRight={selected && isDesktop ? inspector.width : 0}
          emptyOverlay={
            firstRun ? (
              <FirstRunSource
                projectId={projectId}
                nodeId={emptySlot?.id}
                onDeploying={(repo) => {
                  if (!emptySlot) return;
                  const name = repo.split("/").pop() || emptySlot.title;
                  upsertNode({
                    ...emptySlot,
                    title: name,
                    status: "building",
                    sourceType: "github",
                    sourceRef: repo,
                    startedAt: new Date().toISOString(),
                  });
                  selectNode(emptySlot.id);
                }}
                onFailed={(message) => {
                  notify("Deploy did not start", message);
                  void reload();
                }}
                onDeployed={(id) => {
                  selectNode(id);
                  noteBuilding(id);
                  void reload();
                }}
              />
            ) : undefined
          }
          onMove={(nodeId, x, y) => {
            moves.current.get(nodeId)?.abort();
            const controller = new AbortController();
            moves.current.set(nodeId, controller);
            void projectsApi.updateNode(projectId, nodeId, { x, y }, controller.signal).catch((cause) => {
              if (controller.signal.aborted) return;
              if (cause instanceof DOMException && cause.name === "AbortError") return;
            });
          }}
        />

        {placedNodes.length > 0 ? (
          <p className="pointer-events-none absolute bottom-3 left-3 z-10 hidden text-[11px] tracking-tight text-fg/28 md:block">
            Right-click to add
          </p>
        ) : null}

        {selected ? (
          <>
            {!isDesktop ? (
              <SheetScrim scrimRef={sheet.scrimRef} onClose={sheet.requestClose} label="Close service details" />
            ) : null}
            <div
              ref={sheet.ref}
              className="harbor-inspector absolute inset-x-0 bottom-0 z-30 flex h-full min-h-0 w-full flex-col overflow-hidden rounded-t-2xl pb-[env(safe-area-inset-bottom)] md:inset-y-0 md:right-0 md:left-auto md:z-20 md:h-auto md:rounded-none md:pb-0"
              style={isDesktop ? { width: inspector.width } : undefined}
            >
              <button
                type="button"
                aria-label="Resize inspector"
                title="Drag to resize"
                onPointerDown={inspector.onPointerDown}
                onPointerMove={inspector.onPointerMove}
                onPointerUp={inspector.onPointerUp}
                onPointerCancel={inspector.onPointerCancel}
                className="group absolute inset-y-0 left-0 z-30 hidden w-3 cursor-col-resize touch-none outline-none md:block"
              >
                <span
                  aria-hidden
                  className="pointer-events-none absolute top-1/2 left-1/2 h-7 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-fg/[0.12] opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-active:bg-fg/25 group-active:opacity-100"
                />
              </button>
              <ServicePanel
                key={selected.id}
                projectId={projectId}
                node={selected}
                logs={logs}
                live={live}
                revealLogs={0}
                onClose={sheet.requestClose}
                onChanged={reload}
                onRemove={() => {
                  const nodeId = selected?.id;
                  if (!nodeId || isDraftId(nodeId)) return;
                  selectNode(null);
                  hideNode(nodeId);
                  dropNode(nodeId);
                  void projectsApi.removeNode(projectId, nodeId).then((result) => {
                    if (!result.projectDeleted) return;
                    forgetProjectLocal(projectId);
                    rememberShell({ openId: null });
                    usePlatformStore.setState({ openId: null });
                    void usePlatformStore.getState().reload();
                  }).catch((cause) => {
                    showNode(nodeId);
                    restoreNode(nodeId);
                    void reload();
                    notify(
                      "Could not remove that node",
                      cause instanceof ApiError ? cause.message : "Could not remove that node.",
                    );
                  });
                }}
                onBuildStart={noteBuilding}
                onDeploySource={(tab) => openDeploy(tab ?? "upload", selected.id)}
              />
            </div>
          </>
        ) : null}
      </div>

      {canvasMenu ? (
        <CanvasContextMenu
          x={canvasMenu.clientX}
          y={canvasMenu.clientY}
          pending={adding}
          onAction={onCanvasAction}
          onClose={() => setCanvasMenu(null)}
        />
      ) : null}

      {deployFor ? (
        <DeployDialog
          key={`${deployFor.tab}:${deployFor.nodeId ?? "new"}`}
          projectId={projectId}
          nodeId={deployFor.nodeId}
          adding={!deployFor.nodeId}
          initialTab={deployFor.tab}
          onClose={() => setDeployFor(null)}
          onDeployFailed={() => {
            void reload();
          }}
          onDeploying={(repo) => {
            const slot = nodes.find((item) => item.id === deployFor.nodeId) ?? emptySlot;
            if (!slot) return;
            const name = repo.split("/").pop() || slot.title;
            upsertNode({
              ...slot,
              title: name,
              status: "building",
              sourceType: "github",
              sourceRef: repo,
              startedAt: new Date().toISOString(),
            });
            selectNode(slot.id);
          }}
          onDeployed={(nodeId) => {
            setSelectedId(nodeId);
            rememberSelectedNode(projectId, nodeId);
            noteBuilding(nodeId);
            void reload();
          }}
        />
      ) : null}
    </div>
  );
}
