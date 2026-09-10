import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { ColumnFilter } from "./ColumnFilter";
import { calcOrgExperience, fmtDoj } from "@/lib/employee-master-utils";

const COLUMNS = [
  {
    key: "name",
    label: "Employee",
    type: "text",
    get: (employee) => `${employee.name || ""} ${employee.empId || ""}`,
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
  rows = [],
  filters = {},
  setFilters,
  currentPage = 1,
  setCurrentPage,
  totalPages = 1,
  totalCount = 0,
}) {
  /*
   * IMPORTANT
   * ----------
   * The backend already sends only the current page.
   *
   * Example:
   * page 1 -> rows 1-20
   * page 2 -> rows 21-40
   *
   * Therefore we NEVER slice rows here.
   */

  const filteredRows = useMemo(() => {
    return rows.filter((employee) => {
      return COLUMNS.every((column) => {
        const filter = filters[column.key];

        if (!filter) {
          return true;
        }

        const rawValue = column.get?.(employee) ?? "";

        const value = String(rawValue).toLowerCase();

        /*
         * Text filter
         */
        if (filter.type === "text") {
          const term = String(filter.term || "").toLowerCase();

          return value.includes(term);
        }

        /*
         * Select filter
         */
        if (filter.type === "select" && filter.values instanceof Set) {
          return filter.values.has(rawValue);
        }

        return true;
      });
    });
  }, [rows, filters]);

  /*
   * Do not paginate filteredRows.
   *
   * Backend pagination is already done.
   */
  const displayedRows = filteredRows;

  /*
   * Keep current page inside valid range.
   */
  const safePage = Math.max(
    1,
    Math.min(Number(currentPage) || 1, Math.max(1, Number(totalPages) || 1)),
  );

  const safeTotalPages = Math.max(1, Number(totalPages) || 1);

  const safeTotalCount = Math.max(0, Number(totalCount) || 0);

  /*
   * Pagination information.
   *
   * Example:
   * Page 1 -> Showing 1-20 of 250
   * Page 2 -> Showing 21-40 of 250
   * Page 13 -> Showing 241-250 of 250
   */
  const startRecord = safeTotalCount === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;

  const endRecord =
    safeTotalCount === 0 ? 0 : Math.min(safePage * PAGE_SIZE, safeTotalCount);

  /*
   * Change page.
   *
   * EmployeeMaster owns currentPage.
   * Changing it causes EmployeeMaster to call:
   *
   * GET /employee-api-v2/?page=X&limit=20
   */
  const goToPage = (page) => {
    if (!setCurrentPage) {
      return;
    }

    const requestedPage = Number(page) || 1;

    const nextPage = Math.max(1, Math.min(requestedPage, safeTotalPages));

    if (nextPage === safePage) {
      return;
    }

    setCurrentPage(nextPage);
  };

  /*
   * Pagination buttons.
   *
   * Example for 150 pages:
   *
   * 1 ... 4 5 6 7 8 ... 150
   */
  const paginationPages = useMemo(() => {
    if (safeTotalPages <= 7) {
      return Array.from(
        {
          length: safeTotalPages,
        },
        (_, index) => index + 1,
      );
    }

    const pages = [];

    pages.push(1);

    if (safePage > 4) {
      pages.push("left-ellipsis");
    }

    const start = Math.max(2, safePage - 2);

    const end = Math.min(safeTotalPages - 1, safePage + 2);

    for (let page = start; page <= end; page += 1) {
      pages.push(page);
    }

    if (safePage < safeTotalPages - 3) {
      pages.push("right-ellipsis");
    }

    pages.push(safeTotalPages);

    return pages;
  }, [safePage, safeTotalPages]);

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
                      onChange={(value) => {
                        if (!setFilters) {
                          return;
                        }

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
                        });
                      }}
                    />
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {displayedRows.map((employee) => (
              <tr
                key={employee.empId || employee.id || employee.ROWID}
                className={
                  String(employee.status || "").toLowerCase() === "inactive"
                    ? "inactive-row"
                    : ""
                }
              >
                <td>
                  <div className="em-name-cell">
                    <strong>{employee.name || ""}</strong>

                    <span>{employee.empId || ""}</span>
                  </div>
                </td>

                <td>
                  <span
                    className={`em-status ${
                      String(employee.status || "").toLowerCase() === "active"
                        ? "active"
                        : "inactive"
                    }`}
                  >
                    {employee.status || ""}
                  </span>
                </td>

                <td>{employee.designation || ""}</td>

                <td>{employee.organization || ""}</td>

                <td>{fmtDoj(employee.doj)}</td>

                <td className="em-calc-cell">
                  {calcOrgExperience(employee.doj)}
                </td>

                <td>{employee.totalExp || ""}</td>

                <td>{employee.reportingManager || ""}</td>

                <td>{employee.compManager || ""}</td>

                <td>{employee.superManager || ""}</td>

                <td>{employee.appraiser || ""}</td>

                <td>{employee.managerMail || ""}</td>

                <td>{employee.superManagerMail || ""}</td>
              </tr>
            ))}

            {!displayedRows.length && (
              <tr>
                <td colSpan={COLUMNS.length} className="em-empty">
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
          of <strong>{safeTotalCount}</strong> employees
        </div>

        <div className="em-pagination-controls">
          {/* Previous */}
          <button
            type="button"
            disabled={safePage <= 1}
            onClick={() => goToPage(safePage - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft size={14} />
          </button>

          {/* Page numbers */}
          {paginationPages.map((page, index) => {
            if (page === "left-ellipsis" || page === "right-ellipsis") {
              return (
                <span
                  key={`${page}-${index}`}
                  className="em-pagination-ellipsis"
                >
                  ...
                </span>
              );
            }

            return (
              <button
                key={page}
                type="button"
                className={page === safePage ? "active" : ""}
                onClick={() => goToPage(page)}
              >
                {page}
              </button>
            );
          })}

          {/* Next */}
          <button
            type="button"
            disabled={safePage >= safeTotalPages}
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
