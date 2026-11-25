// Run with:  node --test functions/lettersapi/test/*.test.js
// Rules are kept PER LOCATION in the location's own bucket; fields are shared.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const { Readable } = require("node:stream");

/* ---- fake Catalyst: Stratus in memory (the rules need no Data Store table) ---- */
const buckets = new Map(); // bucket name -> Map(key -> Buffer)
let level = "edit";

const LOC = (id, name, code) => ({ ROWID: id, location_name: name, location_code: code, status: "" });
const LOCATIONS = [LOC("1", "India", "IN"), LOC("2", "Dubai", "AE-DXB"), LOC("3", "Singapore", "SG"), LOC("4", "Nowhere", "XX")];

const fakeApp = {
  zcql: () => ({
    executeZCQLQuery: async (q) => {
      assert.match(q, /FROM Location_Master/);
      return LOCATIONS.filter((r) => Number(r.ROWID) > Number(/ROWID > (\d+)/.exec(q)[1])).map((r) => ({ Location_Master: r }));
    },
  }),
  stratus: () => ({
    bucket: (n) => {
      const bucketOf = () => {
        if (!buckets.has(n)) buckets.set(n, new Map());
        return buckets.get(n);
      };
      return {
        putObject: async (key, body) => {
          if (n === "no-such-bucket" || n === "letter-templates-xx") throw new Error("bucket does not exist");
          bucketOf().set(key, Buffer.from(body));
          return true;
        },
        getObject: async (key) => {
          const b = buckets.get(n);
          if (!b || !b.has(key)) throw new Error("NoSuchKey " + key);
          return Readable.from([b.get(key)]);
        },
      };
    },
  }),
  userManagement: () => ({ getCurrentUser: async () => ({ email_id: "hr@example.com" }) }),
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const fakeAccess = {
  HttpError,
  check: async () => ({ user: { email: "hr@example.com" } }),
  guard: (a, fn) => fn(),
  requireScreen: (a, key, lvl) => {
    if (level === "view" && lvl === "edit") throw new HttpError(403, "You do not have access to this screen.");
  },
};

const origLoad = Module._load;
Module._load = function (request, parent, ...rest) {
  if (request === "zcatalyst-sdk-node") return { initialize: () => fakeApp };
  if (request === "./accessCore") return fakeAccess;
  return origLoad.call(this, request, parent, ...rest);
};
const api = require(path.join(__dirname, "..", "index.js"));
Module._load = origLoad;

function call(method, url, body) {
  return new Promise((resolve) => {
    const req = Readable.from([]);
    req.method = method;
    req.url = url;
    req.body = body;
    const res = {
      status: 0,
      headers: {},
      writeHead(s, h) {
        this.status = s;
        this.headers = h || {};
      },
      end(data) {
        resolve({ status: this.status, json: JSON.parse(data) });
      },
    };
    api(req, res);
  });
}

const rule = (over = {}) => ({
  id: "R1",
  name: "Promotion with hike",
  family: "Revision",
  cycle: "Annual",
  org: "Any",
  cond: { F1: "Yes", F2: "Yes" },
  type: "Promotion & Hike",
  tpl: "T1",
  prio: 1,
  active: true,
  ...over,
});
const field = (over = {}) => ({ id: "F1", label: "Promotion", col: "promo", rules: true, tag: true, tagName: "Promotion", show: true, ...over });
const aud = (over = {}) => ({ id: "A1", when: "19-Nov-2026 10:00", scope: "Rules", ref: "", action: "Rules saved", by: "HR (HR)", reason: "", detail: "added Promotion with hike", tpl: "", ...over });
const saveRules = (location, body) => call("POST", "/", { action: "saveRules", location, ...body });
const saveFields = (body) => call("POST", "/", { action: "saveFields", ...body });
const getRules = (location) => call("GET", "/?view=config" + (location ? "&location=" + encodeURIComponent(location) : ""));

// A template list as the template save writes it: which templates each location's bucket holds.
function putTemplates(bucket, ids) {
  if (!buckets.has(bucket)) buckets.set(bucket, new Map());
  const templates = ids.map((id) => ({ tpl_id: id, name: "Hike Letter", location: "x", bucket, tpl_version: 1, active: true }));
  buckets.get(bucket).set("templates/index.json", Buffer.from(JSON.stringify({ v: 1, templates, versions: [] })));
}
putTemplates("letter-templates-in", ["T1", "T2"]); // India has templates; Dubai has none

test("nothing stored yet: exists is false and the lists are empty", async () => {
  const g = await getRules("India");
  assert.equal(g.status, 200, JSON.stringify(g.json));
  assert.equal(g.json.data.exists, false);
  assert.equal(g.json.data.rev, 0);
  assert.deepEqual(g.json.data.rules, []);
  assert.equal(g.json.data.location, "India");
});

test("rules are stored in the bucket of their own location, and another location does not see them", async () => {
  const r = await saveRules("India", { baseRev: 0, rules: [rule(), rule({ id: "R2", name: "Hike only", cond: { F1: "No", F2: "Yes" }, prio: 2, tpl: "T2" })], audit: [aud()] });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.data.rev, 1);
  assert.equal(r.json.data.savedBy, "hr@example.com");
  assert.ok(buckets.get("letter-templates-in").has("config/letters-rules.json"));
  assert.ok(!buckets.has("letter-templates-config") || !buckets.get("letter-templates-config").has("config/letters-rules.json"));

  const india = (await getRules("India")).json.data;
  assert.equal(india.exists, true);
  assert.deepEqual(india.rules.map((x) => [x.name, x.location]), [["Promotion with hike", "India"], ["Hike only", "India"]]);
  assert.equal(india.audit.length, 1);

  // the reported problem: Dubai has no templates and must NOT show India's rules
  const dubai = (await getRules("Dubai")).json.data;
  assert.equal(dubai.exists, false);
  assert.deepEqual(dubai.rules, []);
});

test("a rule can only use a template stored for its own location", async () => {
  // Dubai has no template T1: refused, and nothing is written to Dubai's bucket
  const r = await saveRules("Dubai", { baseRev: 0, rules: [rule()], audit: [] });
  assert.equal(r.status, 400);
  assert.match(r.json.message, /not stored for Dubai/);
  assert.ok(!buckets.has("letter-templates-ae-dxb") || !buckets.get("letter-templates-ae-dxb").has("config/letters-rules.json"));
  // once Dubai has its own template, the rule saves there, independently of India's
  putTemplates("letter-templates-ae-dxb", ["T9"]);
  const ok = await saveRules("Dubai", { baseRev: 0, rules: [rule({ tpl: "T9", name: "Dubai promotion" })], audit: [] });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  assert.equal(ok.json.data.rev, 1);
  assert.deepEqual((await getRules("Dubai")).json.data.rules.map((x) => x.name), ["Dubai promotion"]);
  assert.deepEqual((await getRules("India")).json.data.rules.map((x) => x.name), ["Promotion with hike", "Hike only"]);
});

test("All locations: every location's rules, each marked with its location", async () => {
  const g = (await getRules("")).json.data;
  assert.deepEqual(g.rules.map((x) => [x.location, x.name]).sort(), [["Dubai", "Dubai promotion"], ["India", "Hike only"], ["India", "Promotion with hike"]]);
});

test("a location is required to save rules, and must be an active Location Master location", async () => {
  assert.equal((await saveRules("", { baseRev: 0, rules: [], audit: [] })).status, 400);
  assert.equal((await saveRules("All locations", { baseRev: 0, rules: [], audit: [] })).status, 400);
  assert.equal((await saveRules("Atlantis", { baseRev: 0, rules: [], audit: [] })).status, 400);
  assert.equal((await getRules("Atlantis")).status, 400);
});

test("an edit and a delete are permanent: the next read shows the new list, never the old one", async () => {
  const r = await saveRules("India", { baseRev: 1, rules: [rule({ name: "Promotion + hike (renamed)", prio: 5 })], audit: [aud({ id: "A2", detail: "changed; removed Hike only" })] });
  assert.equal(r.json.data.rev, 2);
  const g = (await getRules("India")).json.data;
  assert.deepEqual(g.rules.map((x) => [x.name, x.prio]), [["Promotion + hike (renamed)", 5]]);
  assert.equal(g.audit.length, 2);
  assert.equal(g.audit[0].id, "A2"); // newest first
});

test("deleting every rule is stored too (empty is not the same as never saved)", async () => {
  const r = await saveRules("India", { baseRev: 2, rules: [], audit: [] });
  assert.equal(r.status, 200);
  const g = (await getRules("India")).json.data;
  assert.equal(g.exists, true);
  assert.deepEqual(g.rules, []);
});

test("a stale baseRev is refused (409) and nothing is overwritten", async () => {
  const before = (await getRules("India")).json.data;
  const r = await saveRules("India", { baseRev: 1, rules: [rule({ name: "Stale edit" })], audit: [] });
  assert.equal(r.status, 409);
  assert.deepEqual((await getRules("India")).json.data, before);
});

test("bad data is refused or cleaned", async () => {
  const cur = (await getRules("India")).json.data.rev;
  assert.equal((await saveRules("India", { baseRev: cur, rules: [rule({ id: "../x" })], audit: [] })).status, 400);
  const twice = await saveRules("India", { baseRev: cur, rules: [rule(), rule()], audit: [] });
  assert.equal(twice.status, 400);
  assert.match(twice.json.message, /used twice/);
  assert.equal((await saveRules("India", { baseRev: cur, rules: "x", audit: [] })).status, 400);
  // unknown keys are dropped, a condition other than Any/Yes/No is ignored, and the location is always the saved one
  const ok = await saveRules("India", { baseRev: cur, rules: [{ ...rule(), evil: "<script>", location: "Dubai", cond: { F1: "Yes", F2: "Maybe", "bad key": "Yes" } }], audit: [] });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const g = (await getRules("India")).json.data;
  assert.equal(g.rules[0].evil, undefined);
  assert.equal(g.rules[0].location, "India");
  assert.deepEqual(g.rules[0].cond, { F1: "Yes" });
});

test("fields are shared by every location, with their own revision", async () => {
  const r = await saveFields({ baseRev: 0, fields: [field(), field({ id: "F2", label: "Hike", col: "hikeAmt", tagName: "Hike Amount" })], audit: [aud({ id: "F-A1", scope: "Fields" })] });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.ok(buckets.get("letter-templates-config").has("config/letters-config.json"));
  for (const loc of ["India", "Dubai"]) {
    const g = (await getRules(loc)).json.data;
    assert.deepEqual(g.fields.map((x) => x.id), ["F1", "F2"]);
    assert.equal(g.fieldsRev, 1);
    assert.ok(g.audit.some((a) => a.id === "F-A1"));
  }
  assert.equal((await saveFields({ baseRev: 0, fields: [field()], audit: [] })).status, 409);
  assert.equal((await saveFields({ baseRev: 1, fields: [{ ...field(), id: "x y" }], audit: [] })).status, 400);
  // saving fields did not touch anybody's rules
  assert.deepEqual((await getRules("Dubai")).json.data.rules.map((x) => x.name), ["Dubai promotion"]);
});

test("rules of the old shared list start the location that holds their template, once, until it saves", async () => {
  // the old shared file: one list for everybody (R-old uses T2 = an India template; R-lost uses a template nobody has)
  const shared = JSON.parse(buckets.get("letter-templates-config").get("config/letters-config.json"));
  shared.rules = [rule({ id: "R-old", name: "Old shared rule", tpl: "T2" }), rule({ id: "R-lost", name: "Template gone", tpl: "T404" })];
  buckets.get("letter-templates-config").set("config/letters-config.json", Buffer.from(JSON.stringify(shared)));
  // Singapore: no rules file and no templates -> nothing
  assert.deepEqual((await getRules("Singapore")).json.data.rules, []);
  // a location with a rules file ignores the old list
  assert.deepEqual((await getRules("Dubai")).json.data.rules.map((x) => x.name), ["Dubai promotion"]);
  // India's own file exists too, so it also ignores it
  assert.ok((await getRules("India")).json.data.rules.every((x) => x.id !== "R-old"));
  // a fresh location with a T2 template and no file gets the old rule once
  putTemplates("letter-templates-sg", ["T2"]);
  const sg = (await getRules("Singapore")).json.data;
  assert.equal(sg.exists, false);
  assert.deepEqual(sg.rules.map((x) => [x.name, x.location]), [["Old shared rule", "Singapore"]]);
  // saving fields keeps the old shared rules in the file
  await saveFields({ baseRev: 1, fields: [field()], audit: [] });
  assert.equal(JSON.parse(buckets.get("letter-templates-config").get("config/letters-config.json")).rules.length, 2);
});

test("a user with View access can read the rules but not save them", async () => {
  level = "view";
  try {
    const g = await getRules("India");
    assert.equal(g.status, 200);
    assert.equal((await saveRules("India", { baseRev: g.json.data.rev, rules: [], audit: [] })).status, 403);
    assert.equal((await saveFields({ baseRev: 0, fields: [], audit: [] })).status, 403);
  } finally {
    level = "edit";
  }
});

test("a location bucket that was never created gives a clear message on save", async () => {
  const r = await saveRules("Nowhere", { baseRev: 0, rules: [rule({ tpl: "" })], audit: [] });
  assert.equal(r.status, 500);
  assert.match(r.json.message, /letter-templates-xx/);
});

test("a fields bucket that was never created gives a clear message on save", async () => {
  process.env.LETTERS_CONFIG_BUCKET = "no-such-bucket";
  try {
    const r = await saveFields({ baseRev: 0, fields: [field()], audit: [] });
    assert.equal(r.status, 500);
    assert.match(r.json.message, /no-such-bucket/);
  } finally {
    delete process.env.LETTERS_CONFIG_BUCKET;
  }
});