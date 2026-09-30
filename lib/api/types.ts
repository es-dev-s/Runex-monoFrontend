/**
 * Mirrors the Go backend's JSON contract exactly.
 *
 * Field names and optionality are taken from the `json:` tags in
 * `backend/internal/store/store.go` and the API layer. Fields tagged
 * `omitempty` in Go are absent from the payload when empty, so they are
 * optional here; pointer fields without `omitempty` arrive as `null`.
 */

export type ProjectStatus = "idle" | "building" | "running" | "failed" | "ready" | "stopped";

/** Backend accepts these as node kinds on POST /v1/projects/{id}/nodes. */
export type NodeKind = "service" | "railway" | "postgresql" | "redis" | "container";

export type DeployPhase = "build" | "containerize" | "start";

export type LogLevel = "info" | "warn" | "error" | "success" | "cmd";

export type VarSource = "user" | "detected" | "platform";

export type Language = {
  name: string;
  percentage: number;
  color?: string;
  bytes?: number;
};

export type StackItem = {
  name: string;
  kind: string;
  color?: string;
};

export type Project = {
  id: string;
  name: string;
  subtitle: string;
  status: ProjectStatus;
  framework?: string | null;
  url?: string | null;
  port?: number | null;
  containerName?: string | null;
  sourceType?: string | null;
  sourceRef?: string | null;
  error?: string | null;
  languages?: Language[];
  stack?: StackItem[];
  environment?: "production" | "staging" | string;
  familyId?: string;
  createdAt: string;
  updatedAt: string;
};

export type ServiceNode = {
  id: string;
  projectId: string;
  kind: NodeKind;
  title: string;
  caption: string;
  x: number;
  y: number;
  status: ProjectStatus;
  containerName?: string | null;
  url?: string | null;
  port?: number | null;
  framework?: string | null;
  sourceType?: string | null;
  sourceRef?: string | null;
  error?: string | null;
  languages?: Language[];
  stack?: StackItem[];
  githubInstallationId?: number | null;
  githubBranch?: string | null;
  /** Go tags this `omitempty` on a bool, so `false` arrives as absent. */
  autoDeploy?: boolean;
  memoryMb?: number;
  diskMb?: number;
  platformUrl?: string | null;
  platformUrlEnabled?: boolean;
  primaryKind?: "custom" | "platform" | string;
  /** Set while a build is in flight (SSE status frames). Not stored on the node row. */
  startedAt?: string | null;
};

/** GET /v1/projects returns projects with their nodes inlined. */
export type ProjectWithNodes = Project & { nodes: ServiceNode[] };

export type Deployment = {
  id: string;
  projectId: string;
  nodeId?: string;
  serviceTitle?: string;
  projectName?: string;
  status: "success" | "failed" | "building" | "cancelled";
  phase: DeployPhase;
  trigger?: string;
  sourceType: string;
  sourceRef?: string | null;
  framework?: string | null;
  url?: string | null;
  port?: number | null;
  error?: string | null;
  createdAt: string;
  finishedAt?: string | null;
};

export type LogLine = {
  id: number;
  projectId: string;
  deploymentId: string;
  nodeId?: string;
  ts: string;
  phase: DeployPhase;
  level: LogLevel;
  text: string;
};

export type EnvVar = {
  id: string;
  nodeId?: string;
  key: string;
  value: string;
  source: VarSource;
};

export type ActivityStats = {
  projectId: string;
  name: string;
  deploys: number;
  failed: number;
  github: number;
  live: number;
};

export type User = {
  id: string;
  username: string;
  email: string;
  name: string;
  createdAt: string;
};

export type GitHubInstallation = {
  id: number;
  account: string;
  type: string;
  createdAt: string;
  updatedAt: string;
};

export type GitHubRepo = {
  fullName: string;
  name: string;
  owner: string;
  private: boolean;
  defaultBranch: string;
  url: string;
};

export type GitHubBranch = {
  name: string;
  sha?: string;
  protected?: boolean;
  default?: boolean;
};

export type GitHubStatus = {
  configured: boolean;
  verified: boolean;
  name: string;
  slug: string;
  appId: string;
  webhookUrl: string;
  setupUrl: string;
  publicUrl: string;
  webUrl: string;
  installations: GitHubInstallation[];
  connected: boolean;
  webhookSecret: boolean;
};

/**
 * A single SSE frame from GET /v1/projects/{id}/events.
 *
 * The stream is untagged — every frame arrives on the default `message` event
 * and `kind` is what distinguishes a log line from a status change.
 */
export type StreamEvent = {
  kind: "log" | "status" | "stack" | "ready";
  ts?: string;
  phase?: DeployPhase;
  level?: LogLevel;
  text?: string;
  status?: ProjectStatus;
  url?: string | null;
  platformUrl?: string | null;
  platformUrlEnabled?: boolean;
  primaryKind?: "custom" | "platform" | string;
  framework?: string | null;
  nodeId?: string;
  startedAt?: string | null;
  languages?: Language[];
  stack?: StackItem[];
};

export type HealthReport = {
  status: "ok" | "degraded";
  postgres: string;
  cache: string;
};

export type DatabaseOverview = {
  kind: "postgresql" | "redis";
  status: string;
  version?: string;
  internalUrl: string;
  publicUrl: string;
  host: string;
  publicHost: string;
  port: number;
  publicPort: number;
  user?: string;
  password?: string;
  database?: string;
  keys?: number;
  memory?: string;
};

export type DatabaseTable = {
  schema: string;
  name: string;
  estimatedRows: number;
  exact?: boolean;
  sizeBytes: number;
  size: string;
};

export type DatabaseColumn = {
  name: string;
  type: string;
  nullable: boolean;
  pk: boolean;
};

export type DatabaseRowPage = {
  columns: DatabaseColumn[];
  rows: Record<string, unknown>[];
  estimatedRows: number;
  exact?: boolean;
  offset: number;
  limit: number;
  hasMore: boolean;
  truncated: boolean;
  keyset?: boolean;
  nextAfter?: string;
};

export type RedisKeyItem = {
  name: string;
  type: string;
  ttl: number;
};

export type RedisKeyPage = {
  keys: RedisKeyItem[];
  cursor: number;
  hasMore: boolean;
};

export type RedisKeyValue = {
  name: string;
  type: string;
  ttl: number;
  value: unknown;
  truncated: boolean;
};

export type UsagePoint = {
  t: number;
  ram: number;
  disk: number;
  cpu: number;
};

export type UsageLimits = {
  minMemoryMb: number;
  maxMemoryMb: number;
  minDiskMb: number;
  maxDiskMb: number;
};

export type UsageTotals = {
  ramUsedBytes: number;
  ramAllocBytes: number;
  diskUsedBytes: number;
  diskAllocBytes: number;
  cpuPercent: number;
};

export type NodeUsage = {
  id: string;
  title: string;
  kind: NodeKind | string;
  status: string;
  memoryMb: number;
  diskMb: number;
  ramUsedBytes: number;
  diskUsedBytes: number;
  cpuPercent: number;
  series: UsagePoint[];
};

export type ProjectUsage = {
  id: string;
  name: string;
  environment: string;
  familyId: string;
  ramUsedBytes: number;
  ramAllocBytes: number;
  diskUsedBytes: number;
  diskAllocBytes: number;
  cpuPercent: number;
  nodes: NodeUsage[];
};

export type UsageSnapshot = {
  generatedAt: string;
  intervalSeconds: number;
  limits: UsageLimits;
  totals: UsageTotals;
  projects: ProjectUsage[];
};

export type SecretVaultMeta = {
  exists: boolean;
  unlock?: "session" | "passphrase" | "";
  dek?: string;
  kdf?: string;
  kdfIters?: number;
  salt?: string;
  wrapIv?: string;
  wrappedDek?: string;
  createdAt?: string;
  updatedAt?: string;
};

export type SecretGroupRecord = {
  id: string;
  nameIv: string;
  nameCt: string;
  createdAt: string;
  updatedAt: string;
};

export type SecretItemRecord = {
  id: string;
  groupId?: string;
  bodyIv: string;
  bodyCt: string;
  createdAt: string;
  updatedAt: string;
};

export type SecretsBundle = {
  vault: SecretVaultMeta;
  groups: SecretGroupRecord[];
  items: SecretItemRecord[];
};

export type CustomDomainStatus = "pending" | "verifying" | "active" | "error";

export type CustomDomainRecord = {
  type: "TXT" | "CNAME" | "A" | "AAAA" | string;
  host: string;
  name: string;
  value: string;
  purpose: "verify" | "route" | string;
  required: boolean;
  hint?: string;
};

export type CustomDomain = {
  id: string;
  hostname: string;
  status: CustomDomainStatus | string;
  url?: string | null;
  primary?: boolean;
  records: CustomDomainRecord[];
  error?: string | null;
  edgeStatus?: string;
  cnameTarget: string;
  createdAt: string;
  verifiedAt?: string | null;
  lastCheckAt?: string | null;
};

export type CustomDomainList = {
  domains?: CustomDomain[];
  domain?: CustomDomain;
  primaryUrl?: string;
  primaryKind?: "custom" | "platform" | string;
  platformUrl?: string;
  platformUrlEnabled?: boolean;
  cnameTarget?: string;
};
