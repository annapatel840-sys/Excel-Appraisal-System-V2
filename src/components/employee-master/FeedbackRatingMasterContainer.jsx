import { useEffect, useState } from "react";

import { loadFeedbackRating } from "@/lib/feedback-rating-api";
import { FeedbackRatingMasterPage } from "./FeedbackRatingMasterPage";

// Loads the data from feedbackratingapi and hands it to the (UI-only) page.
export function FeedbackRatingMasterContainer() {
  const [state, setState] = useState({ cycles: [], rows: [], batches: [], loading: true, error: "" });

  useEffect(() => {
    let cancelled = false;
    loadFeedbackRating()
      .then((data) => {
        if (!cancelled) setState({ ...data, loading: false, error: "" });
      })
      .catch((err) => {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: err.message || "Could not load feedback." }));
      });
    return () => {
      cancelled = true;
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