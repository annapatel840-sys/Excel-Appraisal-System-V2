/* ============================================================
   Eligibility screen rules (frontend only).
   Pure helpers: no fetch, no backend. Rows come from the host page.
   ============================================================ */

import { parseDateValue } from "./employee-master-data";

const pad = (n) => String(n).padStart(2, "0");
const toIso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/* Rule 7: cutoff = 31 Oct of the year BEFORE the cycle's end year.
   "Annual 27" -> 2026-10-31, "Annual 26-27" -> 2025-10-31, "Annual 2027" -> 2026-10-31 */
export function defaultCutoffForCycle(cycleName) {
  const name = String(cycleName || "");
  const range = name.match(/(\d{2,4})\s*[-–/]\s*(\d{2,4})/);
  let endYear = 0;
  const full = (v) => (v.length === 2 ? 2000 + Number(v) : Number(v));
  if (range) endYear = full(range[2]);
  else {
    const single = name.match(/(\d{4}|\d{2})(?!.*\d)/);
    if (single) endYear = full(single[1]);
  }
  return endYear ? `${endYear - 1}-10-31` : "";
}

export const statusOf = (e) =>
  String(e?.status ?? e?.rawEmployee?.emp_status ?? e?.rawEmployee?.status ?? "Active").trim();
export const isActiveStatus = (e) => statusOf(e).toLowerCase() === "active";
export const isInactiveStatus = (e) => statusOf(e).toLowerCase() === "inactive";
// Action Needed: a status that is neither Active nor Inactive (e.g. leave).
export const isActionNeededStatus = (e) => !isActiveStatus(e) && !isInactiveStatus(e);

export const decisionOf = (e) => {
  const raw = String(
    e?.eligibleStatus ?? e?.rawEmployee?.eligibility_status ?? e?.rawEmployee?.eligible_status ?? "",
  )
    .trim()
    .toLowerCase()
    .replace(/[ _-]+/g, "");
  if (["eligible", "yes", "true", "1"].includes(raw)) return "Eligible";
  if (["noteligible", "no", "false", "0", "ineligible"].includes(raw)) return "Not Eligible";
  return "Pending";
};

/* Rules 11-14: what the screen shows for one row.
   listGenerated = Apply Criteria has been done for the cycle.
   Optional row fields the backend can send later: nextStep, delegationDone, pendingDelegation. */
export function effectiveRow(e, { listGenerated = false, delegationGenerated = false } = {}) {
  let decision = decisionOf(e);
  let reason = e.eligibleReason || "";
  let setBy = null;
  let changed = false;
  const inactive = isInactiveStatus(e);

  // Rule 11: became Inactive after generation -> Not Eligible, set by System
  if (listGenerated && inactive && decision === "Eligible") {
    decision = "Not Eligible";
    reason = "Became not active";
    setBy = "System";
    changed = true;
  }

  const eligible = decision === "Eligible";
  const nextStepRaw = String(e.nextStep || e.rawEmployee?.next_step || "").trim();
  const tag = e.changeTag || e.eligibilityTag || "";

  // Rule 12: Active -> ML / Garden Leave ... HR decides
  const decisionNeeded = listGenerated && eligible && !isActiveStatus(e) && !inactive;

  // Rule 13/14: Delegation first, then Appraisal Sheet
  let nextStep = "";
  if (delegationGenerated && eligible) {
    const delegationPending =
      e.pendingDelegation === true ||
      nextStepRaw === "Delegation" ||
      (tag === "New" && e.delegationDone !== true);
    if (delegationPending) nextStep = "Delegation";
    else if (nextStepRaw === "Appraisal Sheet") nextStep = "Appraisal Sheet";
  }

  return {
    decision,
    reason,
    setBy,
    changed,
    eligible,
    decisionNeeded,
    nextStep,
    actionNeeded: decisionNeeded || Boolean(nextStep),
    nextLabel: decisionNeeded
      ? `Decision needed (${statusOf(e)})`
      : nextStep === "Delegation"
        ? "Step 1 of 2: Delegation"
        : nextStep === "Appraisal Sheet"
          ? "Step 2 of 2: Appraisal Sheet"
          : "",
  };
}

/* ---------- added parameters: pick the master, then the field ---------- */
const uniqueValues = (rows, get) =>
  [...new Set(rows.map(get).map((v) => String(v ?? "").trim()).filter(Boolean))].sort();

export const PARAM_MASTERS = [
  {
    id: "EM",
    name: "Employee Master",
    fields: [
      { key: "empType", label: "Emp Type", type: "list", get: (e) => e.empType ?? e.rawEmployee?.emp_type },
      { key: "organization", label: "Organization", type: "list", get: (e) => e.organization },
      { key: "band", label: "Band", type: "list", get: (e) => e.band ?? e.rawEmployee?.band },
      { key: "skillType", label: "Skill Type", type: "list", get: (e) => e.skillType ?? e.rawEmployee?.skill_type },
      { key: "orgExp", label: "Org Experience (years)", type: "number", get: (e) => e.orgExp },
      { key: "exitDate", label: "Exit date", type: "date", get: (e) => e.exitDate ?? e.rawEmployee?.exit_date },
    ],
  },
  {
    id: "DM",
    name: "Designation Master",
    fields: [{ key: "designationGroup", label: "Designation Group", type: "list", get: (e) => e.designationGroup ?? e.rawEmployee?.designation_group }],
  },
  {
    id: "BM",
    name: "Band Master",
    fields: [{ key: "bandMaster", label: "Band", type: "list", get: (e) => e.band ?? e.rawEmployee?.band }],
  },
  {
    id: "SM",
    name: "Skill Master",
    fields: [{ key: "skillMaster", label: "Skill Type", type: "list", get: (e) => e.skillType ?? e.rawEmployee?.skill_type }],
  },
];

/* ---------- every Employee Master column, read from the loaded rows ---------- */
const RAW_PREFIX = "raw:";

const FIELD_LABELS = {
  repo_manager: "Reporting Manager",
  director: "Comp Manager",
  appraiser_tech_ed: "Appraiser (Tech Ed)",
  wissen_experience: "Org Experience (years)",
  total_experience: "Total Experience (years)",
  email_id: "Email",
  cost_center: "Cost Center",
  current_salary: "Current Salary",
  last_appraisal_month_year: "Last Appraisal",
  emp_type: "Emp Type",
};

const humanize = (col) =>
  FIELD_LABELS[col] ||
  String(col)
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());

// Columns that already have their own section, are system columns, or are
// eligibility bookkeeping: not offered as an added parameter.
const SKIP_COLUMNS = new Set([
  "rowid", "creatorid", "createdtime", "modifiedtime",
  "emp_id", "employee_id", "emp_code", "emp_name", "name",
  "designation", "department", "organization", "orgtn",
  "emp_status", "status",
  "date_of_join", "joining_date", "doj", "date_of_joining",
  "eligible", "eligible_status", "eligibility_status", "eligible_reason",
  "eligibility_reason", "eligibility_source", "eligibility_updated_at",
  "eligible_updated_at", "change_tag", "manual_override", "next_step",
  "location",
]);

const DATE_LIKE = /^\d{4}-\d{2}-\d{2}|^\d{1,2}[-/]\d{1,2}[-/]\d{2,4}$/;

const rawField = (col, type) => ({
  key: RAW_PREFIX + col,
  label: humanize(col),
  type,
  get: (e) => e?.rawEmployee?.[col],
});

/* All other Employee Master fields, with a type guessed from the values:
   number -> "exclude below a number", date -> "exclude by date", else a list. */
export function employeeMasterFields(employees) {
  const seen = new Map();
  (employees || []).forEach((e) => {
    const raw = e?.rawEmployee;
    if (!raw || typeof raw !== "object") return;
    Object.keys(raw).forEach((col) => {
      if (SKIP_COLUMNS.has(col.toLowerCase())) return;
      const v = raw[col];
      if (v !== null && typeof v === "object") return;
      const text = String(v ?? "").trim();
      const info = seen.get(col) || { n: 0, numeric: true, date: true };
      if (text) {
        info.n += 1;
        if (!(text !== "" && !Number.isNaN(Number(text)))) info.numeric = false;
        if (!DATE_LIKE.test(text)) info.date = false;
      }
      seen.set(col, info);
    });
  });
  return [...seen.entries()]
    .map(([col, info]) => rawField(col, info.n && info.numeric ? "number" : info.n && info.date ? "date" : "list"))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export const findParamField = (masterId, fieldKey) => {
  if (String(fieldKey || "").startsWith(RAW_PREFIX)) {
    return rawField(String(fieldKey).slice(RAW_PREFIX.length), "list");
  }
  return PARAM_MASTERS.find((m) => m.id === masterId)?.fields.find((f) => f.key === fieldKey) || null;
};

export const paramValues = (param, employees) => {
  const f = findParamField(param.master, param.field);
  return f ? uniqueValues(employees, f.get) : [];
};

export function failsParam(param, e) {
  const f = findParamField(param.master, param.field);
  if (!f) return "";
  const v = f.get(e);
  if (param.type === "list") {
    const s = String(v ?? "").trim();
    return s && (param.values || []).includes(s) ? `${param.label}: ${s}` : "";
  }
  if (param.type === "number") {
    if (param.value === "" || param.value == null || v === "" || v == null) return "";
    return Number(v) < Number(param.value) ? `${param.label} below ${param.value}` : "";
  }
  if (!param.value || !v) return "";
  const d = parseDateValue(v);
  const limit = parseDateValue(param.value);
  if (!d || !limit) return "";
  const hit = param.op === "before" ? d <= limit : d > limit;
  return hit ? `${param.label} ${param.op === "before" ? "on or before" : "after"} ${param.value}` : "";
}

/* "If applied now" preview. Mirrors rule 4 and rule 8: only Active employees enter;
   failing any criterion means Not Eligible. */
export function previewCounts(masterEmployees, c) {
  let eligible = 0;
  let notEligible = 0;
  const cut = c.cutoffDate ? parseDateValue(c.cutoffDate) : null;
  masterEmployees.forEach((e) => {
    if (!isActiveStatus(e)) return;
    const status = statusOf(e);
    let fail =
      (c.statuses || []).includes(status) ||
      (c.departments || []).includes(e.organization) ||
      (c.designations || []).includes(e.designation) ||
      (c.excludedEmployees || []).includes(e.empId);
    if (!fail && cut) {
      const d = parseDateValue(e.doj);
      if (d && d > cut) fail = true;
    }
    if (!fail) fail = (c.extraParameters || []).some((p) => failsParam(p, e));
    if (fail) notEligible += 1;
    else eligible += 1;
  });
  return { eligible, notEligible, total: eligible + notEligible };
}

export { toIso };