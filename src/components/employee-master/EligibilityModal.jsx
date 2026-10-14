import { useEffect, useState } from "react";
import { X } from "lucide-react";

const ELIGIBLE_REASONS = ["ML", "Withdrew resignation", "Others"];
const NOT_ELIGIBLE_REASONS = ["PIP", "ML", "Resigned", "Other"];

export function EligibilityModal({ employee, onClose, onSave }) {
  const list = Array.isArray(employee) ? employee : employee ? [employee] : [];
  const first = list[0];
  const isBulk = list.length > 1;

  const [status, setStatus] = useState("Yes");
  const [reason, setReason] = useState("");
  const [otherReason, setOtherReason] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    if (!first) return;
    const preset = Array.isArray(employee) ? employee.preset : undefined;
    // preset comes from the bulk bar; a single row flips its current state
    setStatus(preset ?? (first.eligible === "Yes" ? "No" : "Yes"));
    setReason("");
    setOtherReason("");
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee]);

  if (!first) return null;

  const reasons = status === "Yes" ? ELIGIBLE_REASONS : NOT_ELIGIBLE_REASONS;
  const isOther = reason === "Others" || reason === "Other";

  const save = () => {
    if (!reason) {
      setError("Select a reason.");
      return;
    }
    if (isOther && !otherReason.trim()) {
      setError("Details are required for this reason.");
      return;
    }

    const finalReason = isOther ? otherReason.trim() : reason;

    list.forEach((item) => {
      onSave({
        empId: item.empId,
        eligible: status,
        eligibleReason: finalReason,
      });
    });
  };

  return (
    <div className="em-modal-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <div className="em-modal em-small-modal">
        <div className="em-modal-header">
          <div>
            <strong>
              {status === "Yes" ? "Set Eligible" : "Set Not Eligible"}
              {isBulk ? ` · ${list.length} employees` : ""}
            </strong>
            <span>
              {isBulk ? "Bulk change" : `${first.name} · ${first.empId}`}
            </span>
          </div>

          <button type="button" onClick={onClose}>
            <X size={17} />
          </button>
        </div>

        <div className="em-modal-body">
          <div className="em-field">
            <label>Eligibility</label>
            <select
              className="em-date-input"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setReason("");
                setOtherReason("");
                setError("");
              }}
            >
              <option value="Yes">Eligible</option>
              <option value="No">Not Eligible</option>
            </select>
          </div>

          <div className="em-field">
            <label>Reason</label>
            <select
              className="em-date-input"
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                setError("");
              }}
            >
              <option value="">Select reason</option>
              {reasons.map((item) => (
                <option value={item} key={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          {isOther && (
            <div className="em-field">
              <label>Details</label>
              <input
                className={`em-date-input ${error && !otherReason.trim() ? "em-bad" : ""}`}
                value={otherReason}
                onChange={(event) => {
                  setOtherReason(event.target.value);
                  setError("");
                }}
                placeholder="Specify reason"
              />
            </div>
          )}

          {error && <div className="em-err">{error}</div>}
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
            onClick={save}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
