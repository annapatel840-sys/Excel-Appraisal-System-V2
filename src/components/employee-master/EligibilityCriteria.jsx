import { useMemo, useState } from "react";
import { Check, X } from "lucide-react";

function CheckList({ values, selected, setSelected, disabled }) {
  const toggle = (value) =>
    setSelected((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value],
    );

  return (
    <div className="em-chk-list">
      {values.length === 0 && <div className="em-hint">No values</div>}
      {values.map((value) => (
        <label key={value}>
          <input
            type="checkbox"
            checked={selected.includes(value)}
            onChange={() => toggle(value)}
            disabled={disabled}
          />
          <span>{value}</span>
        </label>
      ))}
    </div>
  );
}

export function EligibilityCriteria({
  employees,
  excludedEmployees,
  setExcludedEmployees,
  onApply,
  readOnly = false,
}) {
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [selectedDesignations, setSelectedDesignations] = useState([]);
  const [search, setSearch] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [cutoffDate, setCutoffDate] = useState("");

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.status === "Active"),
    [employees],
  );

  const departments = useMemo(
    () =>
      [...new Set(activeEmployees.map((employee) => employee.organization))]
        .filter(Boolean)
        .sort(),
    [activeEmployees],
  );

  const designations = useMemo(
    () =>
      [...new Set(activeEmployees.map((employee) => employee.designation))]
        .filter(Boolean)
        .sort(),
    [activeEmployees],
  );

  const suggestions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return activeEmployees
      .filter(
        (employee) =>
          !excludedEmployees.includes(employee.empId) &&
          `${employee.empId} ${employee.name}`.toLowerCase().includes(term),
      )
      .slice(0, 6);
  }, [search, activeEmployees, excludedEmployees]);

  const addExcluded = (empId) => {
    setExcludedEmployees((current) =>
      current.includes(empId) ? current : [...current, empId],
    );
    setSearch("");
    setShowSuggest(false);
  };

  return (
    <div className="em-criteria-pane">
      <div className="em-crit-h">Exclude by department</div>
      <CheckList
        values={departments}
        selected={selectedDepartments}
        setSelected={setSelectedDepartments}
        disabled={readOnly}
      />

      <div className="em-crit-h">Exclude by designation</div>
      <CheckList
        values={designations}
        selected={selectedDesignations}
        setSelected={setSelectedDesignations}
        disabled={readOnly}
      />

      <div className="em-crit-h">Exclude specific employees</div>
      <div className="em-search-field">
        <input
          value={search}
          disabled={readOnly}
          onChange={(event) => {
            setSearch(event.target.value);
            setShowSuggest(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && suggestions[0])
              addExcluded(suggestions[0].empId);
          }}
          placeholder="Type name or ID"
        />
      </div>

      {showSuggest && search.trim() && (
        <div className="em-suggest">
          {suggestions.length ? (
            suggestions.map((employee) => (
              <div
                key={employee.empId}
                onMouseDown={() => addExcluded(employee.empId)}
              >
                {employee.empId} - {employee.name}
              </div>
            ))
          ) : (
            <div className="em-hint">No match</div>
          )}
        </div>
      )}

      <div className="em-chips">
        {excludedEmployees.map((empId) => {
          const employee = employees.find((item) => item.empId === empId);
          return (
            <span className="em-chip" key={empId}>
              {employee?.name ?? empId}
              <button
                type="button"
                disabled={readOnly}
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

      <div className="em-crit-h">Joining date cutoff</div>
      <div className="em-hint">Exclude anyone who joined after this date</div>
      <input
        type="date"
        className="em-date-input"
        value={cutoffDate}
        disabled={readOnly}
        onChange={(event) => setCutoffDate(event.target.value)}
      />

      <button
        type="button"
        className="em-btn em-btn-primary em-apply-btn"
        disabled={readOnly}
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
  );
}
