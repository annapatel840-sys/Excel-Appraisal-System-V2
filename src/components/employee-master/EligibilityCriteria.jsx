import { useMemo, useState } from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";

function MultiSelect({ label, values, selected, setSelected }) {
  const [open, setOpen] = useState(false);

  const allSelected = values.length > 0 && selected.length === values.length;

  return (
    <div className="em-field">
      <label>{label}</label>

      <div className="em-multiselect">
        <button
          type="button"
          className="em-multiselect-toggle"
          onClick={() => setOpen((current) => !current)}
        >
          <span>
            {allSelected
              ? `All ${label}`
              : selected.length
                ? `${selected.length} selected`
                : `Select ${label}`}
          </span>

          <ChevronDown size={14} />
        </button>

        {open && (
          <div className="em-multiselect-panel">
            <div className="em-ms-actions">
              <button type="button" onClick={() => setSelected([...values])}>
                Select all
              </button>

              <button type="button" onClick={() => setSelected([])}>
                Clear
              </button>
            </div>

            {values.map((value) => (
              <label key={value} className="em-ms-option">
                <input
                  type="checkbox"
                  checked={selected.includes(value)}
                  onChange={() => {
                    setSelected((current) =>
                      current.includes(value)
                        ? current.filter((item) => item !== value)
                        : [...current, value],
                    );
                  }}
                />

                <span>{value}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function EligibilityCriteria({
  employees,
  excludedEmployees,
  setExcludedEmployees,
  onApply,
}) {
  const [selectedDepartments, setSelectedDepartments] = useState([]);

  const [selectedDesignations, setSelectedDesignations] = useState([]);

  const [search, setSearch] = useState("");

  const [cutoffDate, setCutoffDate] = useState("");

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.status === "Active"),
    [employees],
  );

  const departments = useMemo(
    () =>
      [
        ...new Set(activeEmployees.map((employee) => employee.organization)),
      ].sort(),
    [activeEmployees],
  );

  const designations = useMemo(
    () =>
      [
        ...new Set(activeEmployees.map((employee) => employee.designation)),
      ].sort(),
    [activeEmployees],
  );

  const addExcludedEmployee = () => {
    const term = search.trim().toLowerCase();

    if (!term) {
      return;
    }

    const employee = activeEmployees.find(
      (item) =>
        item.empId.toLowerCase() === term ||
        item.name.toLowerCase().includes(term),
    );

    if (!employee) {
      return;
    }

    setExcludedEmployees((current) =>
      current.includes(employee.empId) ? current : [...current, employee.empId],
    );

    setSearch("");
  };

  return (
    <div className="em-criteria-layout">
      <div className="em-criteria-pane">
        <div className="em-pane-title">Eligibility Criteria</div>

        <MultiSelect
          label="Departments"
          values={departments}
          selected={selectedDepartments}
          setSelected={setSelectedDepartments}
        />

        <MultiSelect
          label="Designations"
          values={designations}
          selected={selectedDesignations}
          setSelected={setSelectedDesignations}
        />

        <div className="em-field">
          <label>Exclude Employees</label>

          <div className="em-search-field">
            <Search size={13} />

            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  addExcludedEmployee();
                }
              }}
              placeholder="Search name or Emp ID"
            />
          </div>

          <div className="em-chips">
            {excludedEmployees.map((empId) => {
              const employee = employees.find((item) => item.empId === empId);

              return (
                <span className="em-chip" key={empId}>
                  {employee?.name ?? empId}

                  <button
                    type="button"
                    onClick={() =>
                      setExcludedEmployees((current) =>
                        current.filter((item) => item !== empId),
                      )
                    }
                  >
                    <X size={11} />
                  </button>
                </span>
              );
            })}
          </div>
        </div>

        <div className="em-field">
          <label>Joining Date Cutoff</label>

          <input
            type="date"
            className="em-date-input"
            value={cutoffDate}
            onChange={(event) => setCutoffDate(event.target.value)}
          />
        </div>

        <button
          type="button"
          className="em-btn em-btn-primary em-apply-btn"
          onClick={() =>
            onApply({
              departments: selectedDepartments,
              designations: selectedDesignations,
              excludedEmployees,
              cutoffDate,
            })
          }
        >
          <Check size={14} />
          Apply Criteria
        </button>
      </div>

      <div className="em-criteria-info">
        <h3>How eligibility works</h3>

        <p>
          Active employees are evaluated against the selected department,
          designation, employee exclusion and joining-date criteria.
        </p>

        <p>
          Employees with a manual eligibility override are not changed when
          criteria are applied.
        </p>

        <div className="em-info-card">
          <strong>{activeEmployees.length}</strong>
          <span>Active employees</span>
        </div>
      </div>
    </div>
  );
}
