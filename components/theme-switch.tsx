"use client";

import { applyTheme, isDark, subscribeTheme } from "@/lib/theme";
import { useEffect, useState } from "react";

export function useTheme() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(isDark());
    const unsubscribe = subscribeTheme(setDark);
    return () => {
      unsubscribe();
    };
  }, []);

  return {
    dark,
    toggle: () => applyTheme(!isDark()),
  };
}

export function ThemeSwitch({
  checked,
  onClick,
}: {
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label="Dark mode"
      onClick={onClick}
      suppressHydrationWarning
      className={`runex-switch ${checked ? "is-on" : ""}`}
    >
      <span />
    </button>
  );
}
