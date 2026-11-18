"use strict";

/* ---------------------------------------------------------------------
   lettersapi - Letters screen (HR Operations > Operation > Letters)

   This first version stores the TEMPLATES, including the original Word
   (.docx) file HR imported. Letters, rules and fields are not stored here yet.

   GET  /?view=templates          -> { success, data:{ templates:[...] } }
                                     every template, newest published version, with
                                     its content (html, body, signatory block)
   GET  /?view=docx&id=T1&ver=2   -> the stored .docx file itself (ver optional =
                                     latest). Binary download.
   POST /  { action:"saveTemplate", template:{...}, baseVer, note, docx? }
                                  -> publishes a NEW VERSION of one template
                                     (creates the template the first time)
   POST /  { action:"setActive", id, active }
                                  -> turns a template Active / Inactive

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
     Data Store (looked up by NAME)
        Letter_Templates          tpl_id, name, family, location, bucket,
                                  tpl_version, active, docx_file, docx_key,
                                  config_key, updated_by, updated_on
        Letter_Template_Versions  tpl_id, tpl_version, bucket, docx_file,
                                  docx_key, config_key, published_by,
                                  published_on, note
     Location_Master (read only) gives the allowed locations and their codes.
   A template belongs to exactly one location for its whole life, so a
   location's letters can only ever come from that location's bucket.

   Access: reading needs View, saving needs Edit on the HR Operations screens
   (employeeMaster), the same as every other HR Operations function.
   --------------------------------------------------------------------- */

const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

const TBL = {
  templates: "Letter_Templates",
  versions: "Letter_Template_Versions",
  locations: "Location_Master",
  cycles: "Appraisal_Cycle_Master",
  sheet: "Appraisal_Sheet",
  employees: "Employee_Master",
};
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
async function readAll(app, table, where = "", cols = "*") {
  const zcql = app.zcql();
  const rows = [];
  let last = "0";
  for (let guard = 0; guard < 500; guard += 1) {
    const q =
      `SELECT ${cols} FROM ${table} WHERE ROWID > ${last}` +
      (where ? ` AND ${where}` : "") +
      " ORDER BY ROWID ASC LIMIT 300";
    // a "too many requests" answer waits briefly and retries instead of failing the read
    const result = await (typeof access.whenNotBusy === "function" ? access.whenNotBusy(() => zcql.executeZCQLQuery(q)) : zcql.executeZCQLQuery(q));
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
    return await bucketOf(app, bucketName).putObject(key, body, { overwrite: "true", contentType });
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
  return toBuffer(await bucketOf(app, bucketName).getObject(key));
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

/* ---------- reading ---------- */
function indexOf(rows, key) {
  const m = new Map();
  rows.forEach((r) => m.set(text(r[key]), r));
  return m;
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

const isAllLoc = (v) => ["", "all", "all locations", "alllocations"].includes(text(v).toLowerCase());

// `location` (optional): only the templates stored for that location. Each
// location has its own bucket, so only that bucket is read.
async function loadTemplates(app, location) {
  const onlyLoc = isAllLoc(location) ? "" : text(location).toLowerCase();
  const [allRows, vers] = await Promise.all([readAll(app, TBL.templates), readAll(app, TBL.versions)]);
  const rows = onlyLoc ? allRows.filter((r) => text(r.location).toLowerCase() === onlyLoc) : allRows;
  const templates = [];
  const problems = [];
  // Read the config files two at a time (this project's Catalyst concurrency limit).
  for (let i = 0; i < rows.length; i += 2) {
    const part = await Promise.all(
      rows.slice(i, i + 2).map(async (row) => {
        const cfg = await readConfig(app, text(row.bucket), text(row.config_key));
        if (!cfg) {
          problems.push({ id: text(row.tpl_id), location: text(row.location), message: `"${text(row.name)}" (${text(row.location)}) could not be read from bucket "${text(row.bucket)}".` });
          return null;
        }
        const history = vers
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

async function sendDocx(app, res, id, ver) {
  if (!ID_RE.test(id)) throw fail(400, "The template id is not valid.");
  const rows = await readAll(app, TBL.templates, `tpl_id = '${id}'`);
  if (!rows.length) throw fail(404, "Template not found.");
  let key = text(rows[0].docx_key);
  let file = text(rows[0].docx_file);
  let bucketName = text(rows[0].bucket);
  if (ver) {
    const vers = await readAll(app, TBL.versions, `tpl_id = '${id}'`);
    const v = vers.find((x) => Number(x.tpl_version) === Number(ver));
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
  const rows = await readAll(app, TBL.templates, `tpl_id = '${tpl.id}'`);
  const current = rows[0] || null;
  const currentVer = current ? Number(current.tpl_version) || 0 : 0;
  if (current && text(current.location).toLowerCase() !== loc.name.toLowerCase()) {
    throw fail(400, `This template belongs to ${text(current.location)} and cannot be moved to ${loc.name}. Clone it and choose the other location.`);
  }

  // One template per name and location: "Hike Letter" can exist once for each location.
  const everyone = await readAll(app, TBL.templates);
  const dup = everyone.find(
    (r) => text(r.tpl_id) !== tpl.id && text(r.name).toLowerCase() === tpl.name.toLowerCase() && text(r.location).toLowerCase() === tpl.location.toLowerCase(),
  );
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
  const ds = app.datastore();
  const row = {
    tpl_id: tpl.id,
    name: tpl.name,
    family: tpl.family,
    location: clip(tpl.location, 100),
    bucket: clip(loc.bucket, 100),
    tpl_version: ver,
    docx_file: clip(docxFile, 150),
    docx_key: clip(docxKey, 250),
    config_key: clip(configKey, 250),
    updated_by: clip(actor, 150),
    updated_on: on,
  };
  if (current) {
    await ds.table(TBL.templates).updateRow({ ROWID: rowId(current), ...row });
  } else {
    // A template is Active from its first publish.
    await ds.table(TBL.templates).insertRow({ ...row, active: true });
  }
  await ds.table(TBL.versions).insertRow({
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

  const { templates } = await loadTemplates(app);
  return templates.find((t) => t.id === tpl.id);
}

async function setActive(app, payload) {
  const id = text(payload.id);
  if (!ID_RE.test(id)) throw fail(400, "The template id is not valid.");
  const rows = await readAll(app, TBL.templates, `tpl_id = '${id}'`);
  if (!rows.length) throw fail(404, "This template has not been saved to the server yet. Publish it once first.");
  await app.datastore().table(TBL.templates).updateRow({ ROWID: rowId(rows[0]), active: !!payload.active });
  return { id, active: !!payload.active };
}

/* ---------- Appraisal Sheet -> the rows the Letters engine works on ----------
   GET /?view=sheet&cycleId=<Appraisal_Cycle_Master ROWID>[&location=<name>]
   Reads the REAL Appraisal Sheet rows of one cycle and joins Employee Master
   (location, manager, department, date of joining, grade). Only employees of
   the cycle's location come back (the cycle is per location). Nothing here is
   sample data. */
const pick1 = (r, keys) => {
  for (const k of keys) {
    const v = r && r[k];
    if (v !== undefined && v !== null && text(typeof v === "object" ? "" : v) !== "") return text(v);
  }
  return "";
};
const lookupText = (v) => {
  if (v == null) return "";
  if (typeof v === "object") return lookupText(v.ROWID ?? v.rowid ?? v.emp_id ?? v.id ?? v.value ?? v.name ?? "");
  return text(v);
};
const amt = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
// "May-26", "May 2026", "2026-05", "2026-05-01", "01-May-2026" -> { m: 0-11, y: 2026 } or null
function parseMonth(v) {
  const t = text(v);
  if (!t) return null;
  let m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?/.exec(t);
  if (m) return { m: Number(m[2]) - 1, y: Number(m[1]) };
  m = /([A-Za-z]{3})[A-Za-z]*[\s\-\/,]*(?:\d{1,2}[\s\-\/,]+)?(\d{2,4})/.exec(t);
  if (m && MONTHS.includes(m[1].toLowerCase())) {
    const y = Number(m[2]);
    return { m: MONTHS.indexOf(m[1].toLowerCase()), y: y < 100 ? 2000 + y : y };
  }
  m = /(\d{1,2})[\-\/](\d{1,2})[\-\/](\d{4})/.exec(t);
  if (m) return { m: Number(m[2]) - 1, y: Number(m[3]) };
  return null;
}
const monthLabel = (d) => `${MONTHS[d.m][0].toUpperCase()}${MONTHS[d.m].slice(1)}-${String(d.y).slice(-2)}`;
function addMonths(d, n) {
  const idx = d.y * 12 + d.m + n;
  return { y: Math.floor(idx / 12), m: idx % 12 };
}
// "2026-04-01" / "01-Apr-2026" -> "01-Apr-2026"
function fmtDate(v) {
  const t = text(v);
  if (!t) return "";
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return `${iso[3]}-${MON[Number(iso[2]) - 1]}-${iso[1]}`;
  const d = new Date(t);
  if (!Number.isNaN(d.getTime())) return `${String(d.getDate()).padStart(2, "0")}-${MON[d.getMonth()]}-${d.getFullYear()}`;
  return t;
}
// PB paid in N instalments, N evenly spread across a year, from the first pay month.
function pbSchedule(total, count, firstMonth) {
  const start = parseMonth(firstMonth);
  const n = Math.max(1, Math.min(12, Math.round(Number(count) || 1)));
  if (!(total > 0) || !start) return [];
  const step = Math.max(1, Math.floor(12 / n));
  const each = Math.round((total / n) * 100) / 100;
  return Array.from({ length: n }, (_x, i) => [monthLabel(addMonths(start, i * step)), each]);
}
// A sheet row can name its cycle in several columns (Generate stores the cycle ROWID
// in the appraisal_cycle_name lookup). Every reference counts, not only the first.
const cycleRefsOf = (r) =>
  [
    r.cycle_id, r.appraisal_cycle_id, r.appraisalCycleId, r.cycleId,
    r.appraisal_cycle_name, r.appraisalCycleName, r.cycle_name, r.appraisal_cycle, r.appraisal_year,
  ]
    .map(lookupText)
    .filter(Boolean);

// Only the Appraisal_Sheet columns the letters use. Every name below is a real column (see
// FIELD_COLUMNS in accessCore.js); if the table ever lacks one, the read repeats with every column.
const SHEET_COLS = [
  "ROWID", "emp_id", "appraisal_cycle_name", "appraiser_tech_ed", "current_annual_base_pay", "hike_amount", "hike_pct",
  "new_pb_to_be_offered", "new_rb", "target_pb_next_year", "new_pb_installment", "pb_installment", "month_pb", "month_rb",
  "eligible_for_promotion", "new_title", "designation", "manager_rating", "comp_manager_remarks",
].join(",");
let sheetColsBroken = false;

// This cycle's rows only (the table holds every cycle and every location). Generate stores the
// cycle ROWID in appraisal_cycle_name; the other cycle columns are tried only if that finds nothing.
async function readSheetRows(app, cycleId) {
  for (const col of ["appraisal_cycle_name", "appraisal_cycle_id", "cycle_id"]) {
    try {
      let got;
      if (col === "appraisal_cycle_name" && !sheetColsBroken) {
        try {
          got = await readAll(app, TBL.sheet, `${col} = ${cycleId}`, SHEET_COLS);
        } catch (e) {
          sheetColsBroken = true;
          got = await readAll(app, TBL.sheet, `${col} = ${cycleId}`);
        }
      } else {
        got = await readAll(app, TBL.sheet, `${col} = ${cycleId}`);
      }
      if (got.length) return { rows: got, column: col };
    } catch (e) {
      /* this column does not exist in this table: try the next one */
    }
  }
  return { rows: [], column: "" };
}

// Employee Master rows of ONE location (a single filtered query, one page for a few hundred people).
// null when the column cannot be filtered, so the caller falls back to the people on the sheet.
async function readEmployeesAt(app, location) {
  try {
    return await readAll(app, TBL.employees, `location = '${String(location).replace(/'/g, "''")}'`);
  } catch (e) {
    return null;
  }
}

// Employee Master rows by ROWID / employee id, in small IN (...) chunks, two at a time.
async function readEmployeesByIds(app, numericIds, textIds, guard) {
  const chunk = (set, n) => {
    const all = [...set];
    const out = [];
    for (let i = 0; i < all.length; i += n) out.push(all.slice(i, i + n));
    return out;
  };
  const queries = [
    ...chunk(numericIds, 100).map((c) => `ROWID IN (${c.join(",")})`),
    ...chunk(textIds, 50).map((c) => `emp_id IN (${c.map((x) => `'${x.replace(/'/g, "''")}'`).join(",")})`),
  ];
  const out = [];
  for (let i = 0; i < queries.length; i += 2) {
    const parts = await Promise.all(queries.slice(i, i + 2).map((w) => readAll(app, TBL.employees, w)));
    parts.forEach((p) => out.push(...p));
    if (guard) guard("Employee Master");
  }
  return out;
}

async function loadSheet(app, cycleId, requestedLocation) {
  const t0 = Date.now();
  if (!/^\d{5,25}$/.test(cycleId)) throw fail(400, "Choose an Appraisal Cycle first.");
  const askedLoc = isAllLoc(requestedLocation) ? "" : text(requestedLocation);
  const timings = {};
  const BUDGET_MS = 24000;
  const guard = (step) => {
    if (Date.now() - t0 > BUDGET_MS) {
      throw fail(504, `Reading the Appraisal Sheet was too slow at "${step}" (${Date.now() - t0} ms in). Please try again.`);
    }
  };

  // FAST PATH. Nothing here reads a whole table. The cycle row, this cycle's sheet rows and (when the
  // screen names the location) that location's employees are asked for TOGETHER, so the wait is the
  // slowest one of them, not their sum.
  let lap = Date.now();
  const [cycleRows, sheet, employeesAtAsked] = await Promise.all([
    readAll(app, TBL.cycles, `ROWID = ${cycleId}`),
    readSheetRows(app, cycleId),
    askedLoc ? readEmployeesAt(app, askedLoc) : Promise.resolve(null),
  ]);
  timings.firstReadsMs = Date.now() - lap;
  guard("first reads");
  const cycle = cycleRows[0];
  if (!cycle) throw fail(404, "This Appraisal Cycle was not found.");
  const cycleName = pick1(cycle, ["cycle_name", "name"]);
  const cycleLocation = pick1(cycle, ["location", "cycle_location", "location_name"]);
  const wanted = askedLoc || cycleLocation;
  const typeText = pick1(cycle, ["cycle_type", "type"]) || cycleName;
  const type = /exceptional/i.test(typeText) ? "Exceptional" : "Annual";
  const effective = fmtDate(pick1(cycle, ["effective_date", "start_date"]));
  const sheetRows = sheet.rows;
  const sheetColumn = sheet.column;

  lap = Date.now();
  let emRows = employeesAtAsked;
  if (!emRows && wanted && !isAllLoc(wanted)) emRows = await readEmployeesAt(app, wanted); // location taken from the cycle
  const lookupIds = (from) => {
    const numeric = new Set();
    const texts = new Set();
    from.forEach((v) => {
      const k = lookupText(v);
      if (k) (/^\d{5,25}$/.test(k) ? numeric : texts).add(k);
    });
    return { numeric, texts };
  };
  if (emRows && emRows.length) {
    // The location's people are in hand. Only a Tech-ED who works in another location can still be missing (name only).
    const haveRow = new Set(emRows.map(rowId));
    const haveId = new Set(emRows.map((r) => text(r.emp_id).toLowerCase()));
    const missing = lookupIds(sheetRows.map((r) => r.appraiser_tech_ed));
    [...missing.numeric].forEach((k) => haveRow.has(k) && missing.numeric.delete(k));
    [...missing.texts].forEach((k) => haveId.has(k.toLowerCase()) && missing.texts.delete(k));
    if (missing.numeric.size || missing.texts.size) {
      emRows = emRows.concat(await readEmployeesByIds(app, missing.numeric, missing.texts, guard));
    }
  } else {
    // No location filter available: read just the people named on the sheet rows.
    const ids = lookupIds(sheetRows.flatMap((r) => [r.emp_id, r.appraiser_tech_ed]));
    emRows = await readEmployeesByIds(app, ids.numeric, ids.texts, guard);
  }
  timings.employeesMs = Date.now() - lap;
  guard("Employee Master");

  const byId = new Map();
  const byRowId = new Map();
  emRows.forEach((r) => {
    const id = text(r.emp_id);
    if (id) byId.set(id.toLowerCase(), r);
    if (rowId(r)) byRowId.set(rowId(r), r);
  });
  const emOf = (v) => {
    const k = lookupText(v);
    return byId.get(k.toLowerCase()) || byRowId.get(k) || null;
  };

  const rows = [];
  let withoutEmployee = 0;
  let otherLocation = 0;
  let inCycle = 0;
  sheetRows
    .filter((r) => {
      const refs = cycleRefsOf(r);
      return refs.some((x) => x === cycleId || (cycleName && x.toLowerCase() === cycleName.toLowerCase()));
    })
    .forEach((r) => {
      inCycle += 1;
      const em = emOf(r.emp_id);
      if (!em) {
        withoutEmployee += 1;
        return;
      }
      const location = pick1(em, ["location", "location_name", "work_location"]);
      if (!isAllLoc(wanted) && location.toLowerCase() !== wanted.toLowerCase()) {
        otherLocation += 1;
        return;
      }
      const empId = text(em.emp_id);
      const basePay = amt(r.current_annual_base_pay ?? em.current_salary);
      const hikeAmt = amt(r.hike_amount);
      const hikePct = amt(r.hike_pct) || (basePay > 0 ? Math.round((hikeAmt / basePay) * 10000) / 100 : 0);
      const newPB = amt(r.new_pb_to_be_offered);
      const newRB = amt(r.new_rb);
      const tpbNext = amt(r.target_pb_next_year);
      const instalments = amt(r.new_pb_installment) || amt(r.pb_installment) || (newPB > 0 ? 1 : 0);
      const monthPB = pick1(r, ["month_pb"]);
      const monthRB = pick1(r, ["month_rb"]);
      rows.push({
        id: empId,
        name: pick1(em, ["emp_name", "name"]) || empId,
        tech: lookupText(emOf(r.appraiser_tech_ed)?.emp_name) || pick1(r, ["appraiser_tech_ed"]) || pick1(em, ["appraiser_tech_ed"]),
        org: pick1(em, ["organization", "org", "entity", "company"]),
        cycle: cycleId,
        status: pick1(em, ["emp_status"]) || "Active",
        email: pick1(em, ["email_id", "email"]).toLowerCase(),
        v: {
          promo: /^(yes|true|1|y)$/i.test(text(r.eligible_for_promotion)) ? "Yes" : "No",
          basePay,
          newBase: basePay + hikeAmt,
          hikeAmt,
          hikePct,
          newPB,
          newRB,
          tpbNext,
          newTitle: pick1(r, ["new_title"]),
          designation: pick1(r, ["designation"]) || pick1(em, ["designation"]),
          effDate: effective,
          pbInst: instalments > 0 ? `${instalments} instalment${instalments > 1 ? "s" : ""}` : "",
          band: pick1(em, ["band", "grade"]),
          rating: pick1(r, ["manager_rating"]),
          compRemarks: pick1(r, ["comp_manager_remarks"]),
          pbMonths: pbSchedule(newPB, instalments, monthPB),
          rbMonth: newRB > 0 ? (parseMonth(monthRB) ? monthLabel(parseMonth(monthRB)) : monthRB) : "",
          tpbMonth: "",
          emLocation: location,
          emDoj: fmtDate(pick1(em, ["date_of_joining", "doj", "joining_date"])),
          emGrade: pick1(em, ["grade", "band"]),
          emManager: pick1(em, ["reporting_manager", "manager_name", "reporting_manager_name"]),
          emDept: pick1(em, ["department"]),
        },
      });
    });

  console.log(`lettersapi sheet: cycle ${cycleId} (${cycleLocation || "all"}) ${rows.length} letters rows from ${sheetRows.length} sheet rows via ${sheetColumn || "no column"}; ${JSON.stringify(timings)}; total ${Date.now() - t0} ms`);
  return {
    cycle: { id: cycleId, name: cycleName, type, location: cycleLocation, effective },
    rows,
    skipped: { withoutEmployee, otherLocation, inCycle, sheetRows: sheetRows.length },
    timings: { ...timings, totalMs: Date.now() - t0, sheetColumn, employeesRead: emRows.length },
  };
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

module.exports = async function lettersApi(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return sendJson(res, 405, { success: false, message: "Method not allowed." });
    }
    const { adminApp, actor } = await authorize(req, req.method === "GET" ? "view" : "edit");

    if (req.method === "GET") {
      const q = new URL(req.url, "https://x").searchParams;
      const view = q.get("view") || "templates";
      if (view === "docx") return await sendDocx(adminApp, res, text(q.get("id")), q.get("ver"));
      if (view === "templates") {
        return sendJson(res, 200, { success: true, data: await loadTemplates(adminApp, q.get("location")) });
      }
      if (view === "sheet") {
        return sendJson(res, 200, { success: true, data: await loadSheet(adminApp, text(q.get("cycleId")), q.get("location")) });
      }
      throw fail(400, "Unknown view.");
    }

    const payload = await readBody(req);
    if (payload.action === "saveTemplate") {
      return sendJson(res, 200, { success: true, data: await saveTemplate(adminApp, actor, payload) });
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

module.exports._test = { safeFileName, decodeDocx, cleanTemplate, stamp, toBuffer, bucketNameFor, parseMonth, pbSchedule, fmtDate, loadSheet };
