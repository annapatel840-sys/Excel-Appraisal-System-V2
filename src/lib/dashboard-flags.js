// Outlier flags for the Dashboard's "Outliers To Review" tab.
// A flag is a data row (name, category, rule), not code, so HR can add, change
// or switch off flags in Flag Setup. The rows are kept per location in this browser.
import { hikeAmount as calcHikeAmount } from "@/lib/appraisal-data";
import { calcHikePct, cycleKeyOf, isPromoted, num, pctOfBase, ratingOf, recordHikePct, MIN_GROUP } from "@/lib/dashboard-overview";
import { toNum } from "@/lib/dashboard-analysis";

/* Fields a flag can look at (the Appraisal Sheet column labels). */
export const FLAG_FIELDS = [
  ["hk", "Hike %", (r) => calcHikePct(r)],
  ["ha", "Hike Amount", (r) => calcHikeAmount(r)],
  ["mr", "Manager Rating", (r) => ratingOf(r)],
  ["cr", "Client Rating", (r) => toNum(r.clientRating) ?? 0],
  ["rr", "RR%", (r) => toNum(r.rrPercent) ?? 0],
  ["gm", "Gross Margin", (r) => toNum(r.grossMargin) ?? 0],
  ["tot", "Total Experience as on 1st Jan", (r) => toNum(r.totalExperience) ?? 0],
  ["wex", "Wissen Experience as on 1st Jan", (r) => toNum(r.wissenExperience) ?? 0],
  ["pb", "PB", (r) => pctOfBase(r.allocatedPBAmount, r.currentAnnualBasePay)],
  ["rb", "RB", (r) => pctOfBase(r.newRB, r.currentAnnualBasePay)],
  ["iv", "Interview Count", (r) => toNum(r.interviewCount) ?? 0],
  ["promo", "Promoted", (r) => (isPromoted(r) ? 1 : 0)],
];
const FIELD = Object.fromEntries(FLAG_FIELDS.map(([k, l, f]) => [k, { l, f }]));

// What an earlier cycle's history record can tell us (the others are not kept per cycle).
const PAST = {
  hk: recordHikePct,
  ha: (rec) => num(rec?.hikeAmount),
  pb: (rec) => (num(rec?.basePay) > 0 ? (num(rec.performanceBonus) / num(rec.basePay)) * 100 : null),
  rb: (rec) => (num(rec?.basePay) > 0 ? (num(rec.retentionBonus) / num(rec.basePay)) * 100 : null),
};
export const PAST_FIELDS = FLAG_FIELDS.filter(([k]) => PAST[k]).map(([k, l]) => [k, l]);

export const FLAG_OPS = [[">=", "at or above"], ["<=", "at or below"], [">", "above"], ["<", "below"], ["=", "equal to"]];
export const FLAG_TYPES = [
  ["cmp", "Compare with a value or another field"],
  ["past", "Compare with own past cycles"],
  ["peer", "Compare with peers"],
  ["share", "Share of a group total"],
];
export const PEER_KEYS = ["cm", "te", "dg", "tx", "wx", "mr", "cr", "rr", "gm"];

export const fieldLabel = (f) => FIELD[f]?.l || f;
export const opText = (o) => (FLAG_OPS.find((x) => x[0] === o) || [o, o])[1];
export const fieldNum = (r, f) => Number(FIELD[f]?.f(r)) || 0;
export const fieldShow = (r, f) => (f === "promo" ? (isPromoted(r) ? "Yes" : "No") : fieldNum(r, f).toFixed(2));
const cmpOp = (a, o, b) => (o === ">=" ? a >= b : o === "<=" ? a <= b : o === ">" ? a > b : o === "<" ? a < b : Math.abs(a - b) < 1e-9);

export const starterCats = () => [
  { id: "rw", n: "Reward" },
  { id: "ct", n: "Contribution" },
  { id: "ot", n: "Other" },
];
export const starterFlags = () => {
  const V = (f, op, v) => ({ f, op, rt: "v", v });
  return [
    { id: "pn", n: "Promoted, No Hike", c: "rw", on: true, ty: "cmp", cd: [V("promo", "=", 1), V("hk", "<=", 1)] },
    { id: "po", n: "Hike Above Own Past", c: "rw", on: true, ty: "past", f: "hk", dir: "above", v: 8 },
    { id: "sd", n: "Hike Far From Peers", c: "rw", on: true, ty: "peer", f: "hk", v: 2 },
    { id: "cs", n: "Top Rating, Low Hike", c: "ct", on: true, ty: "cmp", cd: [V("mr", ">=", 4), V("hk", "<", 6)] },
    { id: "lr", n: "Low Rating, High Hike", c: "ct", on: true, ty: "cmp", cd: [V("mr", "<=", 2), V("hk", ">=", 10)] },
    { id: "rr", n: "High RR%, Low Hike", c: "ct", on: true, ty: "cmp", cd: [V("rr", ">=", 90), V("hk", "<", 6)] },
    { id: "gm", n: "High Gross Margin, Low Hike", c: "ct", on: true, ty: "cmp", cd: [V("gm", ">=", 45), V("hk", "<", 6)] },
    { id: "gp", n: "Ratings Far Apart", c: "ct", on: true, ty: "cmp", cd: [{ f: "mr", op: ">=", rt: "f", f2: "cr", abs: true, v: 1.5 }] },
    { id: "cn", n: "Budget Concentration", c: "ot", on: true, ty: "share", f: "ha", of: "cm", v: 2.5 },
    { id: "ex", n: "Experienced, Hike Below Average", c: "ot", on: true, ty: "cmp", cd: [V("tot", ">=", 10), { f: "hk", op: "<", rt: "avg", f2: "hk", v: -2 }] },
  ];
};

/* Saved flag rows, per location. */
const KEY = "comp_home_flags_v1";
const keyFor = (loc) => `${KEY}:${String(loc || "All").toLowerCase()}`;
export const loadFlagSetup = (loc) => {
  try {
    const j = JSON.parse(window.localStorage.getItem(keyFor(loc)) || "null");
    if (j && Array.isArray(j.cats) && Array.isArray(j.flags)) return { cats: j.cats, flags: j.flags, nid: j.nid || 100 };
  } catch { /* storage is optional */ }
  return { cats: starterCats(), flags: starterFlags(), nid: 100 };
};
export const saveFlagSetup = (loc, v) => {
  try {
    window.localStorage.setItem(keyFor(loc), JSON.stringify(v));
  } catch { /* storage is optional */ }
};

export const flagSetType = (r, t) => {
  ["cd", "f", "dir", "v", "of"].forEach((k) => delete r[k]);
  r.ty = t;
  if (t === "cmp") r.cd = [{ f: "hk", op: "<=", rt: "v", v: 1 }];
  else if (t === "past") Object.assign(r, { f: "hk", dir: "above", v: 5 });
  else if (t === "peer") Object.assign(r, { f: "hk", v: 2 });
  else Object.assign(r, { f: "ha", of: "cm", v: 2.5 });
};

/* Plain-language reading of a flag. */
export const flagDesc = (r, dimName) => {
  if (r.ty === "cmp") {
    return (
      r.cd
        .map((c) => {
          const o = opText(c.op);
          if (c.rt === "f") {
            return c.abs
              ? `${fieldLabel(c.f)} and ${fieldLabel(c.f2)} differ by ${c.v}${c.op === ">=" || c.op === ">" ? " or more" : " or less"}`
              : `${fieldLabel(c.f)} minus ${fieldLabel(c.f2)} is ${o} ${c.v}`;
          }
          if (c.rt === "avg") return `${fieldLabel(c.f)} minus company average ${fieldLabel(c.f2)} is ${o} ${c.v}`;
          if (c.f === "promo") return `Promoted is ${c.v ? "Yes" : "No"}`;
          return `${fieldLabel(c.f)} is ${o} ${c.v}`;
        })
        .join(" and ") + "."
    );
  }
  if (r.ty === "past") return `${fieldLabel(r.f)} is more than ${r.v} ${r.dir === "below" ? "below" : "above"} the person's own average of the cycles picked in Compare With.`;
  if (r.ty === "peer") return `${fieldLabel(r.f)} is more than ${r.v} standard deviations from the peer group average.`;
  return `One person takes ${r.v}% or more of their ${dimName || r.of}'s total ${fieldLabel(r.f)}.`;
};

/* ---------------- running the flags on the people in view ---------------- */

/* ctx: { peers: [dimension keys], bucketIndex(row, key) -> number, pastCycles: [cycle keys], historyOf, dimName(key) } */
export const buildFlagContext = (rows, flags, ctx) => {
  const GP = {};
  const AV = {};
  const PS = {};
  const SM = {};
  const pk = new Map();
  rows.forEach((r) => {
    const k = ctx.peers.map((d) => ctx.bucketIndex(r, d)).join("|");
    pk.set(r, k);
    (GP[k] = GP[k] || []).push(r);
  });
  const mean = (a) => a.reduce((x, y) => x + y, 0) / (a.length || 1);
  const x = {
    av: (f) => {
      if (!(f in AV)) AV[f] = mean(rows.map((r) => fieldNum(r, f)));
      return AV[f];
    },
    past: (r, f) => {
      const fn = PAST[f];
      if (!fn || !ctx.pastCycles.length) return null;
      const recs = ctx.historyOf(r.empId) || [];
      const v = [];
      ctx.pastCycles.forEach((key) => {
        const rec = recs.find((h) => cycleKeyOf(h.cycleName) === key);
        const val = rec ? fn(rec) : null;
        if (val !== null && val !== undefined && Number.isFinite(val)) v.push(val);
      });
      return v.length ? mean(v) : null;
    },
    peer: (r, f) => {
      const k = `${pk.get(r)}#${f}`;
      if (!(k in PS)) {
        const g = GP[pk.get(r)] || [];
        if (g.length < MIN_GROUP) PS[k] = null;
        else {
          const a = g.map((q) => fieldNum(q, f));
          const m = mean(a);
          const sd = Math.sqrt(mean(a.map((y) => (y - m) * (y - m))));
          PS[k] = sd < 0.01 ? null : { m, sd, n: a.length };
        }
      }
      return PS[k];
    },
    share: (r, f, of) => {
      const sk = `${of}#${f}`;
      if (!SM[sk]) {
        SM[sk] = {};
        rows.forEach((q) => {
          const b = ctx.bucketIndex(q, of);
          SM[sk][b] = (SM[sk][b] || 0) + fieldNum(q, f);
        });
      }
      const t = SM[sk][ctx.bucketIndex(r, of)];
      return t ? (fieldNum(r, f) / t) * 100 : 0;
    },
  };
  const test = (flag, r) => {
    if (flag.ty === "cmp") {
      if (!flag.cd.length) return false;
      return flag.cd.every((c) => {
        const a = fieldNum(r, c.f);
        if (c.rt === "f") {
          let l = a - fieldNum(r, c.f2);
          if (c.abs) l = Math.abs(l);
          return cmpOp(l, c.op, c.v);
        }
        if (c.rt === "avg") return cmpOp(a - x.av(c.f2), c.op, c.v);
        return cmpOp(a, c.op, c.v);
      });
    }
    if (flag.ty === "past") {
      const a = x.past(r, flag.f);
      if (a === null) return false;
      const d = fieldNum(r, flag.f) - a;
      return flag.dir === "below" ? d < -flag.v : d > flag.v;
    }
    if (flag.ty === "peer") {
      const s = x.peer(r, flag.f);
      return !!s && Math.abs(fieldNum(r, flag.f) - s.m) > flag.v * s.sd;
    }
    if (flag.ty === "share") return ctx.peers && flag.of ? x.share(r, flag.f, flag.of) >= flag.v : false;
    return false;
  };
  const active = flags.filter((f) => f.on);
  const hits = new Map();
  rows.forEach((r) => hits.set(r, active.filter((f) => test(f, r)).map((f) => f.id)));
  return { x, hits };
};

/* Why one person is flagged. */
export const flagWhy = (flag, r, x, dimName) => {
  if (flag.ty === "cmp") return `${flag.cd.map((c) => `${fieldLabel(c.f)} ${fieldShow(r, c.f)}`).join(", ")}.`;
  if (flag.ty === "past") {
    const a = x.past(r, flag.f);
    return `${fieldLabel(flag.f)} ${fieldShow(r, flag.f)} against own past average ${a === null ? "–" : a.toFixed(2)}.`;
  }
  if (flag.ty === "peer") {
    const s = x.peer(r, flag.f);
    return s ? `${fieldLabel(flag.f)} ${fieldShow(r, flag.f)} against peer average ${s.m.toFixed(2)} (${fieldNum(r, flag.f) > s.m ? "higher" : "lower"}).` : "";
  }
  return `Takes ${x.share(r, flag.f, flag.of).toFixed(2)}% of the ${dimName} group's total ${fieldLabel(flag.f)}.`;
};