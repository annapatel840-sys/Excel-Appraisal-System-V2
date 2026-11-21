// "Compare with" on the Dashboard Overview: previous appraisal cycles (Annual
// and Exceptional alike), same people only. Nothing here runs until a person picks a year.
//
//  - useCompareCycles()        the cycles that can be picked (Closed /
//                              archived, for the selected location).
//  - usePreviousCycleData()    each employee's own history (the same
//                              appraisalhistoryapi read the Detailed Screen
//                              uses), loaded a few at a time and cached.
import { useEffect, useRef, useState } from "react";

import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import {
  cycleLocationOf,
  isAllLocations,
  matchesCycleLocation,
  useSelectedLocation,
} from "@/lib/location-store";
import { bareCycleName, cycleKeyOf } from "@/lib/dashboard-overview";
import { cycleNameWithoutLocation } from "@/lib/cycle-name";
import { prefetchDetailHistory } from "@/components/appraisal/DetailScreenPage";

const isTruthy = (v) =>
  v === true || v === 1 || ["true", "1", "yes"].includes(String(v ?? "").trim().toLowerCase());

const nameOf = (c) => String(c?.name ?? c?.cycle_name ?? c?.appraisal_cycle_name ?? "").trim();
const yearOf = (name) => Number((String(name).match(/(\d{4})/) || [])[1]) || 0;
const isExceptionalName = (name) => /^exceptional\b/i.test(cycleNameWithoutLocation(name));
// When the cycle took effect (ISO text); used to tell which Exceptional cycles came after an Annual one.
const whenOf = (c) =>
  String(c?.effective ?? c?.effective_date ?? c?.end ?? c?.end_date ?? c?.close_date ?? c?.start ?? c?.start_date ?? "").slice(0, 10);

export function useCompareCycles() {
  const [selectedLocation] = useSelectedLocation();
  const [cycles, setCycles] = useState([]);

  useEffect(() => {
    let live = true;
    payrollCycleRequest("cycles")
      .then((data) => {
        if (!live) return;
        const seen = new Map();
        (Array.isArray(data) ? data : []).forEach((c) => {
          const name = nameOf(c);
          const status = String(c?.status ?? c?.cycle_status ?? "").trim().toLowerCase();
          const closed = status === "closed" || isTruthy(c?.archived);
          // Every finished cycle can be compared: Annual, Mid-year, Exceptional...
          if (!name || !closed) return;
          // This location's cycles, plus org-wide ones.
          const own = matchesCycleLocation(c, selectedLocation);
          if (!own && !isAllLocations(cycleLocationOf(c))) return;
          const key = cycleKeyOf(name);
          // The location's own cycle wins over an org-wide cycle of the same name.
          if (!seen.has(key) || own) {
            seen.set(key, {
              key,
              name: bareCycleName(name),
              own,
              exceptional: isExceptionalName(name),
              when: whenOf(c),
            });
          }
        });
        setCycles(
          Array.from(seen.values()).sort(
            (a, b) => yearOf(b.name) - yearOf(a.name) || b.name.localeCompare(a.name),
          ),
        );
      })
      .catch(() => live && setCycles([]));
    return () => {
      live = false;
    };
  }, [selectedLocation]);

  return cycles;
}

// empId -> [history records] (or null once a request failed). Lives for the page.
const HISTORY = new Map();
const POOL = 6;

export function usePreviousCycleData(rows, enabled) {
  const [, bump] = useState(0);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const runId = useRef(0);

  // Only the people on screen are needed; a new location / login is a new list.
  const ids = (rows || []).map((r) => String(r.empId || "").trim()).filter(Boolean);
  const idsKey = ids.join("|");

  useEffect(() => {
    if (!enabled) return undefined;
    const me = ++runId.current;
    const todo = ids.filter((id) => !HISTORY.has(id));
    const total = ids.length;
    let done = total - todo.length;
    setProgress({ done, total });
    if (!todo.length) return undefined;

    let next = 0;
    let sinceBump = 0;
    const worker = async () => {
      while (next < todo.length && runId.current === me) {
        const id = todo[next++];
        try {
          HISTORY.set(id, await prefetchDetailHistory(id, { background: true }));
        } catch {
          HISTORY.set(id, null);
        }
        done += 1;
        sinceBump += 1;
        if (runId.current === me && (sinceBump >= 25 || done === total)) {
          sinceBump = 0;
          setProgress({ done, total });
          bump((n) => n + 1);
        }
      }
    };
    Promise.all(Array.from({ length: Math.min(POOL, todo.length) }, worker)).then(() => {
      if (runId.current === me) {
        setProgress({ done: total, total });
        bump((n) => n + 1);
      }
    });
    return () => {
      runId.current += 1;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, idsKey]);

  return {
    historyOf: (empId) => HISTORY.get(String(empId || "").trim()) || null,
    loading: enabled && progress.done < progress.total,
    progress,
  };
}