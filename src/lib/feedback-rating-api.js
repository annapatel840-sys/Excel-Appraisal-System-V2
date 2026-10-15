import { catalystFetch, catalystFunctionUrl } from "./catalyst-api";

// GET feedbackratingapi/?resource=feedback  ->  { cycles, rows, batches }
export async function loadFeedbackRating({ cycleId } = {}) {
  const url = new URL(catalystFunctionUrl("feedbackratingapi"));
  url.searchParams.set("resource", "feedback");
  if (cycleId) url.searchParams.set("cycleId", String(cycleId));

  const response = await catalystFetch(url, { method: "GET" });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error("The feedback service returned an invalid response.");
  }
  if (!response.ok || payload.success !== true) {
    const error = new Error(payload.message || "The request failed.");
    error.status = response.status;
    throw error;
  }
  return payload.data;
}