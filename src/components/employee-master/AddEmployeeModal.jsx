import { useMemo, useState } from "react";
import { X } from "lucide-react";

const REASONS = ["ML", "Withdrew resignation", "Others"];

export function AddEmployeeModal({
  masterEmployees = [],
  listedIds,
  onAdd,
  onClose,
}) {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState(null);
  const [focus, setFocus] = useState(false);
  const [reason, setReason] = useState("ML");
  const [details, setDetails] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const term = query.trim().toLowerCase();

  const suggestions = useMemo(() => {
    if (chosen) return [];
    const pool = term
      ? masterEmployees.filter((e) =>
          `${e.empId} ${e.name}`.toLowerCase().includes(term),
        )
      : masterEmployees.filter(
          (e) => e.status === "Active" && !listedIds.has(e.empId),
        );
    return pool.slice(0, 6);
  }, [masterEmployees, term, chosen, listedIds]);

  const fail = (message) => {
    setError(message);
    return false;
  };

  const submit = async () => {
    const employee =
      masterEmployees.find((e) => e.empId === chosen) ||
      masterEmployees.find(
        (e) =>
          String(e.empId).toLowerCase() === term ||
          String(e.name).toLowerCase() === term,
      );

    if (!term && !chosen) return fail("Enter an Employee ID or name.");
    if (!employee)
      return fail(
        "Not in the Employee Master. Upload the employee to the Employee Master first.",
      );
    if (employee.status !== "Active")
      return fail("This employee is inactive and cannot be added.");
    if (listedIds.has(employee.empId))
      return fail("Already in the list. An Employee ID appears once.");
    if (reason === "Others" && !details.trim())
      return fail("Details are required for this reason.");

    setBusy(true);
    try {
      await onAdd({
        empId: employee.empId,
        eligible: "Yes",
        eligibleReason: reason === "Others" ? details.trim() : reason,
      });
      onClose();
    } catch (e) {
      setError(e?.message || "Could not add the employee.");
      setBusy(false);
    }
  };

  return (
    <div className="em-modal-overlay">
      <div className="em-modal em-small-modal">
        <div className="em-modal-header">
          <div>
            <strong>Add employee to the Eligibility List</strong>
            <span>Pick from the Employee Master</span>
          </div>
          <button type="button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        <div className="em-modal-body">
          <div className="em-field">
            <label>Employee ID or name</label>
            <input
              className={`em-date-input ${error && !chosen ? "em-bad" : ""}`}
              value={query}
              placeholder="Type to search the Employee Master"
              autoComplete="off"
              onFocus={() => setFocus(true)}
              onBlur={() => setTimeout(() => setFocus(false), 120)}
              onChange={(e) => {
                setQuery(e.target.value);
                setChosen(null);
                setError("");
              }}
            />
            {focus && suggestions.length > 0 && (
              <div className="emx-suggest">
                {suggestions.map((e) => (
                  <div
                    key={e.empId}
                    onMouseDown={() => {
                      setChosen(e.empId);
                      setQuery(`${e.empId} - ${e.name}`);
                      setError("");
                    }}
                  >
                    {e.empId} - {e.name}
                    {e.status !== "Active" ? " (inactive)" : ""}
                    {listedIds.has(e.empId) ? " (already in list)" : ""}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="em-field">
            <label>Reason</label>
            <select
              className="em-date-input"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                setError("");
              }}
            >
              {REASONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>

          {reason === "Others" && (
            <div className="em-field">
              <label>Details</label>
              <input
                className="em-date-input"
                value={details}
                onChange={(e) => {
                  setDetails(e.target.value);
                  setError("");
                }}
                placeholder="Specify reason"
              />
            </div>
          )}

          {error && <div className="em-err">{error}</div>}
          <div className="em-hint">
            The joining date cutoff does not apply here. Anyone active in the
            Employee Master can be added.
          </div>
        </div>

        <div className="em-modal-footer">
          <button
            type="button"
            className="em-btn em-btn-ghost"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="em-btn em-btn-primary"
            disabled={busy}
            onClick={submit}
          >
            {busy ? "Adding..." : "Add"}
          </button>
        </div>
      </div>
    </div>
  );
}
