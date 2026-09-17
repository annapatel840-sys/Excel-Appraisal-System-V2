import { useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { ColumnFilter } from "./ColumnFilter";
import { calcOrgExperience, fmtDoj } from "@/lib/employee-master-utils";

const COLUMNS = [
  {
    key: "name",
    label: "Employee",
    type: "text",
    get: (employee) => `${employee.name} ${employee.empId}`,
  },
  {
    key: "status",
    label: "Status",
    type: "select",
    get: (employee) => employee.status || "",
  },
  {
    key: "designation",
    label: "Designation",
    type: "select",
    get: (employee) => employee.designation || "",
  },
  {
    key: "organization",
    label: "Organization",
    type: "select",
    get: (employee) => employee.organization || "",
  },
  {
    key: "doj",
    label: "Date of Joining",
    type: "text",
    get: (employee) => fmtDoj(employee.doj),
  },
  {
    key: "orgExp",
    label: "Org. Exp (as on 1 Jan)",
    type: "text",
    get: (employee) => calcOrgExperience(employee.doj),
  },
  {
    key: "totalExp",
    label: "Total Exp (as on 1 Jan)",
    type: "text",
    get: (employee) => employee.totalExp || "",
  },
  {
    key: "reportingManager",
    label: "Reporting Manager",
    type: "select",
    get: (employee) => employee.reportingManager || "",
  },
  {
    key: "compManager",
    label: "Comp. Manager",
    type: "select",
    get: (employee) => employee.compManager || "",
  },
  {
    key: "superManager",
    label: "Super Manager",
    type: "select",
    get: (employee) => employee.superManager || "",
  },
  {
    key: "appraiser",
    label: "Appraiser / Super Manager",
    type: "select",
    get: (employee) => employee.appraiser || "",
  },
  {
    key: "managerMail",
    label: "Manager Email ID",
    type: "text",
    get: (employee) => employee.managerMail || "",
  },
  {
    key: "superManagerMail",
    label: "Super Manager Email ID",
    type: "text",
    get: (employee) => employee.superManagerMail || "",
  },
];

const PAGE_SIZE = 20;

export function EmployeeRosterTable({
  rows,
  filters,
  setFilters,
  currentPage = 1,
  setCurrentPage,
  totalPages = 1,
  totalCount = 0,
  loading = false,
  onToggleStatus,
  onBulkStatusChange,
  statusUpdatingIds = new Set(),
  bulkStatusUpdating = false,
}) {
  const filteredRows = useMemo(() => {
    return rows.filter((employee) =>
      COLUMNS.every((column) => {
        const filter = filters[column.key];

        if (!filter) {
          return true;
        }

        const rawValue = column.get?.(employee) ?? "";
        const value = String(rawValue).toLowerCase();

        if (filter.type === "text") {
          return value.includes(String(filter.term || "").toLowerCase());
        }

        return filter.values.has(rawValue);
      }),
    );
  }, [rows, filters]);

  const safePage = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));

  useEffect(() => {
    if (currentPage !== safePage && setCurrentPage) {
      setCurrentPage(safePage);
    }
  }, [currentPage, safePage, setCurrentPage]);

  const startRecord = totalCount === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;

  const endRecord =
    totalCount === 0 ? 0 : Math.min(safePage * PAGE_SIZE, totalCount);

  const goToPage = (page) => {
    if (!setCurrentPage) {
      return;
    }

    const nextPage = Math.min(Math.max(1, page), Math.max(1, totalPages));

    if (nextPage !== safePage) {
      setCurrentPage(nextPage);
    }
  };

  const handleBulkStatus = async (status) => {
    if (!onBulkStatusChange || !filteredRows.length) {
      return;
    }

    await onBulkStatusChange(status, filteredRows);
  };

  return (
    <div className="em-roster-container">
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
                      rows={rows}
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

              {/* ACTION HEADER */}
              <th
                className="em-action-header"
                style={{
                  minWidth: "155px",
                  width: "155px",
                  padding: "8px 10px",
                  borderLeft: "1px solid rgba(0,0,0,0.08)",
                  borderRight: "1px solid rgba(0,0,0,0.08)",
                  whiteSpace: "nowrap",
                  verticalAlign: "middle",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "7px",
                    width: "100%",
                  }}
                >
                  <span
                    style={{
                      fontWeight: 600,
                      fontSize: "13px",
                      lineHeight: "16px",
                    }}
                  >
                    Action
                  </span>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "5px",
                      width: "100%",
                    }}
                  >
                    <button
                      type="button"
                      disabled={
                        loading ||
                        bulkStatusUpdating ||
                        filteredRows.length === 0
                      }
                      onClick={() => handleBulkStatus("Active")}
                      title="Set Active for employees on the current page"
                      style={{
                        border: "1px solid #cbd5e1",
                        borderRadius: "5px",
                        background: "#ffffff",
                        color: "#166534",
                        padding: "4px 7px",
                        fontSize: "11px",
                        fontWeight: 600,
                        lineHeight: "14px",
                        cursor:
                          loading ||
                          bulkStatusUpdating ||
                          filteredRows.length === 0
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          loading ||
                          bulkStatusUpdating ||
                          filteredRows.length === 0
                            ? 0.5
                            : 1,
                      }}
                    >
                      Active
                    </button>

                    <button
                      type="button"
                      disabled={
                        loading ||
                        bulkStatusUpdating ||
                        filteredRows.length === 0
                      }
                      onClick={() => handleBulkStatus("Inactive")}
                      title="Set Inactive for employees on the current page"
                      style={{
                        border: "1px solid #cbd5e1",
                        borderRadius: "5px",
                        background: "#ffffff",
                        color: "#991b1b",
                        padding: "4px 7px",
                        fontSize: "11px",
                        fontWeight: 600,
                        lineHeight: "14px",
                        cursor:
                          loading ||
                          bulkStatusUpdating ||
                          filteredRows.length === 0
                            ? "not-allowed"
                            : "pointer",
                        opacity:
                          loading ||
                          bulkStatusUpdating ||
                          filteredRows.length === 0
                            ? 0.5
                            : 1,
                      }}
                    >
                      Inactive
                    </button>
                  </div>
                </div>
              </th>
            </tr>
          </thead>

          <tbody>
            {loading ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="em-empty">
                  Loading employees...
                </td>
              </tr>
            ) : (
              filteredRows.map((employee) => {
                const employeeId = String(employee.empId || "").trim();
                const isUpdating =
                  statusUpdatingIds instanceof Set &&
                  statusUpdatingIds.has(employeeId);

                const isActive =
                  String(employee.status || "")
                    .trim()
                    .toLowerCase() === "active";

                return (
                  <tr
                    key={employee.empId}
                    className={isActive ? "" : "inactive-row"}
                  >
                    <td>
                      <div className="em-name-cell">
                        <strong>{employee.name}</strong>
                        <span>{employee.empId}</span>
                      </div>
                    </td>

                    <td>
                      <span
                        className={`em-status ${
                          isActive ? "active" : "inactive"
                        }`}
                      >
                        {employee.status}
                      </span>
                    </td>

                    <td>{employee.designation}</td>
                    <td>{employee.organization}</td>
                    <td>{fmtDoj(employee.doj)}</td>

                    <td className="em-calc-cell">
                      {calcOrgExperience(employee.doj)}
                    </td>

                    <td>{employee.totalExp}</td>
                    <td>{employee.reportingManager}</td>
                    <td>{employee.compManager}</td>
                    <td>{employee.superManager}</td>
                    <td>{employee.appraiser}</td>
                    <td>{employee.managerMail}</td>
                    <td>{employee.superManagerMail}</td>

                    {/* ACTION CELL */}
                    <td
                      className="em-action-cell"
                      style={{
                        background: "inherit",
                        padding: "8px 10px",
                        textAlign: "center",
                        verticalAlign: "middle",
                        borderLeft: "1px solid rgba(0,0,0,0.08)",
                        borderRight: "1px solid rgba(0,0,0,0.08)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      <button
                        type="button"
                        disabled={
                          loading ||
                          bulkStatusUpdating ||
                          isUpdating ||
                          !onToggleStatus
                        }
                        onClick={() =>
                          onToggleStatus && onToggleStatus(employee)
                        }
                        style={{
                          minWidth: "105px",
                          height: "30px",
                          padding: "5px 9px",
                          borderRadius: "5px",
                          border: "1px solid #cbd5e1",
                          background: "#ffffff",
                          color: isActive ? "#991b1b" : "#166534",
                          fontSize: "11px",
                          fontWeight: 600,
                          lineHeight: "16px",
                          cursor:
                            loading ||
                            bulkStatusUpdating ||
                            isUpdating ||
                            !onToggleStatus
                              ? "not-allowed"
                              : "pointer",
                          opacity:
                            loading || bulkStatusUpdating || isUpdating
                              ? 0.55
                              : 1,
                          boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                        }}
                      >
                        {isUpdating
                          ? "Saving..."
                          : isActive
                            ? "Set Inactive"
                            : "Set Active"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}

            {!loading && !filteredRows.length && (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="em-empty">
                  No employees found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="em-pagination">
        <div className="em-pagination-info">
          Showing{" "}
          <strong>
            {startRecord}-{endRecord}
          </strong>{" "}
          of <strong>{totalCount}</strong> employees
        </div>

        <div className="em-pagination-controls">
          <button
            type="button"
            disabled={safePage <= 1 || loading}
            onClick={() => goToPage(safePage - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>

          {Array.from(
            { length: Math.max(1, totalPages) },
            (_, index) => index + 1,
          ).map((page) => (
            <button
              key={page}
              type="button"
              className={page === safePage ? "active" : ""}
              disabled={loading}
              onClick={() => goToPage(page)}
            >
              {page}
            </button>
          ))}

          <button
            type="button"
            disabled={safePage >= totalPages || loading}
            onClick={() => goToPage(safePage + 1)}
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
