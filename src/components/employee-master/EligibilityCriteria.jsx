import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, X } from "lucide-react";
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

// One foldable criteria section (click the heading to fold / unfold).
function Section({ title, count = 0, folded, onToggle, grow = false, children }) {
  return (
    <div className={`em-crit-sec${grow && !folded ? " grow" : ""}`}>
      <button
        type="button"
        className="em-crit-toggle"
        aria-expanded={!folded}
        onClick={onToggle}
      >
        {folded ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
        <span>{title}</span>
        {count > 0 && <em>{count}</em>}
      </button>
      {!folded && <div className="em-crit-body">{children}</div>}
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
  const searchBoxRef = useRef(null);
  const [folded, setFolded] = useState({});
  const toggleSection = (key) =>
    setFolded((current) => ({ ...current, [key]: !current[key] }));
  const [menuPos, setMenuPos] = useState(null);

  // The employee picker floats under the search box like a menu (it does not
  // take space in the panel). Position it from the box on open, and close it
  // if the panel or page scrolls so it never drifts away from the box.
  useEffect(() => {
    if (!showSuggest) {
      setMenuPos(null);
      return undefined;
    }
    const place = () => {
      const rect = searchBoxRef.current?.getBoundingClientRect();
      if (!rect) return;
      const maxHeight = 220;
      const below = window.innerHeight - rect.bottom - 8;
      const flip = below < 120 && rect.top > below;
      setMenuPos({
        left: rect.left,
        width: rect.width,
        maxHeight: Math.min(maxHeight, Math.max(120, flip ? rect.top - 12 : below)),
        ...(flip
          ? { bottom: window.innerHeight - rect.top + 4 }
          : { top: rect.bottom + 4 }),
      });
    };
    place();
    const close = (event) => {
      // Scrolling the menu itself must not close it.
      if (event?.target?.closest?.(".em-suggest-menu")) return;
      setShowSuggest(false);
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [showSuggest]);
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
    // Clicking the field lists the employees from the Employee Master;
    // typing narrows the list by name or ID.
    const term = search.trim().toLowerCase();
    return activeEmployees
      .filter(
        (employee) =>
          !excludedEmployees.includes(employee.empId) &&
          (!term ||
            `${employee.empId} ${employee.name}`.toLowerCase().includes(term)),
      )
      .slice(0, 200);
  }, [search, activeEmployees, excludedEmployees]);

  const addExcluded = (empId) => {
    setExcludedEmployees((current) =>
      current.includes(empId) ? current : [...current, empId],
    );
    setSearch("");
    setShowSuggest(false);
  };

  const locked = readOnly || !isEditing;

  return (
    <div className="em-criteria-pane">
      <Section
        title="Exclude by department"
        count={selectedDepartments.length}
        folded={folded.departments}
        onToggle={() => toggleSection("departments")}
        grow
      >
        <CheckList
          values={departments}
          selected={selectedDepartments}
          setSelected={setSelectedDepartments}
          disabled={locked}
        />
      </Section>

      <Section
        title="Exclude by designation"
        count={selectedDesignations.length}
        folded={folded.designations}
        onToggle={() => toggleSection("designations")}
        grow
      >
        <CheckList
          values={designations}
          selected={selectedDesignations}
          setSelected={setSelectedDesignations}
          disabled={locked}
        />
      </Section>

      <Section
        title="Exclude by employee status"
        count={selectedStatuses.length}
        folded={folded.statuses}
        onToggle={() => toggleSection("statuses")}
        grow
      >
        <CheckList
          values={statusValues}
          selected={selectedStatuses}
          setSelected={setSelectedStatuses}
          disabled={locked}
        />
      </Section>

      <Section
        title="Exclude specific employees"
        count={excludedEmployees.length}
        folded={folded.employees}
        onToggle={() => toggleSection("employees")}
      >
        <div className="em-search-field" ref={searchBoxRef}>
          <input
            value={search}
            disabled={locked}
            onFocus={() => setShowSuggest(true)}
            onClick={() => setShowSuggest(true)}
            onBlur={() => setShowSuggest(false)}
            onChange={(event) => {
              setSearch(event.target.value);
              setShowSuggest(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter" && suggestions[0])
                addExcluded(suggestions[0].empId);
            }}
            placeholder="Click to pick, or type name / ID"
          />
        </div>

        {showSuggest && !readOnly && isEditing && menuPos && (
          <div
            className="em-suggest em-suggest-menu"
            style={{
              position: "fixed",
              left: menuPos.left,
              width: menuPos.width,
              maxHeight: menuPos.maxHeight,
              ...(menuPos.top !== undefined
                ? { top: menuPos.top }
                : { bottom: menuPos.bottom }),
            }}
          >
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
              <div className="em-hint em-suggest-empty">No match</div>
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
                  disabled={locked}
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
      </Section>

      <Section
        title="Joining date cutoff"
        count={cutoffDate ? 1 : 0}
        folded={folded.cutoff}
        onToggle={() => toggleSection("cutoff")}
      >
        <div className="em-hint">Exclude anyone who joined after this date</div>
        <input
          type="date"
          className="em-date-input"
          value={cutoffDate}
          disabled={locked}
          onChange={(event) => setCutoffDate(event.target.value)}
        />
      </Section>

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