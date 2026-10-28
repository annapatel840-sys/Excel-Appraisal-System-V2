"use strict";

const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");

const TABLES = {
  designations: "74008000000100115",
  groups: "74008000000100854",
  members: "74008000000109217",
  config: "74008000000109580",
  cycles: "74008000000034190",
  employeeMaster: "74008000000035727",
  audit: "74008000000034940",

  // Replace with the real ID after creating Designation_Next_Mappings.
  mappings: "REPLACE_WITH_DESIGNATION_NEXT_MAPPINGS_TABLE_ID",
};

const TYPES = ["S", "M", "G", "F"];
const SOURCE = "Designation Master";

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function value(row, key) {
  return row?.[key] ?? "";
}

function rowId(row) {
  return String(row?.ROWID ?? row?.rowid ?? row?.id ?? "");
}

function refId(value) {
  if (value && typeof value === "object") {
    return String(value.ROWID ?? value.rowid ?? value.id ?? value.ID ?? "");
  }
  return String(value ?? "");
}

function isOn(value) {
  return value === true || value === 1 || value === "1" ||
    String(value).toLowerCase() === "true" ||
    String(value).toLowerCase() === "active";
}

function text(value) {
  return String(value ?? "").trim();
}

function now() {
  return new Date().toISOString();
}

async function getAllRows(table) {
  const rows = [];
  let nextToken;

  do {
    const options = { maxRows: 200 };
    if (nextToken) options.nextToken = nextToken;

    const result = await table.getPagedRows(options);
    rows.push(...(result.data || []));
    nextToken = result.more_records ? result.next_token : null;
  } while (nextToken);

  return rows;
}

function getQuery(req) {
  const url = new URL(req.url || "/", "http://localhost");
  return { ...Object.fromEntries(url.searchParams.entries()), ...(req.queryParams || {}) };
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body);

  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 5_000_000) {
        reject(new Error("Request body exceeds 5 MB."));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(body.trim() ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON request body."));
      }
    });
    req.on("error", reject);
  });
}

async function checkAccess(req, method) {
  const userApp = catalyst.initialize(req);
  const adminApp = catalyst.initialize(req, { scope: "admin" });
  const result = await access.check(userApp, adminApp);

  access.requireScreen(
    result,
    "employeeMaster",
    method === "GET" ? "view" : "edit",
  );

  const user = await userApp.userManagement().getCurrentUser();
  if (!user?.user_id) {
    const error = new Error("Please sign in.");
    error.status = 401;
    throw error;
  }

  return {
    adminApp,
    actor: text(user.email_id || user.user_id),
  };
}

function tableSet(adminApp) {
  const ds = adminApp.datastore();

  if (TABLES.mappings.startsWith("REPLACE_")) {
    throw new Error(
      "Create Designation_Next_Mappings in Catalyst and set its table ID in the function.",
    );
  }

  return {
    designations: ds.table(TABLES.designations),
    groups: ds.table(TABLES.groups),
    members: ds.table(TABLES.members),
    config: ds.table(TABLES.config),
    cycles: ds.table(TABLES.cycles),
    employeeMaster: ds.table(TABLES.employeeMaster),
    audit: ds.table(TABLES.audit),
    mappings: ds.table(TABLES.mappings),
  };
}

async function getActiveCycle(tables) {
  const rows = await getAllRows(tables.cycles);
  const row = rows.find(
    (item) => text(item.status).toLowerCase() === "active",
  );

  if (!row) {
    const error = new Error("No active appraisal cycle was found.");
    error.status = 409;
    throw error;
  }

  return {
    id: rowId(row),
    name: text(row.cycle_name || row.name || row.appraisal_year),
  };
}

async function auditChange(tables, actor, cycle, rowName, field, oldValue, newValue) {
  if (String(oldValue ?? "") === String(newValue ?? "")) return;

  await tables.audit.insertRow({
    emp_id: "SYSTEM",
    employee_name: rowName || "Designation Master",
    field_name: field,
    old_value: String(oldValue ?? ""),
    new_value: String(newValue ?? ""),
    changed_by: actor,
    changed_at: now(),
    source: SOURCE,
    appraisal_year: cycle.name,
    details: JSON.stringify({ cycleId: cycle.id, rowName }),
  });
}

async function loadData(tables, cycle) {
  const [
    designationRows,
    allGroupRows,
    memberRows,
    configRows,
    mappingRows,
    employeeRows,
    auditRows,
  ] = await Promise.all([
    getAllRows(tables.designations),
    getAllRows(tables.groups),
    getAllRows(tables.members),
    getAllRows(tables.config),
    getAllRows(tables.mappings),
    getAllRows(tables.employeeMaster),
    getAllRows(tables.audit),
  ]);

  const currentRows = designationRows.filter(
    (row) => refId(row.cycle_id) === cycle.id,
  );

  // Sync new Employee_Master designations as inactive, with no next type.
  const known = new Set(
    currentRows.map((row) => text(row.name).toLowerCase()),
  );

  const masterPairs = new Map();
  employeeRows.forEach((row) => {
    const name = text(row.designation);
    if (!name) return;

    const key = name.toLowerCase();
    if (!masterPairs.has(key)) {
      masterPairs.set(key, {
        name,
        department: text(row.department),
      });
    }
  });

  for (const [key, item] of masterPairs) {
    if (known.has(key)) continue;

    await tables.designations.insertRow({
      cycle_id: cycle.id,
      name: item.name,
      department: item.department,
      band: "",
      next_type: "",
      single_next_designation: "",
      status: false,
    });
  }

  // Re-read after synchronisation so new records appear immediately.
  const syncedRows = await getAllRows(tables.designations);
  const current = syncedRows.filter(
    (row) => refId(row.cycle_id) === cycle.id,
  );

  const groups = allGroupRows
    .filter((row) => refId(row.cycle_id) === cycle.id)
    .map((row) => ({
      id: rowId(row),
      name: text(row.group_name),
      memberIds: memberRows
        .filter((member) => refId(member.group_id) === rowId(row))
        .map((member) => refId(member.des_id)),
    }));

  const config = { S: false, M: false, G: false, F: false };
  configRows.forEach((row) => {
    const type = text(row.type).toUpperCase();
    if (TYPES.includes(type)) config[type] = isOn(row.status);
  });

  // If no options have been configured yet, default all to enabled.
  if (!configRows.length) {
    config.S = config.M = config.G = config.F = true;
  }

  const currentMappings = mappingRows.filter(
    (row) => refId(row.cycle_id) === cycle.id,
  );

  const designations = current.map((row) => {
    const id = rowId(row);
    const mapping = currentMappings.filter(
      (item) => refId(item.designation_id) === id,
    );

    return {
      id,
      name: text(row.name),
      department: text(row.department),
      nextType: text(row.next_type).toUpperCase(),
      singleNextId: refId(row.single_next_designation),
      multipleNextIds: mapping
        .filter((item) => text(item.mapping_type).toUpperCase() === "M")
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0))
        .map((item) => refId(item.next_designation_id)),
      groupId: refId(
        mapping.find((item) => text(item.mapping_type).toUpperCase() === "G")?.group_id,
      ),
      status: isOn(row.status) ? "Active" : "Inactive",
    };
  });

  const audit = auditRows
    .filter(
      (row) =>
        text(row.source) === SOURCE &&
        text(row.appraisal_year) === cycle.name,
    )
    .sort((a, b) => String(b.changed_at).localeCompare(String(a.changed_at)))
    .slice(0, 300)
    .map((row) => ({
      id: rowId(row),
      rowName: text(row.employee_name),
      field: text(row.field_name),
      oldValue: text(row.old_value),
      newValue: text(row.new_value),
      changedBy: text(row.changed_by),
      changedAt: text(row.changed_at),
    }));

  return { cycle, designations, groups, options: config, audit };
}

function validatePayload(payload, existing) {
  const options = payload.options || {};
  if (!TYPES.some((type) => options[type] === true)) {
    throw new Error("At least one next-designation type must be enabled.");
  }

  const designations = payload.designations || [];
  const groups = payload.groups || [];

  const groupNames = new Set();
  for (const group of groups) {
    const name = text(group.name).toLowerCase();

    if (!name) throw new Error("Group name is required.");
    if (groupNames.has(name)) {
      throw new Error(`Group name "${group.name}" is duplicated.`);
    }
    groupNames.add(name);

    if (!(group.memberIds || []).length) {
      throw new Error(`Group "${group.name}" must have at least one member.`);
    }
  }

  const designationIds = new Set(designations.map((row) => String(row.id)));
  for (const row of designations) {
    if (!text(row.name)) throw new Error("Designation name is required.");

    if (row.status !== "Active") continue;

    const type = text(row.nextType).toUpperCase();
    if (!TYPES.includes(type)) {
      throw new Error(`${row.name}: select a valid next-designation type.`);
    }
    if (options[type] !== true) {
      throw new Error(`${row.name}: next type ${type} is switched off.`);
    }

    if (type === "S") {
      if (!row.singleNextId) throw new Error(`${row.name}: select a next designation.`);
      if (String(row.singleNextId) === String(row.id)) {
        throw new Error(`${row.name}: a designation cannot map to itself.`);
      }
      if (!designationIds.has(String(row.singleNextId))) {
        throw new Error(`${row.name}: selected next designation is invalid.`);
      }
    }

    if (type === "M") {
      const ids = row.multipleNextIds || [];
      if (!ids.length) throw new Error(`${row.name}: select at least one next designation.`);
      if (new Set(ids.map(String)).size !== ids.length) {
        throw new Error(`${row.name}: duplicate next designations are not allowed.`);
      }
      if (ids.some((id) => String(id) === String(row.id))) {
        throw new Error(`${row.name}: a designation cannot map to itself.`);
      }
      if (ids.some((id) => !designationIds.has(String(id)))) {
        throw new Error(`${row.name}: one or more next designations are invalid.`);
      }
    }

    if (type === "G") {
      const group = groups.find((item) => String(item.id) === String(row.groupId));
      if (!group) throw new Error(`${row.name}: select a valid group.`);
      if (!(group.memberIds || []).length) {
        throw new Error(`${row.name}: the selected group has no members.`);
      }
    }
  }
}

async function saveData(tables, cycle, actor, payload) {
  const current = await loadData(tables, cycle);
  validatePayload(payload, current);

  const existingDesignations = new Map(
    current.designations.map((row) => [row.id, row]),
  );

  for (const row of payload.designations || []) {
    const previous = existingDesignations.get(String(row.id));
    if (!previous) continue;

    const type = text(row.nextType).toUpperCase();
    const active = row.status === "Active";
    const oldMapping = `${previous.nextType}|${previous.singleNextId}|${previous.multipleNextIds.join(",")}|${previous.groupId}`;
    const newMapping = `${type}|${row.singleNextId || ""}|${(row.multipleNextIds || []).join(",")}|${row.groupId || ""}`;

    await tables.designations.updateRow({
      ROWID: row.id,
      next_type: type,
      single_next_designation: type === "S" ? row.singleNextId : "",
      status: active,
    });

    await auditChange(
      tables, actor, cycle, row.name, "Status",
      previous.status, row.status,
    );
    await auditChange(
      tables, actor, cycle, row.name, "Next designation mapping",
      oldMapping, newMapping,
    );
  }

  // Save option switches. Preserve all existing designation mappings when
  // an option is switched off so the mapping can be restored later.
  const configRows = await getAllRows(tables.config);
  for (const type of TYPES) {
    const old = configRows.find((row) => text(row.type).toUpperCase() === type);
    const enabled = payload.options[type] === true;

    if (old) {
      await tables.config.updateRow({
        ROWID: rowId(old),
        type,
        status: enabled,
      });
    } else {
      await tables.config.insertRow({ type, status: enabled });
    }

    await auditChange(
      tables, actor, cycle, "Designation options", `Option ${type}`,
      old ? String(isOn(old.status)) : "(unset)",
      String(enabled),
    );
  }

  // Save group records, mapping temporary client IDs to Catalyst ROWIDs.
  const groupRows = await getAllRows(tables.groups);
  const cycleGroups = groupRows.filter(
    (row) => refId(row.cycle_id) === cycle.id,
  );
  const groupIdMap = new Map();

  for (const group of payload.groups || []) {
    let actualId = String(group.id || "");
    const previous = cycleGroups.find((row) => rowId(row) === actualId);

    if (previous) {
      await tables.groups.updateRow({
        ROWID: actualId,
        group_name: text(group.name),
      });

      await auditChange(
        tables, actor, cycle, group.name, "Group name",
        previous.group_name, group.name,
      );
    } else {
      const inserted = await tables.groups.insertRow({
        cycle_id: cycle.id,
        group_name: text(group.name),
      });
      actualId = rowId(inserted);
      if (!actualId && inserted?.ROWID) actualId = String(inserted.ROWID);

      await auditChange(
        tables, actor, cycle, group.name, "Group created",
        "", group.name,
      );
    }

    groupIdMap.set(String(group.id), actualId);
  }

  // Rebuild member rows only for groups belonging to this cycle.
  const allMembers = await getAllRows(tables.members);
  const cycleGroupIds = new Set(cycleGroups.map(rowId));
  for (const id of groupIdMap.values()) cycleGroupIds.add(id);

  for (const member of allMembers) {
    if (cycleGroupIds.has(refId(member.group_id))) {
      await tables.members.deleteRow(rowId(member));
    }
  }

  for (const group of payload.groups || []) {
    const actualGroupId = groupIdMap.get(String(group.id));
    for (const designationId of group.memberIds || []) {
      await tables.members.insertRow({
        group_id: actualGroupId,
        des_id: designationId,
      });
    }
  }

  // Rebuild multiple/group mapping rows for the current cycle only.
  const mappingRows = await getAllRows(tables.mappings);
  for (const row of mappingRows) {
    if (refId(row.cycle_id) === cycle.id) {
      await tables.mappings.deleteRow(rowId(row));
    }
  }

  for (const row of payload.designations || []) {
    const type = text(row.nextType).toUpperCase();

    if (type === "M") {
      for (let index = 0; index < (row.multipleNextIds || []).length; index++) {
        await tables.mappings.insertRow({
          cycle_id: cycle.id,
          designation_id: row.id,
          mapping_type: "M",
          next_designation_id: row.multipleNextIds[index],
          group_id: "",
          sort_order: index + 1,
        });
      }
    }

    if (type === "G") {
      await tables.mappings.insertRow({
        cycle_id: cycle.id,
        designation_id: row.id,
        mapping_type: "G",
        next_designation_id: "",
        group_id: groupIdMap.get(String(row.groupId)) || row.groupId,
        sort_order: 1,
      });
    }
  }

  // Re-read after writing so the client receives persisted IDs and values.
  return loadData(tables, cycle);
}

module.exports = async function designationMasterApi(req, res) {
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  try {
    if (req.method !== "GET" && req.method !== "POST") {
      return sendJson(res, 405, { success: false, message: "Method not allowed." });
    }

    const { adminApp, actor } = await checkAccess(req, req.method);
    const tables = tableSet(adminApp);
    const cycle = await getActiveCycle(tables);

    if (req.method === "GET") {
      const data = await loadData(tables, cycle);
      return sendJson(res, 200, { success: true, data });
    }

    const payload = await readBody(req);
    if (payload.cycleId && String(payload.cycleId) !== cycle.id) {
      return sendJson(res, 409, {
        success: false,
        message: "The appraisal cycle changed. Refresh Designation Master before saving.",
      });
    }

    const data = await saveData(tables, cycle, actor, payload);
    return sendJson(res, 200, { success: true, data });
  } catch (error) {
    const status = error.status || (error instanceof SyntaxError ? 400 : 500);
    console.error("designationmasterapi:", error.message, error.stack || "");
    return sendJson(res, status, { success: false, message: error.message || "Designation Master failed." });
  }
};