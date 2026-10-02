"use client";

import { RunexLogo } from "@/components/inbox/runex-logo";
import { signInSchema, signUpSchema } from "@/lib/auth-schema";
import { usePlatformStore } from "@/lib/inbox/store";
import { safeInternalPath } from "@/lib/session";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type FocusEvent, type FormEvent } from "react";

function afterAuthPath() {
  const requested = safeInternalPath(new URLSearchParams(window.location.search).get("next"), "");
  const admin = usePlatformStore.getState().user?.role === "admin";
  if (requested === "/admin") return admin ? "/admin" : "/app";
  if (requested && requested !== "/app") return requested;
  return admin ? "/admin" : "/app";
}

export function AuthScreen({ mode }: { mode: "sign-in" | "sign-up" }) {
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
  const [formError, setFormError] = useState("");
  const frameRef = useRef<HTMLElement>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (session !== "in") return;
    router.replace(afterAuthPath());
  }, [router, session]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

    router.replace(afterAuthPath());
  }

  return (
    <main
      ref={frameRef}
      className="auth-light fixed inset-x-0 top-0 flex h-dvh min-h-0 justify-center bg-white text-[#1c1c1c] [color-scheme:light]"
    >
      <div
        ref={scrollerRef}
        className="flex min-h-0 w-full max-w-[440px] flex-col overflow-y-auto overscroll-y-contain px-6 pt-[max(2rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]"
      >
      <div className="m-auto w-full max-w-[400px] py-6">
        <div>
          <div className="flex items-center gap-2.5">
            <RunexLogo className="h-8 w-8" />
            <span className="text-[18px] leading-none font-semibold tracking-[-0.03em] text-[#1c1c1c]">Runex</span>
          </div>
          <h1 className="mt-8 text-[34px] leading-[1.08] font-semibold tracking-[-0.04em] text-[#1c1c1c]">
            {signingUp ? "Create your account" : "Sign in"}
          </h1>
          <p className="mt-2 text-[15px] leading-6 tracking-[-0.011em] text-[#6e6e73]">
            {signingUp
              ? "Your projects, deployments, and variables stay on this account."
              : "Use the username or email on your Runex account."}
          </p>
        </div>

        <form className="mt-8" onSubmit={(event) => void onSubmit(event)} noValidate>
          {signingUp ? (
            <>
              <Field
                id={`${formId}-username`}
                label="Username"
                value={username}
                autoComplete="username"
                enterKeyHint="next"
                error={fields.username}
                onChange={setUsername}
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
                onChange={setEmail}
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
              onChange={setLoginId}
            />
          )}

          <label className="mt-4 grid gap-2 text-[13px] font-medium tracking-[-0.011em] text-[#1c1c1c]" htmlFor={`${formId}-password`}>
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
                  setFields((current) => ({ ...current, password: "" }));
                  setFormError("");
                }}
                className={`${fieldClass} pr-12`}
              />
              <button
                type="button"
                aria-label={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((current) => !current)}
                className="absolute top-1/2 right-1 grid size-10 -translate-y-1/2 place-items-center text-[#8e8e93]"
              >
                {showPassword ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
              </button>
            </span>
            {fields.password ? (
              <span id={`${formId}-password-error`} className="text-[12px] font-normal text-[#b42318]">
                {fields.password}
              </span>
            ) : signingUp ? (
              <span className="text-[13px] font-normal tracking-[-0.011em] text-[#6e6e73]">
                At least 8 characters, with a letter and a number.
              </span>
            ) : null}
          </label>

          {formError ? (
            <p className="mt-4 rounded-xl bg-[#fff6f5] px-3 py-2 text-[13px] leading-5 text-[#b42318]" role="alert">
              {formError}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={busy}
            className="mt-6 h-12 w-full rounded-full bg-[#161616] text-[15px] font-medium tracking-[-0.011em] text-white transition-colors hover:bg-black disabled:opacity-40"
          >
            {busy ? "Working" : signingUp ? "Create account" : "Sign in"}
          </button>
        </form>

        <p className="mt-5 text-[14px] leading-5 tracking-[-0.011em] text-[#6e6e73]">
          {signingUp ? "Already have an account?" : "New to Runex?"}{" "}
          <Link
            href={signingUp ? "/sign-in" : "/sign-up"}
            className="font-medium text-[#fd4e00] transition-colors hover:text-[#e04500]"
          >
            {signingUp ? "Sign in" : "Create an account"}
          </Link>
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
    <label className="mt-4 grid gap-2 text-[13px] font-medium tracking-[-0.011em] text-[#1c1c1c] first:mt-0" htmlFor={id}>
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
        className={fieldClass}
      />
      {error ? <span className="text-[12px] font-normal text-[#b42318]">{error}</span> : null}
    </label>
  );
}

const fieldClass =
  "auth-field h-12 w-full rounded-[14px] border border-[#e6e6e6] bg-white px-3.5 text-base font-normal tracking-[-0.011em] text-[#1c1c1c] outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-[#aeaeb2]";

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
