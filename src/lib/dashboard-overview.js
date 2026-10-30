// Pure helpers for the Dashboard Overview. No fetching here: everything is
// computed from rows the existing stores already load.
import {
  totalOfPB,
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
    paid: sumBy(withTarget, totalOfPB),
  };
};

export const avgHikePct = (rows) => avgBy(rows, calcHikePct);
export { calcHikePct };

// Compact money: full rupees below 1 lakh, then L, then Cr.
export const money = (v) => {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e7) return `${s}₹ ${(a / 1e7).toFixed(2)} Cr`;
  if (a >= 1e5) return `${s}₹ ${(a / 1e5).toFixed(2)} L`;
  return `${s}₹ ${Math.round(a).toLocaleString("en-IN")}`;
};
export const inr = (v) => Math.round(num(v)).toLocaleString("en-IN");