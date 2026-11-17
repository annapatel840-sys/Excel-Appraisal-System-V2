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

async function request({ method = "GET", body, params } = {}) {
  const url = new URL(API_URL);
  Object.entries(params || {}).forEach(([k, v]) => url.searchParams.set(k, v));
  const response = await catalystFetch(url.toString(), {
    method,
    headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });
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
export async function loadServerTemplates() {
  const data = await request({ params: { view: "templates" } });
  return { templates: data.templates || [], problems: data.problems || [] };
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
