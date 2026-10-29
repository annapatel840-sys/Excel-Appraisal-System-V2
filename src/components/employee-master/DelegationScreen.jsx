import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ColumnFilter } from "@/components/appraisal/ColumnFilter";
import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";
import { useCatalystUser } from "@/lib/catalyst-auth";
import { useAccess } from "@/lib/access-store";
import { useAppraisalRefresh } from "@/lib/appraisal-store";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";

/* ------------------------------------------------------------------ data */
const EMPLOYEE_API_URL = catalystFunctionUrl("employeesapi");
const ACCESS_API_URL = catalystFunctionUrl("accessapi");
const FIELDS = { comp: "Comp. Manager", app: "Appraiser Tech-Ed" };
const ST = {
  CF: "Carried forward",
  NEW: "New – Tech-Ed default",
  HR: "Changed – HR",
  TE: "Changed – Tech-Ed (approved)",
  PD: "Pending HR approval",
};
const TAG = {
  [ST.CF]: "cf",
  [ST.NEW]: "nw",
  [ST.HR]: "hr",
  [ST.TE]: "te",
  [ST.PD]: "pd",
};
const PAGE = 50;
/* Grid columns (header filter + drag-to-resize like the Appraisal Sheet) */
const MIN_COL = 70;
const MAX_COL = 520;
const COLS = [
  { key: "id", label: "EMPLOYEE ID", w: 140, cls: "ref" },
  { key: "name", label: "EMPLOYEE NAME", w: 190, cls: "nm" },
  { key: "rm", label: "REPORTING MANAGER", w: 220 },
  { key: "director", label: "DIRECTOR", w: 190 },
  { key: "te", label: "TECH-ED", w: 230 },
  { key: "comp", label: "COMP. MANAGER", w: 240, edit: true },
  { key: "app", label: "APPRAISER TECH-ED", w: 240, edit: true },
  { key: "prevComp", label: "PREV. COMP. MANAGER", w: 220, cls: "ref" },
  { key: "prevApp", label: "PREV. APPRAISER TECH-ED", w: 250, cls: "ref" },
  { key: "status", label: "STATUS", w: 210 },
];
const SELECT_W = 40;
/* Default Comp. Manager: copy this value from each employee's own row */
const DEFAULT_COMP_SOURCES = [
  { key: "prevComp", label: "Previous Comp. Manager" },
  { key: "director", label: "Director" },
  { key: "rm", label: "Reporting Manager" },
  { key: "te", label: "Tech-Ed" },
];
const testText = (raw, op, value) => {
  const v = String(value ?? "").trim().toLowerCase();
  if (!v) return true;
  const t = String(raw ?? "").toLowerCase();
  switch (op) {
    case "equals":
      return t === v;
    case "notEquals":
      return t !== v;
    case "startsWith":
      return t.startsWith(v);
    case "endsWith":
      return t.endsWith(v);
    case "notContains":
      return !t.includes(v);
    default:
      return t.includes(v);
  }
};
const matchesFilter = (raw, f) => {
  if (!f) return true;
  if (f.kind === "enum")
    return !f.values.length || f.values.includes(String(raw ?? ""));
  const first = testText(raw, f.op, f.value);
  if (!f.op2 || String(f.value3 ?? "").trim() === "") return first;
  const second = testText(raw, f.op2, f.value3);
  return f.join === "or" ? first || second : first && second;
};
const nameOf = (value) => String(value || "").trim();
const now = () => new Date().toISOString().replace("T", " ").slice(0, 19);
const fmt = (s) => {
  const d = new Date(String(s).replace(" ", "T"));
  return isNaN(d)
    ? s
    : d.toLocaleDateString("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
};
const csvCell = (v) =>
  /[",\n]/.test(String(v ?? ""))
    ? '"' + String(v).replace(/"/g, '""') + '"'
    : String(v ?? "");
/* Show every person as "EMP001 - Name": values that arrive as only an
   employee ID or only a name are matched against the roster. */
const makeResolver = (list) => {
  const byId = new Map();
  const nameCount = new Map();
  const byName = new Map();
  (list || []).forEach((r) => {
    const id = String(r.id || "").trim();
    const name = String(r.name || "").trim();
    if (!id) return;
    const full = name ? `${id} - ${name}` : id;
    byId.set(id.toLowerCase(), full);
    if (name) {
      const k = name.toLowerCase();
      nameCount.set(k, (nameCount.get(k) || 0) + 1);
      byName.set(k, full);
    }
  });
  return (value) => {
    const s0 = String(value ?? "").trim();
    if (!s0) return "";
    const m = s0.match(/^(\S+)\s*-\s*(.+)$/);
    if (m && byId.has(m[1].toLowerCase())) return byId.get(m[1].toLowerCase());
    const low = s0.toLowerCase();
    if (byId.has(low)) return byId.get(low);
    if (byName.has(low) && nameCount.get(low) === 1) return byName.get(low);
    return s0;
  };
};
let seq = 1;
const refNo = (p) =>
  p +
  "-" +
  now().replace(/\D/g, "").slice(2, 12) +
  "-" +
  String(seq++).padStart(4, "0");
/* -------------------------------------------------------------- component */
export default function DelegationScreen({
  initialRows,
  cycleName = "",
  showRoleSwitch = false,
  onRefresh, // optional: () => void
}) {
  const catalystUser = useCatalystUser();
  const loggedInName = String(
    catalystUser?.name || catalystUser?.email || "",
  ).trim();
  const isHRUser = String(catalystUser?.role || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .includes("hr");
  const [user, setUser] = useState({
    id: loggedInName,
    name: loggedInName,
    role: isHRUser ? "HR Admin" : "Tech Ed",
  });
  const [rows, setRows] = useState(() => initialRows || []);
  const resolveName = useMemo(() => makeResolver(rows), [rows]);
  const [activeCycleName, setActiveCycleName] = useState("");
  const [activeCycleId, setActiveCycleId] = useState("");
  const [rosterLoading, setRosterLoading] = useState(false);
  const [showRosterLoading, setShowRosterLoading] = useState(false);
  const displayCycleName = activeCycleName || cycleName || "No active cycle";
  useEffect(() => {
    if (!rosterLoading) {
      setShowRosterLoading(false);
      return undefined;
    }
    const timer = window.setTimeout(() => setShowRosterLoading(true), 500);
    return () => window.clearTimeout(timer);
  }, [rosterLoading]);
  useEffect(() => {
    setLocked(false);
    setAudit([]);
    setSel({});
    setPage(1);
    setColFilters({});
  }, [activeCycleId]);
  const normalizeRequests = (items) =>
    (Array.isArray(items) ? items : []).map((q) => ({
      ...q,
      field: (() => {
        const rawField = String(q.field || "")
          .trim()
          .toLowerCase()
          .replace(/[\s-]+/g, "_");
        if (["compmanager", "comp_manager", "comp"].includes(rawField))
          return "comp";
        if (
          [
            "appraiserteched",
            "appraiser_tech_ed",
            "app",
            "tech_ed_appraiser",
          ].includes(rawField)
        )
          return "app";
        if (rawField === "screen_request") return "screen";
        return rawField;
      })(),
      empId: q.empId || q.employee?.empId || q.rowId || "",
      rowId: q.empId || q.employee?.empId || q.rowId || "",
      status: (() => {
        const raw = String(q.status || "")
          .trim()
          .toLowerCase();
        if (["approved", "rejected", "withdrawn", "superseded"].includes(raw)) {
          return raw.charAt(0).toUpperCase() + raw.slice(1);
        }
        // Any submitted/requested/unknown state stays in the approval queue.
        // Only an explicit HR decision moves a request to Decided.
        return "Pending";
      })(),
      reason: q.reason || q.details || "",
      byName: q.byName || q.requestedBy || q.byId || "Tech-Ed",
      no: q.no || q.id || `DR-${Date.now()}`,
    }));
  const [reqs, setReqs] = useState([]);
  const [audit, setAudit] = useState([]);
  const [locked, setLocked] = useState(false);
  const [colFilters, setColFilters] = useState({});
  const [sort, setSort] = useState({ key: "id", dir: "asc" });
  const [colWidths, setColWidths] = useState(() =>
    Object.fromEntries(COLS.map((c) => [c.key, c.w])),
  );
  const resizeRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [defaultComp, setDefaultComp] = useState("");
  useEffect(() => {
    // The chosen default is remembered per cycle in this browser.
    let saved = "";
    try {
      saved = window.localStorage.getItem("dg-default-comp:" + activeCycleId) || "";
    } catch (_) {}
    setDefaultComp(DEFAULT_COMP_SOURCES.some((o) => o.key === saved) ? saved : "");
  }, [activeCycleId]);
  const saveDefaultComp = (key) => {
    setDefaultComp(key);
    try {
      window.localStorage.setItem("dg-default-comp:" + activeCycleId, key);
    } catch (_) {}
  };
  const menuRef = useRef(null);
  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target))
        setMenuOpen(false);
    };
    const esc = (e) => e.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [menuOpen]);
  const [sel, setSel] = useState({});
  const [page, setPage] = useState(1);
  const [reqTab, setReqTab] = useState("Pending");
  const [bulk, setBulk] = useState({
    field: "app",
    scope: "sel",
    person: "",
    reason: "",
  });
  const [reqOpen, setReqOpen] = useState(false); // ADDED: Pending approvals starts folded
  const [remarks, setRemarks] = useState({});
  const [modal, setModal] = useState(null); // {type, ...}
  const [reason, setReason] = useState("");
  const [toast, setToast] = useState(null);

  const loadRequests = async () => {
    const response = await catalystFetch(
      ACCESS_API_URL + "delegation/requests",
      { method: "GET", cache: "no-store" },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok)
      throw new Error(payload.error || "Unable to load delegation requests.");
    setReqs(normalizeRequests(payload.requests || []));
  };

  useEffect(() => {
    let cancelled = false;
    let loadedAt = 0;
    const reloadRequests = async () => {
      loadedAt = Date.now();
      try {
        const response = await catalystFetch(
          ACCESS_API_URL + "delegation/requests",
          { method: "GET", cache: "no-store" },
        );
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.ok)
          throw new Error(
            payload.error || "Unable to load delegation requests.",
          );
        if (!cancelled) setReqs(normalizeRequests(payload.requests || []));
      } catch (error) {
        if (!cancelled)
          say(error?.message || "Unable to load delegation requests.", true);
      }
    };
    // Returning to the window re-checks for new requests at most once every
    // 30 s; switching windows back and forth no longer reloads each time.
    const onFocus = () => {
      if (Date.now() - loadedAt >= 30000) reloadRequests();
    };
    reloadRequests();
    window.addEventListener("focus", onFocus);
    window.addEventListener("appraisal:cycle-updated", reloadRequests);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("appraisal:cycle-updated", reloadRequests);
    };
  }, []);

  const isHR = user.role === "HR Admin";
  // Access rules (permissive when accessapi is unavailable).
  const access = useAccess();
  const { refreshEmployees } = useAppraisalRefresh();
  const canApprove = isHR;
  const canAudit = access.canAction("viewAudit");
  // View-only screen, or a Tech-Ed without the delegateRequest action: no edits.
  const editLocked =
    locked ||
    (!isHR && !access.canScreen("delegation", "edit")) ||
    (!isHR && !access.canAction("delegateRequest"));

  const loadRoster = async () => {
    // Clear the previous cycle's working roster before fetching the next one.
    setRows([]);
    setActiveCycleId("");
    setActiveCycleName("");
    setRosterLoading(true);
    try {
      const cycles = await payrollCycleRequest("cycles");
      const active = (Array.isArray(cycles) ? cycles : []).find((cycle) => {
        const status = String(cycle.status ?? cycle.cycle_status ?? "").trim().toLowerCase();
        const archived = ["true", "1", "yes"].includes(String(cycle.archived ?? "").trim().toLowerCase());
        return status === "active" && !archived && !cycle.hidden;
      });
      if (!active) {
        setActiveCycleId("");
        setActiveCycleName("");
        setRows([]);
        return;
      }
      const cycleId = String(active.id || active.appraisal_cycle_id || active.cycle_id || active.ROWID || "");
      setActiveCycleId(cycleId);
      setActiveCycleName(String(active.name || active.cycle_name || active.appraisal_year || ""));

      // Always fetch the enriched delegation roster from employeesapi.
      // initialRows may contain only Employee_Master values and omit previous-cycle references.
      // Read the current cycle's Eligibility_List before fetching delegation
      // rows. This read must not generate Delegation; only the explicit
      // Generate Delegation action is allowed to replace/save its roster.
      await payrollCycleRequest("eligibility", {
        method: "GET",
        query: { cycleId },
      });

      // Delegation is prepared before sheet generation, so employeesapi builds
      // the working roster from the active cycle's eligible records when the
      // Appraisal Sheet has not yet been generated.
      const firstResponse = await catalystFetch(
        EMPLOYEE_API_URL + "?page=1&limit=1000&view=delegation",
        { method: "GET", cache: "no-store" },
      );
      const first = await firstResponse.json();
      if (!firstResponse.ok || !first?.success) {
        throw new Error(first?.message || "Unable to load appraisal employees.");
      }
      const all = Array.isArray(first.data) ? [...first.data] : [];
      const totalPages = Math.max(1, Number(first.pagination?.totalPages || 1));
      for (let pageNo = 2; pageNo <= totalPages; pageNo += 1) {
        const response = await catalystFetch(
          EMPLOYEE_API_URL + "?page=" + pageNo + "&limit=1000&view=delegation",
          { method: "GET", cache: "no-store" },
        );
        const payload = await response.json();
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.message || "Unable to load the remaining delegation employees.");
        }
        if (Array.isArray(payload.data)) all.push(...payload.data);
      }
      const unique = new Map();
      all.forEach((item) => {
        const id = String(item.emp_id || item.employee_id || "").trim().toLowerCase();
        if (!id) return;
        const previous = unique.get(id);
        if (!previous || String(item.MODIFIEDTIME || item.CREATEDTIME || item.ROWID || "") >=
            String(previous.MODIFIEDTIME || previous.CREATEDTIME || previous.ROWID || "")) {
          unique.set(id, item);
        }
      });
      const mapped = Array.from(unique.values()).map((item) => ({
        id: String(item.emp_id || item.employee_id || item.ROWID || "").trim(),
        name: String(item.name || item.emp_name || item.emp_id || "").trim(),
        rm: String(item.reporting_manager || item.repo_manager || "").trim(),
        director: String(item.director || item.director_name || "").trim(),
        teId: String(item.appraiser_tech_ed || "").trim(),
        te: String(item.appraiser_tech_ed || "").trim(),
        comp: String(item.delegation_comp_manager || item.comp_manager || "").trim(),
        app: String(item.appraiser_tech_ed || "").trim(),
        prevComp: String(item.previous_comp_manager || item.prev_comp_manager || "").trim(),
        prevApp: String(item.previous_appraiser_tech_ed || item.previous_tech_ed || item.prev_appraiser_tech_ed || "").trim(),
        base: "",
        lastRole: "",
      }));
      setRows(mapped);
      return mapped;
    } catch (error) {
      setRows([]);
      say(error?.message || "Unable to load appraisal employees.", true);
    } finally {
      setRosterLoading(false);
    }
  };

  useEffect(() => {
    loadRoster();
    const refreshRoster = () => loadRoster();
    window.addEventListener("appraisal:cycle-updated", refreshRoster);
    // Load the active cycle's roster when the Delegation screen is mounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => window.removeEventListener("appraisal:cycle-updated", refreshRoster);
  }, [initialRows]);
  const say = (msg, err) => {
    setToast({ msg, err });
    setTimeout(() => setToast(null), err ? 6000 : 3500);
  };
  const log = (a) =>
    setAudit((l) => [
      { on: now(), by: user.name, role: user.role, ...a },
      ...l,
    ]);

  /* derived */
  const pendingFor = (rid, reqList = reqs) =>
    reqList.some((q) => q.rowId === rid && q.status === "Pending");
  const statusOf = (r) =>
    pendingFor(r.id)
      ? ST.PD
      : r.lastRole === "HR Admin"
        ? ST.HR
        : r.lastRole === "Tech Ed"
          ? ST.TE
          : r.base;
  const scoped = useMemo(
    () =>
      rows.filter((r) => {
        if (isHR) return true;
        const assigned = String(r.te || r.teId || "")
          .trim()
          .toLowerCase();
        const loggedIn = String(user.name || user.id || "")
          .trim()
          .toLowerCase();
        return assigned === loggedIn || assigned.includes(loggedIn);
      }),
    [rows, user, isHR],
  );
  const myReqs = reqs.filter(
    (q) =>
      (q.requestType === "screen" || FIELDS[q.field]) &&
      (isHR ||
        String(q.byId || "").toLowerCase() ===
          String(catalystUser?.email || "").toLowerCase()),
  );
  const people = useMemo(() => {
    const uniquePeople = new Map();
    rows.forEach((row) => {
      const id = String(row.id || "").trim();
      const name = String(row.name || "").trim();
      if (!id) return;
      const key = id.toLowerCase();
      const label = name ? `${id} - ${name}` : id;
      const existing = uniquePeople.get(key);
      if (!existing || (existing.name === existing.id && name)) {
        uniquePeople.set(key, { id: label, name: label, roles: [] });
      }
    });
    return Array.from(uniquePeople.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [rows]);
  const pending = myReqs.filter((q) => q.status === "Pending");
  const colValue = (r, key) => {
    switch (key) {
      case "comp":
        return resolveName(r.comp);
      case "app":
        return resolveName(r.app);
      case "prevComp":
        return resolveName(r.prevComp);
      case "prevApp":
        return resolveName(r.prevApp);
      case "te":
        return resolveName(r.te);
      case "status":
        return statusOf(r);
      default:
        return String(r[key] ?? "");
    }
  };
  const list = useMemo(() => {
    const active = Object.entries(colFilters);
    const out = scoped.filter((r) =>
      active.every(([key, f]) => matchesFilter(colValue(r, key), f)),
    );
    const dir = sort.dir === "desc" ? -1 : 1;
    return out.sort(
      (a, b) =>
        dir *
        colValue(a, sort.key).localeCompare(colValue(b, sort.key), undefined, {
          numeric: true,
          sensitivity: "base",
        }),
    );
  }, [scoped, colFilters, sort, reqs]); // eslint-disable-line
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const cur = Math.min(page, pages);
  const slice = list.slice((cur - 1) * PAGE, cur * PAGE);
  const selIds = Object.keys(sel).filter((k) => sel[k]);
  const withoutComp = scoped.filter((r) => !nameOf(r.comp)).length;
  const optionsFor = (key) =>
    [...new Set(scoped.map((r) => colValue(r, key)))].sort();
  const setColFilter = (key, f) => {
    setColFilters((prev) => {
      const next = { ...prev };
      if (f) next[key] = f;
      else delete next[key];
      return next;
    });
    setPage(1);
  };
  const filtersActive = Object.keys(colFilters).length > 0;

  /* drag a header edge to resize a column (same behaviour as the Appraisal Sheet) */
  const startColResize = useCallback(
    (event, col) => {
      event.preventDefault();
      event.stopPropagation();
      resizeRef.current = {
        key: col.key,
        startX: event.clientX,
        startWidth: colWidths[col.key] ?? col.w,
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [colWidths],
  );
  useEffect(() => {
    const move = (event) => {
      if (!resizeRef.current) return;
      const { key, startX, startWidth } = resizeRef.current;
      const next = Math.min(
        MAX_COL,
        Math.max(MIN_COL, startWidth + event.clientX - startX),
      );
      setColWidths((prev) => ({ ...prev, [key]: next }));
    };
    const up = () => {
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, []);
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort();

  /* mutations */
  const applyTo = (rows0, rid, field, pid, role, why, by) =>
    rows0.map((r) =>
      r.id === rid
        ? {
            ...r,
            [field]: pid,
            lastRole: role,
            lastBy: by,
            lastOn: now(),
            lastWhy: why,
          }
        : r,
    );

  const raise = (reqList, r, field, pid, why, batch) => {
    const out = reqList.map((q) =>
      q.rowId === r.id && q.field === field && q.status === "Pending"
        ? { ...q, status: "Superseded", decidedOn: now() }
        : q,
    );
    out.push({
      id: `${Date.now()}${Math.random()}`,
      no: refNo("DR"),
      rowId: r.id,
      empId: r.id,
      empName: r.name,
      field,
      oldId: r[field],
      newId: pid,
      reason: why,
      byId: user.id,
      byName: user.name,
      on: now(),
      batch: batch || "",
      status: "Pending",
      decidedBy: "",
      decidedOn: "",
      remarks: "",
    });
    return out;
  };

  // Comp. Manager changes do not go through approval: HR applies them directly
  // (recorded, then approved in the same step using the existing endpoints).
  const compDirect = (field) => field === "comp" && isHR && canApprove;
  const hrDirect = (field) => isHR && canApprove && ["comp", "app"].includes(field);
  const applyDirectChange = async (target, field, personId, why) => {
    const response = await catalystFetch(ACCESS_API_URL + "delegation/save", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        cycleId: activeCycleId,
        empId: target.id,
        field,
        assignment: personId,
        reason: why,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      throw new Error(payload.error || "Unable to save " + FIELDS[field] + ".");
    }
    return payload;
  };

  const saveChange = async () => {
    const { row, field, person } = modal;
    // Reason is optional (the server needs some text, so a default is stored
    // when it is left empty).
    const whyText = reason.trim() || `${FIELDS[field]} change`;
    if (hrDirect(field)) {
      try {
        await applyDirectChange(row, field, person.id, whyText);
      } catch (error) {
        await loadRequests().catch(() => {});
        return say(error?.message || "Unable to update " + FIELDS[field] + ".", true);
      }
      await refreshEmployees().catch(() => {});
      setRows((rs) =>
        applyTo(rs, row.id, field, person.id, "HR Admin", whyText, user.name),
      );
      await loadRequests().catch(() => {});
      log({
        emp: row.id,
        field: FIELDS[field],
        from: nameOf(row[field]),
        to: person.name,
        action: "Changed",
        why: whyText,
      });
      say(FIELDS[field] + " updated for " + row.id + ".");
      setModal(null);
      return;
    }
    try {
      const request = await submitDelegationRequest({
        empId: row.id,
        empName: row.name,
        field,
        oldId: row[field],
        newId: person.id,
        reason: whyText,
        byName: user.name,
      });
      await loadRequests();
      log({
        emp: row.id,
        field: FIELDS[field],
        from: nameOf(row[field]),
        to: person.name,
        action: "Requested",
        why: whyText,
      });
      say(`Request ${request?.id || "submitted"} sent to HR for approval.`);
    } catch (error) {
      return say(
        error?.message || "Unable to send delegation request to HR.",
        true,
      );
    }
    setModal(null);
  };

  // Default Comp. Manager: set Comp. Manager from the chosen source column of
  // each employee's own row (Previous Comp. Manager / Director / Reporting
  // Manager / Tech-Ed).
  const defaultTargets = (base, sourceKey, resolve) =>
    base
      .map((r) => ({ r, value: resolve(r[sourceKey]) }))
      .filter(({ r, value }) => value && value !== resolve(r.comp));

  const executeDefaultComp = async (targets, source) => {
    const why = `Default Comp. Manager: ${source.label}`;
    const no = refNo("DC");
    const done = [];
    try {
      for (const { r, value } of targets) {
        if (compDirect("comp")) await applyDirectChange(r, "comp", value, why);
        else
          await submitDelegationRequest({
            empId: r.id,
            empName: r.name,
            field: "comp",
            oldId: r.comp,
            newId: value,
            reason: why,
            byName: user.name,
            batch: no,
          });
        done.push({ r, value });
      }
    } catch (error) {
      say(error?.message || "Unable to set the default Comp. Manager.", true);
    }
    if (done.length && compDirect("comp")) {
      await refreshEmployees().catch(() => {});
      setRows((rs) =>
        done.reduce(
          (acc, { r, value }) =>
            applyTo(acc, r.id, "comp", value, "HR Admin", why, user.name),
          rs,
        ),
      );
      log({
        action: "Changed",
        field: FIELDS.comp,
        to: source.label,
        why: `${done.length} employee(s): ${why}`,
      });
      say(`Comp. Manager set to ${source.label} for ${done.length} employee(s).`);
    } else if (done.length) {
      say(`${done.length} request(s) sent to HR for approval (${no}).`);
    }
    await loadRequests().catch(() => {});
  };

  const applyDefaultComp = (sourceKey) => {
    const source = DEFAULT_COMP_SOURCES.find((o) => o.key === sourceKey);
    if (!source) return;
    if (!rows.length) {
      saveDefaultComp(sourceKey);
      return say(
        `Default Comp. Manager set to ${source.label}. It is applied when the delegation data is generated.`,
      );
    }
    const base = selIds.length ? scoped.filter((r) => sel[r.id]) : list;
    const targets = defaultTargets(base, sourceKey, resolveName);
    const skipped = base.length - targets.length;
    if (!targets.length) {
      saveDefaultComp(sourceKey);
      return say(
        `Default Comp. Manager set to ${source.label}. No employees to change (empty or already the Comp. Manager).`,
      );
    }
    setModal({
      type: "confirm",
      title: "Default Comp. Manager",
      body:
        `Set Comp. Manager to the ${source.label} for ${targets.length} employee(s)` +
        (selIds.length ? " (selected)" : " (as shown in the grid)") +
        (skipped ? `. ${skipped} skipped (empty or unchanged)` : "") +
        (compDirect("comp")
          ? ". Applied immediately; no approval needed."
          : ". One request per employee will be sent to HR for approval."),
      ok: () => {
        saveDefaultComp(sourceKey);
        executeDefaultComp(targets, source);
        setSel({});
      },
    });
  };

  // Generate / fetch the delegation data: the default Comp. Manager must be
  // chosen first, and is applied to the new rows as soon as they are loaded.
  const generateDelegation = async () => {
    const source = DEFAULT_COMP_SOURCES.find((o) => o.key === defaultComp);
    if (!source) {
      setModal({
        type: "notice",
        title: "Select Default Comp. Manager",
        body: "Please select the Default Comp. Manager first, then generate / upload the delegation data.",
      });
      return;
    }
    const loaded = await loadRoster();
    if (Array.isArray(loaded) && loaded.length && isHR) {
      const targets = defaultTargets(loaded, source.key, makeResolver(loaded));
      if (targets.length) await executeDefaultComp(targets, source);
    }
  };

  const doBulk = () => {
    const { field, scope, person } = bulk;
    let why = bulk.reason;
    if (!person) return say("Choose who to assign.", true);
    why = why.trim() || `${FIELDS[field]} change`;
    let t =
      scope === "sel"
        ? scoped.filter((r) => sel[r.id])
        : scoped.filter((r) => r.teId === scope.slice(3));
    if (scope === "sel" && !t.length)
      return say(
        'Select employees in the grid, or choose "All under Tech-Ed".',
        true,
      );
    t = t.filter((r) => resolveName(r[field]) !== person);
    if (!t.length)
      return say("No employees to change (already assigned).", true);
    setModal({
      type: "confirm",
      title: "Bulk assign",
      body: compDirect(field)
        ? `${FIELDS[field]} → ${nameOf(person)} for ${t.length} employee(s). Applied immediately; no approval needed.`
        : `${FIELDS[field]} → ${nameOf(person)} for ${t.length} employee(s). One request per employee will be sent to HR for approval.`,
      ok: () => {
        const no = refNo("BA");
        if (hrDirect(field)) {
          (async () => {
            const done = [];
            try {
              for (const r of t) {
                await applyDirectChange(r, field, person, why.trim());
                done.push(r);
              }
            } catch (error) {
              say(error?.message || "Unable to update " + FIELDS[field] + ".", true);
            }
            if (done.length) {
              await refreshEmployees().catch(() => {});
              setRows((rs) =>
                done.reduce(
                  (acc, r) =>
                    applyTo(acc, r.id, field, person, "HR Admin", why.trim(), user.name),
                  rs,
                ),
              );
              log({
                action: "Changed",
                field: FIELDS[field],
                to: nameOf(person),
                why: `${done.length} employee(s): ${why.trim()}`,
              });
              say(FIELDS[field] + " updated for " + done.length + " employee(s).");
            }
            await loadRequests().catch(() => {});
          })();
          setSel({});
          setBulk({ ...bulk, person: "", reason: "" });
          return;
        }
        (async () => {
          try {
            for (const r of t) {
              await submitDelegationRequest({
                empId: r.id,
                empName: r.name,
                field,
                oldId: r[field],
                newId: person,
                reason: why.trim(),
                byName: user.name,
                batch: no,
              });
            }
            await loadRequests();
            say(`${t.length} request(s) sent to HR for approval (${no}).`);
          } catch (error) {
            await loadRequests().catch(() => {});
            say(
              error?.message || "Unable to send bulk delegation requests.",
              true,
            );
          }
        })();
        setSel({});
        setBulk({ ...bulk, person: "", reason: "" });
      },
    });
  };

  const submitDelegationRequest = async (request) => {
    const response = await catalystFetch(
      ACCESS_API_URL + "delegation/requests",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ action: "submit", ...request }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok)
      throw new Error(payload.error || "Unable to submit delegation request.");
    return payload.request;
  };

  const decideDelegationRequest = async (id, status, remarksText = "") => {
    const response = await catalystFetch(
      ACCESS_API_URL + "delegation/requests",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          action: "decide",
          id,
          status: status.toLowerCase(),
          remarks: remarksText,
        }),
      },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok)
      throw new Error(payload.error || "Unable to update delegation request.");
    // Refresh budget counts after a delegation is approved or rejected.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("appraisal:budget-data-updated"));
    }
    return payload;
  };

  const persistFieldChange = async (empId, fieldKey, newId) => {
    const field = fieldKey === "comp" ? "comp_manager" : "appraiser_tech_ed";
    const response = await catalystFetch(EMPLOYEE_API_URL, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        emp_id: String(empId || ""),
        [field]: String(newId || ""),
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.success)
      throw new Error(payload?.message || "Delegation update failed.");
    return payload.data;
  };

  const persistDelegationChange = async (q) =>
    persistFieldChange(q.empId || q.rowId, q.field, q.newId);
  const decide = async (q, approve, rm = remarks[q.id] || "") => {
    if (!isHR || !canApprove)
      return say(
        "Only HR with Delegation edit access can approve or reject requests.",
        true,
      );
    if (!approve && !rm.trim())
      return say("HR remarks are mandatory when rejecting.", true);
    try {
      await decideDelegationRequest(
        q.id,
        approve ? "approved" : "rejected",
        rm.trim(),
      );
    } catch (error) {
      // The server may already have recorded a decision while this screen still
      // has a stale Pending row. Refresh the shared queue before showing the error.
      await loadRequests().catch(() => {});
      return say(
        error?.message ||
          "Unable to " +
            (approve ? "approve" : "reject") +
            " delegation request.",
        true,
      );
    }
    if (approve && q.requestType !== "screen") {
      await refreshEmployees().catch(() => {}); // saved already; don't fail the approval
      setRows((rs) =>
        applyTo(
          rs,
          q.rowId,
          q.field,
          q.newId,
          "HR Admin",
          q.reason,
          q.byName + " (approved by " + user.name + ")",
        ),
      );
    }
    await loadRequests().catch(() => {});
    log({
      emp: q.empId,
      field: q.requestType === "screen" ? "Screen Request" : FIELDS[q.field],
      from: nameOf(q.oldId),
      to: nameOf(q.newId),
      action: approve ? "Approved" : "Rejected",
      why: rm,
    });
    say("Request " + q.no + (approve ? " approved and saved." : " rejected."));
  };
  const withdraw = (q) =>
    setModal({
      type: "confirm",
      title: "Withdraw request",
      body: "Withdraw this request? The current value stays as it is.",
      ok: () => {
        setReqs((qs) =>
          qs.map((x) =>
            x.id === q.id ? { ...x, status: "Withdrawn", decidedOn: now() } : x,
          ),
        );
        say(`Request ${q.no} withdrawn.`);
      },
    });
  const approveAll = () =>
    setModal({
      type: "confirm",
      title: "Approve all",
      body: `Approve all ${pending.length} pending request(s)?`,
      ok: async () => {
        try {
          for (const q of pending) {
            await decideDelegationRequest(q.id, "approved");
          }
          await refreshEmployees();
        } catch (error) {
          await refreshEmployees().catch(() => {});
          say(
            error?.message || "Unable to approve all delegation requests.",
            true,
          );
          return;
        }
        let rs = rows;
        pending
          .filter((q) => q.requestType !== "screen")
          .forEach(
            (q) =>
              (rs = applyTo(
                rs,
                q.rowId,
                q.field,
                q.newId,
                "HR Admin",
                q.reason,
                q.byName + " (approved by " + user.name + ")",
              )),
          );
        setRows(rs);
        const ids = new Set(pending.map((q) => q.id));
        setReqs((qs) =>
          qs.map((x) =>
            ids.has(x.id)
              ? {
                  ...x,
                  status: "Approved",
                  decidedBy: user.name,
                  decidedOn: now(),
                }
              : x,
          ),
        );
        say(`${ids.size} request(s) approved.`);
      },
    });
  const saveDelegation = async () => {
    if (!isHR || !activeCycleId || !rows.length) return;
    try {
      await refreshEmployees().catch(() => {});
      const refreshedRows = await loadRoster();
      if (!Array.isArray(refreshedRows)) {
        throw new Error("Delegation changes may be saved, but the roster could not be refreshed. Please reload the screen.");
      }
      say(`Delegation for ${displayCycleName} saved and refreshed. You can continue editing.`);
      onRefresh?.();
    } catch (error) {
      say(error?.message || "Unable to save Delegation.", true);
    }
  };

  const exportCsv = () => {
    const head = [
      "Employee ID",
      "Employee Name",
      "Reporting Manager",
      "Director",
      "Tech-Ed",
      "Comp. Manager",
      "Appraiser Tech-Ed",
      "Prev. Comp. Manager",
      "Prev. Appraiser Tech-Ed",
      "Status",
    ];
    const chosen = list.filter((r) => sel[r.id]);
    const exportRows =
      chosen.length > 0 && chosen.length < list.length ? chosen : list;
    const body = exportRows.map((r) => [
      r.id,
      r.name,
      r.rm,
      r.director,
      r.te,
      nameOf(r.comp),
      nameOf(r.app),
      nameOf(r.prevComp),
      nameOf(r.prevApp),
      statusOf(r),
    ]);
    const url = URL.createObjectURL(
      new Blob(
        [
          "\ufeff" +
            [head, ...body].map((x) => x.map(csvCell).join(",")).join("\n"),
        ],
        { type: "text/csv" },
      ),
    );
    Object.assign(document.createElement("a"), {
      href: url,
      download: `Delegation_${displayCycleName}.csv`,
    }).click();
    URL.revokeObjectURL(url);
  };

  // The demo role switcher had a USERS list that was never defined; only the signed-in user remains.
  const USERS = [user];

  const switchUser = (id) => {
    setUser(USERS.find((u) => u.id === id) || user);
    setSel({});
    setPage(1);
    setReqTab("Pending");
    setColFilters({});
  };

  const isPendingRequest = (request) =>
    !["Approved", "Rejected", "Withdrawn", "Superseded"].includes(
      String(request.status || "")
        .trim()
        .toLowerCase()
        .replace(/^./, (letter) => letter.toUpperCase()),
    );
  const shownReqs = myReqs
    .filter((q) =>
      reqTab === "Pending" ? isPendingRequest(q) : !isPendingRequest(q),
    )
    .sort((a, b) => String(b.on || "").localeCompare(String(a.on || "")));
  const teScopes = isHR
    ? uniq(scoped.map((r) => r.te)).map((t) => {
        const rs = scoped.filter((r) => r.te === t);
        return {
          id: rs[0].teId,
          label: `All under Tech-Ed ${t} (${rs.length})`,
        };
      })
    : scoped.length
      ? [{ id: user.id, label: `All my employees (${scoped.length})` }]
      : [];
  const allSel = slice.length > 0 && slice.every((r) => sel[r.id]);

  return (
    <div className="dg">
      <style>{CSS}</style>

      {showRoleSwitch && (
        <div className="dg-pv">
          <span>Preview data. Logged in as</span>
          <select value={user.id} onChange={(e) => switchUser(e.target.value)}>
            {USERS.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
                {u.role === "Tech Ed" ? " · Tech-Ed" : ""}
              </option>
            ))}
          </select>
        </div>
      )}
      {locked && (
        <div className="dg-mq lock">
          Delegation for {displayCycleName} is locked. It will be used as
          previous-cycle data for the next cycle.
        </div>
      )}
      {!locked && pending.length > 0 && (
        <div className="dg-mq">
          ⚠{" "}
          {isHR
            ? `${pending.length} delegation request(s) from Tech-Eds awaiting your approval.`
            : `${pending.length} of your request(s) awaiting HR approval.`}
        </div>
      )}

      <div className="dg-body">
        {/* ------------------------------ main */}
        <div className="dg-card dg-main">
          <div className="dg-ch">
            Delegation Screen
            <div className="dg-menu" ref={menuRef}>
              <button
                type="button"
                className="dg-menubtn"
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                onClick={() => setMenuOpen((v) => !v)}
              >
                ☰ Menu
              </button>
              {menuOpen && (
                <div className="dg-menulist" role="menu">
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      exportCsv();
                    }}
                  >
                    Export
                  </button>
                  {isHR && canAudit && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenuOpen(false);
                        setModal({ type: "audit" });
                      }}
                    >
                      Audit trail
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="dg-stats">
            {[
              ["Total employees", scoped.length, "#1f2a37", null],
              ["Employee Without Comp. Manager", withoutComp, "#94620a", null],
              [
                isHR ? "Pending HR approval" : "My pending requests",
                pending.length,
                "#b42318",
                () => setReqOpen(true),
              ],
            ].map(([l, v, c, onClick]) => (
              <div
                className={"dg-st" + (onClick ? " click" : "")}
                key={l}
                onClick={onClick || undefined}
                onKeyDown={
                  onClick
                    ? (e) => (e.key === "Enter" || e.key === " ") && onClick()
                    : undefined
                }
                role={onClick ? "button" : undefined}
                tabIndex={onClick ? 0 : undefined}
                title={onClick ? "Open pending approvals" : undefined}
              >
                <div className="l">{l}</div>
                <div className="v" style={{ color: c }}>
                  {v}
                </div>
              </div>
            ))}
          </div>

          <div className="dg-tb">
            <span style={{ flex: 1 }} />
            <label className="dg-dflt">
              <span>Default Comp. Manager</span>
              <select
                className="f"
                disabled={editLocked}
                value={defaultComp}
                onChange={(e) =>
                  e.target.value && applyDefaultComp(e.target.value)
                }
              >
                <option value="">Select</option>
                {DEFAULT_COMP_SOURCES.map((o) => (
                  <option key={o.key} value={o.key}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn"
              onClick={() => setModal({ type: "bulk" })}
            >
              Bulk assign ({selIds.length})
            </button>
            {isHR && (
              <button
                className="btn p"
                disabled={editLocked || !rows.length || rosterLoading}
                title="Save and refresh the current delegation assignments"
                onClick={saveDelegation}
              >
                Save
              </button>
            )}
          </div>

          <div className="dg-tw">
            {rosterLoading && showRosterLoading ? (
              <div className="empty" role="status">Loading delegation data…</div>
            ) : rosterLoading ? null : !scoped.length ? (
              <div className="empty" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
                {activeCycleId ? "No delegation rows are available for " + displayCycleName + "." : "No active appraisal cycle. Create or activate a cycle to start delegation."}
                {activeCycleId && (
                  <button className="btn p" type="button" onClick={generateDelegation}>
                    Generate / Fetch Delegation Data
                  </button>
                )}
              </div>
            ) : (
              <table
                className="dg-grid"
                style={{
                  tableLayout: "fixed",
                  width: "max-content",
                  minWidth: "100%",
                }}
              >
                <colgroup>
                  <col style={{ width: SELECT_W }} />
                  {COLS.map((c) => (
                    <col key={c.key} style={{ width: colWidths[c.key] }} />
                  ))}
                </colgroup>
                <thead>
                  <tr className="grp">
                    <th className="g g1" colSpan={6}>
                      <span>FROM EMPLOYEE MASTER · READ-ONLY</span>
                    </th>
                    <th className="g g2" colSpan={2}>
                      <span>THIS CYCLE · EDITABLE</span>
                    </th>
                    <th className="g g3" colSpan={2}>
                      <span>PREVIOUS CYCLE · REFERENCE</span>
                    </th>
                    <th className="g" />
                  </tr>
                  <tr className="hd">
                    <th className="sel">
                      <input
                        type="checkbox"
                        checked={allSel}
                        disabled={editLocked}
                        onChange={(e) => {
                          const n = { ...sel };
                          slice.forEach((r) => (n[r.id] = e.target.checked));
                          setSel(n);
                        }}
                      />
                    </th>
                    {COLS.map((c) => (
                      <th key={c.key}>
                        <div className="hc">
                          <span className="hl" title={c.label}>
                            {c.label}
                          </span>
                          <ColumnFilter
                            columnKey={"delegation:" + c.key}
                            label={c.label}
                            allowGroup={false}
                            filter={colFilters[c.key]}
                            options={optionsFor(c.key)}
                            allValues={[]}
                            onChange={(f) => setColFilter(c.key, f)}
                            sortDirection={
                              sort.key === c.key ? sort.dir : null
                            }
                            sortLevel={sort.key === c.key ? 1 : 0}
                            onSortAsc={() => setSort({ key: c.key, dir: "asc" })}
                            onSortDesc={() =>
                              setSort({ key: c.key, dir: "desc" })
                            }
                          />
                        </div>
                        <div
                          role="separator"
                          aria-label={`Resize ${c.label} column`}
                          title="Drag to resize column"
                          className="rz"
                          onPointerDown={(e) => startColResize(e, c)}
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {slice.map((r) => {
                    const st = statusOf(r);
                    return (
                      <tr key={r.id} className={sel[r.id] ? "sel" : ""}>
                        <td className="sel">
                          <input
                            type="checkbox"
                            checked={!!sel[r.id]}
                            disabled={editLocked}
                            onChange={(e) =>
                              setSel({ ...sel, [r.id]: e.target.checked })
                            }
                          />
                        </td>
                        {COLS.map((c) => {
                          if (c.edit) {
                            const f = c.key;
                            const prev = resolveName(
                              f === "comp" ? r.prevComp : r.prevApp,
                            );
                            return (
                              <td key={f}>
                                <select
                                  className={
                                    "in" +
                                    (prev && resolveName(r[f]) !== prev
                                      ? " c"
                                      : "")
                                  }
                                  disabled={editLocked}
                                  value={resolveName(r[f])}
                                  onChange={(e) => {
                                    setReason("");
                                    setModal({
                                      type: "reason",
                                      row: r,
                                      field: f,
                                      person: people.find(
                                        (p) => p.id === e.target.value,
                                      ),
                                    });
                                  }}
                                >
                                  {people.map((p) => (
                                    <option key={p.id} value={p.id}>
                                      {p.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            );
                          }
                          if (c.key === "status")
                            return (
                              <td key={c.key}>
                                <span className={`tag ${TAG[st]}`}>{st}</span>
                              </td>
                            );
                          const text =
                            c.key === "prevComp" || c.key === "prevApp"
                              ? colValue(r, c.key) || "—"
                              : colValue(r, c.key);
                          return (
                            <td
                              key={c.key}
                              className={c.cls || ""}
                              title={text}
                            >
                              {text}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
            {scoped.length > 0 && !slice.length && (
              <div className="empty">No employees match the filters.</div>
            )}
          </div>

          <div className="dg-foot">
            <span>
              <b style={{ color: "#e0914f" }}>■</b> Orange = differs from
              previous cycle
            </span>
            <span>New employee → Comp. Manager defaults to Tech-Ed</span>
            <span>Appraiser Tech-Ed defaults to Tech-Ed</span>
            {filtersActive && (
              <button
                type="button"
                className="btn sm"
                onClick={() => {
                  setColFilters({});
                  setPage(1);
                }}
              >
                Clear filters
              </button>
            )}
            <span style={{ flex: 1 }} />
            <span className="pg">
              <button
                className="btn sm"
                disabled={cur <= 1}
                onClick={() => setPage(cur - 1)}
              >
                ‹ Previous
              </button>
              <span>
                {list.length
                  ? `${(cur - 1) * PAGE + 1}–${Math.min(cur * PAGE, list.length)}`
                  : 0}{" "}
                of {list.length}
              </span>
              <button
                className="btn sm"
                disabled={cur >= pages}
                onClick={() => setPage(cur + 1)}
              >
                Next ›
              </button>
            </span>
          </div>
          <div className="dg-help">
            <b>How it works:</b>{" "}
            {isHR
              ? "Tech-Ed and Reporting Manager come from the Employee Master. Comp. Manager defaults to last cycle's; for new employees it defaults to the Tech-Ed. Your changes apply immediately. Changes by a Tech-Ed arrive as requests on the right and apply only when you approve. Save & lock is allowed only when no requests are pending."
              : 'You see employees whose Tech-Ed is you. Any change you make is sent to HR for approval; the current value stays until HR approves. You can withdraw a pending request from "My requests".'}
          </div>
        </div>

        {/* ------------------------------ side */}
        <div className={"dg-side" + (reqOpen ? " open" : "")}>
          {reqOpen ? (
            <div className="dg-panel">
              <div className="ph">
                <div>
                  <div className="tt">
                    {isHR ? "Pending approvals" : "My requests"}
                  </div>
                  <div className="ss">
                    {isHR
                      ? "Requests raised by Tech-Eds"
                      : "Changes you sent to HR"}
                  </div>
                </div>
                <button
                  type="button"
                  className="x"
                  onClick={() => setReqOpen(false)}
                  title="Close"
                  aria-label="Close pending approvals"
                >
                  ✕
                </button>
              </div>
              <div className="pb">
                <div className="rtabs">
                    {["Pending", "Decided"].map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={"ptab" + (reqTab === t ? " on" : "")}
                        onClick={() => setReqTab(t)}
                      >
                        {t}
                      </button>
                    ))}
                    {isHR &&
                      canApprove &&
                      reqTab === "Pending" &&
                      pending.length > 1 &&
                      !locked && (
                        <>
                          <span style={{ flex: 1 }} />
                          <button className="btn p sm" onClick={approveAll}>
                            Approve all shown
                          </button>
                        </>
                      )}
                  </div>
                  <div className="rq-list">
                    {!shownReqs.length && (
                      <div className="none">
                        {reqTab === "Pending"
                          ? "No pending requests."
                          : "No decided requests yet."}
                      </div>
                    )}
                    {shownReqs.map((q) => (
                      <div className="req" key={q.id}>
                        <div className="n">
                          <span>
                            {q.empId} · {q.empName}
                          </span>
                          <span
                            className={
                              "tag " +
                              (q.status === "Approved"
                                ? "cf"
                                : q.status === "Pending" ||
                                    q.status === "Rejected"
                                  ? "pd"
                                  : "gr")
                            }
                          >
                            {q.status}
                          </span>
                        </div>
                        <div className="m">
                          {q.requestType === "screen"
                            ? "Screen Request"
                            : FIELDS[q.field]}
                          {q.requestType === "screen"
                            ? ""
                            : `: ${nameOf(q.oldId) || "—"}`}{" "}
                          {q.requestType !== "screen" && (
                            <span className="ar">→ {nameOf(q.newId)}</span>
                          )}
                          <br />
                          {isHR ? (
                            <>
                              Raised by <b>{q.byName}</b>
                              {q.requestedRole ? ` (${q.requestedRole})` : ""}
                            </>
                          ) : (
                            "Raised"
                          )}{" "}
                          · {fmt(q.on)} · {q.no}
                          <br />
                          Reason: {q.reason}
                          {q.status !== "Pending" && q.decidedBy && (
                            <>
                              <br />
                              {q.status} by {q.decidedBy} · {fmt(q.decidedOn)}
                            </>
                          )}
                          {q.remarks && (
                            <>
                              <br />
                              HR remarks: {q.remarks}
                            </>
                          )}
                        </div>
                        {q.status === "Pending" &&
                          !locked &&
                          (!isHR || canApprove) &&
                          (isHR ? (
                            <>
                              <input
                                className="fld"
                                placeholder="HR remarks (mandatory if rejecting)"
                                maxLength={2000}
                                value={remarks[q.id] || ""}
                                onChange={(e) =>
                                  setRemarks({
                                    ...remarks,
                                    [q.id]: e.target.value,
                                  })
                                }
                              />
                              <button
                                type="button"
                                className="btn p sm"
                                onClick={() => decide(q, true)}
                              >
                                Approve
                              </button>{" "}
                              <button
                                type="button"
                                className="btn sm r"
                                onClick={() => decide(q, false)}
                              >
                                Reject
                              </button>
                            </>
                          ) : (
                            <button
                              className="btn sm r"
                              onClick={() => withdraw(q)}
                            >
                              Withdraw
                            </button>
                          ))}
                      </div>
                    ))}
                  </div>
              </div>
            </div>
          ) : (
            <div className="dg-rail">
              <button
                type="button"
                className="dg-ptab"
                onClick={() => setReqOpen(true)}
                title="Open pending approvals"
                aria-expanded="false"
              >
                {isHR ? "Pending approvals" : "My requests"} ({pending.length})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ------------------------------ modals */}
      {modal?.type === "bulk" && (
        <Modal
          title="Bulk assign"
          onClose={() => setModal(null)}
          foot={
            <>
              <button
                className="btn"
                disabled={editLocked}
                onClick={() => {
                  setSel({});
                  setBulk({ ...bulk, person: "", reason: "" });
                }}
              >
                Clear
              </button>
              <button className="btn" onClick={() => setModal(null)}>
                Close
              </button>
              <button
                className="btn p"
                disabled={editLocked}
                onClick={doBulk}
              >
                Apply
              </button>
            </>
          }
        >
          <div className="note" style={{ marginTop: 0, marginBottom: 10 }}>
            {selIds.length} employee{selIds.length === 1 ? "" : "s"} selected
          </div>
          <div className="lb">Field to change</div>
          <select
            className="fld"
            disabled={editLocked}
            value={bulk.field}
            onChange={(e) => setBulk({ ...bulk, field: e.target.value })}
          >
            <option value="comp">Comp. Manager</option>
            <option value="app">Appraiser Tech-Ed</option>
          </select>
          <div className="lb">Apply to</div>
          <select
            className="fld"
            disabled={editLocked}
            value={bulk.scope}
            onChange={(e) => setBulk({ ...bulk, scope: e.target.value })}
          >
            <option value="sel">Selected employees ({selIds.length})</option>
            {teScopes.map((s) => (
              <option key={s.id} value={`te:${s.id}`}>
                {s.label}
              </option>
            ))}
          </select>
          <div className="lb">Assign to</div>
          <select
            className="fld"
            disabled={editLocked}
            value={bulk.person}
            onChange={(e) => setBulk({ ...bulk, person: e.target.value })}
          >
            <option value="">— choose —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.roles.join(", ")}
              </option>
            ))}
          </select>
          <div className="lb">Reason (optional)</div>
          <input
            className="fld"
            disabled={editLocked}
            maxLength={2000}
            value={bulk.reason}
            onChange={(e) => setBulk({ ...bulk, reason: e.target.value })}
          />
          <div className="note">
            {isHR
              ? "HR Admin: applied immediately."
              : "Tech-Ed: one request per employee is sent to HR for approval."}
          </div>
        </Modal>
      )}
      {modal?.type === "reason" && (
        <Modal
          title={isHR ? "Confirm change" : "Send change to HR for approval"}
          onClose={() => setModal(null)}
          foot={
            <>
              <button className="btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="btn p" onClick={saveChange}>
                {isHR ? "Save" : "Send to HR"}
              </button>
            </>
          }
        >
          <div className="chg">
            <b>
              {modal.row.id} · {modal.row.name}
            </b>
            <br />
            {FIELDS[modal.field]}: {nameOf(modal.row[modal.field]) || "—"}{" "}
            <span className="ar">→ {modal.person.name}</span>
          </div>
          <div className="lb">Reason (optional)</div>
          <textarea
            className="fld"
            autoFocus
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          <div className="note">
            {isHR
              ? "Applies immediately and is recorded in the audit trail."
              : "The current value stays until HR approves."}
          </div>
        </Modal>
      )}
      {modal?.type === "notice" && (
        <Modal
          title={modal.title}
          onClose={() => setModal(null)}
          foot={
            <button className="btn p" onClick={() => setModal(null)}>
              OK
            </button>
          }
        >
          {modal.body}
        </Modal>
      )}
      {modal?.type === "confirm" && (
        <Modal
          title={modal.title}
          onClose={() => setModal(null)}
          foot={
            <>
              <button className="btn" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button
                className="btn p"
                onClick={() => {
                  const ok = modal.ok;
                  setModal(null);
                  ok();
                }}
              >
                Confirm
              </button>
            </>
          }
        >
          {modal.body}
        </Modal>
      )}
      {modal?.type === "audit" && (
        <Modal
          title="Audit trail"
          wide
          onClose={() => setModal(null)}
          foot={
            <button className="btn" onClick={() => setModal(null)}>
              Close
            </button>
          }
        >
          {!audit.length ? (
            <div className="none">No entries yet.</div>
          ) : (
            <table className="aud">
              <thead>
                <tr>
                  {[
                    "DATE & TIME",
                    "EMPLOYEE",
                    "FIELD",
                    "CHANGE",
                    "ACTION",
                    "BY",
                    "REMARKS",
                  ].map((h) => (
                    <th key={h}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {audit.map((a, i) => (
                  <tr key={i}>
                    <td>{a.on}</td>
                    <td>{a.emp}</td>
                    <td>{a.field}</td>
                    <td>
                      {a.from || a.to
                        ? `${a.from || "—"} → ${a.to || "—"}`
                        : ""}
                    </td>
                    <td>{a.action}</td>
                    <td>
                      {a.by}
                      <br />
                      <span className="note">{a.role}</span>
                    </td>
                    <td>{a.why}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Modal>
      )}
      {toast && (
        <div className={"dg-toast " + (toast.err ? "err" : "ok")}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Modal({ title, children, foot, onClose, wide }) {
  return (
    <div
      className="dg-ov"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={"mdl" + (wide ? " wide" : "")}>
        <div className="mh">{title}</div>
        <div className="mb">{children}</div>
        <div className="mf">{foot}</div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- styles */
const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
.dg,.dg *{box-sizing:border-box}
.dg{font-family:Manrope,Arial,sans-serif;background:#f3f5f8;color:#1f2a37;font-size:13px;min-height:100%}
.dg button,.dg input,.dg select,.dg textarea{font-family:inherit;font-size:inherit}
.dg-pv{background:#e8f5f1;border-bottom:1px solid #b9dcc4;color:#146b5a;padding:7px 12px;font-size:12px;font-weight:600;display:flex;gap:10px;align-items:center}
.dg-pv select{border:1px solid #b9dcc4;border-radius:4px;padding:3px 6px;font-weight:600}
.dg-mq{background:#fff7e8;border-bottom:1px solid #f1d9a8;color:#8a5a06;padding:7px 12px;font-size:12px;font-weight:600}
.dg-mq.lock{background:#eef1f5;border-color:#d6dce4;color:#374151}
.dg-body{display:flex;gap:14px;padding:14px 12px;align-items:flex-start}
.dg-card{background:#fff;border:1px solid #dfe4ea;border-radius:10px;overflow:hidden}
.dg-main{flex:1;min-width:0}
.dg-ch{position:relative;background:#15365a;color:#fff;text-align:center;font-weight:800;font-size:15.5px;padding:10px}
.dg .dg-dflt{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700;color:#15365a;white-space:nowrap}
.dg-menu{position:absolute;right:10px;top:50%;transform:translateY(-50%)}
.dg .dg-menubtn{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.35);border-radius:6px;padding:4px 12px;font-size:12px;font-weight:700;cursor:pointer}
.dg .dg-menubtn:hover{background:rgba(255,255,255,.22)}
.dg-menulist{position:absolute;right:0;top:calc(100% + 6px);min-width:150px;background:#fff;border:1px solid #E5E7EB;border-radius:8px;box-shadow:0 6px 20px rgba(15,42,68,.18);padding:4px;z-index:30;text-align:left}
.dg .dg-menulist button{display:block;width:100%;text-align:left;background:none;border:0;border-radius:6px;padding:8px 10px;font-size:12.5px;font-weight:600;color:#102A43;cursor:pointer}
.dg .dg-menulist button:hover{background:#eef2f8}
.dg-stats{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid #e6eaef}
.dg-st{padding:10px 14px;border-right:1px solid #e6eaef}.dg-st:last-child{border-right:none}
.dg-st .l{font-size:11.5px;color:#6b7685}.dg-st .v{font-size:17px;font-weight:800}
.dg-st.click{cursor:pointer}.dg-st.click:hover{background:#f6f8fa}.dg-st.click:focus-visible{outline:2px solid #17365d;outline-offset:-2px}
.dg-tb{display:flex;gap:8px;padding:10px 12px;align-items:center;border-bottom:1px solid #e6eaef;flex-wrap:wrap}
.dg .srch{border:1px solid #cfd8e1;border-radius:6px;padding:7px 11px;width:230px}
.dg .f{border:1px solid #cfd8e1;border-radius:6px;padding:6px 8px;color:#374151;background:#fff;max-width:190px}
.dg .btn{border:1px solid #cfd8e1;border-radius:6px;padding:7px 13px;font-weight:700;color:#15365a;background:#fff;cursor:pointer}
.dg .btn:hover{background:#f1f4f8}
.dg .btn.p{background:#1a8a74;border-color:#1a8a74;color:#fff}.dg .btn.p:hover{background:#157563}
.dg .btn.r{color:#b42318}
.dg .btn:disabled{opacity:.5;cursor:not-allowed}
.dg .btn.sm{padding:5px 12px;font-size:12px}
.dg-tw{overflow:auto;max-height:calc(100vh - 300px);min-height:220px;border-top:1px solid #cbd5e1}
.dg table{border-collapse:separate;border-spacing:0}
.dg table.dg-grid{font-family:Arial,Helvetica,sans-serif}
.dg .dg-grid th{position:sticky;background:#e9eef5;color:#24364d;font-size:11px;font-weight:700;text-align:left;padding:0;height:46px;border-right:1px solid #cbd5e1;border-bottom:1px solid #cbd5e1;overflow:visible;z-index:3}
.dg .dg-grid tr.grp th{top:0;height:28px;background:#fff;text-align:center;font-size:10.5px;padding:3px 4px;border-bottom:1px solid #cbd5e1;z-index:4}
.dg .dg-grid tr.hd th{top:28px}
.dg .dg-grid th.sel,.dg .dg-grid td.sel{text-align:center;padding:0}
.dg .dg-grid .hc{display:flex;align-items:center;gap:4px;height:100%;padding:0 8px;min-height:46px}
.dg .dg-grid .hc>button{flex:0 0 auto}
.dg .dg-grid .hl{flex:1 1 0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dg .dg-grid .rz{position:absolute;top:0;right:-2px;height:100%;width:5px;cursor:col-resize;touch-action:none;z-index:10}
.dg .dg-grid .rz:hover{background:rgba(23,54,93,.3)}
.dg th.g span{display:block;border-radius:4px;padding:3px}
.dg .g1 span{background:#eef1f5;color:#4b5563}.dg .g2 span{background:#e3f3ee;color:#146b5a}.dg .g3 span{background:#f3f4f6;color:#6b7280}
.dg .dg-grid td{padding:6px 8px;border-right:1px solid #e0e5ec;border-bottom:1px solid #e0e5ec;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;height:38px}
.dg td.ref{color:#6b7685}.dg td.nm{font-weight:700}
.dg tr.sel td{background:#f7fbfa}
.dg .in{border:1px solid #b9dcc4;background:#eff8f1;border-radius:5px;padding:4px 6px;width:100%;color:#1f2a37}
.dg .in.c{border-color:#e0914f;background:#fff4ea}
.dg .in:disabled{background:#f3f5f8;border-color:#dfe4ea;color:#4b5563}
.dg .tag{font-size:10.5px;padding:2px 8px;border-radius:9px;font-weight:700;white-space:nowrap}
.dg .tag.cf{background:#e8f5ee;color:#1e7a45}.dg .tag.nw{background:#e6efff;color:#1d4ed8}.dg .tag.hr{background:#fff1d6;color:#94620a}
.dg .tag.te{background:#efe8fb;color:#6b3fb0}.dg .tag.pd{background:#fde8e6;color:#b42318}.dg .tag.gr{background:#eef1f5;color:#4b5563}
.dg-foot{display:flex;padding:9px 12px;font-size:11.5px;color:#6b7685;gap:18px;align-items:center;flex-wrap:wrap;border-top:1px solid #eef1f4}
.dg .pg{display:flex;gap:6px;align-items:center}
.dg-help{padding:9px 12px 12px;font-size:11.5px;color:#6b7685;line-height:1.6;border-top:1px solid #eef1f4;background:#fbfcfd}
.dg-help b{color:#374151}
.dg .empty{padding:40px;text-align:center;color:#6b7685}
.dg-side{flex:0 0 auto;display:flex;flex-direction:row;align-self:stretch}
.dg-rail{display:flex;flex-direction:column;justify-content:center;align-items:stretch;min-height:160px}
.dg-ptab{writing-mode:vertical-rl;background:#173b63;color:#fff;border:0;border-radius:8px;padding:14px 7px;font:inherit;font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
.dg-ptab:hover{background:#0c2740}
.dg-panel{width:280px;border:1px solid #E5E7EB;border-radius:12px;background:#fff;overflow:hidden;display:flex;flex-direction:column;align-self:flex-start}
.dg-panel .ph{display:flex;align-items:flex-start;justify-content:space-between;gap:8px;padding:10px 12px;color:#102A43}
.dg-panel .ph .tt{font-weight:800;font-size:14.5px}.dg-panel .ph .ss{font-size:11.5px;color:#6B7280;margin-top:2px}
.dg-panel .ph .x{border:none;background:none;cursor:pointer;font-size:14px;color:#6B7280;padding:2px 4px}
.dg-panel .ph .x:hover{color:#102A43}
.dg-panel .pb{padding:0 12px 12px;display:flex;flex-direction:column;min-height:0}
.dg .sh{padding:11px 13px;border-bottom:1px solid #e6eaef;display:flex;gap:9px;align-items:center}
.dg .ic{background:#1a8a74;color:#fff;border-radius:6px;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-weight:800;flex:0 0 28px}
.dg .ic.o{background:#e0662f}
.dg .sh .tt{font-weight:800;font-size:14.5px}.dg .sh .ss{font-size:11.5px;color:#6b7685}
.dg .sb{padding:11px 13px}
.dg .lb{font-size:11px;color:#6b7685;margin:0 0 3px}
.dg .fld{border:1px solid #cfd8e1;border-radius:6px;padding:6px 9px;margin-bottom:9px;width:100%;background:#fff}
.dg textarea.fld{resize:vertical;min-height:54px}
.dg .note{font-size:11px;color:#8591a0;margin-top:7px;line-height:1.5}
.dg .rtabs{display:flex;align-items:center;gap:0;margin:0 -12px 10px;background:#FAFAFB;border-top:1px solid #E5E7EB;border-bottom:1px solid #E5E7EB;padding:0 12px}
.dg .rtabs .ptab{flex:0 0 auto;padding:9px 14px;border:none;background:none;font-size:13px;font-weight:600;color:#6B7280;cursor:pointer;border-bottom:2px solid transparent;display:flex;align-items:center;gap:6px}
.dg .rtabs .ptab:before{content:"";width:8px;height:8px;border-radius:50%;background:#2F6FED}
.dg .rtabs .ptab.on{color:#1D4FA8;font-weight:800;background:#E8F0FE;border-bottom-color:#2F6FED}
.dg .rq-list{max-height:calc(100vh - 360px);min-height:140px;overflow:auto}
.dg .req{border:1px solid #E5E7EB;border-radius:10px;padding:10px;margin-bottom:9px;background:#fff}
.dg .req .n{font-weight:800;color:#15365a;display:flex;justify-content:space-between;gap:6px}
.dg .req .m{color:#4b5563;font-size:11.8px;margin:4px 0 8px;line-height:1.5}
.dg .ar{color:#1a8a74;font-weight:700}
.dg .req .fld{font-size:11.5px;margin-bottom:7px}
.dg .none{color:#8591a0;font-size:12px;padding:10px 0}
.dg-toast{position:fixed;right:16px;bottom:16px;max-width:460px;padding:11px 14px;border-radius:8px;font-weight:600;font-size:12.5px;box-shadow:0 6px 20px rgba(15,42,68,.18);z-index:60}
.dg-toast.ok{background:#e8f5ee;color:#1e5c3a;border:1px solid #b9dcc4}
.dg-toast.err{background:#fde8e6;color:#8f1d14;border:1px solid #f3b8b1}
.dg-ov{position:fixed;inset:0;background:rgba(15,42,68,.45);display:flex;align-items:center;justify-content:center;z-index:50}
.dg .mdl{background:#fff;border-radius:10px;width:480px;max-width:94vw;max-height:88vh;overflow:auto}
.dg .mdl.wide{width:880px}
.dg .mdl .mh{background:#15365a;color:#fff;font-weight:800;padding:11px 14px;font-size:14.5px}
.dg .mdl .mb{padding:14px}
.dg .mdl .mf{padding:10px 14px;border-top:1px solid #e6eaef;display:flex;gap:8px;justify-content:flex-end}
.dg .chg{background:#f6f8fa;border-radius:6px;padding:9px;margin-bottom:10px;line-height:1.6}
.dg table.aud{width:100%;border-collapse:collapse}
.dg .aud th{font-size:11px;letter-spacing:.3px;color:#5b6675;text-align:left;padding:9px 8px;background:#f6f8fa;border-bottom:1px solid #e1e6ec;font-weight:700;white-space:nowrap}
.dg .aud td{white-space:normal;font-size:11.5px;vertical-align:top;padding:6px 8px;border-bottom:1px solid #eef1f4}
.dg .aud th{position:static}
@media(max-width:1100px){.dg-body{flex-direction:column}.dg-side{width:100%;flex:none}.dg-rail{flex-direction:row;justify-content:flex-end;min-height:0}.dg-ptab{writing-mode:horizontal-tb;padding:7px 14px}.dg-panel{width:100%}.dg-stats{grid-template-columns:1fr}}
`;