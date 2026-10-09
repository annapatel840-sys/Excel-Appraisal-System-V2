import { useEffect, useMemo, useState } from "react";

import { ColumnFilter } from "./ColumnFilter";
import { fmtDoj } from "@/lib/employee-master-utils";

const COLUMNS = [
  { key: "type", label: "Emp Type", type: "select" },
  { key: "dept", label: "Department", type: "select" },
  { key: "reportingManager", label: "Reporting Manager", type: "select" },
  { key: "te", label: "Tech-ED/BU Head Name", type: "select" },
  { key: "director", label: "Director", type: "select" },
  { key: "appraiser", label: "Appraiser Tech-ED", type: "select" },
  { key: "totalExp", label: "Total Experience", type: "text" },
  { key: "orgExp", label: "Wissen Experience", type: "text" },
  { key: "email", label: "Email ID", type: "text" },
  { key: "doj", label: "Date of Joining", type: "text" },
  { key: "status", label: "Employee Status", type: "select" },
  { key: "location", label: "Location", type: "select" },
  {
    key: "lastAppraisal",
    label: "Last Appraisal Month and Year",
    type: "select",
  },
  { key: "recordOwner", label: "Record Owner ID", type: "select" },
  { key: "band", label: "Band", type: "select" },
  { key: "skillType", label: "Skill Type", type: "select" },
  { key: "exitDate", label: "Exit date", type: "text" },
];

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

function normalizeStatus(status) {
  return String(status ?? "")
    .trim()
    .toLowerCase();
}

/* Value shown in the cell AND used by the column filter */
function cellText(employee, key) {
  if (key === "employee") {
    return `${getEmployeeId(employee)} - ${getEmployeeName(employee)} ${getDesignation(employee)}`;
  }
  if (key === "status") {
    return normalizeStatus(employee?.status) === "active"
      ? "Active"
      : "Inactive";
  }
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

const EMPLOYEE_COLUMN = { key: "employee", label: "Employee", type: "text" };

function withGet(column) {
  return { ...column, get: (employee) => cellText(employee, column.key) };
}

const ALL_COLUMNS = [EMPLOYEE_COLUMN, ...COLUMNS].map(withGet);

function StatusBadge({ status }) {
  const isActive = normalizeStatus(status) === "active";
  return (
    <span className={`em-tag ${isActive ? "ok" : "grey"}`}>
      {isActive ? "Active" : "Inactive"}
    </span>
  );
}

export function EmployeeRosterTable({
  rows = [],
  filters = {},
  setFilters,
  currentPage = 1,
  setCurrentPage,
  totalPages = 1,
  totalCount = 0,
  onToggleStatus,
  onBulkStatusChange,
  statusUpdatingIds = new Set(),
  bulkStatusUpdating = false,
  canEdit = true,
}) {
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState(new Set());
  // Excel-style column filters: { [key]: { type:"text", term } | { type:"select", values:Set } }
  const [colFilters, setColFilters] = useState({});

  const filteredRows = useMemo(() => {
    if (!Array.isArray(rows)) return [];

    return rows.filter((employee) => {
      // legacy string filters coming from the parent (kept for compatibility)
      const legacyOk = COLUMNS.every((column) => {
        const filterValue = String(filters?.[column.key] ?? "")
          .trim()
          .toLowerCase();
        if (!filterValue) return true;
        return cellText(employee, column.key)
          .trim()
          .toLowerCase()
          .includes(filterValue);
      });
      if (!legacyOk) return false;

      // new column-menu filters
      return ALL_COLUMNS.every((column) => {
        const filter = colFilters[column.key];
        if (!filter) return true;
        const value = column.get(employee);
        if (filter.type === "text") {
          return String(value)
            .toLowerCase()
            .includes(String(filter.term || "").toLowerCase());
        }
        return filter.values.has(value);
      });
    });
  }, [rows, filters, colFilters]);

  const handleFilterChange = (key, value) => {
    setColFilters((current) => {
      const next = { ...current };
      if (!value) delete next[key];
      else next[key] = value;
      return next;
    });
  };

  const activeFilterCount = Object.keys(colFilters).length;

  /* keep selection only for visible employees */
  useEffect(() => {
    const visibleIds = new Set(
      filteredRows.map((employee) => getEmployeeId(employee)).filter(Boolean),
    );
    setSelectedEmployeeIds((current) => {
      const next = new Set([...current].filter((id) => visibleIds.has(id)));
      return next.size === current.size ? current : next;
    });
  }, [filteredRows]);

  const visibleEmployeeIds = useMemo(
    () =>
      filteredRows.map((employee) => getEmployeeId(employee)).filter(Boolean),
    [filteredRows],
  );

  const selectedCount = visibleEmployeeIds.filter((id) =>
    selectedEmployeeIds.has(id),
  ).length;
  const allVisibleSelected =
    visibleEmployeeIds.length > 0 &&
    selectedCount === visibleEmployeeIds.length;
  const someVisibleSelected = selectedCount > 0;

  const toggleEmployeeSelection = (employeeId) => {
    const id = String(employeeId ?? "").trim();
    if (!id) return;
    setSelectedEmployeeIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedEmployeeIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected)
        visibleEmployeeIds.forEach((id) => next.delete(id));
      else visibleEmployeeIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const handleBulkStatus = async (status) => {
    const selectedEmployees = filteredRows.filter((employee) =>
      selectedEmployeeIds.has(getEmployeeId(employee)),
    );
    if (selectedEmployees.length === 0) return;
    await onBulkStatusChange?.(status, selectedEmployees);
    setSelectedEmployeeIds(new Set());
  };

  const handlePageChange = (page) => {
    if (page < 1 || page > totalPages) return;
    setCurrentPage?.(page);
  };

  const dataColumns = ALL_COLUMNS.slice(1);

  return (
    <div className="em-roster">
      {/* ================= SELECTION BAR ================= */}
      {canEdit && someVisibleSelected && (
        <div className="em-sel-bar">
          <b>{selectedCount} selected</b>
          <button
            type="button"
            className="em-mini-btn"
            disabled={bulkStatusUpdating}
            onClick={() => handleBulkStatus("Inactive")}
          >
            Set Inactive
          </button>
          <button
            type="button"
            className="em-mini-btn"
            disabled={bulkStatusUpdating}
            onClick={() => handleBulkStatus("Active")}
          >
            Set Active
          </button>
          <button
            type="button"
            className="em-mini-btn"
            onClick={() => setSelectedEmployeeIds(new Set())}
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="em-grid-wrap">
        <table className="em-table em-sticky-first">
          <thead>
            <tr>
              {/* Employee (sticky) */}
              <th style={{ minWidth: 260 }}>
                <div className="em-th-inner">
                  {canEdit && (
                    <input
                      type="checkbox"
                      className="em-chk"
                      checked={allVisibleSelected}
                      ref={(element) => {
                        if (element) {
                          element.indeterminate =
                            !allVisibleSelected && someVisibleSelected;
                        }
                      }}
                      onChange={toggleSelectAll}
                      disabled={filteredRows.length === 0 || bulkStatusUpdating}
                      title="Select all rows in the current filter"
                      aria-label="Select all"
                    />
                  )}
                  <span>Employee</span>
                  <ColumnFilter
                    column={ALL_COLUMNS[0]}
                    rows={rows}
                    value={colFilters.employee}
                    onChange={(value) => handleFilterChange("employee", value)}
                  />
                </div>
              </th>

              {dataColumns.map((column) => (
                <th key={column.key} style={{ whiteSpace: "nowrap" }}>
                  <div className="em-th-inner">
                    <span>{column.label}</span>
                    <ColumnFilter
                      column={column}
                      rows={rows}
                      value={colFilters[column.key]}
                      onChange={(value) =>
                        handleFilterChange(column.key, value)
                      }
                    />
                  </div>
                </th>
              ))}

              {canEdit && (
                <th style={{ whiteSpace: "nowrap", minWidth: 115 }}>Action</th>
              )}
            </tr>
          </thead>

          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={dataColumns.length + 1 + (canEdit ? 1 : 0)}
                  className="em-empty"
                >
                  No employees found.
                </td>
              </tr>
            ) : (
              filteredRows.map((employee) => {
                const employeeId = getEmployeeId(employee);
                const employeeName = getEmployeeName(employee);
                const status = String(employee?.status ?? "Inactive").trim();
                const isActive = normalizeStatus(status) === "active";
                const isSelected = selectedEmployeeIds.has(employeeId);
                const isUpdating =
                  statusUpdatingIds?.has?.(employeeId) || bulkStatusUpdating;

                return (
                  <tr
                    key={employeeId || employeeName}
                    className={`${isSelected ? "em-row-sel" : ""} ${isActive ? "" : "em-row-dim"}`}
                  >
                    <td>
                      <div className="em-emp-cell">
                        {canEdit && (
                          <input
                            type="checkbox"
                            className="em-chk"
                            checked={isSelected}
                            onChange={() => toggleEmployeeSelection(employeeId)}
                            disabled={bulkStatusUpdating}
                            aria-label={`Select ${employeeName}`}
                          />
                        )}
                        <div className="em-reference-employee">
                          <strong>
                            {employeeId || "-"} - {employeeName}
                          </strong>
                          <span>{getDesignation(employee)}</span>
                        </div>
                      </div>
                    </td>

                    {dataColumns.map((column) => (
                      <td key={column.key} style={{ whiteSpace: "nowrap" }}>
                        {column.key === "status" ? (
                          <StatusBadge status={status} />
                        ) : (
                          column.get(employee)
                        )}
                      </td>
                    ))}

                    {canEdit && (
                      <td>
                        <button
                          type="button"
                          onClick={() => onToggleStatus?.(employee)}
                          disabled={isUpdating}
                          className={`em-mini-btn ${isActive ? "danger" : "good"}`}
                        >
                          {isUpdating
                            ? "Saving..."
                            : isActive
                              ? "Set Inactive"
                              : "Set Active"}
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* ================= PAGINATION ================= */}
      <div className="em-pg-row">
        <div className="em-pg-info">
          {totalCount > 0
            ? `Page ${currentPage} of ${totalPages} • ${totalCount} employees`
            : "No employees"}
          {activeFilterCount > 0 && (
            <span className="em-showing">
              {activeFilterCount} column filter
              {activeFilterCount > 1 ? "s" : ""} (this page)
              <button type="button" onClick={() => setColFilters({})}>
                ✕ Clear
              </button>
            </span>
          )}
        </div>

        <div className="em-pg-btns">
          <button
            type="button"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1 || bulkStatusUpdating}
          >
            ‹ Previous
          </button>
          <span className="em-pg-cur">
            {currentPage} / {totalPages}
          </span>
          <button
            type="button"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages || bulkStatusUpdating}
          >
            Next ›
          </button>
        </div>
      </div>

      <div className="em-note">
        Employees are never deleted. An inactive employee leaves the Appraisal
        Sheet but stays in history.
      </div>
    </div>
  );
}

export default EmployeeRosterTable;
