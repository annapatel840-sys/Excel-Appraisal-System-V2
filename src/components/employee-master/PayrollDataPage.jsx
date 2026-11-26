import { money as formatMoney } from "@/lib/currency-format";
import { useEffect, useMemo, useRef, useState } from "react";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import { useAccess, useScreenFields } from "@/lib/access-store";
import { useCatalystUser } from "@/lib/catalyst-auth";
import {
  masterSnapshotKey,
  readMasterSnapshot,
  writeMasterSnapshot,
} from "@/lib/roster-snapshot";
import { ColumnFilter } from "@/components/appraisal/ColumnFilter";
import { useRowSelection } from "@/lib/table-export";
import {
  FilterStatus,
  filterTableCss,
  useTableFilters,
} from "./FilterableTable";
import { UploadPage } from "./UploadPage";

const STATIC_COL_META = {
  emp_id: { label: "Employee ID", frozen: true },
  emp_name: { label: "Employee Name" },
  appraisal_cycle_name: { label: "Appraisal Cycle Name" },
  effectiveDate: { label: "Effective Date" },
  fy_year: { label: "FY Year" },
  basePay: { label: "Current Annual Base Pay", type: "number", money: true },
  joiningBonus: { label: "Joining Bonus", type: "number", money: true },
  performanceBonus: { label: "Performance Bonus", type: "number", money: true },
  retentionBonus: { label: "Retention Bonus", type: "number", money: true },
  hikePct: { label: "Hike%", type: "number", pct: true },
  hikeAmt: { label: "Hike Amount", type: "number", money: true },
  totalCtcRewards: {
    label: "Total CTC with Rewards",
    type: "number",
    money: true,
  },
  totalRewardHikeAmt: {
    label: "Total Reward Hike Amount",
    type: "number",
    money: true,
  },
  totalRewardHikePct: {
    label: "Total Reward Hike%",
    type: "number",
    pct: true,
  },
  targetPbNextYear: {
    label: "Target Performance Bonus for Next Year",
    type: "number",
    money: true,
  },
  targetPbCriteria: { label: "Target PB Criteria" },
  totalBonus: { label: "Total Bonus", type: "number", money: true },
  newBasePay: { label: "New Base Pay", type: "number", money: true },
  rbPaid: { label: "RB to be paid", type: "number", money: true },
  rbMonth: { label: "Month(RB)" },
  pbPaid: { label: "PB to be paid", type: "number", money: true },
  pbMonth: { label: "Month(PB)" },
  tbPaid: { label: "TB to be paid", type: "number", money: true },
  tbMonth: { label: "Month(TB)" },
};

function schemaLabel(name) {
  return String(name || "")
    .replace(/_/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function buildColumnsFromSchema(schema) {
  const hidden = new Set([
    "ROWID",
    "CREATORID",
    "CREATEDTIME",
    "MODIFIEDTIME",
    "appraisal_cycle_id",
    "source_batch",
    "source_file",
  ]);
  const schemaMap = new Map(
    (schema?.columns || []).map((column) => [column.name, column]),
  );
  return Object.keys(STATIC_COL_META)
    .map((key) => {
      const column = schemaMap.get(key);
      if (column && hidden.has(column.name)) return null;
      const meta = STATIC_COL_META[key];
      const type =
        column &&
        /int|decimal|double|float|number|numeric|bigint/.test(column.type || "")
          ? "number"
          : "text";
      return {
        key,
        label: meta.label,
        type: meta.type || type,
        frozen: meta.frozen,
        money: meta.money,
        pct: meta.pct,
      };
    })
    .filter(Boolean);
}

// Precomputed record -> previous-cycle record for the same employee, ordered
// by cycle start date. Records whose cycle is unknown (e.g. deleted) have no
// start date, so they are left out of the ordering instead of being treated
// as the earliest cycle.
function buildPriorMap(stored, cycleOrder = {}) {
  const byEmp = new Map();
  stored.forEach((r) => {
    if (cycleOrder[r.cycleId] == null) return;
    const list = byEmp.get(r.empId) || [];
    list.push(r);
    byEmp.set(r.empId, list);
  });
  const prior = new Map();
  byEmp.forEach((list) => {
    list.sort((a, b) => cycleOrder[a.cycleId] - cycleOrder[b.cycleId]);
    list.forEach((r, index) => {
      if (index > 0) prior.set(r, list[index - 1]);
    });
  });
  return prior;
}
function priorRecordFor(rec, priorMap) {
  return priorMap?.get(rec) || null;
}
function fmtMoney(v) {
  return v == null ? "—" : formatMoney(Math.round(v));
}
function yoyPctFor(r, baseKey, priorMap) {
  const prior = priorRecordFor(r, priorMap);
  if (!prior) return null;
  const curVal = r[baseKey];
  const priorVal = prior[baseKey];
  if (priorVal === 0) return null;
  return ((curVal - priorVal) / Math.abs(priorVal)) * 100;
}
function rawValueFor(r, col, priorMap) {
  if (col.isYoy) return yoyPctFor(r, col.baseKey, priorMap);
  return r[col.key];
}
function defaultPayrollColumnWidth(column) {
  if (column.key === "emp_id") return 125;
  if (column.key === "emp_name") return 180;
  if (column.key === "appraisal_cycle_name") return 190;
  if (column.key === "effectiveDate") return 135;
  if (column.key === "fy_year") return 105;
  if (column.label && column.label.length > 24) return 190;
  if (column.money || column.pct) return 150;
  return 145;
}

/* ============================================================
   MAIN COMPONENT
   ============================================================ */

// Rows drawn at once. Drawing every payroll row x every column at once is what
// made this screen slow to open; the Appraisal Sheet grid pages the same way.
// Search, filters, sorting, the Records count and CSV export still use all rows.
const PAYROLL_PAGE_SIZE = 50;

export function PayrollDataPage() {
  const canAudit = useAccess().canAction("viewAudit");
  // Fields tab (Access screen) limits for this screen: a column set to Hidden is not shown.
  const fieldAccess = useScreenFields("payrollMaster");
  const signedInUser = useCatalystUser();
  const snapshotScope = String(
    signedInUser?.email ||
      signedInUser?.id ||
      signedInUser?.user_id ||
      "anonymous",
  )
    .trim()
    .toLowerCase();
  const payrollSnapshotKey = masterSnapshotKey(snapshotScope, "payroll");
  const [stored, setStored] = useState([]);
  const [audit, setAudit] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [search, setSearch] = useState("");
  const [cycleFilter, setCycleFilter] = useState("all");
  const [menuOpen, setMenuOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState("");
  const [page, setPage] = useState(1);
  const gridWrapRef = useRef(null);
  const [columnWidths, setColumnWidths] = useState({});
  const columnResizeRef = useRef(null);

  const widthOf = (column) =>
    columnWidths[column.key] ?? defaultPayrollColumnWidth(column);

  const startColumnResize = (event, column) => {
    event.preventDefault();
    event.stopPropagation();
    columnResizeRef.current = {
      key: column.key,
      startX: event.clientX,
      startWidth: widthOf(column),
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  useEffect(() => {
    const refreshPayroll = () => {
      setReloadToken((token) => token + 1);
    };

    window.addEventListener("appraisal:payroll-data-updated", refreshPayroll);

    return () => {
      window.removeEventListener(
        "appraisal:payroll-data-updated",
        refreshPayroll,
      );
    };
  }, []);

  useEffect(() => {
    const handlePointerMove = (event) => {
      if (!columnResizeRef.current) return;
      const { key, startX, startWidth } = columnResizeRef.current;
      const nextWidth = Math.min(
        520,
        Math.max(70, startWidth + event.clientX - startX),
      );
      setColumnWidths((previous) => ({ ...previous, [key]: nextWidth }));
    };

    const handlePointerUp = () => {
      columnResizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, []);

  useEffect(() => {
    let active = true;
    let freshApplied = false;
    if (!stored.length) setLoading(true);
    setLoadError("");
    // Show the last successful per-user IndexedDB copy immediately on refresh.
    readMasterSnapshot(payrollSnapshotKey).then((snapshot) => {
      if (!active || freshApplied || !snapshot) return;
      setStored(Array.isArray(snapshot.payroll) ? snapshot.payroll : []);
      setCycles(Array.isArray(snapshot.cycles) ? snapshot.cycles : []);
      setSchema(snapshot.schema || null);
      setLoading(false);
    });
    Promise.all([
      payrollCycleRequest("payroll", { fresh: true }),
      payrollCycleRequest("cycles"),
      payrollCycleRequest("schema"),
    ])
      .then(([payroll, cycleRows, schemaData]) => {
        if (!active) return;
        freshApplied = true;
        const payrollSchema = Array.isArray(schemaData)
          ? schemaData.find(
              (item) => String(item.name).toLowerCase() === "payroll",
            )
          : null;
        const nextSchema = payrollSchema || null;
        setStored(payroll);
        setCycles(cycleRows);
        setSchema(nextSchema);
        setLoadError("");
        writeMasterSnapshot(payrollSnapshotKey, {
          payroll,
          cycles: cycleRows,
          schema: nextSchema,
        });
      })
      .catch((error) => {
        if (active && !stored.length) setLoadError(error.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reloadToken, payrollSnapshotKey]);

  useEffect(() => {
    if (!auditOpen) return undefined;
    let active = true;
    setAuditLoading(true);
    setAuditError("");
    payrollCycleRequest("audit")
      .then((auditRows) => {
        if (active) setAudit(auditRows);
      })
      .catch((error) => {
        if (active)
          setAuditError(error.message || "Could not load the audit trail.");
      })
      .finally(() => {
        if (active) setAuditLoading(false);
      });
    return () => {
      active = false;
    };
  }, [auditOpen, reloadToken]);

  const cycleOrder = useMemo(
    () =>
      Object.fromEntries(
        [...cycles]
          .sort((a, b) => String(a.start).localeCompare(String(b.start)))
          .map((cycle, index) => [String(cycle.id), index + 1]),
      ),
    [cycles],
  );

  const priorMap = useMemo(
    () => buildPriorMap(stored, cycleOrder),
    [stored, cycleOrder],
  );

  // Appraisal cycles that actually have payroll rows, newest first.
  const cycleOptions = useMemo(() => {
    const names = {};
    cycles.forEach((c) => {
      names[String(c.id)] = c.name || c.cycle_name || c.title || "";
    });
    const seen = new Map();
    stored.forEach((r) => {
      const id = String(r.cycleId ?? r.cycle ?? "");
      if (!id || seen.has(id)) return;
      seen.set(id, names[id] || r.cycle || r.appraisal_cycle_name || id);
    });
    return Array.from(seen, ([value, label]) => ({ value, label })).sort(
      (a, b) =>
        (cycleOrder[b.value] || 0) - (cycleOrder[a.value] || 0) ||
        a.label.localeCompare(b.label),
    );
  }, [stored, cycles, cycleOrder]);

  const COLS = useMemo(
    () =>
      buildColumnsFromSchema(schema).filter(
        (column) => !fieldAccess.hidden(column.label),
      ),
    [schema, fieldAccess],
  );

  const colByKey = (key) => COLS.find((c) => c.key === key);

  // Location / search / cycle first, in the default order. The column filters and
  // sorts (the Appraisal Sheet's header filter) then work on top of that.
  const baseRows = useMemo(() => {
    // Payroll Master is organization-wide: show every row stored in Payroll_Data.
    const list = stored.filter((r) => {
      const term = search.toLowerCase();
      const matchesTerm =
        !term ||
        String(r.empName || "")
          .toLowerCase()
          .includes(term) ||
        String(r.empId || "")
          .toLowerCase()
          .includes(term);
      const matchesCycle =
        cycleFilter === "all" ||
        String(r.cycleId ?? r.cycle ?? "") === cycleFilter;
      return matchesTerm && matchesCycle;
    });
    return [...list].sort((a, b) => {
      if (a.empId !== b.empId) return a.empId < b.empId ? -1 : 1;
      return (cycleOrder[b.cycleId] || 0) - (cycleOrder[a.cycleId] || 0);
    });
  }, [stored, search, cycleFilter, cycleOrder]);

  const filterColumns = useMemo(
    () =>
      COLS.map((c) => ({
        key: c.key,
        label: c.label,
        kind: c.type === "number" ? "number" : "text",
        get: (r) => rawValueFor(r, c, priorMap),
      })),
    [COLS, priorMap],
  );
  const tf = useTableFilters(baseRows, filterColumns);
  const rows = tf.rows;

  const totalPages = Math.max(1, Math.ceil(rows.length / PAYROLL_PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAYROLL_PAGE_SIZE;
  const pageRows = useMemo(
    () => rows.slice(pageStart, pageStart + PAYROLL_PAGE_SIZE),
    [rows, pageStart],
  );

  // A new search / filter / sort starts again from the first page.
  useEffect(() => {
    setPage(1);
  }, [search, cycleFilter, tf.filters, tf.sorts]);

  useEffect(() => {
    if (gridWrapRef.current) gridWrapRef.current.scrollTop = 0;
  }, [currentPage]);

  // Row checkboxes (used for Export). Key = the row's position in the loaded data.
  const rowIds = useMemo(
    () => new Map(stored.map((r, i) => [r, String(i)])),
    [stored],
  );
  const rowKeyOf = (r) =>
    rowIds.get(r) ?? `${r.empId}|${r.cycleId ?? r.cycle ?? ""}`;
  const rowSel = useRowSelection(rows, rowKeyOf);

  const handleExport = () => {
    // Nothing ticked or everything ticked -> every row in the current filter;
    // otherwise only the ticked rows. All columns are exported.
    const exportRows = rowSel.pick(rows);
    const headers = COLS.map((c) => c.label);
    const csvCell = (value) => {
      const text = String(value ?? "");
      const safeText = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    };
    const lines = [headers.map(csvCell).join(",")];
    exportRows.forEach((r) => {
      const vals = COLS.map((col) => {
        const val = rawValueFor(r, col, priorMap);
        if (col.money) return val == null ? "" : Math.round(val);
        if (col.pct)
          return val == null || val === "" || Number.isNaN(Number(val))
            ? ""
            : Number(val).toFixed(2) + "%";
        return val ?? "";
      });
      lines.push(vals.map(csvCell).join(","));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payroll_data_export.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  };

  return (
    <div
      className="pd-root"
      onClick={() => {
        setMenuOpen(false);
      }}
    >
      <style>
        {PAYROLL_DATA_CSS + filterTableCss(".pd-root", ".pd-grid-wrap table")}
      </style>
      {loadError && (
        <div role="alert" className="pd-footer-note">
          {loadError}{" "}
          <button
            type="button"
            onClick={() => setReloadToken((token) => token + 1)}
          >
            Retry
          </button>
        </div>
      )}
      {loading && (
        <div className="pd-footer-note">Loading payroll records…</div>
      )}

      <div className="pd-topbar">
        <div>
          <h1>Payroll Master</h1>
          <p className="pd-sub">Entry and calculated pay values only.</p>
        </div>
        <div className="pd-stat">
          <div className="pd-label">Records</div>
          <div className="pd-value">
            {rows.length} / {stored.length}
          </div>
        </div>
      </div>

      <div className="pd-toolbar" onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          placeholder="Search name / employee ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={cycleFilter}
          onChange={(e) => setCycleFilter(e.target.value)}
          aria-label="Appraisal cycle"
        >
          <option value="all">All cycles</option>
          {cycleOptions.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
        <div className="pd-spacer" />
        <div className="pd-menu-wrap">
          <button
            type="button"
            className={`pd-btn pd-menu-btn ${menuOpen ? "open" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            Menu <span className="pd-caret">▾</span>
          </button>
          {menuOpen && (
            <div
              className="pd-menu-dropdown show"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="pd-menu-item"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setImportOpen(true);
                }}
              >
                <span className="pd-menu-icon">↑</span>
                Import
              </button>
              <button
                className="pd-menu-item"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setImportOpen(true);
                }}
              >
                <span className="pd-menu-icon">↑</span>Import
              </button>
              <button
                className="pd-menu-item"
                type="button"
                onClick={handleExport}
              >
                <span className="pd-menu-icon">↧</span>Export to CSV
              </button>
              {canAudit && (
                <button
                  className="pd-menu-item"
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setAuditOpen(true);
                  }}
                >
                  <span className="pd-menu-icon">⏱</span>Audit Trail
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <FilterStatus tf={tf} noun="rows" />
      <div className="pd-grid-wrap" ref={gridWrapRef}>
        <table>
          <colgroup>
            {COLS.map((column) => (
              <col key={column.key} style={{ width: widthOf(column) }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {COLS.map((c, colIndex) => (
                <th key={c.key} className={c.frozen ? "frozen" : ""}>
                  <div className="pd-th-inner">
                    {colIndex === 0 && (
                      <input
                        type="checkbox"
                        className="pd-chk"
                        checked={rowSel.allSelected}
                        ref={(el) => {
                          if (el) el.indeterminate = rowSel.someSelected;
                        }}
                        onChange={rowSel.toggleAll}
                        title="Select all rows in the current filter"
                        aria-label="Select all"
                      />
                    )}
                    <span>
                      {c.label}
                      {c.cat && (
                        <span style={{ fontSize: 9, opacity: 0.6 }}>
                          {" "}
                          ({c.cat.toUpperCase().charAt(0)})
                        </span>
                      )}
                    </span>
                    {(() => {
                      const fc = filterColumns.find((x) => x.key === c.key) || {
                        key: c.key,
                        label: c.label,
                        kind: "text",
                        get: () => "",
                      };
                      const sortIndex = tf.sorts.findIndex(
                        (x) => x.key === c.key,
                      );
                      return (
                        <ColumnFilter
                          boxed
                          alwaysBelow
                          allowGroup={false}
                          columnKey={`pd:${c.key}`}
                          label={c.label}
                          kind={fc.kind}
                          filter={tf.filters[c.key]}
                          options={tf.optionsFor(fc)}
                          allValues={
                            fc.kind === "number" ? tf.valuesFor(fc) : []
                          }
                          onChange={(filter) => tf.setFilter(c.key, filter)}
                          sortDirection={
                            sortIndex >= 0 ? tf.sorts[sortIndex].dir : null
                          }
                          sortLevel={sortIndex + 1}
                          onSortAsc={() => tf.addSort(c.key, "asc")}
                          onSortDesc={() => tf.addSort(c.key, "desc")}
                        />
                      );
                    })()}
                  </div>
                  <div
                    role="separator"
                    aria-label={`Resize ${c.label} column`}
                    title="Drag to resize column"
                    onPointerDown={(event) => startColumnResize(event, c)}
                    className="pd-column-resize-handle"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={COLS.length} className="pd-footer-note">
                  {loading
                    ? "Loading payroll records…"
                    : stored.length
                      ? "No payroll records match the current filters."
                      : "No payroll records are available yet."}
                </td>
              </tr>
            ) : (
              pageRows.map((r, i) => (
                <tr
                  key={`${r.empId}-${r.cycle}-${pageStart + i}`}
                  className={
                    rowSel.selected.has(rowKeyOf(r)) ? "pd-row-sel" : ""
                  }
                >
                  {COLS.map((col, colIndex) => {
                    const val = rawValueFor(r, col, priorMap);
                    if (col.isYoy) {
                      const cls =
                        val == null ? "new" : val >= 0 ? "pos" : "neg";
                      const label =
                        val == null
                          ? "new"
                          : (val >= 0 ? "+" : "") + val.toFixed(2) + "%";
                      return (
                        <td
                          key={col.key}
                          className={`pd-calc-cell pd-yoy-col ${cls}`}
                        >
                          {label}
                        </td>
                      );
                    }
                    let display;
                    if (col.money) display = fmtMoney(val);
                    else if (col.pct)
                      display =
                        val == null || val === "" || Number.isNaN(Number(val))
                          ? "—"
                          : Number(val).toFixed(2) + "%";
                    else display = val == null || val === "" ? "—" : val;

                    const cls =
                      (col.frozen
                        ? "frozen pd-name-cell"
                        : col.money || col.pct
                          ? "pd-master-cell"
                          : "") + (col.cat === "calc" ? " pd-calc-cell" : "");

                    const rowBox = colIndex === 0 && (
                      <input
                        type="checkbox"
                        className="pd-chk"
                        checked={rowSel.selected.has(rowKeyOf(r))}
                        onChange={() => rowSel.toggle(rowKeyOf(r))}
                        aria-label="Select row"
                      />
                    );

                    if (col.key === "promo") {
                      return (
                        <td key={col.key} className={cls}>
                          {rowBox}
                          <span
                            className={`pd-status-badge ${val === "Yes" ? "yes" : "no"}`}
                          >
                            {display}
                          </span>
                        </td>
                      );
                    }
                    return (
                      <td key={col.key} className={cls}>
                        {colIndex === 0 ? (
                          <span className="pd-chk-cell">
                            {rowBox}
                            <span>{display}</span>
                          </span>
                        ) : (
                          display
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {rows.length > PAYROLL_PAGE_SIZE && (
        <div className="pd-pager">
          <span>
            Rows {pageStart + 1}–
            {Math.min(pageStart + PAYROLL_PAGE_SIZE, rows.length)} of{" "}
            {rows.length}
          </span>
          <button
            type="button"
            className="pd-btn"
            disabled={currentPage <= 1}
            onClick={() => setPage(currentPage - 1)}
          >
            Previous
          </button>
          <span>
            Page {currentPage} of {totalPages}
          </span>
          <button
            type="button"
            className="pd-btn"
            disabled={currentPage >= totalPages}
            onClick={() => setPage(currentPage + 1)}
          >
            Next
          </button>
        </div>
      )}

      <div className="pd-footer-note">
        Read-only by design: the Upload screen is the only way data enters here.
        Every column header has a filter — sort, filter by condition, or pick
        specific values, same as Excel.
      </div>

      {importOpen && (
        <div
          className="pd-modal-overlay show"
          style={{ zIndex: 120, padding: 18 }}
          onClick={() => setImportOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Import Payroll Data"
            onClick={(event) => event.stopPropagation()}
            style={{
              background: "#fff",
              width: "min(1500px, 98vw)",
              height: "min(920px, 94vh)",
              display: "flex",
              flexDirection: "column",
              borderRadius: 12,
              overflow: "hidden",
              boxShadow: "0 20px 50px rgba(0,0,0,.3)",
            }}
          >
            <div className="pd-modal-head">
              <h2>Import Payroll Data</h2>
              <button type="button" className="pd-btn" onClick={() => setImportOpen(false)}>Close</button>
            </div>
            <div style={{ padding: 12, overflow: "auto", minHeight: 0, flex: 1 }}>
              <UploadPage key="payroll-master-import" initialScreen="pay" />
            </div>
          </div>
        </div>
      )}

      {auditOpen && (
        <div
          className="pd-modal-overlay show"
          onClick={() => setAuditOpen(false)}
        >
          <div className="pd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pd-modal-head">
              <h2>Audit Trail — Payroll Master</h2>
              <span className="pd-x" onClick={() => setAuditOpen(false)}>
                ✕
              </span>
            </div>
            <div className="pd-modal-body">
              <div className="pd-audit-note">
                Every field-level correction made to a stored record,
                independent of how the record originally arrived. Distinct from
                Upload History on the Upload screen, which tracks batches
                entering the system, not changes to what's already here.
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Employee</th>
                    <th>Cycle</th>
                    <th>Field</th>
                    <th>Old Value</th>
                    <th>New Value</th>
                  </tr>
                </thead>
                <tbody>
                  {!auditLoading &&
                    !auditError &&
                    audit.map((a) => (
                      <tr key={a.id}>
                        <td>{a.time}</td>
                        <td>{a.user}</td>
                        <td>
                          {a.empName || "—"}{" "}
                          <span style={{ color: "#8592a6" }}>({a.empId})</span>
                        </td>
                        <td>{a.cycle}</td>
                        <td>{a.field}</td>
                        <td className="pd-old-val">{a.oldVal || "—"}</td>
                        <td className="pd-new-val">
                          {a.newVal || a.details || "—"}
                        </td>
                      </tr>
                    ))}
                  {auditLoading && (
                    <tr>
                      <td colSpan={7}>Loading audit trail…</td>
                    </tr>
                  )}
                  {!auditLoading && auditError && (
                    <tr>
                      <td colSpan={7}>{auditError}</td>
                    </tr>
                  )}
                  {!auditLoading && !auditError && !audit.length && (
                    <tr>
                      <td colSpan={7}>No audit history yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="pd-modal-foot">
              <button
                className="pd-btn"
                type="button"
                onClick={() => setAuditOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const PAYROLL_DATA_CSS = `
.pd-root { font-family: "Inter", "Segoe UI", Arial, sans-serif; background: #f4f6f9; color: #1f2937; font-size: 13px; display: flex; flex-direction: column; min-height: 100%; }
.pd-topbar { height: 58px; flex: 0 0 auto; background: #17365d; color: white; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; }
.pd-topbar h1 { font-size: 16px; margin: 0; }
.pd-sub { font-size: 11.5px; color: #b9c6d9; margin: 2px 0 0; }
.pd-stat { text-align: right; }
.pd-label { font-size: 10.5px; color: #a9b8cd; }
.pd-value { font-size: 15px; font-weight: 700; }
.pd-toolbar { flex: 0 0 auto; background: white; padding: 12px 18px; border-bottom: 1px solid #d9dee7; display: flex; gap: 10px; align-items: center; }
.pd-toolbar input[type="text"] { padding: 8px 12px; border: 1px solid #cbd3df; border-radius: 6px; font-size: 13px; width: 260px; }
.pd-toolbar select { padding: 8px 10px; border: 1px solid #cbd3df; border-radius: 6px; font-size: 13px; background: white; }
.pd-spacer { flex: 1; }
.pd-btn { padding: 8px 14px; border-radius: 6px; font-size: 12.5px; cursor: pointer; border: 1px solid #cbd3df; background: white; color: #17365d; font-weight: 600; }
.pd-btn:hover { background: #eef2f8; }
.pd-menu-wrap { position: relative; }
.pd-menu-btn { display: flex; align-items: center; gap: 6px; }
.pd-btn.pd-menu-btn { background: #17365d; color: #fff; border-color: #17365d; padding: 9px 16px; font-size: 13.5px; }
.pd-btn.pd-menu-btn:hover, .pd-btn.pd-menu-btn.open { background: #0f2745; border-color: #0f2745; }
.pd-caret { font-size: 10px; transition: transform .15s; }
.pd-menu-btn.open .pd-caret { transform: rotate(180deg); }
.pd-menu-dropdown { position: absolute; top: calc(100% + 6px); right: 0; z-index: 40; background: white; border: 1px solid #c7d0dc; border-radius: 8px; box-shadow: 0 10px 28px rgba(20,30,50,.18); width: 200px; padding: 8px; }
.pd-menu-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px; border: none; background: none; border-radius: 6px; font-size: 12.5px; color: #1f2937; cursor: pointer; text-align: left; font-weight: 500; }
.pd-menu-item:hover { background: #eef2f8; }
.pd-menu-icon { width: 16px; text-align: center; flex-shrink: 0; }
.pd-th-inner { display: flex; align-items: flex-start; gap: 5px; justify-content: space-between; }\n.pd-th-inner > span { min-width: 0; flex: 1 1 auto; overflow-wrap: anywhere; }
.pd-colfilter-btn { border: none; background: none; cursor: pointer; color: #8592a6; font-size: 10px; padding: 2px 3px; border-radius: 3px; flex-shrink: 0; }
.pd-colfilter-btn:hover { background: #d7e0ed; color: #17365d; }
.pd-colfilter-btn.filtered { color: #17365d; }
.pd-colfilter-btn.filtered::after { content: ""; display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: #d1622f; margin-left: 3px; vertical-align: middle; }
.pd-colfilter-panel { position: fixed; z-index: 50; background: white; border: 1px solid #c7d0dc; border-radius: 6px; box-shadow: 0 8px 22px rgba(20,30,50,.2); width: 230px; font-weight: 400; }
.pd-colfilter-sort-row { display: flex; border-bottom: 1px solid #edf0f4; padding: 4px; gap: 2px; }
.pd-colfilter-sort-row button { flex: 1; padding: 6px 4px; border: none; background: none; font-size: 11px; border-radius: 4px; cursor: pointer; color: #374151; }
.pd-colfilter-sort-row button:hover { background: #eef2f8; }
.pd-colfilter-cond { padding: 8px; border-bottom: 1px solid #edf0f4; }
.pd-colfilter-cond select { width: 100%; padding: 6px 7px; border: 1px solid #cbd3df; border-radius: 4px; font-size: 11.5px; margin-bottom: 6px; }
.pd-colfilter-cond-inputs { display: flex; gap: 6px; margin-bottom: 6px; }
.pd-colfilter-cond-inputs input { flex: 1; min-width: 0; padding: 6px 7px; border: 1px solid #cbd3df; border-radius: 4px; font-size: 11.5px; }
.pd-colfilter-cond-inputs .and { font-size: 11px; color: #8592a6; align-self: center; }
.pd-colfilter-cond button { width: 100%; padding: 6px 4px; border-radius: 4px; font-size: 11.5px; cursor: pointer; border: 1px solid #17365d; background: #17365d; color: white; }
.pd-colfilter-cond button:hover { background: #0f2745; }
.pd-colfilter-divider { text-align: center; font-size: 9.5px; color: #9aa5b3; text-transform:capitalize; letter-spacing: .03em; padding: 6px 8px 2px; border-bottom: 1px solid #edf0f4; }
.pd-colfilter-search { padding: 7px 8px; border-bottom: 1px solid #edf0f4; }
.pd-colfilter-search input { width: 100%; padding: 6px 8px; border: 1px solid #cbd3df; border-radius: 4px; font-size: 11.5px; }
.pd-colfilter-options { max-height: 170px; overflow: auto; padding: 4px; }
.pd-colfilter-options label { display: flex; align-items: center; gap: 6px; padding: 5px 6px; border-radius: 4px; font-size: 12px; cursor: pointer; color: #374151; }
.pd-colfilter-options label:hover { background: #eef2f8; }
.pd-colfilter-selall { padding: 5px 6px 6px; border-bottom: 1px solid #edf0f4; font-size: 11.5px; font-weight: 600; }
.pd-colfilter-selall label { display: flex; align-items: center; gap: 7px; cursor: pointer; }
.pd-colfilter-apply-row { display: flex; gap: 6px; padding: 7px; border-top: 1px solid #edf0f4; }
.pd-colfilter-apply-row button { flex: 1; padding: 6px; border-radius: 4px; font-size: 11px; cursor: pointer; border: 1px solid #cbd3df; background: white; }
.pd-colfilter-apply-row button.apply { background: #17365d; color: white; border-color: #17365d; }
.pd-colfilter-apply-row button.clear { color: #a5432f; border-color: #e7c9c3; }
.pd-grid-wrap { margin: 14px 18px 0; background: white; border: 1px solid #d4dbe5; border-radius: 6px; overflow: auto; flex: 0 1 auto; min-height: 0; max-height: calc(100vh - 300px); box-shadow: 0 1px 2px rgba(0,0,0,.04); }
.pd-grid-wrap table { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; table-layout: fixed; }
.pd-grid-wrap th, .pd-grid-wrap td { border-right: 1px solid #e0e5ec; border-bottom: 1px solid #e0e5ec; padding: 5px 8px; white-space: normal; overflow-wrap: anywhere; word-break: normal; height: auto; min-height: 28px; vertical-align: top; font-size: 11.5px; }
.pd-grid-wrap th { position: sticky; top: 0; z-index: 4; background: #e9eef5; color: #24364d; font-size: 10.5px; font-weight: 600; text-align: left; }
.pd-column-resize-handle { position: absolute; top: 0; right: -2px; z-index: 12; width: 5px; height: 100%; cursor: col-resize; touch-action: none; }
.pd-column-resize-handle:hover { background: rgba(23,54,93,.3); }
.pd-grid-wrap th { overflow: visible; }
.pd-th-inner { min-width: 0; }
.pd-chk { width: 14px; height: 14px; margin: 0 6px 0 0; accent-color: #27548A; cursor: pointer; flex: none; vertical-align: middle; }
.pd-chk-cell { display: inline-flex; align-items: flex-start; gap: 0; }
.pd-grid-wrap tr.pd-row-sel td { background: #e8f0fb !important; }
.pd-th-inner > span { min-width: 0; overflow-wrap: anywhere; }
.pd-grid-wrap th.frozen, .pd-grid-wrap td.frozen { position: sticky; left: 0; z-index: 3; background: #fff; }
.pd-grid-wrap th.frozen { z-index: 8; background: #dfe8f3; }
.pd-master-cell { color: #374151; text-align: right; }
.pd-name-cell { color: #1559a6; font-weight: 600; text-align: left; }
.pd-calc-cell { background: #eaf5ff; color: #14527d; font-weight: 600; text-align: right; }
.pd-yoy-col { font-weight: 600; }
.pd-yoy-col.pos { color: #13804a; }
.pd-yoy-col.neg { color: #a5432f; }
.pd-yoy-col.new { color: #9a6b0c; font-style: italic; font-weight: 400; }
.pd-grid-wrap tbody tr:nth-child(odd) td:not(.pd-calc-cell) { background: #fbfcfe; }
.pd-grid-wrap tbody tr:nth-child(even) td:not(.pd-calc-cell) { background: #f2f5f9; }
.pd-grid-wrap tbody tr:nth-child(odd) td.pd-calc-cell { background: #eaf5ff; }
.pd-grid-wrap tbody tr:nth-child(even) td.pd-calc-cell { background: #dff0fc; }
.pd-grid-wrap tbody tr:hover td { background: #eaf2ff !important; }
.pd-status-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; }
.pd-status-badge.yes { background: #e2f6e8; color: #1e7a41; }
.pd-status-badge.no { background: #eef0f3; color: #6b7785; }
.pd-footer-note { flex: 0 0 auto; padding: 8px 18px 16px; font-size: 11px; color: #8592a6; }
.pd-pager { flex: 0 0 auto; display: flex; align-items: center; gap: 8px; justify-content: flex-end; padding: 8px 18px 0; color: #5b6b82; font-size: 12px; font-weight: 600; }
.pd-pager .pd-btn { padding: 4px 10px; font-size: 12px; }
.pd-pager .pd-btn:disabled { opacity: .5; cursor: default; }
.pd-modal-overlay { position: fixed; inset: 0; background: rgba(15,25,40,.45); z-index: 100; display: flex; align-items: center; justify-content: center; }
.pd-modal { background: white; border-radius: 8px; width: 720px; max-width: 92vw; max-height: 82vh; display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0,0,0,.3); }
.pd-modal-head { padding: 14px 18px; border-bottom: 1px solid #edf0f4; display: flex; align-items: center; justify-content: space-between; }
.pd-modal-head h2 { font-size: 14.5px; margin: 0; color: #17365d; }
.pd-x { cursor: pointer; color: #8592a6; font-size: 18px; }
.pd-modal-body { padding: 14px 18px; overflow: auto; font-size: 12.5px; }
.pd-modal-body table { width: 100%; border-collapse: collapse; }
.pd-modal-body th { text-align: left; font-weight: 600; color: #5b6b82; font-size: 11px; padding: 7px 8px; border-bottom: 1px solid #edf0f4; }
.pd-modal-body td { font-size: 12px; padding: 7px 8px; border-bottom: 1px solid #edf0f4; vertical-align: top; }
.pd-modal-foot { padding: 12px 18px; border-top: 1px solid #edf0f4; display: flex; justify-content: flex-end; gap: 8px; }
.pd-audit-note { font-size: 11.5px; color: #6b7785; margin-bottom: 10px; line-height: 1.5; }
.pd-old-val { color: #a5432f; text-decoration: line-through; }
.pd-new-val { color: #1e7a41; font-weight: 600; }
`;
