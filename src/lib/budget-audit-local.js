import { useEffect, useState } from "react";

/* Budget audit trail kept in the browser's localStorage (no Data Store table).

   - One store per signed-in user, holding a single appraisal cycle.
   - When the active appraisal cycle changes, the old cycle's trail and
     snapshots are discarded (the trail lives only while its cycle is active).
   - Changes made in this browser are recorded with the real before/after
     values. Changes made elsewhere (for example by HR on another computer)
     are detected by comparing every saved row with the snapshot taken the
     last time this browser loaded it, so Old % and Budget before still show.
*/

const STORE_PREFIX = "appraisal-budget-audit-v2:";
export const BUDGET_AUDIT_EVENT = "appraisal:budget-audit-local-updated";
const MAX_ENTRIES = 500;

const pad = (n) => String(n).padStart(2, "0");
const normalize = (value) => String(value || "").trim().toLowerCase().replace(/\s+/g, " ");

// "EMP001 - Name" -> "emp001"; plain id or name -> itself (same rule as the screens).
export function auditOwnerKey(value) {
  const text = normalize(value);
  if (!text) return "";
  const parts = text.split(/\s+-\s+/);
  return parts.length > 1 ? parts[0] : text;
}

export function auditUserKey(user) {
  return normalize(user && (user.email || user.name));
}

export function nowStamp() {
  const d = new Date();
  return {
    date: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()),
    time: pad(d.getHours()) + ":" + pad(d.getMinutes()),
  };
}

// Catalyst returns "2026-10-28 14:03:22:123". Read the clock exactly as written
// (no timezone shifting). Blank input gives blank parts.
export function splitStamp(value) {
  const text = String(value || "").trim();
  if (!text) return { date: "", time: "" };
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/);
  if (match && !/(Z|[+-]\d{2}:?\d{2})$/.test(text.slice(10))) {
    return { date: match[1] + "-" + match[2] + "-" + match[3], time: match[4] + ":" + match[5] };
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return { date: "", time: "" };
  return {
    date: parsed.getFullYear() + "-" + pad(parsed.getMonth() + 1) + "-" + pad(parsed.getDate()),
    time: pad(parsed.getHours()) + ":" + pad(parsed.getMinutes()),
  };
}

const keyFor = (userKey) => STORE_PREFIX + userKey;
const emptyStore = (cycleId) => ({ cycleId: String(cycleId || ""), entries: [], snapshot: {} });

function readStore(userKey, cycleId) {
  if (typeof window === "undefined" || !userKey || !cycleId) return emptyStore(cycleId);
  try {
    const parsed = JSON.parse(window.localStorage.getItem(keyFor(userKey)) || "null");
    if (!parsed || String(parsed.cycleId) !== String(cycleId)) return emptyStore(cycleId); // new cycle -> start clean
    return {
      cycleId: String(cycleId),
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
      snapshot: parsed.snapshot && typeof parsed.snapshot === "object" ? parsed.snapshot : {},
    };
  } catch (error) {
    console.error("Could not read the budget audit trail:", error);
    return emptyStore(cycleId);
  }
}

function writeStore(userKey, store) {
  if (typeof window === "undefined" || !userKey || !store.cycleId) return;
  try {
    const entries = store.entries.slice(-MAX_ENTRIES);
    window.localStorage.setItem(keyFor(userKey), JSON.stringify({ ...store, entries }));
    window.dispatchEvent(new CustomEvent(BUDGET_AUDIT_EVENT));
  } catch (error) {
    console.error("Could not save the budget audit trail:", error);
  }
}

export function readBudgetAudit(userKey, cycleId) {
  return readStore(userKey, cycleId).entries;
}

const toNumberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

function buildEntry({ level, rowId, parentId, ownerKey, name, from, to, before, after, by, reason, stamp }) {
  const parts = stamp && (stamp.date || stamp.time) ? stamp : nowStamp();
  return {
    id: level + ":" + rowId + ":" + Date.now() + ":" + Math.random().toString(36).slice(2, 7),
    level,
    rowId: String(rowId || ""),
    parentId: String(parentId || ""),
    ownerKey: ownerKey || "",
    name: name || "",
    from: toNumberOrNull(from),
    to: toNumberOrNull(to),
    before: toNumberOrNull(before),
    after: toNumberOrNull(after),
    by: by || "",
    reason: reason || "",
    date: parts.date,
    time: parts.time,
    at: parts.date + "T" + (parts.time || "00:00") + ":00",
  };
}

const snapshotKey = (level, rowId) => level + ":" + rowId;

/* Record a change made from this browser (before = what the screen held). */
export function recordBudgetChange(userKey, cycleId, change) {
  if (!userKey || !cycleId || !change || !change.rowId) return;
  const store = readStore(userKey, cycleId);
  const samePct = toNumberOrNull(change.from) === toNumberOrNull(change.to);
  const sameAmount = Math.abs((toNumberOrNull(change.before) ?? 0) - (toNumberOrNull(change.after) ?? 0)) < 1;
  if (samePct && sameAmount) {
    store.snapshot[snapshotKey(change.level, change.rowId)] = {
      pct: toNumberOrNull(change.to),
      applied: toNumberOrNull(change.after),
    };
    writeStore(userKey, store);
    return;
  }
  store.entries.push(buildEntry(change));
  store.snapshot[snapshotKey(change.level, change.rowId)] = {
    pct: toNumberOrNull(change.to),
    applied: toNumberOrNull(change.after),
  };
  writeStore(userKey, store);
}

/* Compare saved rows with the last snapshot and log anything that differs.
   items: [{ level, rowId, parentId, ownerKey, name, pct, applied, stamp }]  */
export function syncBudgetSnapshots(userKey, cycleId, items) {
  if (!userKey || !cycleId || !Array.isArray(items)) return;
  const store = readStore(userKey, cycleId);
  let dirty = false;
  items.forEach((item) => {
    if (!item || !item.rowId) return;
    const key = snapshotKey(item.level, item.rowId);
    const pct = toNumberOrNull(item.pct);
    const applied = toNumberOrNull(item.applied);
    const previous = store.snapshot[key];
    if (!previous) {
      store.snapshot[key] = { pct, applied };
      dirty = true;
      return;
    }
    const pctChanged = (previous.pct === null) !== (pct === null) ||
      (pct !== null && Math.abs(previous.pct - pct) > 0.0001);
    const amountChanged = Math.abs((previous.applied ?? 0) - (applied ?? 0)) >= 1;
    if (!pctChanged && !amountChanged) return;
    store.entries.push(buildEntry({
      level: item.level,
      rowId: item.rowId,
      parentId: item.parentId,
      ownerKey: item.ownerKey,
      name: item.name,
      from: previous.pct,
      to: pct,
      before: previous.applied,
      after: applied,
      by: "Budget admin",
      reason: pctChanged ? "Changed outside this browser" : "Budget amount changed (base / headcount update)",
      stamp: splitStamp(item.stamp),
    }));
    store.snapshot[key] = { pct, applied };
    dirty = true;
  });
  if (dirty) writeStore(userKey, store);
}

/* React hook: the audit entries of the active cycle, live-updated. */
export function useBudgetAuditLog(userKey, cycleId) {
  const [entries, setEntries] = useState([]);
  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const refresh = () => setEntries(readBudgetAudit(userKey, cycleId));
    refresh();
    window.addEventListener(BUDGET_AUDIT_EVENT, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(BUDGET_AUDIT_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [userKey, cycleId]);
  return entries;
}