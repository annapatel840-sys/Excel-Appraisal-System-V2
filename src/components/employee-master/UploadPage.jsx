import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import { useCatalystUser } from "@/lib/catalyst-auth";
import {
  FIELD_DEFS,
  fetchAllEmployeeMasterEmployees,
  createEmployeeMasterEmployees,
} from "@/lib/employee-master-data";
import { findFieldForHeader } from "@/lib/employee-master-utils";

/* ============================================================
   CONFIG
   ============================================================ */

// Closed / archived cycles appear under "historical load" (Payroll only).
// Set to false to hide them.
const ENABLE_HISTORICAL_LOAD = true;
const ERR_PAGE_SIZE = 20;

const MONTH_FIELDS = new Set(["rbMonth", "pbMonth"]);
const MONTH_NAMES = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

// Employee Master field key -> Catalyst column (same mapping as EmployeeMaster.jsx)
const EM_TO_CATALYST = {
  name: "emp_name",
  designation: "designation",
  organization: "department",
  doj: "date_of_join",
  orgExp: "wissen_experience",
  totalExp: "total_experience",
  reportingManager: "repo_manager",
  compManager: "director",
  appraiser: "appraiser_tech_ed",
  managerMail: "email_id",
  superManagerMail: "super_man_email_id",
  status: "emp_status",
};

/* ============================================================
   FIELD DEFINITIONS (one list per upload type)
   ============================================================ */

const EMP_FIELDS = [
  { key: "empId", label: "Employee ID", required: true },
  ...FIELD_DEFS.filter((f) => EM_TO_CATALYST[f.key]).map((f) => ({
    key: f.key,
    label: f.label,
  })),
];

// Keys must stay the same: the payroll backend validates these.
const PAY_FIELDS = [
  // Employee ID is always the first payroll upload column; it must never drift to the end.
  { key: "empId", label: "Employee ID", required: true },
  // Keep payroll upload in the same pay-field order as Payroll Data.
  { key: "hikePct", label: "Hike %" },
  { key: "totalBonus", label: "Total Bonus" },
  { key: "totalPB", label: "Total PB" },
  { key: "newBasePay", label: "New Base Pay" },
  { key: "totalCtc", label: "Total CTC" },
  { key: "basePay", label: "Current Annual Base Pay" },
  { key: "joiningBonus", label: "Joining Bonus" },
  { key: "targetPB", label: "Target PB Allocated for May" },
  { key: "rbPaid", label: "RB to be Paid" },
  { key: "pbPaid", label: "PB to be Paid" },
  { key: "allocPB", label: "Allocated PB Amount" },
  { key: "allocInst", label: "Inst. (Allocated PB)" },
  { key: "newPB", label: "New PB to be Offered" },
  { key: "newPBInst", label: "Inst. (New PB)" },
  { key: "newRB", label: "New RB" },
  { key: "hikeAmt", label: "Hike Amount" },
  { key: "tpbNext", label: "Target PB for Next Year" },
];

const FB_FIELDS = [
  { key: "empId", label: "Employee ID", required: true },
  { key: "managerRating", label: "Manager Rating" },
  { key: "managerFeedback", label: "Manager Feedback" },
  { key: "rrPercent", label: "RR%" },
  { key: "interviewCount", label: "Interview Count" },
  { key: "grossMargin", label: "Gross Margin" },
  { key: "costCenter", label: "Cost Center/Client" },
  { key: "clientManager", label: "Client Manager" },
  { key: "clientRating", label: "Client Rating" },
  { key: "clientFeedback", label: "Client Feedback" },
  { key: "atRisk", label: "At Risk" },
];

const SHEET_FIELDS = [
  { key: "empId", label: "Employee ID", required: true },
  { key: "newRB", label: "Retention Bonus (RB)" },
  { key: "rbMonth", label: "Month (RB)" },
  { key: "newPB", label: "Performance Bonus (PB)" },
  { key: "pbMonth", label: "Month (PB)" },
  { key: "newPBInst", label: "Instalment" },
  { key: "hikeAmt", label: "Hike Amount" },
  { key: "hikePct", label: "Hike%" },
  { key: "tpbNext", label: "Target PB for Next Year" },
  { key: "criteria", label: "Target PB criteria" },
  { key: "promo", label: "Eligible for Promotion" },
  { key: "newTitle", label: "New Title" },
  { key: "remarks", label: "Comp Manager Remarks" },
];

const UPLOADS = {
  emp: {
    label: "Employee Master",
    short: "EM",
    desc: "The roster: one row per employee.",
    fields: EMP_FIELDS,
    rules: [
      "Employee ID is the key; one row per employee. A repeated ID in the file is an error.",
      "Employees already in the master are updated; new ones are added. A new employee needs a name.",
      "Status must be Active or Inactive.",
      "Match your file's columns to the template. A field set to Skip keeps its current value.",
      "Appraiser / Tech ED written as a bare name is matched to one employee, or left unchanged.",
    ],
  },
  pay: {
    label: "Payroll",
    short: "PY",
    desc: "Entry and calculated pay values only. Employee ID identifies the row.",
    fields: PAY_FIELDS,
    rules: [
      "Employee ID is required and is matched against the Employee Master.",
      "The upload contains only pay/price entry values and calculated pay values.",
      "If a calculated value is present in the file, it is stored as supplied. If it is blank, the server derives it.",
      "Historical payroll matches by Employee ID + appraisal cycle; Apr-26 is not touched when another cycle is uploaded.",
      "Match your file's columns to the template; non-payroll employee details are not part of this upload.",
      "Payroll batches can be undone from History when the batch inserted new rows only.",
    ],
  },
  fb: {
    label: "Feedback & Rating",
    short: "FR",
    desc: "Ratings and feedback for the cycle.",
    fields: FB_FIELDS,
    rules: [
      "Employee ID must exist in the Employee Master.",
      "Ratings are numbers between 0 and 5 (decimals allowed).",
      "RR%, Interview Count and Gross Margin must be numbers.",
      "Skip a field to leave it as it is. One row per employee.",
    ],
  },
  sheet: {
    label: "Appraisal Sheet",
    short: "AS",
    desc: "For Tech EDs who work offline. Fill the sheet, upload it back.",
    fields: SHEET_FIELDS,
    rules: [
      "For the current Annual cycle only (open).",
      "Amounts must be numbers of zero or more.",
      "Eligible for Promotion must be Yes or No.",
      "Months must be Jan, Feb …",
      "Server-side rules (RB / PB not below the to-be-paid amounts, team scope) are applied when the upload is saved.",
    ],
  },
};
const ORDER = ["emp", "pay", "fb", "sheet"];

/* ============================================================
   HELPERS
   ============================================================ */

const sv = (v) => String(v ?? "").trim();
const norm = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9%]/g, "");
const normId = (s) => sv(s).toLowerCase();
const isNum = (v) =>
  sv(v) !== "" && !Number.isNaN(Number(sv(v).replace(/[₹,%\s]/g, "")));
const toNum = (v) => Number(sv(v).replace(/[₹,%\s]/g, ""));
const typeOf = (name) =>
  /^annual/i.test(String(name || ""))
    ? "Annual"
    : String(name || "").split(" ")[0];
const isOpenCycle = (c) =>
  !!c && !c.archived && (c.status === "Upcoming" || c.status === "Active");
const nextBatchId = () =>
  `BATCH-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${crypto.randomUUID().slice(0, 8)}`;

function normalizeCell(field, value) {
  if (!MONTH_FIELDS.has(field)) return value;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${MONTH_NAMES[value.getMonth()]}-${String(value.getFullYear()).slice(-2)}`;
  }
  if (typeof value === "number" && value > 0 && value < 2958466) {
    const p = XLSX.SSF.parse_date_code(value);
    if (p && p.m >= 1 && p.m <= 12)
      return `${MONTH_NAMES[p.m - 1]}-${String(p.y).slice(-2)}`;
  }
  return value;
}

function isMonth(v) {
  const s = sv(v);
  return MONTH_NAMES.some((m) => s.toLowerCase().startsWith(m.toLowerCase()));
}

function autoMap(type, fields, headers) {
  const map = {};
  const used = new Set();
  fields.forEach((f) => {
    let idx = headers.findIndex(
      (h, i) =>
        !used.has(i) && (norm(h) === norm(f.label) || norm(h) === norm(f.key)),
    );
    if (idx < 0 && type === "emp") {
      idx = headers.findIndex(
        (h, i) => !used.has(i) && findFieldForHeader(h)?.key === f.key,
      );
    }
    map[f.key] = idx;
    if (idx >= 0) used.add(idx);
  });
  return map;
}

function downloadCsv(name, rows) {
  const cell = (value) => {
    const t = String(value ?? "");
    const safe = /^[\s]*[=+\-@]/.test(t) ? `'${t}` : t;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const csv = rows.map((r) => r.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(
    new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

const downloadErrorLog = (errors, name) =>
  downloadCsv(name, [
    ["Row", "Employee ID", "Column", "What is wrong"],
    ...errors.map((e) => [e.row, e.id, e.col, e.msg]),
  ]);

/* ============================================================
   COMPONENT
   handlers (optional): { fb, sheet } -> async ({cycleId,batchId,fileName,records}) => ({succeeded, failed})
   Until they are provided, Feedback and Appraisal Sheet uploads are
   checked but cannot be saved.
   ============================================================ */

export function UploadPage({ handlers = {} }) {
  const user = useCatalystUser();
  const role = String(user?.role || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const isHR = role === "hr" || role === "appadministrator";
  const canPayroll = role === "hr" || role === "compmanager";
  const roleName = user?.name || user?.email || "—";

  const [schemaTables, setSchemaTables] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [loadToken, setLoadToken] = useState(0);

  const [cycleId, setCycleId] = useState("");
  const [screen, setScreen] = useState("");
  const [file, setFile] = useState(null); // { name, headers, rows:[{row,cells}] }
  const [map, setMap] = useState({});
  const [res, setRes] = useState(null); // { errors, nw, rep, headerError }
  const [outcome, setOutcome] = useState(null);
  const [batchId, setBatchId] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [tab, setTab] = useState("rules");
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [local, setLocal] = useState([]);
  const [toast, setToast] = useState("");
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef(null);
  const empCache = useRef([]);
  const lastRejected = useRef("");
  const toastTimer = useRef(null);

  const say = (message) => {
    setToast(message);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2600);
  };

  /* ---------------- load ---------------- */

  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    Promise.all([
      payrollCycleRequest("cycles"),
      payrollCycleRequest("history").catch(() => []),
      payrollCycleRequest("schema").catch(() => []),
    ])
      .then(([cycleData, historyData, schemaData]) => {
        if (!active) return;
        const nextCycles = Array.isArray(cycleData) ? cycleData : [];
        setCycles(nextCycles);
        setHistory(Array.isArray(historyData) ? historyData : []);
        setSchemaTables(Array.isArray(schemaData) ? schemaData : []);
        setCycleId((current) => {
          if (current) return current;
          const first = nextCycles.find(isOpenCycle);
          return first ? String(first.id) : "";
        });
      })
      .catch((e) => active && setLoadError(e.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [loadToken]);

  const cycle = cycles.find((c) => String(c.id) === String(cycleId)) || null;
  const open = isOpenCycle(cycle);
  const openCycles = cycles.filter(isOpenCycle);
  const histCycles =
    ENABLE_HISTORICAL_LOAD && canPayroll
      ? cycles.filter((c) => !isOpenCycle(c))
      : [];

  const availability = (key) => {
    if (!cycle) return { ok: false, why: "Pick a cycle" };
    if (key === "pay") {
      if (!canPayroll) return { ok: false, why: "HR or Comp Manager only" };
      if (open) return { ok: true };
      return ENABLE_HISTORICAL_LOAD
        ? { ok: true, hist: true }
        : { ok: false, why: "Open cycles only" };
    }
    if (key === "sheet") {
      if (!open) return { ok: false, why: "Open cycles only" };
      if (typeOf(cycle.name) !== "Annual")
        return { ok: false, why: "Current Annual cycle only" };
      return { ok: true };
    }
    if (!isHR) return { ok: false, why: "HR only" };
    if (!open) return { ok: false, why: "Open cycles only" };
    return { ok: true };
  };

  const def = screen ? UPLOADS[screen] : null;

  const schemaTable = useMemo(() => {
    const wanted = screen === "emp" ? "Employee_Master" : screen === "pay" ? "payroll" : "Employees";
    return schemaTables.find((table) => String(table.name).toLowerCase() === wanted.toLowerCase()) || null;
  }, [schemaTables, screen]);

  const fields = useMemo(() => {
    const base = def?.fields || [];
    // Payroll upload is intentionally limited to pay entry/calculation fields.
    // Do not append arbitrary Data Store columns here.
    if (screen === "pay") return base;
    if (!schemaTable?.columns?.length) return base;
    const knownColumns = new Set(base.map((field) => field.column || EM_TO_CATALYST[field.key] || field.key));
    const hidden = new Set(["ROWID", "CREATORID", "CREATEDTIME", "MODIFIEDTIME", "appraisal_cycle_id", "source_batch", "source_file", "emp_master_row_id", "emp_row_id"]);
    const extras = schemaTable.columns.filter((column) => !hidden.has(column.name) && !knownColumns.has(column.name)).map((column) => ({
      key: column.name,
      column: column.name,
      label: column.label || column.name,
      required: column.mandatory === true,
      schemaType: column.type,
    }));
    return [...base, ...extras];
  }, [def, schemaTable]);
  const labelOf = (key) => fields.find((f) => f.key === key)?.label || key;

  /* ---------------- file ---------------- */

  const resetFile = () => {
    setFile(null);
    setMap({});
    setRes(null);
    setOutcome(null);
    setBatchId("");
    setError("");
    setPage(1);
    setQ("");
  };

  const chooseCycle = (id) => {
    setCycleId(id);
    const next = cycles.find((c) => String(c.id) === String(id));
    resetFile();
    if (!isOpenCycle(next)) setScreen("pay");
    else if (screen && !["emp", "pay", "fb", "sheet"].includes(screen))
      setScreen("");
  };

  const chooseScreen = (key) => {
    if (!availability(key).ok) return;
    setScreen(key);
    resetFile();
    setTab("rules");
  };

  const readFile = async (f) => {
    if (!f || !screen) return;
    setError("");
    try {
      const ext = f.name.split(".").pop()?.toLowerCase();
      if (!["xlsx", "xls", "csv"].includes(ext))
        throw new Error("Choose an Excel or CSV file.");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet)
        throw new Error("The selected file does not contain a worksheet.");
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
      const headers = (rows.shift() || []).map((h) => String(h || "").trim());
      if (!headers.some(Boolean))
        throw new Error("The worksheet is missing its header row.");
      const dataRows = rows
        .map((cells, i) => ({ row: i + 2, cells }))
        .filter(({ cells }) => cells.some((v) => v !== ""));
      if (!dataRows.length)
        throw new Error("The file has a header row but no data rows.");
      setFile({ name: f.name, headers, rows: dataRows });
      setMap(autoMap(screen, fields, headers));
      setRes(null);
      setOutcome(null);
      setPage(1);
      setQ("");
    } catch (e) {
      setError(e.message || "Unable to read the selected file.");
    }
  };

  const downloadTemplate = () => {
    const sheet = XLSX.utils.aoa_to_sheet([fields.map((f) => f.label)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, def.label.slice(0, 28));
    XLSX.writeFile(
      wb,
      `${def.label.replace(/[^A-Za-z]+/g, "_")}_template.xlsx`,
    );
    say("Template downloaded");
  };

  const buildRecords = () =>
    file.rows.map(({ row, cells }) => {
      const record = { row };
      fields.forEach((f) => {
        const idx = map[f.key];
        if (idx >= 0) record[f.key] = normalizeCell(f.key, cells[idx]);
      });
      return record;
    });

  const missingRequired = fields.filter(
    (f) => f.required && !(map[f.key] >= 0),
  );

  /* ---------------- client-side checks (emp / fb / sheet) ---------------- */

  const clientValidate = async (records) => {
    const errors = [];
    const E = (r, col, msg) =>
      errors.push({ row: r.row, id: sv(r.empId), col, msg });
    const seen = new Map();
    records.forEach((r) => {
      const id = sv(r.empId);
      if (!id) return E(r, "Employee ID", "Empty — Employee ID is required");
      const k = normId(id);
      if (seen.has(k))
        E(
          r,
          "Employee ID",
          `Duplicate Employee ID — already on row ${seen.get(k)}`,
        );
      else seen.set(k, r.row);
    });

    let nw = 0;
    let rep = 0;

    if (screen === "emp" || screen === "fb") {
      const employees = await fetchAllEmployeeMasterEmployees();
      empCache.current = employees;
      const byId = new Map(employees.map((e) => [normId(e.empId), e]));

      records.forEach((r) => {
        const id = sv(r.empId);
        if (!id) return;
        const existing = byId.get(normId(id));

        if (screen === "emp") {
          if (existing) rep += 1;
          else nw += 1;
          if (
            sv(r.status) &&
            !["active", "inactive"].includes(sv(r.status).toLowerCase())
          )
            E(r, "Status", "Must be Active or Inactive");
          if (!existing && !sv(r.name))
            E(r, "Name", "Empty — a new employee needs a name");
        } else {
          if (!existing) E(r, "Employee ID", "Not found in Employee Master");
          ["managerRating", "clientRating"].forEach((k) => {
            if (sv(r[k]) === "") return;
            if (!isNum(r[k])) E(r, labelOf(k), "Must be a number");
            else if (toNum(r[k]) < 0 || toNum(r[k]) > 5)
              E(r, labelOf(k), "Rating must be between 0 and 5");
          });
          ["rrPercent", "interviewCount", "grossMargin"].forEach((k) => {
            if (sv(r[k]) !== "" && !isNum(r[k]))
              E(r, labelOf(k), "Must be a number");
          });
        }
      });
    } else {
      records.forEach((r) => {
        [
          "newRB",
          "newPB",
          "newPBInst",
          "hikeAmt",
          "hikePct",
          "tpbNext",
        ].forEach((k) => {
          if (sv(r[k]) === "") return;
          if (!isNum(r[k])) E(r, labelOf(k), "Must be a number");
          else if (toNum(r[k]) < 0) E(r, labelOf(k), "Must be zero or more");
        });
        ["rbMonth", "pbMonth"].forEach((k) => {
          if (sv(r[k]) !== "" && !isMonth(r[k]))
            E(r, labelOf(k), "Not a month (use Jan, Feb …)");
        });
        if (
          sv(r.promo) !== "" &&
          !["yes", "no"].includes(sv(r.promo).toLowerCase())
        )
          E(r, "Eligible for Promotion", "Must be Yes or No");
      });
    }
    return { errors, nw, rep };
  };

  /* ---------------- check ---------------- */

  const logRejected = (errors) => {
    const key = `${file.name}|${errors.length}|${screen}|${cycleId}`;
    if (lastRejected.current === key) return;
    lastRejected.current = key;
    setLocal((l) => [
      {
        id: `REJ-${Date.now()}`,
        screen,
        cycle: cycle?.name || "",
        file: file.name,
        by: roleName,
        at: new Date().toLocaleString("en-IN"),
        status: "Rejected",
        errors,
      },
      ...l,
    ]);
  };

  const runCheck = async () => {
    if (!file || !screen || busy) return;
    setError("");
    setOutcome(null);
    setPage(1);
    setQ("");

    if (missingRequired.length) {
      setRes({
        headerError: true,
        nw: 0,
        rep: 0,
        errors: [
          {
            row: 1,
            id: "",
            col: "Mapping",
            msg: `Map ${missingRequired.map((f) => f.label).join(" and ")} to a column in your file`,
          },
        ],
      });
      return;
    }

    setBusy("check");
    try {
      const records = buildRecords();
      const id = nextBatchId();
      setBatchId(id);
      let result;

      if (screen === "pay") {
        const server = await payrollCycleRequest("validate", {
          method: "POST",
          body: { cycleId, batchId: id, fileName: file.name, records },
        });
        const byRow = new Map(records.map((r) => [r.row, r]));
        result = {
          nw: 0,
          rep: 0,
          errors: server.rows
            .filter((r) => r.ok === false)
            .map((r) => ({
              row: r.row,
              id: sv(byRow.get(r.row)?.empId),
              col: (r.badFields || []).map(labelOf).join(", ") || "—",
              msg: r.reason || "Invalid",
            })),
        };
      } else {
        result = await clientValidate(records);
      }

      setRes({ ...result, headerError: false });
      if (result.errors.length) logRejected(result.errors);
    } catch (e) {
      setError(e.message || "The file could not be checked.");
    } finally {
      setBusy("");
    }
  };

  /* ---------------- upload ---------------- */

  const empPayloads = (records) => {
    const byName = new Map();
    empCache.current.forEach((e) => {
      const k = sv(e.name).toLowerCase();
      if (k) byName.set(k, [...(byName.get(k) || []), e]);
    });
    return records.map((r) => {
      const payload = { emp_id: sv(r.empId) };
      EMP_FIELDS.forEach((f) => {
        if (f.key === "empId" || r[f.key] === undefined) return;
        let value = sv(r[f.key]);
        if (!value) return;
        if (f.key === "status")
          value = value.toLowerCase() === "active" ? "Active" : "Inactive";
        if (f.key === "appraiser" && !/^\s*[A-Za-z]*\d+\s+-\s+\S/.test(value)) {
          const matches = byName.get(value.toLowerCase()) || [];
          if (matches.length !== 1) return; // not matched: leave unchanged
          value = `${matches[0].empId} - ${matches[0].name}`;
        }
        payload[f.column || EM_TO_CATALYST[f.key] || f.key] = value;
      });
      return payload;
    });
  };

  const runUpload = async () => {
    if (!res || (res.errors.length === 0 && false)) return;
    if (!file || busy) return;
    setBusy("upload");
    setError("");
    try {
      const records = buildRecords();
      let out;

      if (screen === "pay") {
        const result = await payrollCycleRequest("commit", {
          method: "POST",
          body: { cycleId, batchId, fileName: file.name, records },
        });
        const byRow = new Map(records.map((r) => [r.row, r]));
        setRes((prev) => ({
          ...prev,
          errors: result.rows
            .filter((r) => r.ok === false)
            .map((r) => ({
              row: r.row,
              id: sv(byRow.get(r.row)?.empId),
              col: (r.badFields || []).map(labelOf).join(", ") || "—",
              msg: r.reason || "Invalid",
            })),
        }));
        out = {
          batchId: result.batchId || batchId,
          total: result.total,
          succeeded: result.succeeded,
          failed: result.failed,
        };
        try {
          setHistory(await payrollCycleRequest("history"));
        } catch (e) {
          setError(
            `Upload succeeded, but upload history could not be refreshed: ${e.message}`,
          );
        }
      } else if (screen === "emp") {
        const failedRows = new Set(res.errors.map((e) => e.row));
        const good = records.filter((r) => !failedRows.has(r.row));
        const result = await createEmployeeMasterEmployees(empPayloads(good));
        const created = result?.data?.created || 0;
        const updated = result?.data?.updated || 0;
        out = {
          batchId,
          total: records.length,
          succeeded: created + updated,
          failed: records.length - created - updated,
        };
      } else {
        const failedRows = new Set(res.errors.map((e) => e.row));
        const response = await payrollCycleRequest("import", {
          method: "POST",
          body: {
            screen,
            cycleId,
            batchId,
            fileName: file.name,
            records: records.filter((x) => !failedRows.has(x.row)),
          },
        });
        const r = response || {};
        out = {
          batchId: r.batchId || batchId,
          total: records.length,
          succeeded: r.succeeded ?? records.length - failedRows.size,
          failed: r.failed ?? failedRows.size,
        };
      }

      setOutcome(out);
      if (screen !== "pay") {
        setLocal((l) => [
          {
            id: out.batchId,
            screen,
            cycle: cycle?.name || "",
            file: file.name,
            by: roleName,
            at: new Date().toLocaleString("en-IN"),
            status: "Uploaded",
            ok: out.succeeded,
            fail: out.failed,
          },
          ...l,
        ]);
      }
      setTab("hist");
      say(`Uploaded ${out.succeeded} of ${out.total} rows`);
    } catch (e) {
      setError(e.message || "The upload failed.");
    } finally {
      setBusy("");
    }
  };

  const undoBatch = async (batch) => {
    if (!batch.undoable || busy) return;
    const ok = window.confirm(
      `Undo batch ${batch.batchId}? This permanently removes its ${batch.succeeded} payroll row${batch.succeeded === 1 ? "" : "s"}.`,
    );
    if (!ok) return;
    setBusy(`undo:${batch.batchId}`);
    setError("");
    try {
      await payrollCycleRequest("undo", {
        method: "POST",
        body: { batchId: batch.batchId },
      });
      setHistory(await payrollCycleRequest("history"));
      say(`Undid ${batch.batchId}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  };

  /* ---------------- derived for rendering ---------------- */

  const errors = res?.errors || [];
  const badRows = new Set(errors.map((e) => e.row)).size;
  const totalRows = file?.rows.length || 0;
  const readyRows = res ? (res.headerError ? 0 : totalRows - badRows) : 0;
  const unmapped = fields.filter((f) => !(map[f.key] >= 0)).length;
  const filtered = useMemo(
    () =>
      errors.filter((e) =>
        `${e.row} ${e.id} ${e.col} ${e.msg}`
          .toLowerCase()
          .includes(q.toLowerCase()),
      ),
    [errors, q],
  );
  const pages = Math.max(1, Math.ceil(filtered.length / ERR_PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const slice = filtered.slice(
    (safePage - 1) * ERR_PAGE_SIZE,
    safePage * ERR_PAGE_SIZE,
  );
  const canUpload =
    !!res && !res.headerError && readyRows > 0 && !outcome && !busy;

  /* ---------------- render ---------------- */

  const renderMapping = () => {
    const used = new Set(Object.values(map).filter((v) => v >= 0));
    return (
      <div className="up-mapbox">
        <div className="mh">
          <b>Match your file to the template</b>
          <span>
            Columns with the same name are matched for you. Set a field to
            “Skip” to leave it out of this upload.
          </span>
        </div>
        <div className="mgrid">
          {fields.map((f) => {
            const v = map[f.key];
            return (
              <div className="mrow" key={f.key}>
                <div className="mf">
                  {f.label}
                  {f.required && <i className="req">required</i>}
                </div>
                <div className="ma">→</div>
                <select
                  className={v >= 0 ? "mapped" : f.required ? "need" : ""}
                  value={v ?? -1}
                  onChange={(e) => {
                    setMap((m) => ({ ...m, [f.key]: Number(e.target.value) }));
                    setRes(null);
                    setOutcome(null);
                  }}
                >
                  <option value={-1}>
                    {f.required ? "— choose a column —" : "Skip"}
                  </option>
                  {file.headers.map((h, i) => (
                    <option key={i} value={i}>
                      {h || "(blank header)"}
                      {used.has(i) && v !== i ? " · already used" : ""}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
        {(() => {
          const notUsed = file.headers.filter((h, i) => h && !used.has(i));
          return notUsed.length ? (
            <div className="munused">Not used: {notUsed.join(", ")}</div>
          ) : null;
        })()}
      </div>
    );
  };

  const renderSection4 = () => {
    if (!file) {
      return (
        <div className="up-callout">
          <div className="b">
            Choose a file to see the check result here.
            <small>Row counts and the error log appear in this section.</small>
          </div>
        </div>
      );
    }
    if (!res) {
      return (
        <div>
          <div className="up-callout">
            <div className="b">
              {totalRows} row{totalRows === 1 ? "" : "s"} read from {file.name}.
              <small>
                Check the mapping above, then check the file. Nothing is saved
                yet.
              </small>
            </div>
          </div>
          <div className="up-row end" style={{ marginTop: 14 }}>
            <button type="button" className="up-btn" onClick={resetFile}>
              Discard file
            </button>
            <button
              type="button"
              className="up-btn main"
              disabled={!!busy || missingRequired.length > 0}
              onClick={runCheck}
            >
              {busy === "check" ? "Checking…" : "Check file"}
            </button>
          </div>
        </div>
      );
    }
    const bad = errors.length > 0;
    return (
      <div>
        <div className="up-kpis">
          <div className="kpi">
            <div className="v">{totalRows}</div>
            <div className="k">Rows read</div>
          </div>
          <div className="kpi">
            <div className="v">{readyRows}</div>
            <div className="k">{outcome ? "Uploaded" : "Will upload"}</div>
          </div>
          <div className="kpi">
            <div className={`v${bad ? " bad" : ""}`}>
              {res.headerError ? errors.length : badRows}
            </div>
            <div className="k">{outcome ? "Failed" : "Will fail"}</div>
          </div>
          <div className="kpi">
            <div className="v">{unmapped}</div>
            <div className="k">Skipped fields</div>
          </div>
        </div>
        {screen === "emp" && !res.headerError && (
          <div className="up-row" style={{ marginTop: 8, gap: 6 }}>
            <span className="up-tag info">{res.nw} new</span>
            <span className="up-tag grey">{res.rep} existing updated</span>
          </div>
        )}

        {outcome ? (
          <div className={`up-callout ${outcome.failed === 0 ? "ok" : "warn"}`}>
            <div className="b">
              {outcome.failed === 0
                ? `${outcome.succeeded} of ${outcome.total} rows uploaded successfully.`
                : `${outcome.succeeded} of ${outcome.total} rows uploaded. ${outcome.failed} failed — see the error log.`}
              <small>
                Batch <span className="up-batch">{outcome.batchId}</span> is in
                History.
                {screen === "pay" &&
                  " Calculated columns were recomputed by the database."}
              </small>
            </div>
          </div>
        ) : !bad ? (
          <div className="up-callout ok">
            <div className="b">
              The file is clean — ready to upload.
              <small>
                {screen === "emp"
                  ? "Employees in the file are added or updated; skipped fields keep their current values."
                  : "Every row passed the checks."}
              </small>
            </div>
          </div>
        ) : (
          <div className="up-callout warn">
            <div className="b">
              {res.headerError
                ? "Fix the mapping before the file can be checked."
                : readyRows > 0
                  ? `${readyRows} valid row${readyRows === 1 ? "" : "s"} can upload; the ${badRows} failing row${badRows === 1 ? "" : "s"} will be skipped.`
                  : "Nothing can upload until the errors below are fixed."}
              <small>
                Fix the file and choose it again. Rejected files are kept in
                History with their error log.
              </small>
            </div>
          </div>
        )}

        {bad && (
          <>
            <div className="up-tools">
              <span className="up-chip">Error log</span>
              <input
                className="up-in"
                placeholder="Search error log"
                value={q}
                style={{ width: 230 }}
                onChange={(e) => {
                  setQ(e.target.value);
                  setPage(1);
                }}
              />
              <span style={{ flex: 1 }} />
              <button
                type="button"
                className="up-btn sm"
                onClick={() =>
                  downloadErrorLog(
                    errors,
                    `error_log_${batchId || "upload"}.csv`,
                  )
                }
              >
                ↓ Download error log
              </button>
            </div>
            <div className="up-gridw">
              <table className="up-g">
                <thead>
                  <tr>
                    <th>Row</th>
                    <th>Employee ID</th>
                    <th>Column</th>
                    <th>What is wrong</th>
                  </tr>
                </thead>
                <tbody>
                  {slice.map((e, i) => (
                    <tr key={`${e.row}-${e.col}-${i}`}>
                      <td className="rl">{e.row}</td>
                      <td className="col">{e.id || "—"}</td>
                      <td className="col err">{e.col}</td>
                      <td>{e.msg}</td>
                    </tr>
                  ))}
                  {!slice.length && (
                    <tr>
                      <td colSpan={4} className="mut">
                        No error matches the search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="up-pg">
              <span>
                {filtered.length} error{filtered.length === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                className="up-btn sm"
                disabled={safePage <= 1}
                onClick={() => setPage(safePage - 1)}
              >
                ‹
              </button>
              <span>
                Page {safePage} of {pages}
              </span>
              <button
                type="button"
                className="up-btn sm"
                disabled={safePage >= pages}
                onClick={() => setPage(safePage + 1)}
              >
                ›
              </button>
            </div>
          </>
        )}

        <div className="up-row end" style={{ marginTop: 14 }}>
          <button type="button" className="up-btn" onClick={resetFile}>
            {outcome ? "Upload another file" : "Discard file"}
          </button>
          {!outcome && (
            <button
              type="button"
              className="up-btn main"
              disabled={!canUpload}
              onClick={runUpload}
            >
              {busy === "upload" ? "Uploading…" : "Upload"}
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderSide = () => {
    if (tab === "rules") {
      return !def ? (
        <div className="up-blk x">
          <div className="ln">Pick an upload in step 2</div>
          <div className="sub">Its checks are listed here.</div>
        </div>
      ) : (
        <>
          <div className="up-h3">What is checked — {def.label}</div>
          {def.rules.map((r, i) => (
            <div key={i} className="up-blk">
              <div className="ln">{r}</div>
            </div>
          ))}
        </>
      );
    }
    if (tab === "hist") {
      return (
        <>
          <div className="up-h3">Upload history</div>
          {local.map((b) => (
            <div
              key={b.id}
              className={`up-blk ${b.status === "Rejected" ? "a" : ""}`}
            >
              <div className="top">
                <span
                  className={`up-tag ${b.status === "Rejected" ? "warn" : "ok"}`}
                >
                  {b.status}
                </span>
                <span className="mut">{b.id}</span>
              </div>
              <div className="ln">
                {UPLOADS[b.screen].label} · {b.cycle}
              </div>
              <div className="sub">
                {b.file}
                <br />
                {b.by} · {b.at}
                <br />
                {b.status === "Rejected"
                  ? `${b.errors.length} errors`
                  : `${b.ok} uploaded · ${b.fail} failed`}
              </div>
              {b.status === "Rejected" && (
                <div className="act">
                  <button
                    type="button"
                    className="up-btn sm"
                    onClick={() =>
                      downloadErrorLog(b.errors, `error_log_${b.id}.csv`)
                    }
                  >
                    ↓ Error log
                  </button>
                </div>
              )}
            </div>
          ))}
          {history.map((h) => (
            <div key={h.batchId + h.uploaded} className="up-blk">
              <div className="top">
                <span className="up-tag ok">Uploaded</span>
                <span className="mut">{h.batchId}</span>
              </div>
              <div className="ln">Payroll</div>
              <div className="sub">
                {h.file}
                <br />
                {h.uploaded}
                <br />
                {h.succeeded} succeeded · {h.failed} failed
              </div>
              {h.undoable && (
                <div className="act">
                  <button
                    type="button"
                    className="up-btn sm"
                    disabled={!!busy}
                    onClick={() => undoBatch(h)}
                  >
                    {busy === `undo:${h.batchId}` ? "Undoing…" : "Undo"}
                  </button>
                </div>
              )}
            </div>
          ))}
          {!local.length && !history.length && (
            <div className="up-blk x">
              <div className="ln">No uploads yet</div>
            </div>
          )}
        </>
      );
    }
    return (
      <>
        <div className="up-h3">Appraisal Sheet versions</div>
        <div className="up-blk x">
          <div className="ln">No versions yet</div>
          <div className="sub">
            Versions (go back to an earlier sheet) appear here once the
            Appraisal Sheet upload is connected to a backend.
          </div>
        </div>
      </>
    );
  };

  return (
    <div className="up">
      <style>{CSS}</style>

      <div className="up-strip">
        <span className="i">ⓘ</span>
        <span>
          Pick a cycle, pick what you are uploading, download the template, then
          upload. Nothing is saved until you press Upload.
        </span>
      </div>

      {loading && (
        <div className="up-note">Loading cycles and upload history…</div>
      )}
      {loadError && (
        <div className="up-callout warn" style={{ margin: "10px 12px 0" }}>
          <div className="b">{loadError}</div>
          <button
            type="button"
            className="up-btn sm"
            onClick={() => setLoadToken((t) => t + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {error && (
        <div className="up-callout warn" style={{ margin: "10px 12px 0" }}>
          <div className="b">{error}</div>
        </div>
      )}

      <div className="up-work">
        <div className="up-pane up-main">
          <div className="up-ph">
            <h2>Upload data</h2>
            <span className="note">
              {def && cycle
                ? `${def.label} · ${cycle.name}`
                : "One place for every upload"}
            </span>
          </div>

          {/* 1 */}
          <div className="up-sec">
            <span className="up-chip">1 · Appraisal cycle</span>
            <div className="up-row" style={{ marginTop: 10 }}>
              <div>
                <label className="up-lbl" htmlFor="up-cycle">
                  Cycle to upload into
                </label>
                <select
                  id="up-cycle"
                  className="up-in sel"
                  value={cycleId}
                  disabled={loading || !!loadError}
                  onChange={(e) => chooseCycle(e.target.value)}
                >
                  <option value="">— Select appraisal cycle —</option>
                  <optgroup label="Open cycles">
                    {openCycles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} — {c.status}
                      </option>
                    ))}
                  </optgroup>
                  {histCycles.length > 0 && (
                    <optgroup label="Closed — historical load (Payroll only)">
                      {histCycles.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} — {c.archived ? "Archived" : c.status}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              {cycle && (
                <div className="up-row" style={{ gap: 6, marginTop: 16 }}>
                  <span className="up-tag info">{typeOf(cycle.name)}</span>
                  <span className={`up-tag ${open ? "ok" : "grey"}`}>
                    {cycle.archived ? "Archived" : cycle.status}
                  </span>
                  {!open && <span className="up-tag chg">Historical load</span>}
                </div>
              )}
            </div>
            {!loading && !loadError && cycles.length === 0 && (
              <div className="up-note">
                No appraisal cycles are available. Create a cycle before
                uploading.
              </div>
            )}
          </div>
          <div className="up-wc" />

          {/* 2 */}
          <div className="up-sec">
            <span className="up-chip">2 · What are you uploading?</span>
            <div className="up-tiles">
              {ORDER.map((k) => {
                const a = availability(k);
                const t = UPLOADS[k];
                return (
                  <button
                    key={k}
                    type="button"
                    disabled={!a.ok}
                    className={`up-tile${screen === k ? " sel" : ""}${a.ok ? "" : " dis"}`}
                    onClick={() => chooseScreen(k)}
                  >
                    <div className="ic">{t.short}</div>
                    <h3>{t.label}</h3>
                    <p>{t.desc}</p>
                    {a.ok ? (
                      a.hist ? (
                        <div className="why">
                          <span className="up-tag chg">Historical load</span>
                        </div>
                      ) : null
                    ) : (
                      <div className="why">
                        <span className="up-tag grey">{a.why}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="up-wc" />

          {/* 3 */}
          <div className="up-sec">
            <span className="up-chip">3 · Template and file</span>
            {!def ? (
              <div className="up-callout">
                <div className="b">
                  Pick what you are uploading in step 2.
                  <small>The template and file box appear here.</small>
                </div>
              </div>
            ) : (
              <>
                <div className="up-row" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="up-btn pri"
                    onClick={downloadTemplate}
                  >
                    ↓ Download template
                  </button>
                  <span className="mut2">
                    {fields.length} columns. The columns of your file are
                    matched to these below.
                  </span>
                </div>
                {screen === "pay" && !open && (
                  <div className="up-callout">
                    <div className="b">
                      Historical load for {cycle?.name}.
                      <small>Rows are written against this closed cycle.</small>
                    </div>
                  </div>
                )}
                <div
                  className={`up-drop${dragOver ? " over" : ""}`}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    readFile(e.dataTransfer.files?.[0]);
                  }}
                >
                  <b>Drag the file here, or browse</b>
                  <span>.csv or .xlsx · one file per upload</span>
                  <div style={{ marginTop: 12 }}>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx,.xls,.csv"
                      hidden
                      onChange={(e) => {
                        readFile(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      className="up-btn"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Browse files
                    </button>
                  </div>
                </div>
                {file && (
                  <div className="up-file">
                    <span className="up-tag ok">File</span>
                    <b>{file.name}</b>
                    <span className="mut">{totalRows} rows read</span>
                    <span style={{ flex: 1 }} />
                    <button
                      type="button"
                      className="up-link"
                      onClick={resetFile}
                    >
                      Remove
                    </button>
                  </div>
                )}
                {file && renderMapping()}
              </>
            )}
          </div>
          <div className="up-wc" />

          {/* 4 */}
          <div className="up-sec">
            <span className="up-chip">4 · Check and upload</span>
            <div style={{ marginTop: 10 }}>{renderSection4()}</div>
          </div>
        </div>

        <div className="up-pane up-side">
          <div className="up-sph">
            <b>Upload help</b>
            <span>{def ? `· ${def.label}` : ""}</span>
          </div>
          <div className="up-tabs">
            {[
              ["rules", "Rules"],
              ["hist", "History"],
              ["ver", "Versions"],
            ].map(([k, l]) => (
              <button
                key={k}
                type="button"
                className={tab === k ? "on" : ""}
                onClick={() => setTab(k)}
              >
                {l}
              </button>
            ))}
          </div>
          <div className="up-spb">{renderSide()}</div>
        </div>
      </div>

      <div className={`up-toast${toast ? " on" : ""}`}>{toast}</div>
    </div>
  );
}

export default UploadPage;

/* ============================================================
   STYLES (ported from the reference HTML, scoped under .up)
   ============================================================ */

const CSS = `
.up{--ink:#111827;--muted:#6B7280;--navy:#102A43;--link:#1559A6;--gutter:#D5DFEB;--line:#E5E7EB;--pill:#27548A;--info-strip:#DCEBFF;--info-border:#B9D3F5;--th-bg:#E6EEF8;--th-line:#C9D8EC;--odd:#FBFCFE;--even:#F2F5F9;--hover:#EAF2FF;--sel:#DCEBFF;--rl:#EEF3FA;--inb:#9CA3AF;--err:#C0392B;--main:#2F6FED;--ok:#15803D;--okbg:#ECFDF3;--warn:#B7791F;--warnbg:#FEF6E7;--chg:#5B3FB0;--chgbg:#ECE7FB;--info:#1D4FA8;--infobg:#DCEBFF;--grey:#6B7280;--greybg:#F3F4F6;
font-family:Manrope,"Segoe UI",Arial,sans-serif;font-size:12.5px;color:var(--ink);width:100%}
.up *{box-sizing:border-box}
.up button,.up input,.up select{font-family:inherit}
.up-strip{background:var(--info-strip);border:1px solid var(--info-border);border-radius:10px;margin:0 0 10px;padding:8px 14px;color:var(--info);font-weight:600;display:flex;gap:10px;align-items:center}
.up-strip .i{font-weight:800}
.up-work{background:var(--gutter);border-radius:14px;padding:12px;display:flex;gap:12px;align-items:flex-start}
.up-pane{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden}
.up-ph{background:var(--navy);color:#fff;padding:11px 16px;display:flex;align-items:baseline;gap:12px}
.up-ph h2{margin:0;font-size:16px;font-weight:800}.up-ph .note{margin-left:auto;color:#AAB4C0;font-size:11.5px}
.up-main{flex:1;min-width:0}
.up-side{width:360px;flex-shrink:0}
.up-sec{padding:14px 18px}
.up-chip{display:inline-block;background:#E6EEF8;color:var(--navy);border:1px solid #C9D8EC;border-radius:6px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.5px;padding:3px 9px}
.up-wc{height:9px;border-radius:5px;background:linear-gradient(90deg,#A8E6C3,#86D3D6,#9DBDEB,#BFAEE2);margin:0 18px}
.up-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.up-row.end{justify-content:flex-end}
.up-lbl{font-size:11px;color:var(--muted);font-weight:600;display:block;margin-bottom:4px}
.up-in{border:1px solid var(--inb);border-radius:6px;padding:7px 10px;font-size:12.5px;background:#fff;color:var(--ink)}
.up-in.sel{min-width:300px;font-weight:600}
.up-note{color:var(--muted);font-size:12px;margin:8px 12px}
.mut{color:var(--muted);font-size:11px}.mut2{color:var(--muted)}
.up-tag{display:inline-block;border-radius:10px;padding:2px 9px;font-size:10.5px;font-weight:700}
.up-tag.ok{background:var(--okbg);color:var(--ok)}.up-tag.warn{background:var(--warnbg);color:var(--warn)}.up-tag.chg{background:var(--chgbg);color:var(--chg)}
.up-tag.info{background:var(--infobg);color:var(--info)}.up-tag.grey{background:var(--greybg);color:var(--grey)}
.up-tiles{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:10px;margin-top:10px}
.up-tile{border:1px solid var(--line);border-radius:10px;padding:12px 14px;background:#fff;cursor:pointer;text-align:left;transition:border-color .12s,background .12s}
.up-tile:hover:not(.dis){background:var(--hover);border-color:var(--info-border)}
.up-tile .ic{width:28px;height:28px;border-radius:8px;background:var(--th-bg);color:var(--navy);display:flex;align-items:center;justify-content:center;font-weight:800;margin-bottom:8px}
.up-tile h3{margin:0 0 3px;font-size:13px;font-weight:800;color:var(--navy)}
.up-tile p{margin:0;color:var(--muted);font-size:11.5px;line-height:1.4}
.up-tile.sel{border:2px solid var(--pill);background:#F1F6FD;padding:11px 13px}.up-tile.sel .ic{background:var(--pill);color:#fff}
.up-tile.dis{background:var(--greybg);cursor:not-allowed}.up-tile.dis h3{color:#9CA3AF}.up-tile .why{margin-top:7px}
.up-btn{border-radius:6px;padding:8px 14px;font-size:12px;font-weight:700;cursor:pointer;border:1px solid #D1D5DB;background:#fff;color:var(--ink)}
.up-btn:hover:not(:disabled){background:#F3F4F6}
.up-btn.pri{background:var(--navy);color:#fff;border-color:var(--navy)}
.up-btn.main{background:var(--main);color:#fff;border-color:var(--main);text-transform:uppercase;font-weight:800;letter-spacing:.4px;padding:9px 22px}
.up-btn.main:hover:not(:disabled){background:#2560D6}
.up-btn.sm{padding:4px 10px;font-size:11px}
.up-btn:disabled{opacity:.45;cursor:not-allowed}
.up-drop{border:1.5px dashed #CBD2DA;border-radius:10px;background:#FBFCFE;padding:22px;text-align:center;margin-top:10px}
.up-drop.over{background:var(--sel);border-color:var(--pill)}
.up-drop b{display:block;font-size:13.5px;color:var(--navy);margin-bottom:3px}.up-drop span{color:var(--muted)}
.up-file{display:flex;align-items:center;gap:10px;margin-top:10px;border:1px solid var(--line);border-radius:8px;padding:8px 12px;background:#fff}
.up-file b{color:var(--navy)}
.up-link{color:var(--link);font-weight:700;cursor:pointer;background:none;border:none;padding:0;font-size:inherit}
.up-link:hover{text-decoration:underline}
.up-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.up-kpis .kpi{border:1px solid var(--line);border-radius:10px;padding:10px 14px;background:#fff}
.up-kpis .v{font-size:20px;font-weight:800;color:var(--navy)}.up-kpis .v.bad{color:var(--err)}.up-kpis .k{font-size:11px;color:var(--muted);font-weight:600}
.up-callout{background:#fff;border:1px solid var(--line);border-left:4px solid var(--main);border-radius:8px;padding:9px 12px;margin-top:10px;display:flex;gap:10px;align-items:flex-start}
.up-callout.ok{border-left-color:var(--ok)}.up-callout.warn{border-left-color:var(--warn)}
.up-callout .b{flex:1;font-weight:600;line-height:1.45}.up-callout .b small{display:block;color:var(--muted);font-weight:500;margin-top:2px}
.up-batch{font-family:ui-monospace,Menlo,monospace;font-size:11.5px;background:var(--greybg);border-radius:4px;padding:1px 6px}
.up-tools{display:flex;gap:8px;align-items:center;margin:12px 0 8px;flex-wrap:wrap}
.up-gridw{border:1px solid var(--th-line);border-radius:10px;overflow:auto;max-height:360px}
.up-g{border-collapse:collapse;width:100%;font-size:12px}
.up-g th{background:var(--th-bg);color:var(--navy);font-weight:700;font-size:10.5px;text-align:left;padding:8px 10px;border-bottom:1px solid var(--th-line);position:sticky;top:0;white-space:nowrap}
.up-g td{padding:7px 10px;border-bottom:1px solid #EDF1F6;vertical-align:top}
.up-g tbody tr:nth-child(odd){background:var(--odd)}.up-g tbody tr:nth-child(even){background:var(--even)}.up-g tbody tr:hover{background:var(--hover)}
.up-g td.rl{background:var(--rl);color:var(--navy);font-weight:700;border-right:1px solid var(--th-line);white-space:nowrap}
.up-g td.col{white-space:nowrap;color:var(--muted)}.up-g td.err{box-shadow:inset 0 0 0 1px var(--err)}
.up-pg{display:flex;align-items:center;gap:8px;justify-content:flex-end;margin-top:8px;color:var(--muted);font-size:11.5px}
.up-mapbox{margin-top:12px;border:1px solid var(--line);border-radius:10px;background:#fff;overflow:hidden}
.up-mapbox .mh{padding:9px 12px;background:#eef3fb;border-bottom:1px solid var(--line);display:flex;flex-direction:column;gap:2px}
.up-mapbox .mh span{color:var(--muted);font-size:11.5px}
.up-mapbox .mgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(330px,1fr))}
.up-mapbox .mrow{display:grid;grid-template-columns:1fr 18px 1fr;align-items:center;gap:6px;padding:6px 12px;border-bottom:1px solid #eef1f6}
.up-mapbox .mf{font-weight:600}.up-mapbox .ma{color:var(--muted);text-align:center}
.up-mapbox .req{font-style:normal;font-size:10px;color:var(--muted);font-weight:500;margin-left:4px}
.up-mapbox select{width:100%;padding:4px 6px;border:1px solid var(--line);border-radius:6px;background:#fff}
.up-mapbox select.mapped{border-color:#9fc4a8;background:#f4fbf6}.up-mapbox select.need{border-color:#d9a441;background:#fff8e8}
.up-mapbox .munused{padding:8px 12px;color:var(--muted);font-size:11.5px}
.up-sph{display:flex;align-items:center;gap:8px;padding:11px 14px;border-bottom:1px solid var(--line)}
.up-sph b{color:var(--navy);font-size:14px;font-weight:800}.up-sph span{color:var(--muted);font-size:11.5px}
.up-tabs{display:flex;background:#FAFAFB;border-bottom:1px solid var(--line)}
.up-tabs button{flex:1;background:none;border:none;border-bottom:2px solid transparent;padding:10px 6px;font-size:13px;font-weight:600;color:var(--muted);cursor:pointer}
.up-tabs button.on{color:var(--ink);font-weight:800;border-bottom-color:var(--navy)}
.up-spb{padding:12px 14px;max-height:calc(100vh - 260px);overflow:auto}
.up-h3{font-size:11px;font-weight:800;color:var(--navy);text-transform:uppercase;letter-spacing:.4px;margin:4px 0 8px;padding-bottom:5px;border-bottom:1px solid var(--line)}
.up-blk{border:1px solid var(--line);border-left:4px solid var(--main);border-radius:8px;padding:8px 11px;margin-bottom:9px;background:#fff}
.up-blk.a{border-left-color:var(--warn)}.up-blk.x{border-left-color:#9CA3AF}
.up-blk .top{display:flex;align-items:center;gap:8px;margin-bottom:4px}
.up-blk .ln{font-weight:700;line-height:1.4}.up-blk .sub{color:var(--muted);font-size:11.5px;margin-top:3px;line-height:1.4}
.up-blk .act{display:flex;gap:6px;margin-top:7px}
.up-toast{position:fixed;left:18px;bottom:18px;background:var(--navy);color:#fff;padding:10px 16px;border-radius:8px;font-weight:600;opacity:0;transform:translateY(8px);transition:all .2s;pointer-events:none;z-index:50}
.up-toast.on{opacity:1;transform:none}
@media(max-width:1000px){.up-work{flex-direction:column}.up-side{width:100%}.up-kpis{grid-template-columns:repeat(2,1fr)}}
`;
