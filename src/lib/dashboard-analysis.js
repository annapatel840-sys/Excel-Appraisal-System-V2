// Pure helpers for the Dashboard tab (the "Against" analysis). Everything is
// computed from rows the Appraisal store already loaded; previous cycles come
// from each person's own history (usePreviousCycleData), same people only.
import { MANAGER_RATING_LABELS } from "@/lib/appraisal-data";
import {
  calcHikePct,
  cycleKeyOf,
  isPromoted,
  num,
  pctOfBase,
  ratingOf,
  recordHikePct,
} from "@/lib/dashboard-overview";

export const toNum = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const x = Number(String(v).replace(/[%,]/g, ""));
  return Number.isFinite(x) ? x : null;
};

export const statsOf = (values) => {
  const v = values.filter((x) => x !== null && x !== undefined && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const sum = v.reduce((s, x) => s + x, 0);
  const mid = Math.floor(v.length / 2);
  return {
    n: v.length,
    min: v[0],
    max: v[v.length - 1],
    sum,
    avg: sum / v.length,
    med: v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2,
  };
};

/* ---------------- what is measured ---------------- */

const base = (r) => num(r.currentAnnualBasePay);
const histPct = (field) => (rec) => (num(rec?.basePay) > 0 ? (num(rec[field]) / num(rec.basePay)) * 100 : null);
const hasTarget = (r) => num(r.targetPBAllocatedForMay) > 0;

// parts: what is drawn per group. of(row) -> number | null. hist(record) -> number | null
// (null hist = not available for earlier cycles). kind: "p" percent, "a" amount.
const HIKE = { k: "hk", label: "Hike %", kind: "p", of: calcHikePct, hist: recordHikePct };
const PB = { k: "pb", label: "PB % of base pay", kind: "p", of: (r) => pctOfBase(r.allocatedPBAmount, base(r)), hist: histPct("performanceBonus") };
const RB = { k: "rb", label: "RB % of base pay", kind: "p", of: (r) => pctOfBase(r.newRB, base(r)), hist: histPct("retentionBonus") };
const PBRB = {
  k: "pbrb",
  label: "PB + RB % of base pay",
  kind: "p",
  of: (r) => pctOfBase(num(r.allocatedPBAmount) + num(r.newRB), base(r)),
  hist: (rec) => (num(rec?.basePay) > 0 ? ((num(rec.performanceBonus) + num(rec.retentionBonus)) / num(rec.basePay)) * 100 : null),
};

export const SPREAD_MODES = [["spread", "Range"], ["avg", "Average"], ["med", "Median"], ["cnt", "People"]];

export const OUTPUTS = [
  {
    k: "inc",
    label: "Pay increase",
    measures: [{ k: "hk", label: "Hike %", parts: [HIKE] }],
  },
  {
    k: "prm",
    label: "Promotions",
    measures: [
      {
        k: "prt",
        label: "Promotion rate",
        parts: [{ k: "prt", label: "Promoted %", kind: "p", of: (r) => (isPromoted(r) ? 100 : 0), hist: null }],
        modes: [["avg", "Average"], ["cnt", "People"]],
        mode: "avg",
      },
      {
        k: "prh",
        label: "Hike: promoted vs not promoted",
        parts: [
          { k: "prh", label: "Promoted", kind: "p", of: (r) => (isPromoted(r) ? calcHikePct(r) : null), hist: null },
          { k: "pnh", label: "Not promoted", kind: "p", of: (r) => (isPromoted(r) ? null : calcHikePct(r)), hist: null },
        ],
      },
    ],
  },
  {
    k: "bon",
    label: "Bonus",
    measures: [
      { k: "pb", label: "PB", parts: [PB] },
      { k: "rb", label: "RB", parts: [RB] },
      { k: "pbrb", label: "PB + RB", parts: [PBRB] },
      {
        k: "pvt",
        label: "PB vs target agreed last year",
        parts: [
          { k: "tpl", label: "Target PB", kind: "a", of: (r) => (hasTarget(r) ? num(r.targetPBAllocatedForMay) : null), hist: null },
          { k: "pbl", label: "PB paid", kind: "a", of: (r) => (hasTarget(r) ? num(r.allocatedPBAmount) : null), hist: null },
        ],
        modes: [["sum", "Total"], ["avg", "Average"], ["med", "Median"]],
        mode: "sum",
      },
    ],
  },
];

/* ---------------- what the people are split against ---------------- */

const RATING_BUCKETS = [1, 2, 3, 4, 5].map((n) => ({
  label: `${n} · ${MANAGER_RATING_LABELS[n]}`,
  test: (r) => ratingOf(r) === n,
}));

const cleanText = (v) => String(v ?? "").trim();

const catBuckets = (of) => (rows) => {
  const seen = new Set(rows.map((r) => cleanText(of(r)) || "Unassigned"));
  return Array.from(seen)
    .sort((a, b) => (a === "Unassigned") - (b === "Unassigned") || a.localeCompare(b))
    .map((label) => ({ label, test: (r) => (cleanText(of(r)) || "Unassigned") === label }));
};

const yesNo = (label, yes, no) => () => [
  { label: yes, test: (r) => label(r) },
  { label: no, test: (r) => !label(r) },
];

const cutLabel = (v, unit) => (unit === "%" ? `${v}%` : String(v));
export const parseCuts = (text) =>
  Array.from(
    new Set(
      String(text ?? "")
        .split(/[\s,;]+/)
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x)),
    ),
  ).sort((a, b) => a - b);

const numBuckets = (of, unit) => (rows, cuts) => {
  const c = cuts && cuts.length ? cuts : [];
  const out = [];
  if (!c.length) {
    out.push({ label: "Everyone", test: (r) => of(r) !== null });
  } else {
    out.push({ label: `Under ${cutLabel(c[0], unit)}`, test: (r) => of(r) !== null && of(r) < c[0] });
    for (let i = 0; i < c.length - 1; i += 1) {
      const lo = c[i];
      const hi = c[i + 1];
      out.push({ label: `${cutLabel(lo, unit)} to ${cutLabel(hi, unit)}`, test: (r) => of(r) !== null && of(r) >= lo && of(r) < hi });
    }
    const last = c[c.length - 1];
    out.push({ label: `${cutLabel(last, unit)} and more`, test: (r) => of(r) !== null && of(r) >= last });
  }
  if (rows.some((r) => of(r) === null)) out.push({ label: "No data", test: (r) => of(r) === null });
  return out;
};

export const DIM_GROUPS = ["Team", "Role", "Performance", "Experience", "Revenue", "Other"];

// level: "te" only HR, "cm" HR and Tech-ED. Everyone sees the rest.
export const DIMENSIONS = [
  { k: "te", g: 0, label: "Tech-ED", level: "te", buckets: catBuckets((r) => r.appraiserTechED) },
  { k: "cm", g: 0, label: "Comp Manager", level: "cm", buckets: catBuckets((r) => r.compManager) },
  { k: "cl", g: 0, label: "Client Manager", buckets: catBuckets((r) => r.clientManager) },
  { k: "cc", g: 0, label: "Cost Center / Client", buckets: catBuckets((r) => r.costCenterClient) },
  { k: "dg", g: 1, label: "Designation", buckets: catBuckets((r) => r.designation) },
  {
    k: "mr",
    g: 2,
    label: "Manager Rating",
    buckets: (rows) =>
      rows.some((r) => !ratingOf(r)) ? [...RATING_BUCKETS, { label: "Not rated", test: (r) => !ratingOf(r) }] : RATING_BUCKETS,
  },
  { k: "cr", g: 2, label: "Client Rating", cuts: [3, 4], unit: "", of: (r) => toNum(r.clientRating) },
  { k: "tx", g: 3, label: "Total experience (years)", cuts: [2, 5, 10], unit: "", of: (r) => toNum(r.totalExperience) },
  { k: "wx", g: 3, label: "Wissen experience (years)", cuts: [2, 5, 10], unit: "", of: (r) => toNum(r.wissenExperience) },
  { k: "yr", g: 3, label: "YoE ratio", cuts: [0.25, 0.5, 0.75], unit: "", of: (r) => toNum(r.yoeRatio) },
  { k: "rr", g: 4, label: "RR %", cuts: [70, 85, 100], unit: "%", of: (r) => toNum(r.rrPercent) },
  { k: "gm", g: 4, label: "Gross margin", cuts: [20, 35, 50], unit: "%", of: (r) => toNum(r.grossMargin) },
  { k: "iv", g: 5, label: "Interview count", cuts: [3, 6, 9], unit: "", of: (r) => toNum(r.interviewCount) },
  { k: "pr", g: 5, label: "Promotion", buckets: yesNo(isPromoted, "Promoted", "Not promoted") },
  {
    k: "rk",
    g: 5,
    label: "At risk",
    buckets: yesNo((r) => cleanText(r.atRisk) !== "", "At risk", "Not at risk"),
  },
].map((d) => (d.of ? { ...d, numeric: true, buckets: numBuckets(d.of, d.unit) } : d));

export const dimensionsFor = (effectiveId) =>
  DIMENSIONS.filter((d) => {
    if (d.level === "te") return effectiveId !== "teched" && effectiveId !== "compmanager";
    if (d.level === "cm") return effectiveId !== "compmanager";
    return true;
  });

export const bucketsOf = (dim, rows, cuts) => dim.buckets(rows, cuts).filter((b) => rows.some(b.test));

/* ---------------- a group's numbers ---------------- */

export const valuesOf = (rows, part) => rows.map(part.of).filter((v) => v !== null && v !== undefined);

// The same people's numbers in one earlier cycle (null when too few have it).
export const previousStats = (rows, part, cycleKey, historyOf, minGroup) => {
  if (!part.hist) return null;
  const vals = [];
  rows.forEach((r) => {
    const rec = (historyOf(r.empId) || []).find((h) => cycleKeyOf(h.cycleName) === cycleKey);
    const v = rec ? part.hist(rec) : null;
    if (v !== null && v !== undefined && Number.isFinite(v)) vals.push(v);
  });
  return vals.length >= minGroup ? statsOf(vals) : null;
};

export const fmtVal = (kind, v) =>
  kind === "a" ? Math.round(num(v)).toLocaleString("en-IN") : num(v).toFixed(2);