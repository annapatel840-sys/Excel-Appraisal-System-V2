/*
 * Letters engine (pure JavaScript: no React, no DOM, no network).
 *
 * Ported from the "Letters v2" prototype. Every function takes the Letters
 * state object `S` as its first argument and mutates it in place; the store
 * (letters-store.js) owns the object and tells React when it changed.
 *
 *   S = { orgs, cycles, sheet, letters, audit, rules, fields, tpls, sign,
 *         generated, actor, t }
 *
 * The same rules will run on the server when the Letters Catalyst function is
 * built, so keep this file free of browser APIs.
 *
 * Templates are the one part that is already stored on the server (lettersapi:
 * Stratus bucket for the Word file and content, Data Store for the index).
 * applyServerTemplates() loads them into this state; publishTemplate() records
 * a publish after the server accepted it.
 */

/* ---------------- constants ---------------- */

// Appraisal Sheet columns a Letter Field can point at: [column, label, kind]
export const CAT = [
  ["promo", "Promotion", "flag"],
  ["hikeAmt", "Hike Amount", "amount"],
  ["hikePct", "Hike %", "pct"],
  ["basePay", "Current Base", "amount"],
  ["newBase", "New Base", "amount"],
  ["newPB", "PB", "amount"],
  ["newRB", "RB", "amount"],
  ["tpbNext", "Target PB for Next Year", "amount"],
  ["newTitle", "New Designation", "text"],
  ["designation", "Designation", "text"],
  ["effDate", "Effective Date", "text"],
  ["pbInst", "PB Instalment", "text"],
  ["band", "Band", "text"],
  ["rating", "Manager Rating", "text"],
  ["compRemarks", "Comp Manager Remarks", "text"],
  // Employee Master columns (4th item = where the column lives)
  ["emLocation", "Location", "text", "Employee Master"],
  ["emDoj", "Date of Joining", "text", "Employee Master"],
  ["emGrade", "Grade", "text", "Employee Master"],
  ["emManager", "Reporting Manager", "text", "Employee Master"],
  ["emDept", "Department", "text", "Employee Master"],
];
export const sourceOf = (c) => (c && c[3]) || "Appraisal Sheet";

// Tags that are always available in a template (not tied to a Letter Field).
export const FIXED_TAGS = [
  "Name",
  "Emp ID",
  "Designation",
  "Letter Date",
  "Company Name",
  "Signatory Name",
  "Signatory Designation",
  "Signature",
  "Financial Year",
  "PB Schedule",
  "PB Pay Month",
  "RB Pay Month",
  "Target PB Pay Month",
  "Acceptance Link",
];

export const STATUSES = [
  "Ready",
  "Out of date",
  "Reviewed",
  "Sent",
  "Delivered",
  "Failed",
  "Voided",
  "Replaced",
  "Dropped",
];
// Status -> chip colour class (see letters-page.css)
export const STATUS_CLASS = {
  Active: "so",
  Inactive: "sg",
  Draft: "si",
  Ready: "si",
  "Out of date": "sw",
  Reviewed: "si",
  Sent: "so",
  Delivered: "so",
  Failed: "sw",
  Voided: "sg",
  Replaced: "sg",
  Dropped: "sg",
};
// A letter in one of these still has to be sent.
export const OPEN_STATUSES = ["Ready", "Reviewed", "Out of date", "Failed"];
export const SENT_STATUSES = ["Sent", "Delivered"];
// Letters that do not count as "this employee already has a letter".
const GONE_STATUSES = ["Replaced", "Dropped"];

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ---------------- small formatters ---------------- */

// Indian digit grouping: 1234567 -> 12,34,567
export function inr(n) {
  n = Math.round(Number(n) || 0);
  const s = String(Math.abs(n));
  let l = s.slice(-3);
  const r = s.slice(0, -3);
  if (r) l = r.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + l;
  return (n < 0 ? "-" : "") + l;
}

export function pct(n) {
  return (Number(n) || 0).toFixed(2) + "%";
}

export function num(v) {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
const w99 = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : ""));
const w999 = (n) => {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return (h ? ONES[h] + " Hundred" + (r ? " " : "") : "") + (r ? w99(r) : "");
};

// 2000000 -> "Rupees Twenty Lakh Only"
export function words(n) {
  n = Math.round(n);
  if (!n) return "";
  const p = [];
  const cr = Math.floor(n / 1e7);
  n %= 1e7;
  const lk = Math.floor(n / 1e5);
  n %= 1e5;
  const th = Math.floor(n / 1e3);
  n %= 1e3;
  if (cr) p.push(w999(cr) + " Crore");
  if (lk) p.push(w99(lk) + " Lakh");
  if (th) p.push(w99(th) + " Thousand");
  if (n) p.push(w999(n));
  return "Rupees " + p.join(" ") + " Only";
}

const z2 = (n) => (n < 10 ? "0" : "") + n;

// "10-Nov-2026 14:05"
export function nowStamp(d = new Date()) {
  return z2(d.getDate()) + "-" + MON[d.getMonth()] + "-" + d.getFullYear() + " " + z2(d.getHours()) + ":" + z2(d.getMinutes());
}

// "10-Nov-2026"
export function todayLabel(d = new Date()) {
  return z2(d.getDate()) + "-" + MON[d.getMonth()] + "-" + d.getFullYear();
}

// Indian financial year of an ISO date: 2026-04-01 -> "2026-27", 2027-02-10 -> "2026-27"
export function fyOf(iso) {
  const m = /^(\d{4})-(\d{2})/.exec(String(iso || ""));
  if (!m) return "";
  const y = Number(m[1]);
  const start = Number(m[2]) >= 4 ? y : y - 1;
  return start + "-" + String(start + 1).slice(-2);
}

/* ---------------- lookups ---------------- */

export const catOf = (c) => CAT.filter((x) => x[0] === c)[0];
export const cyOf = (S, id) => S.cycles.filter((c) => c.id === id)[0];
export const tplOf = (S, id) => S.tpls.filter((t) => t.id === id)[0];
export const rowOf = (S, id) => S.sheet.filter((r) => r.id === id)[0];
export const lOf = (S, id) => S.letters.filter((l) => l.id === id)[0];
export const empOf = (S, l) => rowOf(S, l.emp);

export function hasVal(row, col) {
  const c = catOf(col);
  const v = row.v[col];
  if (!c) return false;
  if (c[2] === "flag") return v === "Yes";
  if (c[2] === "amount" || c[2] === "pct") return num(v) > 0;
  return String(v == null ? "" : v).trim() !== "";
}

export function fmtVal(row, col) {
  const c = catOf(col);
  const v = row.v[col];
  if (v == null) return "";
  if (c && c[2] === "amount") return inr(v);
  if (c && c[2] === "pct") return pct(v);
  return String(v);
}

/* ---------------- audit ---------------- */

export function mkAudit(S, scope, ref, action, reason, detail, tpl) {
  return {
    id: "A" + Date.now().toString(36) + "-" + (S.audit.length + 1),
    when: S.t || nowStamp(),
    scope,
    ref: ref || "",
    action,
    by: (S.actor || "HR") + " (HR)",
    reason: reason || "",
    detail: detail || "",
    tpl: tpl || "",
  };
}

export function audit(S, scope, ref, action, reason, detail, tpl) {
  S.audit.unshift(mkAudit(S, scope, ref, action, reason, detail, tpl));
}

// Once any letter has gone out, changes to rules / fields / templates need a
// reason and are audited; they apply only to letters made from then on.
export const lettersLocked = (S) => S.letters.some((l) => l.sentOn);

/* ---------------- rules: which letters does an employee get ---------------- */

function condOK(S, rule, row) {
  let ok = true;
  S.fields.forEach((f) => {
    if (!f.rules) return;
    const v = rule.cond && rule.cond[f.id];
    if (!v || v === "Any") return;
    if ((v === "Yes") !== hasVal(row, f.col)) ok = false;
  });
  return ok;
}

/* ---- templates are per location ----
   Templates with the same name form one letter. Each can be for one Location
   Master location (t.location = its name) or for all locations (""). A rule
   names one of them; the letter actually made uses the variant that fits the
   employee's location, else the "all locations" one, else none. */
export const ALL_LOCATIONS = "";
const same = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
export const templateGroup = (S, tplId) => {
  const base = tplOf(S, tplId);
  return base ? S.tpls.filter((t) => same(t.name, base.name)) : [];
};
export const locationLabel = (loc) => loc || "All locations";
export function resolveTemplate(S, tplId, row) {
  const act = templateGroup(S, tplId).filter((t) => t.active !== false);
  const loc = row && row.v ? row.v.emLocation : "";
  return act.filter((t) => t.location && same(t.location, loc))[0] || act.filter((t) => !t.location)[0] || null;
}

// One rule per family wins: the matching rule with the lowest priority number.
export function pick(S, row) {
  const cy = cyOf(S, row.cycle);
  const best = {};
  const where = row && row.v ? row.v.emLocation : "";
  S.rules.forEach((r) => {
    if (!r.active) return;
    // Rules are kept per location: a rule of one location never gives a letter to another location's people.
    if (r.location && !same(r.location, where)) return;
    if (r.cycle !== "Any" && (!cy || r.cycle !== cy.type)) return;
    if (r.org !== "Any" && r.org !== row.org) return;
    if (!condOK(S, r, row)) return;
    const b = best[r.family];
    if (!b || r.prio < b.prio) best[r.family] = r;
  });
  return Object.keys(best).map((f) => best[f]);
}

// Fingerprint of everything a letter was made from. A change flags it stale.
export const fpOf = (row, rule, tpl) => JSON.stringify([rule.id, tpl.id, tpl.ver, row.v]);

export function mkLetter(S, row, rule, tpl) {
  const l = {
    id: "L" + row.cycle + "-" + (S.letters.filter((x) => x.cycle === row.cycle).length + 1), // unique across cycles: letters of many cycles live side by side
    cycle: row.cycle,
    emp: row.id,
    family: rule.family,
    type: rule.type,
    rule: rule.id,
    ruleName: rule.name,
    tpl: tpl.id,
    ver: tpl.ver,
    status: "Ready",
    fp: "",
    snap: {},
    remarks: "",
    sentOn: "",
    sentBy: "",
    sentTo: "",
    resends: 0,
    lastResent: "",
    replaces: "",
    flag: "",
    alert: "",
    tag: "",
  };
  l.fp = fpOf(row, rule, tpl);
  S.fields.forEach((f) => {
    l.snap[f.col] = row.v[f.col];
  });
  return l;
}

/* Compare every unsent / sent letter with the Appraisal Sheet, rules and
   templates as they are now. Unsent letters become Out of date or Dropped;
   sent letters are never touched, only flagged "Changed after sending".
   `tag` is the short chip the Alert column shows; `alert` is the full reason
   (shown as its tooltip and in the Preview). */
export function refreshStale(S) {
  S.letters.forEach((l) => {
    const open = OPEN_STATUSES.indexOf(l.status) >= 0;
    const sent = SENT_STATUSES.indexOf(l.status) >= 0;
    if (!open && !sent) {
      if (l.status !== "Dropped") {
        l.alert = "";
        l.tag = "";
      }
      return;
    }
    const r = empOf(S, l);
    // The Appraisal Sheet row of this employee is not loaded here (a letter of another cycle or
    // location, restored from the server): there is nothing to compare with, so leave it as it is.
    if (!r) return;
    const rule = S.rules.filter((x) => x.id === l.rule)[0];
    const t = tplOf(S, l.tpl);
    const want = rule ? resolveTemplate(S, rule.tpl, r) : null;
    const m = r.status === "Active" ? pick(S, r).filter((x) => x.family === l.family)[0] : null;
    let why = "";
    const changed = !rule || !t || fpOf(r, rule, t) !== l.fp || t.ver !== l.ver;
    if (r.status !== "Active") why = "Employee is " + r.status;
    else if (!m) why = "No longer entitled to a " + l.family + " letter";
    else if (m.id !== l.rule) why = 'Now matches "' + m.type + '"';
    else if (rule && !want) why = "No active template for " + (r.v.emLocation || "this location");
    else if (want && want.id !== l.tpl) why = "The template for " + (r.v.emLocation || "this location") + " changed";
    else if (changed) why = "Appraisal Sheet or template changed";
    if (open) {
      if (why && (r.status !== "Active" || !m)) {
        l.status = "Dropped";
        l.alert = why;
        l.tag = "Dropped";
        audit(S, "Letter", l.id, "Dropped", "", why, "v" + l.ver);
      } else if (why) {
        l.status = "Out of date";
        l.alert = why;
        l.tag = "Appraisal sheet changed";
      } else {
        if (l.status === "Out of date") l.status = "Ready";
        l.alert = "";
        l.tag = "";
      }
    } else {
      l.flag = why ? "Changed after sending" : "";
      l.tag = !why ? "" : r.status !== "Active" ? "Employee inactive" : "Appraisal sheet changed";
      l.alert = why;
    }
  });
}

/* ---------------- generation (called from the Appraisal Cycle screen) ---------------- */

// Employees who should have a letter but do not yet: [[name, "Family - Type"]]
export function needLetters(S, scope) {
  const out = [];
  S.sheet.forEach((r) => {
    if (scope && !scope(r)) return;
    if (r.status !== "Active") return;
    pick(S, r).forEach((x) => {
      if (!S.letters.some((l) => l.emp === r.id && l.family === x.family && GONE_STATUSES.indexOf(l.status) < 0)) {
        out.push([r.name, x.family + " - " + x.type]);
      }
    });
  });
  return out;
}

/* Make the letters for one cycle from its Appraisal Sheet rows.
     - an entitled employee with no letter in a family gets a new Ready letter
     - an unsent letter that is Out of date is replaced by a fresh one
     - everything else (Reviewed, Sent, Voided ...) is left alone
   Safe to run again at any time. */
export function generateLetters(S, cycleId) {
  const cy = cyOf(S, cycleId);
  if (!cy) throw new Error("This cycle is not known to Letters.");
  refreshStale(S);
  let created = 0;
  let regenerated = 0;
  let kept = 0;
  S.sheet.forEach((r) => {
    if (r.cycle !== cycleId || r.status !== "Active") return;
    pick(S, r).forEach((rule) => {
      const t = resolveTemplate(S, rule.tpl, r); // the variant for this employee's location
      if (!t) return; // no active template for this location: no new letter
      const cur = S.letters.filter((l) => l.emp === r.id && l.family === rule.family && GONE_STATUSES.indexOf(l.status) < 0)[0];
      if (!cur) {
        const n = mkLetter(S, r, rule, t);
        S.letters.push(n);
        audit(S, "Letter", n.id, "Generated", "", "Rule " + rule.name + "; template v" + t.ver, "v" + t.ver);
        created++;
      } else if (cur.status === "Out of date") {
        const n = mkLetter(S, r, rule, t);
        n.replaces = cur.id;
        cur.status = "Replaced";
        cur.flag = "";
        cur.alert = "";
        S.letters.push(n);
        audit(S, "Letter", cur.id, "Replaced", "Regenerated from the Appraisal Cycle screen", "By " + n.id, "v" + cur.ver);
        audit(S, "Letter", n.id, "Generated (regenerated)", "", "Replaces " + cur.id + "; rule " + rule.name, "v" + t.ver);
        regenerated++;
      } else {
        kept++;
      }
    });
  });
  S.generated[cycleId] = true;
  refreshStale(S);
  return { created, regenerated, kept, total: S.letters.filter((l) => l.cycle === cycleId).length };
}

/* What the Appraisal Cycle screen shows on its Letters step. */
export function lettersStats(S, cycleId) {
  const ls = S.letters.filter((l) => l.cycle === cycleId);
  const count = (list) => ls.filter((l) => list.indexOf(l.status) >= 0).length;
  const outOfDate = count(["Out of date"]);
  const missing = S.generated[cycleId] ? needLetters(S, (r) => r.cycle === cycleId).length : 0;
  return {
    gen: !!S.generated[cycleId] || ls.length > 0,
    toSend: count(OPEN_STATUSES),
    sent: count(SENT_STATUSES),
    dropped: count(["Dropped"]),
    outOfDate,
    missing,
    total: ls.length,
  };
}

/* ---------------- merge: fill a template for one letter ---------------- */

export const sgOf = (S, l) => tplOf(S, l.tpl).sg;

export function allTags(S) {
  const t = FIXED_TAGS.slice();
  S.fields.forEach((f) => {
    if (f.tag && f.tagName) {
      t.push(f.tagName);
      const c = catOf(f.col);
      if (c && c[2] === "amount") t.push(f.tagName + " In Words");
    }
  });
  return t;
}

export function tagsIn(body) {
  const o = [];
  const re = /\{\{([^}]+)\}\}/g;
  let x;
  while ((x = re.exec(body))) if (o.indexOf(x[1]) < 0) o.push(x[1]);
  return o;
}

export function tagValues(S, l) {
  return valuesFor(S, empOf(S, l), sgOf(S, l), l.cycle, l.id);
}

// Tag values for one Appraisal Sheet row, with a given signatory block. Used
// for letters, and for previewing a template (even an unsaved draft) with the
// data of any employee.
export function valuesFor(S, r, G0, cycleId, letterId) {
  const v = r.v;
  const m = {
    Name: r.name,
    "Emp ID": r.id,
    Designation: v.designation,
    "Letter Date": G0.letterDate,
    "Company Name": G0.company,
    "Signatory Name": G0.name,
    "Signatory Designation": G0.title,
    Signature: G0.sigFile ? "[Signature]" : "",
    "Financial Year": (cyOf(S, cycleId) || {}).fy || "",
    "PB Schedule": (v.pbMonths || []).map((p) => p[0] + " - " + inr(p[1])).join("\n"),
    "PB Pay Month": v.pbMonths && v.pbMonths[0] ? v.pbMonths[0][0] : "",
    "RB Pay Month": v.rbMonth || "",
    "Target PB Pay Month": v.tpbMonth || "",
    "Acceptance Link": hasVal(r, "newRB") ? "https://comp.example/rb/" + letterId : "",
  };
  S.fields.forEach((f) => {
    if (!f.tag || !f.tagName) return;
    m[f.tagName] = fmtVal(r, f.col);
    const c = catOf(f.col);
    if (c && c[2] === "amount") m[f.tagName + " In Words"] = words(num(r.v[f.col]));
  });
  return m;
}

// Returns the filled text. An empty tag is wrapped in \u0001 ... \u0002 so the
// screen can highlight it, and is listed in `miss`.
export function merge(S, l) {
  const m = tagValues(S, l);
  const t = tplOf(S, l.tpl);
  const miss = [];
  const text = t.body.replace(/\{\{([^}]+)\}\}/g, (a, k) => {
    if (!(k in m) || m[k] === "") {
      if (miss.indexOf(k) < 0) miss.push(k);
      return "\u0001" + k + "\u0002";
    }
    return m[k];
  });
  return { text, miss };
}

/* ---------------- send ---------------- */

// Demo only: some letters "bounce" so the Failed / retry path can be seen.
const sendFails = (l) => parseInt(String(l.emp).replace(/\D/g, ""), 10) % 19 === 0;

export function doSend(S, l) {
  const r = empOf(S, l);
  l.sentOn = S.t || nowStamp();
  l.sentBy = (S.actor || "HR") + " (HR)";
  l.sentTo = r.email;
  const f = sendFails(l);
  l.status = f ? "Failed" : parseInt(String(l.emp).replace(/\D/g, ""), 10) % 2 === 0 ? "Delivered" : "Sent";
  audit(S, "Letter", l.id, f ? "Send failed" : "Sent", "", f ? "Mailbox rejected the message" : "To " + r.email + " from " + sgOf(S, l).from, "v" + l.ver);
}

// Why a letter cannot be sent right now ("" = it can).
export function sendProblem(S, l) {
  const r = empOf(S, l);
  if (["Reviewed", "Failed"].indexOf(l.status) < 0) return "status is " + l.status;
  if (!r.email) return "no email on the Employee Master";
  const sm = signatoryMessages(sgOf(S, l), S).filter((m) => /Signatory|Signature|Company|mailbox/.test(m));
  if (sm.length) return sm[0] + " (set in the template)";
  const mg = merge(S, l);
  if (mg.miss.length) return "empty tag " + mg.miss.map((k) => "{{" + k + "}}").join(", ");
  return "";
}

/* Send every letter in `ids` that is Reviewed / Failed. Returns what happened. */
export function sendLetters(S, ids) {
  const ls = ids.map((id) => lOf(S, id)).filter((l) => l && ["Reviewed", "Failed"].indexOf(l.status) >= 0);
  const sent = [];
  const blocked = [];
  ls.forEach((l) => {
    const p = sendProblem(S, l);
    if (p) blocked.push(empOf(S, l).name + " (" + l.type + "): " + p);
    else sent.push(l);
  });
  sent.forEach((l) => doSend(S, l));
  refreshStale(S);
  return { sent: sent.length, failed: sent.filter((l) => l.status === "Failed").length, blocked };
}

/* "Send" on the Letters screen for now: no mail goes out yet. A Ready letter (opening Preview does not change it)
   becomes Delivered and is stamped with who / when / to whom. When mail is connected, only this function changes. */
export const UNSENT_STATUSES = ["Ready", "Reviewed", "Failed"];
export function markSent(S, ids) {
  let n = 0;
  ids.forEach((id) => {
    const l = lOf(S, id);
    if (!l || UNSENT_STATUSES.indexOf(l.status) < 0) return;
    const r = empOf(S, l);
    l.status = "Delivered";
    l.sentOn = S.t || nowStamp();
    l.sentBy = (S.actor || "HR") + " (HR)";
    l.sentTo = (r && r.email) || "";
    audit(S, "Letter", l.id, "Sent", "", "Marked as sent (mail is not connected yet)" + (l.sentTo ? "; to " + l.sentTo : ""), "v" + l.ver);
    n++;
  });
  refreshStale(S);
  return n;
}

/* The result of a real e-mail. ok -> Delivered (stamped with who / when / to whom);
   not ok -> Failed, with the reason in the audit trail so HR can fix it and Send again. */
export function recordMailResult(S, id, ok, message, from) {
  const l = lOf(S, id);
  if (!l) return false;
  const r = empOf(S, l);
  l.sentOn = S.t || nowStamp();
  l.sentBy = (S.actor || "HR") + " (HR)";
  l.sentTo = (r && r.email) || "";
  if (ok) {
    l.status = "Delivered";
    audit(S, "Letter", l.id, "Sent", "", "Emailed to " + l.sentTo + (from ? " from " + from : ""), "v" + l.ver);
  } else {
    l.status = "Failed";
    audit(S, "Letter", l.id, "Send failed", "", String(message || "The email could not be sent."), "v" + l.ver);
  }
  refreshStale(S);
  return true;
}

export function markReviewed(S, ids) {
  let n = 0;
  ids.forEach((id) => {
    const l = lOf(S, id);
    if (l && l.status === "Ready") {
      l.status = "Reviewed";
      audit(S, "Letter", l.id, "Marked reviewed", "", "", "v" + l.ver);
      n++;
    }
  });
  return n;
}

/* Resend / Void / Replace, always with a reason.
   (Resend of a Failed letter sends it again; Resend of a Sent letter is counted.) */
export function moreAction(S, action, ids, reason) {
  if (action === "withdraw") action = "void"; // old name
  ids.forEach((id) => {
    const l = lOf(S, id);
    if (!l) return;
    if (action === "resend") {
      if (l.status === "Failed") {
        const rk = sendProblem(S, l);
        if (rk) {
          audit(S, "Letter", l.id, "Resend blocked", reason, rk, "v" + l.ver);
          return;
        }
        doSend(S, l);
        audit(S, "Letter", l.id, "Resend after failure", reason, "", "v" + l.ver);
        return;
      }
      l.resends++;
      l.lastResent = nowStamp();
      audit(S, "Letter", l.id, "Resent", reason, "To " + empOf(S, l).email, "v" + l.ver);
    } else if (action === "void") {
      const was = l.status;
      l.status = "Voided";
      l.flag = "";
      l.alert = "";
      l.tag = "";
      audit(S, "Letter", l.id, "Voided", reason, (SENT_STATUSES.indexOf(was) >= 0 ? "Was already sent; " : "") + (l.family === "Bonus" && hasVal(empOf(S, l), "newRB") ? "the acceptance link stops working" : ""), "v" + l.ver);
    } else if (action === "replace") {
      l.status = "Replaced";
      l.flag = "";
      l.alert = "";
      l.tag = "";
      const n = JSON.parse(JSON.stringify(l));
      n.id = "L" + (S.letters.length + 1);
      n.status = "Ready";
      n.sentOn = "";
      n.sentBy = "";
      n.sentTo = "";
      n.resends = 0;
      n.lastResent = "";
      n.replaces = l.id;
      n.remarks = "";
      n.flag = "";
      n.alert = "";
      n.tag = "";
      const rule = S.rules.filter((x) => x.id === l.rule)[0];
      if (rule) {
        n.fp = fpOf(empOf(S, l), rule, tplOf(S, l.tpl));
        S.fields.forEach((f) => {
          n.snap[f.col] = empOf(S, l).v[f.col];
        });
      }
      S.letters.push(n);
      audit(S, "Letter", l.id, "Replaced", reason, "By " + n.id + (l.family === "Bonus" && hasVal(empOf(S, l), "newRB") ? "; the old acceptance link stops working" : ""), "v" + l.ver);
      audit(S, "Letter", n.id, "Generated (replacement)", reason, "Replaces " + l.id, "v" + n.ver);
    }
  });
  refreshStale(S);
}

/* Opening a Ready letter in Preview counts as reviewing it. */
export function reviewOnPreview(S, id) {
  const l = lOf(S, id);
  if (!l || l.status !== "Ready") return false;
  l.status = "Reviewed";
  audit(S, "Letter", l.id, "Reviewed", "", "Opened in Preview", "v" + l.ver);
  return true;
}

export function testSend(S, l) {
  audit(S, "Letter", l.id, "Test sent", "", "To " + sgOf(S, l).from, "v" + l.ver);
  return sgOf(S, l).from;
}

export function setRemark(S, id, value) {
  const l = lOf(S, id);
  if (!l) return;
  l.remarks = value;
  audit(S, "Letter", l.id, "Remark edited", "", value, "v" + l.ver);
}

/* ---------------- validation of the three config tabs ---------------- */

const EMAIL_RE = /^\S+@\S+\.\S+$/;

// Messages about the signatory + cover email block of a template.
export function signatoryMessages(d, S) {
  const e = [];
  if (!d.company.trim()) e.push("Company name is required.");
  if (!d.name.trim() || /<<insert/i.test(d.name)) e.push("Signatory name is required: replace <<insert name>> with the name.");
  if (!d.title.trim()) e.push("Signatory designation is required.");
  if (!d.sigFile) e.push("Signature image is required.");
  if (!d.logoFile) e.push("Logo image is required.");
  if (!EMAIL_RE.test(d.from)) e.push("The HR mailbox must be a valid email.");
  d.cc.split(",").forEach((x) => {
    if (x.trim() && !EMAIL_RE.test(x.trim())) e.push('"' + x.trim() + '" is not a valid cc email.');
  });
  const at = allTags(S).concat(["Cycle Name"]);
  tagsIn(d.subject + " " + d.body).forEach((k) => {
    if (at.indexOf(k) < 0) e.push("Unknown tag {{" + k + "}} in the cover email.");
  });
  return e;
}

// Messages that stop a template being published. `d` is the editor draft
// ({ name, family, sg }), `selfId` the template being edited ("" for a new
// one) and `body` the letter as plain text with {{tags}} (made by the screen,
// because turning the editor HTML into text needs the browser).
export function templateMessages(S, d, selfId, body) {
  const e = [];
  const nm = String(d.name || "").trim();
  if (!nm) e.push("The template needs a name.");
  else if (S.tpls.some((t) => t.id !== selfId && same(t.name, nm) && same(t.location, d.location))) e.push("A template with this name already exists for " + locationLabel(d.location) + ". Choose another location, or rename it.");
  if (!String(d.location || "").trim()) e.push("Choose the location this template is for.");
  if (!String(d.family || "").trim()) e.push("The template needs a family (for example Revision, Bonus, Target PB).");
  if (!String(body || "").trim()) e.push("The letter is empty. Write it in the editor.");
  const at = allTags(S);
  tagsIn(body || "").forEach((k) => {
    if (at.indexOf(k) < 0) e.push('The field "' + k + '" is not in the field list. Delete it from the letter.');
  });
  return e.concat(signatoryMessages(d.sg, S));
}

// { ruleId: [messages] } for a draft list of rules
export function ruleMessages(S, d, location) {
  const out = {};
  const add = (id, m) => (out[id] = out[id] || []).push(m);
  d.forEach((r) => {
    if (!String(r.name || "").trim()) add(r.id, "needs a name");
    if (!String(r.family || "").trim()) add(r.id, "needs a family");
    if (!String(r.type || "").trim()) add(r.id, "needs a letter type");
    if (!r.tpl || !tplOf(S, r.tpl)) add(r.id, "needs a template");
    else {
      const t = tplOf(S, r.tpl);
      if (location && t.location && !same(t.location, location)) add(r.id, "uses a template of " + t.location + ", not " + location);
      else if (location ? t.active === false : !templateGroup(S, r.tpl).some((x) => x.active !== false)) add(r.id, "uses a template that is Inactive");
    }
    if (!S.fields.some((f) => f.rules && r.cond && r.cond[f.id] && r.cond[f.id] !== "Any")) add(r.id, "needs at least one condition");
    d.forEach((o) => {
      if (o.id > r.id && o.family && o.family === r.family) {
        if (Number(o.prio) === Number(r.prio)) add(o.id, 'has the same priority as "' + (r.name || "(no name)") + '" in family ' + r.family);
        const sameC = o.cycle === r.cycle && o.org === r.org && S.fields.every((f) => !f.rules || ((o.cond && o.cond[f.id]) || "Any") === ((r.cond && r.cond[f.id]) || "Any"));
        if (sameC) add(o.id, 'duplicates "' + (r.name || "(no name)") + '" (same family, cycle type, organization and conditions)');
      }
    });
  });
  return out;
}

export function fieldMessages(S, d) {
  const e = [];
  const labs = {};
  const tags = {};
  d.forEach((f) => {
    if (!String(f.label || "").trim()) e.push("A field needs a name.");
    else {
      const k = f.label.trim().toLowerCase();
      if (labs[k]) e.push('The name "' + f.label + '" is used twice.');
      labs[k] = 1;
    }
    if (!f.col) e.push('"' + (f.label || "New field") + '" needs an Appraisal Sheet column.');
    if (f.tag) {
      if (!String(f.tagName || "").trim()) e.push('"' + f.label + '" needs a tag name.');
      else {
        const tk = f.tagName.trim().toLowerCase();
        if (tags[tk] || FIXED_TAGS.some((x) => x.toLowerCase() === tk)) e.push('The tag name "' + f.tagName + '" is already used.');
        tags[tk] = 1;
      }
    }
  });
  S.fields.forEach((o) => {
    const n = d.filter((x) => x.id === o.id)[0];
    if (o.tag && (!n || !n.tag || n.tagName !== o.tagName)) {
      S.tpls.forEach((t) => {
        if (t.body.indexOf("{{" + o.tagName + "}}") >= 0 || t.body.indexOf("{{" + o.tagName + " In Words}}") >= 0) e.push("The tag {{" + o.tagName + '}} is used in the template "' + t.name + '".');
      });
    }
    if (o.rules && (!n || !n.rules || n.col !== o.col)) {
      S.rules.forEach((r) => {
        if (r.cond && r.cond[o.id] && r.cond[o.id] !== "Any") e.push('"' + o.label + '" is used by the rule "' + r.name + '".');
      });
    }
  });
  return e;
}

/* Save a draft of rules / fields, with the audit entry.
   The store first asks the server to keep the new list (see letters-store.jsx);
   only when that worked does it call saveRules / saveFields, so this screen never shows
   rules the server does not have. planRulesSave / planFieldsSave work out what changed
   and the audit line without touching the state. */
function listChanges(oldList, draft, nameOf) {
  const ch = [];
  draft.forEach((x) => {
    const o = oldList.filter((y) => y.id === x.id)[0];
    if (!o) ch.push("added " + nameOf(x));
    else if (JSON.stringify(o) !== JSON.stringify(x)) ch.push("changed " + nameOf(x));
  });
  oldList.forEach((o) => {
    if (!draft.some((x) => x.id === o.id)) ch.push("removed " + nameOf(o));
  });
  return ch;
}

// The rules of one location (all rules when no location is given, e.g. the offline demo).
export const rulesOfLocation = (S, location) => (location ? S.rules.filter((r) => same(r.location, location)) : S.rules);

export function planRulesSave(S, draft, reason, location) {
  const ch = listChanges(rulesOfLocation(S, location), draft, (r) => r.name);
  return { count: ch.length, entry: ch.length ? mkAudit(S, "Rules", location || "", "Rules saved", reason, (location ? location + ": " : "") + ch.join("; ")) : null };
}

export function planFieldsSave(S, draft, reason) {
  const ch = listChanges(S.fields, draft, (f) => f.label);
  return { count: ch.length, entry: ch.length ? mkAudit(S, "Fields", "", "Fields saved", reason, ch.join("; ")) : null };
}

export function saveRules(S, draft, reason, plan, location) {
  const p = plan || planRulesSave(S, draft, reason, location);
  // Only this location's rules are replaced; every other location keeps its own.
  S.rules = location ? S.rules.filter((r) => !same(r.location, location)).concat(draft.map((r) => ({ ...r, location }))) : draft;
  if (p.entry) S.audit.unshift(p.entry);
  refreshStale(S);
  return p.count;
}

export function saveFields(S, draft, reason, plan) {
  const p = plan || planFieldsSave(S, draft, reason);
  S.fields = draft;
  if (p.entry) S.audit.unshift(p.entry);
  refreshStale(S);
  return p.count;
}

/* The rules and fields held on the server replace whatever this browser had.
   Their audit lines (scope Rules / Fields) come from the server too, so every
   computer shows the same history. */
const CONFIG_SCOPES = ["Rules", "Fields"];
export function applyServerConfig(S, cfg, location) {
  // Rules come per location. Loading one location replaces only that location's rules;
  // loading "All locations" (no location) replaces the whole list. Rules without a location
  // (the built-in samples) are not kept: the server's rules are the only ones.
  const mine = Array.isArray(cfg.rules) ? cfg.rules.map((r) => ({ ...r, cond: { ...(r.cond || {}) } })) : [];
  S.rules = location ? S.rules.filter((r) => r.location && !same(r.location, location)).concat(mine) : mine;
  // Fields are the same for every location; nothing stored yet = keep what this screen has.
  if (cfg.fieldsExists !== false && Array.isArray(cfg.fields)) S.fields = cfg.fields.map((f) => ({ ...f }));
  const others = S.audit.filter((a) => CONFIG_SCOPES.indexOf(a.scope) < 0);
  S.audit = (Array.isArray(cfg.audit) ? cfg.audit : []).concat(others);
  refreshStale(S);
}

/* ---------------- templates ---------------- */

const escHtml = (v) => String(v == null ? "" : v).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const chipHtml = (tag) => `<span class="lt-merge-field" data-letter-tag="${escHtml(tag)}" contenteditable="false">${escHtml(tag)}</span>`;

// plain text with {{tags}} -> editor HTML (one <p> per line, tags as chips)
export function bodyToEditorHtml(body) {
  return String(body || "")
    .split("\n")
    .map((line) => {
      const safe = escHtml(line).replace(/\{\{([^{}]+)\}\}/g, (_m, tag) => chipHtml(tag.trim()));
      return "<p>" + (safe || "<br>") + "</p>";
    })
    .join("");
}

// {{tags}} left inside HTML -> chips
export function chipifyEditorHtml(html) {
  return String(html || "").replace(/\{\{([^{}<>]+)\}\}/g, (_m, tag) => chipHtml(tag.trim()));
}

export const newTemplateId = () => "T" + Date.now().toString(36).toUpperCase();

/* Record a publish. A template always gets a new version; unsent letters made
   from an older version go Out of date. `meta` is what the server answered
   (ver, by, on, file, hist, hasDocx, active); without it (offline demo) the
   version just goes up by one. Creates the template if `id` is new. */
export function publishTemplate(S, id, draft, reason, meta) {
  let t = tplOf(S, id);
  if (!t) {
    t = { id, ver: 0, hist: [], active: true, file: "", html: "", body: "" };
    S.tpls.push(t);
  }
  const m = meta || {};
  t.name = draft.name;
  t.family = draft.family || t.family || "Revision";
  t.location = draft.location != null ? draft.location : t.location || ALL_LOCATIONS;
  t.file = m.file != null ? m.file : draft.file != null ? draft.file : t.file || "";
  t.html = draft.html || bodyToEditorHtml(draft.body) || t.html || "";
  t.body = draft.body != null ? draft.body : t.body || "";
  t.font = draft.font || t.font || "Calibri";
  t.fsize = Number(draft.fsize || t.fsize || 11);
  t.lh = String(draft.lh || t.lh || "1.15");
  t.sg = draft.sg;
  if (!t.ver) t.active = true; // Active from its first publish
  if (m.active != null) t.active = !!m.active;
  t.ver = m.ver || (t.ver || 0) + 1;
  t.status = "Published";
  t.by = m.by || (S.actor || "HR") + " (HR)";
  t.on = m.on || nowStamp();
  if (m.hasDocx != null) t.hasDocx = !!m.hasDocx;
  if (m.fromServer) t.fromServer = true;
  t.hist = m.hist || [{ ver: t.ver, by: t.by, on: t.on, note: reason || "", file: t.file }].concat(t.hist || []);
  audit(S, "Templates", t.id, t.ver === 1 ? "Published" : "New version published", reason || "", t.name + " v" + t.ver, "v" + t.ver);
  refreshStale(S);
  return t.ver;
}

// Old names, kept for callers that pass a plain draft.
export function saveTemplate(S, id, draft, reason) {
  if (!tplOf(S, id)) throw new Error("Template not found.");
  return publishTemplate(S, id, draft, reason);
}
export function createTemplate(S, draft, reason) {
  const id = newTemplateId();
  publishTemplate(S, id, draft, reason);
  return id;
}

export function setTemplateActive(S, id, active) {
  const t = tplOf(S, id);
  if (!t) return;
  t.active = !!active;
  audit(S, "Templates", t.id, active ? "Made Active" : "Made Inactive", "", t.name, "v" + t.ver);
}

/* Put what the server holds into the state: a server template replaces the
   built-in sample with the same id, and new ones are added. Letters made from
   an older version go Out of date through refreshStale. */
export function applyServerTemplates(S, list) {
  (list || []).forEach((x) => {
    const o = {
      id: x.id,
      name: x.name,
      family: x.family,
      location: x.location || ALL_LOCATIONS,
      ver: x.ver,
      active: !!x.active,
      file: x.file || "",
      hasDocx: !!x.hasDocx,
      html: x.html || bodyToEditorHtml(x.body),
      body: x.body || "",
      font: x.font || "Calibri",
      fsize: Number(x.fsize || 11),
      lh: String(x.lh || "1.15"),
      sg: { ...(S.sign || {}), ...(x.sg || {}) },
      by: x.by || "",
      on: x.on || "",
      status: "Published",
      hist: x.hist || [],
      fromServer: true,
    };
    const ex = tplOf(S, x.id);
    if (ex) Object.assign(ex, o);
    else S.tpls.push(o);
  });
  refreshStale(S);
}

/* ---------------- sample data ---------------- */

const SAMPLE_ANNUAL = "C1";
const SAMPLE_EXCEPTIONAL = "C2";

const EM_LOC = ["India", "Dubai", "Singapore", "Canada"]; // Location Master names
const EM_DEPT = ["Consulting", "Delivery", "Finance", "HR"];

function addSampleSheet(S) {
  function mk(id, name, desig, tech, cyc, st, cur, nw, promo, nt, pb, rb, tpb, email) {
    const an = cyc === SAMPLE_ANNUAL;
    const n = parseInt(String(id).replace(/\D/g, ""), 10) || 0;
    let pm = [];
    if (pb > 0) pm = an ? [["May-26", pb / 4], ["Aug-26", pb / 4], ["Nov-26", pb / 4], ["Feb-27", pb / 4]] : [["Dec-26", pb]];
    S.sheet.push({
      id,
      name,
      tech,
      org: "Wissen India",
      cycle: cyc,
      status: st,
      email: email === "" ? "" : email || name.toLowerCase().replace(/ /g, ".") + "@wissentech.example",
      v: {
        promo: promo ? "Yes" : "No",
        basePay: cur,
        newBase: nw,
        hikeAmt: nw - cur,
        hikePct: +(((nw - cur) / cur) * 100).toFixed(2),
        newPB: pb,
        newRB: rb,
        tpbNext: tpb,
        newTitle: nt,
        designation: desig,
        effDate: an ? "01-Apr-2026" : "01-Nov-2026",
        pbInst: pb > 0 ? (an ? "4 instalments" : "1 instalment") : "",
        band: "B" + (desig === "Manager" ? "4" : desig === "Lead" ? "3" : "2"),
        rating: "Meets",
        compRemarks: "",
        pbMonths: pm,
        rbMonth: rb > 0 ? "May-26" : "",
        tpbMonth: tpb > 0 ? "May 2027" : "",
        emLocation: EM_LOC[n % 4],
        emDoj: (1 + (n % 27)) + "-" + MON[n % 12] + "-" + (2014 + (n % 9)),
        emGrade: "G" + (2 + (n % 5)),
        emManager: tech,
        emDept: EM_DEPT[n % 4],
      },
    });
  }
  const RM = "Ravi Menon";
  const SV = "Shalini Varma";
  const A = SAMPLE_ANNUAL;
  const X = SAMPLE_EXCEPTIONAL;
  mk("E1001", "Priya Nair", "Consultant", RM, A, "Active", 1800000, 2000000, 1, "Senior Consultant", 150000, 0, 200000);
  mk("E1002", "Arjun Rao", "Senior Consultant", RM, A, "Active", 2200000, 2350000, 0, "", 0, 0, 0);
  mk("E1003", "Meera Krishnan", "Manager", RM, A, "Active", 3500000, 3800000, 1, "Senior Manager", 250000, 300000, 400000);
  mk("E1004", "Karthik Subramanian", "Consultant", RM, A, "Active", 1600000, 1600000, 0, "", 120000, 0, 150000);
  mk("E1005", "Divya Shankar", "Consultant", RM, A, "Active", 1500000, 1500000, 0, "", 0, 0, 0);
  mk("E1006", "Rahul Verma", "Analyst", SV, A, "Active", 900000, 900000, 0, "", 0, 0, 0);
  mk("E1007", "Sneha Pillai", "Lead", SV, A, "Active", 2800000, 3000000, 0, "", 0, 200000, 250000);
  mk("E1008", "Vikram Joshi", "Consultant", SV, A, "Resigned", 1700000, 1800000, 0, "", 50000, 0, 0);
  mk("E1009", "Lakshmi Narayanan", "Consultant", SV, A, "Active", 1700000, 1850000, 0, "", 100000, 150000, 180000, "");
  mk("E1010", "Aditya Kulkarni", "Senior Consultant", SV, A, "Active", 2300000, 2600000, 1, "Lead", 180000, 0, 220000);
  mk("E1011", "Farah Khan", "Senior Consultant", RM, A, "Active", 2100000, 2250000, 0, "", 0, 0, 0);
  mk("E1012", "Omar Haddad", "Consultant", RM, A, "Active", 1900000, 2100000, 1, "Senior Consultant", 0, 150000, 200000);
  mk("E1013", "Ishaan Gupta", "Analyst", SV, A, "Inactive", 1000000, 1050000, 0, "", 0, 0, 0);
  mk("E1014", "Nisha Rao", "Consultant", RM, X, "Active", 1500000, 1650000, 0, "", 60000, 0, 0);
  mk("E1015", "Karan Mehta", "Lead", SV, X, "Active", 2700000, 2900000, 0, "", 0, 0, 0);
  mk("E1016", "Pooja Reddy", "Consultant", SV, A, "Active", 1700000, 1800000, 0, "", 90000, 0, 0);
}

function addDefaultConfig(S) {
  S.fields = [
    { id: "F1", label: "Promotion", col: "promo", rules: true, tag: true, tagName: "Promotion", show: true },
    { id: "F2", label: "Hike", col: "hikeAmt", rules: true, tag: true, tagName: "Hike Amount", show: false },
    { id: "F3", label: "Hike %", col: "hikePct", rules: false, tag: true, tagName: "Hike %", show: true },
    { id: "F4", label: "Current Base", col: "basePay", rules: false, tag: true, tagName: "Current Base", show: true },
    { id: "F5", label: "New Base", col: "newBase", rules: false, tag: true, tagName: "New Base", show: true },
    { id: "F6", label: "PB", col: "newPB", rules: true, tag: true, tagName: "PB Amount", show: true },
    { id: "F7", label: "RB", col: "newRB", rules: true, tag: true, tagName: "RB Amount", show: true },
    { id: "F8", label: "Target PB for next year", col: "tpbNext", rules: true, tag: true, tagName: "Target PB", show: true },
    { id: "F9", label: "New Designation", col: "newTitle", rules: false, tag: true, tagName: "New Designation", show: true },
    { id: "F10", label: "Effective Date", col: "effDate", rules: false, tag: true, tagName: "Effective Date", show: true },
  ];
  const C = (a, b, c, d, e) => ({ F1: a, F2: b, F6: c, F7: d, F8: e });
  S.rules = [
    { id: "R1", name: "Promotion with hike", family: "Revision", cycle: "Annual", org: "Any", cond: C("Yes", "Yes", "Any", "Any", "Any"), type: "Promotion & Hike", tpl: "T1", prio: 1, active: true },
    { id: "R2", name: "Hike only", family: "Revision", cycle: "Annual", org: "Any", cond: C("No", "Yes", "Any", "Any", "Any"), type: "Hike only", tpl: "T2", prio: 2, active: true },
    { id: "R3", name: "Exceptional raise", family: "Revision", cycle: "Exceptional", org: "Any", cond: C("Any", "Yes", "Any", "Any", "Any"), type: "Exceptional raise", tpl: "T6", prio: 3, active: true },
    { id: "R4", name: "PB and RB", family: "Bonus", cycle: "Any", org: "Any", cond: C("Any", "Any", "Yes", "Yes", "Any"), type: "PB & RB", tpl: "T5", prio: 1, active: true },
    { id: "R5", name: "PB only", family: "Bonus", cycle: "Any", org: "Any", cond: C("Any", "Any", "Yes", "No", "Any"), type: "PB", tpl: "T3", prio: 2, active: true },
    { id: "R6", name: "RB only", family: "Bonus", cycle: "Any", org: "Any", cond: C("Any", "Any", "No", "Yes", "Any"), type: "RB", tpl: "T4", prio: 3, active: true },
    { id: "R7", name: "Target PB", family: "Target PB", cycle: "Annual", org: "Any", cond: C("Any", "Any", "Any", "Any", "Yes"), type: "Target PB", tpl: "T7", prio: 1, active: true },
  ];
  const H = "{{Letter Date}}\n\nTo,\n{{Name}}\n{{Designation}}\n{{Emp ID}}\n\nDear {{Name}}, Congratulations!!\n";
  const F = "\n\nAll the other terms and conditions of your appointment remain unchanged. Thank you for your commitment and dedication. Keep up the good work.\nLooking forward to a long and fruitful relationship.\n\nSincerely,\nFor {{Company Name}},\n{{Signature}}\n{{Signatory Name}}, {{Signatory Designation}}";
  const RBT = "You are eligible for a Retention Bonus amounting to Rs. {{RB Amount}}/- ({{RB Amount In Words}}). This would be one-time payment and would be payable apart from Current CTC along with your {{RB Pay Month}} salary payout.\n\nWe expect you to continue to be an employee of the company for the next 12 months. This amount is fully recoverable in the event you voluntarily leave within the next 12 months.\n\nThe bonus amount paid will be subject to tax as per Income tax laws in India. Please accept this letter here: {{Acceptance Link}}";
  const PBT = "You are eligible for a Performance Bonus of Rs. {{PB Amount}}/- ({{PB Amount In Words}}) which shall be paid as follows:\n{{PB Schedule}}";
  S.tpls = [
    { id: "T1", name: "Revision - Promotion and hike", family: "Revision", ver: 1, file: "Hike and Promotion Letter.docx", body: H + "Subsequent to your performance review your salary has been revised with effect from {{Effective Date}}. Your new CTC will be Rs. {{New Base}}/- ({{New Base In Words}}). You have also been promoted and your new designation will be “{{New Designation}}”." + F },
    { id: "T2", name: "Revision - Hike only", family: "Revision", ver: 1, file: "Hike Letter.docx", body: H + "Subsequent to your performance review your salary has been revised with effect from {{Effective Date}}. Your new CTC will be Rs. {{New Base}}/- ({{New Base In Words}})." + F },
    { id: "T3", name: "Bonus - PB", family: "Bonus", ver: 1, file: "Performance Bonus Letter- April 2025.docx", body: H + PBT + F },
    { id: "T4", name: "Bonus - RB", family: "Bonus", ver: 1, file: "Retention Bonus Letter-April 2025 (3).docx", body: H + RBT + "\n\nSincerely,\nFor {{Company Name}},\n{{Signature}}\n{{Signatory Name}}, {{Signatory Designation}}" },
    { id: "T5", name: "Bonus - PB and RB", family: "Bonus", ver: 1, file: "Hike& Promotion & 2 Bonuses.docx", body: H + PBT + "\n\n" + RBT + F },
    { id: "T6", name: "Exceptional raise", family: "Revision", ver: 1, file: "Hike Letter.docx", body: H + "Your salary has been revised with effect from {{Effective Date}}. Your new CTC will be Rs. {{New Base}}/- ({{New Base In Words}})." + F },
    { id: "T7", name: "Target PB - Annexure P", family: "Target PB", ver: 1, file: "Target Performance Bonus Letter.docx", body: "{{Letter Date}}\n\n{{Name}}\n{{Designation}}\n{{Emp ID}}\n\nAnnexure P\nPerformance Bonus\nDear {{Name}},\nWe are pleased to inform you that, based on the outcome of the appraisal, your target performance bonus is set to Rs. {{Target PB}}/- ({{Target PB In Words}}) which represents the maximum achievable bonus amount. The bonus will be disbursed as a one-time payment, apart from your current Cost to Company (CTC), and is payable with your {{Target PB Pay Month}} salary payout.\n\nThe bonus disbursement will be purely based on achieving your individual targets, as agreed with the business, the overall performance of the organization and the business unit for FY {{Financial Year}}. Any underachievement in meeting the targets may result in a reduced bonus payout compared to the stated amount.\n\nSincerely,\nFor {{Company Name}},\n{{Signature}}\n{{Signatory Name}}, {{Signatory Designation}}" },
  ];
  S.sign = {
    company: "Wissen Technology Pvt. Ltd",
    name: "Authorised Signatory",
    title: "Managing Director",
    sigFile: "signature.png",
    sigData: "",
    logoFile: "logo.png",
    logoData: "",
    letterDate: todayLabel(),
    from: "hr@wissentech.example",
    cc: "compensation@wissentech.example",
    subject: "Your appraisal letter - {{Cycle Name}}",
    body: "Dear {{Name}},\n\nPlease find your letter attached.\n\nRegards,\nHR",
  };
  // One sample that is Inactive, so the Active switch has something to show.
  S.tpls.push({ id: "T8", name: "Revision - Promotion only", family: "Revision", ver: 1, file: "", body: H + "Subsequent to your performance review you have been promoted with effect from {{Effective Date}}. Your new designation will be {{New Designation}}." + F });
  S.tpls.forEach((t) => {
    t.sg = JSON.parse(JSON.stringify(S.sign));
    t.html = bodyToEditorHtml(t.body);
    t.active = t.id !== "T8";
    t.location = ALL_LOCATIONS;
    t.status = "Published";
    t.font = "Calibri";
    t.fsize = 11;
    t.lh = "1.15";
    t.by = "HR (HR)";
    t.on = "03-Nov-2026 10:15";
    t.hist = [{ ver: t.ver, by: t.by, on: t.on, note: t.file ? "Imported from " + t.file : "", file: t.file }];
  });
  S.t = "03-Nov-2026 10:15";
  S.tpls.forEach((t) => audit(S, "Templates", t.id, "Published", "", (t.file ? "Imported from " + t.file + "; " : "") + t.name + " v" + t.ver, "v" + t.ver));
  S.t = null;
}

/* A new state: config + a sample Appraisal Sheet, and NO letters. Letters
   appear when HR presses Generate on the Letters step of the cycle. */
export function createState() {
  const S = {
    orgs: ["Wissen India", "Wissen UK"],
    cycles: [
      { id: SAMPLE_ANNUAL, name: "Annual (sample)", type: "Annual", fy: "2026-27", sample: true },
      { id: SAMPLE_EXCEPTIONAL, name: "Exceptional (sample)", type: "Exceptional", fy: "2026-27", sample: true },
    ],
    sheet: [],
    letters: [],
    audit: [],
    generated: {},
    actor: "HR",
    t: null,
  };
  addSampleSheet(S);
  addDefaultConfig(S);
  return S;
}

/* Sample history so every status can be seen (Sent, Delivered, Voided,
   Out of date, Dropped...). Demo only. Makes the Annual letters for whatever
   cycle the sample Annual rows are bound to, plus the Exceptional ones. */
export function loadSampleLetters(S) {
  if (S.letters.length) return;
  const annual = S.cycles.filter((c) => c.type === "Annual")[0];
  S.t = "06-Nov-2026 10:40";
  S.sheet.forEach((r) => {
    if (r.status !== "Active") return;
    pick(S, r).forEach((rule) => {
      const t = tplOf(S, rule.tpl);
      const l = mkLetter(S, r, rule, t);
      S.letters.push(l);
      audit(S, "Letter", l.id, "Generated", "", "Rule " + l.ruleName + "; template v" + l.ver, "v" + l.ver);
    });
  });
  if (annual) S.generated[annual.id] = true;
  const L = (emp, fam) => S.letters.filter((l) => l.emp === emp && l.family === fam)[0];
  [["E1001", "Revision"], ["E1001", "Bonus"], ["E1002", "Revision"], ["E1003", "Revision"]].forEach((p) => {
    const l = L(p[0], p[1]);
    if (l) l.status = "Reviewed";
  });
  S.t = "06-Nov-2026 11:05";
  [["E1001", "Revision"], ["E1001", "Bonus"], ["E1002", "Revision"], ["E1003", "Revision"]].forEach((p) => {
    const l = L(p[0], p[1]);
    if (l) doSend(S, l);
  });
  S.t = "07-Nov-2026 09:30";
  const rs = L("E1002", "Revision");
  if (rs) {
    rs.resends = 1;
    rs.lastResent = S.t;
    audit(S, "Letter", rs.id, "Resent", "Employee did not receive the first email", "", "v" + rs.ver);
  }
  const fk = L("E1011", "Revision");
  if (fk) {
    fk.status = "Voided";
    audit(S, "Letter", fk.id, "Voided", "Hike under review", "", "v1");
  }
  S.t = null;
  // Appraisal Sheet edits after the letters were made -> Out of date / Changed after sending
  const set = (id, fn) => {
    const e = rowOf(S, id);
    if (e) fn(e.v);
  };
  set("E1002", (v) => {
    v.newBase = 2400000;
    v.hikeAmt = 200000;
    v.hikePct = +((200000 / 2200000) * 100).toFixed(2);
  });
  set("E1003", (v) => {
    v.newBase = 3500000;
    v.hikeAmt = 0;
    v.hikePct = 0;
    v.promo = "No";
  });
  set("E1005", (v) => {
    v.newBase = 1600000;
    v.hikeAmt = 100000;
    v.hikePct = +((100000 / 1500000) * 100).toFixed(2);
  });
  set("E1012", (v) => {
    v.newPB = 100000;
    v.pbMonths = [["May-26", 25000], ["Aug-26", 25000], ["Nov-26", 25000], ["Feb-27", 25000]];
  });
  set("E1010", (v) => {
    v.newBase = 2650000;
    v.hikeAmt = 350000;
    v.hikePct = +((350000 / 2300000) * 100).toFixed(2);
  });
  refreshStale(S);
}

/* Point the sample Annual rows (and any sample letters) at a real cycle from
   the Appraisal Cycle Master, so Generate there fills this screen. The demo
   follows one Annual cycle at a time. */
export function bindAnnualCycle(S, cycle) {
  const id = String(cycle.id);
  const fy = fyOf(cycle.effective) || fyOf(cycle.start) || "";
  const existing = cyOf(S, id);
  if (existing) {
    existing.name = cycle.name;
    if (fy) existing.fy = fy;
    return existing;
  }
  // Only the demo cycle is taken over; a real cycle (one per location) never is.
  const old = S.cycles.filter((c) => c.type === "Annual" && c.sample)[0];
  if (old) {
    if (!old.sample) {
      // The demo was following another cycle: drop its sample letters.
      S.letters = S.letters.filter((l) => l.cycle !== old.id);
      delete S.generated[old.id];
    }
    S.sheet.forEach((r) => {
      if (r.cycle === old.id) r.cycle = id;
    });
    S.letters.forEach((l) => {
      if (l.cycle === old.id) l.cycle = id;
    });
    if (S.generated[old.id]) {
      S.generated[id] = true;
      delete S.generated[old.id];
    }
    old.id = id;
    old.name = cycle.name;
    old.fy = fy || old.fy;
    old.sample = false;
    return old;
  }
  const c = { id, name: cycle.name, type: "Annual", fy, sample: false };
  S.cycles.unshift(c);
  return c;
}