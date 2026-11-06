import { useEffect, useMemo, useState } from "react";
import BulkOperations from "@/components/appraisal/BulkEditPage";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import { useAccess } from "@/lib/access-store";
import "@/styles/bulk-edit-screen.css";

const isActiveCycle = (cycle) =>
  String(cycle?.status || "").trim().toLowerCase() === "active" &&
  !cycle?.archived &&
  !cycle?.hidden;

/* Remembered between visits to this tab, so coming back does not show "Loading appraisal cycles…"
   again. The list is still refreshed quietly in the background every time. */
let cyclesCache = null;
let selectedCache = "";

const pickCycle = (list) =>
  list.find(isActiveCycle) || list.find((cycle) => !cycle?.archived) || list[0];

export default function BulkEditScreen() {
  // "View" on the Bulk Edit screen: preview only, nothing can be applied.
  const access = useAccess();
  const readOnly = !access.canAction("bulkEdit");
  const [cycles, setCycles] = useState(() => cyclesCache || []);
  // The cycle is picked automatically (active one first); no manual selector.
  const [selectedId, setSelectedId] = useState(() => selectedCache);
  const [loading, setLoading] = useState(() => !cyclesCache);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    if (!cyclesCache) setLoading(true);
    payrollCycleRequest("cycles")
      .then((data) => {
        if (!alive) return;
        const list = Array.isArray(data) ? data : [];
        cyclesCache = list;
        // Same cycles as before: keep the current array so nothing re-renders or re-mounts.
        setCycles((previous) =>
          JSON.stringify(previous) === JSON.stringify(list) ? previous : list,
        );
        setSelectedId((current) => {
          const next =
            current && list.some((cycle) => String(cycle.id) === current)
              ? current
              : String(pickCycle(list)?.id || "");
          selectedCache = next;
          return next;
        });
        setError("");
      })
      .catch((err) => {
        if (alive) setError(err?.message || "Unable to load appraisal cycles.");
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const selectedCycle = useMemo(
    () => cycles.find((cycle) => String(cycle.id) === selectedId) || null,
    [cycles, selectedId],
  );

  return (
    <section className="bulk-edit-screen">
      {error && <div className="bulk-edit-screen-error" role="alert">{error}</div>}
      {loading && <div className="bulk-edit-screen-state">Loading appraisal cycles…</div>}
      {!loading && !error && !selectedCycle && (
        <div className="bulk-edit-screen-state">Create an appraisal cycle before using Bulk Edit.</div>
      )}
      {!loading && !error && selectedCycle && (
        <div className="bulk-edit-screen-work">
          <BulkOperations
            key={selectedCycle.id}
            apiUrl="/server/appraisalapi"
            cycle={{
              id: selectedCycle.id,
              name: selectedCycle.name || "Appraisal",
              location: selectedCycle.location || "",
            }}
            height="100%"
            readOnly={readOnly}
          />
        </div>
      )}
    </section>
  );
}