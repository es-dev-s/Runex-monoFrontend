import { github, type GitHubRepo, type GitHubStatus } from "@/lib/api";

export type GitHubCatalog = {
  status: GitHubStatus;
  repos: GitHubRepo[];
  installationId: number;
  at: number;
};

const FRESH_MS = 20_000;

let current: GitHubCatalog | null = null;
let flight: Promise<GitHubCatalog> | null = null;

/** Last catalog, including one that is due for a refresh. */
export function peekGitHub(): GitHubCatalog | null {
  return current;
}

/**
 * One in-flight status+repos load for the whole app.
 * A warm catalog returns immediately so the canvas does not wait on GitHub.
 */
export function loadGitHubCatalog(force = false): Promise<GitHubCatalog> {
  if (!force && current && Date.now() - current.at < FRESH_MS) {
    return Promise.resolve(current);
  }
  if (flight) return flight;
  flight = pull()
    .then((next) => {
      current = next;
      flight = null;
      return next;
    })
    .catch((cause: unknown) => {
      flight = null;
      throw cause;
    });
  return flight;
}

async function pull(): Promise<GitHubCatalog> {
  const status = await github.status();
  if (!status.connected) {
    return { status, repos: [], installationId: 0, at: Date.now() };
  }
  const list = await github.repos();
  return {
    status,
    repos: list.repos ?? [],
    installationId: list.installationId || status.installations?.[0]?.id || 0,
    at: Date.now(),
  };
}
