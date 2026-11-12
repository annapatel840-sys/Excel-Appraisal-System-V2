import { useEffect, useMemo, useRef, useState } from "react";
import { Check, X } from "lucide-react";
import { loadDesignationMaster } from "@/lib/designation-master-api";

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
  onGenerateDelegation,
  savedCriteria = null, // criteria saved by the last Apply Criteria (from the server)
  open = true,
  onOpenChange,
  criteriaApplied = false,
  delegationGenerated = false,
  readOnly = false,
}) {
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [selectedDesignations, setSelectedDesignations] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [search, setSearch] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [cutoffDate, setCutoffDate] = useState("");
  const [isEditing, setIsEditing] = useState(!criteriaApplied);
  const [applying, setApplying] = useState(false);
  const savedDraftRef = useRef(null);
  // true while the user is changing an already-applied criteria set
  const draftingRef = useRef(false);

  useEffect(() => {
    setIsEditing(!criteriaApplied);
  }, [criteriaApplied]);

  // Show the selections saved by the last Apply Criteria, so they are still
  // there after a reload and when Edit Criteria is opened. A draft being
  // edited right now is never overwritten.
  useEffect(() => {
    if (!savedCriteria || draftingRef.current) return;
    setSelectedDepartments(savedCriteria.departments || []);
    setSelectedDesignations(savedCriteria.designations || []);
    setSelectedStatuses(savedCriteria.statuses || []);
    setExcludedEmployees(savedCriteria.excludedEmployees || []);
    setCutoffDate(savedCriteria.cutoffDate || "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedCriteria]);

  const currentDraft = () => ({
    departments: selectedDepartments,
    designations: selectedDesignations,
    statuses: selectedStatuses,
    excludedEmployees: [...excludedEmployees],
    cutoffDate,
  });

  const beginEdit = () => {
    savedDraftRef.current = currentDraft();
    draftingRef.current = true;
    setIsEditing(true);
  };

  const cancelEdit = () => {
    const saved = savedDraftRef.current;
    if (saved) {
      setSelectedDepartments(saved.departments);
      setSelectedDesignations(saved.designations);
      setSelectedStatuses(saved.statuses || []);
      setExcludedEmployees(saved.excludedEmployees);
      setCutoffDate(saved.cutoffDate);
    }
    draftingRef.current = false;
    setIsEditing(false);
  };

  const applyDraft = async () => {
    setApplying(true);
    try {
      const succeeded = await onApply({
        ...currentDraft(),
        replaceCriteria: criteriaApplied,
      });
      if (succeeded) {
        savedDraftRef.current = currentDraft();
        draftingRef.current = false;
        setIsEditing(false);
      }
    } finally {
      setApplying(false);
    }
  };

  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.status === "Active"),
    [employees],
  );

  // Designation + department names come from the Designation table
  // (Designation Master). If that table cannot be read, fall back to the
  // values found in the employee list so the screen keeps working.
  const [designationRows, setDesignationRows] = useState([]);

  useEffect(() => {
    let cancelled = false;
    loadDesignationMaster()
      .then((data) => {
        if (!cancelled) setDesignationRows(data?.designations || []);
      })
      .catch((error) => {
        console.error("Could not load Designation table for criteria:", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const departments = useMemo(() => {
    const fromTable = [...new Set(designationRows.map((row) => row.department))]
      .filter(Boolean)
      .sort();
    if (fromTable.length) return fromTable;
    return [...new Set(activeEmployees.map((employee) => employee.organization))]
      .filter(Boolean)
      .sort();
  }, [designationRows, activeEmployees]);

  const designations = useMemo(() => {
    const fromTable = [...new Set(designationRows.map((row) => row.name))]
      .filter(Boolean)
      .sort();
    if (fromTable.length) return fromTable;
    return [...new Set(activeEmployees.map((employee) => employee.designation))]
      .filter(Boolean)
      .sort();
  }, [designationRows, activeEmployees]);

  const statusValues = useMemo(() => {
    const found = [...new Set(employees.map((employee) => employee.status))]
      .filter(Boolean)
      .sort();
    return found.length ? found : ["Active", "Inactive"];
  }, [employees]);

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

  // Folded: only a vertical tab is left, like the Eligibility List panel.
  if (!open) {
    return (
      <div className="em-criteria-folded">
        <button
          type="button"
          className="em-criteria-tab"
          onClick={() => onOpenChange?.(true)}
          title="Open the criteria panel"
          aria-label="Open the criteria panel"
        >
          Criteria ›
        </button>
      </div>
    );
  }

  return (
    <div className="em-criteria-pane">
      <div className="em-criteria-head">
        <b>Eligibility Criteria</b>
        <button
          type="button"
          onClick={() => onOpenChange?.(false)}
          aria-label="Fold the criteria panel"
          title="Fold the criteria panel"
        >
          <X size={14} />
        </button>
      </div>

      <div className="em-crit-h">Exclude by department</div>
      <CheckList
        values={departments}
        selected={selectedDepartments}
        setSelected={setSelectedDepartments}
        disabled={readOnly || !isEditing}
      />

      <div className="em-crit-h">Exclude by designation</div>
      <CheckList
        values={designations}
        selected={selectedDesignations}
        setSelected={setSelectedDesignations}
        disabled={readOnly || !isEditing}
      />

      <div className="em-crit-h">Exclude by employee status</div>
      <CheckList
        values={statusValues}
        selected={selectedStatuses}
        setSelected={setSelectedStatuses}
        disabled={readOnly || !isEditing}
      />

      <div className="em-crit-h">Exclude specific employees</div>
      <div className="em-search-field">
        <input
          value={search}
          disabled={readOnly || !isEditing}
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
                disabled={readOnly || !isEditing}
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
        disabled={readOnly || !isEditing}
        onChange={(event) => setCutoffDate(event.target.value)}
      />

      <div className="em-crit-actions">
        {isEditing ? (
          <>
            <button
              type="button"
              className="em-btn em-btn-primary em-apply-btn"
              disabled={readOnly || applying}
              onClick={applyDraft}
            >
              <Check size={14} />
              {applying ? "Applying..." : "Apply Criteria"}
            </button>
            {criteriaApplied && (
              <button
                type="button"
                className="em-btn em-btn-ghost"
                disabled={applying}
                onClick={cancelEdit}
              >
                Cancel Edit
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            className="em-btn em-btn-primary em-apply-btn"
            disabled={readOnly}
            onClick={beginEdit}
          >
            Edit Criteria
          </button>
        )}
      </div>


    </div>
  );
}