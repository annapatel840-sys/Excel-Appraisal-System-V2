import { useCallback, useEffect, useSyncExternalStore } from "react";

import { getSheetLayout, saveSheetLayout } from "@/lib/access-admin-api";

// Appraisal Sheet column order that HR sets once for everyone (every login,
// every view, every location). The order is saved by accessapi (/sheet-layout)
// and cached in this browser so the sheet does not flash the default order.

const CACHE_KEY = "appraisal-sheet-shared-order";
const STALE_MS = 60_000;
const listeners = new Set();

function readCache() {
  try {
    const list = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "[]");
    return Array.isArray(list) ? list.filter((key) => typeof key === "string") : [];
  } catch {
    return [];
  }
}

let sharedOrder = typeof window === "undefined" ? [] : readCache();
let fetchedAt = 0;
let inflight = null;

function setShared(next) {
  const clean = Array.isArray(next) ? next.filter((key) => typeof key === "string" && key) : [];
  if (JSON.stringify(clean) === JSON.stringify(sharedOrder)) return;
  sharedOrder = clean;
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(clean));
  } catch {
    // storage full or blocked: the order still works for this session
  }
  listeners.forEach((listener) => listener());
}

function load(force) {
  if (inflight) return inflight;
  if (!force && Date.now() - fetchedAt < STALE_MS) return Promise.resolve();
  inflight = getSheetLayout()
    .then((data) => {
      fetchedAt = Date.now();
      setShared(data?.order);
    })
    .catch(() => {
      // accessapi unavailable: keep the cached / default order
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

const subscribe = (listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

// Drops unknown / repeated keys, keeps "name" first, and puts any column that
// is not in the saved order (a newly added one) after the column that precedes
// it in the default order.
export function mergeColumnOrder(shared, defaults) {
  const known = new Set(defaults);
  const result = (shared || []).filter(
    (key, index) => known.has(key) && shared.indexOf(key) === index,
  );
  if (!result.length) return defaults;

  defaults.forEach((key, index) => {
    if (result.includes(key)) return;
    let at = -1;
    for (let back = index - 1; back >= 0 && at < 0; back -= 1) {
      at = result.indexOf(defaults[back]);
    }
    result.splice(at + 1, 0, key);
  });

  if (defaults[0] && result[0] !== defaults[0]) {
    return [defaults[0], ...result.filter((key) => key !== defaults[0])];
  }
  return result;
}

// Moves `key` straight before / after `targetKey` in the full order.
export function moveColumn(order, key, targetKey, side) {
  if (!key || !targetKey || key === targetKey) return order;
  const rest = order.filter((item) => item !== key);
  const at = rest.indexOf(targetKey);
  if (at < 0) return order;
  rest.splice(side === "after" ? at + 1 : at, 0, key);
  return rest;
}

export function useSharedColumnOrder() {
  const order = useSyncExternalStore(
    subscribe,
    () => sharedOrder,
    () => [],
  );

  useEffect(() => {
    load(false);
    const refresh = () => load(false);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  // Throws when the server refuses (not HR, accessapi down) so the caller can show why.
  const save = useCallback(async (next) => {
    const data = await saveSheetLayout(next);
    fetchedAt = Date.now();
    setShared(data?.order || next);
  }, []);

  return { order, save };
}