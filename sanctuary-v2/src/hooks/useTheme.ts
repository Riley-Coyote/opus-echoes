import { useCallback, useEffect, useState } from "react";

export type Theme = "dark" | "light";

const STORAGE_KEY = "sanctuary-theme";
const THEME_COLOR: Record<Theme, string> = { dark: "#070707", light: "#e7e2d6" };

function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme;
  return t === "light" ? "light" : "dark";
}

/**
 * The theme is set before first paint by the inline script in index.html, so
 * there is never a flash. This hook reads that value and lets the room flip it,
 * persisting the choice and keeping the browser chrome (theme-color) in step.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(currentTheme);

  const apply = useCallback((next: Theme) => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private mode — the in-memory value still holds for this visit */
    }
    // keep the fixed theme-color meta honest (some are media-scoped; set both)
    document
      .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
      .forEach((m) => {
        m.setAttribute("content", THEME_COLOR[next]);
      });
    setThemeState(next);
  }, []);

  const toggle = useCallback(() => {
    apply(currentTheme() === "dark" ? "light" : "dark");
  }, [apply]);

  // Stay in sync if another tab flips the theme.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && e.newValue) {
        apply(e.newValue === "light" ? "light" : "dark");
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [apply]);

  return { theme, toggle, setTheme: apply };
}
