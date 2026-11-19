// Run with:  node --test functions/lettersapi/test/*.test.js
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const { Readable } = require("node:stream");

/* ---- fake Catalyst: Stratus in memory (the rules need no Data Store table) ---- */
const buckets = new Map(); // bucket name -> Map(key -> Buffer)
let level = "edit";

const fakeApp = {
  zcql: () => ({ executeZCQLQuery: async () => [] }),
  stratus: () => ({
    bucket: (n) => {
      const bucketOf = () => {
        if (!buckets.has(n)) buckets.set(n, new Map());
        return buckets.get(n);
      };
      return {
        putObject: async (key, body) => {
          if (n === "no-such-bucket") throw new Error("bucket does not exist");
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
const save = (body) => call("POST", "/", { action: "saveConfig", ...body });

test("nothing stored yet: exists is false and the lists are empty", async () => {
  const g = await call("GET", "/?view=config");
  assert.equal(g.status, 200, JSON.stringify(g.json));
  assert.equal(g.json.data.exists, false);
  assert.equal(g.json.data.rev, 0);
  assert.deepEqual(g.json.data.rules, []);
});

test("saving stores rules and fields in the config bucket and they read back", async () => {
  const r = await save({ baseRev: 0, rules: [rule(), rule({ id: "R2", name: "Hike only", cond: { F1: "No", F2: "Yes" }, prio: 2 })], fields: [field(), field({ id: "F2", label: "Hike", col: "hikeAmt", tagName: "Hike Amount" })], audit: [aud()] });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  assert.equal(r.json.data.rev, 1);
  assert.equal(r.json.data.savedBy, "hr@example.com");
  assert.ok(buckets.get("letter-templates-config").has("config/letters-config.json"));

  const g = await call("GET", "/?view=config");
  assert.equal(g.json.data.exists, true);
  assert.equal(g.json.data.rev, 1);
  assert.deepEqual(g.json.data.rules.map((x) => x.name), ["Promotion with hike", "Hike only"]);
  assert.deepEqual(g.json.data.fields.map((x) => x.id), ["F1", "F2"]);
  assert.equal(g.json.data.audit.length, 1);
});

test("an edit and a delete are permanent: the next read shows the new list, never the old one", async () => {
  const r = await save({ baseRev: 1, rules: [rule({ name: "Promotion + hike (renamed)", prio: 5 })], fields: [field(), field({ id: "F2", label: "Hike", col: "hikeAmt", tagName: "Hike Amount" })], audit: [aud({ id: "A2", detail: "changed; removed Hike only" })] });
  assert.equal(r.json.data.rev, 2);
  const g = await call("GET", "/?view=config");
  assert.deepEqual(g.json.data.rules.map((x) => [x.name, x.prio]), [["Promotion + hike (renamed)", 5]]);
  assert.equal(g.json.data.audit.length, 2);
  assert.equal(g.json.data.audit[0].id, "A2"); // newest first
});

test("deleting every rule is stored too (empty is not the same as never saved)", async () => {
  const r = await save({ baseRev: 2, rules: [], fields: [field()], audit: [] });
  assert.equal(r.status, 200);
  const g = await call("GET", "/?view=config");
  assert.equal(g.json.data.exists, true);
  assert.deepEqual(g.json.data.rules, []);
});

test("a stale baseRev is refused (409) and nothing is overwritten", async () => {
  const before = (await call("GET", "/?view=config")).json.data;
  const r = await save({ baseRev: 1, rules: [rule({ name: "Stale edit" })], fields: [field()], audit: [] });
  assert.equal(r.status, 409);
  const after = (await call("GET", "/?view=config")).json.data;
  assert.deepEqual(after, before);
});

test("bad data is refused or cleaned", async () => {
  const cur = (await call("GET", "/?view=config")).json.data.rev;
  const badId = await save({ baseRev: cur, rules: [rule({ id: "../x" })], fields: [], audit: [] });
  assert.equal(badId.status, 400);
  const twice = await save({ baseRev: cur, rules: [rule(), rule()], fields: [], audit: [] });
  assert.equal(twice.status, 400);
  assert.match(twice.json.message, /used twice/);
  const notList = await save({ baseRev: cur, rules: "x", fields: [], audit: [] });
  assert.equal(notList.status, 400);

  // unknown keys are dropped and a condition other than Any/Yes/No is ignored
  const ok = await save({ baseRev: cur, rules: [{ ...rule(), evil: "<script>", cond: { F1: "Yes", F2: "Maybe", "bad key": "Yes" } }], fields: [], audit: [] });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  const g = (await call("GET", "/?view=config")).json.data;
  assert.equal(g.rules[0].evil, undefined);
  assert.deepEqual(g.rules[0].cond, { F1: "Yes" });
});

test("audit lines are kept newest first and capped", async () => {
  let rev = (await call("GET", "/?view=config")).json.data.rev;
  for (let i = 0; i < 3; i += 1) {
    const r = await save({ baseRev: rev, rules: [rule()], fields: [], audit: Array.from({ length: 20 }, (_, k) => aud({ id: `B${i}-${k}` })) });
    assert.equal(r.status, 200);
    rev = r.json.data.rev;
  }
  const g = (await call("GET", "/?view=config")).json.data;
  assert.equal(g.audit[0].id, "B2-0");
  assert.ok(g.audit.length <= 1000);
});

test("a user with View access can read the rules but not save them", async () => {
  level = "view";
  try {
    const g = await call("GET", "/?view=config");
    assert.equal(g.status, 200);
    const r = await save({ baseRev: g.json.data.rev, rules: [], fields: [], audit: [] });
    assert.equal(r.status, 403);
  } finally {
    level = "edit";
  }
});

test("a config bucket that was never created gives a clear message on save", async () => {
  process.env.LETTERS_CONFIG_BUCKET = "no-such-bucket";
  try {
    const r = await save({ baseRev: 0, rules: [rule()], fields: [], audit: [] });
    assert.equal(r.status, 500);
    assert.match(r.json.message, /no-such-bucket/);
  } finally {
    delete process.env.LETTERS_CONFIG_BUCKET;
  }
});