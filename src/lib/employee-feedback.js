import { useEffect, useMemo, useState } from "react";

import { loadFeedbackRating } from "./feedback-rating-api";

/*
 * Feedback & Rating data for ONE employee, for the Appraisal Sheet right panel
 * and the Detail screen. It reuses the existing loadFeedbackRating() call (the
 * same data the Feedback & Rating Master screen shows) and loads it only once
 * per page load; every screen then reads its employee's rows from that cache.
 *
 * Access: HR receives every employee's rows. Tech ED / Comp Manager logins
 * receive only the rows of their own team (the backend scopes them). If a
 * login has no access at all the call is refused (403) -> hook returns
 * { denied: true, items: [] } and the screens keep showing what they showed
 * before.
 */

const keyOf = (value) => String(value ?? "").trim().toLowerCase();
export const cycleKey = (value) => keyOf(value).replace(/[^a-z0-9]/g, "");

let cachePromise = null;

function groupByEmployee(data) {
  const cycleNameById = new Map(
    (data?.cycles || []).map((cycle) => [String(cycle.id), cycle.name]),
  );
  const byEmployee = new Map();

  (data?.rows || []).forEach((row) => {
    const empKey = keyOf(row.id);
    if (!empKey) return;

    const item = { ...row, cycleName: cycleNameById.get(String(row.cid)) || "" };
    const list = byEmployee.get(empKey) || [];
    list.push(item);
    byEmployee.set(empKey, list);
  });

  // newest first: by effective date, then by cycle name
  byEmployee.forEach((list) =>
    list.sort(
      (a, b) =>
        String(b.eff || "").localeCompare(String(a.eff || "")) ||
        String(b.cycleName).localeCompare(String(a.cycleName)),
    ),
  );

  return byEmployee;
}

function loadAll() {
  if (!cachePromise) {
    cachePromise = loadFeedbackRating()
      .then(groupByEmployee)
      .catch((error) => {
        cachePromise = null; // allow a retry on the next mount
        throw error;
      });
  }

  return cachePromise;
}

export function useEmployeeFeedback(empId) {
  const [state, setState] = useState({ status: "loading", map: null, error: "" });

  useEffect(() => {
    let cancelled = false;

    const load = () => {
      setState({ status: "loading", map: null, error: "" });
      loadAll()
        .then((map) => {
          if (!cancelled) setState({ status: "ready", map, error: "" });
        })
        .catch((error) => {
          if (cancelled) return;
          setState({
            status: error?.status === 403 ? "denied" : "error",
            map: null,
            error: error?.message || "Could not load feedback.",
          });
        });
    };

    const reloadAfterUpload = () => {
      // Invalidate this page-lifetime cache after a row is inserted/replaced.
      cachePromise = null;
      load();
    };

    load();
    if (typeof window !== "undefined") {
      window.addEventListener("appraisal:feedback-data-updated", reloadAfterUpload);
    }

    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("appraisal:feedback-data-updated", reloadAfterUpload);
      }
    };
  }, []);

  const items = useMemo(
    () => (state.map ? state.map.get(keyOf(empId)) || [] : []),
    [state.map, empId],
  );

  return {
    loading: state.status === "loading",
    denied: state.status === "denied",
    error: state.status === "error" ? state.error : "",
    items,
  };
}

const hasValue = (value) =>
  value !== undefined && value !== null && value !== "" && value !== 0;
const num1 = (value) => String(Math.round(Number(value) * 100) / 100);

/*
 * Turns the employee's rows into timeline entries for one tab.
 *   tab = "manager" | "client" | "other"
 *   entry = { key, cycleKey, cycle, current, title, sub, chips: [{label, value}], text }
 * fallback = entries built by the screen from its older data (history). Those
 * whose cycle has no feedback row are appended, so nothing disappears.
 */
export function buildFeedbackEntries(tab, items, { currentCycleName, fallback = [] } = {}) {
  const currentKey = cycleKey(currentCycleName);

  const base = (item, index) => ({
    key: `${item.rowId || item.cid}-${index}`,
    cycleKey: cycleKey(item.cycleName),
    cycle: item.cycleName || "—",
    current: !!currentKey && cycleKey(item.cycleName) === currentKey,
  });

  let entries = [];

  if (tab === "manager") {
    entries = items
      .filter((item) => hasValue(item.mr) || hasValue(item.mf))
      .map((item, index) => ({
        ...base(item, index),
        title: item.desig || "",
        sub: "",
        chips: hasValue(item.mr)
          ? [{ label: "Manager rating", value: `${num1(item.mr)} / 5` }]
          : [],
        text: item.mf || "",
      }));
  } else if (tab === "client") {
    entries = items
      .filter((item) => hasValue(item.cr) || hasValue(item.cf) || hasValue(item.cm) || hasValue(item.client))
      .map((item, index) => ({
        ...base(item, index),
        title: item.client || "",
        sub: item.cm ? `Client manager: ${item.cm}` : "",
        chips: hasValue(item.cr)
          ? [{ label: "Client rating", value: num1(item.cr) }]
          : [],
        text: item.cf || "",
      }));
  } else {
    entries = items.map((item, index) => ({
      ...base(item, index),
      title: "",
      sub: [
        item.ccm ? `Comp manager: ${item.ccm}` : "",
        item.te ? `Tech ED: ${item.te}` : "",
      ]
        .filter(Boolean)
        .join(" · "),
      chips: [
        { label: "RR %", value: hasValue(item.rr) ? `${num1(item.rr)}%` : "—" },
        { label: "Interview count", value: hasValue(item.ic) ? String(item.ic) : "—" },
        { label: "Gross margin", value: hasValue(item.gm) ? num1(item.gm) : "—" },
        { label: "YoE ratio", value: hasValue(item.yoe) ? num1(item.yoe) : "—" },
        { label: "At risk", value: item.risk || "No" },
      ],
      text: "",
    }));
  }

  if (fallback.length) {
    const covered = new Set(entries.map((entry) => entry.cycleKey));
    fallback.forEach((entry) => {
      if (!covered.has(entry.cycleKey)) entries.push(entry);
    });
  }

  // this cycle first, the rest keep their (newest-first) order
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => Number(!!b.entry.current) - Number(!!a.entry.current) || a.index - b.index)
    .map(({ entry }) => entry);
}