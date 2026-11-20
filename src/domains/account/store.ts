"use client";

import { useSyncExternalStore } from "react";
import { ledgerSchema, replay, STARTING_BALANCE, type Account, type LedgerEvent } from "./ledger";

const KEY = "cushion.ledger.v1";
const EMPTY: Account = replay([]);

let events: LedgerEvent[] | null = null;
let account: Account = EMPTY;
const listeners = new Set<() => void>();

function read(): LedgerEvent[] {
  try {
    // localStorage is outside the app's control, so a log that no longer parses starts a fresh account.
    const parsed = ledgerSchema.safeParse(JSON.parse(localStorage.getItem(KEY) ?? "[]"));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function load() {
  if (events) return;
  events = read();
  account = replay(events);
}

function notify() {
  listeners.forEach((listener) => listener());
}

export function record(event: LedgerEvent) {
  load();
  events = [...events!, event];
  account = replay(events);
  try {
    localStorage.setItem(KEY, JSON.stringify(events));
  } catch {
    // Storage full or blocked: the account still works for this visit.
  }
  notify();
}

export const resetAccount = () => record({ type: "AccountReset", at: new Date().toISOString(), balance: STARTING_BALANCE });

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    events = null;
    load();
    notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function snapshot(): Account {
  load();
  return account;
}

export const useAccount = () => useSyncExternalStore(subscribe, snapshot, () => EMPTY);
