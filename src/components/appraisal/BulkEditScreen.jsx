import { useEffect, useMemo, useState } from "react";
import BulkOperations from "@/components/appraisal/BulkEditPage";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import "@/styles/bulk-edit-screen.css";

const isActiveCycle = (cycle) =>
  String(cycle?.status || "").trim().toLowerCase() === "active" &&
  !cycle?.archived &&
  !cycle?.hidden;

export default function BulkEditScreen() {
  const [cycles, setCycles] = useState([]);
  // The cycle is picked automatically (active one first); no manual selector.
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(true);
    payrollCycleRequest("cycles")
      .then((data) => {
        if (!alive) return;
        const list = Array.isArray(data) ? data : [];
        setCycles(list);
        const preferred =
          list.find(isActiveCycle) ||
          list.find((cycle) => !cycle?.archived) ||
          list[0];
        setSelectedId((current) =>
          current && list.some((cycle) => String(cycle.id) === current)
            ? current
            : String(preferred?.id || ""),
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
          />
        </div>
      )}
    </section>
  );
}