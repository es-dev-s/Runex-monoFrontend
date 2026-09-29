"use client";

import { projectNameSchema } from "@/lib/inbox/schema";
import { usePlatformStore } from "@/lib/inbox/store";
import { useReducedMotion } from "motion/react";
import * as m from "motion/react-m";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";

export function NewProjectModal() {
  const createProject = usePlatformStore((state) => state.createProject);
  const setDeployOpen = usePlatformStore((state) => state.setDeployOpen);
  const busy = usePlatformStore((state) => state.creating);
  const reduce = useReducedMotion();
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setDeployOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setDeployOpen]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = projectNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Name the project.");
      inputRef.current?.focus();
      return;
    }
    const problem = await createProject(parsed.data);
    if (problem) {
      setError(problem);
      return;
    }
    setName("");
    setError("");
  }

  return (
    <m.div
      className="fixed inset-0 z-30 grid place-items-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.18 }}
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 bg-[#1c1c1c]/25 backdrop-blur-[2px]"
        onClick={() => setDeployOpen(false)}
      />
      <m.form
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onSubmit={(event) => void onSubmit(event)}
        noValidate
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-[400px] rounded-[20px] border border-[#ececec] bg-white p-5 shadow-[0_24px_60px_rgba(0,0,0,0.12)]"
      >
        <h2 id={titleId} className="text-[16px] font-semibold tracking-[-0.02em] text-[#1c1c1c]">
          New project
        </h2>
        <p className="mt-1 text-[13px] leading-5 text-[#8a8a8a]">
          Creates an empty production project on your account. Add a service, Postgres, or Redis from the canvas.
        </p>
        <label className="mt-4 grid gap-1.5 text-[12px] font-medium text-[#8a8a8a]">
          Name
          <input
            ref={inputRef}
            value={name}
            placeholder="checkout"
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            aria-invalid={error ? true : undefined}
            onChange={(event) => {
              setName(event.target.value);
              setError("");
            }}
            className="h-11 rounded-xl border border-[#e6e6e6] px-3 text-[15px] font-normal text-[#1c1c1c] outline-none transition-colors placeholder:text-[#b0b0b0] focus:border-[#161616]"
          />
          {error ? <span className="text-[12px] font-normal text-[#d14343]">{error}</span> : null}
        </label>
        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeployOpen(false)}
            className="h-9 rounded-full px-3.5 text-[13px] font-medium text-[#3a3a3a] transition-colors hover:bg-[#f4f4f4]"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="h-9 rounded-full bg-[#161616] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-black disabled:opacity-40"
          >
            {busy ? "Creating" : "Create"}
          </button>
        </div>
      </m.form>
    </m.div>
  );
}
