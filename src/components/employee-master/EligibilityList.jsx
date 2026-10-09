import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Menu,
  Plus,
  Search,
  Upload,
} from "lucide-react";

import { ColumnFilter } from "./ColumnFilter";
import { fmtDoj } from "@/lib/employee-master-utils";

/* Change tag: New / Changed / Removed (comes from the data if present) */
function tagOf(employee) {
  return (
    employee.changeTag ||
    employee.eligibilityTag ||
    (employee.manualOverride ? "Changed" : "")
  );
}

function updatedOf(employee) {
  return (
    employee.eligibilityUpdatedAt ||
    employee.rawEmployee?.eligible_updated_at ||
    employee.rawEmployee?.updated_at ||
    employee.rawEmployee?.modifiedtime ||
    employee.rawEmployee?.MODIFIEDTIME ||
    "—"
  );
}

const COLUMNS = [
  {
    key: "name",
    label: "Employee",
    type: "text",
    get: (e) => `${e.empId} - ${e.name} ${e.designation || ""}`,
  },
  { key: "organization", label: "Department", type: "select", get: (e) => e.organization || "" },
  { key: "doj", label: "Date of Joining", type: "text", get: (e) => fmtDoj(e.doj) },
  {
    key: "appraiser",
    label: "Tech-ED/BU Head Name",
    type: "select",
    get: (e) => e.appraiser || e.superManager || "",
  },
  {
    key: "eligible",
    label: "Eligible",
    type: "select",
    get: (e) => (e.eligible === "Yes" ? "Eligible" : "Not Eligible"),
  },
  { key: "eligibleReason", label: "Reason", type: "text", get: (e) => e.eligibleReason || "" },
  { key: "setBy", label: "Set by", type: "select", get: (e) => (e.manualOverride ? "Manual" : "Criteria") },
  {
    key: "changeTag",
    label: "Change tag",
    type: "select",
    get: (e) => {
      const t = tagOf(e);
      const x = e.inExceptionalCycle ? "In open Exceptional cycle" : "";
      return [t, x].filter(Boolean).join(" · ") || "—";
    },
  },
  { key: "lastUpdated", label: "Last updated", type: "text", get: (e) => updatedOf(e) },
];

const PAGE_SIZE = 20;

export function EligibilityList({
  employees,
  search,
  setSearch,
  filters,
  setFilters,
  onChangeEligibility,
  onDownloadTemplate,
  onImport,
  onExport,
  onAuditHistory,
  onAddEmployee,
}) {
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const canEdit = Boolean(onChangeEligibility);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const handleEscape = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", handleOutsideClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  const activeEmployees = useMemo(() => employees, [employees]);

  const rows = useMemo(() => {
    const searchTerm = search.trim().toLowerCase();

    return activeEmployees.filter((employee) => {
      if (
        searchTerm &&
        !String(employee.name ?? "").toLowerCase().includes(searchTerm) &&
        !String(employee.empId ?? "").toLowerCase().includes(searchTerm)
      ) {
        return false;
      }

      return COLUMNS.every((column) => {
        const filter = filters[column.key];
        if (!filter) return true;
        const value = column.get(employee) ?? "";
        if (filter.type === "text") {
          return String(value).toLowerCase().includes(String(filter.term || "").toLowerCase());
        }
        return filter.values.has(value);
      });
    });
  }, [activeEmployees, filters, search]);

  const removedCount = activeEmployees.filter((e) => tagOf(e) === "Removed").length;
  const countable = activeEmployees.length - removedCount;
  const eligibleCount = activeEmployees.filter(
    (e) => e.eligible === "Yes" && tagOf(e) !== "Removed",
  ).length;
  const notEligibleCount = countable - eligibleCount;

  /* pagination */
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return rows.slice(start, start + PAGE_SIZE);
  }, [rows, safePage]);

  const startRecord = rows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endRecord = Math.min(safePage * PAGE_SIZE, rows.length);

  /* selection (only rows that are not Removed can be selected) */
  const selectableRows = useMemo(() => rows.filter((e) => tagOf(e) !== "Removed"), [rows]);
  const selectedRows = useMemo(
    () => activeEmployees.filter((e) => selectedIds.has(e.empId)),
    [activeEmployees, selectedIds],
  );
  const selectedVisible = selectableRows.filter((e) => selectedIds.has(e.empId)).length;
  const allSelected = selectableRows.length > 0 && selectedVisible === selectableRows.length;

  const toggleOne = (empId) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(empId)) next.delete(empId);
      else next.add(empId);
      return next;
    });

  const toggleAll = () =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allSelected) selectableRows.forEach((e) => next.delete(e.empId));
      else selectableRows.forEach((e) => next.add(e.empId));
      return next;
    });

  const handleSearchChange = (value) => {
    setSearch(value);
    setCurrentPage(1);
    setMenuOpen(false);
  };

  const handleFilterChange = (key, value) => {
    setFilters((current) => {
      const next = { ...current };
      if (!value) delete next[key];
      else next[key] = value;
      return next;
    });
    setCurrentPage(1);
    setMenuOpen(false);
  };

  const filterCount = Object.keys(filters || {}).length;

  const getActionLabel = (employee) =>
    employee.eligible === "Yes" ? "Set Not Eligible" : "Set Eligible";

  const changeSelected = () => {
    if (!selectedRows.length) return;
    onChangeEligibility(selectedRows);
    setSelectedIds(new Set());
  };

  return (
    <div className="em-eligibility-list">
      {/* ================= HEADER ================= */}
      <div className="em-eligibility-header">
        <div className="em-eligibility-stats">
          <div>
            <strong>{countable}</strong>
            <span>Total</span>
          </div>
          <div>
            <strong>{eligibleCount}</strong>
            <span>Eligible</span>
          </div>
          <div>
            <strong>{notEligibleCount}</strong>
            <span>Not Eligible</span>
          </div>
        </div>

        <div className="em-eligibility-actions">
          <div className="em-search">
            <Search size={14} />
            <input
              value={search}
              onChange={(event) => handleSearchChange(event.target.value)}
              placeholder="Search name / ID"
            />
          </div>

          {onAddEmployee && (
            <button type="button" className="em-btn em-btn-dashed" onClick={onAddEmployee}>
              <Plus size={14} /> Add employee
            </button>
          )}

          <div
            ref={menuRef}
            className="em-menu-wrapper"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="em-btn em-btn-primary"
              aria-label="Menu"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((current) => !current)}
            >
              <Menu size={14} /> Menu ▾
            </button>

            {menuOpen && (
              <div
                className="em-menu-dropdown"
                role="menu"
                onMouseDown={(event) => event.stopPropagation()}
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onDownloadTemplate();
                  }}
                >
                  <Download size={14} />
                  Download Template
                </button>

                {onImport && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      fileInputRef.current?.click();
                    }}
                  >
                    <Upload size={14} />
                    Import Eligibility
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onExport(rows);
                  }}
                >
                  <Download size={14} />
                  Export to Excel
                </button>

                {onAuditHistory && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setMenuOpen(false);
                      onAuditHistory?.();
                    }}
                  >
                    <History size={14} />
                    Audit Trail
                  </button>
                )}
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onImport?.(file);
                event.target.value = "";
              }}
            />
          </div>
        </div>
      </div>

      {/* ================= SELECTION BAR ================= */}
      {canEdit && selectedRows.length > 0 && (
        <div className="em-sel-bar">
          <b>{selectedRows.length} selected</b>
          <button type="button" className="em-mini-btn" onClick={changeSelected}>
            Set Eligible / Not Eligible…
          </button>
          <button type="button" className="em-mini-btn" onClick={() => setSelectedIds(new Set())}>
            Clear selection
          </button>
        </div>
      )}

      {/* ================= TABLE ================= */}
      <div className="em-grid-wrap">
        <table className="em-table em-sticky-first">
          <thead>
            <tr>
              {COLUMNS.map((column, index) => (
                <th key={column.key} style={index === 0 ? { minWidth: 260 } : undefined}>
                  <div className="em-th-inner">
                    {canEdit && index === 0 && (
                      <input
                        type="checkbox"
                        className="em-chk"
                        checked={allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = !allSelected && selectedVisible > 0;
                        }}
                        onChange={toggleAll}
                        title="Select all rows in the current filter"
                        aria-label="Select all"
                      />
                    )}
                    <span>{column.label}</span>
                    <ColumnFilter
                      column={column}
                      rows={activeEmployees}
                      value={filters[column.key]}
                      onChange={(value) => handleFilterChange(column.key, value)}
                    />
                  </div>
                </th>
              ))}
              {canEdit && <th>Action</th>}
            </tr>
          </thead>

          <tbody>
            {paginatedRows.map((employee) => {
              const tag = tagOf(employee);
              const removed = tag === "Removed";
              const checked = selectedIds.has(employee.empId);

              return (
                <tr
                  key={employee.empId}
                  className={`${checked ? "em-row-sel" : ""} ${removed ? "em-row-dim" : ""}`}
                >
                  <td>
                    <div className="em-emp-cell">
                      {canEdit && (
                        <input
                          type="checkbox"
                          className="em-chk"
                          checked={checked}
                          disabled={removed}
                          onChange={() => toggleOne(employee.empId)}
                          aria-label={`Select ${employee.name}`}
                        />
                      )}
                      <div className="em-reference-employee">
                        <strong>
                          {employee.empId} - {employee.name}
                        </strong>
                        <span>{employee.designation || "—"}</span>
                      </div>
                    </div>
                  </td>

                  <td>{employee.organization || "—"}</td>
                  <td>{fmtDoj(employee.doj) || "—"}</td>
                  <td>{employee.appraiser || employee.superManager || "—"}</td>

                  <td>
                    <span className={`em-tag ${employee.eligible === "Yes" ? "ok" : "warn"}`}>
                      {employee.eligible === "Yes" ? "Eligible" : "Not Eligible"}
                    </span>
                  </td>

                  <td>{employee.eligibleReason || "—"}</td>
                  <td>{employee.manualOverride ? "Manual" : "Criteria"}</td>

                  <td>
                    {tag && (
                      <span
                        className={`em-tag ${
                          tag === "New" ? "info" : tag === "Changed" ? "chg" : "grey"
                        }`}
                      >
                        {tag}
                      </span>
                    )}{" "}
                    {employee.inExceptionalCycle && (
                      <span className="em-tag warn">In open Exceptional cycle</span>
                    )}
                    {!tag && !employee.inExceptionalCycle && "—"}
                  </td>

                  <td>{updatedOf(employee)}</td>

                  {canEdit && (
                    <td>
                      {removed ? (
                        "—"
                      ) : (
                        <button
                          type="button"
                          className="em-mini-btn"
                          onClick={() => onChangeEligibility(employee)}
                        >
                          {getActionLabel(employee)}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}

            {!paginatedRows.length && (
              <tr>
                <td colSpan={COLUMNS.length + (canEdit ? 1 : 0)} className="em-empty">
                  No eligibility records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* ================= PAGINATION ================= */}
      <div className="em-pagination">
        <div className="em-pagination-info">
          Showing{" "}
          <strong>
            {startRecord}-{endRecord}
          </strong>{" "}
          of <strong>{rows.length}</strong> employees
          {rows.length !== activeEmployees.length && ` (filtered from ${activeEmployees.length})`}
          {filterCount > 0 && (
            <span className="em-showing">
              {filterCount} filter{filterCount > 1 ? "s" : ""}
              <button type="button" onClick={() => setFilters({})}>
                ✕ Clear
              </button>
            </span>
          )}
        </div>

        <div className="em-pagination-controls">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage(Math.max(1, safePage - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>

          {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => (
            <button
              key={page}
              type="button"
              className={page === safePage ? "active" : ""}
              onClick={() => setCurrentPage(page)}
            >
              {page}
            </button>
          ))}

          <button
            type="button"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage(Math.min(totalPages, safePage + 1))}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>

      <div className="em-note">
        One Employee ID appears once in the list. An employee in an open Exceptional cycle stays in
        the list but gets no Appraisal Sheet row.
      </div>
    </div>
  );
}