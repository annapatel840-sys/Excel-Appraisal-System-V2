"use strict";

/* ---------------------------------------------------------------------
   designationmasterapi - Designation Master (HR Operations > Masters)

   Every GET takes an optional ?location=<name or code> (the system location
   selected in the top bar). Designations are shown per location: each Designation
   row has a `location` (Location Master) and only the rows of the selected
   location are shown. The location's own Active cycle is used (a cycle named
   "Dubai - Annual 2027" belongs to Dubai; a cycle with no location is org-wide;
   a location with no cycle of its own falls back to the org-wide one). The sync
   from Employee_Master creates a row per (location, designation) and fills the
   location of older rows that have none. HR picks the location (a Location Master
   dropdown) when adding a designation.
   POST uses the cycleId the screen was loaded with, so a save always lands in the
   cycle (location) that was on screen.

   GET  /                  -> { success, data }  current-cycle designations, groups,
                              options, audit. Every GET first syncs Employee_Master:
                              a designation that is not in the Designation table yet
                              gets a new row (cycle_id, name, department; Inactive,
                              no next type) so HR can map it.
   GET  /?view=appraisal   -> { success, data }  read-only "new title" rules for the
                              Appraisal Sheet (one entry per designation: mapped or
                              not, and the options its New title dropdown must show).
                              Needs view access on appraisalSheet / detailScreen /
                              employeeMaster, not HR-only.
   GET  /?view=summary     -> { success, data }  { designations, active, notMapped } for the
                              HR dashboard "Designations not mapped" tile (HR only)
   POST /                  -> { success, data }  saves the whole screen (HR only)

   Catalyst tables (looked up by NAME, so no table IDs to paste):
     Designation               cycle_id, name, department, location, band, next_type,
                               single_next_designation, group_id, status
                               (group_id = foreign key to Designation_Groups,
                                location = foreign key to Location_Master)
     Designation_Next          designation_id, next_id    (the "Multiple" list)
     Designation_Groups        cycle_id, group_name
     Designation_Group_Members group_id, des_id
     Designation_Config        type, status               (the 4 switches)
   plus: Appraisal_Cycle_Master, Employee_Master, Appraisal_Audit (existing).
   --------------------------------------------------------------------- */

const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

// The Designations table is called "Designations" in some environments and
// "Designation" in others; the first one that exists is used (resolved once).
const DESIGNATION_TABLE_NAMES = ["Designations", "Designation"];
const TBL = {
  designations: "Designations",
  next: "Designation_Next",
  groups: "Designation_Groups",
  members: "Designation_Group_Members",
  config: "Designation_Config",
  cycles: "Appraisal_Cycle_Master",
  employees: "Employee_Master",
  audit: "Appraisal_Audit",
  locations: "Location_Master",
};

const SOURCE = "Designation Master";
const TYPES = ["S", "M", "G", "F"];
const TYPE_LABEL = {
  S: "Single designation",
  M: "Multiple designations",
  G: "Group",
  F: "Free select",
};
// Band Master is not a Catalyst table yet. Replace this list with a read of
// Band Master when it exists (spec: band must be a Band Master code).
const BANDS = ["B1", "B2", "B3", "B4", "B5", "B6", "B7"];
const SCREEN_KEY = "employeeMaster"; // HR Operations screens are HR-only
const BATCH = 200;

// Bound this function's catalogue and roster reads within a warm instance.
// Page-load fan-out was triggering Catalyst's shared COMPONENT concurrency cap,
// so reads were fully serialized; two at a time keeps below that cap (the same
// bound the other functions use) while letting independent reads overlap.
const ZCQL_CONCURRENCY = 2;
let zcqlActive = 0;
const zcqlWaiters = [];
async function acquireZcql() {
  if (zcqlActive < ZCQL_CONCURRENCY) {
    zcqlActive += 1;
    return;
  }
  // A queued caller inherits the slot released by the previous query.
  await new Promise((resolve) => zcqlWaiters.push(resolve));
}
function releaseZcql() {
  const next = zcqlWaiters.shift();
  if (next) next();
  else zcqlActive = Math.max(0, zcqlActive - 1);
}
function isTransientCatalystError(error) {
  const status = Number(error && (error.statusCode || error.status || error.status_code));
  const code = String(error && error.code || "").toUpperCase();
  const message = String(error && error.message || "").toLowerCase();
  return [408, 429, 500, 502, 503, 504].includes(status) ||
    ["TOO_MANY_REQUESTS", "COMPONENT", "ETIMEDOUT", "ECONNRESET"].includes(code) ||
    /concurrency limit|too many requests|temporarily unavailable|timed out/.test(message);
}
async function runZcql(zcql, query, label = "designationmasterapi query") {
  await acquireZcql();
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await zcql.executeZCQLQuery(query);
      } catch (error) {
        if (!isTransientCatalystError(error) || attempt >= 4) throw error;
        const delay = 400 * (2 ** attempt) + Math.floor(Math.random() * 250);
        console.warn("Retrying designation ZCQL read:", label, "attempt", attempt + 1);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  } finally {
    releaseZcql();
  }
}

/* ---------- small helpers ---------- */
function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}
const text = (v) => String(v ?? "").trim();
const lower = (v) => text(v).toLowerCase();
const clip = (v, n = 250) => String(v ?? "").slice(0, n);
const rowId = (r) => String((r && (r.ROWID ?? r.rowid)) ?? "");
function refId(v) {
  if (v && typeof v === "object") return String(v.ROWID ?? v.rowid ?? v.id ?? "");
  return String(v ?? "");
}
function isOn(v) {
  return v === true || v === 1 || ["1", "true", "active", "yes"].includes(lower(v));
}
function fail(status, message) {
  return new access.HttpError(status, message);
}
function chunks(list, size = BATCH) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}
const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ZCQL read (the Data Store getPagedRows call hangs on Advanced I/O functions,
   which is why every other function in this project reads through ZCQL). */
async function readAll(app, table, where = "", cols = "*") {
  const zcql = app.zcql();
  const rows = [];
  let last = "0";
  for (let guard = 0; guard < 5000; guard += 1) {
    const q =
      `SELECT ${cols} FROM ${table} WHERE ROWID > ${last}` +
      (where ? ` AND ${where}` : "") +
      " ORDER BY ROWID ASC LIMIT 300";
    const result = await runZcql(zcql, q, table);
    const page = (result || []).map((i) => (i && (i[table] || Object.values(i)[0])) || {});
    rows.push(...page);
    if (page.length < 300) break;
    last = rowId(page[page.length - 1]);
    if (!last) break;
  }
  return rows;
}

/* Rows of one cycle only. The filter runs inside ZCQL so the function never
   downloads other cycles; if ZCQL rejects the filter we fall back to a full
   read and filter here. */
async function readCycle(app, table, cycleId, cycleCol = "cycle_id") {
  try {
    return await readAll(app, table, `${cycleCol} = ${cycleId}`);
  } catch (e) {
    if (isTransientCatalystError(e)) throw e;
    const all = await readAll(app, table);
    return all.filter((r) => refId(r[cycleCol]) === String(cycleId));
  }
}

/* Newest rows first, capped (the audit table is shared by every screen and
   grows without limit, so it is never read in full). */
async function readRecent(app, table, where, max = 1000) {
  const zcql = app.zcql();
  const readPage = async (off) => {
    const q =
      `SELECT * FROM ${table}` +
      (where ? ` WHERE ${where}` : "") +
      ` ORDER BY ROWID DESC LIMIT ${off}, 300`;
    const result = await runZcql(zcql, q, table);
    return (result || []).map((i) => (i && (i[table] || Object.values(i)[0])) || {});
  };
  // The first page decides whether more exist; the rest are independent
  // offsets, so they are read together instead of one after another.
  const first = await readPage(0);
  if (first.length < 300 || max <= 300) return first.slice(0, max);
  const offsets = [];
  for (let off = 300; off < max; off += 300) offsets.push(off);
  const rest = await Promise.all(offsets.map(readPage));
  return [first, ...rest].flat().slice(0, max);
}

/* Distinct designation + department + location triples from Employee_Master.
   DISTINCT keeps this to a handful of small queries instead of reading every
   employee row. All locations are read; the cycle's location filters them in
   code (see pairsForCycle), so no location text is ever put into a query. */
async function readMasterPairs(app) {
  const zcql = app.zcql();
  const out = [];
  try {
    for (let off = 0; off < 6000; off += 300) {
      const result = await runZcql(
        zcql,
        `SELECT DISTINCT designation, department, location FROM ${TBL.employees} ` +
          `ORDER BY designation ASC LIMIT ${off}, 300`,
        "Employee_Master designation pairs",
      );
      const page = (result || []).map(
        (i) => (i && (i[TBL.employees] || Object.values(i)[0])) || {},
      );
      out.push(...page);
      if (page.length < 300) break;
    }
    return out;
  } catch (e) {
    if (isTransientCatalystError(e)) throw e;
    console.error("designationmasterapi: DISTINCT read failed, scanning:", e.message);
    return readAll(app, TBL.employees, "", "ROWID, designation, department, location");
  }
}

/* ---------- locations ---------- */
const ALL_LOCATION_WORDS = ["", "all", "all locations", "alllocations"];
const isAllLocation = (v) => ALL_LOCATION_WORDS.includes(lower(v));

/* Location Master rows, best effort: if the table cannot be read the raw value
   is still compared, so the screen keeps working. */
// async function readLocations(app) {
//   try {
//     return await readAll(app, TBL.locations);
//   } catch (e) {
//     if (isTransientCatalystError(e)) throw e;
//     console.warn("designationmasterapi: Location Master not read:", e.message);
//     return [];
//   }
// }
async function readLocations(app) {
  try {
    const rows = await readAll(app, TBL.locations);

    console.log(
      "Designation Master - Location Master records:",
      rows.length
    );

    return rows;
  } catch (e) {
    console.error(
      "Designation Master - Location Master read failed:",
      e.message
    );

    throw e;
  }
}

/* Every spelling (name and code) that identifies one location. */
function locationAliases(value, locations) {
  const key = lower(value);
  if (!key) return new Set();
  const hit = (locations || []).find(
    (l) => lower(l.location_name ?? l.name) === key || lower(l.location_code ?? l.code) === key,
  );
  return new Set(
    [key, lower(hit && (hit.location_name ?? hit.name)), lower(hit && (hit.location_code ?? hit.code))]
      .filter(Boolean),
  );
}

/* The Location Master row for a name, code or ROWID (null when unknown). */
function findLocation(value, locations) {
  const key = lower(value);
  if (!key) return null;
  return (
    (locations || []).find(
      (l) =>
        lower(l.location_name ?? l.name) === key ||
        lower(l.location_code ?? l.code) === key ||
        rowId(l) === text(value),
    ) || null
  );
}
const locationNameOf = (l) => text(l && (l.location_name ?? l.name));

/* A cycle's own location ("" = org-wide). The Appraisal_Cycle_Master `location`
   column is optional, so a "<Location> - <Type> <Year>" cycle name also counts. */
const CYCLE_TYPE_START = /^(annual|mid-year|exceptional|new joiner)\b/i;
function cycleLocationOf(row) {
  const own = text(row && (row.location ?? row.cycle_location ?? row.cycleLocation));
  if (own) return isAllLocation(own) ? "" : own;
  const name = text(row && row.cycle_name);
  const m = name.match(/^(.+?)\s+-\s+(.+)$/);
  return m && CYCLE_TYPE_START.test(m[2]) ? text(m[1]) : "";
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (c) => {
      body += c.toString();
      if (body.length > 5_000_000) {
        reject(fail(413, "Request body exceeds 5 MB."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body.trim() ? JSON.parse(body) : {});
      } catch {
        reject(fail(400, "Invalid JSON request body."));
      }
    });
    req.on("error", reject);
  });
}

/* ---------- access ---------- */
// Screens whose users may read the read-only "new title" rules. Writes and the
// full Designation Master read stay HR-only (employeeMaster).
const RULE_SCREENS = ["appraisalSheet", "detailScreen", "employeeMaster"];

function requireAnyScreen(a, keys, level) {
  const ok = keys.some((key) => {
    try {
      access.requireScreen(a, key, level);
      return true;
    } catch (e) {
      if (e instanceof access.HttpError) return false;
      throw e;
    }
  });
  if (!ok) throw fail(403, "You do not have access to this screen.");
}

async function authorize(req, method, rulesOnly = false) {
  const userApp = catalyst.initialize(req);
  const adminApp = catalyst.initialize(req, { scope: "admin" });
  const a = await access.check(userApp, adminApp);
  access.guard(a, () => {
    if (method === "GET" && rulesOnly) return requireAnyScreen(a, RULE_SCREENS, "view");
    return access.requireScreen(a, SCREEN_KEY, method === "GET" ? "view" : "edit");
  });
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

/* ---------- cycle ---------- */
/* The Active cycle for one location. There is one Active cycle per location, so
   designations follow the location through its cycle:
     cycleId given  -> exactly that cycle, if it is still Active (saves)
     a location     -> that location's own cycle, else the org-wide cycle
     no location    -> the org-wide cycle, else the first Active cycle
   Returns { id, name, location } where location "" means org-wide. */
async function getActiveCycle(app, { location = "", cycleId = "" } = {}) {
  const rows = await readAll(app, TBL.cycles);
  const active = rows.filter(
    (r) => lower(r.status) === "active" && !isOn(r.archived) && !isOn(r.hidden),
  );
  const locations = await readLocations(app);
  // location = the location on screen (the requested one, else the cycle's own),
  // written as its Location Master name when that is known.
  const shape = (r, requested = "") => {
    const loc = !isAllLocation(requested) ? text(requested) : cycleLocationOf(r);
    const hit = findLocation(loc, locations);
    return { id: rowId(r), name: text(r.cycle_name), location: hit ? locationNameOf(hit) : loc };
  };

  if (text(cycleId)) {
    const row = active.find((r) => rowId(r) === text(cycleId));
    if (!row) {
      throw fail(409, "The appraisal cycle changed. Refresh Designation Master before saving.");
    }
    return shape(row, location);
  }

  if (!isAllLocation(location)) {
    const wanted = locationAliases(location, locations);
    // The cycle may store the code while the screen sends the name (or the reverse),
    // so the two are compared by every spelling Location Master knows.
    const own = active.find((r) => {
      const loc = cycleLocationOf(r);
      return loc && [...locationAliases(loc, locations)].some((a) => wanted.has(a));
    });
    const row = own || active.find((r) => !cycleLocationOf(r));
    if (!row) throw fail(409, `No active appraisal cycle was found for ${text(location)}.`);
    return shape(row, location);
  }

  const row = active.find((r) => !cycleLocationOf(r)) || active[0];
  if (!row) throw fail(409, "No active appraisal cycle was found.");
  return shape(row);
}

/* Which Designation rows are shown for the location on screen.
   A row belongs to its own `location` (Location Master). A row saved before that
   column existed has none: it is shown for the location when employees of that
   location hold the designation, or HR added it by hand (no department yet).
   idOf() is the location a shown row counts as. No location on screen = all rows. */
function locationScope(cycle, locations, masterNames) {
  const viewIds = new Set();
  if (cycle.location) {
    const hit = findLocation(cycle.location, locations);
    if (hit) viewIds.add(rowId(hit));
  }
  const defaultId = [...viewIds][0] || "";
  const visible = (r) => {
    if (!cycle.location) return true;
    const own = refId(r.location);
    if (own && viewIds.size) return viewIds.has(own);
    return masterNames.has(lower(r.name)) || !text(r.department);
  };
  const idOf = (r) => refId(r.location) || (cycle.location ? defaultId : "");
  return { visible, idOf };
}

/* The employees' designations that belong to a cycle: every employee for an
   org-wide cycle, otherwise only the cycle location's employees. */
async function pairsForCycle(app, cycle, locations) {
  const all = await readMasterPairs(app);
  if (!cycle.location) return all;
  const aliases = locationAliases(cycle.location, locations || (await readLocations(app)));
  return all.filter((r) => aliases.has(lower(r.location)));
}

/* ---------- load ---------- */
async function syncFromEmployeeMaster(app, cycle, locations) {
  const [desRows, empRows] = await Promise.all([
    readCycle(app, TBL.designations, cycle.id),
    pairsForCycle(app, cycle, locations),
  ]);
  const keyOf = (locId, name) => `${locId}|${lower(name)}`;
  // One designation per (location, name), as held by the location's employees.
  const pairs = new Map();
  const deptByName = new Map();
  empRows.forEach((r) => {
    const name = text(r.designation);
    if (!name) return;
    const hit = findLocation(r.location, locations);
    const locId = hit ? rowId(hit) : "";
    if (!pairs.has(keyOf(locId, name))) {
      pairs.set(keyOf(locId, name), { name, department: text(r.department), locId });
    }
    if (!deptByName.has(lower(name))) deptByName.set(lower(name), text(r.department));
  });
  const known = new Set();
  const legacy = new Map(); // rows saved before the location column existed
  desRows.forEach((r) => {
    const own = refId(r.location);
    if (own) known.add(keyOf(own, r.name));
    else if (!legacy.has(lower(r.name))) legacy.set(lower(r.name), r);
  });
  const toAdd = [];
  const backfill = [];
  pairs.forEach((p, key) => {
    if (known.has(key)) return;
    // An older row for this designation without a location takes this location.
    const old = legacy.get(lower(p.name));
    if (old && p.locId) {
      legacy.delete(lower(p.name));
      known.add(key);
      backfill.push({ ROWID: rowId(old), location: p.locId });
      return;
    }
    // Spec: new designations arrive with no next type and Status Inactive.
    const row = {
      cycle_id: cycle.id,
      name: clip(p.name),
      department: clip(p.department),
      band: "",
      next_type: "",
      status: true,
    };
    if (p.locId) row.location = p.locId;
    toAdd.push(row);
  });
  const table = app.datastore().table(TBL.designations);
  if (toAdd.length) {
    for (const part of chunks(toAdd)) await table.insertRows(part);
  }
  for (const part of chunks(backfill)) await table.updateRows(part);
  // A row created earlier without a department (e.g. added by hand) gets it
  // from Employee_Master the first time the designation is found there.
  const fill = desRows
    .filter((r) => !text(r.department) && deptByName.get(lower(r.name)))
    .map((r) => ({ ROWID: rowId(r), department: clip(deptByName.get(lower(r.name))) }));
  for (const part of chunks(fill)) await table.updateRows(part);
  // desRows/changed let loadData reuse this request's read of the cycle's
  // designations when the sync wrote nothing, instead of reading it again.
  return {
    names: new Set(deptByName.keys()),
    desRows,
    changed: toAdd.length > 0 || fill.length > 0 || backfill.length > 0,
  };
}

/* Checks every table this function needs and reports the REAL Catalyst error
   for each one that fails (missing table, missing column, wrong environment,
   no permission), instead of guessing. */
let designationsResolved = false;
async function resolveDesignationsTable(app) {
  if (designationsResolved) return;
  for (const name of DESIGNATION_TABLE_NAMES) {
    try {
      await runZcql(app.zcql(), `SELECT ROWID FROM ${name} LIMIT 1`, "designation table probe");
      TBL.designations = name;
      designationsResolved = true;
      return;
    } catch (e) {
      if (isTransientCatalystError(e)) throw e;
      /* try the next name */
    }
  }
}

let schemaOkUntil = 0;
async function checkSchema(app) {
  if (Date.now() < schemaOkUntil) return;
  await resolveDesignationsTable(app);
  const probes = [
    [TBL.designations, "ROWID, cycle_id, name, department, location, band, next_type, single_next_designation, group_id, status"],
    [TBL.next, "ROWID, designation_id, next_id"],
    [TBL.groups, "ROWID, cycle_id, group_name"],
    [TBL.members, "ROWID, group_id, des_id"],
    [TBL.config, "ROWID, type, status"],
    [TBL.cycles, "ROWID, cycle_name, status, archived"],
    [TBL.employees, "ROWID, designation, department, location"],
    [TBL.audit, "ROWID, emp_id, employee_name, field_name, old_value, new_value, changed_by, changed_at, source, batch_id, appraisal_year, details"],
  ];
  const problems = [];
  await Promise.all(
    probes.map(async ([table, cols]) => {
      try {
        await runZcql(app.zcql(), `SELECT ${cols} FROM ${table} LIMIT 1`, "schema probe " + table);
      } catch (e) {
        if (isTransientCatalystError(e)) throw e;
        problems.push(`${table}: ${clip((e && e.message) || e, 160)}`);
      }
    }),
  );
  if (!problems.length) schemaOkUntil = Date.now() + 5 * 60 * 1000;
  if (problems.length) {
    console.error("designationmasterapi schema check:", problems.join(" | "));
    throw fail(500, `Designation Master tables are not ready. ${problems.join(" | ")}`);
  }
}

async function loadData(app, cycle, { sync = true, withAudit = true } = {}) {
  await checkSchema(app);

  const locations = await readLocations(app);
  const synced = sync ? await syncFromEmployeeMaster(app, cycle, locations) : null;
  // Designations that employees of the cycle's location hold. Without a sync
  // (the reload after a save) they are read again, but only for a location
  // cycle: an org-wide cycle shows every designation and needs no filter.
  const masterNames = synced
    ? synced.names
    : cycle.location
      ? new Set((await pairsForCycle(app, cycle, locations)).map((r) => lower(r.designation)).filter(Boolean))
      : new Set();


  const [allDes, allGroups, memberRows, nextRows, cfgRows, auditRows] = await Promise.all([
    synced && !synced.changed
      ? Promise.resolve(synced.desRows)
      : readCycle(app, TBL.designations, cycle.id),
    readCycle(app, TBL.groups, cycle.id),
    readAll(app, TBL.members),
    readAll(app, TBL.next),
    readAll(app, TBL.config),
    withAudit ? readRecent(app, TBL.audit, `source = '${SOURCE}'`) : Promise.resolve([]),
  ]);

  // Only this location's designations: ones its employees hold, plus ones HR
  // added by hand (no department yet). Rows an earlier all-location sync put
  // into this cycle for other locations stay in the table but are not shown.
  // The location filter runs BEFORE the one-row-per-name guard (double sync), so
  // a hidden row can never hide a visible one of the same name.
  const scope = locationScope(cycle, locations, masterNames);
  const seenDes = new Set();
  const desRows = allDes.filter((r) => {
    if (!lower(r.name) || !scope.visible(r)) return false;
    const k = `${scope.idOf(r)}|${lower(r.name)}`;
    if (seenDes.has(k)) return false;
    seenDes.add(k);
    return true;
  });
  const locationList = locations
    .map((l) => ({ id: rowId(l), name: locationNameOf(l), code: text(l.location_code ?? l.code) }))
    .filter((l) => l.id && l.name)
    .sort((a, b) => a.name.localeCompare(b.name));
  const locNameById = new Map(locationList.map((l) => [l.id, l.name]));

  const desIds = new Set(desRows.map(rowId));

  const nextByDesignation = new Map();
  nextRows.forEach((n) => {
    const key = refId(n.designation_id);
    if (!nextByDesignation.has(key)) nextByDesignation.set(key, []);
    nextByDesignation.get(key).push(refId(n.next_id));
  });
  const membersByGroup = new Map();
  memberRows.forEach((m) => {
    const key = refId(m.group_id);
    if (!membersByGroup.has(key)) membersByGroup.set(key, []);
    membersByGroup.get(key).push(refId(m.des_id));
  });

  // A group that has members, none of them in this location, belongs to another
  // location's designations and is not shown here. Its row and members are left
  // alone, and so is any mapping that points at a designation of another location.
  const groupRows = allGroups.filter((g) => {
    const mine = membersByGroup.get(rowId(g)) || [];
    return !mine.length || mine.some((desId) => desIds.has(desId));
  });
  const groupIds = new Set(groupRows.map(rowId));

  const designations = desRows.map((r) => {
    const id = rowId(r);
    const single = refId(r.single_next_designation);
    const group = refId(r.group_id);
    return {
      id,
      name: text(r.name),
      department: text(r.department),
      locationId: scope.idOf(r),
      locationName: locNameById.get(scope.idOf(r)) || "",
      inMaster: masterNames.has(lower(r.name)) || !!text(r.department),
      band: text(r.band),
      nextType: text(r.next_type).toUpperCase(),
      singleNextId: desIds.has(single) ? single : "",
      multipleNextIds: (nextByDesignation.get(id) || []).filter((x) => desIds.has(x)),
      groupId: groupIds.has(group) ? group : "",
      status: isOn(r.status) ? "Active" : "Inactive",
    };
  });

  const groups = groupRows.map((r) => ({
    id: rowId(r),
    name: text(r.group_name),
    memberIds: (membersByGroup.get(rowId(r)) || []).filter((desId) => desIds.has(desId)),
  }));

  const options = { S: false, M: false, G: false, F: false };
  cfgRows.forEach((r) => {
    const t = text(r.type).toUpperCase();
    if (TYPES.includes(t)) options[t] = isOn(r.status);
  });
  if (!cfgRows.length) TYPES.forEach((t) => (options[t] = true));

  const audit = auditRows
    .map((r) => {
      let d = {};
      try {
        d = JSON.parse(r.details || "{}");
      } catch (e) {
        d = {};
      }
      return { r, d };
    })
    .filter(({ r, d }) =>
      d.cycleId ? String(d.cycleId) === cycle.id : text(r.appraisal_year) === cycle.name,
    )
    .sort(
      (a, b) =>
        String(b.r.changed_at).localeCompare(String(a.r.changed_at)) ||
        Number(rowId(b.r)) - Number(rowId(a.r)),
    )
    .slice(0, 1000)
    .map(({ r, d }) => ({
      id: rowId(r),
      at: text(r.changed_at),
      by: text(r.changed_by),
      rowName: text(r.employee_name),
      tab: d.tab || "",
      rid: d.rid || "",
      field: d.field || text(r.field_name),
      ov: d.ov ?? text(r.old_value),
      nv: d.nv ?? text(r.new_value),
      text: d.txt || `${text(r.field_name)}: ${text(r.old_value)} → ${text(r.new_value)}`,
    }));

  return {
    cycle,
    location: cycle.location || "All",
    locations: locationList,
    designations,
    groups,
    options,
    bands: BANDS,
    audit,
  };
}

/* ---------- rules (spec: VALIDATIONS) ---------- */
function isUnmapped(d, options) {
  const t = d.nextType;
  if (!t || !options[t]) return true;
  if (t === "S") return !d.singleNextId;
  if (t === "M") return !(d.multipleNextIds || []).length;
  if (t === "G") return !d.groupId;
  return false; // F: nothing to store
}

function validate(payload, db) {
  const errors = [];
  const options = payload.options || {};
  if (!TYPES.some((t) => options[t] === true)) {
    errors.push("At least one next-designation type must stay on.");
  }

  const designations = payload.designations || [];
  const groups = payload.groups || [];
  const dbIds = new Set(db.designations.map((d) => d.id));
  const ids = new Set(designations.map((d) => String(d.id)));
  const groupIds = new Set(groups.map((g) => String(g.id)));

  // designations
  // A designation belongs to one location; the same name may exist in several.
  const dbById = new Map(db.designations.map((x) => [x.id, x]));
  const byId = new Map(designations.map((x) => [String(x.id), x]));
  const locOf = (x) =>
    !x ? "" : String(x.id).startsWith("new-") ? text(x.locationId) : (dbById.get(String(x.id)) || {}).locationId || "";
  const sameLocation = (a, b) => !locOf(a) || !locOf(b) || locOf(a) === locOf(b);
  const seenNames = new Set();
  designations.forEach((d) => {
    const id = String(d.id);
    const name = text(d.name);
    if (!name) return errors.push("Designation name is required.");
    if (id.startsWith("new-") && !(db.locations || []).some((l) => l.id === text(d.locationId))) {
      errors.push(`${name}: choose a location from Location Master.`);
    }
    const nameKey = `${locOf(d)}|${name.toLowerCase()}`;
    if (seenNames.has(nameKey)) {
      errors.push(`${name}: this designation already exists in this location.`);
    }
    seenNames.add(nameKey);
    if (!id.startsWith("new-") && !dbIds.has(id)) {
      errors.push(`${name}: not found in the current cycle. Refresh and try again.`);
    }
    if (text(d.band) && !BANDS.includes(text(d.band))) {
      errors.push(`${name}: band ${d.band} is not in Band Master.`);
    }
    const type = text(d.nextType).toUpperCase();
    if (type && !TYPES.includes(type)) errors.push(`${name}: unknown next type.`);

    // Only the mapping that belongs to the chosen next type is checked and
    // stored (Single -> one designation, Multiple -> a list, Group -> a group,
    // Free select -> nothing).
    if (type === "S" && text(d.singleNextId)) {
      if (String(d.singleNextId) === id) errors.push(`${name}: a designation cannot be its own next designation.`);
      else if (!ids.has(String(d.singleNextId))) errors.push(`${name}: the next designation is not valid.`);
      else if (!sameLocation(d, byId.get(String(d.singleNextId)))) {
        errors.push(`${name}: the next designation must be in the same location.`);
      }
    }
    const list = type === "M" ? (d.multipleNextIds || []).map(String) : [];
    if (new Set(list).size !== list.length) errors.push(`${name}: the same designation is listed twice.`);
    if (list.includes(id)) errors.push(`${name}: the list cannot contain the designation itself.`);
    if (list.some((x) => !ids.has(x))) errors.push(`${name}: the list has a designation that is not valid.`);
    else if (list.some((x) => !sameLocation(d, byId.get(x)))) {
      errors.push(`${name}: the list can only have designations from the same location.`);
    }
    if (type === "G" && text(d.groupId) && !groupIds.has(String(d.groupId))) {
      errors.push(`${name}: the chosen group does not exist in this cycle.`);
    }

    const row = {
      nextType: type,
      singleNextId: type === "S" ? text(d.singleNextId) : "",
      multipleNextIds: list,
      groupId: type === "G" ? text(d.groupId) : "",
    };
    // if (d.status === "Active" && isUnmapped(row, options)) {
    //   errors.push(
    //     `${name}: not mapped. Map the next designation first, then make it Active.`,
    //   );
    // }
  });

  // groups
  const seenGroups = new Set();
  groups.forEach((g) => {
    const name = text(g.name);
    if (!name) return errors.push("Group name is required.");
    if (seenGroups.has(name.toLowerCase())) errors.push(`Group "${name}" already exists in the cycle.`);
    seenGroups.add(name.toLowerCase());
    const members = (g.memberIds || []).map(String);
    if (!members.length) errors.push(`Group "${name}" needs at least one designation.`);
    if (new Set(members).size !== members.length) errors.push(`Group "${name}" lists a designation twice.`);
    if (members.some((m) => !ids.has(m))) errors.push(`Group "${name}" has a designation that is not valid.`);
  });

  // a group cannot be deleted while a designation points to it
  db.groups.forEach((g) => {
    if (groupIds.has(g.id)) return;
    const used = designations.find(
      (d) => text(d.nextType).toUpperCase() === "G" && String(d.groupId) === g.id,
    );
    if (used) errors.push(`Group "${g.name}" cannot be removed while ${used.name} points to it.`);
  });

  return [...new Set(errors)];
}

/* ---------- audit text ---------- */
function makeCtx(designations, groups) {
  const names = new Map(designations.map((d) => [String(d.id), d.name]));
  const grp = new Map(groups.map((g) => [String(g.id), g]));
  const dn = (id) => names.get(String(id)) || "";
  const gn = (id) => {
    const g = grp.get(String(id));
    if (!g) return "";
    return `${g.name} (${(g.memberIds || []).map(dn).filter(Boolean).join(", ") || "no designations"})`;
  };
  return { dn, gn };
}
function describe(type, d, ctx) {
  if (type === "S") return `${TYPE_LABEL.S}: ${d.singleNextId ? ctx.dn(d.singleNextId) : "not set"}`;
  if (type === "M") {
    const n = (d.multipleNextIds || []).map(ctx.dn).filter(Boolean);
    return `${TYPE_LABEL.M}: ${n.length ? n.join(", ") : "not set"}`;
  }
  if (type === "G") return `${TYPE_LABEL.G}: ${d.groupId ? ctx.gn(d.groupId) : "not set"}`;
  if (type === "F") return TYPE_LABEL.F;
  return "none";
}

/* ---------- save ---------- */
async function saveData(app, cycle, actor, payload) {
  const db = await loadData(app, cycle, { sync: true });
  const errors = validate(payload, db);
  if (errors.length) throw fail(400, errors.slice(0, 8).join(" "));

  const batchId = `DM-${Date.now()}`;
  const auditRows = [];
  const oldCtx = makeCtx(db.designations, db.groups);
  const log = (key, rowName, field, oldTxt, newTxt, meta) =>
    auditRows.push({
      emp_id: clip(key),
      employee_name: clip(rowName),
      field_name: clip(field),
      old_value: clip(oldTxt),
      new_value: clip(newTxt),
      changed_by: clip(actor),
      changed_at: access.nowDT(),
      source: SOURCE,
      batch_id: batchId,
      appraisal_year: clip(cycle.name),
      details: JSON.stringify({
        cycleId: cycle.id,
        tab: meta.tab,
        rid: meta.rid,
        field: meta.field,
        ov: meta.ov,
        nv: meta.nv,
        txt: meta.txt || `${field}: ${oldTxt || "none"} → ${newTxt || "none"}`,
      }),
    });

  const ds = app.datastore();
  const tDes = ds.table(TBL.designations);
  const tNext = ds.table(TBL.next);
  const tGrp = ds.table(TBL.groups);
  const tMem = ds.table(TBL.members);
  const tCfg = ds.table(TBL.config);

  const desPayload = payload.designations || [];
  const grpPayload = payload.groups || [];
  const dbDes = new Map(db.designations.map((d) => [d.id, d]));
  const dbGrp = new Map(db.groups.map((g) => [g.id, g]));

  /* 1. new designations (start Inactive, no next type) */
  const desMap = new Map(); // client id -> Catalyst ROWID
  desPayload.forEach((d) => desMap.set(String(d.id), String(d.id)));
  const fresh = desPayload.filter((d) => String(d.id).startsWith("new-"));
  for (const part of chunks(fresh)) {
    const inserted = await tDes.insertRows(
      part.map((d) => ({
        cycle_id: cycle.id,
        name: clip(text(d.name)),
        department: "",
        location: text(d.locationId),
        band: "",
        next_type: "",
        status: true,
      })),
    );
    (Array.isArray(inserted) ? inserted : []).forEach((row, i) => {
      desMap.set(String(part[i].id), rowId(row));
      dbDes.set(rowId(row), {
        id: rowId(row), name: text(part[i].name), department: "", locationId: text(part[i].locationId),
        band: "", nextType: "",
        singleNextId: "", multipleNextIds: [], groupId: "", status: "Inactive",
      });
      const where = ((db.locations || []).find((l) => l.id === text(part[i].locationId)) || {}).name;
      log(`DES:${rowId(row)}`, text(part[i].name), "Designation added", "", "Inactive until mapped", {
        tab: "des", rid: rowId(row), field: "added", ov: "", nv: "",
        txt: `Designation added${where ? ` in ${where}` : ""} (Inactive until mapped)`,
      });
    });
  }
  const mapDes = (id) => (id ? desMap.get(String(id)) || String(id) : "");

  /* 2. groups: add / rename / remove */
  const grpMap = new Map();
  grpPayload.forEach((g) => grpMap.set(String(g.id), String(g.id)));
  for (const g of grpPayload.filter((x) => String(x.id).startsWith("new-"))) {
    const inserted = await tGrp.insertRow({ cycle_id: cycle.id, group_name: clip(text(g.name)) });
    const real = rowId(inserted);
    grpMap.set(String(g.id), real);
    dbGrp.set(real, { id: real, name: text(g.name), memberIds: [] });
    log(`GRP:${real}`, text(g.name), "Group added", "", text(g.name), {
      tab: "grp", rid: real, field: "added", ov: "", nv: "", txt: "Group added",
    });
  }
  for (const g of grpPayload) {
    const prev = dbGrp.get(grpMap.get(String(g.id)));
    if (prev && prev.name !== text(g.name) && !String(g.id).startsWith("new-")) {
      await tGrp.updateRow({ ROWID: prev.id, group_name: clip(text(g.name)) });
      log(`GRP:${prev.id}`, text(g.name), "Name", prev.name, text(g.name), {
        tab: "grp", rid: prev.id, field: "n", ov: prev.name, nv: text(g.name),
        txt: `Name: ${prev.name} → ${text(g.name)}`,
      });
    }
  }
  const keepGroups = new Set(grpPayload.map((g) => grpMap.get(String(g.id))));
  const memberRowsAll = await readAll(app, TBL.members);

  /* 3. group members */
  const newCtx = makeCtx(
    desPayload.map((d) => ({ id: mapDes(d.id), name: d.name })),
    grpPayload.map((g) => ({
      id: grpMap.get(String(g.id)),
      name: g.name,
      memberIds: (g.memberIds || []).map(mapDes),
    })),
  );
  // The screen only lists this location's designations, so only their group
  // memberships can be removed here; members from other locations are untouched.
  const shownDesIds = new Set(db.designations.map((d) => d.id));
  for (const g of grpPayload) {
    const gid = grpMap.get(String(g.id));
    const want = [...new Set((g.memberIds || []).map(mapDes))];
    const have = memberRowsAll.filter(
      (m) => refId(m.group_id) === gid && shownDesIds.has(refId(m.des_id)),
    );
    const haveIds = have.map((m) => refId(m.des_id));
    const allHaveIds = memberRowsAll.filter((m) => refId(m.group_id) === gid).map((m) => refId(m.des_id));
    const drop = have.filter((m) => !want.includes(refId(m.des_id))).map(rowId);
    const add = want.filter((id) => !allHaveIds.includes(id));
    for (const part of chunks(drop)) await tMem.deleteRows(part);
    for (const part of chunks(add))
      await tMem.insertRows(part.map((id) => ({ group_id: gid, des_id: id })));
    if (drop.length || add.length) {
      const oldN = haveIds.map(oldCtx.dn).filter(Boolean).join(", ");
      const newN = want.map(newCtx.dn).filter(Boolean).join(", ");
      log(`GRP:${gid}`, text(g.name), "Designations", oldN, newN, {
        tab: "grp", rid: gid, field: "mem", ov: oldN, nv: newN,
        txt: `Designations: ${oldN || "none"} → ${newN || "none"}`,
      });
    }
  }

  /* 4 + 5. designations (band, type, single, group, status) and the Multiple list */
  const nextRowsAll = await readAll(app, TBL.next);
  for (const d of desPayload) {
    const id = mapDes(d.id);
    const prev = dbDes.get(id);
    if (!prev) continue;
    const type = text(d.nextType).toUpperCase();
    // Only the mapping of the chosen next type is kept: Single -> one next
    // designation, Multiple -> the list, Group -> the group, Free select and
    // blank -> nothing. (A type that is switched OFF in Options keeps its
    // mapping, because the row's next type does not change.)
    const cur = {
      band: text(d.band),
      nextType: type,
      singleNextId: type === "S" ? mapDes(text(d.singleNextId)) : "",
      multipleNextIds: type === "M" ? [...new Set((d.multipleNextIds || []).map(mapDes))] : [],
      groupId: type === "G" && text(d.groupId) ? grpMap.get(String(d.groupId)) || "" : "",
      status: d.status === "Active" ? "Active" : "Inactive",
    };
    const nm = prev.name;
    const key = `DES:${id}`;
    const change = (field, label, ov, nv, txt) =>
      log(key, nm, label, ov, nv, { tab: "des", rid: id, field, ov, nv, txt });

    const patch = {};
    if (cur.band !== prev.band) {
      patch.band = cur.band;
      change("band", "Band", prev.band, cur.band, `Band: ${prev.band || "none"} → ${cur.band || "none"}`);
    }
    if (cur.nextType !== prev.nextType) {
      patch.next_type = cur.nextType;
      const o = describe(prev.nextType, prev, oldCtx);
      const n = describe(cur.nextType, cur, newCtx);
      change("nt", "Next type", o, n, `Next type: ${o} → ${n}`);
    } else if (cur.nextType === "S" && cur.singleNextId !== prev.singleNextId) {
      const o = prev.singleNextId ? oldCtx.dn(prev.singleNextId) : "none";
      const n = cur.singleNextId ? newCtx.dn(cur.singleNextId) : "none";
      change("n1", "Next designation", o, n, `Next designation: ${o} → ${n}`);
    } else if (cur.nextType === "G" && cur.groupId !== prev.groupId) {
      const o = prev.groupId ? oldCtx.gn(prev.groupId) : "none";
      const n = cur.groupId ? newCtx.gn(cur.groupId) : "none";
      change("ng", "Group", o, n, `Group: ${o} → ${n}`);
    }
    if (cur.singleNextId !== prev.singleNextId) patch.single_next_designation = cur.singleNextId || null;
    if (cur.groupId !== prev.groupId) patch.group_id = cur.groupId || null;
    if (cur.status !== prev.status) {
      patch.status = cur.status === "Active";
      change("on", "Status", prev.status, cur.status, `Status: ${prev.status} → ${cur.status}`);
    }
    if (Object.keys(patch).length) await tDes.updateRow({ ROWID: id, ...patch });

    // Multiple list
    const oldList = prev.multipleNextIds;
    if (!sameList([...oldList].sort(), [...cur.multipleNextIds].sort())) {
      const stale = nextRowsAll.filter((n) => refId(n.designation_id) === id).map(rowId);
      for (const part of chunks(stale)) await tNext.deleteRows(part);
      for (const part of chunks(cur.multipleNextIds))
        await tNext.insertRows(part.map((nid) => ({ designation_id: id, next_id: nid })));
      if (cur.nextType === prev.nextType && cur.nextType === "M") {
        const o = oldList.map(oldCtx.dn).filter(Boolean).join(", ") || "none";
        const n = cur.multipleNextIds.map(newCtx.dn).filter(Boolean).join(", ") || "none";
        change("nm", "Next designations", o, n, `Next designations: ${o} → ${n}`);
      }
    }
  }

  /* 5b. removed groups: only now, when no designation row points to them any more */
  for (const g of db.groups) {
    if (keepGroups.has(g.id)) continue;
    const mine = memberRowsAll.filter((m) => refId(m.group_id) === g.id).map(rowId);
    for (const part of chunks(mine)) await tMem.deleteRows(part);
    await tGrp.deleteRow(g.id);
    log(`GRP:${g.id}`, g.name, "Group removed", g.name, "", {
      tab: "grp", rid: g.id, field: "removed", ov: g.name, nv: "", txt: "Group removed",
    });
  }

  /* 6. the four switches (one audit row for the switch + one per designation using it) */
  const cfgRows = await readAll(app, TBL.config);
  for (const t of TYPES) {
    const row = cfgRows.find((r) => text(r.type).toUpperCase() === t);
    const was = row ? isOn(row.status) : true; // no rows yet = all on
    const now = payload.options[t] === true;
    if (row) {
      if (was !== now) await tCfg.updateRow({ ROWID: rowId(row), status: now });
    } else {
      await tCfg.insertRow({ type: t, status: now });
    }
    if (was === now) continue;
    const using = desPayload.filter((d) => text(d.nextType).toUpperCase() === t);
    const word = now ? "switched on" : "switched off";
    log(`OPT:${t}`, "Next designation options", TYPE_LABEL[t], was ? "On" : "Off", now ? "On" : "Off", {
      tab: "opt", rid: t, field: "option", ov: was, nv: now,
      txt: `${TYPE_LABEL[t]} ${word} · ${using.length} designation${using.length === 1 ? "" : "s"} affected`,
    });
    using.forEach((d) => {
      const id = mapDes(d.id);
      const cur = {
        singleNextId: t === "S" ? mapDes(text(d.singleNextId)) : "",
        multipleNextIds: t === "M" ? (d.multipleNextIds || []).map(mapDes) : [],
        groupId: t === "G" && text(d.groupId) ? grpMap.get(String(d.groupId)) || "" : "",
      };
      const m = describe(t, cur, newCtx);
      const txt = now
        ? `Next type: ${TYPE_LABEL[t]} switched on, mapping restored: ${m}`
        : `Next type: ${m} → switched off, not mapped (choose another type)`;
      log(`DES:${id}`, d.name, "Next type", m, now ? m : "switched off", {
        tab: "des", rid: id, field: "nt", ov: m, nv: now ? m : "switched off", txt,
      });
    });
  }

  /* 7. audit trail (user, date and time, old value, new value) */
  const tAudit = ds.table(TBL.audit);
  for (const part of chunks(auditRows)) await tAudit.insertRows(part);

  return loadData(app, cycle, { sync: false });
}

/* ---------- Appraisal Sheet "New title" rules (read-only) ----------
   One entry per designation of the active cycle, keyed by lower-case name:
     mapped   true  -> the New title dropdown may open
              false -> the sheet must show the "not mapped" popup with `message`
     options  names the dropdown shows (S: the one next designation,
              M: the listed ones, G: the active members of the group)
     free     true for Free select: the dropdown shows `freeOptions` (every
              Active designation) and nothing is pre-filled
     prefill  the single next designation (type S only), else ""
   A designation that has no row in the Designation table is not in `rules`;
   the sheet treats that as not mapped too. */
async function loadRules(app, cycle) {
  await resolveDesignationsTable(app);
  const locations = await readLocations(app);
  const [allDes, memberRows, nextRows, cfgRows, locationPairs] = await Promise.all([
    readCycle(app, TBL.designations, cycle.id),
    readAll(app, TBL.members),
    readAll(app, TBL.next),
    readAll(app, TBL.config),
    // only a location cycle needs the employees' designations (to filter by location)
    cycle.location ? pairsForCycle(app, cycle, locations) : Promise.resolve([]),
  ]);
  const masterNames = new Set(locationPairs.map((r) => lower(r.designation)).filter(Boolean));

  const options = { S: false, M: false, G: false, F: false };
  cfgRows.forEach((r) => {
    const t = text(r.type).toUpperCase();
    if (TYPES.includes(t)) options[t] = isOn(r.status);
  });
  if (!cfgRows.length) TYPES.forEach((t) => (options[t] = true));

  const scope = locationScope(cycle, locations, masterNames);
  const seen = new Set();
  const rows = allDes.filter((r) => {
    const k = lower(r.name);
    if (!k || seen.has(k)) return false;
    if (!scope.visible(r)) return false; // another location's designation
    seen.add(k);
    return true;
  });
  const byId = new Map(rows.map((r) => [rowId(r), r]));
  const activeName = (id) => {
    const r = byId.get(String(id));
    return r && isOn(r.status) ? text(r.name) : "";
  };
  const freeOptions = rows.filter((r) => isOn(r.status)).map((r) => text(r.name)).sort();
  const uniq = (list) => [...new Set(list.filter(Boolean))];

  const rules = {};
  rows.forEach((r) => {
    const id = rowId(r);
    const name = text(r.name);
    const type = text(r.next_type).toUpperCase();
    const notMapped = `${name} is not mapped to a next designation. Ask HR to map it in Designation Master.`;
    const entry = { name, mapped: false, nextType: type, options: [], free: false, prefill: "", message: notMapped };

    if (!type || !TYPES.includes(type)) {
      rules[lower(name)] = entry;
      return;
    }
    if (!options[type]) {
      entry.message = `${name}: "${TYPE_LABEL[type]}" is switched off in Designation Master. Ask HR to choose another next type.`;
      rules[lower(name)] = entry;
      return;
    }

    let names = [];
    let listed = []; // every next designation HR chose, Active or not
    let anySet = true;
    if (type === "S") {
      const sid = refId(r.single_next_designation);
      anySet = !!sid;
      names = uniq([activeName(sid)]);
      listed = uniq([byId.get(String(sid)) ? text(byId.get(String(sid)).name) : ""]);
    } else if (type === "M") {
      const ids = nextRows.filter((n) => refId(n.designation_id) === id).map((n) => refId(n.next_id));
      anySet = ids.length > 0;
      names = uniq(ids.map(activeName));
      listed = uniq(ids.map((x) => (byId.get(String(x)) ? text(byId.get(String(x)).name) : "")));
    } else if (type === "G") {
      const gid = refId(r.group_id);
      const ids = gid
        ? memberRows.filter((m) => refId(m.group_id) === gid).map((m) => refId(m.des_id))
        : [];
      anySet = !!gid && ids.length > 0;
      names = uniq(ids.map(activeName));
      listed = uniq(ids.map((x) => (byId.get(String(x)) ? text(byId.get(String(x)).name) : "")));
    }

    if (type === "F") {
      entry.mapped = true;
      entry.free = true;
      entry.message = "";
    } else if (!anySet) {
      // keep the generic "not mapped" message
    } else if (!names.length) {
      entry.message = `${name}: its next designation${listed.length === 1 ? " (" : "s ("}${listed.join(", ")}) ${listed.length === 1 ? "is" : "are"} Inactive. A designation can only be Active once it is mapped to a next type, so ask HR to map and activate ${listed.length === 1 ? "it" : "them"} in Designation Master.`;
    } else {
      entry.mapped = true;
      entry.options = names;
      entry.prefill = type === "S" ? names[0] : "";
      entry.message = "";
    }
    rules[lower(name)] = entry;
  });

  return { cycle, rules, freeOptions };
}

/* HR operations dashboard tile: how many designations are not mapped. */
async function loadSummary(app, cycle) {
  const data = await loadData(app, cycle, { sync: true, withAudit: false });
  const notMapped = data.designations.filter((d) => isUnmapped(d, data.options)).length;
  return {
    cycle,
    designations: data.designations.length,
    active: data.designations.filter((d) => d.status === "Active").length,
    notMapped,
  };
}

/* ---------- handler ---------- */
module.exports = async function designationMasterApi(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return sendJson(res, 405, { success: false, message: "Method not allowed." });
    }
    let rulesOnly = false;
    let view = "";
    let location = "";
    try {
      const params = new URL(req.url, "https://x").searchParams;
      view = req.method === "GET" ? params.get("view") || "" : "";
      location = text(params.get("location"));
      rulesOnly = view === "appraisal";
    } catch (e) {
      rulesOnly = false;
    }
    const { adminApp, actor } = await authorize(req, req.method, rulesOnly);

    if (req.method === "GET") {
      const cycle = await getActiveCycle(adminApp, { location });
      if (view === "summary") {
        return sendJson(res, 200, { success: true, data: await loadSummary(adminApp, cycle) });
      }
      if (rulesOnly) {
        return sendJson(res, 200, { success: true, data: await loadRules(adminApp, cycle) });
      }
      return sendJson(res, 200, { success: true, data: await loadData(adminApp, cycle) });
    }

    const payload = await readBody(req);
    // A save goes to the cycle (location) the screen was loaded with; it fails
    // with 409 if that cycle is no longer Active.
    const cycle = await getActiveCycle(adminApp, {
      cycleId: payload.cycleId,
      location: payload.location || location,
    });
    return sendJson(res, 200, { success: true, data: await saveData(adminApp, cycle, actor, payload) });
  } catch (error) {
    const status = error.status || 500;
    console.error("designationmasterapi:", error.message, error.stack || "");
    return sendJson(res, status, { success: false, message: error.message || "Designation Master failed." });
  }
};