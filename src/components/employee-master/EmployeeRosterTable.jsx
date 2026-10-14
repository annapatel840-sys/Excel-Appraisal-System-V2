import { useCallback, useEffect, useMemo, useState } from "react";

import { DataGrid, useGridState, useGridView } from "./DataGrid";
import { PanelTab, SidePanel } from "./SidePanel";
import { InactiveModal, ChangeModal } from "./EmployeeMasterModal";
import { usePanel } from "./panelStore";
import { fmtDoj } from "@/lib/employee-master-utils";
import "./employee-master-ui.css";

/* ---------- value helpers (same aliases as before) ---------- */
function getEmployeeId(employee) {
  return String(
    employee?.empId ??
      employee?.employeeId ??
      employee?.EMP_ID ??
      employee?.["EMP ID"] ??
      "",
  ).trim();
}

function getEmployeeName(employee) {
  return (
    employee?.empName ??
    employee?.employeeName ??
    employee?.name ??
    employee?.EMP_NAME ??
    employee?.["EMP Name"] ??
    "-"
  );
}

function getDesignation(employee) {
  return employee?.designation || employee?.rawEmployee?.designation || "-";
}

function getValue(employee, key) {
  const raw = employee?.rawEmployee || {};
  const aliases = {
    type: ["emp_type", "employee_type", "employment_type", "type"],
    dept: ["department", "organization", "orgtn"],
    reportingManager: ["reporting_manager", "reportingManager", "manager"],
    te: [
      "tech_ed_bu_head_name",
      "tech_ed_name",
      "appraiser_tech_ed",
      "super_manager",
      "superManager",
    ],
    director: ["director", "director_name"],
    appraiser: ["appraiser_tech_ed", "appraiser", "appraiser_name"],
    totalExp: ["total_experience", "totalExp"],
    orgExp: ["wissen_experience", "wissenExperience", "orgExp"],
    email: ["email_id", "email", "emailId"],
    location: ["location", "work_location"],
    lastAppraisal: [
      "last_appraisal_month_year",
      "last_appraisal",
      "lastAppraisal",
    ],
    recordOwner: ["record_owner_id", "record_owner", "owner_id"],
    band: ["band", "employee_band"],
    skillType: ["skill_type", "skill", "skillType"],
    exitDate: ["exit_date", "exitDate", "resignation_date"],
  };
  let value = employee?.[key];
  if (value === undefined || value === null || value === "") {
    for (const alias of aliases[key] || []) {
      if (
        raw?.[alias] !== undefined &&
        raw?.[alias] !== null &&
        raw?.[alias] !== ""
      ) {
        value = raw[alias];
        break;
      }
    }
  }
  if (key === "status") value = employee?.status ?? raw?.status ?? "";
  if (value === null || value === undefined || value === "") return "-";
  return value;
}

const normalizeStatus = (s) =>
  String(s ?? "")
    .trim()
    .toLowerCase();

function cellText(employee, key) {
  if (key === "status")
    return normalizeStatus(employee?.status) === "active"
      ? "Active"
      : "Inactive";
  if (key === "doj") {
    const raw = getValue(employee, "doj");
    if (raw === "-") return "-";
    try {
      return fmtDoj(raw) || String(raw);
    } catch {
      return String(raw);
    }
  }
  return String(getValue(employee, key));
}

/* ---------- column definitions (module level = stable) ---------- */
const PLAIN = [
  ["type", "Emp Type", 100],
  ["dept", "Department", 140],
  ["reportingManager", "Reporting Manager", 150],
  ["te", "Tech-ED/BU Head Name", 160],
  ["director", "Director", 130],
  ["appraiser", "Appraiser Tech-ED", 150],
  [
    "totalExp",
    "Total Experience",
    120,
    "As on the cut-off date set in HR Config",
  ],
  [
    "orgExp",
    "Wissen Experience",
    120,
    "As on the cut-off date set in HR Config",
  ],
  ["email", "Email ID", 220],
  ["doj", "Date of Joining", 115],
  ["status", "Employee Status", 120],
  ["location", "Location", 90],
  ["lastAppraisal", "Last Appraisal Month and Year", 140],
  ["recordOwner", "Record Owner ID", 120],
  ["band", "Band", 90],
  ["skillType", "Skill Type", 110],
  ["exitDate", "Exit date", 110],
];

const DEFS = [
  {
    key: "employee",
    label: "Employee",
    w: 260,
    get: (e) =>
      `${getEmployeeId(e) || "-"} - ${getEmployeeName(e)} · ${getDesignation(e)}`,
    render: (e) => (
      <>
        <div className="emx-e1">
          {getEmployeeId(e) || "-"} - {getEmployeeName(e)}
        </div>
        <div className="emx-e2">{getDesignation(e)}</div>
      </>
    ),
  },
  ...PLAIN.map(([key, label, w, info]) => ({
    key,
    label,
    w,
    info,
    get: (e) => cellText(e, key),
    render:
      key === "status"
        ? (e) => (
            <span
              className={`emx-tag ${normalizeStatus(e?.status) === "active" ? "ok" : "grey"}`}
            >
              {cellText(e, "status")}
            </span>
          )
        : undefined,
  })),
];

const LEGACY_KEYS = PLAIN.map((p) => p[0]);

export function EmployeeRosterTable({
  rows = [],
  filters = {}, // legacy string filters from the parent (still honoured)
  currentPage = 1,
  setCurrentPage,
  totalPages = 1,
  totalCount = 0,
  onToggleStatus,
  onBulkStatusChange, // (status, employees, { exitDate, remark }) => Promise
  onBulkFieldChange, // optional: ({ field, value, remark }, employees) => Promise  -> shows "Change…"
  statusUpdatingIds = new Set(),
  bulkStatusUpdating = false,
  canEdit = true,
  auditEntries, // optional: [{ title, meta, detail }]
}) {
  const grid = useGridState(DEFS);
  const [panel, updatePanel] = usePanel("em");
  const [selected, setSelected] = useState(new Set());
  const [modal, setModal] = useState(null); // "inactive" | "change"

  const list = useMemo(() => (Array.isArray(rows) ? rows : []), [rows]);

  const legacy = useCallback(
    (employee) =>
      LEGACY_KEYS.every((key) => {
        const f = String(filters?.[key] ?? "")
          .trim()
          .toLowerCase();
        return !f || cellText(employee, key).toLowerCase().includes(f);
      }),
    [filters],
  );

  const view = useGridView(list, DEFS, grid, legacy);

  /* drop selections that are no longer on this page */
  useEffect(() => {
    const ids = new Set(list.map(getEmployeeId));
    setSelected((current) => {
      const next = new Set([...current].filter((id) => ids.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [list]);

  const viewIds = useMemo(
    () => view.map(getEmployeeId).filter(Boolean),
    [view],
  );
  const selectedRows = useMemo(
    () => list.filter((e) => selected.has(getEmployeeId(e))),
    [list, selected],
  );
  const viewSelected = viewIds.filter((id) => selected.has(id)).length;
  const allSelected = viewIds.length > 0 && viewSelected === viewIds.length;

  const toggleRow = (id) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((current) => {
      const next = new Set(current);
      viewIds.forEach((id) => (allSelected ? next.delete(id) : next.add(id)));
      return next;
    });

  const bulkStatus = async (status, extra = {}) => {
    if (!selectedRows.length) return;
    await onBulkStatusChange?.(status, selectedRows, extra);
    setSelected(new Set());
    setModal(null);
  };

  const bulkField = async (change) => {
    if (!selectedRows.length) return;
    await onBulkFieldChange?.(change, selectedRows);
    setSelected(new Set());
    setModal(null);
  };

  const suggestionsFor = (key) =>
    [
      ...new Set(
        list.map((e) => String(getValue(e, key))).filter((v) => v && v !== "-"),
      ),
    ].sort();

  const goTo = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage?.(page);
  };

  return (
    <div className="emx-work">
      <div className="emx-main">
        {canEdit && selectedRows.length > 0 && (
          <div className="emx-selbar">
            <b>{selectedRows.length} selected</b>
            <button
              type="button"
              className="emx-mini"
              disabled={bulkStatusUpdating}
              onClick={() => setModal("inactive")}
            >
              Set Inactive
            </button>
            <button
              type="button"
              className="emx-mini"
              disabled={bulkStatusUpdating}
              onClick={() => bulkStatus("Active")}
            >
              Set Active
            </button>
            {onBulkFieldChange && (
              <button
                type="button"
                className="emx-mini p"
                onClick={() => setModal("change")}
              >
                Change…
              </button>
            )}
            <button
              type="button"
              className="emx-mini"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </button>
          </div>
        )}

        <DataGrid
          defs={DEFS}
          grid={grid}
          allRows={list}
          rows={view}
          rowKey={(e) => getEmployeeId(e) || String(getEmployeeName(e))}
          selectable={canEdit}
          selected={selected}
          onToggleRow={toggleRow}
          onToggleAll={toggleAll}
          allSelected={allSelected}
          someSelected={viewSelected > 0}
          rowClass={(e) =>
            normalizeStatus(e?.status) === "active" ? "" : "emx-dim"
          }
          actionHeader={canEdit ? "Action" : null}
          renderAction={(employee) => {
            const id = getEmployeeId(employee);
            const active = normalizeStatus(employee?.status) === "active";
            const busy = statusUpdatingIds?.has?.(id) || bulkStatusUpdating;
            return (
              <button
                type="button"
                disabled={busy}
                className={`emx-mini ${active ? "danger" : "good"}`}
                onClick={() => onToggleStatus?.(employee)}
              >
                {busy ? "Saving..." : active ? "Set Inactive" : "Set Active"}
              </button>
            );
          }}
          emptyText="No employees found."
        />

        <div className="emx-pg">
          <span>
            {totalCount > 0
              ? `Page ${currentPage} of ${totalPages} • ${totalCount} employees`
              : "No employees"}
            {view.length !== list.length &&
              ` • showing ${view.length} of ${list.length} on this page`}
          </span>

          {grid.filterCount > 0 && (
            <span className="emx-chip">
              Showing: {grid.filterCount} column filter
              {grid.filterCount > 1 ? "s" : ""} (this page){" "}
              <button type="button" onClick={grid.clearAll}>
                ✕ Clear
              </button>
            </span>
          )}

          <span className="emx-pgs">
            <button
              type="button"
              disabled={currentPage <= 1 || bulkStatusUpdating}
              onClick={() => goTo(currentPage - 1)}
            >
              ‹ Previous
            </button>
            <span>
              {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages || bulkStatusUpdating}
              onClick={() => goTo(currentPage + 1)}
            >
              Next ›
            </button>
          </span>
        </div>

      </div>

      <SidePanel
        open={panel.open}
        title="Employee Master"
        tab={panel.tab}
        onTab={(tab) => updatePanel({ tab })}
        onClose={() => updatePanel({ open: false })}
        defs={DEFS}
        grid={grid}
        audit={auditEntries}
        auditHint="Uploads and changes made on this screen: user, date and time, employee, previous and new value."
        onFullAudit={panel.fullAudit}
      />
      <PanelTab open={panel.open} onOpen={() => updatePanel({ open: true })} />

      {modal === "inactive" && (
        <InactiveModal
          count={selectedRows.length}
          onClose={() => setModal(null)}
          onApply={(extra) => bulkStatus("Inactive", extra)}
        />
      )}
      {modal === "change" && (
        <ChangeModal
          count={selectedRows.length}
          suggestionsFor={suggestionsFor}
          onClose={() => setModal(null)}
          onApply={bulkField}
        />
      )}
    </div>
  );
}

export default EmployeeRosterTable;