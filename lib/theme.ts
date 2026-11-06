/**
 * Dashboard appearance.
 *
 * The preference is "system", "light", or "dark". The inline script in the root
 * layout applies the same rules before first paint, so a reload never flashes
 * the wrong theme. This module keeps the page in sync afterwards: OS changes
 * while on "system", other tabs, and the signed-in account's saved choice.
 */

export type ThemePref = "system" | "light" | "dark";

export const THEME_KEY = "runex.theme";
const MEDIA = "(prefers-color-scheme: dark)";

/** Runs in <head> before paint. Keep in step with resolveDark below. */
export const THEME_BOOT_SCRIPT = `(function(){try{var d=document.documentElement,p=null;try{p=localStorage.getItem("${THEME_KEY}")}catch(e){}var k=p==="dark"||(p!=="light"&&window.matchMedia&&matchMedia("${MEDIA}").matches);d.classList.toggle("dark",k);d.style.colorScheme=k?"dark":"light"}catch(e){}})()`;

const listeners = new Set<() => void>();
let snapshot: string | null = null;
let wired = false;
/** True once the user picks a theme in this page's lifetime. Their pick beats a stale server value. */
let chosenHere = false;

export function isThemePref(value: unknown): value is ThemePref {
  return value === "system" || value === "light" || value === "dark";
}

function storedPref(): ThemePref | null {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    return isThemePref(raw) ? raw : null;
  } catch {
    return null;
  }
}

export function readThemePref(): ThemePref {
  if (typeof window === "undefined") return "system";
  return storedPref() ?? "system";
}

function systemDark() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(MEDIA).matches;
}

function resolveDark(pref: ThemePref) {
  return pref === "dark" || (pref === "system" && systemDark());
}

export function isDark() {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark");
}

function paint(dark: boolean) {
  const root = document.documentElement;
  const scheme = dark ? "dark" : "light";
  if (root.classList.contains("dark") === dark && root.style.colorScheme === scheme) return;
  // Swap every surface in one frame instead of letting each control animate its colour.
  root.classList.add("runex-theme-switching");
  root.classList.toggle("dark", dark);
  root.style.colorScheme = scheme;
  window.requestAnimationFrame(() => {
    window.requestAnimationFrame(() => root.classList.remove("runex-theme-switching"));
  });
}

function emit() {
  snapshot = null;
  listeners.forEach((listener) => listener());
}

function commit(pref: ThemePref, persist: boolean) {
  if (persist) {
    try {
      localStorage.setItem(THEME_KEY, pref);
    } catch {
      /* private mode: the choice still applies to this page */
    }
  }
  paint(resolveDark(pref));
  emit();
}

function wire() {
  if (wired || typeof window === "undefined") return;
  wired = true;
  const media = typeof window.matchMedia === "function" ? window.matchMedia(MEDIA) : null;
  media?.addEventListener("change", () => {
    if (readThemePref() === "system") commit("system", false);
  });
  window.addEventListener("storage", (event) => {
    if (event.key !== THEME_KEY) return;
    commit(isThemePref(event.newValue) ? event.newValue : "system", false);
  });
  // Re-check once in case the OS theme changed between the boot script and hydration.
  const pref = readThemePref();
  if (resolveDark(pref) !== isDark()) commit(pref, false);
}

type ThemeChoiceListener = (pref: ThemePref) => void;
let choiceListener: ThemeChoiceListener | null = null;

/** Lets the account store persist a pick without the picker importing the store. */
export function onThemePrefChosen(listener: ThemeChoiceListener) {
  choiceListener = listener;
}

/** The user picked a theme. Applies now and remembers it on this device. */
export function setThemePref(pref: ThemePref) {
  chosenHere = true;
  commit(pref, true);
  choiceListener?.(pref);
}

/**
 * Reconciles this device with the signed-in account.
 * Returns the preference the account should be updated to, or null.
 */
export function adoptAccountTheme(accountPref: string | undefined | null): ThemePref | null {
  if (typeof window === "undefined") return null;
  wire();
  const local = storedPref();
  if (chosenHere) {
    const current = local ?? "system";
    return accountPref === current ? null : current;
  }
  if (isThemePref(accountPref)) {
    if (accountPref !== local) commit(accountPref, true);
    return null;
  }
  // The account has never saved a choice: keep an explicit one from this device.
  return local;
}

export function subscribeTheme(listener: () => void) {
  wire();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function themeSnapshot() {
  if (snapshot === null) snapshot = `${readThemePref()}|${isDark() ? "dark" : "light"}`;
  return snapshot;
}

export function serverThemeSnapshot() {
  return "system|light";
}
