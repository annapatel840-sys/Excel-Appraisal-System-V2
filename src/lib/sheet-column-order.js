import { useCallback, useEffect, useSyncExternalStore } from "react";

import { getSheetLayout, saveSheetLayout } from "@/lib/access-admin-api";

// Appraisal Sheet column order that HR sets for one location. It is saved by
// accessapi (/sheet-layout) and seen by every login and view of that location;
// other locations keep their own order. "All" is the All Locations view.
// The order is also cached in this browser so the sheet does not flash the
// default order while it loads.

const CACHE_PREFIX = "appraisal-sheet-order:";
const STALE_MS = 60_000;
const listeners = new Set();
const orders = new Map(); // location key -> saved order
const fetchedAt = new Map();
const inflight = new Map();

const nameOf = (location) => String(location || "").trim() || "All";
const keyOf = (location) => nameOf(location).toLowerCase();

function readCache(key) {
  try {
    const list = JSON.parse(window.localStorage.getItem(CACHE_PREFIX + key) || "[]");
    return Array.isArray(list) ? list.filter((item) => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function orderOf(key) {
  if (!orders.has(key)) orders.set(key, typeof window === "undefined" ? [] : readCache(key));
  return orders.get(key);
}

function setShared(key, next) {
  const clean = Array.isArray(next) ? next.filter((item) => typeof item === "string" && item) : [];
  if (JSON.stringify(clean) === JSON.stringify(orderOf(key))) return;
  orders.set(key, clean);
  try {
    window.localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(clean));
  } catch {
    // storage full or blocked: the order still works for this session
  }
  listeners.forEach((listener) => listener());
}

function load(location, force) {
  const key = keyOf(location);
  if (inflight.has(key)) return inflight.get(key);
  if (!force && Date.now() - (fetchedAt.get(key) || 0) < STALE_MS) return Promise.resolve();
  const promise = getSheetLayout(nameOf(location))
    .then((data) => {
      fetchedAt.set(key, Date.now());
      setShared(key, data?.order);
    })
    .catch(() => {
      // accessapi unavailable: keep the cached / default order
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
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

// `location` is the selected location ("All" for All Locations).
export function useSharedColumnOrder(location) {
  const key = keyOf(location);
  const order = useSyncExternalStore(
    subscribe,
    () => orderOf(key),
    () => [],
  );

  useEffect(() => {
    load(location, false);
    const refresh = () => load(location, false);
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [key, location]);

  // Throws when the server refuses (not HR, accessapi down) so the caller can show why.
  const save = useCallback(
    async (next) => {
      const data = await saveSheetLayout(next, nameOf(location));
      fetchedAt.set(key, Date.now());
      setShared(key, data?.order || next);
    },
    [key, location],
  );

  return { order, save };
}