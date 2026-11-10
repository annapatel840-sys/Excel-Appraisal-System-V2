// Run with:  node --test src/lib/letters-core.test.js
import test from "node:test";
import assert from "node:assert/strict";
import {
  createState, pick, generateLetters, lettersStats, bindAnnualCycle, loadSampleLetters,
  merge, sendProblem, sendLetters, markReviewed, moreAction, refreshStale, needLetters,
  inr, words, fyOf, ruleMessages, fieldMessages, saveTemplate, lOf, rowOf, tplOf,
} from "./letters-core.js";

const CYCLE = { id: "74008000000099999", name: "Annual 2026", effective: "2026-04-01" };
const fresh = () => {
  const S = createState();
  S.actor = "Tester";
  bindAnnualCycle(S, CYCLE);
  return S;
};
const letterOf = (S, emp, fam) => S.letters.filter((l) => l.emp === emp && l.family === fam && l.status !== "Replaced")[0];

test("formatters", () => {
  assert.equal(inr(1234567), "12,34,567");
  assert.equal(inr(950), "950");
  assert.equal(words(2000000), "Rupees Twenty Lakh Only");
  assert.equal(words(250000), "Rupees Two Lakh Fifty Thousand Only");
  assert.equal(fyOf("2026-04-01"), "2026-27");
  assert.equal(fyOf("2027-02-10"), "2026-27");
  assert.equal(fyOf(""), "");
});

test("rule pick: one letter per family, lowest priority wins", () => {
  const S = createState();
  const names = (id) => pick(S, rowOf(S, id)).map((r) => r.name).sort();
  assert.deepEqual(names("E1001"), ["Promotion with hike", "PB only", "Target PB"].sort()); // promo+hike, PB only, target PB
  assert.deepEqual(names("E1003"), ["Promotion with hike", "PB and RB", "Target PB"].sort());
  assert.deepEqual(names("E1002"), ["Hike only"]);
  assert.deepEqual(names("E1005"), []); // nothing changed, nothing to send
  assert.deepEqual(names("E1014"), ["Exceptional raise", "PB only"].sort()); // Exceptional cycle row
});

test("bindAnnualCycle points the sample rows at the real cycle", () => {
  const S = fresh();
  assert.equal(S.cycles.filter((c) => c.type === "Annual").length, 1);
  assert.equal(S.cycles.find((c) => c.type === "Annual").id, CYCLE.id);
  assert.equal(S.cycles.find((c) => c.type === "Annual").fy, "2026-27");
  assert.equal(S.sheet.filter((r) => r.cycle === CYCLE.id).length, 14);
  assert.equal(lettersStats(S, CYCLE.id).gen, false);
});

test("generateLetters creates once, and is safe to repeat", () => {
  const S = fresh();
  const a = generateLetters(S, CYCLE.id);
  assert.ok(a.created > 0);
  assert.equal(a.regenerated, 0);
  const before = S.letters.length;
  const b = generateLetters(S, CYCLE.id);
  assert.equal(b.created, 0);
  assert.equal(S.letters.length, before);
  const st = lettersStats(S, CYCLE.id);
  assert.equal(st.gen, true);
  assert.equal(st.toSend, before);
  assert.equal(st.sent, 0);
  // the resigned / inactive employees get nothing
  assert.equal(S.letters.some((l) => ["E1008", "E1013"].includes(l.emp)), false);
  // the Exceptional sample rows are not made from the Annual cycle screen
  assert.equal(S.letters.some((l) => ["E1014", "E1015"].includes(l.emp)), false);
});

test("sheet change makes an unsent letter Out of date; Generate replaces it", () => {
  const S = fresh();
  generateLetters(S, CYCLE.id);
  const l0 = letterOf(S, "E1002", "Revision");
  rowOf(S, "E1002").v.newBase = 2400000;
  refreshStale(S);
  assert.equal(l0.status, "Out of date");
  assert.equal(lettersStats(S, CYCLE.id).outOfDate, 1);
  const r = generateLetters(S, CYCLE.id);
  assert.equal(r.regenerated, 1);
  assert.equal(l0.status, "Replaced");
  const l1 = letterOf(S, "E1002", "Revision");
  assert.equal(l1.status, "Ready");
  assert.equal(l1.replaces, l0.id);
});

test("employee who is no longer Active is Dropped; a returning entitlement is picked up", () => {
  const S = fresh();
  generateLetters(S, CYCLE.id);
  rowOf(S, "E1002").status = "Resigned";
  refreshStale(S);
  assert.equal(letterOf(S, "E1002", "Revision").status, "Dropped");
  assert.equal(lettersStats(S, CYCLE.id).dropped >= 1, true);
});

test("a new entitlement shows in needLetters and Generate makes the letter", () => {
  const S = fresh();
  generateLetters(S, CYCLE.id);
  rowOf(S, "E1005").v.hikeAmt = 100000; // E1005 had nothing; now Hike only
  assert.deepEqual(needLetters(S, (r) => r.cycle === CYCLE.id).map((x) => x[0]), ["Divya Shankar"]);
  assert.equal(lettersStats(S, CYCLE.id).missing, 1);
  assert.equal(generateLetters(S, CYCLE.id).created, 1);
  assert.equal(lettersStats(S, CYCLE.id).missing, 0);
});

test("send is blocked while the signatory is the <<insert name>> placeholder", () => {
  const S = fresh();
  generateLetters(S, CYCLE.id);
  const l = letterOf(S, "E1002", "Revision");
  markReviewed(S, [l.id]);
  assert.match(sendProblem(S, l), /Signatory name is required/);
  S.tpls.forEach((t) => (t.sg.name = "A. Signatory"));
  assert.equal(sendProblem(S, l), "");
  const res = sendLetters(S, [l.id]);
  assert.equal(res.sent, 1);
  assert.ok(["Sent", "Delivered", "Failed"].includes(l.status));
  assert.equal(S.audit[0].action === "Sent" || S.audit[0].action === "Send failed", true);
});

test("a letter with no email on file is blocked", () => {
  const S = fresh();
  S.tpls.forEach((t) => (t.sg.name = "A. Signatory"));
  generateLetters(S, CYCLE.id);
  const l = letterOf(S, "E1009", "Revision");
  markReviewed(S, [l.id]);
  assert.match(sendProblem(S, l), /no email/);
});

test("sent letters are never changed; they are flagged after a sheet change", () => {
  const S = fresh();
  S.tpls.forEach((t) => (t.sg.name = "A. Signatory"));
  generateLetters(S, CYCLE.id);
  const l = letterOf(S, "E1002", "Revision");
  markReviewed(S, [l.id]);
  sendLetters(S, [l.id]);
  const statusAfterSend = l.status;
  rowOf(S, "E1002").v.newBase = 2500000;
  refreshStale(S);
  assert.equal(l.status, statusAfterSend);
  assert.equal(l.flag, "Changed after sending");
  moreAction(S, "replace", [l.id], "Corrected hike");
  assert.equal(l.status, "Replaced");
  assert.equal(letterOf(S, "E1002", "Revision").status, "Ready");
});

test("merge fills tags and reports empty ones", () => {
  const S = fresh();
  generateLetters(S, CYCLE.id);
  const l = letterOf(S, "E1002", "Revision");
  const m = merge(S, l);
  assert.match(m.text, /Arjun Rao/);
  assert.match(m.text, /Rupees Twenty Three Lakh Fifty Thousand Only|23,50,000/);
  assert.deepEqual(m.miss, []);
  const t2 = S.tpls.find((t) => t.id === "T2");
  t2.sg.sigFile = "";
  const l2 = letterOf(S, "E1002", "Revision");
  l2.status = "Reviewed";
  assert.match(sendProblem(S, l2), /Signatory name|Signature/);
  t2.sg.sigFile = "signature.png";
  const t = tplOf(S, l.tpl);
  t.body += " {{Acceptance Link}}";
  assert.deepEqual(merge(S, l).miss, ["Acceptance Link"]);
});

test("saving a template makes a new version and marks unsent letters Out of date", () => {
  const S = fresh();
  generateLetters(S, CYCLE.id);
  const t = tplOf(S, "T2");
  const v = saveTemplate(S, "T2", { name: t.name, file: t.file, body: t.body + " Extra.", sg: t.sg }, "");
  assert.equal(v, 2);
  assert.equal(letterOf(S, "E1002", "Revision").status, "Out of date");
});

test("config validation", () => {
  const S = createState();
  const rules = JSON.parse(JSON.stringify(S.rules));
  rules.push({ ...rules[0], id: "R99", name: "Dup" });
  const bad = ruleMessages(S, rules);
  assert.ok(bad.R99.some((m) => /same priority|duplicates/.test(m)));
  const fields = JSON.parse(JSON.stringify(S.fields)).filter((f) => f.id !== "F1");
  assert.ok(fieldMessages(S, fields).some((m) => /used by the rule/.test(m)));
});

test("loadSampleLetters shows every status and keeps Generate idempotent", () => {
  const S = fresh();
  loadSampleLetters(S);
  const seen = new Set(S.letters.map((l) => l.status));
  for (const s of ["Ready", "Out of date", "Sent", "Withdrawn"]) assert.ok(seen.has(s) || [...seen].some((x) => x === "Delivered" && s === "Sent"), "missing " + s);
  assert.equal(lettersStats(S, CYCLE.id).gen, true);
  assert.ok(S.letters.some((l) => l.flag === "Changed after sending"));
  const n = S.letters.length;
  const r = generateLetters(S, CYCLE.id);
  assert.ok(r.regenerated >= 1);
  assert.ok(S.letters.length > n);
});
