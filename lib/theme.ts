export type ThemeName = "light" | "dark";

const KEY = "runex.theme";
const listeners = new Set<(dark: boolean) => void>();

export function isDark() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

export function applyTheme(dark: boolean) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  try {
    localStorage.setItem(KEY, dark ? "dark" : "light");
  } catch {
    /* private mode */
  }
  listeners.forEach((listener) => listener(dark));
}

export function subscribeTheme(listener: (dark: boolean) => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
