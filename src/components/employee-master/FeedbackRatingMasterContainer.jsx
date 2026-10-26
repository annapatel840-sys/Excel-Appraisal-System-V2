import { useEffect, useState } from "react";

import { loadFeedbackRating } from "@/lib/feedback-rating-api";
import { FeedbackRatingMasterPage } from "./FeedbackRatingMasterPage";

// Loads the data from feedbackratingapi and hands it to the (UI-only) page.
export function FeedbackRatingMasterContainer() {
  const [state, setState] = useState({ cycles: [], rows: [], batches: [], loading: true, error: "" });

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      setState((current) => ({ ...current, loading: true, error: "" }));
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

  return (
    <FeedbackRatingMasterPage
      cycles={state.cycles}
      rows={state.rows}
      batches={state.batches}
      loading={state.loading}
      error={state.error}
    />
  );
}