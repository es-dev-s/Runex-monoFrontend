/**
 * Typed wrappers for every backend route the dashboard uses.
 *
 * Keeping the whole surface in one module means the wire contract is described
 * in exactly one place: components never build URLs or guess payload shapes.
 */

import { ApiError, request, streamURL } from "./client";
import type {
  ActivityStats,
  Deployment,
  EnvVar,
  GitHubBranch,
  GitHubRepo,
  GitHubStatus,
  LogLine,
  Project,
  ProjectWithNodes,
  ServiceNode,
  User,
  DatabaseOverview,
  DatabaseTable,
  DatabaseRowPage,
  RedisKeyPage,
  RedisKeyValue,
  UsageSnapshot,
  SecretsBundle,
  SecretGroupRecord,
  SecretItemRecord,
  CustomDomainList,
  AdminAccount,
} from "./types";

export * from "./types";
export { ApiError, NetworkError, API_BASE_URL, streamURL, humanizeHttpBody, looksLikeMarkup } from "./client";

const projectPath = (id: string) => `/v1/projects/${encodeURIComponent(id)}`;
const nodePath = (projectId: string, nodeId: string) =>
  `${projectPath(projectId)}/nodes/${encodeURIComponent(nodeId)}`;

/** Response shape shared by every deploy/stage endpoint. */
export type DeployResult = {
  project: Project;
  node: ServiceNode;
  status: string;
};

export type NodeDeleteResult = {
  deleted: boolean;
  projectDeleted?: boolean;
  projectId?: string;
};

export const auth = {
  me: (signal?: AbortSignal) =>
    request<{ user: User }>("/v1/auth/me", { signal }).then((r) => r.user),

  register: (input: { username: string; email: string; password: string }) =>
    request<{ user: User }>("/v1/auth/register", { method: "POST", body: input }).then(
      (r) => r.user,
    ),

  /** `login` accepts either a username or an email. */
  login: (input: { login: string; password: string }) =>
    request<{ user: User }>("/v1/auth/login", { method: "POST", body: input }).then((r) => r.user),

  logout: () => request<void>("/v1/auth/logout", { method: "POST" }),
};

export const admin = {
  users: (signal?: AbortSignal) =>
    request<{ users: AdminAccount[] }>("/v1/admin/users", { signal }).then((r) => r.users ?? []),

  revoke: (id: string) =>
    request<{ user: AdminAccount }>(`/v1/admin/users/${encodeURIComponent(id)}/revoke`, {
      method: "POST",
    }).then((r) => r.user),

  restore: (id: string) =>
    request<{ user: AdminAccount }>(`/v1/admin/users/${encodeURIComponent(id)}/restore`, {
      method: "POST",
    }).then((r) => r.user),
};

export const projects = {
  list: (signal?: AbortSignal) =>
    request<{ projects: ProjectWithNodes[] }>("/v1/projects", { signal }).then(
      (r) => r.projects ?? [],
    ),

  get: (id: string, signal?: AbortSignal) =>
    request<{ project: Project; nodes: ServiceNode[] }>(projectPath(id), { signal }),

  create: (input: { name: string; subtitle?: string }) =>
    request<{ project: Project; nodes: ServiceNode[] }>("/v1/projects", {
      method: "POST",
      body: input,
    }),

  ensureEnvironment: (id: string, environment: "production" | "staging", signal?: AbortSignal) =>
    request<{ project: Project; nodes: ServiceNode[] }>(`${projectPath(id)}/environments`, {
      method: "POST",
      body: { environment },
      signal,
    }),

  remove: (id: string) =>
    request<void>(projectPath(id), { method: "DELETE" }).catch((cause) => {
      if (cause instanceof ApiError && cause.isNotFound) return;
      throw cause;
    }),

  bulkRemove: (ids: string[]) =>
    request<{ deleted: string[]; failed: { id: string; error: string }[] }>(
      "/v1/projects/bulk-delete",
      { method: "POST", body: { ids } },
    ),

  /** Omitting `nodeId` stops or starts every service in the project. */
  stop: (id: string, nodeId?: string) =>
    request<Project>(`${projectPath(id)}/stop`, { method: "POST", query: { nodeId } }),

  start: (id: string, nodeId?: string) =>
    request<Project>(`${projectPath(id)}/start`, { method: "POST", query: { nodeId } }),

  nodes: (id: string, signal?: AbortSignal) =>
    request<{ nodes: ServiceNode[] }>(`${projectPath(id)}/nodes`, { signal }).then(
      (r) => r.nodes ?? [],
    ),

  addNode: (
    id: string,
    input: { kind: ServiceNode["kind"]; title?: string; caption?: string; x?: number; y?: number },
  ) => request<ServiceNode>(`${projectPath(id)}/nodes`, { method: "POST", body: input }),

  updateNode: (
    projectId: string,
    nodeId: string,
    input: { x?: number; y?: number; autoDeploy?: boolean; githubBranch?: string; memoryMb?: number; diskMb?: number },
    signal?: AbortSignal,
  ) => request<ServiceNode>(nodePath(projectId, nodeId), { method: "PATCH", body: input, signal }),

  removeNode: (projectId: string, nodeId: string) =>
    request<{ deleted?: boolean; projectDeleted?: boolean; projectId?: string } | void>(
      nodePath(projectId, nodeId),
      { method: "DELETE" },
    )
      .then((r) => ({
        deleted: true as const,
        projectDeleted: Boolean(r && r.projectDeleted),
        projectId: r?.projectId,
      }))
      .catch((cause) => {
        if (cause instanceof ApiError && cause.isNotFound) {
          return { deleted: true as const, projectDeleted: false };
        }
        throw cause;
      }),

  deployNode: (
    projectId: string,
    nodeId: string,
    trigger: "manual" | "settings" | "github" = "manual",
    reuseSource = false,
  ) =>
    request<DeployResult>(`${nodePath(projectId, nodeId)}/deploy`, {
      method: "POST",
      body: { trigger, ...(reuseSource ? { reuseSource: true } : {}) },
    }),

  cancelDeploy: (projectId: string, nodeId: string) =>
    request<DeployResult>(`${nodePath(projectId, nodeId)}/cancel`, { method: "POST" }),

  database: (projectId: string, nodeId: string, signal?: AbortSignal) =>
    request<DatabaseOverview>(`${nodePath(projectId, nodeId)}/database`, { signal }),

  databaseTables: (projectId: string, nodeId: string, signal?: AbortSignal) =>
    request<{ tables: DatabaseTable[] }>(`${nodePath(projectId, nodeId)}/database/tables`, { signal }).then(
      (r) => r.tables ?? [],
    ),

  databaseRows: (
    projectId: string,
    nodeId: string,
    input: { table: string; schema?: string; limit?: number; offset?: number; sort?: string; q?: string; after?: string },
    signal?: AbortSignal,
  ) =>
    request<DatabaseRowPage>(`${nodePath(projectId, nodeId)}/database/rows`, {
      query: input,
      signal,
    }),

  databaseKeys: (
    projectId: string,
    nodeId: string,
    input: { match?: string; cursor?: number; limit?: number } = {},
    signal?: AbortSignal,
  ) =>
    request<RedisKeyPage>(`${nodePath(projectId, nodeId)}/database/keys`, {
      query: input,
      signal,
    }),

  databaseKey: (projectId: string, nodeId: string, name: string, signal?: AbortSignal) =>
    request<RedisKeyValue>(`${nodePath(projectId, nodeId)}/database/key`, {
      query: { name },
      signal,
    }),

  logs: (id: string, opts: { node?: string; deployment?: string } = {}, signal?: AbortSignal) =>
    request<{ logs: LogLine[] }>(`${projectPath(id)}/logs`, {
      query: { node: opts.node, deployment: opts.deployment },
      signal,
    }).then((r) => r.logs ?? []),

  eventsURL: (id: string) => streamURL(id),
};

export const deploy = {
  /** Stages an uploaded archive. Call `projects.deployNode` afterwards to build it. */
  zip: (projectId: string, file: File, nodeId?: string) => {
    const form = new FormData();
    form.set("file", file);
    if (nodeId) form.set("nodeId", nodeId);
    return request<DeployResult>(`${projectPath(projectId)}/deploy/zip`, { method: "POST", form });
  },

  html: (projectId: string, file: File, nodeId?: string) => {
    const form = new FormData();
    form.set("file", file);
    if (nodeId) form.set("nodeId", nodeId);
    return request<DeployResult>(`${projectPath(projectId)}/deploy/html`, { method: "POST", form });
  },

  github: (
    projectId: string,
    input: {
      repo: string;
      branch?: string;
      sha?: string;
      nodeId?: string;
      installationId?: number;
      autoDeploy?: boolean;
    },
  ) => request<DeployResult>(`${projectPath(projectId)}/deploy/github`, { method: "POST", body: input }),
};

export const variables = {
  list: (projectId: string, node?: string, signal?: AbortSignal) =>
    request<{ variables: EnvVar[] }>(`${projectPath(projectId)}/variables`, {
      query: { node },
      signal,
    }).then((r) => r.variables ?? []),

  upsert: (projectId: string, input: { key: string; value: string }, node?: string) =>
    request<{ variables: EnvVar[] }>(`${projectPath(projectId)}/variables`, {
      method: "POST",
      body: input,
      query: { node },
    }).then((r) => r.variables ?? []),

  /** `raw` accepts pasted .env contents and takes precedence over `variables`. */
  replace: (
    projectId: string,
    input: { variables?: { key: string; value: string }[]; raw?: string; merge?: boolean },
    node?: string,
  ) =>
    request<{ variables: EnvVar[]; added?: number; updated?: number; skipped?: number }>(
      `${projectPath(projectId)}/variables`,
      {
        method: "PUT",
        body: input,
        query: { node },
      },
    ),

  /** Parse a pasted .env and upsert user keys without deleting the rest. */
  importRaw: (projectId: string, raw: string, node?: string) =>
    request<{ variables: EnvVar[]; added?: number; updated?: number; skipped?: number }>(
      `${projectPath(projectId)}/variables/import`,
      { method: "POST", body: { raw }, query: { node } },
    ).then((r) => r.variables ?? []),

  remove: (projectId: string, varId: string) =>
    request<void>(`${projectPath(projectId)}/variables/${encodeURIComponent(varId)}`, {
      method: "DELETE",
    }),

  /** Restarts the service so new values take effect. */
  apply: (projectId: string, node?: string) =>
    request<Project>(`${projectPath(projectId)}/variables/apply`, {
      method: "POST",
      query: { node },
    }),
};

export const github = {
  status: (signal?: AbortSignal) => request<GitHubStatus>("/v1/github/status", { signal }),

  /** Returns the GitHub App install URL to send the user to. */
  installURL: (returnTo?: string) =>
    request<{ url: string }>("/v1/github/install", { query: { return: returnTo } }).then(
      (r) => r.url,
    ),

  /** Links a fresh installation after the user returns from GitHub. */
  complete: (installationId?: number) =>
    request<GitHubStatus>("/v1/github/complete", {
      method: "POST",
      query: { installationId },
    }),

  disconnect: (installationId: number) =>
    request<GitHubStatus>(`/v1/github/installations/${encodeURIComponent(String(installationId))}`, {
      method: "DELETE",
    }),

  repos: (installationId?: number, signal?: AbortSignal) =>
    request<{ installationId: number; repos: GitHubRepo[] }>("/v1/github/repos", {
      query: { installationId },
      signal,
    }),

  branches: (owner: string, repo: string, installationId?: number, signal?: AbortSignal) =>
    request<{ defaultBranch: string; branches: GitHubBranch[] }>(
      `/v1/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches`,
      { query: { installationId }, signal },
    ),
};

export const activity = {
  get: (project?: string, signal?: AbortSignal) =>
    request<{ projects: ActivityStats[]; events: Deployment[] }>("/v1/activity", {
      query: { project },
      signal,
    }),

  /** Deploys from the last hour. Does not include log bodies. */
  hour: (signal?: AbortSignal) =>
    request<{ events: Deployment[] }>("/v1/activity", {
      query: { window: "hour" },
      signal,
    }).then((r) => r.events ?? []),

  /** Last hour of one deployment. Not a live stream. */
  logs: (deploymentId: string, signal?: AbortSignal) =>
    request<{ logs: LogLine[] }>("/v1/activity/logs", {
      query: { deployment: deploymentId },
      signal,
    }).then((r) => r.logs ?? []),
};

export const usage = {
  workspace: (project?: string, signal?: AbortSignal) =>
    request<UsageSnapshot>("/v1/usage", { query: { project }, signal }),

  project: (id: string, signal?: AbortSignal) =>
    request<UsageSnapshot>(`${projectPath(id)}/usage`, { signal }),
};

export const secrets = {
  bundle: (signal?: AbortSignal) => request<SecretsBundle>("/v1/secrets", { signal }),

  putVault: (input: {
    kdf: string;
    kdfIters: number;
    salt: string;
    wrapIv: string;
    wrappedDek: string;
  }) => request<{ ok: boolean; created: boolean }>("/v1/secrets/vault", { method: "PUT", body: input }),

  attach: (dek: string) =>
    request<{ ok: boolean; unlock: "session" }>("/v1/secrets/vault/attach", { method: "POST", body: { dek } }),

  createGroup: (input: { nameIv: string; nameCt: string }) =>
    request<{ group: SecretGroupRecord }>("/v1/secrets/groups", { method: "POST", body: input }),

  renameGroup: (id: string, input: { nameIv: string; nameCt: string }) =>
    request<{ ok: boolean }>(`/v1/secrets/groups/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
    }),

  removeGroup: (id: string) =>
    request<void>(`/v1/secrets/groups/${encodeURIComponent(id)}`, { method: "DELETE" }),

  createItems: (items: { groupId?: string; bodyIv: string; bodyCt: string }[]) =>
    request<{ items: SecretItemRecord[] }>("/v1/secrets/items", { method: "POST", body: { items } }),

  updateItem: (id: string, input: { groupId?: string; bodyIv: string; bodyCt: string }) =>
    request<{ ok: boolean }>(`/v1/secrets/items/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: input,
    }),

  removeItem: (id: string) =>
    request<void>(`/v1/secrets/items/${encodeURIComponent(id)}`, { method: "DELETE" }),
};

function asDomainList(r?: CustomDomainList | null): CustomDomainList {
  if (!r) return {};
  return {
    domains: r.domains,
    domain: r.domain,
    primaryUrl: r.primaryUrl,
    primaryKind: r.primaryKind,
    platformUrl: r.platformUrl,
    platformUrlEnabled: r.platformUrlEnabled,
    cnameTarget: r.cnameTarget,
  };
}

export const domains = {
  list: (projectId: string, nodeId: string, signal?: AbortSignal) =>
    request<CustomDomainList>(`${nodePath(projectId, nodeId)}/domains`, { signal }).then(asDomainList),

  add: (projectId: string, nodeId: string, hostname: string) =>
    request<CustomDomainList>(`${nodePath(projectId, nodeId)}/domains`, {
      method: "POST",
      body: { hostname },
    }).then(asDomainList),

  verify: (projectId: string, nodeId: string, domainId: string) =>
    request<CustomDomainList>(
      `${nodePath(projectId, nodeId)}/domains/${encodeURIComponent(domainId)}/verify`,
      { method: "POST" },
    ).then(asDomainList),

  remove: (projectId: string, nodeId: string, domainId: string) =>
    request<CustomDomainList>(`${nodePath(projectId, nodeId)}/domains/${encodeURIComponent(domainId)}`, {
      method: "DELETE",
    }).then(asDomainList),

  enablePlatform: (projectId: string, nodeId: string) =>
    request<CustomDomainList>(`${nodePath(projectId, nodeId)}/platform-url`, {
      method: "POST",
    }).then(asDomainList),

  revokePlatform: (projectId: string, nodeId: string) =>
    request<CustomDomainList>(`${nodePath(projectId, nodeId)}/platform-url`, {
      method: "DELETE",
    }).then(asDomainList),
};
