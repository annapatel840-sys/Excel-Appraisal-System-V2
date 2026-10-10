import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Download, History, Menu, Plus, Search, Upload } from "lucide-react";

import { ClientPager, DataGrid, useGridState, useGridView } from "./DataGrid";
import { PanelTab, SidePanel } from "./SidePanel";
import { AddEmployeeModal } from "./AddEmployeeModal";
import { usePanel } from "./panelStore";
import { fmtDoj } from "@/lib/employee-master-utils";
import { LocationMasterControl } from "./LocationMasterControl";
import "./employee-master-ui.css";

const PAGE_SIZE = 20;

/* optional data fields: changeTag = "New" | "Changed" | "Removed", inExceptionalCycle = true/false */
const tagOf = (e) =>
  e.changeTag || e.eligibilityTag || (e.manualOverride ? "Changed" : "");

const updatedOf = (e) =>
  e.eligibilityUpdatedAt ||
  e.rawEmployee?.eligible_updated_at ||
  e.rawEmployee?.updated_at ||
  e.rawEmployee?.modifiedtime ||
  e.rawEmployee?.MODIFIEDTIME ||
  "—";

const DEFS = [
  {
    key: "employee",
    label: "Employee",
    w: 260,
    get: (e) => `${e.empId} - ${e.name} · ${e.designation || ""}`,
    render: (e) => (
      <>
        <div className="emx-e1">
          {e.empId} - {e.name}
        </div>
        <div className="emx-e2">{e.designation || "—"}</div>
      </>
    ),
  },
  {
    key: "location",
    label: "Location",
    w: 120,
    get: (e) => e.location || e.rawEmployee?.location || e.rawEmployee?.work_location || "—",
  },
  {
    key: "dept",
    label: "Department",
    w: 140,
    get: (e) => e.organization || "—",
  },
  {
    key: "doj",
    label: "Date of Joining",
    w: 115,
    get: (e) => fmtDoj(e.doj) || "—",
    sv: (e) => String(e.doj ?? ""),
  },
  {
    key: "te",
    label: "Tech-ED/BU Head Name",
    w: 160,
    get: (e) => e.appraiser || e.superManager || "—",
  },
  {
    key: "eligible",
    label: "Eligible",
    w: 110,
    get: (e) => (e.eligible === "Yes" ? "Eligible" : "Not Eligible"),
    render: (e) => (
      <span className={`emx-tag ${e.eligible === "Yes" ? "ok" : "warn"}`}>
        {e.eligible === "Yes" ? "Eligible" : "Not Eligible"}
      </span>
    ),
  },
  {
    key: "reason",
    label: "Reason",
    w: 200,
    get: (e) => e.eligibleReason || "—",
  },
  {
    key: "by",
    label: "Set by",
    w: 90,
    get: (e) => (e.manualOverride ? "Manual" : "Criteria"),
  },
  {
    key: "tag",
    label: "Change tag",
    w: 200,
    get: (e) =>
      [tagOf(e), e.inExceptionalCycle ? "In open Exceptional cycle" : ""]
        .filter(Boolean)
        .join(" · ") || "—",
    render: (e) => {
      const tag = tagOf(e);
      if (!tag && !e.inExceptionalCycle) return "—";
      return (
        <>
          {tag && (
            <span
              className={`emx-tag ${tag === "New" ? "info" : tag === "Changed" ? "chg" : "grey"}`}
            >
              {tag}
            </span>
          )}{" "}
          {e.inExceptionalCycle && (
            <span className="emx-tag warn">In open Exceptional cycle</span>
          )}
        </>
      );
    },
  },
  { key: "upd", label: "Last updated", w: 180, get: (e) => updatedOf(e) },
];

function countBy(list, fn) {
  const map = {};
  list.forEach((item) => {
    const k = fn(item);
    map[k] = (map[k] || 0) + 1;
  });
  return Object.keys(map)
    .sort((a, b) => map[b] - map[a])
    .map((k) => [k, map[k]]);
}

export function EligibilityList({
  employees,
  search,
  setSearch,
  locationFilter = "All",
  setLocationFilter,
  onChangeEligibility, // (employeeOrArray) => open your EligibilityModal; arrays carry .preset = "Yes" | "No"
  onDownloadTemplate,
  onImport,
  onExport,
  onAuditHistory,
  onAddEmployee, // ({ empId, eligible: "Yes", eligibleReason }) => Promise   -> shows "+ Add employee"
  masterEmployees = [], // full Employee Master list, used by "+ Add employee" and the Statistics tab
  auditEntries, // optional: [{ title, meta, detail }]
}) {
  const fileInputRef = useRef(null);
  const menuRef = useRef(null);

  const grid = useGridState(DEFS);
  const [panel, updatePanel] = usePanel("el");
  const [menuOpen, setMenuOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [addOpen, setAddOpen] = useState(false);

  const canEdit = Boolean(onChangeEligibility);

  useEffect(() => {
    const outside = (event) => {
      if (!menuRef.current?.contains(event.target)) setMenuOpen(false);
    };
    const esc = (event) => event.key === "Escape" && setMenuOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, []);

  const searchPre = useCallback(
    (e) => {
      const term = (search || "").trim().toLowerCase();
      if (!term) return true;
      return (
        String(e.name ?? "")
          .toLowerCase()
          .includes(term) ||
        String(e.empId ?? "")
          .toLowerCase()
          .includes(term)
      );
    },
    [search],
  );

  const locationFilteredEmployees = useMemo(() => {
    if (!locationFilter || locationFilter === "All") return employees;
    return employees.filter((employee) => {
      const employeeLocation = String(employee.location || employee.rawEmployee?.location || employee.rawEmployee?.work_location || "").trim();
      return employeeLocation.toLowerCase() === locationFilter.toLowerCase();
    });
  }, [employees, locationFilter]);

  const view = useGridView(locationFilteredEmployees, DEFS, grid, searchPre);

  /* counts (Removed rows are not counted) */
  const counted = useMemo(
    () => locationFilteredEmployees.filter((e) => tagOf(e) !== "Removed"),
    [locationFilteredEmployees],
  );
  const eligibleCount = counted.filter((e) => e.eligible === "Yes").length;
  const notEligibleCount = counted.length - eligibleCount;

  /* paging */
  const pages = Math.max(1, Math.ceil(view.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  useEffect(() => setPage(1), [grid.filters, grid.sort, search, locationFilter]);

  const pageRows = useMemo(
    () => view.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [view, safePage],
  );
  const from = view.length ? (safePage - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(view.length, safePage * PAGE_SIZE);

  /* selection */
  const selectable = useMemo(
    () => view.filter((e) => tagOf(e) !== "Removed"),
    [view],
  );
  const selectedRows = useMemo(
    () =>
      locationFilteredEmployees.filter(
        (e) => selectedIds.has(e.empId) && tagOf(e) !== "Removed",
      ),
    [locationFilteredEmployees, selectedIds],
  );
  const viewSelected = selectable.filter((e) =>
    selectedIds.has(e.empId),
  ).length;
  const allSelected =
    selectable.length > 0 && viewSelected === selectable.length;

  const toggleRow = (id) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelectedIds((current) => {
      const next = new Set(current);
      selectable.forEach((e) =>
        allSelected ? next.delete(e.empId) : next.add(e.empId),
      );
      return next;
    });

  const bulk = (preset) => {
    if (!selectedRows.length) return;
    onChangeEligibility(Object.assign([...selectedRows], { preset }));
    setSelectedIds(new Set());
  };

  /* statistics tab */
  const stats = useMemo(() => {
    const notEl = counted.filter((e) => e.eligible !== "Yes");
    const el = counted.filter((e) => e.eligible === "Yes");
    const listed = new Set(employees.map((e) => e.empId));
    const notInList = masterEmployees.filter(
      (e) => e.status === "Active" && !listed.has(e.empId),
    ).length;

    return {
      summary: [
        ["In the list", counted.length],
        ["Eligible", el.length],
        ["Not Eligible", notEl.length],
        ...(masterEmployees.length
          ? [["Active in Employee Master, not in list", notInList]]
          : []),
        ["Set by hand", counted.filter((e) => e.manualOverride).length],
        [
          "In open Exceptional cycle",
          counted.filter((e) => e.inExceptionalCycle).length,
        ],
      ],
      sections: [
        {
          title: "Not Eligible, by reason",
          rows: countBy(
            notEl,
            (e) => e.eligibleReason || "Excluded by criteria",
          ),
        },
        {
          title: "Eligible, by reason",
          rows: countBy(
            el,
            (e) => e.eligibleReason || "Criteria (no exception)",
          ),
        },
      ],
    };
  }, [counted, employees, masterEmployees]);

  const listedIds = useMemo(
    () => new Set(employees.map((e) => e.empId)),
    [employees],
  );

  return (
    <div className="em-eligibility-list">
      {/* ================= HEADER ================= */}
      <div className="em-eligibility-header">
        <div className="em-eligibility-stats">
          <div>
            <strong>{counted.length}</strong>
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
              onChange={(event) => {
                setSearch(event.target.value);
                setMenuOpen(false);
              }}
              placeholder="Search name / ID"
            />
          </div>

          <LocationMasterControl
            value={locationFilter}
            onChange={setLocationFilter}
            ariaLabel="Filter Eligibility List by Location Master"
          />

          {onAddEmployee && canEdit && (
            <button
              type="button"
              className="em-btn emx-dashed"
              onClick={() => setAddOpen(true)}
            >
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
                    onDownloadTemplate?.();
                  }}
                >
                  <Download size={14} /> Download Template
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
                    <Upload size={14} /> Import Eligibility
                  </button>
                )}

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onExport?.(view);
                  }}
                >
                  <Download size={14} /> Export to Excel
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    updatePanel({ open: true, tab: "aud" });
                  }}
                >
                  <History size={14} /> Audit Trail
                </button>
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

      {/* ================= TABLE + PANEL ================= */}
      <div className="emx-work">
        <div className="emx-main">
          {canEdit && selectedRows.length > 0 && (
            <div className="emx-selbar">
              <b>{selectedRows.length} selected</b>
              <button
                type="button"
                className="emx-mini"
                onClick={() => bulk("Yes")}
              >
                Set Eligible…
              </button>
              <button
                type="button"
                className="emx-mini"
                onClick={() => bulk("No")}
              >
                Set Not Eligible…
              </button>
              <button
                type="button"
                className="emx-mini"
                onClick={() => setSelectedIds(new Set())}
              >
                Clear selection
              </button>
            </div>
          )}

          <DataGrid
            defs={DEFS}
            grid={grid}
            allRows={employees}
            rows={pageRows}
            rowKey={(e) => e.empId}
            selectable={canEdit}
            selected={selectedIds}
            onToggleRow={toggleRow}
            onToggleAll={toggleAll}
            allSelected={allSelected}
            someSelected={viewSelected > 0}
            canSelectRow={(e) => tagOf(e) !== "Removed"}
            rowClass={(e) => (tagOf(e) === "Removed" ? "emx-dim" : "")}
            actionHeader={canEdit ? "Action" : null}
            renderAction={(e) =>
              tagOf(e) === "Removed" ? (
                "—"
              ) : (
                <button
                  type="button"
                  className="emx-mini"
                  onClick={() => onChangeEligibility(e)}
                >
                  {e.eligible === "Yes" ? "Set Not Eligible" : "Set Eligible"}
                </button>
              )
            }
            emptyText="No eligibility records found."
          />

          <ClientPager
            page={safePage}
            pages={pages}
            from={from}
            to={to}
            total={view.length}
            allTotal={employees.length}
            onPage={setPage}
            grid={grid}
          />

        </div>

        <SidePanel
          open={panel.open}
          title="Eligibility List"
          tab={panel.tab}
          onTab={(tab) => updatePanel({ tab })}
          onClose={() => updatePanel({ open: false })}
          defs={DEFS}
          grid={grid}
          stats={stats}
          audit={auditEntries}
          auditHint="Every manual change: user, date and time, employee, previous and new value."
          onFullAudit={onAuditHistory}
        />
        <PanelTab open={panel.open} onOpen={() => updatePanel({ open: true })} />
      </div>

      {addOpen && (
        <AddEmployeeModal
          masterEmployees={masterEmployees}
          listedIds={listedIds}
          onAdd={onAddEmployee}
          onClose={() => setAddOpen(false)}
        />
      )}
    </div>
  );
}