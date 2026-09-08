import { useEffect, useMemo, useState } from "react";
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

const PAGE_SIZE = 10;

export function EmployeeRosterTable({ rows, filters, setFilters }) {
  const [currentPage, setCurrentPage] = useState(1);

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

  useEffect(() => {
    setCurrentPage(1);
  }, [rows, filters]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));

  const safePage = Math.min(currentPage, totalPages);

  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;

    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, safePage]);

  const startRecord =
    filteredRows.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;

  const endRecord = Math.min(safePage * PAGE_SIZE, filteredRows.length);

  return (
    <div className="em-roster-container">
      {/* =====================================================
          TABLE
      ===================================================== */}
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
            </tr>
          </thead>

          <tbody>
            {paginatedRows.map((employee) => (
              <tr
                key={employee.empId}
                className={employee.status === "Inactive" ? "inactive-row" : ""}
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
                      employee.status === "Active" ? "active" : "inactive"
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
              </tr>
            ))}

            {!paginatedRows.length && (
              <tr>
                <td colSpan={COLUMNS.length} className="em-empty">
                  No employees found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* =====================================================
          PAGINATION
      ===================================================== */}
      <div className="em-pagination">
        <div className="em-pagination-info">
          Showing{" "}
          <strong>
            {startRecord}-{endRecord}
          </strong>{" "}
          of <strong>{filteredRows.length}</strong> employees
        </div>

        <div className="em-pagination-controls">
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>

          {Array.from(
            {
              length: totalPages,
            },
            (_, index) => index + 1,
          ).map((page) => (
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
            onClick={() =>
              setCurrentPage((page) => Math.min(totalPages, page + 1))
            }
            aria-label="Next page"
          >
            <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
