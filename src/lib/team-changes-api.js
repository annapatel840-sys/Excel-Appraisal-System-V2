// Team Changes feed (accessapi GET /delegation/changes).
// Every Delegation save / approved Delegation request is logged server-side in
// Appraisal_Audit (source "Delegation"). This hook loads those rows for the
// cycle and refreshes whenever Delegation, budget or cycle data changes.
import { useCallback, useEffect, useState } from "react";

import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";

export const TEAM_CHANGES_EVENT = "appraisal:team-changes-updated";

// Tell open Team Changes screens to reload (call after a Delegation save).
export function notifyTeamChangesUpdated() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(TEAM_CHANGES_EVENT));
  }
}

export async function fetchTeamChanges(cycleId) {
  const url = new URL("delegation/changes", catalystFunctionUrl("accessapi"));
  if (cycleId) url.searchParams.set("cycleId", String(cycleId));
  const response = await catalystFetch(url, { method: "GET" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false || payload.success === false) {
    throw new Error(
      payload.error || payload.message || "Unable to load Team Changes.",
    );
  }
  return Array.isArray(payload.changes) ? payload.changes : [];
}

// Rows shaped for buildChangeLog(): one move per Delegation change.
export function toGridChanges(changes) {
  return (changes || []).map((c) => ({
    id: c.id || `${c.empId}|${c.field}|${c.at}|${c.to}`,
    date: c.date,
    at: c.at,
    empId: c.empId,
    name: c.name,
    from: c.from || "—",
    to: c.to || "—",
    source: `Delegation · ${c.fieldLabel || c.field}`,
  }));
}

export function useTeamChanges(cycleId) {
  const [changes, setChanges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const list = await fetchTeamChanges(cycleId);
      setChanges(toGridChanges(list));
      setError("");
    } catch (e) {
      setError(e?.message || "Unable to load Team Changes.");
    } finally {
      setLoading(false);
    }
  }, [cycleId]);

  useEffect(() => {
    setLoading(true);
    load();
    const refresh = () => load();
    window.addEventListener(TEAM_CHANGES_EVENT, refresh);
    window.addEventListener("appraisal:budget-data-updated", refresh);
    window.addEventListener("appraisal:cycle-updated", refresh);
    return () => {
      window.removeEventListener(TEAM_CHANGES_EVENT, refresh);
      window.removeEventListener("appraisal:budget-data-updated", refresh);
      window.removeEventListener("appraisal:cycle-updated", refresh);
    };
  }, [load]);

  return { changes, loading, error, reload: load };
}
