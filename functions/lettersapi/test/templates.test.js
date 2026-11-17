// Run with:  node --test functions/lettersapi/test
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const { Readable } = require("node:stream");

/* ---- fake Catalyst: Data Store + ZCQL + Stratus, all in memory ---- */
const LOC = (id, name, code, status = "") => ({ ROWID: id, location_name: name, location_code: code, status });
const db = {
  Letter_Templates: [],
  Letter_Template_Versions: [],
  Location_Master: [
    LOC("74008000000022894", "India", "IN"),
    LOC("74008000000022895", "Dubai", "AE-DXB"),
    LOC("74008000000022896", "Singapore", "SG"),
    LOC("74008000000022897", "Canada", "CA", "Active"),
    LOC("74008000000022898", "United Kingdom", "GB"),
    LOC("74008000000022899", "United States", "US"),
    LOC("74008000000022900", "Australia", "AU", "Active"),
    LOC("74008000000022901", "Mars", "MS", "Inactive"),
  ],
};
const buckets = new Map(); // bucket name -> Map(key -> Buffer)
let nextRow = 1000;
let level = "edit";

const fakeApp = {
  zcql: () => ({
    executeZCQLQuery: async (q) => {
      const m = /FROM (\w+) WHERE ROWID > (\d+)(?: AND tpl_id = '([^']+)')?/.exec(q);
      assert.ok(m, "unexpected query " + q);
      return db[m[1]]
        .filter((r) => Number(r.ROWID) > Number(m[2]) && (!m[3] || r.tpl_id === m[3]))
        .map((r) => ({ [m[1]]: r }));
    },
  }),
  datastore: () => ({
    table: (name) => ({
      insertRow: async (row) => {
        const r = { ROWID: String(nextRow++), ...row };
        db[name].push(r);
        return r;
      },
      updateRow: async (row) => {
        const r = db[name].find((x) => x.ROWID === String(row.ROWID));
        Object.assign(r, row);
        return r;
      },
    }),
  }),
  stratus: () => ({
    bucket: (n) => {
      if (n === "letter-templates-xx") throw new Error("bucket does not exist"); // never created
      if (!buckets.has(n)) buckets.set(n, new Map());
      const bucket = buckets.get(n);
      return {
        putObject: async (key, body) => {
          bucket.set(key, Buffer.from(body));
          return true;
        },
        getObject: async (key) => {
          if (!bucket.has(key)) throw new Error("NoSuchKey " + key);
          return Readable.from([bucket.get(key)]);
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
    assert.equal(key, "employeeMaster");
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

/* ---- helpers ---- */
function makeDocx() {
  // Not a real Word file, but it has what the checks look for.
  return Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("....word/document.xml....")]);
}
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
        const ct = this.headers["Content-Type"] || "";
        resolve({ status: this.status, headers: this.headers, json: ct.includes("json") ? JSON.parse(data) : null, raw: data });
      },
    };
    api(req, res);
  });
}
const tpl = (over = {}) => ({
  id: "T9001",
  name: "Hike Letter",
  family: "Revision",
  location: "India",
  font: "Calibri",
  fsize: 11,
  lh: "1.15",
  html: "<p>Dear <span class=\"lt-merge-field\" data-letter-tag=\"Name\">Name</span></p>",
  body: "Dear {{Name}}",
  sg: { company: "Wissen", name: "A", title: "MD", sigFile: "s.png", sigData: "data:image/png;base64,AAAA", logoFile: "l.png", logoData: "data:image/png;base64,BBBB", letterDate: "17-Nov-2026", from: "hr@example.com", cc: "", subject: "S", body: "B" },
  ...over,
});
const save = (extra) => call("POST", "/", { action: "saveTemplate", template: tpl(), note: "first", ...extra });

test("file names are made safe", () => {
  const { safeFileName } = api._test;
  assert.equal(safeFileName("../../etc/passwd"), "passwd.docx");
  assert.equal(safeFileName("Hike & Promotion Letter.docx"), "Hike _ Promotion Letter.docx");
  assert.equal(safeFileName(""), "template.docx");
});

test("first publish stores the docx and config in Stratus and rows in the Data Store", async () => {
  const r = await save({ baseVer: 0, docx: { fileName: "Hike Letter.docx", base64: makeDocx().toString("base64") } });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  const t = r.json.data;
  assert.equal(t.ver, 1);
  assert.equal(t.active, true);
  assert.equal(t.file, "Hike Letter.docx");
  assert.equal(t.hasDocx, true);
  assert.equal(t.sg.logoData, "data:image/png;base64,BBBB");
  assert.deepEqual([...buckets.keys()], ["letter-templates-in"]);
  assert.deepEqual([...buckets.get("letter-templates-in").keys()].sort(), ["T9001/v1/Hike Letter.docx", "T9001/v1/config.json"]);
  assert.equal(db.Letter_Templates[0].bucket, "letter-templates-in");
  assert.equal(db.Letter_Templates.length, 1);
  assert.equal(db.Letter_Template_Versions.length, 1);
  assert.equal(db.Letter_Templates[0].updated_by, "hr@example.com");
});

test("a seed template starting at version 1 publishes as version 2", async () => {
  const r = await save({ template: tpl({ id: "T2", name: "Hike Letter Seed", location: "Singapore" }), baseVer: 1 });
  assert.equal(r.json.data.ver, 2);
  assert.equal(r.json.data.hasDocx, false);
});

test("next publish without a new Word file keeps the old one; a stale baseVer is refused", async () => {
  const r2 = await save({ baseVer: 1, template: tpl({ name: "Hike Letter v2" }) });
  assert.equal(r2.status, 200);
  assert.equal(r2.json.data.ver, 2);
  assert.equal(r2.json.data.file, "Hike Letter.docx");
  assert.equal(r2.json.data.hist.length, 2);
  const stale = await save({ baseVer: 1 });
  assert.equal(stale.status, 409);
});

test("GET templates returns content; GET docx returns the stored file", async () => {
  const g = await call("GET", "/?view=templates");
  assert.equal(g.status, 200);
  assert.deepEqual(g.json.data.problems, []);
  const t = g.json.data.templates.find((x) => x.id === "T9001");
  assert.equal(t.name, "Hike Letter v2");
  assert.match(t.html, /lt-merge-field/);
  const d = await call("GET", "/?view=docx&id=T9001&ver=1");
  assert.equal(d.status, 200);
  assert.match(d.headers["Content-Disposition"], /Hike Letter\.docx/);
  assert.deepEqual(Buffer.from(d.raw), makeDocx());
  const none = await call("GET", "/?view=docx&id=T2");
  assert.equal(none.status, 404);
});

test("every location has its own bucket, named from the Location_Master code", async () => {
  const dub = await save({ template: tpl({ id: "T9100", name: "Loc Letter", location: "Dubai" }), baseVer: 0 });
  assert.equal(dub.status, 200, JSON.stringify(dub.json));
  assert.equal(dub.json.data.bucket, "letter-templates-ae-dxb");
  const uk = await save({ template: tpl({ id: "T9101", name: "Loc Letter", location: "united kingdom" }), baseVer: 0 });
  assert.equal(uk.status, 200);
  assert.equal(uk.json.data.location, "United Kingdom"); // the Location_Master spelling is stored
  assert.equal(uk.json.data.bucket, "letter-templates-gb");
  assert.ok(buckets.get("letter-templates-ae-dxb").has("T9100/v1/config.json"));
  assert.ok(!buckets.get("letter-templates-gb").has("T9100/v1/config.json"));
  const dup = await save({ template: tpl({ id: "T9102", name: "loc letter", location: "DUBAI" }), baseVer: 0 });
  assert.equal(dup.status, 409);
});

test("a location is required, must be active in Location_Master, and cannot change later", async () => {
  assert.equal((await save({ template: tpl({ id: "T9200", location: "" }), baseVer: 0 })).status, 400);
  assert.equal((await save({ template: tpl({ id: "T9201", name: "N1", location: "Atlantis" }), baseVer: 0 })).status, 400);
  assert.equal((await save({ template: tpl({ id: "T9202", name: "N2", location: "Mars" }), baseVer: 0 })).status, 400);
  const move = await save({ template: tpl({ name: "Hike Letter", location: "Canada" }), baseVer: 2 });
  assert.equal(move.status, 400);
  assert.match(move.json.message, /cannot be moved/);
});

test("a location whose bucket was never created gives a clear error", async () => {
  db.Location_Master.push(LOC("1", "Nowhere", "XX"));
  const r = await save({ template: tpl({ id: "T9300", name: "Nowhere letter", location: "Nowhere" }), baseVer: 0 });
  assert.equal(r.status, 500);
  assert.match(r.json.message, /letter-templates-xx/);
  assert.equal(db.Letter_Templates.some((x) => x.tpl_id === "T9300"), false);
});

test("bad input is refused", async () => {
  const notZip = await save({ baseVer: 2, docx: { fileName: "x.docx", base64: Buffer.from("hello").toString("base64") } });
  assert.equal(notZip.status, 400);
  const big = await save({ baseVer: 2, docx: { fileName: "x.docx", base64: Buffer.alloc(5 * 1024 * 1024 + 10, 1).toString("base64") } });
  assert.equal(big.status, 413);
  const noName = await save({ baseVer: 2, template: tpl({ name: " " }) });
  assert.equal(noName.status, 400);
  const badId = await save({ template: tpl({ id: "x'; DROP" }) });
  assert.equal(badId.status, 400);
  const empty = await save({ baseVer: 2, template: tpl({ html: "  " }) });
  assert.equal(empty.status, 400);
  const bogusImg = await save({ baseVer: 2, template: tpl({ sg: { ...tpl().sg, logoData: "javascript:alert(1)" } }) });
  assert.equal(bogusImg.status, 200);
  assert.equal(bogusImg.json.data.sg.logoData, "");
});

test("setActive flips the switch; unknown template is a 404; View access cannot save", async () => {
  const off = await call("POST", "/", { action: "setActive", id: "T9001", active: false });
  assert.equal(off.status, 200);
  assert.equal((await call("GET", "/?view=templates")).json.data.templates.find((x) => x.id === "T9001").active, false);
  assert.equal((await call("POST", "/", { action: "setActive", id: "T404", active: true })).status, 404);
  level = "view";
  assert.equal((await call("GET", "/?view=templates")).status, 200);
  assert.equal((await save({ baseVer: 3 })).status, 403);
  level = "edit";
});
