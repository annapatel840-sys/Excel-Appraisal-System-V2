import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useScreenFields } from "@/lib/access-store";

function Shell({ title, sub, onClose, children, footer }) {
  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key === "Escape") onClose?.();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="em-modal-overlay" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <div className="em-modal em-small-modal">
        <div className="em-modal-header">
          <div>
            <strong>{title}</strong>
            {sub && <span>{sub}</span>}
          </div>
          <button type="button" onClick={onClose}><X size={17} /></button>
        </div>
        <div className="em-modal-body">{children}</div>
        <div className="em-modal-footer">{footer}</div>
      </div>
    </div>
  );
}

export function InactiveModal({ count, onClose, onApply }) {
  const [exitDate, setExitDate] = useState("");
  const [remark, setRemark] = useState("");
  const fieldAccess = useScreenFields("employeeMaster");

  return (
    <Shell
      title="Set Inactive"
      sub={`${count} employee${count > 1 ? "s" : ""}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="em-btn em-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="em-btn em-btn-primary" onClick={() => onApply({ exitDate, remark: remark.trim() })}>
            Set Inactive
          </button>
        </>
      }
    >
      {!fieldAccess.hidden("Exit Date") && (
        <div className="em-field">
          <label>Exit Date (optional)</label>
          <input type="date" className="em-date-input" {...fieldAccess.lock("Exit Date")} value={exitDate} onChange={(e) => setExitDate(e.target.value)} />
        </div>
      )}
      {!fieldAccess.hidden("Remark") && (
        <div className="em-field">
          <label>Remark (optional)</label>
          <input className="em-date-input" {...fieldAccess.lock("Remark")} value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Remark" />
        </div>
      )}
      <div className="em-hint">Inactive employees leave the Appraisal Sheet but stay in history.</div>
    </Shell>
  );
}

// access = the field's name in Access → Fields → Employee Master (only fields set to Edit are offered).
const FIELDS = [
  { key: "status", label: "Employee Status", access: "Employee Status", kind: "status", multi: true },
  { key: "name", label: "Employee Name", access: "Employee Name", multi: false },
  { key: "designation", label: "Designation", access: "Designation", multi: true },
  { key: "dept", label: "Department", access: "Department", multi: true },
  { key: "reportingManager", label: "Reporting Manager", access: "Reporting Manager", multi: true },
  { key: "director", label: "Director", access: "Director", multi: true },
  { key: "appraiser", label: "Appraiser Tech-ED", access: "Appraiser Tech-ED", multi: true },
  { key: "type", label: "Employee Type", access: "Employee Type", multi: true },
  { key: "email", label: "Email ID", access: "Email ID", multi: false },
  { key: "doj", label: "Date of Joining", access: "Date of Joining", kind: "date", multi: false },
  { key: "location", label: "Location", access: "Location", multi: true },
  { key: "costCenter", label: "Cost Center", access: "Cost Center", multi: true },
  { key: "orgExp", label: "Wissen Experience", access: "Organization Experience", multi: true },
  { key: "totalExp", label: "Total Experience", access: "Total Experience", multi: true },
  { key: "currentSalary", label: "Current Salary", access: "Current Salary", multi: true },
  { key: "lastAppraisal", label: "Last Appraisal Month/Year", access: "Last Appraisal Month/Year", multi: true },
];

export function ChangeModal({ count, suggestionsFor, onClose, onApply }) {
  const fieldAccess = useScreenFields("employeeMaster");
  const editable = FIELDS.filter((f) => fieldAccess.canEdit(f.access));
  const firstKey = (editable[0] || FIELDS[0]).key;
  const [field, setField] = useState(firstKey);
  const [value, setValue] = useState(firstKey === "status" ? "Active" : "");
  const [remark, setRemark] = useState("");
  const [error, setError] = useState("");

  const def = FIELDS.find((f) => f.key === field);
  const suggestions = def.kind ? [] : suggestionsFor(field);

  const changeField = (key) => {
    setField(key);
    setValue(key === "status" ? "Active" : "");
    setError("");
  };

  const apply = () => {
    if (!String(value).trim()) {
      setError("Enter the new value.");
      return;
    }
    onApply({ field, value: String(value).trim(), remark: remark.trim() });
  };

  return (
    <Shell
      title="Change"
      sub={`${count} employee${count > 1 ? "s" : ""}`}
      onClose={onClose}
      footer={
        <>
          <button type="button" className="em-btn em-btn-ghost" onClick={onClose}>Cancel</button>
          <button type="button" className="em-btn em-btn-primary" onClick={apply}>Apply to {count}</button>
        </>
      }
    >
      <div className="em-field">
        <label>Field</label>
        <select className="em-date-input" value={field} onChange={(e) => changeField(e.target.value)}>
          {editable.map((f) => (
            <option key={f.key} value={f.key} disabled={count > 1 && !f.multi}>
              {f.label}{count > 1 && !f.multi ? " (one employee at a time)" : ""}
            </option>
          ))}
        </select>
      </div>

      <div className="em-field">
        <label>New value</label>
        {def.kind === "status" ? (
          <select className="em-date-input" value={value} onChange={(e) => setValue(e.target.value)}>
            <option>Active</option>
            <option>Inactive</option>
          </select>
        ) : def.kind === "date" ? (
          <input type="date" className="em-date-input" value={value} onChange={(e) => setValue(e.target.value)} />
        ) : (
          <>
            <input
              className={`em-date-input ${error ? "em-bad" : ""}`}
              list="emx-change-list"
              value={value}
              onChange={(e) => { setValue(e.target.value); setError(""); }}
              placeholder="Pick from the list or type"
            />
            <datalist id="emx-change-list">
              {suggestions.map((s) => <option key={s} value={s} />)}
            </datalist>
          </>
        )}
      </div>

      <div className="em-field">
        <label>Remark (optional)</label>
        <input className="em-date-input" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Remark" />
      </div>

      {error && <div className="em-err">{error}</div>}
    </Shell>
  );
}