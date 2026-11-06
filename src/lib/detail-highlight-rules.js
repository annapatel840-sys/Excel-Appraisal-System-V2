/* ============================================================
   Detail Screen > Panel > Config tab: HIGHLIGHT RULES.

   Rules are chosen by the user and kept in this browser (localStorage),
   exactly like the reference page. Nothing is sent to the server.
   A rule reads one Appraisal Sheet field of the open employee and
   colours its tile / adds a flag on the Panel's Info tab.
   ============================================================ */

const hlNum = (v) => {
  const n = parseFloat(String(v ?? "").replace(/,/g, ""));
  return Number.isNaN(n) ? null : n;
};

// `r` is the panel context: { raw: employee row, doj, hikePctNow, proRata }.
const fromRow = (read) => (r) => (r.raw ? read(r.raw) : null);

export const HL_FIELDS = [
  { key: "source", label: "Source", type: "text", raw: (e) => e.sourceOfHire },
  { key: "band", label: "Band", type: "text", raw: (e) => e.band },
  { key: "orgExp", label: "Wissen exp as on 1st Jan", type: "num", raw: (e) => hlNum(e.wissenExperience) },
  { key: "totalExp", label: "Total Experience as on 1st Jan", type: "num", raw: (e) => hlNum(e.totalExperience) },
  { key: "doj", label: "Date of Joining", type: "text", get: (r) => r.doj },
  { key: "rating", label: "Manager Rating", type: "num", raw: (e) => hlNum(e.managerRating) },
  { key: "clientRating", label: "Client Rating", type: "num", raw: (e) => hlNum(e.clientRating) },
  { key: "interviews", label: "Interview Count", type: "num", raw: (e) => hlNum(e.interviewCount) },
  { key: "rr", label: "RR%", type: "num", raw: (e) => hlNum(e.rrPercent) },
  { key: "grossMargin", label: "Gross Margin", type: "num", raw: (e) => hlNum(e.grossMargin) },
  { key: "clientManager", label: "Client Manager", type: "text", raw: (e) => e.clientManager },
  { key: "designation", label: "Designation", type: "text", raw: (e) => e.designation },
  { key: "compManager", label: "Comp. Manager", type: "text", raw: (e) => e.compManager },
  { key: "techEd", label: "Tech-ED", type: "text", raw: (e) => e.appraiserTechED },
  { key: "lastAppraisal", label: "Last Appraisal", type: "text", raw: (e) => e.lastAppraisalDate },
  { key: "pbPaid", label: "PB to be Paid", type: "num", raw: (e) => hlNum(e.pbToBePaid) },
  { key: "pbMonth", label: "Month (PB)", type: "text", raw: (e) => e.monthPB },
  { key: "rbPaid", label: "RB to be Paid", type: "num", raw: (e) => hlNum(e.rbToBePaid) },
  { key: "rbMonth", label: "Month (RB)", type: "text", raw: (e) => e.monthRB },
  { key: "basePay", label: "Base pay", type: "num", raw: (e) => hlNum(e.currentAnnualBasePay) },
  {
    key: "newBase",
    label: "New Base Salary",
    type: "num",
    raw: (e) => {
      const b = hlNum(e.currentAnnualBasePay);
      return b === null ? null : b + (hlNum(e.hikeAmount) || 0);
    },
  },
  { key: "hikeAmt", label: "Hike Amount", type: "num", raw: (e) => hlNum(e.hikeAmount) },
  { key: "hikePct", label: "Hike%", type: "num", get: (r) => r.hikePctNow },
  { key: "newRB", label: "Retention Bonus (RB)", type: "num", raw: (e) => hlNum(e.newRB) },
  { key: "newPB", label: "Performance Bonus (PB)", type: "num", raw: (e) => hlNum(e.allocatedPBAmount) },
  { key: "inst", label: "Instalment", type: "num", raw: (e) => hlNum(e.pbInstallment) },
  { key: "targetPB", label: "Target PB allocated", type: "num", raw: (e) => hlNum(e.targetPBAllocatedForMay) },
  { key: "tpbNext", label: "Target PB for Next Year", type: "num", raw: (e) => hlNum(e.targetPBNextYear) },
  { key: "tpbCriteria", label: "Target PB criteria", type: "text", raw: (e) => e.targetPBCriteria },
  { key: "remarks", label: "Comp Manager Remarks", type: "text", raw: (e) => e.compManagerRemarks },
  { key: "promo", label: "Eligible for Promotion", type: "text", raw: (e) => e.eligibleForPromotion },
  { key: "newTitle", label: "New Title", type: "text", raw: (e) => e.newTitle },
  {
    key: "totalBonus",
    label: "Total Bonus-PB and RB",
    type: "num",
    raw: (e) => {
      const a = hlNum(e.allocatedPBAmount);
      const b = hlNum(e.newRB);
      return a === null && b === null ? null : (a || 0) + (b || 0);
    },
  },
  { key: "atRisk", label: "At Risk", type: "text", raw: (e) => e.atRisk },
  {
    key: "proRata",
    label: "Pro rata % (months in cycle)",
    type: "num",
    get: (r) => (r.proRata < 1 ? Math.round(r.proRata * 100) : 100),
  },
].map((f) => (f.get ? f : { ...f, get: fromRow(f.raw) }));

export const HL_OPS = [
  ["is", "is"],
  ["isnot", "is not"],
  ["gt", "is greater than"],
  ["lt", "is less than"],
  ["blank", "is blank"],
];

export const HL_COLORS = [
  ["red", "Red"],
  ["amber", "Amber"],
  ["green", "Green"],
];

const HL_KEY = "hl.rules.detail";
const HL_DEFAULT = [
  { id: "r1", on: true, field: "source", op: "is", value: "Grads", color: "amber", label: "Source: Grads" },
];

export const hlField = (key) => HL_FIELDS.find((f) => f.key === key);

export function loadRules() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(HL_KEY));
    if (Array.isArray(parsed)) return parsed;
  } catch {
    // storage unavailable or damaged: use the default
  }
  return JSON.parse(JSON.stringify(HL_DEFAULT));
}

export function saveRules(rules) {
  try {
    window.localStorage.setItem(HL_KEY, JSON.stringify(rules));
  } catch {
    // storage unavailable: the rules still work for this visit
  }
}

export function ruleMatches(rule, r) {
  const f = hlField(rule.field);
  if (!f || !rule.on) return false;

  const v = f.get(r);
  const blank = v === null || v === undefined || v === "" || (f.type === "num" && Number.isNaN(v));

  if (rule.op === "blank") return blank;
  if (blank) return false;

  if (f.type === "num") {
    const a = parseFloat(v);
    const b = parseFloat(rule.value);
    if (Number.isNaN(b)) return false;
    return rule.op === "is" ? a === b : rule.op === "isnot" ? a !== b : rule.op === "gt" ? a > b : a < b;
  }

  const x = String(v).trim().toLowerCase();
  const y = String(rule.value ?? "").trim().toLowerCase();
  return rule.op === "is" ? x === y : rule.op === "isnot" ? x !== y : false;
}

export const matchingRules = (rules, r) => rules.filter((rule) => ruleMatches(rule, r));

// Strongest colour among the rules that match `fieldKey`.
export function levelFor(rules, r, fieldKey) {
  const rank = { red: 3, amber: 2, green: 1 };
  let best = "";
  matchingRules(rules, r).forEach((m) => {
    if (m.field === fieldKey && rank[m.color] > (rank[best] || 0)) best = m.color;
  });
  return best;
}

export function describeRule(rule) {
  const f = hlField(rule.field);
  const o = HL_OPS.find((x) => x[0] === rule.op);
  return `${f ? f.label : rule.field} ${o ? o[1] : rule.op}${rule.op === "blank" ? "" : ` ${rule.value}`}`;
}

// Distinct values found in one column of the rows (for the value drop-down).
export function valuesForField(rows, key) {
  const f = hlField(key);
  const seen = new Set();
  if (!f || !f.raw) return [];
  (rows || []).forEach((row) => {
    const v = f.raw(row);
    if (v !== null && v !== undefined && v !== "") seen.add(String(v));
  });
  return [...seen].sort();
}