import { useMemo, useRef, useState } from "react";
import { ChevronDown, Download, Search, Upload } from "lucide-react";

import { ColumnFilter } from "./ColumnFilter";
import { fmtDoj } from "@/lib/employee-master-utils";

const COLUMNS = [
  {
    key: "name",
    label: "Employee",
    type: "text",
    get: (employee) => `${employee.name} ${employee.empId}`,
  },
  {
    key: "appraisalYear",
    label: "Appraisal Year",
    type: "text",
    get: () => "Apr-26",
  },
  {
    key: "organization",
    label: "Organization",
    type: "select",
    get: (employee) => employee.organization || "",
  },
  {
    key: "designation",
    label: "Designation",
    type: "select",
    get: (employee) => employee.designation || "",
  },
  {
    key: "doj",
    label: "Date of Joining",
    type: "text",
    get: (employee) => fmtDoj(employee.doj),
  },
  {
    key: "eligible",
    label: "Eligible",
    type: "select",
    get: (employee) =>
      employee.eligible === "Yes" ? "Eligible" : "Not Eligible",
  },
  {
    key: "eligibleReason",
    label: "Reason",
    type: "text",
    get: (employee) => employee.eligibleReason || "",
  },
];

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
}) {
  const fileInputRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.status === "Active"),
    [employees],
  );

  const rows = useMemo(() => {
    return activeEmployees.filter((employee) => {
      const searchTerm = search.trim().toLowerCase();

      if (
        searchTerm &&
        !employee.name.toLowerCase().includes(searchTerm) &&
        !employee.empId.toLowerCase().includes(searchTerm)
      ) {
        return false;
      }

      return COLUMNS.every((column) => {
        const filter = filters[column.key];

        if (!filter) {
          return true;
        }

        const value = String(column.get?.(employee) ?? "").toLowerCase();

        if (filter.type === "text") {
          return value.includes(filter.term.toLowerCase());
        }

        return filter.values.has(column.get?.(employee) ?? "");
      });
    });
  }, [activeEmployees, filters, search]);

  const eligibleCount = activeEmployees.filter(
    (employee) => employee.eligible === "Yes",
  ).length;

  const notEligibleCount = activeEmployees.length - eligibleCount;

  return (
    <div className="em-eligibility-list">
      <div className="em-eligibility-header">
        <div className="em-eligibility-stats">
          <div>
            <strong>{activeEmployees.length}</strong>
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
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search employee..."
            />
          </div>

          <div className="em-menu-wrapper">
            <button
              type="button"
              className="em-btn em-btn-ghost"
              onClick={() => setMenuOpen((current) => !current)}
            >
              Actions
              <ChevronDown size={14} />
            </button>

            {menuOpen && (
              <div className="em-menu-dropdown">
                <button
                  type="button"
                  onClick={() => {
                    onDownloadTemplate();
                    setMenuOpen(false);
                  }}
                >
                  <Download size={14} />
                  Download Template
                </button>

                <button
                  type="button"
                  onClick={() => {
                    fileInputRef.current?.click();
                    setMenuOpen(false);
                  }}
                >
                  <Upload size={14} />
                  Import Eligibility
                </button>

                <button
                  type="button"
                  onClick={() => {
                    onExport(rows);
                    setMenuOpen(false);
                  }}
                >
                  <Download size={14} />
                  Export Visible
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

                if (file) {
                  onImport(file);
                }

                event.target.value = "";
              }}
            />
          </div>
        </div>
      </div>

      <div className="em-grid-wrap">
        <table className="em-table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th key={column.key}>
                  <div className="em-th-inner">
                    <span>{column.label}</span>

                    <ColumnFilter
                      column={column}
                      rows={activeEmployees}
                      value={filters[column.key]}
                      onChange={(value) =>
                        setFilters((current) => {
                          const next = {
                            ...current,
                          };

                          if (!value) {
                            delete next[column.key];
                          } else {
                            next[column.key] = value;
                          }

                          return next;
                        })
                      }
                    />
                  </div>
                </th>
              ))}

              <th>Action</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((employee) => (
              <tr key={employee.empId}>
                <td>
                  <div className="em-name-cell">
                    <strong>{employee.name}</strong>
                    <span>{employee.empId}</span>
                  </div>
                </td>

                <td>Apr-26</td>

                <td>{employee.organization}</td>

                <td>{employee.designation}</td>

                <td>{fmtDoj(employee.doj)}</td>

                <td>
                  <span
                    className={`em-elig-badge ${
                      employee.eligible === "Yes" ? "yes" : "no"
                    }`}
                  >
                    {employee.eligible === "Yes" ? "Eligible" : "Not Eligible"}
                  </span>
                </td>

                <td>
                  <div className="em-reason">
                    {employee.eligibleReason || "—"}

                    {employee.manualOverride && <small>Manual</small>}
                  </div>
                </td>

                <td>
                  <button
                    type="button"
                    className="em-change-btn"
                    onClick={() => onChangeEligibility(employee)}
                  >
                    Change
                  </button>
                </td>
              </tr>
            ))}

            {!rows.length && (
              <tr>
                <td colSpan={8} className="em-empty">
                  No eligibility records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
