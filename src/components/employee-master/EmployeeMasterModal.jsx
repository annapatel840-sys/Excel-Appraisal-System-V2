import { useState } from "react";
import { X } from "lucide-react";

function Shell({ title, sub, onClose, children, footer }) {
  return (
    <div className="em-modal-overlay">
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
      <div className="em-field">
        <label>Exit date (optional)</label>
        <input type="date" className="em-date-input" value={exitDate} onChange={(e) => setExitDate(e.target.value)} />
      </div>
      <div className="em-field">
        <label>Remark (optional)</label>
        <input className="em-date-input" value={remark} onChange={(e) => setRemark(e.target.value)} placeholder="Remark" />
      </div>
      <div className="em-hint">Inactive employees leave the Appraisal Sheet but stay in history.</div>
    </Shell>
  );
}

const FIELDS = [
  { key: "status", label: "Employee Status", kind: "status" },
  { key: "te", label: "Tech-ED/BU Head Name" },
  { key: "director", label: "Director" },
  { key: "appraiser", label: "Appraiser Tech-ED" },
  { key: "reportingManager", label: "Reporting Manager" },
  { key: "dept", label: "Department" },
  { key: "type", label: "Emp Type" },
  { key: "band", label: "Band" },
  { key: "skillType", label: "Skill Type" },
  { key: "recordOwner", label: "Record Owner ID" },
  { key: "exitDate", label: "Exit date", kind: "date" },
];

export function ChangeModal({ count, suggestionsFor, onClose, onApply }) {
  const [field, setField] = useState("status");
  const [value, setValue] = useState("Active");
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
          {FIELDS.map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
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