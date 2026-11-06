"use client";

import { serverThemeSnapshot, setThemePref, subscribeTheme, themeSnapshot, type ThemePref } from "@/lib/theme";
import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

export function useTheme() {
  const snap = useSyncExternalStore(subscribeTheme, themeSnapshot, serverThemeSnapshot);
  const [pref, resolved] = snap.split("|") as [ThemePref, "light" | "dark"];
  const dark = resolved === "dark";
  return {
    pref,
    dark,
    setTheme: setThemePref,
    toggle: () => setThemePref(dark ? "light" : "dark"),
  };
}

const OPTIONS: { value: ThemePref; label: string; icon: typeof Sun }[] = [
  { value: "system", label: "System", icon: Monitor },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

/** Three-way appearance control. Compact for menus, roomy for settings. */
export function ThemeChoice({ size = "md" }: { size?: "sm" | "md" }) {
  const { pref, setTheme } = useTheme();
  return (
    <div role="radiogroup" aria-label="Appearance" className={`runex-seg ${size === "sm" ? "is-sm" : ""}`}>
      {OPTIONS.map(({ value, label, icon: Icon }) => {
        const on = pref === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={size === "sm" ? label : undefined}
            title={size === "sm" ? label : undefined}
            suppressHydrationWarning
            onClick={() => setTheme(value)}
            className={on ? "is-on" : ""}
          >
            <Icon size={size === "sm" ? 14 : 15} strokeWidth={1.6} aria-hidden />
            {size === "sm" ? null : <span>{label}</span>}
          </button>
        );
      })}
    </div>
  );
}

export default ThemeChoice;
