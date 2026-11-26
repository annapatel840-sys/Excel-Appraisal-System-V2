import { useEffect, useMemo, useState } from "react";
import { fetchAllEmployeeMasterEmployees } from "@/lib/employee-master-data";
import { Search, X } from "lucide-react";

/** Dedicated employee picker for Exceptional cycles; Annual's add flow is unchanged. */
export function ExceptionalAddEmployeeModal({ masterEmployees = [], listedIds, onAdd, onClose }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [allMasterEmployees, setAllMasterEmployees] = useState([]);
  const [employeesLoading, setEmployeesLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setEmployeesLoading(true);
    fetchAllEmployeeMasterEmployees({ status: "active" })
      .then((rows) => {
        if (!cancelled) setAllMasterEmployees(Array.isArray(rows) ? rows : []);
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message || "Unable to load active employees from Employee Master.");
      })
      .finally(() => {
        if (!cancelled) setEmployeesLoading(false);
      });
    return () => { cancelled = true; };
  }, []);

  const employees = useMemo(() => {
    const term = query.trim().toLowerCase();
    return allMasterEmployees
      .filter((employee) => String(employee.status || "").trim().toLowerCase() === "active")
      .filter((employee) => !term || `${employee.empId} ${employee.name} ${employee.designation || ""}`.toLowerCase().includes(term))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
  }, [allMasterEmployees, query]);

  const submit = async () => {
    if (!selectedId) {
      setError("Select an employee to add.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await onAdd({ empId: selectedId, eligible: "Yes", eligibleReason: "Exceptional cycle" });
      onClose();
    } catch (err) {
      setError(err?.message || "Unable to add this employee.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="em-modal-overlay" onMouseDown={(event) => event.target === event.currentTarget && !busy && onClose()}>
      <div className="em-modal" style={{ width: "min(720px, calc(100vw - 32px))", maxHeight: "85vh" }}>
        <div className="em-modal-header">
          <div><strong>Add Employee to Exceptional Cycle</strong><div className="em-hint">Select an active employee from Employee Master.</div></div>
          <button type="button" className="em-btn em-btn-ghost" onClick={onClose} disabled={busy} aria-label="Close"><X size={16}/></button>
        </div>
        <div className="em-modal-body">
          <div className="em-search" style={{ width: "100%", marginBottom: 12 }}>
            <Search size={15}/>
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search employee ID or name"/>
          </div>
          <div style={{ maxHeight: 380, overflowY: "auto", border: "1px solid #d9e1ea", borderRadius: 8 }}>
            {employeesLoading ? (
              <div className="em-empty">Loading active employees from Employee Master...</div>
            ) : employees.length ? employees.map((employee) => {
              const active = String(employee.status || "").trim().toLowerCase() === "active";
              const alreadyAdded = listedIds.has(employee.empId);
              const disabled = !active || alreadyAdded;
              return (
                <button key={employee.empId} type="button" disabled={disabled} onClick={() => { setSelectedId(employee.empId); setError(""); }}
                  style={{ display: "flex", width: "100%", textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #edf1f5", background: selectedId === employee.empId ? "#eef5ff" : "#fff", color: disabled ? "#8492a6" : "#172b4d", cursor: disabled ? "not-allowed" : "pointer" }}>
                  <span style={{ flex: 1 }}><b>{employee.empId} - {employee.name}</b><small style={{ display: "block", color: "#62748a" }}>{employee.designation || "—"} · {employee.location || "—"}</small></span>
                  <span>{alreadyAdded ? "Already added" : !active ? "Inactive" : selectedId === employee.empId ? "Selected" : "Select"}</span>
                </button>
              );
            }) : <div className="em-empty">{allMasterEmployees.length ? "No active employees match this search." : "No active employees found in Employee Master."}</div>}
          </div>
          {error && <div className="em-err" style={{ marginTop: 10 }}>{error}</div>}
        </div>
        <div className="em-modal-footer">
          <button type="button" className="em-btn em-btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="button" className="em-btn em-btn-primary" onClick={submit} disabled={busy || employeesLoading || !selectedId}>{busy ? "Adding..." : "Add Selected Employee"}</button>
        </div>
      </div>
    </div>
  );
}
