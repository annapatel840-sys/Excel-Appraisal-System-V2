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

export function EmployeeRosterTable({ rows, filters, setFilters }) {
  const applyFilters = (items) =>
    items.filter((employee) =>
      COLUMNS.every((column) => {
        const filter = filters[column.key];

        if (!filter) {
          return true;
        }

        const value = String(column.get?.(employee) ?? "").toLowerCase();

        if (filter.type === "text") {
          return value.includes(filter.term.toLowerCase());
        }

        return filter.values.has(column.get?.(employee) ?? "");
      }),
    );

  const filteredRows = applyFilters(rows);

  return (
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
          {filteredRows.map((employee) => (
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

          {!filteredRows.length && (
            <tr>
              <td colSpan={COLUMNS.length} className="em-empty">
                No employees found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
