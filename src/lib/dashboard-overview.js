// Pure helpers for the Dashboard Overview. No fetching here: everything is
// computed from rows the existing stores already load.
import {
  hikeAmount as calcHikeAmount,
  hikePct as calcHikePct,
} from "@/lib/appraisal-data";

export const MIN_GROUP = 5; // groups smaller than this are not compared
export const num = (v) => Number(v) || 0;
export const sumBy = (rows, fn) => rows.reduce((s, r) => s + num(fn(r)), 0);
export const avgBy = (rows, fn) => (rows.length ? sumBy(rows, fn) / rows.length : 0);

const norm = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");

// Hike + PB + RB, the same three parts the Appraisal Sheet's "Consumed" uses.
export const partsOf = (rows) => {
  const hike = sumBy(rows, calcHikeAmount);
  const pb = sumBy(rows, (r) => num(r.allocatedPBAmount));
  const rb = sumBy(rows, (r) => r.newRB);
  return { hike, pb, rb, total: hike + pb + rb };
};

export const groupRows = (rows, keyFn) => {
  const map = new Map();
  rows.forEach((r) => {
    const key = String(keyFn(r) || "").trim() || "Unassigned";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  });
  return Array.from(map.entries())
    .map(([key, list]) => ({ key, rows: list }))
    .sort((a, b) => a.key.localeCompare(b.key));
};

// "Edited" employees = people someone edited by hand on the Appraisal Sheet or
// the Detailed Screen in the current cycle (audit entries made by those two
// screens). Bulk edits, imports and status changes are not counted. The
// Appraisal Sheet's notification bell and the Dashboard both use this, so the
// two numbers always agree.
const MANUAL_EDIT_SOURCES = new Set(["inline edit", "detail screen edit", "manual"]);
export const isManualEditEntry = (entry) =>
  MANUAL_EDIT_SOURCES.has(String(entry?.source ?? "manual").trim().toLowerCase());

export const manualEditedEmpIds = (audit) => {
  const ids = new Set();
  (Array.isArray(audit) ? audit : []).forEach((entry) => {
    const empId = String(entry?.empId || "").trim();
    if (empId && isManualEditEntry(entry)) ids.add(empId);
  });
  return ids;
};

// Same, as a set of grid row ids (what the Dashboard's tables use).
export const manualEditedRowIds = (rows, audit) => {
  const emp = manualEditedEmpIds(audit);
  const ids = new Set();
  (Array.isArray(rows) ? rows : []).forEach((r) => {
    if (emp.has(String(r.empId || "").trim())) ids.add(String(r.id));
  });
  return ids;
};

// Rows that have at least one edited cell (live edits + audit trail).
export const editedRowIds = (rows, modified) => {
  const ids = new Set();
  const keys = Object.keys(modified || {});
  const byId = new Set(rows.map((r) => String(r.id)));
  keys.forEach((k) => {
    if (!modified[k]) return;
    const id = k.split(":")[0];
    if (byId.has(id)) ids.add(id);
  });
  return ids;
};

// Real allocation for a group from the Budget Master tables the budget store
// already loads. Returns 0 when nothing matches (shown as "no allocation").
export const allocationFor = (level, key, budget) => {
  const target = norm(key);
  if (!target) return 0;
  if (level === "cm") {
    return sumBy(
      (budget.budgetCompManagerRows || []).filter((r) => norm(r.comp_manager) === target),
      (r) => r.applied_budget,
    );
  }
  return sumBy(
    (budget.budgetDistributionRows || []).filter(
      (r) => norm(r.tech_ed_id) === target || norm(r.tech_ed_name) === target,
    ),
    (r) => r.applied_budget,
  );
};

export const ratingOf = (r) => {
  const v = Number(String(r.managerRating ?? "").trim());
  return Number.isInteger(v) && v >= 1 && v <= 5 ? v : 0;
};

export const isPromoted = (r) => r.eligibleForPromotion === "Yes";
export const hasAtRisk = (r) => String(r.atRisk ?? "").trim() !== "";

export const targetPair = (rows) => {
  const withTarget = rows.filter((r) => num(r.targetPBAllocatedForMay) > 0);
  return {
    n: withTarget.length,
    target: sumBy(withTarget, (r) => r.targetPBAllocatedForMay),
    paid: sumBy(withTarget, (r) => num(r.allocatedPBAmount)),
  };
};

export const avgHikePct = (rows) => avgBy(rows, calcHikePct);
export { calcHikePct };

// Money as a whole number (no L / Cr, no currency symbol).
export const money = (v) => {
  const s = v < 0 ? "−" : "";
  return `${s}${Math.round(Math.abs(v)).toLocaleString("en-IN")}`;
};
export const inr = (v) => Math.round(num(v)).toLocaleString("en-IN");

/* ------------------------------------------------------------------
   Helpers added for the new Overview layout
   ------------------------------------------------------------------ */

// "₹ 1.25 Cr" / "₹ 82.5 L" / "₹ 48,000". Exact whole numbers stay in tooltips.
export const fmMoney = (v) => {
  const x = num(v);
  const a = Math.abs(x);
  const s = x < 0 ? "−" : "";
  if (a >= 1e7) return `${s}₹ ${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹ ${(a / 1e5).toFixed(1)} L`;
  return `${s}₹ ${Math.round(a).toLocaleString("en-IN")}`;
};

// Same, without the rupee sign, for table cells.
export const fmAmt = (v) => fmMoney(v).replace("₹ ", "");

// Bar label: crores with two decimals for big amounts, otherwise the amount.
export const barNum = (v) => {
  const x = num(v);
  return Math.abs(x) >= 1e5
    ? (x / 1e7).toFixed(2)
    : String(Math.round(x * 100) / 100);
};

// "31-Oct-2026" from an ISO-like date; "" when the date cannot be read.
export const fmtDate = (value) => {
  const d = value instanceof Date ? value : new Date(String(value || "").slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d.getDate()}-${m[d.getMonth()]}-${d.getFullYear()}`;
};

// Whole days from today until the date (negative once it has passed); null if unreadable.
export const daysUntil = (value, now = new Date()) => {
  const d = new Date(String(value || "").slice(0, 10) + "T23:59:59");
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - now.getTime()) / 864e5);
};

// Split n items into balanced rows of at most `max` (6 tiles -> 3 + 3, not 5 + 1).
export const balanceRows = (items, max = 5) => {
  const n = items.length;
  if (!n) return [];
  const rows = Math.ceil(n / max);
  const base = Math.floor(n / rows);
  const extra = n % rows;
  const out = [];
  let i = 0;
  for (let r = 0; r < rows; r += 1) {
    const k = base + (r < extra ? 1 : 0);
    out.push(items.slice(i, i + k));
    i += k;
  }
  return out;
};

// PB / RB as a % of base pay, for the people table.
export const pctOfBase = (amount, base) => (num(base) > 0 ? (num(amount) / num(base)) * 100 : 0);

// Previous-cycle hike % from one history record (hike amount over base pay).
export const recordHikePct = (rec) => {
  const base = num(rec?.basePay);
  return base > 0 ? (num(rec?.hikeAmount) / base) * 100 : null;
};

// Where an audit entry was made -> screen name and path (for the Recent activity table).
export const screenOfSource = (source) => {
  const s = String(source ?? "manual").trim().toLowerCase();
  if (s.includes("detail")) return { label: "Detailed Screen", to: "/detail-screen" };
  if (s.includes("bulk")) return { label: "Bulk Edit", to: "/bulk-edit" };
  return { label: "Appraisal Sheet", to: "/sheet" };
};

// "Annual 2025" from "Dubai - Annual 2025".
export const bareCycleName = (name) =>
  String(name || "")
    .replace(/^(.+?)\s+-\s+((?:annual|mid-year|exceptional|new joiner)\b.*)$/i, "$2")
    .trim();

export const cycleKeyOf = (name) => bareCycleName(name).toLowerCase();