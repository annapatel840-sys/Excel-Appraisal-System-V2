"use strict";

/* ---------------------------------------------------------------------
   designationmasterapi - Designation Master (HR Operations > Masters)

   GET  /  -> { success, data }   current-cycle designations, groups, options, audit
   POST /  -> { success, data }   saves the whole screen, returns fresh data

   Catalyst tables (looked up by NAME, so no table IDs to paste):
     Designations              cycle_id, name, department, band, next_type,
                               single_next_designation, group_id, status
                               (group_id = foreign key to Designation_Groups;
                                add it to the Designations table if missing)
     Designation_Next          designation_id, next_id    (the "Multiple" list)
     Designation_Groups        cycle_id, group_name
     Designation_Group_Members group_id, des_id
     Designation_Config        type, status               (the 4 switches)
   plus: Appraisal_Cycle_Master, Employee_Master, Appraisal_Audit (existing).
   --------------------------------------------------------------------- */

const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

const TBL = {
  designations: "Designations",
  next: "Designation_Next",
  groups: "Designation_Groups",
  members: "Designation_Group_Members",
  config: "Designation_Config",
  cycles: "Appraisal_Cycle_Master",
  employees: "Employee_Master",
  audit: "Appraisal_Audit",
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
    const result = await zcql.executeZCQLQuery(q);
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
    const all = await readAll(app, table);
    return all.filter((r) => refId(r[cycleCol]) === String(cycleId));
  }
}

/* Newest rows first, capped (the audit table is shared by every screen and
   grows without limit, so it is never read in full). */
async function readRecent(app, table, where, max = 1000) {
  const zcql = app.zcql();
  const rows = [];
  for (let off = 0; off < max; off += 300) {
    const q =
      `SELECT * FROM ${table}` +
      (where ? ` WHERE ${where}` : "") +
      ` ORDER BY ROWID DESC LIMIT ${off}, 300`;
    const result = await zcql.executeZCQLQuery(q);
    const page = (result || []).map((i) => (i && (i[table] || Object.values(i)[0])) || {});
    rows.push(...page);
    if (page.length < 300) break;
  }
  return rows.slice(0, max);
}

/* Distinct designation + department pairs from Employee_Master. DISTINCT keeps
   this to a handful of small queries instead of reading every employee row. */
async function readMasterPairs(app) {
  const zcql = app.zcql();
  const out = [];
  try {
    for (let off = 0; off < 6000; off += 300) {
      const result = await zcql.executeZCQLQuery(
        `SELECT DISTINCT designation, department FROM ${TBL.employees} ` +
          `ORDER BY designation ASC LIMIT ${off}, 300`,
      );
      const page = (result || []).map(
        (i) => (i && (i[TBL.employees] || Object.values(i)[0])) || {},
      );
      out.push(...page);
      if (page.length < 300) break;
    }
    return out;
  } catch (e) {
    console.error("designationmasterapi: DISTINCT read failed, scanning:", e.message);
    return readAll(app, TBL.employees, "", "ROWID, designation, department");
  }
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
async function authorize(req, method) {
  const userApp = catalyst.initialize(req);
  const adminApp = catalyst.initialize(req, { scope: "admin" });
  const a = await access.check(userApp, adminApp);
  access.guard(a, () =>
    access.requireScreen(a, SCREEN_KEY, method === "GET" ? "view" : "edit"),
  );
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
async function getActiveCycle(app) {
  const rows = await readAll(app, TBL.cycles);
  const row = rows.find(
    (r) => lower(r.status) === "active" && !isOn(r.archived),
  );
  if (!row) throw fail(409, "No active appraisal cycle was found.");
  return { id: rowId(row), name: text(row.cycle_name) };
}

/* ---------- load ---------- */
async function syncFromEmployeeMaster(app, cycle) {
  const [desRows, empRows] = await Promise.all([
    readCycle(app, TBL.designations, cycle.id),
    readMasterPairs(app),
  ]);
  const known = new Set(desRows.map((r) => lower(r.name)));
  const pairs = new Map();
  empRows.forEach((r) => {
    const name = text(r.designation);
    if (name && !pairs.has(name.toLowerCase())) {
      pairs.set(name.toLowerCase(), { name, department: text(r.department) });
    }
  });
  const toAdd = [];
  pairs.forEach((p, key) => {
    if (known.has(key)) return;
    // Spec: new designations arrive with no next type and Status Inactive.
    toAdd.push({
      cycle_id: cycle.id,
      name: clip(p.name),
      department: clip(p.department),
      band: "",
      next_type: "",
      status: false,
    });
  });
  if (toAdd.length) {
    const table = app.datastore().table(TBL.designations);
    for (const part of chunks(toAdd)) await table.insertRows(part);
  }
  return new Set(pairs.keys());
}

async function loadData(app, cycle, { sync = true } = {}) {
  try {
    await app.zcql().executeZCQLQuery("SELECT group_id FROM Designations LIMIT 1");
  } catch (e) {
    throw fail(
      500,
      "Catalyst table Designations has no group_id column. Add a foreign-key column group_id pointing to Designation_Groups.",
    );
  }

  const masterNames = sync
    ? await syncFromEmployeeMaster(app, cycle)
    : new Set();


  const [allDes, allGroups, memberRows, nextRows, cfgRows, auditRows] = await Promise.all([
    readCycle(app, TBL.designations, cycle.id),
    readCycle(app, TBL.groups, cycle.id),
    readAll(app, TBL.members),
    readAll(app, TBL.next),
    readAll(app, TBL.config),
    readRecent(app, TBL.audit, `source = '${SOURCE}'`),
  ]);

  // keep one row per designation name (guards against a double sync)
  const seenDes = new Set();
  const desRows = allDes.filter((r) => {
    const k = lower(r.name);
    if (!k || seenDes.has(k)) return false;
    seenDes.add(k);
    return true;
  });

  const groupRows = allGroups;
  const groupIds = new Set(groupRows.map(rowId));
  const desIds = new Set(desRows.map(rowId));

  const designations = desRows.map((r) => {
    const id = rowId(r);
    return {
      id,
      name: text(r.name),
      department: text(r.department),
      inMaster: masterNames.has(lower(r.name)) || !!text(r.department),
      band: text(r.band),
      nextType: text(r.next_type).toUpperCase(),
      singleNextId: refId(r.single_next_designation),
      multipleNextIds: nextRows
        .filter((n) => refId(n.designation_id) === id)
        .map((n) => refId(n.next_id)),
      groupId: refId(r.group_id),
      status: isOn(r.status) ? "Active" : "Inactive",
    };
  });

  const groups = groupRows.map((r) => ({
    id: rowId(r),
    name: text(r.group_name),
    memberIds: memberRows
      .filter((m) => refId(m.group_id) === rowId(r) && desIds.has(refId(m.des_id)))
      .map((m) => refId(m.des_id)),
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

  return { cycle, designations, groups, options, bands: BANDS, audit };
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
  const seenNames = new Set();
  designations.forEach((d) => {
    const id = String(d.id);
    const name = text(d.name);
    if (!name) return errors.push("Designation name is required.");
    if (seenNames.has(name.toLowerCase())) {
      errors.push(`${name}: this designation already exists in the cycle.`);
    }
    seenNames.add(name.toLowerCase());
    if (!id.startsWith("new-") && !dbIds.has(id)) {
      errors.push(`${name}: not found in the current cycle. Refresh and try again.`);
    }
    if (text(d.band) && !BANDS.includes(text(d.band))) {
      errors.push(`${name}: band ${d.band} is not in Band Master.`);
    }
    const type = text(d.nextType).toUpperCase();
    if (type && !TYPES.includes(type)) errors.push(`${name}: unknown next type.`);

    if (text(d.singleNextId)) {
      if (String(d.singleNextId) === id) errors.push(`${name}: a designation cannot be its own next designation.`);
      else if (!ids.has(String(d.singleNextId))) errors.push(`${name}: the next designation is not valid.`);
    }
    const list = (d.multipleNextIds || []).map(String);
    if (new Set(list).size !== list.length) errors.push(`${name}: the same designation is listed twice.`);
    if (list.includes(id)) errors.push(`${name}: the list cannot contain the designation itself.`);
    if (list.some((x) => !ids.has(x))) errors.push(`${name}: the list has a designation that is not valid.`);
    if (text(d.groupId) && !groupIds.has(String(d.groupId))) {
      errors.push(`${name}: the chosen group does not exist in this cycle.`);
    }

    const row = {
      nextType: type,
      singleNextId: text(d.singleNextId),
      multipleNextIds: list,
      groupId: text(d.groupId),
    };
    if (d.status === "Active" && isUnmapped(row, options)) {
      errors.push(
        `${name}: not mapped. Map the next designation first, then make it Active.`,
      );
    }
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
    const used = designations.find((d) => String(d.groupId) === g.id);
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
        band: "",
        next_type: "",
        status: false,
      })),
    );
    (Array.isArray(inserted) ? inserted : []).forEach((row, i) => {
      desMap.set(String(part[i].id), rowId(row));
      dbDes.set(rowId(row), {
        id: rowId(row), name: text(part[i].name), department: "", band: "", nextType: "",
        singleNextId: "", multipleNextIds: [], groupId: "", status: "Inactive",
      });
      log(`DES:${rowId(row)}`, text(part[i].name), "Designation added", "", "Inactive until mapped", {
        tab: "des", rid: rowId(row), field: "added", ov: "", nv: "",
        txt: "Designation added (Inactive until mapped)",
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
  for (const g of db.groups) {
    if (keepGroups.has(g.id)) continue;
    const mine = memberRowsAll.filter((m) => refId(m.group_id) === g.id).map(rowId);
    for (const part of chunks(mine)) await tMem.deleteRows(part);
    await tGrp.deleteRow(g.id);
    log(`GRP:${g.id}`, g.name, "Group removed", g.name, "", {
      tab: "grp", rid: g.id, field: "removed", ov: g.name, nv: "", txt: "Group removed",
    });
  }

  /* 3. group members */
  const newCtx = makeCtx(
    desPayload.map((d) => ({ id: mapDes(d.id), name: d.name })),
    grpPayload.map((g) => ({
      id: grpMap.get(String(g.id)),
      name: g.name,
      memberIds: (g.memberIds || []).map(mapDes),
    })),
  );
  for (const g of grpPayload) {
    const gid = grpMap.get(String(g.id));
    const want = [...new Set((g.memberIds || []).map(mapDes))];
    const have = memberRowsAll.filter((m) => refId(m.group_id) === gid);
    const haveIds = have.map((m) => refId(m.des_id));
    const drop = have.filter((m) => !want.includes(refId(m.des_id))).map(rowId);
    const add = want.filter((id) => !haveIds.includes(id));
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
    const cur = {
      band: text(d.band),
      nextType: text(d.nextType).toUpperCase(),
      singleNextId: mapDes(text(d.singleNextId)),
      multipleNextIds: (d.multipleNextIds || []).map(mapDes),
      groupId: text(d.groupId) ? grpMap.get(String(d.groupId)) || "" : "",
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
    if (!sameList(oldList, cur.multipleNextIds)) {
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
        singleNextId: mapDes(text(d.singleNextId)),
        multipleNextIds: (d.multipleNextIds || []).map(mapDes),
        groupId: text(d.groupId) ? grpMap.get(String(d.groupId)) || "" : "",
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
    const { adminApp, actor } = await authorize(req, req.method);
    const cycle = await getActiveCycle(adminApp);

    if (req.method === "GET") {
      return sendJson(res, 200, { success: true, data: await loadData(adminApp, cycle) });
    }

    const payload = await readBody(req);
    if (payload.cycleId && String(payload.cycleId) !== cycle.id) {
      throw fail(409, "The appraisal cycle changed. Refresh Designation Master before saving.");
    }
    return sendJson(res, 200, { success: true, data: await saveData(adminApp, cycle, actor, payload) });
  } catch (error) {
    const status = error.status || 500;
    console.error("designationmasterapi:", error.message, error.stack || "");
    return sendJson(res, status, { success: false, message: error.message || "Designation Master failed." });
  }
};