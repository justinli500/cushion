"use client";

import { useEffect, useState } from "react";

export interface Polled<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
}

/**
 * Fetches JSON from one of this app's routes, and again every `intervalMs` while the tab is visible.
 * Pass null to wait. The last good data stays on screen through a failed refresh.
 */
export function usePoll<T>(url: string | null, intervalMs = 0): Polled<T> {
  const [state, setState] = useState<Polled<T> & { url: string | null }>({ data: undefined, error: null, loading: true, url });

  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const load = async () => {
      if (document.hidden) return;
      try {
        const res = await fetch(url);
        const body = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(body?.error ?? "That data is unavailable right now.");
        setState({ data: body as T, error: null, loading: false, url });
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : "That data is unavailable right now.";
        setState((previous) => ({ data: previous.url === url ? previous.data : undefined, error: message, loading: false, url }));
      }
    };
    load();
    const timer = intervalMs > 0 ? setInterval(load, intervalMs) : undefined;
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [url, intervalMs]);

  // Data fetched for a previous url must not be shown under a new one.
  if (state.url !== url) return { data: undefined, error: null, loading: url != null };
  return { data: state.data, error: state.error, loading: state.loading };
}
