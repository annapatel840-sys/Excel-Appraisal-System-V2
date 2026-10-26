import { useEffect, useState } from "react";

import { loadFeedbackRating } from "@/lib/feedback-rating-api";
import { FeedbackRatingMasterPage } from "./FeedbackRatingMasterPage";

// Loads the data from feedbackratingapi and hands it to the (UI-only) page.
export function FeedbackRatingMasterContainer() {
  const [state, setState] = useState({ cycles: [], rows: [], batches: [], loading: true, error: "" });

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      // Clear the previous cycle immediately; if the refresh fails, stale
      // feedback rows and upload batches must not remain visible.
      setState({ cycles: [], rows: [], batches: [], loading: true, error: "" });
      loadFeedbackRating()
        .then((data) => {
          if (!cancelled) setState({ ...data, loading: false, error: "" });
        })
        .catch((err) => {
          if (!cancelled) setState((current) => ({ ...current, loading: false, error: err.message || "Could not load feedback." }));
        });
    };
    refresh();
    if (typeof window !== "undefined") {
      window.addEventListener("appraisal:cycle-updated", refresh);
    }
    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener("appraisal:cycle-updated", refresh);
      }
    };
  }, []);

  const activeCycle = state.cycles.find((cycle) =>
    String(cycle?.status || "").trim().toLowerCase() === "active" &&
    ![true, 1, "true", "1", "yes"].includes(
      typeof cycle?.archived === "string" ? cycle.archived.trim().toLowerCase() : cycle?.archived,
    )
  );
  return (
    <FeedbackRatingMasterPage
      key={activeCycle?.id || "no-active-cycle"}
      cycles={state.cycles}
      rows={state.rows}
      batches={state.batches}
      loading={state.loading}
      error={state.error}
    />
  );
}