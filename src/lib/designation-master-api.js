import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";

const API_URL = catalystFunctionUrl("designationmasterapi");

async function request({ method = "GET", body, params } = {}) {
  const url = new URL(API_URL);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));

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

/* ------------------------------------------------------------------
   Appraisal Sheet "New title" dropdown.
   loadDesignationRules() once per sheet load, then call newTitleChoices()
   when the user opens the dropdown for a row.
   ------------------------------------------------------------------ */
export function loadDesignationRules() {
  return request({ params: { view: "appraisal" } });
}

/* -> { ok, options, prefill, message }
   ok === false means: do not open the dropdown, show `message` in the
   Appraisal Sheet's existing error popup. */
export function newTitleChoices(rules, designation) {
  const name = String(designation || "").trim();
  const rule = rules?.rules?.[name.toLowerCase()];
  if (!rule) {
    return {
      ok: false,
      options: [],
      prefill: "",
      message: `${name || "This designation"} is not mapped to a next designation. Ask HR to map it in Designation Master.`,
    };
  }
  if (!rule.mapped) {
    return { ok: false, options: [], prefill: "", message: rule.message };
  }
  return {
    ok: true,
    options: rule.free ? rules.freeOptions || [] : rule.options,
    prefill: rule.prefill || "",
    message: "",
  };
}