import { useEffect, useState } from "react";
import { filterByLocation, isAllLocations, useSelectedLocation } from "@/lib/location-store";

import { loadFeedbackRating } from "@/lib/feedback-rating-api";
import { useCatalystUser } from "@/lib/catalyst-auth";
import { masterSnapshotKey, readMasterSnapshot, writeMasterSnapshot } from "@/lib/roster-snapshot";
import { FeedbackRatingMasterPage } from "./FeedbackRatingMasterPage";

// Loads the data from feedbackratingapi and hands it to the (UI-only) page.
export function FeedbackRatingMasterContainer() {
  const [state, setState] = useState({ cycles: [], rows: [], batches: [], loading: true, error: "" });
  const [selectedLocation] = useSelectedLocation();
  const signedInUser = useCatalystUser();
  const snapshotScope = String(signedInUser?.email || signedInUser?.id || signedInUser?.user_id || "anonymous").trim().toLowerCase();
  const feedbackSnapshotKey = masterSnapshotKey(snapshotScope, "feedback");

  useEffect(() => {
    let cancelled = false;
    let freshApplied = false;
    readMasterSnapshot(feedbackSnapshotKey).then((snapshot) => {
      if (cancelled || freshApplied || !snapshot) return;
      setState({ cycles: snapshot.cycles || [], rows: snapshot.rows || [], batches: snapshot.batches || [], loading: false, error: "" });
    });
    const refresh = () => {
      // Keep already loaded rows visible while the shared cached request
      // refreshes in the background; show the spinner only on first load.
      setState((current) => ({
        ...current,
        loading: current.cycles.length === 0 && current.rows.length === 0,
        error: "",
      }));
      loadFeedbackRating({ fresh: true })
        .then((data) => {
          if (!cancelled) {
            freshApplied = true;
            setState({ ...data, loading: false, error: "" });
            writeMasterSnapshot(feedbackSnapshotKey, data);
          }
        })
        .catch((err) => {
          if (!cancelled) setState((current) => ({ ...current, loading: false, error: err.message || "Could not load feedback." }));
        });
    };
    refresh();
    if (typeof window !== "undefined") {
      window.addEventListener("appraisal:cycle-updated", refresh);
      window.addEventListener("appraisal:feedback-data-updated", refresh);
    }
    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("appraisal:cycle-updated", refresh);
        window.removeEventListener("appraisal:feedback-data-updated", refresh);
      }
    };
  }, [feedbackSnapshotKey]);

  // Keep every historical cycle for employees in the selected location.
  // Location is resolved from Employee_Master, not from archived payroll or
  // feedback rows, because older uploads often have no location column.
  const allRows = filterByLocation(state.rows, selectedLocation, (row) => row.location);
  const locationCycleIds = new Set(allRows.map((row) => String(row.cid)));
  const allCycles = isAllLocations(selectedLocation)
    ? state.cycles
    : state.cycles.filter((cycle) => locationCycleIds.has(String(cycle.id)));
  const allBatches = state.batches.filter((batch) => locationCycleIds.has(String(batch.cid)));
  return (
    <FeedbackRatingMasterPage
      cycles={allCycles}
      rows={allRows}
      batches={allBatches}
      loading={state.loading}
      error={state.error}
    />
  );
}