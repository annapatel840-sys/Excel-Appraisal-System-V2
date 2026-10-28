import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";

const API_URL = catalystFunctionUrl("designationmasterapi");

async function request({ method = "GET", body } = {}) {
  const url = new URL(API_URL);

  const response = await catalystFetch(url.toString(), {
    method,
    headers: {
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });

  const result = await response.json().catch(() => null);

  if (!response.ok || result?.success !== true) {
    throw new Error(
      result?.message || `Designation Master request failed (${response.status}).`,
    );
  }

  return result.data;
}

export function loadDesignationMaster() {
  return request();
}

export function saveDesignationMaster(data) {
  return request({
    method: "POST",
    body: data,
  });
}