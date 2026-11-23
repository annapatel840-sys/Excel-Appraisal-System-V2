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

// "Edited" employees = people someone edited on the Appraisal Sheet, the
// Detailed Screen or by Bulk Edit in the current cycle (audit entries made by
// those screens). Imports, status changes and Bulk restores are not counted.
// The Appraisal Sheet's notification bell and the Dashboard both use this, so
// the two numbers always agree.
const MANUAL_EDIT_SOURCES = new Set([
  "inline edit",
  "detail screen edit",
  "manual",
  "bulk edit",
]);
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

// ---- who owns a Budget Master row -------------------------------------
// The group key on the Dashboard is the Appraisal Sheet value, e.g.
// "EMP001 - Prabhuprasad Parida". Budget_Distribution may instead store the
// Employee_Master ROWID (a foreign key), a plain id, or a plain name, so a plain
// text compare finds nothing. These helpers compare by id / name parts and
// turn a stored ROWID back into its "ID - Name" assignment.
const compact = (v) => String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const ownerOf = (v) => {
  const text = String(v ?? "").trim();
  if (!text) return null;
  // The separator is the spaced " - " (ids such as WIS-1234 contain hyphens).
  const sp = text.split(/\s+-\s+/);
  const full = compact(text);
  return sp.length > 1
    ? { full, id: compact(sp[0]), name: compact(sp.slice(1).join(" ")), both: true }
    : { full, id: full, name: full, both: false };
};
const sameOwner = (a, b) => {
  const x = ownerOf(a);
  const y = ownerOf(b);
  if (!x || !y) return false;
  if (x.full === y.full) return true;
  if (x.both && y.both) return x.id === y.id;
  // One side is a bare id or name: compare it with the other side's id and name.
  const bare = x.both ? y.full : x.full;
  const other = x.both ? x : y;
  return bare === other.id || bare === other.name;
};

// ROWID -> "ID - Name" for every Tech-ED the budget store knows about.
const fkMap = (budget) => {
  const map = new Map();
  const put = (k, v) => {
    const key = String(k ?? "").trim().toLowerCase();
    if (key && v && !map.has(key)) map.set(key, String(v).trim());
  };
  (budget.techEdOwners || []).forEach((o) => {
    put(o?.row_id, o?.assignment);
    put(o?.ROWID, o?.assignment);
  });
  [...(budget.employeeRows || []), ...(budget.locationEmployeeRows || [])].forEach((e) => {
    const id = e?.emp_id || e?.employee_id || e?.employeeId;
    const name = e?.emp_name || e?.employee_name || e?.name;
    const label = id && name ? `${id} - ${name}` : id || name;
    put(e?.ROWID, label);
    put(e?.row_id, label);
  });
  return map;
};

// Budget rows of the ACTIVE cycle only. The store can hold rows of other cycles,
// which would double a Tech-ED's budget and list stale Comp Manager rows.
// If no row carries the active cycle (different id format), nothing is dropped.
const inActiveCycle = (rows, budget) => {
  const list = Array.isArray(rows) ? rows : [];
  const active = String(budget?.activeBudgetCycleId ?? "").trim();
  if (!active) return list;
  const hit = list.filter((r) => !String(r.appraisal_cycle_id ?? "").trim() || String(r.appraisal_cycle_id).trim() === active);
  return hit.length ? hit : list;
};

// Real allocation for a group from the Budget Master tables the budget store
// already loads. Returns 0 when nothing matches (the Dashboard shows 0).
export const allocationFor = (level, key, budget) => {
  if (!String(key ?? "").trim()) return 0;
  if (level === "cm") {
    return sumBy(
      inActiveCycle(budget.budgetCompManagerRows, budget).filter((r) => sameOwner(r.comp_manager, key)),
      (r) => r.applied_budget,
    );
  }
  const fk = fkMap(budget);
  const resolve = (raw) => fk.get(String(raw ?? "").trim().toLowerCase()) || String(raw ?? "").trim();
  return sumBy(
    inActiveCycle(budget.budgetDistributionRows, budget).filter((r) =>
      [r.tech_ed_id, r.appraiser_tech_ed_id, r.tech_ed, r.appraiser_tech_ed, r.tech_ed_name]
        .map(resolve)
        .some((owner) => sameOwner(owner, key)),
    ),
    (r) => r.applied_budget,
  );
};

// Does this raw owner value (ROWID, id, name or "ID - Name") name the same
// person as the label? Exposed so the Dashboard can match sheet rows to budget rows.
export const sameOwnerAs = (a, b) => sameOwner(a, b);

// Budget_Distribution rows (the Tech-ED level) that belong to one Tech-ED group key.
// Same matching rule allocationFor() uses, but it returns the rows themselves.
export const techEdDistributionRows = (key, budget) => {
  if (!String(key ?? "").trim()) return [];
  const fk = fkMap(budget);
  const resolve = (raw) => fk.get(String(raw ?? "").trim().toLowerCase()) || String(raw ?? "").trim();
  return inActiveCycle(budget.budgetDistributionRows, budget).filter((r) =>
    [r.tech_ed_id, r.appraiser_tech_ed_id, r.tech_ed, r.appraiser_tech_ed, r.tech_ed_name]
      .map(resolve)
      .some((owner) => sameOwner(owner, key)),
  );
};

// "ID - Name" for a Comp Manager as stored on a Budget_Distribution_Comp row
// (may be a ROWID, an employee id, a name or already "ID - Name"). `sheetLabels`
// are the "ID - Name" labels the Appraisal Sheet already shows, tried last.
const compManagerLabel = (raw, budget, fk, sheetLabels, directory) => {
  const text = String(raw ?? "").trim();
  if (!text) return "";
  const viaFk = fk.get(text.toLowerCase());
  if (viaFk) return viaFk;
  const fromPair = (id, name) => {
    const i = String(id ?? "").trim();
    const n = String(name ?? "").trim();
    return i && n ? `${i} - ${n}` : "";
  };
  // 1) Employee Master roster the budget store loaded, 2) every employee on the
  // Appraisal Sheet (a Comp Manager is an employee too), 3) labels already on the sheet.
  const roster = [...(budget.employeeRows || []), ...(budget.locationEmployeeRows || [])];
  const emp = roster.find((e) =>
    [e?.emp_id, e?.employee_id, e?.employeeId, e?.emp_name, e?.employee_name, e?.name, e?.email, e?.email_id]
      .some((x) => x && sameOwner(x, text)),
  );
  const a = emp && fromPair(emp.emp_id || emp.employee_id || emp.employeeId, emp.emp_name || emp.employee_name || emp.name);
  if (a) return a;
  const d = (directory || []).find((e) => [e.id, e.name].some((x) => x && sameOwner(x, text)));
  const b = d && fromPair(d.id, d.name);
  if (b) return b;
  const seen = (sheetLabels || []).find((l) => sameOwner(l, text));
  return seen || text;
};

// The Comp Managers allocated under ONE Tech-ED, from Budget_Distribution_Comp
// (child.budget_distribution_id -> the Tech-ED's Budget_Distribution row).
// Returns [] when the Tech-ED has none, and never mixes in another Tech-ED's.
export const compManagersUnder = (techEdKey, budget, sheetLabels = [], directory = []) => {
  const parents = new Set(
    techEdDistributionRows(techEdKey, budget)
      .map((r) => String(r.id ?? r.ROWID ?? "").trim())
      .filter(Boolean),
  );
  if (!parents.size) return [];
  const fk = fkMap(budget);
  const out = new Map();
  inActiveCycle(budget.budgetCompManagerRows, budget).forEach((c) => {
    if (!parents.has(String(c.budget_distribution_id ?? "").trim())) return;
    const label = compManagerLabel(c.comp_manager, budget, fk, sheetLabels, directory);
    if (!label) return;
    // One person = one row, however the id was stored ("emp001", "EMP001 - Name", ROWID).
    const id = ownerOf(label)?.id || label.toLowerCase();
    const hit = out.get(id);
    if (hit) {
      hit.allocated += num(c.applied_budget);
      if (!hit.label.includes(" - ") && label.includes(" - ")) hit.label = label;
    } else out.set(id, { label, allocated: num(c.applied_budget) });
  });
  return Array.from(out.values()).sort((a, b) => a.label.localeCompare(b.label));
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

// Full value, Indian grouping: "₹ 3,92,45,000". No L / Cr shortening anywhere.
export const fmMoney = (v) => {
  const x = num(v);
  const s = x < 0 ? "−" : "";
  return `${s}₹ ${Math.round(Math.abs(x)).toLocaleString("en-IN")}`;
};

// Same, without the rupee sign, for table cells.
export const fmAmt = (v) => fmMoney(v).replace("₹ ", "");

// Bar label: the full whole-number value ("3,92,45,000").
export const barNum = (v) => Math.round(num(v)).toLocaleString("en-IN");

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