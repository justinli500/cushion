"use client";

import { useSyncExternalStore } from "react";
import { z } from "zod";

/**
 * What the person has told the app about their life. Each section owns one slice and the Today
 * feed reads them all. Kept in the browser only.
 */
export const profileSchema = z.object({
  /** Portfolio: `symbol` is a ticker such as BTC or XOM, `value` is dollars held. */
  holdings: z.array(z.object({ symbol: z.string(), value: z.number() })).default([]),
  /** Games: the team the person roots for, by league and abbreviation, e.g. NFL / HOU. */
  team: z.object({ league: z.string(), abbr: z.string(), name: z.string() }).nullable().default(null),
  bills: z
    .object({
      gasGallonsPerMonth: z.number().nullable().default(null),
      /** How the gallons were worked out, when the person chose a car and a distance: a `CARS` id and miles a month. */
      car: z.string().nullable().default(null),
      milesPerMonth: z.number().nullable().default(null),
      heatingBillPerMonth: z.number().nullable().default(null),
      mode: z.enum(["spike", "full"]).default("spike"),
      autopilot: z.boolean().default(false),
      /** The last day (YYYY-MM-DD) the autopilot bought cover, so it buys once a day. */
      lastRun: z.string().nullable().default(null),
    })
    .default({ gasGallonsPerMonth: null, car: null, milesPerMonth: null, heatingBillPerMonth: null, mode: "spike", autopilot: false, lastRun: null }),
  /** Fantasy: player names exactly as Gemini lists them, e.g. "Jonathan Taylor". */
  fantasy: z
    .object({
      players: z.array(z.string()).default([]),
      /** Dollars riding on this week's matchup. */
      stake: z.number().default(50),
    })
    .default({ players: [], stake: 50 }),
  /** Small business: `type` is a preset id from domains/exposure/business. */
  business: z
    .object({ type: z.string().nullable().default(null), city: z.string().nullable().default(null) })
    .default({ type: null, city: null }),
});

export type Profile = z.infer<typeof profileSchema>;

const KEY = "cushion.profile.v1";
const EMPTY: Profile = profileSchema.parse({});

let profile: Profile | null = null;
const listeners = new Set<() => void>();

/** The profile as storage has it right now, or null when storage cannot be read or does not parse. */
export function storedProfile(): Profile | null {
  try {
    const parsed = profileSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? "{}"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function load(): Profile {
  profile ??= storedProfile() ?? EMPTY;
  return profile;
}

/** Replaces one slice of the profile, e.g. updateProfile("team", {...}). */
export function updateProfile<K extends keyof Profile>(slice: K, value: Profile[K]) {
  // Start from what is stored, not from this tab's copy, so a tab that has been open a while does
  // not write its old view of the other slices over what another tab saved since.
  profile = { ...(storedProfile() ?? load()), [slice]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(profile));
  } catch {
    // Storage full or blocked: the change still holds for this visit.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab saved: pick up its change.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== KEY) return;
    profile = null;
    listeners.forEach((each) => each());
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export const useProfile = () => useSyncExternalStore(subscribe, load, () => EMPTY);
