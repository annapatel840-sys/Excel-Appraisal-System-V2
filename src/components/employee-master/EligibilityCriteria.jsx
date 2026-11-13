import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, X } from "lucide-react";
import { loadDesignationMaster } from "@/lib/designation-master-api";
import {
  PARAM_MASTERS,
  defaultCutoffForCycle,
  employeeMasterFields,
  findParamField,
  paramValues,
  previewCounts,
  statusOf,
} from "@/lib/eligibility-rules";

const ALWAYS_EXCLUDED = ["Inactive"]; // rule 6: Inactive is always excluded

const fmtDate = (iso) => {
  if (!iso) return "—";
  const [y, m, d] = String(iso).slice(0, 10).split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return y && m && d ? `${Number(d)} ${months[Number(m) - 1]} ${y}` : iso;
};

// The last applied criteria are also kept on this device, so Edit Criteria always starts
// from them even when the server did not send them back. The server copy wins when present.
const localKey = (cycleName, locationLabel) => `elx-criteria:${cycleName}|${locationLabel}`;
const readLocalCriteria = (key) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
const writeLocalCriteria = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the server copy still applies */
  }
};

export function EligibilityCriteria({
  employees,
  excludedEmployees,
  setExcludedEmployees,
  onApply,
  savedCriteria = null,
  criteriaApplied = false,
  delegationGenerated = false,
  readOnly = false,
  cycleName = "",
  locationLabel = "this location",
  hasCycle = true,
  currentCounts = null, // { eligible, notEligible, total } of the generated list
  onApplied, // called after a successful Apply (screen jumps to the list tab)
  actionsHost = null, // element in the tab bar where Apply / Edit / Cancel are shown
}) {
  const [selectedDepartments, setSelectedDepartments] = useState([]);
  const [selectedDesignations, setSelectedDesignations] = useState([]);
  const [selectedStatuses, setSelectedStatuses] = useState([]);
  const [extraParameters, setExtraParameters] = useState([]);
  const [cutoffDate, setCutoffDate] = useState("");
  const [isEditing, setIsEditing] = useState(!criteriaApplied);
  const [applying, setApplying] = useState(false);
  const [sel, setSel] = useState("st");
  const [listQuery, setListQuery] = useState("");
  const [empQuery, setEmpQuery] = useState("");
  const [showSuggest, setShowSuggest] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addPos, setAddPos] = useState(null);
  const addBtnRef = useRef(null);
  const addMenuRef = useRef(null);
  const savedDraftRef = useRef(null);
  const draftingRef = useRef(false);

  const defaultCutoff = useMemo(() => defaultCutoffForCycle(cycleName), [cycleName]);

  useEffect(() => {
    setIsEditing(!criteriaApplied);
  }, [criteriaApplied]);

  // Selections saved by the last Apply Criteria (server). A draft being edited is never overwritten.
  useEffect(() => {
    if (draftingRef.current) return;
    const source = savedCriteria || (criteriaApplied ? readLocalCriteria(localKey(cycleName, locationLabel)) : null);
    setSelectedDepartments(source?.departments || []);
    setSelectedDesignations(source?.designations || []);
    setSelectedStatuses(source?.statuses || []);
    setExcludedEmployees(source?.excludedEmployees || []);
    setExtraParameters(source?.extraParameters || []);
    // Rule 7: no saved date -> start from the cycle default
    setCutoffDate(source?.cutoffDate || defaultCutoff);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedCriteria, defaultCutoff, criteriaApplied, cycleName, locationLabel]);

  const locked = readOnly || !isEditing || delegationGenerated;

  const withAlways = (list) => [...new Set([...ALWAYS_EXCLUDED, ...list])];

  const currentDraft = () => ({
    departments: selectedDepartments,
    designations: selectedDesignations,
    statuses: withAlways(selectedStatuses),
    excludedEmployees: [...excludedEmployees],
    cutoffDate,
    extraParameters,
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
      setExtraParameters(saved.extraParameters || []);
    }
    draftingRef.current = false;
    setIsEditing(false);
  };

  const applyDraft = async () => {
    setApplying(true);
    try {
      const ok = await onApply({ ...currentDraft(), replaceCriteria: criteriaApplied });
      if (ok) {
        writeLocalCriteria(localKey(cycleName, locationLabel), currentDraft());
        savedDraftRef.current = currentDraft();
        draftingRef.current = false;
        setIsEditing(false);
        onApplied?.();
      }
    } finally {
      setApplying(false);
    }
  };

  /* ----- value lists ----- */
  const activeEmployees = useMemo(
    () => employees.filter((e) => statusOf(e).toLowerCase() === "active"),
    [employees],
  );

  const [designationRows, setDesignationRows] = useState([]);
  useEffect(() => {
    let cancelled = false;
    loadDesignationMaster()
      .then((data) => !cancelled && setDesignationRows(data?.designations || []))
      .catch((error) => console.error("Could not load Designation table for criteria:", error));
    return () => {
      cancelled = true;
    };
  }, []);

  const departments = useMemo(() => {
    const t = [...new Set(designationRows.map((r) => r.department))].filter(Boolean).sort();
    return t.length ? t : [...new Set(activeEmployees.map((e) => e.organization))].filter(Boolean).sort();
  }, [designationRows, activeEmployees]);

  const designations = useMemo(() => {
    const t = [...new Set(designationRows.map((r) => r.name))].filter(Boolean).sort();
    return t.length ? t : [...new Set(activeEmployees.map((e) => e.designation))].filter(Boolean).sort();
  }, [designationRows, activeEmployees]);

  // Only the statuses that really exist in the Employee Master.
  const statusValues = useMemo(() => {
    const found = [...new Set(employees.map((e) => statusOf(e)))].filter(Boolean);
    return found.sort((a, b) => {
      const rank = (v) => (v.toLowerCase() === "active" ? 0 : v.toLowerCase() === "inactive" ? 1 : 2);
      return rank(a) - rank(b) || a.localeCompare(b);
    });
  }, [employees]);

  const countBy = (get, v) => employees.filter((e) => String(get(e) ?? "") === v).length;

  /* ----- one definition per list-type section ----- */
  const lists = {
    st: {
      title: "Employee status",
      desc: "Employees with a ticked status are left out of the Eligibility List. Values are read from the Employee Master. Inactive is always excluded.",
      values: statusValues,
      selected: withAlways(selectedStatuses).filter((v) => statusValues.includes(v)),
      set: setSelectedStatuses,
      count: (v) => countBy((e) => e.status, v),
      always: (v) => ALWAYS_EXCLUDED.includes(v),
    },
    dp: {
      title: "Department",
      desc: "Employees in a ticked department are left out. Values are read from the Department master.",
      values: departments,
      selected: selectedDepartments,
      set: setSelectedDepartments,
      count: (v) => countBy((e) => e.organization, v),
    },
    ds: {
      title: "Designation",
      desc: "Employees with a ticked designation are left out. Values are read from the Designation master.",
      values: designations,
      selected: selectedDesignations,
      set: setSelectedDesignations,
      count: (v) => countBy((e) => e.designation, v),
    },
  };

  extraParameters.forEach((p) => {
    if (p.type !== "list") return;
    const f = findParamField(p.master, p.field);
    lists[`x${p.id}`] = {
      title: p.label,
      desc: `Source: ${PARAM_MASTERS.find((m) => m.id === p.master)?.name} › ${p.label}. Employees with a ticked value are left out.`,
      values: paramValues(p, employees),
      selected: p.values || [],
      set: (updater) =>
        setExtraParameters((cur) =>
          cur.map((x) =>
            x.id === p.id
              ? { ...x, values: typeof updater === "function" ? updater(x.values || []) : updater }
              : x,
          ),
        ),
      count: (v) => countBy((e) => f?.get(e), v),
    };
  });

  const toggleValue = (def, value) =>
    def.set((cur) => (cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value]));

  const sectionCount = (id) => {
    if (id === "em") return excludedEmployees.length;
    if (id === "ct") return 0;
    if (lists[id]) return lists[id].selected.length;
    const p = extraParameters.find((x) => `x${x.id}` === id);
    return p ? (p.value !== "" && p.value != null ? 1 : 0) : 0;
  };

  const nav = [
    ["st", "Employee status"],
    ["dp", "Department"],
    ["ds", "Designation"],
    ...extraParameters.map((p) => [`x${p.id}`, p.label]),
    ["em", "Specific employees"],
    ["ct", "Joining date cutoff"],
  ];

  useEffect(() => {
    if (!nav.some(([id]) => id === sel)) setSel("st");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [extraParameters]);

  /* ----- employee picker ----- */
  const suggestions = useMemo(() => {
    const term = empQuery.trim().toLowerCase();
    return activeEmployees
      .filter(
        (e) =>
          !excludedEmployees.includes(e.empId) &&
          (!term || `${e.empId} ${e.name}`.toLowerCase().includes(term)),
      )
      .slice(0, 8);
  }, [empQuery, activeEmployees, excludedEmployees]);

  const addExcluded = (empId) => {
    setExcludedEmployees((cur) => (cur.includes(empId) ? cur : [...cur, empId]));
    setEmpQuery("");
    setShowSuggest(false);
  };

  /* ----- "If applied now": uses the same rules as Apply, so the numbers match the list ----- */
  const impact = useMemo(() => {
    const all = previewCounts(employees, {
      statuses: withAlways(selectedStatuses),
      departments: selectedDepartments,
      designations: selectedDesignations,
      excludedEmployees,
      cutoffDate,
      extraParameters,
    });
    // Each criterion counted on its own (one employee can match several).
    const only = (patch) => previewCounts(employees, patch).notEligible;
    const by = [
      ["Employee status", only({ statuses: selectedStatuses })],
      ["Department", only({ departments: selectedDepartments })],
      ["Designation", only({ designations: selectedDesignations })],
      ["Specific employees", only({ excludedEmployees })],
      ["Joining date cutoff", only({ cutoffDate })],
      ...extraParameters.map((p) => [p.label, only({ extraParameters: [p] })]),
    ].filter(([, n]) => n > 0);
    return { all, by };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, selectedStatuses, selectedDepartments, selectedDesignations, excludedEmployees, cutoffDate, extraParameters]);

  /* ----- state message ----- */
  const cycle = cycleName || "this cycle";
  let strip;
  let amber = false;
  if (!hasCycle || (readOnly && !criteriaApplied)) {
    amber = true;
    strip = (
      <>
        <b>No Eligibility List can be generated for {locationLabel} right now.</b> An Active Annual
        cycle (or another cycle that follows the process) must exist, and the previous cycle must be
        archived. The criteria below are the saved {locationLabel} default.
      </>
    );
  } else if (readOnly) {
    strip = (
      <>
        <b>{cycle} is read-only.</b> The criteria used for this cycle are shown as saved.
      </>
    );
  } else if (!criteriaApplied) {
    strip = (
      <>
        <b>First generation for {cycle}.</b> The list is empty. Set the criteria (saved {locationLabel}{" "}
        default) and press Apply Criteria to generate it.
      </>
    );
  } else if (delegationGenerated) {
    strip = (
      <>
        <b>Delegation is generated for {cycle}. The criteria are locked.</b> From here a person who
        becomes not active moves to Not Eligible and leaves Delegation and the Appraisal Sheet. A
        person made eligible or added goes to Delegation first, then the Appraisal Sheet.
      </>
    );
  } else if (isEditing) {
    // Editing an applied list: no banner, the Apply / Cancel buttons say it all.
    strip = null;
  } else {
    strip = (
      <>
        <b>List generated for {cycle}.</b> You can Edit Criteria and regenerate until Delegation is
        generated.
      </>
    );
  }

  /* ----- panes ----- */
  const renderList = (id) => {
    const def = lists[id];
    const p = extraParameters.find((x) => `x${x.id}` === id);
    const q = listQuery.toLowerCase();
    const items = def.values.filter((v) => !q || v.toLowerCase().includes(q));
    return (
      <>
        <div className="elx-rh">
          <div>
            <div className="elx-rt">{def.title}</div>
            <div className="em-hint">{def.desc}</div>
          </div>
          {p && !locked && (
            <button type="button" className="elx-lnk" onClick={() => removeParam(p)}>
              Remove parameter
            </button>
          )}
          <div className="elx-rsel">{def.selected.length} selected</div>
        </div>
        <div className="elx-rtool">
          <div className="em-search-field">
            <input
              placeholder={`Search ${def.title.toLowerCase()}`}
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
          <button
            type="button"
            className="elx-lnk"
            disabled={locked}
            onClick={() => def.set((cur) => [...new Set([...cur, ...items])])}
          >
            Select all
          </button>
          <button
            type="button"
            className="elx-lnk"
            disabled={locked}
            onClick={() => def.set((cur) => cur.filter((v) => def.always?.(v) || !items.includes(v)))}
          >
            Clear
          </button>
        </div>
        <div className="elx-rlist">
          {items.length === 0 && <div className="em-hint" style={{ padding: 14 }}>No match.</div>}
          {items.map((v) => {
            const al = def.always?.(v);
            const n = def.count(v);
            return (
              <label key={v} className={`elx-ri${locked || al ? " dis" : ""}`}>
                <input
                  type="checkbox"
                  checked={al || def.selected.includes(v)}
                  disabled={locked || al}
                  onChange={() => toggleValue(def, v)}
                />
                <span className="elx-rn">
                  {v}
                  {al && <em>always excluded</em>}
                </span>
                <i>
                  {n} {n === 1 ? "employee" : "employees"}
                </i>
              </label>
            );
          })}
        </div>
      </>
    );
  };

  const patchParam = (id, patch) =>
    setExtraParameters((cur) => cur.map((x) => (x.id === id ? { ...x, ...patch } : x)));

  const removeParam = (p) => {
    setExtraParameters((cur) => cur.filter((x) => x.id !== p.id));
    setSel("st");
  };

  const renderParamValue = (p) => (
    <>
      <div className="elx-rh">
        <div>
          <div className="elx-rt">{p.label}</div>
          <div className="em-hint">
            Source: {PARAM_MASTERS.find((m) => m.id === p.master)?.name} › {p.label}
          </div>
        </div>
        {!locked && (
          <button type="button" className="elx-lnk" onClick={() => removeParam(p)}>
            Remove parameter
          </button>
        )}
      </div>
      <div className="elx-box">
        {p.type === "number" ? (
          <>
            <div className="em-hint">Exclude employees with a value below</div>
            <input
              type="number"
              min="0"
              step="0.1"
              className="em-date-input elx-narrow"
              value={p.value ?? ""}
              disabled={locked}
              onChange={(e) => patchParam(p.id, { value: e.target.value })}
            />
          </>
        ) : (
          <>
            <div className="em-hint">Exclude employees whose date is</div>
            <select
              className="em-date-input elx-narrow"
              value={p.op || "after"}
              disabled={locked}
              onChange={(e) => patchParam(p.id, { op: e.target.value })}
            >
              <option value="after">after</option>
              <option value="before">on or before</option>
            </select>
            <input
              type="date"
              className="em-date-input elx-narrow"
              style={{ marginTop: 8 }}
              value={p.value || ""}
              disabled={locked}
              onChange={(e) => patchParam(p.id, { value: e.target.value })}
            />
          </>
        )}
      </div>
    </>
  );

  const renderEmployees = () => (
    <>
      <div className="elx-rh">
        <div>
          <div className="elx-rt">Specific employees</div>
          <div className="em-hint">Exclude named employees. Only active employees can be picked.</div>
        </div>
        <div className="elx-rsel">{excludedEmployees.length} selected</div>
      </div>
      <div className="elx-rtool" style={{ position: "relative" }}>
        <div className={`em-search-field${locked ? " dis" : ""}`} style={{ maxWidth: 360 }}>
          <input
            placeholder="Type name or ID"
            autoComplete="off"
            disabled={locked}
            value={empQuery}
            onFocus={() => setShowSuggest(true)}
            onBlur={() => setTimeout(() => setShowSuggest(false), 120)}
            onChange={(e) => {
              setEmpQuery(e.target.value);
              setShowSuggest(true);
            }}
            onKeyDown={(e) => e.key === "Enter" && suggestions[0] && addExcluded(suggestions[0].empId)}
          />
        </div>
        {showSuggest && !locked && (
          <div className="em-suggest elx-suggest">
            {suggestions.length ? (
              suggestions.map((e) => (
                <div key={e.empId} onMouseDown={() => addExcluded(e.empId)}>
                  {e.empId} - {e.name}
                </div>
              ))
            ) : (
              <div className="em-hint">No match</div>
            )}
          </div>
        )}
      </div>
      <div className="em-chips" style={{ padding: "6px 2px" }}>
        {excludedEmployees.length === 0 && <span className="elx-none">No employees excluded.</span>}
        {excludedEmployees.map((id) => {
          const e = employees.find((x) => x.empId === id);
          return (
            <span className="em-chip" key={id}>
              {e?.name ?? id}
              <button
                type="button"
                disabled={locked}
                onClick={() => setExcludedEmployees((cur) => cur.filter((x) => x !== id))}
              >
                <X size={11} />
              </button>
            </span>
          );
        })}
      </div>
    </>
  );

  const renderCutoff = () => {
    const changed = (cutoffDate || "") !== defaultCutoff;
    return (
      <>
        <div className="elx-rh">
          <div>
            <div className="elx-rt">Joining date cutoff</div>
            <div className="em-hint">Employees who joined after this date are left out.</div>
          </div>
        </div>
        <div className="elx-box">
          <div className="em-hint">Cutoff date</div>
          <input
            type="date"
            className="em-date-input elx-narrow"
            value={cutoffDate}
            disabled={locked || !hasCycle}
            onChange={(e) => setCutoffDate(e.target.value)}
          />
          <div className="em-hint" style={{ marginTop: 10 }}>
            {defaultCutoff ? (
              <>
                Starts as the cycle default ({fmtDate(defaultCutoff)}, 31 Oct of the year before the
                cycle's end year, from {cycle}). Change it here if needed; it applies to {cycle} only
                and archived cycles keep their own date.{" "}
                {changed && (
                  <>
                    <b className="elx-chg">Changed from default.</b>{" "}
                    {!locked && (
                      <button type="button" className="elx-lnk" onClick={() => setCutoffDate(defaultCutoff)}>
                        Reset to default
                      </button>
                    )}
                  </>
                )}
              </>
            ) : (
              "No cycle yet. When the next Annual cycle is created, the cutoff starts as 31 Oct of the year before the cycle's end year and can be changed here."
            )}
          </div>
        </div>
      </>
    );
  };

  /* ----- Add parameter: a dropdown of every Employee Master field ----- */
  const masterFields = useMemo(() => employeeMasterFields(employees), [employees]);
  const addable = useMemo(() => {
    const used = new Set(extraParameters.map((p) => p.field));
    const q = addQuery.trim().toLowerCase();
    return masterFields.filter((f) => !used.has(f.key) && (!q || f.label.toLowerCase().includes(q)));
  }, [masterFields, extraParameters, addQuery]);

  const openAddMenu = () => {
    const rect = addBtnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const below = window.innerHeight - rect.bottom - 8;
    const flip = below < 200 && rect.top > below;
    setAddPos({
      left: rect.left,
      width: Math.max(rect.width, 260),
      maxHeight: Math.min(340, Math.max(160, flip ? rect.top - 12 : below)),
      ...(flip ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
    setAddQuery("");
    setAddOpen(true);
  };

  useEffect(() => {
    if (!addOpen) return undefined;
    const outside = (e) => {
      if (addMenuRef.current?.contains(e.target) || addBtnRef.current?.contains(e.target)) return;
      setAddOpen(false);
    };
    const esc = (e) => e.key === "Escape" && setAddOpen(false);
    const scroll = (e) => {
      if (addMenuRef.current?.contains(e.target)) return;
      setAddOpen(false);
    };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", scroll, true);
    window.addEventListener("resize", scroll);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", scroll, true);
      window.removeEventListener("resize", scroll);
    };
  }, [addOpen]);

  const addField = (field) => {
    const id = `${field.key.replace(/[^a-z0-9]/gi, "")}_${Date.now() % 100000}`;
    setExtraParameters((cur) => [
      ...cur,
      { id, master: "EM", field: field.key, label: field.label, type: field.type, values: [], op: "after", value: "" },
    ]);
    setSel(`x${id}`);
    setListQuery("");
    setAddOpen(false);
  };

  const selectedParam = extraParameters.find((x) => `x${x.id}` === sel);
  let pane;
  if (sel === "em") pane = renderEmployees();
  else if (sel === "ct") pane = renderCutoff();
  else if (lists[sel]) pane = renderList(sel);
  else if (selectedParam) pane = renderParamValue(selectedParam);

  const actionButtons = (
    <>
        {isEditing ? (
          <>
            <button
              type="button"
              className="em-btn em-btn-primary elx-apply"
              disabled={readOnly || applying || delegationGenerated || !hasCycle}
              onClick={applyDraft}
            >
              <Check size={14} />
              {applying ? "Applying..." : "Apply Criteria"}
            </button>
            {criteriaApplied && (
              <button type="button" className="em-btn em-btn-ghost" disabled={applying} onClick={cancelEdit}>
                Cancel Edit
              </button>
            )}
          </>
        ) : (
          <button
            type="button"
            className="em-btn em-btn-primary elx-apply"
            disabled={readOnly || delegationGenerated}
            onClick={beginEdit}
          >
            Edit Criteria
          </button>
        )}
    </>
  );

  return (
    <div className="elx-crit">
      {actionsHost ? createPortal(actionButtons, actionsHost) : <div className="elx-actions">{actionButtons}</div>}
      {strip && <div className={`elx-strip${amber ? " amber" : ""}`}>{strip}</div>}

      <div className="elx-cwrap">
        <div className="elx-cl">
          {nav.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`elx-ni${sel === id ? " on" : ""}`}
              onClick={() => {
                setSel(id);
                setListQuery("");
              }}
            >
              <span>{label}</span>
              {id === "ct" ? (
                <span className="elx-nb lk">
                  {cutoffDate ? fmtDate(cutoffDate).replace(/ 20(\d\d)$/, " $1") : "—"}
                </span>
              ) : (
                <span className={`elx-nb${sectionCount(id) ? " on" : ""}`}>{sectionCount(id)}</span>
              )}
            </button>
          ))}
          <button
            ref={addBtnRef}
            type="button"
            className={`elx-ni add${addOpen ? " on" : ""}`}
            disabled={locked}
            aria-haspopup="listbox"
            aria-expanded={addOpen}
            title={locked ? "Edit Criteria is needed to change the parameters" : undefined}
            onClick={() => (addOpen ? setAddOpen(false) : openAddMenu())}
          >
            <span>＋ Add parameter</span>
            <span>▾</span>
          </button>
          {addOpen && addPos && (
            <div
              ref={addMenuRef}
              className="elx-addmenu"
              role="listbox"
              style={{
                position: "fixed",
                left: addPos.left,
                width: addPos.width,
                maxHeight: addPos.maxHeight,
                ...(addPos.top !== undefined ? { top: addPos.top } : { bottom: addPos.bottom }),
              }}
            >
              <input
                autoFocus
                placeholder="Search Employee Master fields"
                value={addQuery}
                onChange={(e) => setAddQuery(e.target.value)}
              />
              <div className="elx-addlist">
                {addable.length === 0 && (
                  <div className="elx-addempty">
                    {masterFields.length ? "No more fields to add." : "No Employee Master fields found."}
                  </div>
                )}
                {addable.map((f) => (
                  <button key={f.key} type="button" role="option" className="elx-addopt" onClick={() => addField(f)}>
                    <span>{f.label}</span>
                    <i>{f.type === "list" ? "values" : f.type}</i>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="elx-cr">
          {pane}
          <div className="elx-sum">
            <div className="elx-sum-h">
              If applied now
              <span>{locked ? "saved criteria" : "your draft"}</span>
            </div>
            <div className="elx-sum-grid">
              <div className="ok">
                <b>{impact.all.eligible}</b>
                <span>Eligible</span>
              </div>
              <div className="no">
                <b>{impact.all.notEligible}</b>
                <span>Left out by criteria</span>
              </div>
              <div>
                <b>{impact.all.total}</b>
                <span>Active employees</span>
              </div>
              {currentCounts && (
                <div className="cur">
                  <b>
                    {currentCounts.eligible}
                    <i> / {currentCounts.notEligible}</i>
                  </b>
                  <span>In the list now (eligible / not)</span>
                </div>
              )}
            </div>
            {impact.by.length > 0 && (
              <div className="elx-sum-by">
                {impact.by.map(([label, n]) => (
                  <span key={label}>
                    {label}: <b>{n}</b>
                  </span>
                ))}
                <em>Each criterion counted on its own; one employee can match several.</em>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="elx-foot">
        <span className="em-hint">
          {delegationGenerated
            ? `Locked: Delegation is generated for ${cycle}.`
            : hasCycle
              ? `Saves as the ${locationLabel} default and as the copy for ${cycle}. Earlier cycles stay as they were.`
              : `Apply Criteria is available after the next Annual cycle is created for ${locationLabel}.`}
        </span>
      </div>
    </div>
  );
}