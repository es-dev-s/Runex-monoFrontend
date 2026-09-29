/**
 * Single HTTP entry point for the Runex control plane.
 *
 * Every call is credentialed: the backend authenticates with an HttpOnly
 * `platform_session` cookie, so requests must opt into sending it and the API
 * origin must be in the backend's CORS allow-list.
 */

export const API_BASE_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").replace(/\/+$/, "");

/** Error codes the UI branches on. The backend defines many more. */
export type ApiErrorCode =
  | "unauthorized"
  | "not_found"
  | "invalid_request"
  | "invalid_username"
  | "invalid_email"
  | "invalid_password"
  | "invalid_credentials"
  | "username_taken"
  | "email_taken"
  | "account_exists"
  | "rate_limited"
  | "deploy_in_progress"
  | "github_unconfigured"
  | "github_repos"
  | "github_reconnect"
  | "github_branches"
  | "too_large"
  | "invalid_zip"
  | (string & {});

export class ApiError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }

  /** True when the session is missing or expired and the user must sign in. */
  get isUnauthorized() {
    return this.status === 401;
  }

  /** True when a retry could plausibly succeed. */
  get isTransient() {
    return this.status === 429 || this.status >= 500;
  }

  /** True when the control plane said the row is gone — not a proxy HTML 404. */
  get isNotFound() {
    return this.code === "not_found";
  }
}

/**
 * Raised when the backend cannot be reached at all. Kept distinct from
 * ApiError so the UI can say "can't reach the control plane" rather than
 * showing a misleading HTTP status.
 */
export class NetworkError extends Error {
  constructor(cause?: unknown) {
    super("Could not reach the Runex control plane.");
    this.name = "NetworkError";
    this.cause = cause;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Serialized as JSON. Mutually exclusive with `form`. */
  body?: unknown;
  /** Sent as multipart/form-data; the browser sets the boundary itself. */
  form?: FormData;
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
};

function buildURL(path: string, query?: RequestOptions["query"]) {
  // Empty API_BASE_URL means same-origin (Next rewrites /v1 to the Go API).
  const url = API_BASE_URL
    ? new URL(API_BASE_URL + path)
    : new URL(path, "http://runex.local");
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }
  return API_BASE_URL ? url.toString() : `${url.pathname}${url.search}`;
}

export function looksLikeMarkup(text: string) {
  const head = text.trimStart().slice(0, 32).toLowerCase();
  return head.startsWith("<!doctype") || head.startsWith("<html") || head.startsWith("<!--[if");
}

export function humanizeHttpBody(status: number, text: string, fallback: string) {
  const trimmed = text.trim();
  if (!trimmed || looksLikeMarkup(trimmed) || /^internal server error$/i.test(trimmed)) {
    if (status === 404) return "That item was not found.";
    if (status >= 500 || status === 0) return "Could not reach the Runex control plane.";
    return fallback;
  }
  return trimmed.length > 160 ? `${trimmed.slice(0, 157)}…` : trimmed;
}

/**
 * Pulls a message out of the backend's `{ error: { code, message } }` envelope.
 * Proxy HTML (Cloudflare, nginx) is never shown in the inspector.
 */
async function toApiError(response: Response): Promise<ApiError> {
  let code: string = "request_failed";
  let message = response.statusText || "Request failed";
  try {
    const text = await response.text();
    if (text) {
      try {
        const parsed = JSON.parse(text) as { error?: { code?: string; message?: string } };
        if (parsed.error?.code) code = parsed.error.code;
        if (parsed.error?.message) message = parsed.error.message;
      } catch {
        message = humanizeHttpBody(response.status, text, message || "Request failed");
      }
    }
  } catch {
    // Body already consumed or unreadable; keep the status-derived message.
  }
  if (looksLikeMarkup(message)) {
    message = humanizeHttpBody(response.status, message, "Request failed");
  }
  return new ApiError(response.status, code, message);
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, form, query, signal } = options;

  const headers: Record<string, string> = {};
  let payload: BodyInit | undefined;
  if (form) {
    payload = form;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }

  let response: Response;
  try {
    response = await fetch(buildURL(path, query), {
      method,
      headers,
      body: payload,
      credentials: "include",
      signal,
      cache: "no-store",
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new NetworkError(cause);
  }

  if (!response.ok) throw await toApiError(response);

  // 204 and empty bodies are valid successes for DELETE and logout.
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  if (looksLikeMarkup(text)) {
    throw new ApiError(
      response.status || 502,
      "bad_gateway",
      "Runex returned a web page instead of data. Refresh and try again.",
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(502, "invalid_response", "Could not read the control plane response.");
  }
}

/** URL for the SSE log stream. EventSource cannot set headers, so it relies on the cookie. */
export function streamURL(projectId: string) {
  return buildURL(`/v1/projects/${encodeURIComponent(projectId)}/events`);
}
