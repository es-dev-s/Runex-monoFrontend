"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import { chromePanel } from "@/lib/chrome";
import { cn } from "@/lib/cn";

export type MenuOption = {
  value: string;
  label: string;
  hint?: string;
};

export function MenuSelect({
  value,
  options,
  onChange,
  placeholder,
  disabled,
  label,
  compact = false,
  bare = false,
  ariaLabel,
}: {
  value: string;
  options: MenuOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  label?: string;
  compact?: boolean;
  /** Text + chevron only — for a parent frame that already has a border. */
  bare?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = options.find((item) => item.value === value);

  function place() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const gutter = 8;
    const item = 36;
    const gap = 4;
    const pad = 12;
    const estimated = Math.min(240, options.length * item + Math.max(0, options.length - 1) * gap + pad);
    const spaceBelow = window.innerHeight - rect.bottom - gutter;
    const spaceAbove = rect.top - gutter;
    const flip = spaceBelow < 120 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(96, flip ? spaceAbove - 6 : spaceBelow - 6);
    const width = Math.min(window.innerWidth - gutter * 2, Math.max(rect.width, bare ? 220 : rect.width));
    setBox({
      top: flip ? rect.top - Math.min(estimated, maxHeight) - 6 : rect.bottom + 6,
      left: Math.min(Math.max(gutter, rect.left), window.innerWidth - width - gutter),
      width,
      maxHeight: Math.min(estimated, maxHeight),
    });
  }

  useLayoutEffect(() => {
    if (!open) return;
    place();
    // place reads the trigger box; it is safe to re-run when the menu opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, options.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onReposition = () => place();
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("resize", onReposition);
    window.addEventListener("scroll", onReposition, true);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer, true);
      window.removeEventListener("resize", onReposition);
      window.removeEventListener("scroll", onReposition, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, options.length]);

  return (
    <div className={bare ? "inline-flex min-w-0 max-w-full" : undefined}>
      {label ? (
        <span className="mb-1.5 block text-[12px] font-medium tracking-tight text-fg/60">{label}</span>
      ) : null}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel ?? label}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          if (disabled) return;
          setOpen((current) => !current);
        }}
        className={cn(
          "flex items-center text-left text-[13px] tracking-tight text-fg outline-none",
          bare
            ? "h-7 w-auto max-w-full gap-1 rounded-md px-0 transition-colors duration-150 ease-out hover:text-fg"
            : cn(
                "w-full gap-2 rounded-lg bg-fg/[0.04] px-2.5 ring-1 ring-fg/[0.08] transition-[box-shadow,background-color] duration-150 ease-out",
                compact ? "h-8" : "h-9",
                "hover:bg-fg/[0.06] focus-visible:ring-fg/20",
                open && "bg-fg/[0.06] ring-fg/20",
              ),
          disabled && "cursor-not-allowed text-fg/30 hover:bg-fg/[0.04]",
          !disabled && "cursor-pointer",
          bare && open && "text-fg",
        )}
      >
        <span
          className={cn(
            "min-w-0 truncate",
            bare ? "max-w-[11rem]" : "flex-1",
            !selected && "text-fg/35",
          )}
        >
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          size={13}
          strokeWidth={1.75}
          className={cn("shrink-0 text-fg/35 transition-transform duration-150", open && "rotate-180")}
        />
      </button>
      {open && box && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              id={listId}
              role="listbox"
              aria-label={label}
              style={{
                position: "fixed",
                top: box.top,
                left: box.left,
                width: box.width,
                maxHeight: box.maxHeight,
                zIndex: 95,
              }}
              className={cn(chromePanel, "flex flex-col gap-1 overflow-y-auto p-1.5")}
            >
              {options.length === 0 ? (
                <p className="px-2.5 py-2 text-[12px] tracking-tight text-fg/35">Nothing to choose</p>
              ) : (
                options.map((item) => {
                  const active = item.value === value;
                  return (
                    <button
                      key={item.value}
                      type="button"
                      role="option"
                      aria-selected={active}
                      onClick={() => {
                        onChange(item.value);
                        setOpen(false);
                        buttonRef.current?.focus();
                      }}
                      className={cn(
                        "relative isolate flex w-full cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] tracking-tight transition-colors duration-100 ease-out",
                        active
                          ? "bg-fg/[0.08] text-fg"
                          : "text-fg/75 hover:bg-fg/[0.06] hover:text-fg",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      {item.hint ? (
                        <span className="max-w-[42%] shrink-0 truncate text-[11px] tracking-tight text-fg/28">
                          {item.hint}
                        </span>
                      ) : null}
                      {active ? <Check size={13} strokeWidth={2} className="shrink-0 text-fg/50" /> : null}
                    </button>
                  );
                })
              )}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
