"use client";

import { useEffect, useState } from "react";
import { recall, remember } from "./last-good";

export interface Polled<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
}

/**
 * Fetches JSON from one of this app's routes, and again every `intervalMs` while the tab is visible.
 * A hidden tab still gets its first load, and catches up as soon as it is shown again.
 * Pass null to wait. The last good data stays on screen through a failed refresh.
 *
 * A route that answered recently, on this page or another, starts with that answer on screen
 * instead of a blank, and is fetched again at once. `loading` is only true while there is nothing to show.
 */
export function usePoll<T>(url: string | null, intervalMs = 0): Polled<T> {
  const [state, setState] = useState<Polled<T> & { url: string | null }>(() => {
    const known = url ? recall<T>(url) : undefined;
    return { data: known, error: null, loading: known === undefined, url };
  });

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    let loaded = false;
    const load = async () => {
      try {
        const res = await fetch(url);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(body?.error ?? "That data is unavailable right now.");
        loaded = true;
        remember(url, body);
        setState({ data: body as T, error: null, loading: false, url });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "That data is unavailable right now.";
        setState((previous) => ({ data: previous.url === url ? previous.data : recall<T>(url), error: message, loading: false, url }));
      }
    };
    // Refreshes pause while the tab is hidden, but the first load never does: a page opened in a
    // background tab must still have its data when the person switches to it.
    const refresh = () => {
      if (!document.hidden) void load();
    };
    const onVisible = () => {
      if (!document.hidden && (intervalMs > 0 || !loaded)) void load();
    };
    void load();
    const timer = intervalMs > 0 ? setInterval(refresh, intervalMs) : undefined;
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [url, intervalMs]);

  // Data fetched for a previous url must not be shown under a new one. What this url last answered may be.
  if (state.url !== url) {
    const known = url ? recall<T>(url) : undefined;
    return { data: known, error: null, loading: url != null && known === undefined };
  }
  return { data: state.data, error: state.error, loading: state.loading };
}
