import { useCallback, useMemo, useState } from "react";

import { useAppraisal } from "@/lib/appraisal-store";
import { useBudget } from "@/lib/budget-store";

/*
 * Dynamic notices for the Appraisal Sheet bell and the Detailed Screen banner.
 * Built only from data the app already loads (no new fetch / backend):
 *   - budget changed        <- Budget context (original vs updated budget)
 *   - bulk edit             <- audit trail (source "Bulk edit")
 *   - data upload / import  <- audit trail (source "Import")
 *   - employee status change (Active <-> Inactive) <- audit trail
 *                              (source "Status change")
 * "Got it" remembers the notice in this browser; a NEW change makes a new
 * notice (new signature), so it shows up again.
 *
 * notice = { key, kind, tag, text, sub, at }
 */

const DISMISSED_KEY = "appraisal.notices.dismissed.v1";
const RECENT_DAYS = 14;
const DAY_MS = 86400000;

const readDismissed = () => {
  // Notices can no longer be dismissed ("Got it" was removed), so ignore any
  // dismissals saved by older versions; they must always show.
  return [];
  // eslint-disable-next-line no-unreachable
  try {
    const parsed = JSON.parse(window.localStorage.getItem(DISMISSED_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

const writeDismissed = (list) => {
  try {
    window.localStorage.setItem(DISMISSED_KEY, JSON.stringify(list.slice(-200)));
  } catch (_) {
    // storage unavailable — dismissal lasts for this page view only
  }
};

const money = (n) =>
  Math.round(Number(n) || 0).toLocaleString("en-IN");

const when = (iso) => {
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  return `${days} d ago`;
};

const atOf = (entry) => {
  const t = new Date(entry?.at).getTime();
  return Number.isFinite(t) ? t : 0;
};

const sourceIs = (entry, word) =>
  String(entry?.source || "").toLowerCase().includes(word);

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function buildNotices({ audit = [], totals = null }) {
  const out = [];
  const now = Date.now();
  const recent = (Array.isArray(audit) ? audit : [])
    .filter((entry) => entry && now - atOf(entry) <= RECENT_DAYS * DAY_MS)
    .sort((a, b) => atOf(b) - atOf(a));

  /* ---- budget changed ---- */
  const original = Number(totals?.base) || 0;
  const updated = Number(totals?.updated) || 0;
  if (original > 0 && updated > 0 && Math.abs(updated - original) >= 1) {
    out.push({
      key: `budget:${Math.round(original)}:${Math.round(updated)}`,
      kind: "budget",
      tag: "Budget changed",
      text: `Be aware: your team budget has changed from ${money(original)} to ${money(updated)}.`,
      sub: "",
      at: "",
    });
  }

  /* ---- bulk edit (latest batch) ---- */
  const bulk = recent.filter((entry) => sourceIs(entry, "bulk"));
  if (bulk.length) {
    const first = bulk[0];
    const batch = first.batchId
      ? bulk.filter((entry) => entry.batchId === first.batchId)
      : bulk.filter((entry) => Math.abs(atOf(entry) - atOf(first)) < 120000);
    const people = new Set(batch.map((entry) => String(entry.empId || "")));
    const fields = [...new Set(batch.map((entry) => entry.field).filter(Boolean))];
    out.push({
      key: `bulk:${first.batchId || first.id}:${batch.length}`,
      kind: "bulk",
      tag: "Bulk edit",
      text: `${first.user || "Someone"} bulk-edited ${fields.slice(0, 3).join(", ") || "values"} for ${plural(people.size, "employee", "employees")}.`,
      sub: when(first.at),
      at: first.at,
    });
  }

  /* ---- data upload / import (latest run) ---- */
  const imports = recent.filter((entry) => sourceIs(entry, "import"));
  if (imports.length) {
    const first = imports[0];
    const run = imports.filter(
      (entry) =>
        String(entry.user || "") === String(first.user || "") &&
        Math.abs(atOf(entry) - atOf(first)) < 30 * 60000,
    );
    const people = new Set(run.map((entry) => String(entry.empId || "")));
    out.push({
      key: `import:${first.id}:${run.length}`,
      kind: "upload",
      tag: "Data upload",
      text: `${first.user || "Someone"} uploaded data: ${plural(people.size, "employee", "employees")} added or updated.`,
      sub: when(first.at),
      at: first.at,
    });
  }

  /* ---- employee status changes (Active <-> Inactive) ---- */
  const statusRows = recent.filter((entry) => sourceIs(entry, "status"));
  if (statusRows.length) {
    const first = statusRows[0];
    const shown = statusRows.slice(0, 3).map((entry) => {
      const to = String(entry.to || "").trim();
      return `${entry.employeeName || entry.empId} → ${to || "updated"}`;
    });
    const more = statusRows.length - shown.length;
    out.push({
      key: `status:${first.id}:${statusRows.length}`,
      kind: "status",
      tag: "Status changed",
      text: `Employee status changed: ${shown.join(", ")}${more > 0 ? ` and ${more} more` : ""}.`,
      sub: when(first.at),
      at: first.at,
    });
  }

  return out;
}

/* Hook: the notices still to be read, plus dismiss helpers. */
export function useNotices() {
  const { audit } = useAppraisal();
  const { totals } = useBudget();
  const [dismissed, setDismissed] = useState(readDismissed);

  const all = useMemo(() => buildNotices({ audit, totals }), [audit, totals]);

  const notices = useMemo(
    () => all.filter((notice) => !dismissed.includes(notice.key)),
    [all, dismissed],
  );

  const dismiss = useCallback((keys) => {
    const list = Array.isArray(keys) ? keys : [keys];
    setDismissed((previous) => {
      const next = [...new Set([...previous, ...list])];
      writeDismissed(next);
      return next;
    });
  }, []);

  return { notices, dismiss, dismissAll: () => dismiss(notices.map((n) => n.key)) };
}