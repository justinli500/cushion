"use client";

import { cn } from "@/lib/utils";

/** Where the chosen theme is kept. With nothing saved, the system setting decides. */
export const THEME_KEY = "cushion-theme";

/**
 * Runs in <head> before the first paint, so the page never flashes the wrong theme: the saved
 * choice if there is one, otherwise the system's.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");var d=t?t==="dark":window.matchMedia("(prefers-color-scheme: dark)").matches;document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

/**
 * Switches between light (the handoff with the Drop's brand) and dark (the Drop everywhere). The
 * icon follows the class on <html>, so it is right from the first paint with no state to hydrate.
 */
export function ThemeToggle({ className }: { className?: string }) {
  const toggle = () => {
    const dark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    } catch {
      // Private windows can refuse storage: the switch still works for this visit.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Switch between light and dark"
      className={cn("press inline-flex size-11 items-center justify-center rounded-full text-foreground hover:bg-accent", className)}
    >
      {/* Moon in light mode (go dark), sun in dark mode (go light). */}
      <svg aria-hidden="true" className="size-5 dark:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
      <svg aria-hidden="true" className="hidden size-5 dark:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
      </svg>
    </button>
  );
}
