import { payrollCycleRequest } from "./payroll-cycle-api";

// Reuse the shared in-flight/15-second cached feedback read used by the
// appraisal screens. Writes invalidate this cache through the common API layer.
export async function loadFeedbackRating({ cycleId } = {}) {
  return payrollCycleRequest("feedback", {
    query: cycleId ? { cycleId: String(cycleId) } : {},
  });
}
