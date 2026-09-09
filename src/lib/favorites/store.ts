"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * The visitor's saved cars, kept in their own browser.
 *
 * ## What is stored, and what deliberately is not
 *
 * Model ids and nothing else. Not the price, not the photo, not the name —
 * those are read from the live fleet every time a saved car is rendered, so a
 * price changed in the admin panel is the price the visitor sees the moment
 * they reload, and a car that has been unpublished simply stops appearing. A
 * snapshot of car data in `localStorage` would be a second, stale copy of the
 * fleet that nobody could see to correct.
 *
 * The id is the same on `/` and on `/en`, so the selection survives a language
 * switch without any extra work.
 *
 * ## No account required
 *
 * There is no login here and no server call. The list lives on the device that
 * made it, which is the honest scope for "cars I am thinking about" — and it
 * means the feature carries no personal data at all.
 */

const KEY = "aa.saved.v1";

/**
 * A ceiling, so a stuck loop or a bored visitor cannot grow the entry without
 * bound. Far above any real selection; the compare view has its own, much
 * smaller limit.
 */
const MAX_SAVED = 40;

/** UUID shape — anything else in storage is somebody else's data or corruption. */
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Broadcast within this tab; `storage` covers the others by itself. */
const EVENT = "aa:saved-changed";

const listeners = new Set<() => void>();

/**
 * The parsed list, cached.
 *
 * `useSyncExternalStore` compares snapshots by identity and re-renders whenever
 * they differ, so returning a freshly-parsed array on every call would loop for
 * ever. The cache is invalidated on write and on a `storage` event, which is
 * exactly when the value can actually have changed.
 */
let cache: readonly string[] | null = null;

function parse(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((v): v is string => typeof v === "string" && ID_RE.test(v))
      .slice(0, MAX_SAVED);
  } catch {
    // Corrupt or hand-edited: treat as empty rather than throwing on a page the
    // visitor is simply trying to read.
    return [];
  }
}

export function readSaved(): readonly string[] {
  if (typeof window === "undefined") return [];
  if (cache) return cache;
  try {
    cache = parse(window.localStorage.getItem(KEY));
  } catch {
    // Private mode, storage disabled, quota — the site keeps working without
    // the feature rather than failing on the first render.
    cache = [];
  }
  return cache;
}

function write(next: readonly string[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* saving is best-effort; the in-memory value still drives this session */
  }
  window.dispatchEvent(new Event(EVENT));
  for (const l of listeners) l();
}

export function isSaved(id: string): boolean {
  return readSaved().includes(id);
}

/** Add or remove, returning the new state of that one car. */
export function toggleSaved(id: string): boolean {
  if (!ID_RE.test(id)) return false;
  const current = readSaved();
  const next = current.includes(id)
    ? current.filter((x) => x !== id)
    : [id, ...current].slice(0, MAX_SAVED);
  write(next);
  return next.includes(id);
}

export function removeSaved(id: string) {
  const current = readSaved();
  if (!current.includes(id)) return;
  write(current.filter((x) => x !== id));
}

/**
 * Drop ids the fleet no longer has.
 *
 * Called by the pages that render saved cars, with the ids the server actually
 * returned. A car retired or unpublished in the admin panel therefore leaves
 * the visitor's list the first time they look at it, instead of lingering as an
 * id that renders nothing.
 */
export function pruneSaved(existing: readonly string[]) {
  const current = readSaved();
  const kept = current.filter((id) => existing.includes(id));
  if (kept.length !== current.length) write(kept);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) {
      cache = null;
      listener();
    }
  };
  const onLocal = () => listener();
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVENT, onLocal);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVENT, onLocal);
  };
}

const EMPTY: readonly string[] = [];

/**
 * The saved list, live.
 *
 * The server snapshot is empty on purpose: the server cannot know what is in
 * this browser, and rendering a guess would produce a filled heart that flips
 * to empty on hydration. Empty first, correct immediately after.
 */
export function useSaved() {
  const ids = useSyncExternalStore(
    subscribe,
    readSaved,
    () => EMPTY,
  );
  const toggle = useCallback((id: string) => toggleSaved(id), []);
  const remove = useCallback((id: string) => removeSaved(id), []);
  return { ids, toggle, remove, count: ids.length };
}
