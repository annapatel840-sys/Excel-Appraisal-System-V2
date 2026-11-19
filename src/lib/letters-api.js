import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";

/*
 * Client for the Letters Catalyst function (functions/lettersapi).
 * Today it stores the Letter TEMPLATES: the Word file HR imports goes to a
 * Stratus bucket of its location (one bucket per location), the letter content and signatory block too, and an index row
 * goes to the Data Store. See functions/lettersapi/index.js.
 *
 * Set VITE_LETTERS_TEMPLATES_ON_SERVER=false to work offline (templates then
 * stay in this browser only, like the rest of the Letters demo data).
 */

export const TEMPLATES_ON_SERVER = import.meta.env.VITE_LETTERS_TEMPLATES_ON_SERVER !== "false";
export const MAX_DOCX_BYTES = 5 * 1024 * 1024;

const API_URL = catalystFunctionUrl("lettersapi");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
// Catalyst ends a slow request (~30 s: "EXECUTION_TIME_EXCEEDED") when the function starts cold.
// A read is safe to repeat, and the second attempt reaches a warm function, so reads retry once.
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

async function request({ method = "GET", body, params } = {}, attempt = 0) {
  const url = new URL(API_URL);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  // A call that never answers must end with a message, not stay "pending".
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 28000);
  let response;
  try {
    response = await catalystFetch(url.toString(), {
      method,
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      if (method === "GET" && attempt < 1) return request({ method, body, params }, attempt + 1);
      throw new Error("The letters server did not answer in time. Please try again.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  if (method === "GET" && !response.ok && RETRYABLE.has(response.status) && attempt < 1) {
    await sleep(1500);
    return request({ method, body, params }, attempt + 1);
  }
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.success !== true) {
    throw new Error(result?.message || `Letters request failed (${response.status}).`);
  }
  return result.data;
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || "").split(",").pop());
    reader.onerror = () => reject(new Error("The Word file could not be read."));
    reader.readAsDataURL(file);
  });
}

/* All templates held on the server (content included), plus `problems`: templates
   whose location bucket could not be read. */
export async function loadServerTemplates(location) {
  const params = { view: "templates" };
  if (location) params.location = location; // only that location's bucket
  const data = await request({ params });
  return { templates: data.templates || [], problems: data.problems || [] };
}

/* The REAL Appraisal Sheet rows of one cycle (Employee Master joined), already
   limited to the cycle's location. Used when Generate runs on the Appraisal
   Cycle Master. */
export async function loadServerSheet(cycleId, location) {
  // Same call shape as the roster (employeesapi): page + limit, answered as
  // { data, pagination }. 5000 rows per page, so one request in practice.
  const LIMIT = 5000;
  const rows = [];
  let cycle = {};
  let totalPages = 1;
  for (let page = 1; page <= totalPages && page <= 20; page += 1) {
    const params = { view: "sheet", cycleId: String(cycleId), page: String(page), limit: String(LIMIT) };
    if (location) params.location = location;
    const data = await request({ params });
    cycle = data.cycle || cycle;
    rows.push(...(Array.isArray(data.data) ? data.data : []));
    totalPages = Math.max(1, Number(data.pagination?.totalPages || 1));
  }
  return { cycle, rows };
}

/* Publish a new version. `docxFile` is the File picked with "Import from Word"
   (omit it to keep the Word file already stored). Returns the saved template. */
export async function saveServerTemplate({ template, baseVer, note, docxFile }) {
  let docx = null;
  if (docxFile) {
    if (docxFile.size > MAX_DOCX_BYTES) throw new Error("The Word file is larger than 5 MB.");
    docx = { fileName: docxFile.name, base64: await fileToBase64(docxFile) };
  }
  return request({ method: "POST", body: { action: "saveTemplate", template, baseVer, note: note || "", docx } });
}

export function setServerTemplateActive(id, active) {
  return request({ method: "POST", body: { action: "setActive", id, active: !!active } });
}

/* Download the stored Word file of a template (latest, or one version). */
export async function downloadServerDocx(id, ver) {
  const url = new URL(API_URL);
  url.searchParams.set("view", "docx");
  url.searchParams.set("id", id);
  if (ver) url.searchParams.set("ver", ver);
  const response = await catalystFetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(result?.message || `The Word file could not be downloaded (${response.status}).`);
  }
  const blob = await response.blob();
  const name = /filename="([^"]+)"/.exec(response.headers.get("Content-Disposition") || "")?.[1] || "template.docx";
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
