// Outlier flags for the Dashboard's "Outliers To Review" tab.
// A flag is a data row (name, category, rule), not code, so HR can add, change
// or switch off flags in Flag Setup. The rows are kept per location in this browser.
import { COLUMNS, hikeAmount as calcHikeAmount } from "@/lib/appraisal-data";
import { calcHikePct, cycleKeyOf, isPromoted, num, pctOfBase, ratingOf, recordHikePct, MIN_GROUP } from "@/lib/dashboard-overview";
import { toNum } from "@/lib/dashboard-analysis";

/* Fields a flag can look at: every column of the Appraisal Sheet, in sheet order.
   [key, label, getter, kind]  kind "n" = a number, "t" = text.
   A few columns keep their short keys (hk, mr ...) so flags saved earlier still work. */
const KEYED = {
  hikePct: ["hk", (r) => calcHikePct(r)],
  hikeAmount: ["ha", (r) => calcHikeAmount(r)],
  managerRating: ["mr", (r) => ratingOf(r)],
  clientRating: ["cr", (r) => toNum(r.clientRating) ?? 0],
  rrPercent: ["rr", (r) => toNum(r.rrPercent) ?? 0],
  grossMargin: ["gm", (r) => toNum(r.grossMargin) ?? 0],
  totalExperience: ["tot", (r) => toNum(r.totalExperience) ?? 0],
  wissenExperience: ["wex", (r) => toNum(r.wissenExperience) ?? 0],
  interviewCount: ["iv", (r) => toNum(r.interviewCount) ?? 0],
  eligibleForPromotion: ["promo", (r) => (isPromoted(r) ? 1 : 0)],
};
const NUMERIC_TYPES = ["number", "decimal", "percent", "currency"];
const isNumericCol = (c) => !!c.computed || NUMERIC_TYPES.includes(c.type) || (c.type === "enum" && (c.options || []).length > 0 && c.options.every((o) => toNum(o) !== null));
const colLabel = (c) => (c.key === "hikePct" ? "Hike %" : c.label);

export const FLAG_FIELDS = [
  ...COLUMNS.map((c) => {
    const kd = KEYED[c.key];
    if (kd) return [kd[0], colLabel(c), kd[1], "n"];
    if (isNumericCol(c)) return [c.key, c.label, (r) => toNum(c.computed && c.fn ? c.fn(r) : r[c.key]) ?? 0, "n"];
    return [c.key, c.label, (r) => String(r[c.key] ?? "").trim(), "t", c.type === "enum" ? c.options : null];
  }),
  // Bonuses as a share of base pay (not a column of their own).
  ["pb", "PB % of Base Pay", (r) => pctOfBase(r.allocatedPBAmount, r.currentAnnualBasePay), "n"],
  ["rb", "RB % of Base Pay", (r) => pctOfBase(r.newRB, r.currentAnnualBasePay), "n"],
];
const FIELD = Object.fromEntries(FLAG_FIELDS.map(([k, l, f, t, o]) => [k, { l, f, t, o }]));
/* Only number fields can be averaged, compared as a percentage, or used for past / peer / share flags. */
export const FLAG_NUM_FIELDS = FLAG_FIELDS.filter((f) => f[3] === "n").map(([k, l]) => [k, l]);
export const isTextField = (f) => FIELD[f]?.t === "t";
export const fieldOptions = (f) => FIELD[f]?.o || null;

// What an earlier cycle's history record can tell us (the others are not kept per cycle).
const PAST = {
  hk: recordHikePct,
  ha: (rec) => num(rec?.hikeAmount),
  pb: (rec) => (num(rec?.basePay) > 0 ? (num(rec.performanceBonus) / num(rec.basePay)) * 100 : null),
  rb: (rec) => (num(rec?.basePay) > 0 ? (num(rec.retentionBonus) / num(rec.basePay)) * 100 : null),
};
export const PAST_FIELDS = FLAG_FIELDS.filter(([k]) => PAST[k]).map(([k, l]) => [k, l]);

export const FLAG_OPS = [[">=", "at or above"], ["<=", "at or below"], [">", "above"], ["<", "below"], ["=", "equal to"]];
export const TEXT_OPS = [["is", "is"], ["isnot", "is not"], ["has", "contains"], ["hasnot", "does not contain"], ["filled", "is filled in"], ["empty", "is empty"]];
/* How a condition joins the one before it. "not" means "and not". */
export const LOGIC_FIRST = [["if", "If"], ["not", "If not"]];
export const LOGIC_NEXT = [["and", "and"], ["or", "or"], ["not", "and not"]];
/* What a condition compares with. */
export const CMP_KINDS = [
  ["v", "is (a value)"],
  ["cf", "is (compared with another field)"],
  ["cavg", "is (compared with company average of)"],
  ["f", "differs from another field"],
  ["avg", "differs from company average of"],
  ["p", "is a % (compared with another field)"],
  ["pavg", "is a % (compared with company average of)"],
];
export const PCT_DIRS = [["more", "more than"], ["less", "less than"], ["of", "of"]];
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
export const fieldText = (r, f) => String(FIELD[f]?.f(r) ?? "");
export const fieldShow = (r, f) => (f === "promo" ? (isPromoted(r) ? "Yes" : "No") : isTextField(f) ? fieldText(r, f) || "(empty)" : fieldNum(r, f).toFixed(2));
export const textOpText = (o) => (TEXT_OPS.find((x) => x[0] === o) || [o, o])[1];
const cmpText = (s, o, v) => {
  const a = String(s).trim().toLowerCase();
  const b = String(v ?? "").trim().toLowerCase();
  return o === "is" ? a === b : o === "isnot" ? a !== b : o === "has" ? a.includes(b) : o === "hasnot" ? !a.includes(b) : o === "filled" ? a !== "" : o === "empty" ? a === "" : false;
};
/* The % one number is of / more than / less than another. null when the other is zero. */
export const pctRel = (a, b, dir) => (!b ? null : dir === "of" ? (a / b) * 100 : dir === "less" ? ((b - a) / Math.abs(b)) * 100 : ((a - b) / Math.abs(b)) * 100);
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

/* Point a condition at another field, resetting what no longer fits. */
export const condSetField = (c, f) => {
  const wasText = isTextField(c.f);
  c.f = f;
  if (f === "promo") Object.assign(c, { op: "=", rt: "v", v: 1 });
  else if (isTextField(f)) {
    if (!wasText) Object.assign(c, { rt: "t", op: "is", s: "" });
    else if (fieldOptions(f)) c.s = "";
    ["f2", "abs", "dir", "v"].forEach((k) => delete c[k]);
  } else if (wasText || c.rt === "t") {
    Object.assign(c, { rt: "v", op: ">=", v: 0 });
    delete c.s;
  }
};
export const condSetKind = (c, rt) => {
  c.rt = rt;
  if (rt !== "v" && !c.f2) c.f2 = "hk";
  if ((rt === "p" || rt === "pavg") && !c.dir) c.dir = "more";
};

export const flagSetType = (r, t) => {
  ["cd", "f", "dir", "v", "of"].forEach((k) => delete r[k]);
  r.ty = t;
  if (t === "cmp") r.cd = [{ f: "hk", op: "<=", rt: "v", v: 1 }];
  else if (t === "past") Object.assign(r, { f: "hk", dir: "above", v: 5 });
  else if (t === "peer") Object.assign(r, { f: "hk", v: 2 });
  else Object.assign(r, { f: "ha", of: "cm", v: 2.5 });
};

/* One condition in words. */
export const condText = (c) => {
  const o = opText(c.op);
  if (c.rt === "t" || isTextField(c.f)) {
    const needsValue = c.op !== "filled" && c.op !== "empty";
    return `${fieldLabel(c.f)} ${textOpText(c.op)}${needsValue ? ` "${c.s ?? ""}"` : ""}`;
  }
  if (c.rt === "cf") return `${fieldLabel(c.f)} is ${o} ${fieldLabel(c.f2)}`;
  if (c.rt === "cavg") return `${fieldLabel(c.f)} is ${o} the company average ${fieldLabel(c.f2)}`;
  if (c.rt === "f") {
    return c.abs
      ? `${fieldLabel(c.f)} and ${fieldLabel(c.f2)} differ by ${c.v}${c.op === ">=" || c.op === ">" ? " or more" : " or less"}`
      : `${fieldLabel(c.f)} minus ${fieldLabel(c.f2)} is ${o} ${c.v}`;
  }
  if (c.rt === "avg") return `${fieldLabel(c.f)} minus company average ${fieldLabel(c.f2)} is ${o} ${c.v}`;
  if (c.rt === "p" || c.rt === "pavg") {
    const other = c.rt === "pavg" ? `the company average ${fieldLabel(c.f2)}` : fieldLabel(c.f2);
    return `${fieldLabel(c.f)} is ${o} ${c.v}% ${c.dir === "of" ? "of" : `${c.dir === "less" ? "less" : "more"} than`} ${other}`;
  }
  if (c.f === "promo") return `Promoted is ${c.v ? "Yes" : "No"}`;
  return `${fieldLabel(c.f)} is ${o} ${c.v}`;
};
const LOGIC_WORD = { and: "and", or: "or", not: "and not" };

/* Plain-language reading of a flag. */
export const flagDesc = (r, dimName) => {
  if (r.ty === "cmp") {
    const parts = r.cd.map((c, i) => {
      const t = condText(c);
      if (!i) return c.lg === "not" ? `it is not true that ${t}` : t;
      return `${LOGIC_WORD[c.lg] || "and"} ${t}`;
    });
    return parts.join(" ") + ".";
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
  const testCond = (c, r) => {
    if (c.rt === "t" || isTextField(c.f)) return cmpText(fieldText(r, c.f), c.op, c.s);
    const a = fieldNum(r, c.f);
    if (c.rt === "cf") return cmpOp(a, c.op, fieldNum(r, c.f2));
    if (c.rt === "cavg") return cmpOp(a, c.op, x.av(c.f2));
    if (c.rt === "f") {
      let l = a - fieldNum(r, c.f2);
      if (c.abs) l = Math.abs(l);
      return cmpOp(l, c.op, c.v);
    }
    if (c.rt === "avg") return cmpOp(a - x.av(c.f2), c.op, c.v);
    if (c.rt === "p" || c.rt === "pavg") {
      const p = pctRel(a, c.rt === "pavg" ? x.av(c.f2) : fieldNum(r, c.f2), c.dir);
      return p !== null && cmpOp(p, c.op, c.v);
    }
    return cmpOp(a, c.op, c.v);
  };
  const test = (flag, r) => {
    if (flag.ty === "cmp") {
      if (!flag.cd.length) return false;
      // "and" / "and not" stay in the same group; "or" starts a new one. A flag matches when any group fully holds.
      const groups = [];
      flag.cd.forEach((c, i) => {
        const t = testCond(c, r) !== (c.lg === "not");
        if (i === 0 || c.lg === "or") groups.push([t]);
        else groups[groups.length - 1].push(t);
      });
      return groups.some((g) => g.every(Boolean));
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
  if (flag.ty === "cmp") {
    return `${flag.cd
      .map((c) => {
        const base = `${fieldLabel(c.f)} ${fieldShow(r, c.f)}`;
        if (c.rt === "cf") return `${base} against ${fieldLabel(c.f2)} ${fieldShow(r, c.f2)}`;
        if (c.rt === "cavg") return `${base} against company average ${x.av(c.f2).toFixed(2)}`;
        if (c.rt === "f") return `${base} against ${fieldLabel(c.f2)} ${fieldShow(r, c.f2)}`;
        if (c.rt === "avg") return `${base} against company average ${x.av(c.f2).toFixed(2)}`;
        if (c.rt === "p" || c.rt === "pavg") {
          const b = c.rt === "pavg" ? x.av(c.f2) : fieldNum(r, c.f2);
          const p = pctRel(fieldNum(r, c.f), b, c.dir);
          const other = c.rt === "pavg" ? `company average ${fieldLabel(c.f2)}` : fieldLabel(c.f2);
          return `${base} against ${other} ${b.toFixed(2)}${p === null ? "" : ` (${p.toFixed(1)}% ${c.dir === "of" ? "of it" : c.dir === "less" ? "less" : "more"})`}`;
        }
        return base;
      })
      .join(", ")}.`;
  }
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