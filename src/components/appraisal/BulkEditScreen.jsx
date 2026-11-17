import { useEffect, useMemo, useState } from "react";
import BulkOperations from "@/components/appraisal/BulkEditPage";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import { useAccess } from "@/lib/access-store";
import { isAllLocations, matchesCycleLocation, cycleLocationOf, useSelectedLocation } from "@/lib/location-store";
import "@/styles/bulk-edit-screen.css";

const isActiveCycle = (cycle) =>
  String(cycle?.status || "").trim().toLowerCase() === "active" &&
  !cycle?.archived &&
  !cycle?.hidden;

/* Remembered between visits to this tab, so coming back does not show "Loading appraisal cycles…"
   again. The list is still refreshed quietly in the background every time. */
let cyclesCache = null;

/* The cycle follows the location chosen in the header: that location's own Active cycle first, then an
   "All locations" cycle (it covers every location). Never another location's cycle. */
const pickCycle = (list, location) => {
  const own = list.filter((cycle) => matchesCycleLocation(cycle, location));
  const all = isAllLocations(location)
    ? []
    : list.filter((cycle) => isAllLocations(cycleLocationOf(cycle)));
  for (const group of [own, all]) {
    const hit = group.find(isActiveCycle) || group.find((cycle) => !cycle?.archived);
    if (hit) return hit;
  }
  return null;
};

export default function BulkEditScreen() {
  // "View" on the Bulk Edit screen: preview only, nothing can be applied.
  const access = useAccess();
  const readOnly =
    !access.canAction("bulkEdit") || !access.canScreen("bulkEditScreen", "edit");
  const [cycles, setCycles] = useState(() => cyclesCache || []);
  const [selectedLocation] = useSelectedLocation();
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

  // Picked automatically from the header location (active one first); no manual selector.
  const selectedCycle = useMemo(
    () => pickCycle(cycles, selectedLocation),
    [cycles, selectedLocation],
  );

  return (
    <section className="bulk-edit-screen">
      {error && <div className="bulk-edit-screen-error" role="alert">{error}</div>}
      {loading && <div className="bulk-edit-screen-state">Loading appraisal cycles…</div>}
      {!loading && !error && !selectedCycle && (
        <div className="bulk-edit-screen-state">No appraisal cycle for this location. Create one before using Bulk Edit.</div>
      )}
      {!loading && !error && selectedCycle && (
        <div className="bulk-edit-screen-work">
          <BulkOperations
            key={selectedCycle.id}
            apiUrl="/server/appraisalapi"
            offlineApi
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