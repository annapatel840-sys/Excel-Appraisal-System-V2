// Pure helpers for the Dashboard tab (the "Against" analysis). Everything is
// computed from rows the Appraisal store already loaded; previous cycles come
// from each person's own history (usePreviousCycleData), same people only.
import { MANAGER_RATING_LABELS } from "@/lib/appraisal-data";
import {
  MIN_GROUP,
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
// exc: Exceptional raises given after an earlier cycle can be shown on top of that cycle's bar.
const HIKE = { k: "hk", label: "Hike %", kind: "p", of: calcHikePct, hist: recordHikePct, exc: true };
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
    label: "Pay Increase",
    measures: [{ k: "hk", label: "Hike %", parts: [HIKE] }],
  },
  {
    k: "prm",
    label: "Promotions",
    measures: [
      {
        k: "prt",
        label: "Promotion Rate",
        parts: [{ k: "prt", label: "Promoted %", kind: "p", of: (r) => (isPromoted(r) ? 100 : 0), hist: null }],
        modes: [["avg", "Average"], ["cnt", "People"]],
        mode: "avg",
      },
      {
        k: "prh",
        label: "Hike: Promoted vs Not Promoted",
        parts: [
          { k: "prh", label: "Promoted", kind: "p", of: (r) => (isPromoted(r) ? calcHikePct(r) : null), hist: null },
          { k: "pnh", label: "Not Promoted", kind: "p", of: (r) => (isPromoted(r) ? null : calcHikePct(r)), hist: null },
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
        label: "PB vs Target Agreed Last Year",
        parts: [
          { k: "tpl", label: "Target PB", kind: "a", of: (r) => (hasTarget(r) ? num(r.targetPBAllocatedForMay) : null), hist: null },
          { k: "pbl", label: "PB Paid", kind: "a", of: (r) => (hasTarget(r) ? num(r.allocatedPBAmount) : null), hist: null },
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
  if (rows.some((r) => of(r) === null)) out.push({ label: "No Data", test: (r) => of(r) === null });
  return out;
};

export const DIM_GROUPS = ["Team", "Role", "Experience", "Ratings", "Revenue", "Other"];

// level: "te" only HR, "cm" HR and Tech-ED. Everyone sees the rest.
export const DIMENSIONS = [
  { k: "te", g: 0, label: "Tech-ED", level: "te", buckets: catBuckets((r) => r.appraiserTechED) },
  { k: "cm", g: 0, label: "Comp Manager", level: "cm", buckets: catBuckets((r) => r.compManager) },
  { k: "cl", g: 0, label: "Client Manager", buckets: catBuckets((r) => r.clientManager) },
  { k: "cc", g: 0, label: "Cost Center / Client", buckets: catBuckets((r) => r.costCenterClient) },
  { k: "dg", g: 1, label: "Designation", buckets: catBuckets((r) => r.designation) },
  {
    k: "mr",
    g: 3,
    label: "Manager Rating",
    buckets: (rows) =>
      rows.some((r) => !ratingOf(r)) ? [...RATING_BUCKETS, { label: "Not Rated", test: (r) => !ratingOf(r) }] : RATING_BUCKETS,
  },
  { k: "cr", g: 3, label: "Client Rating", cuts: [3, 4], unit: "", of: (r) => toNum(r.clientRating) },
  { k: "tx", g: 2, label: "Total Experience as on 1st Jan", cuts: [2, 5, 10], unit: "", of: (r) => toNum(r.totalExperience) },
  { k: "wx", g: 2, label: "Wissen Experience as on 1st Jan", cuts: [2, 5, 10], unit: "", of: (r) => toNum(r.wissenExperience) },
  { k: "yr", g: 2, label: "YoE Ratio", cuts: [0.25, 0.5, 0.75], unit: "", of: (r) => toNum(r.yoeRatio) },
  { k: "rr", g: 4, label: "RR%", cuts: [70, 85, 100], unit: "%", of: (r) => toNum(r.rrPercent) },
  { k: "gm", g: 4, label: "Gross Margin", cuts: [20, 35, 50], unit: "%", of: (r) => toNum(r.grossMargin) },
  { k: "iv", g: 5, label: "Interview Count", cuts: [3, 6, 9], unit: "", of: (r) => toNum(r.interviewCount) },
  { k: "pr", g: 5, label: "Promotion", buckets: yesNo(isPromoted, "Promoted", "Not Promoted") },
  {
    k: "rk",
    g: 5,
    label: "At Risk",
    buckets: yesNo((r) => cleanText(r.atRisk) !== "", "At Risk", "Not At Risk"),
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

/* ======================================================================
   Added for the new Dashboard tab
   ====================================================================== */

export const PART_COLOR = {
  hk: "#1D3B5E",
  pb: "#7FCFC2",
  rb: "#2A9D8F",
  pbrb: "#475569",
  prt: "#B8C0CC",
  prh: "#1D3B5E",
  pnh: "#9CA3AF",
  tpl: "#9CA3AF",
  pbl: "#1D3B5E",
};
export const EXC_COLOR = "#F2B84B"; // Exceptional raise added on top of an earlier cycle
export const EXC_BAR = "#F7D58F"; // Exceptional cycle drawn as its own bar

// Mix a #rrggbb colour with white (t = 0 keeps it, 1 is white).
export const mixColor = (hex, t) => {
  const n = parseInt(String(hex).slice(1), 16);
  const m = (c) => Math.round(c + (255 - c) * t).toString(16).padStart(2, "0");
  return `#${m(n >> 16)}${m((n >> 8) & 255)}${m(n & 255)}`;
};
export const shadesOf = (hex) => [mixColor(hex, 0.45), mixColor(hex, 0.62), mixColor(hex, 0.8)];

// Parameters whose buckets rise in order (used for the plain-language reading).
export const ORDERED = new Set(["rr", "gm", "mr", "cr"]);

// Default parameters listed under "Against".
export const DEFAULT_AGAINST = ["mr", "pr", "rr", "gm", "tx"];

/* ---------------- Exceptional raises ---------------- */

// A person's Exceptional raise (hike % points) in one Exceptional cycle; 0 when none.
export const excPtsOf = (row, excKey, historyOf) => {
  const rec = (historyOf(row.empId) || []).find((h) => cycleKeyOf(h.cycleName) === excKey);
  const v = rec ? recordHikePct(rec) : null;
  return v !== null && Number.isFinite(v) && v > 0 ? v : 0;
};

// Exceptional cycles that came after a regular cycle, newest last.
export const excAfter = (regular, excCycles) =>
  excCycles.filter((e) => e.when && regular.when && e.when > regular.when);

// One person's value for one part in an earlier cycle (null when not in that cycle).
export const previousValues = (rows, part, cycleKey, historyOf) => {
  if (!part.hist) return [];
  const out = [];
  rows.forEach((r) => {
    const rec = (historyOf(r.empId) || []).find((h) => cycleKeyOf(h.cycleName) === cycleKey);
    const v = rec ? part.hist(rec) : null;
    if (v !== null && v !== undefined && Number.isFinite(v)) out.push(v);
  });
  return out;
};

/* ---------------- Guidance (kept per location in this browser) ---------------- */

export const GUIDE_SOURCES = {
  hr: "HR Guidance",
  ted: "Tech ED Guidance",
  cm: "Comp Manager Guidance",
  off: "No Guidance",
};
export const GUIDE_OWNER = { hr: "HR", ted: "The Tech ED", cm: "The Comp Manager" };
export const ownerSourceOf = (effectiveId) => (effectiveId === "hr" ? "hr" : effectiveId === "teched" ? "ted" : "cm");

// Which guidance sources a login can look at (pill order).
export const guideSourcesFor = (effectiveId) => {
  const all = ["off", "hr", "ted", "cm"];
  return all.filter((k) => {
    if (k === "off" || k === "hr") return true;
    if (k === "ted") return true;
    return effectiveId === "compmanager" || effectiveId === "hr";
  }).filter((k) => !(effectiveId === "teched" && k === "cm"));
};

const GUIDE_KEY = "comp_home_guidance_v1";
export const emptyGuidance = () => ({ DG: { hr: {}, ted: {}, cm: {} }, DP: { hr: {}, ted: {}, cm: {} }, CUTS: {}, TOL: 2 });

export const loadGuidance = (location) => {
  const out = emptyGuidance();
  try {
    const j = JSON.parse(window.localStorage.getItem(`${GUIDE_KEY}:${String(location || "All").toLowerCase()}`) || "null");
    if (!j) return out;
    if (Number.isFinite(j.TOL) && j.TOL >= 0) out.TOL = j.TOL;
    ["DG", "DP"].forEach((g) =>
      ["hr", "ted", "cm"].forEach((o) => {
        const src = (j[g] && j[g][o]) || {};
        Object.keys(src).forEach((r) => {
          if (Array.isArray(src[r])) out[g][o][r] = src[r].map((v) => (v === null || v === "" ? null : Number(v)));
        });
      }),
    );
    Object.keys(j.CUTS || {}).forEach((k) => {
      if (Array.isArray(j.CUTS[k]) && j.CUTS[k].length) out.CUTS[k] = j.CUTS[k].map(Number).filter(Number.isFinite);
    });
  } catch { /* storage is optional */ }
  return out;
};

export const saveGuidance = (location, g) => {
  try {
    window.localStorage.setItem(`${GUIDE_KEY}:${String(location || "All").toLowerCase()}`, JSON.stringify(g));
  } catch { /* storage is optional */ }
};

// [lo, hi] for a rating, or null when not both set (or lo > hi).
export const rangeFor = (map, rating) => {
  const x = map ? map[rating] : null;
  return x && Number.isFinite(x[0]) && Number.isFinite(x[1]) && x[0] <= x[1] ? x : null;
};

// Rating number from a bucket label such as "3 · Meets Expectation".
export const ratingOfLabel = (label) => parseInt(String(label), 10);

/* ---------------- PB paid vs the target agreed last year ---------------- */

const targetOf = (r) => (num(r.targetPBAllocatedForMay) > 0 ? num(r.targetPBAllocatedForMay) : null);
const paidOf = (r) => (targetOf(r) !== null ? num(r.allocatedPBAmount) : null);
export const pbTarget = targetOf;
export const pbPaid = paidOf;

// -1 under, 0 within, 1 over the guidance (or Target +/- tolerance when no guidance); null without a target.
export const pbStatus = (r, dp, tol) => {
  const t = targetOf(r);
  if (t === null) return null;
  const pct = (paidOf(r) / t) * 100;
  const g = rangeFor(dp, ratingOf(r));
  const lo = g ? g[0] : 100 - tol;
  const hi = g ? g[1] : 100 + tol;
  return pct < lo ? -1 : pct > hi ? 1 : 0;
};

export const pbCounts = (rows, dp, tol) => {
  const c = { u: 0, o: 0, v: 0, n: 0 };
  rows.forEach((r) => {
    const x = pbStatus(r, dp, tol);
    if (x === null) return;
    c.n += 1;
    if (x < 0) c.u += 1;
    else if (x > 0) c.v += 1;
    else c.o += 1;
  });
  return c;
};

// Total target and total paid for the people who had a target.
export const pbPair = (rows) => {
  let t = 0;
  let p = 0;
  let n = 0;
  rows.forEach((r) => {
    const a = targetOf(r);
    if (a === null) return;
    t += a;
    p += paidOf(r);
    n += 1;
  });
  return { t, p, n };
};

/* ---------------- number formats ---------------- */

export const fmtAvg = (kind, v) => (kind === "a" ? Math.round(num(v)).toLocaleString("en-IN") : num(v).toFixed(2));


/* ---------------- one group's numbers, with earlier cycles ---------------- */

/* o: { regCycles, excFor(cycle) -> Exceptional cycles added on top of it, excBars, historyOf }
   Returns { label, rows, n, few, parts: [{ part, st, cmp: [{ c, j, st, add, n, pn }], exc: [{ c, st, n }] }] } */
export const describeGroup = (rows, label, parts, o) => {
  const d = { label, rows, n: rows.length, few: rows.length < MIN_GROUP, parts: [] };
  if (d.few) return d;
  parts.forEach((part) => {
    const st = statsOf(valuesOf(rows, part));
    const cmp = [];
    if (st && part.hist) {
      o.regCycles.forEach((c, j) => {
        const vals = previousValues(rows, part, c.key, o.historyOf);
        if (vals.length < MIN_GROUP) return;
        let add = 0;
        let n = 0;
        if (part.exc) {
          const ex = o.excFor(c);
          if (ex.length) {
            let tot = 0;
            rows.forEach((r) => {
              const x = ex.reduce((a, e) => a + excPtsOf(r, e.key, o.historyOf), 0);
              tot += x;
              if (x > 0) n += 1;
            });
            if (n >= MIN_GROUP) add = tot / rows.length;
          }
        }
        cmp.push({ c, j, st: statsOf(vals), add, n, pn: vals.length });
      });
    }
    const exc = [];
    if (part.exc) {
      o.excBars.forEach((e) => {
        const pts = rows.map((r) => excPtsOf(r, e.key, o.historyOf)).filter((v) => v > 0);
        if (pts.length >= MIN_GROUP) exc.push({ c: e, st: statsOf(pts), n: pts.length });
      });
    }
    d.parts.push({ part, st, cmp, exc });
  });
  return d;
};

// How many of the lines rise from first to last (and mostly go up): [rising, total].
export const risesIn = (lines) => {
  let k = 0;
  let t = 0;
  lines.forEach((l) => {
    const v = l.filter((x) => x !== null && x !== undefined);
    if (v.length < 2) return;
    t += 1;
    let up = 0;
    let dn = 0;
    for (let i = 1; i < v.length; i += 1) {
      if (v[i] > v[i - 1]) up += 1;
      else if (v[i] < v[i - 1]) dn += 1;
    }
    if (v[v.length - 1] > v[0] && up >= dn) k += 1;
  });
  return [k, t];
};

// "What this shows" lines under a chart (first measure, average per group). **text** marks bold.
export const insightLines = (T, part, dimLabel, ordered) => {
  const val = (d) => {
    if (!d || d.few) return null;
    const p = d.parts.find((x) => x.part.k === part.k);
    return p && p.st ? p.st.avg : null;
  };
  const C = [];
  T.forEach((d) => {
    const v = val(d);
    if (v !== null) C.push({ l: d.label, v, n: d.n });
  });
  if (C.length < 2) return [];
  const hi = C.reduce((a, c) => (c.v > a.v ? c : a));
  const lo = C.reduce((a, c) => (c.v < a.v ? c : a));
  const f = (v) => fmtAvg(part.kind, v);
  const L = [`Highest: **${hi.l}** at ${f(hi.v)} (${hi.n} people). Lowest: **${lo.l}** at ${f(lo.v)} (${lo.n} people).`];
  if (ordered) {
    const r1 = risesIn([T.map(val)]);
    if (r1[1]) L.push(`${part.label} ${r1[0] === r1[1] ? "rises" : "does not rise"} across ${dimLabel} ranges.`);
  }
  L.push(`Gap between highest and lowest: ${f(hi.v - lo.v)}. Groups under ${MIN_GROUP} people are left out.`);
  return L;
};