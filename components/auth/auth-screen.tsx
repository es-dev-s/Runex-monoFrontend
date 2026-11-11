"use client";

import { RunexLogo } from "@/components/inbox/runex-logo";
import { signInSchema, signUpSchema } from "@/lib/auth-schema";
import { usePlatformStore } from "@/lib/inbox/store";
import { safeInternalPath } from "@/lib/session";
import { ChevronDown, Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FocusEvent, type FormEvent } from "react";

const OAUTH_ERRORS: Record<string, string> = {
  google_denied: "Google sign-in was cancelled. You can try again whenever you're ready.",
  invalid_state: "That Google sign-in expired. Please try again.",
  google_exchange: "We couldn't confirm your Google account. Please try again.",
  unverified_email: "Your Google account needs a verified email to sign in.",
  access_revoked: "This account no longer has access to Runex.",
};

function afterAuthPath() {
  const requested = safeInternalPath(new URLSearchParams(window.location.search).get("next"), "");
  const admin = usePlatformStore.getState().user?.role === "admin";
  if (requested === "/admin") return admin ? "/admin" : "/app";
  if (requested && requested !== "/app") return requested;
  return admin ? "/admin" : "/app";
}

export function AuthScreen({ mode, oauthError }: { mode: "sign-in" | "sign-up"; oauthError?: string }) {
  const router = useRouter();
  const bootstrap = usePlatformStore((state) => state.bootstrap);
  const session = usePlatformStore((state) => state.session);
  const login = usePlatformStore((state) => state.login);
  const register = usePlatformStore((state) => state.register);
  const busy = usePlatformStore((state) => state.busy);
  const signingUp = mode === "sign-up";
  const formId = useId();
  const [loginId, setLoginId] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState(() =>
    oauthError ? (OAUTH_ERRORS[oauthError] ?? "Google sign-in didn't finish. Please try again.") : "",
  );
  const frameRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const redirecting = useRef(false);
  const [leaving, setLeaving] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  useEffect(() => {
    const node = frameRef.current;
    const scroller = scrollerRef.current;
    const viewport = window.visualViewport;
    if (!node || !viewport) return;

    let lastHeight = viewport.height;
    const place = () => {
      const height = viewport.height;
      const grew = height - lastHeight > 80;
      lastHeight = height;
      node.style.height = `${height}px`;
      node.style.top = `${viewport.offsetTop}px`;
      if (grew && scroller) scroller.scrollTop = 0;
    };

    place();
    viewport.addEventListener("resize", place);
    viewport.addEventListener("scroll", place);
    window.addEventListener("orientationchange", place);
    return () => {
      viewport.removeEventListener("resize", place);
      viewport.removeEventListener("scroll", place);
      window.removeEventListener("orientationchange", place);
      node.style.height = "";
      node.style.top = "";
    };
  }, []);

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  // A failed Google callback lands here with ?oauth_error=. The server page
  // passes the code in, so the message renders on first paint; just tidy the URL.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (!url.searchParams.has("oauth_error")) return;
    url.searchParams.delete("oauth_error");
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
  }, []);

  // Coming back from Google with the browser Back button restores this page
  // from the back/forward cache; let the button work again.
  useEffect(() => {
    const reset = (event: PageTransitionEvent) => {
      if (event.persisted) setLeaving(false);
    };
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);

  useEffect(() => {
    if (session !== "in" || redirecting.current) return;
    redirecting.current = true;
    router.replace(afterAuthPath());
  }, [router, session]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || leaving || redirecting.current || session === "in") return;
    setFields({});
    setFormError("");

    if (signingUp) {
      const parsed = signUpSchema.safeParse({ username, email, password });
      if (!parsed.success) {
        setFields(issues(parsed.error.issues));
        return;
      }
      const problem = await register(parsed.data);
      if (problem) {
        applyFailure(problem, setFields, setFormError);
        return;
      }
    } else {
      const parsed = signInSchema.safeParse({ login: loginId, password });
      if (!parsed.success) {
        setFields(issues(parsed.error.issues));
        return;
      }
      const problem = await login(parsed.data.login, parsed.data.password);
      if (problem) {
        applyFailure(problem, setFields, setFormError);
        return;
      }
    }
  }

  function edit(clearKey?: string) {
    return (value: string) => {
      if (clearKey) {
        setFields((current) => (current[clearKey] ? { ...current, [clearKey]: "" } : current));
      }
      if (formError) setFormError("");
      return value;
    };
  }

  const toggleEmail = () => {
    const opening = !emailOpen;
    setEmailOpen(opening);
    if (opening) {
      window.requestAnimationFrame(() => {
        document.getElementById(signingUp ? `${formId}-username` : `${formId}-login`)?.focus({ preventScroll: true });
      });
    }
  };

  const errorNote = formError ? (
    <p className="auth-error" role="alert">
      {formError}
    </p>
  ) : null;

  return (
    <main ref={frameRef} className="auth-stage fixed inset-x-0 top-0 flex h-dvh min-h-0">
      <div ref={scrollerRef} className="auth-scroll">
        <div className="auth-shell">
          <section className="auth-card" aria-labelledby={`${formId}-title`}>
            <RunexLogo className="auth-logo" />
            <h1 id={`${formId}-title`} className="auth-title">
              {signingUp ? "Create your Runex account" : "Sign in to Runex"}
            </h1>
            <p className="auth-sub">
              {signingUp ? "Free for 30 days. No card needed." : "Welcome back. Pick up where you left off."}
            </p>

            {emailOpen ? null : errorNote}

            <a
              href="/v1/auth/google"
              aria-disabled={leaving || undefined}
              onClick={(event) => {
                // One OAuth start per click: a second one would replace the state cookie mid-flight.
                if (leaving || busy || session === "in") {
                  event.preventDefault();
                  return;
                }
                setLeaving(true);
              }}
              className="auth-google"
            >
              <span className="auth-google-mark" aria-hidden="true">
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65Z" />
                  <path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.78-4.59l-7.98-6.19A23.87 23.87 0 0 0 0 24c0 3.87.93 7.53 2.56 10.78l7.97-6.19Z" />
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48Z" />
                </svg>
              </span>
              {leaving ? "Opening Google…" : "Continue with Google"}
            </a>

            <button
              type="button"
              className="auth-toggle"
              aria-expanded={emailOpen}
              aria-controls={`${formId}-email-panel`}
              onClick={toggleEmail}
            >
              {signingUp ? "Sign up with email" : "Sign in with email instead"}
              <ChevronDown size={14} strokeWidth={1.75} aria-hidden className="auth-toggle-icon" />
            </button>

            <div id={`${formId}-email-panel`} className="auth-collapse" data-open={emailOpen ? "" : undefined} inert={!emailOpen}>
              <div className="auth-collapse-inner">
                <form className="auth-form" onSubmit={(event) => void onSubmit(event)} noValidate>
                  {signingUp ? (
                    <>
                      <Field
                        id={`${formId}-username`}
                        label="Username"
                        value={username}
                        autoComplete="username"
                        enterKeyHint="next"
                        error={fields.username}
                        onChange={(value) => setUsername(edit("username")(value))}
                      />
                      <Field
                        id={`${formId}-email`}
                        label="Email"
                        type="email"
                        inputMode="email"
                        value={email}
                        autoComplete="email"
                        enterKeyHint="next"
                        error={fields.email}
                        onChange={(value) => setEmail(edit("email")(value))}
                      />
                    </>
                  ) : (
                    <Field
                      id={`${formId}-login`}
                      label="Username or email"
                      value={loginId}
                      autoComplete="username"
                      enterKeyHint="next"
                      error={fields.login}
                      onChange={(value) => setLoginId(edit("login")(value))}
                    />
                  )}

                  <label className="auth-label" htmlFor={`${formId}-password`}>
                    Password
                    <span className="relative">
                      <input
                        id={`${formId}-password`}
                        type={showPassword ? "text" : "password"}
                        value={password}
                        autoComplete={signingUp ? "new-password" : "current-password"}
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        enterKeyHint="go"
                        aria-invalid={fields.password ? true : undefined}
                        aria-describedby={fields.password ? `${formId}-password-error` : undefined}
                        onFocus={revealField}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          setFields((current) => (current.password ? { ...current, password: "" } : current));
                          if (formError) setFormError("");
                        }}
                        className="auth-field pr-11"
                      />
                      <button
                        type="button"
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        onClick={() => setShowPassword((current) => !current)}
                        className="auth-eye"
                      >
                        {showPassword ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
                      </button>
                    </span>
                    {fields.password ? (
                      <span id={`${formId}-password-error`} className="auth-error-text">
                        {fields.password}
                      </span>
                    ) : signingUp ? (
                      <span className="auth-hint">At least 8 characters, with a letter and a number.</span>
                    ) : null}
                  </label>

                  {emailOpen ? errorNote : null}

                  <button
                    type="submit"
                    disabled={busy || leaving || session === "in"}
                    aria-busy={busy || session === "in"}
                    className="auth-submit"
                  >
                    {busy || session === "in"
                      ? signingUp
                        ? "Creating account…"
                        : "Signing in…"
                      : signingUp
                        ? "Create account"
                        : "Sign in"}
                  </button>
                </form>
              </div>
            </div>

            <p className="auth-switch">
              {signingUp ? "Already have an account?" : "New to Runex?"}{" "}
              <Link href={signingUp ? "/sign-in" : "/sign-up"} className="auth-link">
                {signingUp ? "Sign in" : "Create an account"}
              </Link>
            </p>
          </section>

          <p className="auth-foot">
            Need a hand? <a href="mailto:support@runex.cloud">support@runex.cloud</a>
          </p>
        </div>
      </div>
    </main>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  error,
  type = "text",
  inputMode,
  autoComplete,
  enterKeyHint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  type?: string;
  inputMode?: "text" | "email";
  autoComplete?: string;
  enterKeyHint?: "next" | "go";
}) {
  return (
    <label className="auth-label" htmlFor={id}>
      {label}
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        value={value}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint={enterKeyHint}
        aria-invalid={error ? true : undefined}
        onFocus={revealField}
        onChange={(event) => onChange(event.target.value)}
        className="auth-field"
      />
      {error ? <span className="auth-error-text">{error}</span> : null}
    </label>
  );
}

function revealField(event: FocusEvent<HTMLInputElement>) {
  const target = event.currentTarget;
  const show = () => target.scrollIntoView({ block: "center", inline: "nearest" });
  window.setTimeout(show, 60);
  window.setTimeout(show, 320);
}

function applyFailure(
  failure: { message: string; field?: string },
  setFields: (value: Record<string, string>) => void,
  setFormError: (value: string) => void,
) {
  if (failure.field) {
    setFields({ [failure.field]: failure.message });
    return;
  }
  setFormError(failure.message);
}

function issues(list: { path: PropertyKey[]; message: string }[]) {
  const next: Record<string, string> = {};
  for (const issue of list) {
    const key = String(issue.path[0] ?? "");
    if (key && !next[key]) next[key] = issue.message;
  }
  return next;
}
