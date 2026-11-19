"use strict";

/* ---------------------------------------------------------------------
   lettersapi - Letters screen (HR Operations > Operation > Letters)

   Stores the TEMPLATES (including the original Word .docx file HR imported),
   the letters of each cycle, and the Letter RULES and FIELDS (lettersConfig.js).

   GET  /?view=templates          -> { success, data:{ templates:[...] } }
                                     every template, newest published version, with
                                     its content (html, body, signatory block)
   GET  /?view=docx&id=T1&ver=2   -> the stored .docx file itself (ver optional =
                                     latest). Binary download.
   POST /  { action:"saveTemplate", template:{...}, baseVer, note, docx? }
                                  -> publishes a NEW VERSION of one template
                                     (creates the template the first time)
   GET  /?view=cycles             -> { cycles:[{id,name,location,status}] } Active cycles
   GET  /?view=sheet&cycleId=5&location=Dubai&page=1&limit=5000
                                  -> the Appraisal_Sheet people of ONE cycle and ONE
                                     location (see lettersSheet.js). Answers
                                     { pending:true } while the big tables are still
                                     being read: ask again, it resumes where it stopped.
   POST /  { action:"clearState", cycleId, location }
                                  -> deletes the stored letters of one cycle (used when
                                     the cycle is archived)
   POST /  { action:"setActive", id, active }
                                  -> turns a template Active / Inactive
   POST /  { action:"sendLetter", to, subject, html, letterId }
                                  -> e-mails ONE letter through Catalyst Mail (Cloud Scale > Mail).
                                     The sender is the verified address in LETTERS_FROM_EMAIL
                                     (default test_team_member5@wissen.com). Catalyst refuses any
                                     sender that is not verified there.
   GET  /?view=config             -> the stored Letter Rules + Letter Fields
                                     { exists, rev, rules, fields, audit }
   POST /  { action:"saveConfig", baseRev, rules, fields, audit }
                                  -> stores them for everybody (409 if somebody saved
                                     first). They stay until edited or deleted.
                                     Bucket: <LETTERS_BUCKET_PREFIX>-config
                                     (or the env variable LETTERS_CONFIG_BUCKET)

   Where things live
     One Stratus bucket PER LOCATION, named from Location_Master:
        <LETTERS_BUCKET_PREFIX>-<location_code in lower case>
        e.g. letter-templates-in, letter-templates-ae-dxb, letter-templates-sg,
             letter-templates-ca, letter-templates-gb, letter-templates-us,
             letter-templates-au
        (the prefix is the env variable LETTERS_BUCKET_PREFIX, default
         "letter-templates"; the buckets are created by hand in the console)
       Inside a bucket:
        <tplId>/v<ver>/<file name>.docx   the imported Word file
        <tplId>/v<ver>/config.json        what the editor needs (name, family,
                                          html, body, font, signatory block with
                                          logo / signature)
        templates/index.json              the template list of that location:
                                          { templates:[ {tpl_id, name, family, location,
                                          bucket, tpl_version, active, docx_file, docx_key,
                                          config_key, updated_by, updated_on} ],
                                          versions:[ {tpl_id, tpl_version, bucket, docx_file,
                                          docx_key, config_key, published_by, published_on, note} ] }
     No Data Store table is needed for templates: the list lives in the bucket next to the
     files, so nothing has to be created in the Data Store.
     Location_Master (read only) gives the allowed locations and their codes.
   A template belongs to exactly one location for its whole life, so a
   location's letters can only ever come from that location's bucket.

   Access: reading needs View, saving needs Edit on the HR Operations screens
   (employeeMaster), the same as every other HR Operations function.
   --------------------------------------------------------------------- */

const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");
const { guarded } = require("./guard");

const TBL = { locations: "Location_Master" };
const INDEX_KEY = "templates/index.json";
const NOT_FOUND = /not\s*found|no\s*such|404|does not exist/i;
const SCREEN_KEY = "employeeMaster";
const BUCKET_PREFIX = () => process.env.LETTERS_BUCKET_PREFIX || "letter-templates";
const MAX_BODY_BYTES = 12 * 1024 * 1024; // whole request (JSON with base64)
const MAX_DOCX_BYTES = 5 * 1024 * 1024; // the .docx itself
const MAX_CONFIG_BYTES = 4 * 1024 * 1024; // config.json (html + logo + signature)
const ID_RE = /^T[A-Za-z0-9_-]{1,40}$/;
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const IST_MS = 330 * 60 * 1000;
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/* ---------- small helpers ---------- */
function sendJson(res, status, body) {
  if (res.headersSent || res.writableEnded) return; // the time limit may already have answered
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
const text = (v) => String(v ?? "").trim();
const clip = (v, n = 250) => String(v ?? "").slice(0, n);
const rowId = (r) => String((r && (r.ROWID ?? r.rowid)) ?? "");
const fail = (status, message) => new access.HttpError(status, message);
function isOn(v) {
  return v === true || v === 1 || ["1", "true", "yes", "active"].includes(text(v).toLowerCase());
}
// "17-Nov-2026 14:05" in India time, the same format the Letters screen shows
function stamp(ms = Date.now()) {
  const d = new Date(ms + IST_MS);
  const z = (n) => (n < 10 ? "0" : "") + n;
  return `${z(d.getUTCDate())}-${MON[d.getUTCMonth()]}-${d.getUTCFullYear()} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}`;
}
// Keep only safe characters so a file name can never change the object path.
function safeFileName(name) {
  const base = text(name).split(/[\\/]/).pop() || "template.docx";
  const clean = base.replace(/[^A-Za-z0-9._ ()-]/g, "_").replace(/\s+/g, " ").slice(0, 100);
  return /\.docx$/i.test(clean) ? clean : clean + ".docx";
}
const objectKey = (tplId, ver, file) => `${tplId}/v${ver}/${file}`;

/* ---------- ZCQL (same shape as the other functions: no getPagedRows) ---------- */
async function readAll(app, table, where = "") {
  const zcql = app.zcql();
  const rows = [];
  let last = "0";
  for (let guard = 0; guard < 500; guard += 1) {
    const q =
      `SELECT * FROM ${table} WHERE ROWID > ${last}` +
      (where ? ` AND ${where}` : "") +
      " ORDER BY ROWID ASC LIMIT 300";
    const result = await guarded(() => zcql.executeZCQLQuery(q), `Reading ${table}`);
    const page = (result || []).map((i) => (i && (i[table] || Object.values(i)[0])) || {});
    rows.push(...page);
    if (page.length < 300) break;
    last = rowId(page[page.length - 1]);
    if (!last) break;
  }
  return rows;
}

/* ---------- locations (Location_Master) -> bucket ---------- */
const bucketNameFor = (code) => `${BUCKET_PREFIX()}-${String(code).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}`;

// name (lower case) -> { name, code, bucket }. A blank status counts as Active.
async function locationMap(app) {
  const rows = await readAll(app, TBL.locations);
  const m = new Map();
  rows.forEach((r) => {
    const name = text(r.location_name);
    const code = text(r.location_code);
    if (!name || !code) return;
    if (text(r.status).toLowerCase() === "inactive") return;
    m.set(name.toLowerCase(), { name, code, bucket: bucketNameFor(code) });
  });
  return m;
}

/* ---------- Stratus ---------- */
function bucketOf(app, bucketName) {
  if (!bucketName) throw new Error("No bucket is recorded for this template.");
  return app.stratus().bucket(bucketName);
}
async function putObject(app, bucketName, key, body, contentType) {
  // overwrite: a retry of the same version must not fail halfway
  try {
    return await guarded(() => bucketOf(app, bucketName).putObject(key, body, { overwrite: "true", contentType }), `Writing to bucket ${bucketName}`, 20000);
  } catch (e) {
    throw fail(500, `Could not write to the Stratus bucket "${bucketName}". Check that it exists in this environment. (${e.message})`);
  }
}
// getObject returns a stream in the Node SDK; handle the other shapes too.
async function toBuffer(obj) {
  if (obj == null) return Buffer.alloc(0);
  if (Buffer.isBuffer(obj)) return obj;
  if (obj instanceof Uint8Array) return Buffer.from(obj);
  if (typeof obj === "string") return Buffer.from(obj);
  if (obj.body !== undefined && obj.body !== obj) return toBuffer(obj.body);
  if (typeof obj.arrayBuffer === "function") return Buffer.from(await obj.arrayBuffer());
  if (typeof obj.on === "function") {
    return new Promise((resolve, reject) => {
      const parts = [];
      obj.on("data", (c) => parts.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      obj.on("end", () => resolve(Buffer.concat(parts)));
      obj.on("error", reject);
    });
  }
  if (typeof obj[Symbol.asyncIterator] === "function") {
    const parts = [];
    for await (const c of obj) parts.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
    return Buffer.concat(parts);
  }
  throw new Error("Unexpected object type returned by Stratus.");
}
async function getObjectBuffer(app, bucketName, key) {
  return guarded(async () => toBuffer(await bucketOf(app, bucketName).getObject(key)), `Reading from bucket ${bucketName}`, 12000);
}

// A missing object counts as deleted.
async function deleteObject(app, bucketName, key) {
  try {
    return await guarded(() => bucketOf(app, bucketName).deleteObject(key), `Deleting from bucket ${bucketName}`, 12000);
  } catch (e) {
    if (/not\s*found|no\s*such|404|does not exist/i.test(String((e && e.message) || ""))) return null;
    throw fail(500, `Could not delete from the Stratus bucket "${bucketName}". (${e.message})`);
  }
}

/* ---------- validation ---------- */
function decodeDocx(docx) {
  if (!docx) return null;
  const fileName = safeFileName(docx.fileName);
  const b64 = String(docx.base64 || "").replace(/^data:[^,]*,/, "");
  if (!b64) throw fail(400, "The Word file is empty.");
  const buf = Buffer.from(b64, "base64");
  if (!buf.length) throw fail(400, "The Word file is empty.");
  if (buf.length > MAX_DOCX_BYTES) throw fail(413, "The Word file is larger than 5 MB.");
  // A .docx is a zip: "PK\x03\x04" at the start and word/document.xml inside.
  const zip = buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
  if (!zip || buf.indexOf("word/document.xml") < 0) throw fail(400, "This is not a valid Word (.docx) file.");
  return { fileName, buf };
}

const FONT_OK = new Set(["Inter", "Calibri", "Arial", "Times New Roman", "Cambria", "Georgia", "Verdana", "Tahoma", "Trebuchet MS", "Courier New"]);
const SG_KEYS = ["company", "name", "title", "sigFile", "sigData", "logoFile", "logoData", "letterDate", "from", "cc", "subject", "body"];

function cleanTemplate(t) {
  if (!t || typeof t !== "object") throw fail(400, "No template was sent.");
  const id = text(t.id);
  if (!ID_RE.test(id)) throw fail(400, "The template id is not valid.");
  const name = clip(text(t.name), 150);
  if (!name) throw fail(400, "The template needs a name.");
  const family = clip(text(t.family), 60);
  if (!family) throw fail(400, "The template needs a family.");
  const location = clip(text(t.location), 100);
  if (!location) throw fail(400, "Choose the location this template is for.");
  const html = String(t.html || "");
  if (!html.trim()) throw fail(400, "The letter is empty.");
  const sg = {};
  const src = t.sg && typeof t.sg === "object" ? t.sg : {};
  SG_KEYS.forEach((k) => {
    sg[k] = String(src[k] == null ? "" : src[k]);
  });
  ["logoData", "sigData"].forEach((k) => {
    if (sg[k] && !/^data:image\/(png|jpe?g|gif|bmp|webp);base64,/i.test(sg[k])) sg[k] = "";
  });
  return {
    id,
    name,
    family,
    location,
    font: FONT_OK.has(t.font) ? t.font : "Calibri",
    fsize: Math.min(40, Math.max(6, Number(t.fsize) || 11)),
    lh: String([1, 1.15, 1.5, 2].includes(Number(t.lh)) ? Number(t.lh) : 1.15),
    html,
    body: String(t.body || ""),
    sg,
  };
}

/* ---------- template list (one index.json per location bucket) ---------- */
const emptyIndex = () => ({ v: 1, templates: [], versions: [] });

async function readIndex(app, bucketName) {
  let buf;
  try {
    buf = await getObjectBuffer(app, bucketName, INDEX_KEY);
  } catch (e) {
    // Not created yet (no template published for this location): an empty list.
    // A bucket that does not exist reads the same way; publishing then says so clearly.
    if (NOT_FOUND.test(String((e && e.message) || ""))) return emptyIndex();
    throw e;
  }
  try {
    const j = JSON.parse(buf.toString("utf8"));
    return { v: 1, templates: Array.isArray(j.templates) ? j.templates : [], versions: Array.isArray(j.versions) ? j.versions : [] };
  } catch (e) {
    throw new Error(`The template list in bucket "${bucketName}" is not valid JSON.`);
  }
}
const writeIndex = (app, bucketName, idx) =>
  putObject(app, bucketName, INDEX_KEY, Buffer.from(JSON.stringify({ v: 1, templates: idx.templates, versions: idx.versions }), "utf8"), "application/json");

// Every location's list (or one location's): [{ loc, idx }] plus the buckets that could not be read.
async function readIndexes(app, onlyLocation) {
  const locs = [...(await locationMapCached(app)).values()];
  const want = text(onlyLocation).toLowerCase();
  const pick = want && !["all", "all locations"].includes(want) ? locs.filter((l) => l.name.toLowerCase() === want || l.code.toLowerCase() === want) : locs;
  const out = [];
  const problems = [];
  for (let i = 0; i < pick.length; i += 2) {
    await Promise.all(
      pick.slice(i, i + 2).map(async (loc) => {
        try {
          out.push({ loc, idx: await readIndex(app, loc.bucket) });
        } catch (e) {
          problems.push({ id: "", location: loc.name, message: `The templates of ${loc.name} could not be read from bucket "${loc.bucket}". (${e.message})` });
        }
      }),
    );
  }
  return { lists: out, problems };
}

async function readConfig(app, bucketName, key) {
  try {
    return JSON.parse((await getObjectBuffer(app, bucketName, key)).toString("utf8"));
  } catch (e) {
    console.error("lettersapi: cannot read", bucketName, key, e.message);
    return null;
  }
}

function shape(row, cfg, history) {
  return {
    id: text(row.tpl_id),
    name: text(row.name),
    family: text(row.family),
    location: text(row.location),
    bucket: text(row.bucket),
    ver: Number(row.tpl_version) || 0,
    active: isOn(row.active),
    file: text(row.docx_file),
    hasDocx: !!text(row.docx_key),
    by: text(row.updated_by),
    on: text(row.updated_on),
    html: cfg ? cfg.html : "",
    body: cfg ? cfg.body : "",
    font: cfg ? cfg.font : "Calibri",
    fsize: cfg ? cfg.fsize : 11,
    lh: cfg ? cfg.lh : "1.15",
    sg: cfg ? cfg.sg : null,
    hist: history,
  };
}

// The template list is read by every open of the Letters screen and changes rarely: keep each
// answer for 30 s (per location) and forget it whenever a template is published or switched.
const TEMPLATE_CACHE_MS = 30 * 1000;
const templateCache = new Map(); // location key -> { at, data, pending }
const forgetTemplates = () => templateCache.clear();

async function loadTemplates(app, onlyLocation) {
  const key = text(onlyLocation).toLowerCase();
  const hit = templateCache.get(key);
  if (hit && hit.data && Date.now() - hit.at < TEMPLATE_CACHE_MS) return hit.data;
  if (hit && hit.pending) return hit.pending; // a read for the same location is already running: share it
  const pending = readTemplates(app, onlyLocation)
    .then((data) => {
      // a list with problems is not remembered: the next open tries again
      if (!data.problems.length) templateCache.set(key, { at: Date.now(), data });
      else templateCache.delete(key);
      return data;
    })
    .catch((e) => {
      templateCache.delete(key);
      throw e;
    });
  templateCache.set(key, { at: 0, data: null, pending });
  return pending;
}

async function readTemplates(app, onlyLocation) {
  const { lists, problems } = await readIndexes(app, onlyLocation);
  const templates = [];
  const jobs = [];
  lists.forEach(({ idx }) => idx.templates.forEach((row) => jobs.push({ row, idx })));
  // Read the config files two at a time (this project's Catalyst concurrency limit).
  for (let i = 0; i < jobs.length; i += 2) {
    const part = await Promise.all(
      jobs.slice(i, i + 2).map(async ({ row, idx }) => {
        const cfg = await readConfig(app, text(row.bucket), text(row.config_key));
        if (!cfg) {
          problems.push({ id: text(row.tpl_id), location: text(row.location), message: `"${text(row.name)}" (${text(row.location)}) could not be read from bucket "${text(row.bucket)}".` });
          return null;
        }
        const history = idx.versions
          .filter((v) => text(v.tpl_id) === text(row.tpl_id))
          .map((v) => ({ ver: Number(v.tpl_version) || 0, by: text(v.published_by), on: text(v.published_on), note: text(v.note), file: text(v.docx_file) }))
          .sort((a, b) => b.ver - a.ver);
        return shape(row, cfg, history);
      }),
    );
    templates.push(...part.filter(Boolean));
  }
  return { templates, problems };
}

// The template with this id, wherever it lives: { loc, idx, row } or null.
async function findTemplate(app, id) {
  const { lists } = await readIndexes(app);
  for (const { loc, idx } of lists) {
    const row = idx.templates.find((r) => text(r.tpl_id) === id);
    if (row) return { loc, idx, row };
  }
  return null;
}

async function sendDocx(app, res, id, ver) {
  if (!ID_RE.test(id)) throw fail(400, "The template id is not valid.");
  const found = await findTemplate(app, id);
  if (!found) throw fail(404, "Template not found.");
  let key = text(found.row.docx_key);
  let file = text(found.row.docx_file);
  let bucketName = text(found.row.bucket);
  if (ver) {
    const v = found.idx.versions.find((x) => text(x.tpl_id) === id && Number(x.tpl_version) === Number(ver));
    if (!v) throw fail(404, "That version was not found.");
    key = text(v.docx_key);
    file = text(v.docx_file);
    bucketName = text(v.bucket) || bucketName;
  }
  if (!key) throw fail(404, "No Word file was imported for this template.");
  const buf = await getObjectBuffer(app, bucketName, key);
  res.writeHead(200, {
    "Content-Type": DOCX_TYPE,
    "Content-Length": buf.length,
    "Content-Disposition": `attachment; filename="${safeFileName(file)}"`,
    "Cache-Control": "no-store",
  });
  res.end(buf);
}

/* ---------- writing ---------- */
async function saveTemplate(app, actor, payload) {
  const tpl = cleanTemplate(payload.template);
  const docx = decodeDocx(payload.docx);
  // The location must be an active Location Master location; it decides the bucket.
  const loc = (await locationMap(app)).get(tpl.location.toLowerCase());
  if (!loc) throw fail(400, `"${tpl.location}" is not an active location in Location Master.`);
  tpl.location = loc.name;
  const note = clip(text(payload.note), 250);
  const { lists } = await readIndexes(app);
  const found = await (async () => {
    for (const { loc: l, idx } of lists) {
      const row = idx.templates.find((r) => text(r.tpl_id) === tpl.id);
      if (row) return { loc: l, row };
    }
    return null;
  })();
  const current = found ? found.row : null;
  const currentVer = current ? Number(current.tpl_version) || 0 : 0;
  if (current && text(current.location).toLowerCase() !== loc.name.toLowerCase()) {
    throw fail(400, `This template belongs to ${text(current.location)} and cannot be moved to ${loc.name}. Clone it and choose the other location.`);
  }

  // One template per name and location: "Hike Letter" can exist once for each location.
  const dup = lists
    .flatMap(({ idx }) => idx.templates)
    .find((r) => text(r.tpl_id) !== tpl.id && text(r.name).toLowerCase() === tpl.name.toLowerCase() && text(r.location).toLowerCase() === tpl.location.toLowerCase());
  if (dup) throw fail(409, `A template named "${tpl.name}" already exists for ${tpl.location || "All locations"}.`);

  // Optimistic check: the screen sends the version it started from.
  if (current && payload.baseVer != null && Number(payload.baseVer) !== currentVer) {
    throw fail(409, `Someone else published version ${currentVer} of this template. Reload the Letters screen and try again.`);
  }
  const baseVer = payload.baseVer == null ? 0 : Math.max(0, Number(payload.baseVer) || 0);
  const ver = (current ? currentVer : baseVer) + 1;

  // A save without a new Word file keeps pointing at the previous one.
  let docxFile = current ? text(current.docx_file) : "";
  let docxKey = current ? text(current.docx_key) : "";
  if (docx) {
    docxFile = docx.fileName;
    docxKey = objectKey(tpl.id, ver, docx.fileName);
    await putObject(app, loc.bucket, docxKey, docx.buf, DOCX_TYPE);
  }

  const config = JSON.stringify({ ...tpl, ver, file: docxFile });
  if (Buffer.byteLength(config) > MAX_CONFIG_BYTES) throw fail(413, "The template (letter text, logo and signature) is too large.");
  const configKey = objectKey(tpl.id, ver, "config.json");
  await putObject(app, loc.bucket, configKey, Buffer.from(config, "utf8"), "application/json");

  const on = stamp();
  const row = {
    tpl_id: tpl.id,
    name: tpl.name,
    family: tpl.family,
    location: clip(tpl.location, 100),
    bucket: clip(loc.bucket, 100),
    tpl_version: ver,
    active: current ? isOn(current.active) : true, // a template is Active from its first publish
    docx_file: clip(docxFile, 150),
    docx_key: clip(docxKey, 250),
    config_key: clip(configKey, 250),
    updated_by: clip(actor, 150),
    updated_on: on,
  };
  // Read the list again just before writing it, so a template published meanwhile is not lost.
  const idx = await readIndex(app, loc.bucket);
  const at = idx.templates.findIndex((r) => text(r.tpl_id) === tpl.id);
  if (at >= 0) idx.templates[at] = row;
  else idx.templates.push(row);
  idx.versions.push({
    tpl_id: tpl.id,
    tpl_version: ver,
    bucket: clip(loc.bucket, 100),
    docx_file: clip(docxFile, 150),
    docx_key: clip(docxKey, 250),
    config_key: clip(configKey, 250),
    published_by: clip(actor, 150),
    published_on: on,
    note,
  });
  await writeIndex(app, loc.bucket, idx);
  forgetTemplates();

  const { templates } = await loadTemplates(app, loc.name);
  return templates.find((t) => t.id === tpl.id);
}

async function setActive(app, payload) {
  const id = text(payload.id);
  if (!ID_RE.test(id)) throw fail(400, "The template id is not valid.");
  const found = await findTemplate(app, id);
  if (!found) throw fail(404, "This template has not been saved to the server yet. Publish it once first.");
  const idx = await readIndex(app, found.loc.bucket);
  const row = idx.templates.find((r) => text(r.tpl_id) === id);
  if (!row) throw fail(404, "This template has not been saved to the server yet. Publish it once first.");
  row.active = !!payload.active;
  await writeIndex(app, found.loc.bucket, idx);
  forgetTemplates();
  return { id, active: !!payload.active };
}

/* ---------- request ---------- */
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return new Promise((resolve, reject) => {
    let size = 0;
    const parts = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(fail(413, "The request is larger than 12 MB."));
        req.destroy();
        return;
      }
      parts.push(c);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(parts).toString("utf8");
        resolve(raw.trim() ? JSON.parse(raw) : {});
      } catch {
        reject(fail(400, "Invalid JSON request body."));
      }
    });
    req.on("error", reject);
  });
}

async function authorize(req, level) {
  const userApp = catalyst.initialize(req);
  const adminApp = catalyst.initialize(req, { scope: "admin" });
  const a = await access.check(userApp, adminApp);
  access.guard(a, () => access.requireScreen(a, SCREEN_KEY, level));
  let actor = a && a.user && a.user.email;
  if (!actor) {
    try {
      const u = await userApp.userManagement().getCurrentUser();
      actor = u && (u.email_id || u.user_id);
    } catch (e) {
      actor = "";
    }
  }
  return { adminApp, actor: text(actor) || "unknown" };
}

// Location_Master is a handful of rows read by almost every request: keep it for a minute
// instead of paying a Data Store call each time (fewer calls = less waiting in the gate).
let locationCache = { at: 0, map: null };
async function locationMapCached(app) {
  if (locationCache.map && Date.now() - locationCache.at < 60 * 1000) return locationCache.map;
  const map = await locationMap(app);
  locationCache = { at: Date.now(), map };
  return map;
}
const configBucket = () => process.env.LETTERS_CONFIG_BUCKET || `${BUCKET_PREFIX()}-config`;
const lettersConfig = require("./lettersConfig")({ configBucket, putObject, getObjectBuffer, fail, text });
const lettersState = require("./lettersState")({ locationMap: locationMapCached, putObject, getObjectBuffer, deleteObject, fail, text });
const sheetBusy = new Set();
const lettersSheet = require("./lettersSheet")({ fail, text, guarded });

function parseCycles(raw) {
  try {
    const list = JSON.parse(raw || "[]");
    return Array.isArray(list) ? list : [];
  } catch (e) {
    throw fail(400, "cycles must be a JSON list.");
  }
}

/* ---------- e-mail (Catalyst Mail) ---------- */
// Must be an address listed under Cloud Scale > Mail > Email Configuration with
// Domain Verification = Verified AND Confirmation = Verified.
const FROM_EMAIL = () => process.env.LETTERS_FROM_EMAIL || "test_team_member5@wissen.com";
const MAIL_RE = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]+$/;
const MAX_MAIL_HTML = 2 * 1024 * 1024;

async function sendLetterMail(app, actor, payload) {
  const to = text(payload.to);
  if (!MAIL_RE.test(to)) throw fail(400, "The employee has no valid email address on the Employee Master.");
  const subject = text(payload.subject).replace(/[\r\n]+/g, " ").slice(0, 200);
  if (!subject) throw fail(400, "The email needs a subject.");
  // The letter HTML is built by the HR screen; scripts and inline handlers never belong in a mail.
  const html = String(payload.html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*')/gi, "");
  if (!html.trim()) throw fail(400, "The letter is empty.");
  if (Buffer.byteLength(html) > MAX_MAIL_HTML) throw fail(413, "The letter is too large to email (over 2 MB). Use a smaller logo or signature image.");
  const from = FROM_EMAIL();
  try {
    await app.email().sendMail({
      from_email: from,
      to_email: [to],
      subject,
      content: html,
      html_mode: true,
    });
  } catch (e) {
    const why = String((e && (e.message || e.code)) || e).slice(0, 300);
    console.error("lettersapi: sendMail failed", from, "->", to, why);
    throw fail(502, /verif|not\s*allowed|sender|from/i.test(why)
      ? `Catalyst Mail refused the sender ${from}. Check that it is verified under Cloud Scale > Mail. (${why})`
      : `The email could not be sent: ${why}`);
  }
  console.log("lettersapi: letter", text(payload.letterId), "mailed to", to, "from", from, "by", actor);
  return { sent: true, from, to, letterId: text(payload.letterId) };
}

async function handle(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return sendJson(res, 405, { success: false, message: "Method not allowed." });
    }
    const tAuth = Date.now();
    const { adminApp, actor } = await authorize(req, req.method === "GET" ? "view" : "edit");
    console.log("lettersapi: login and access check took", Date.now() - tAuth, "ms");

    if (req.method === "GET") {
      const q = new URL(req.url, "https://x").searchParams;
      const view = q.get("view") || "templates";
      if (view === "docx") return await sendDocx(adminApp, res, text(q.get("id")), q.get("ver"));
      if (view === "cycles") {
        // Active cycles (id + location) for the Letters screen, without going through payrollcycleapi.
        return sendJson(res, 200, { success: true, data: await lettersSheet.loadCycles(adminApp) });
      }
      if (view === "sheet") {
        // People of one cycle + location, read from Appraisal_Sheet in time-budgeted chunks.
        // Only ONE such read per cycle and location runs at a time: a second ask (a retry, another
        // tab) is told to wait instead of piling more work onto the Data Store.
        const busyKey = `${q.get("cycleId")}|${text(q.get("location")).toLowerCase()}`;
        if (sheetBusy.has(busyKey)) return sendJson(res, 200, { success: true, data: { pending: true, busy: true } });
        sheetBusy.add(busyKey);
        try {
          return sendJson(res, 200, {
            success: true,
            data: await lettersSheet.loadSheet(adminApp, {
              cycleId: q.get("cycleId"),
              location: q.get("location"),
              page: q.get("page"),
              limit: q.get("limit"),
              // The browser gave up (cancelled / closed): stop reading, free the Data Store slots.
              isCancelled: () => !!req.clientGone,
            }),
          });
        } finally {
          sheetBusy.delete(busyKey);
        }
      }
      if (view === "state") {
        return sendJson(res, 200, { success: true, data: await lettersState.loadState(adminApp, parseCycles(q.get("cycles"))) });
      }
      if (view === "templates") {
        return sendJson(res, 200, { success: true, data: await loadTemplates(adminApp, q.get("location")) });
      }
      if (view === "config") {
        return sendJson(res, 200, { success: true, data: await lettersConfig.loadConfig(adminApp) });
      }
      throw fail(400, "Unknown view.");
    }

    const payload = await readBody(req);
    if (payload.action === "saveTemplate") {
      return sendJson(res, 200, { success: true, data: await saveTemplate(adminApp, actor, payload) });
    }
    if (payload.action === "saveConfig") {
      return sendJson(res, 200, { success: true, data: await lettersConfig.saveConfig(adminApp, actor, payload) });
    }
    if (payload.action === "saveState") {
      return sendJson(res, 200, { success: true, data: await lettersState.saveState(adminApp, actor, payload) });
    }
    if (payload.action === "clearState") {
      return sendJson(res, 200, { success: true, data: await lettersState.clearState(adminApp, payload) });
    }
    if (payload.action === "sendLetter") {
      return sendJson(res, 200, { success: true, data: await sendLetterMail(adminApp, actor, payload) });
    }
    if (payload.action === "setActive") {
      return sendJson(res, 200, { success: true, data: await setActive(adminApp, payload) });
    }
    throw fail(400, "Unknown action.");
  } catch (error) {
    const status = error.status || 500;
    console.error("lettersapi:", error.message, error.stack || "");
    return sendJson(res, status, { success: false, message: error.message || "Letters request failed." });
  }
};

/* Whatever happens inside, the browser gets an answer before Catalyst's ~30 s
   limit ends the request without one (that is the endless "pending" in the
   Network tab). The browser can then retry or show the message. */
const REQUEST_LIMIT_MS = 24000;
const BUILD = "letters-mail-2026-11-19";
const BOOTED_AT = Date.now();
let served = 0;
module.exports = async function lettersApi(req, res) {
  served += 1;
  // ?view=ping answers at once, before any login or database work. Open it to see
  // whether the function is reachable and which version of this file is deployed.
  if (req.method === "GET") {
    try {
      const u = new URL(req.url, "https://x").searchParams;
      if (u.get("view") === "ping") {
        return sendJson(res, 200, { success: true, data: { build: BUILD, node: process.version, upSeconds: Math.round((Date.now() - BOOTED_AT) / 1000), requestsServed: served } });
      }
    } catch (e) {
      /* fall through to the normal handler */
    }
  }
  // Knows when the browser has gone away, so long reads can stop (see view=sheet).
  if (typeof res.on === "function") {
    res.on("close", () => {
      if (!res.writableEnded) req.clientGone = true;
    });
  }
  const t0 = Date.now();
  console.log("lettersapi: start", req.method, String(req.url).slice(0, 120), "build", BUILD);
  const timer = setTimeout(() => {
    console.error("lettersapi: request exceeded", REQUEST_LIMIT_MS, "ms:", req.method, req.url);
    sendJson(res, 504, { success: false, message: "The letters server took too long to answer. Please try again." });
  }, REQUEST_LIMIT_MS);
  try {
    await handle(req, res);
  } finally {
    clearTimeout(timer);
    console.log("lettersapi: done in", Date.now() - t0, "ms");
  }
};

module.exports._test = { safeFileName, decodeDocx, cleanTemplate, stamp, toBuffer, bucketNameFor };