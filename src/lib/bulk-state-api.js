/* Bulk Edit "History" and "Scenarios" - saved to the appraisal cycle on the server
   (payrollcycleapi, resource=bulkstate), so they survive a refresh, another browser
   and another login. Everyone with Bulk Edit access sees the same ones for a cycle. */

import { payrollCycleRequest } from "./payroll-cycle-api";

const bulkState = (options) => payrollCycleRequest("bulkstate", options);
// cycleId is also sent under the name the access check reads (so a Closed cycle is read-only for Comp Managers).
const post = (body) => bulkState({ method: "POST", body });

export async function fetchBulkBatches(cycleId) {
  const data = await bulkState({ query: { type: "batches", cycle: cycleId, cycleId } });
  return Array.isArray(data?.batches) ? data.batches : [];
}

// Saves (or replaces) one batch: a new apply, or the same batch marked restored.
export async function saveBulkBatch(cycleId, batch) {
  await post({ action: "save_batch", cycle: cycleId, cycleId, batch });
}

export async function fetchBulkScenarios(cycleId) {
  const data = await bulkState({ query: { type: "scenarios", cycle: cycleId, cycleId } });
  return Array.isArray(data?.scenarios) ? data.scenarios : [];
}

export async function saveBulkScenario(cycleId, scenario) {
  await post({ action: "save_scenario", cycle: cycleId, cycleId, scenario });
}

export async function deleteBulkScenario(cycleId, id) {
  await post({ action: "delete_scenario", cycle: cycleId, cycleId, id });
}