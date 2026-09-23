import { useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  History,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";

const CURRENT_USER = "Priya Menon";

const INITIAL_CYCLES = [
  {
    id: "c1",
    name: "Mid-Year Review FY25-26",
    start: "2025-10-01",
    end: "2025-11-15",
    status: "Closed",
    remarks: "Mid-year review cycle completed.",
    changedBy: "Priya Menon",
    changedAt: "2026-01-10 10:30",
    archived: true,
  },
  {
    id: "c2",
    name: "Annual Appraisal FY25-26",
    start: "2026-04-01",
    end: "2026-06-30",
    status: "Active",
    remarks: "Annual appraisal currently active.",
    changedBy: "Priya Menon",
    changedAt: "2026-04-01 09:00",
    archived: false,
  },
  {
    id: "c3",
    name: "Annual Appraisal FY26-27",
    start: "2027-04-01",
    end: "2027-06-30",
    status: "Upcoming",
    remarks: "Next annual appraisal cycle.",
    changedBy: "Priya Menon",
    changedAt: "2026-09-23 09:30",
    archived: false,
  },
];

const INITIAL_AUDIT = [
  {
    id: "a0",
    cycle: "Annual Appraisal FY26-27",
    action: "Created cycle",
    changedBy: "Priya Menon",
    changedAt: "2026-09-23 09:30",
    details: "Cycle created as Upcoming.",
  },
  {
    id: "a1",
    cycle: "Annual Appraisal FY25-26",
    action: "End date changed",
    changedBy: "Priya Menon",
    changedAt: "2026-03-25 14:20",
    details: "End date changed to 30-Jun-2026.",
  },
  {
    id: "a2",
    cycle: "Annual Appraisal FY25-26",
    action: "Status changed",
    changedBy: "Priya Menon",
    changedAt: "2026-04-01 09:00",
    details: "Previous active cycle closed.",
  },
  {
    id: "a3",
    cycle: "Annual Appraisal FY25-26",
    action: "Status changed",
    changedBy: "Priya Menon",
    changedAt: "2026-04-01 09:00",
    details: "Cycle activated.",
  },
];

const INITIAL_REMARKS_HISTORY = {
  c1: [
    {
      remarks: "Mid-year review cycle completed.",
      changedBy: "Priya Menon",
      changedAt: "2026-01-10 10:30",
    },
  ],
  c2: [
    {
      remarks: "Annual appraisal currently active.",
      changedBy: "Priya Menon",
      changedAt: "2026-04-01 09:00",
    },
  ],
  c3: [
    {
      remarks: "Next annual appraisal cycle.",
      changedBy: "Priya Menon",
      changedAt: "2026-09-23 09:30",
    },
  ],
};

const formatDate = (value) => {
  if (!value) return "";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const formatDateTime = (value) => {
  if (!value) return "";
  return value;
};

const getNow = () => {
  const now = new Date();
  const date = now.toLocaleDateString("en-CA");
  const time = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  return `${date} ${time}`;
};

const STATUS_CLASS = {
  Upcoming: "acm-status-upcoming",
  Active: "acm-status-active",
  Closed: "acm-status-closed",
};

export function AppraisalCycleMasterPage() {
  const [cycles, setCycles] = useState(INITIAL_CYCLES);
  const [audit, setAudit] = useState(INITIAL_AUDIT);
  const [remarksHistory, setRemarksHistory] = useState(INITIAL_REMARKS_HISTORY);

  const [banner, setBanner] = useState(null);

  const [editCycle, setEditCycle] = useState(null);
  const [remarksCycle, setRemarksCycle] = useState(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [newCycleOpen, setNewCycleOpen] = useState(false);

  const [editForm, setEditForm] = useState({
    name: "",
    start: "",
    end: "",
  });

  const [remarksText, setRemarksText] = useState("");

  const [newForm, setNewForm] = useState({
    name: "",
    start: "",
    end: "",
    remarks: "",
  });

  const activeCycle = useMemo(
    () => cycles.find((cycle) => cycle.status === "Active"),
    [cycles],
  );

  const showBanner = (title, body, error = false) => {
    setBanner({ title, body, error });
  };

  const addAudit = (cycle, action, details) => {
    const now = getNow();

    setAudit((current) => [
      {
        id: `a-${Date.now()}-${Math.random()}`,
        cycle: cycle.name,
        action,
        changedBy: CURRENT_USER,
        changedAt: now,
        details,
      },
      ...current,
    ]);
  };

  const handleStatusChange = (cycleId, nextStatus) => {
    const cycle = cycles.find((item) => item.id === cycleId);

    if (!cycle || cycle.status === nextStatus) {
      return;
    }

    if (nextStatus === "Active") {
      const previousActive = cycles.find(
        (item) => item.status === "Active" && item.id !== cycleId,
      );

      if (previousActive && !previousActive.archived) {
        showBanner(
          "Activation blocked",
          `"${previousActive.name}" is still active and has not been archived. Archive it before activating another cycle.`,
          true,
        );
        return;
      }

      const updated = cycles.map((item) => {
        if (item.id === cycleId) {
          return {
            ...item,
            status: "Active",
            changedBy: CURRENT_USER,
            changedAt: getNow(),
          };
        }

        if (item.status === "Active") {
          return {
            ...item,
            status: "Closed",
            changedBy: CURRENT_USER,
            changedAt: getNow(),
          };
        }

        return item;
      });

      setCycles(updated);

      addAudit(cycle, "Status changed", "Cycle activated.");

      if (previousActive) {
        addAudit(
          previousActive,
          "Status changed",
          "Previous active cycle closed.",
        );
      }

      showBanner(
        "Appraisal cycle activated",
        `${cycle.name} is now Active. Eligibility List generated.`,
      );

      return;
    }

    setCycles((current) =>
      current.map((item) =>
        item.id === cycleId
          ? {
              ...item,
              status: nextStatus,
              changedBy: CURRENT_USER,
              changedAt: getNow(),
            }
          : item,
      ),
    );

    addAudit(
      cycle,
      "Status changed",
      `Cycle status changed from ${cycle.status} to ${nextStatus}.`,
    );

    showBanner("Status updated", `${cycle.name} is now ${nextStatus}.`);
  };

  const openEditCycle = (cycle) => {
    setEditCycle(cycle);
    setEditForm({
      name: cycle.name,
      start: cycle.start,
      end: cycle.end,
    });
  };

  const saveEditCycle = () => {
    if (!editCycle) return;

    const name = editForm.name.trim();

    if (!name || !editForm.start || !editForm.end) {
      showBanner(
        "Validation failed",
        "Cycle name, start date and end date are required.",
        true,
      );
      return;
    }

    if (editForm.end <= editForm.start) {
      showBanner(
        "Validation failed",
        "End date must be after start date.",
        true,
      );
      return;
    }

    const previous = editCycle;

    const updatedCycle = {
      ...previous,
      name,
      start: editForm.start,
      end: editForm.end,
      changedBy: CURRENT_USER,
      changedAt: getNow(),
    };

    setCycles((current) =>
      current.map((item) => (item.id === previous.id ? updatedCycle : item)),
    );

    addAudit(previous, "Cycle edited", "Cycle name or dates updated.");

    setEditCycle(null);

    showBanner(
      "Cycle updated",
      `${updatedCycle.name} was updated successfully.`,
    );
  };

  const openRemarks = (cycle) => {
    setRemarksCycle(cycle);
    setRemarksText(cycle.remarks || "");
  };

  const saveRemarks = () => {
    if (!remarksCycle) return;

    const remarks = remarksText.trim();

    const now = getNow();

    setCycles((current) =>
      current.map((item) =>
        item.id === remarksCycle.id
          ? {
              ...item,
              remarks,
              changedBy: CURRENT_USER,
              changedAt: now,
            }
          : item,
      ),
    );

    setRemarksHistory((current) => ({
      ...current,
      [remarksCycle.id]: [
        {
          remarks,
          changedBy: CURRENT_USER,
          changedAt: now,
        },
        ...(current[remarksCycle.id] || []),
      ],
    }));

    addAudit(remarksCycle, "Remarks changed", "Cycle remarks updated.");

    setRemarksCycle(null);

    showBanner("Remarks updated", `${remarksCycle.name} remarks were saved.`);
  };

  const handleDelete = (cycle) => {
    const today = new Date();
    const startDate = new Date(`${cycle.start}T00:00:00`);

    if (today >= startDate) {
      showBanner(
        "Delete blocked",
        "A cycle can only be deleted before its Start Date.",
        true,
      );
      return;
    }

    const confirmed = window.confirm(
      `Delete "${cycle.name}"? This action cannot be undone.`,
    );

    if (!confirmed) return;

    setCycles((current) => current.filter((item) => item.id !== cycle.id));

    addAudit(cycle, "Cycle deleted", "Cycle deleted before its start date.");

    showBanner("Cycle deleted", `${cycle.name} was deleted.`);
  };

  const createCycle = () => {
    const name = newForm.name.trim();

    if (!name || !newForm.start || !newForm.end) {
      showBanner(
        "Validation failed",
        "Cycle name, start date and end date are required.",
        true,
      );
      return;
    }

    if (newForm.end <= newForm.start) {
      showBanner(
        "Validation failed",
        "End date must be after start date.",
        true,
      );
      return;
    }

    const now = getNow();

    const cycle = {
      id: `c-${Date.now()}`,
      name,
      start: newForm.start,
      end: newForm.end,
      status: "Upcoming",
      remarks: newForm.remarks.trim(),
      changedBy: CURRENT_USER,
      changedAt: now,
      archived: false,
    };

    setCycles((current) => [...current, cycle]);

    setRemarksHistory((current) => ({
      ...current,
      [cycle.id]: [
        {
          remarks: cycle.remarks,
          changedBy: CURRENT_USER,
          changedAt: now,
        },
      ],
    }));

    addAudit(cycle, "Created cycle", "Cycle created as Upcoming.");

    setNewCycleOpen(false);

    setNewForm({
      name: "",
      start: "",
      end: "",
      remarks: "",
    });

    showBanner("Cycle created", `${cycle.name} was created as Upcoming.`);
  };

  return (
    <div className="acm-page">
      <style>{`
        .acm-page {
          width: 100%;
          font-family: Arial, sans-serif;
          color: #172033;
          background: #fff;
        }

        .acm-topbar {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          padding: 14px 18px;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          background: #fff;
          margin-bottom: 14px;
        }

        .acm-title {
          margin: 0;
          font-size: 19px;
          font-weight: 700;
        }

        .acm-subtitle {
          margin: 4px 0 0;
          color: #64748b;
          font-size: 12px;
        }

        .acm-actions {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .acm-btn {
          border: 1px solid #d8dee9;
          background: #fff;
          color: #27364d;
          border-radius: 7px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          gap: 6px;
        }

        .acm-btn:hover {
          background: #f8fafc;
        }

        .acm-btn-primary {
          background: #2563eb;
          border-color: #2563eb;
          color: #fff;
        }

        .acm-btn-primary:hover {
          background: #1d4ed8;
        }

        .acm-banner {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 11px 13px;
          margin-bottom: 14px;
          border: 1px solid #bbf7d0;
          background: #f0fdf4;
          border-radius: 8px;
          font-size: 12px;
        }

        .acm-banner.error {
          border-color: #fecaca;
          background: #fef2f2;
        }

        .acm-banner strong {
          display: block;
          margin-bottom: 2px;
        }

        .acm-banner span {
          color: #475569;
        }

        .acm-banner-close {
          margin-left: auto;
          border: 0;
          background: transparent;
          cursor: pointer;
          font-size: 18px;
          line-height: 1;
        }

        .acm-table-wrap {
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          overflow-x: auto;
          background: #fff;
        }

        .acm-table {
          width: 100%;
          border-collapse: collapse;
          min-width: 920px;
        }

        .acm-table th {
          background: #f8fafc;
          color: #475569;
          font-size: 11px;
          text-align: left;
          padding: 11px 12px;
          border-bottom: 1px solid #e5e7eb;
          white-space: nowrap;
        }

        .acm-table td {
          padding: 11px 12px;
          border-bottom: 1px solid #eef2f7;
          font-size: 12px;
          vertical-align: middle;
        }

        .acm-table tr:last-child td {
          border-bottom: 0;
        }

        .acm-cycle-name {
          font-weight: 700;
          color: #1e293b;
        }

        .acm-muted {
          color: #64748b;
        }

        .acm-status {
          border-radius: 999px;
          padding: 5px 8px;
          font-size: 11px;
          font-weight: 700;
          border: 0;
          cursor: pointer;
        }

        .acm-status-upcoming {
          background: #eff6ff;
          color: #1d4ed8;
        }

        .acm-status-active {
          background: #ecfdf5;
          color: #047857;
        }

        .acm-status-closed {
          background: #f1f5f9;
          color: #475569;
        }

        .acm-select-status {
          border: 1px solid #d8dee9;
          border-radius: 6px;
          padding: 6px 8px;
          font-size: 11px;
          background: #fff;
        }

        .acm-row-actions {
          display: flex;
          align-items: center;
          gap: 5px;
          white-space: nowrap;
        }

        .acm-icon-btn {
          border: 1px solid #e2e8f0;
          background: #fff;
          border-radius: 6px;
          padding: 6px;
          cursor: pointer;
          color: #475569;
          display: inline-flex;
        }

        .acm-icon-btn:hover {
          background: #f8fafc;
        }

        .acm-icon-btn.delete:hover {
          color: #dc2626;
          border-color: #fecaca;
          background: #fef2f2;
        }

        .acm-empty {
          text-align: center;
          padding: 35px;
          color: #64748b;
          font-size: 13px;
        }

        .acm-modal-backdrop {
          position: fixed;
          inset: 0;
          z-index: 1000;
          background: rgba(15, 23, 42, 0.45);
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }

        .acm-modal {
          width: min(560px, 100%);
          max-height: 90vh;
          overflow: auto;
          background: #fff;
          border-radius: 12px;
          box-shadow: 0 20px 50px rgba(15, 23, 42, 0.25);
        }

        .acm-modal-wide {
          width: min(820px, 100%);
        }

        .acm-modal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 15px 17px;
          border-bottom: 1px solid #e5e7eb;
        }

        .acm-modal-header h3 {
          margin: 0;
          font-size: 15px;
        }

        .acm-modal-close {
          border: 0;
          background: transparent;
          cursor: pointer;
          color: #64748b;
        }

        .acm-modal-body {
          padding: 17px;
        }

        .acm-modal-footer {
          display: flex;
          justify-content: flex-end;
          gap: 8px;
          padding: 12px 17px;
          border-top: 1px solid #e5e7eb;
        }

        .acm-form-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 13px;
        }

        .acm-field {
          display: flex;
          flex-direction: column;
          gap: 5px;
        }

        .acm-field.full {
          grid-column: 1 / -1;
        }

        .acm-field label {
          font-size: 11px;
          font-weight: 700;
          color: #475569;
        }

        .acm-field input,
        .acm-field textarea {
          width: 100%;
          box-sizing: border-box;
          border: 1px solid #d8dee9;
          border-radius: 7px;
          padding: 9px 10px;
          font-size: 12px;
          outline: none;
        }

        .acm-field textarea {
          min-height: 90px;
          resize: vertical;
        }

        .acm-history {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }

        .acm-history-item {
          padding: 10px;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          background: #f8fafc;
        }

        .acm-history-item strong {
          display: block;
          font-size: 12px;
          margin-bottom: 4px;
        }

        .acm-history-meta {
          font-size: 10px;
          color: #64748b;
        }

        .acm-audit-table {
          width: 100%;
          border-collapse: collapse;
        }

        .acm-audit-table th,
        .acm-audit-table td {
          padding: 9px;
          border-bottom: 1px solid #e5e7eb;
          text-align: left;
          font-size: 11px;
          vertical-align: top;
        }

        .acm-audit-table th {
          background: #f8fafc;
          color: #475569;
        }

        @media (max-width: 700px) {
          .acm-topbar {
            align-items: flex-start;
            flex-direction: column;
          }

          .acm-form-grid {
            grid-template-columns: 1fr;
          }

          .acm-field.full {
            grid-column: auto;
          }
        }
      `}</style>

      <div className="acm-topbar">
        <div>
          <h2 className="acm-title">Appraisal Cycle Master</h2>
          <p className="acm-subtitle">
            Manage appraisal cycles, activation, remarks and audit history.
          </p>
        </div>

        <div className="acm-actions">
          <button
            type="button"
            className="acm-btn"
            onClick={() => setAuditOpen(true)}
          >
            <History size={14} />
            Audit Trail
          </button>

          <button
            type="button"
            className="acm-btn acm-btn-primary"
            onClick={() => setNewCycleOpen(true)}
          >
            <Plus size={14} />
            New Cycle
          </button>
        </div>
      </div>

      {banner && (
        <div className={`acm-banner ${banner.error ? "error" : ""}`}>
          {banner.error ? (
            <AlertCircle size={17} />
          ) : (
            <CheckCircle2 size={17} />
          )}

          <div>
            <strong>{banner.title}</strong>
            <span>{banner.body}</span>
          </div>

          <button
            type="button"
            className="acm-banner-close"
            onClick={() => setBanner(null)}
          >
            ×
          </button>
        </div>
      )}

      <div className="acm-table-wrap">
        {cycles.length === 0 ? (
          <div className="acm-empty">No appraisal cycles found.</div>
        ) : (
          <table className="acm-table">
            <thead>
              <tr>
                <th>Cycle</th>
                <th>Start</th>
                <th>End</th>
                <th>Status</th>
                <th>Remarks</th>
                <th>Last changed by</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {cycles.map((cycle) => (
                <tr key={cycle.id}>
                  <td>
                    <div className="acm-cycle-name">{cycle.name}</div>
                  </td>

                  <td>{formatDate(cycle.start)}</td>

                  <td>{formatDate(cycle.end)}</td>

                  <td>
                    <select
                      className={`acm-select-status ${STATUS_CLASS[cycle.status] || ""}`}
                      value={cycle.status}
                      onChange={(event) =>
                        handleStatusChange(cycle.id, event.target.value)
                      }
                    >
                      <option value="Upcoming">Upcoming</option>
                      <option value="Active">Active</option>
                      <option value="Closed">Closed</option>
                    </select>
                  </td>

                  <td>
                    <span className="acm-muted">{cycle.remarks || "—"}</span>
                  </td>

                  <td>
                    <div>{cycle.changedBy}</div>
                    <div className="acm-muted">
                      {formatDateTime(cycle.changedAt)}
                    </div>
                  </td>

                  <td>
                    <div className="acm-row-actions">
                      <button
                        type="button"
                        className="acm-icon-btn"
                        title="Edit cycle"
                        onClick={() => openEditCycle(cycle)}
                      >
                        <Pencil size={13} />
                      </button>

                      <button
                        type="button"
                        className="acm-icon-btn"
                        title="Edit remarks"
                        onClick={() => openRemarks(cycle)}
                      >
                        <Clock3 size={13} />
                      </button>

                      <button
                        type="button"
                        className="acm-icon-btn delete"
                        title="Delete cycle"
                        onClick={() => handleDelete(cycle)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editCycle && (
        <div className="acm-modal-backdrop">
          <div className="acm-modal">
            <div className="acm-modal-header">
              <h3>Edit Cycle</h3>

              <button
                type="button"
                className="acm-modal-close"
                onClick={() => setEditCycle(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="acm-modal-body">
              <div className="acm-form-grid">
                <div className="acm-field full">
                  <label>Cycle Name</label>
                  <input
                    value={editForm.name}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="acm-field">
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={editForm.start}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        start: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="acm-field">
                  <label>End Date</label>
                  <input
                    type="date"
                    value={editForm.end}
                    onChange={(event) =>
                      setEditForm((current) => ({
                        ...current,
                        end: event.target.value,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <div className="acm-modal-footer">
              <button
                type="button"
                className="acm-btn"
                onClick={() => setEditCycle(null)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="acm-btn acm-btn-primary"
                onClick={saveEditCycle}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {remarksCycle && (
        <div className="acm-modal-backdrop">
          <div className="acm-modal">
            <div className="acm-modal-header">
              <h3>Edit Remarks</h3>

              <button
                type="button"
                className="acm-modal-close"
                onClick={() => setRemarksCycle(null)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="acm-modal-body">
              <div className="acm-field">
                <label>{remarksCycle.name}</label>

                <textarea
                  value={remarksText}
                  onChange={(event) => setRemarksText(event.target.value)}
                />
              </div>

              <div style={{ marginTop: 18 }}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    marginBottom: 8,
                  }}
                >
                  Remarks History
                </div>

                <div className="acm-history">
                  {(remarksHistory[remarksCycle.id] || []).map(
                    (item, index) => (
                      <div
                        className="acm-history-item"
                        key={`${remarksCycle.id}-${index}`}
                      >
                        <strong>{item.remarks || "No remarks"}</strong>

                        <div className="acm-history-meta">
                          {item.changedBy} · {item.changedAt}
                        </div>
                      </div>
                    ),
                  )}
                </div>
              </div>
            </div>

            <div className="acm-modal-footer">
              <button
                type="button"
                className="acm-btn"
                onClick={() => setRemarksCycle(null)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="acm-btn acm-btn-primary"
                onClick={saveRemarks}
              >
                Save Remarks
              </button>
            </div>
          </div>
        </div>
      )}

      {auditOpen && (
        <div className="acm-modal-backdrop">
          <div className="acm-modal acm-modal-wide">
            <div className="acm-modal-header">
              <h3>Audit Trail</h3>

              <button
                type="button"
                className="acm-modal-close"
                onClick={() => setAuditOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="acm-modal-body">
              <div style={{ overflowX: "auto" }}>
                <table className="acm-audit-table">
                  <thead>
                    <tr>
                      <th>Cycle</th>
                      <th>Action</th>
                      <th>Changed by</th>
                      <th>Changed at</th>
                      <th>Details</th>
                    </tr>
                  </thead>

                  <tbody>
                    {audit.map((item) => (
                      <tr key={item.id}>
                        <td>{item.cycle}</td>
                        <td>{item.action}</td>
                        <td>{item.changedBy}</td>
                        <td>{item.changedAt}</td>
                        <td>{item.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="acm-modal-footer">
              <button
                type="button"
                className="acm-btn"
                onClick={() => setAuditOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {newCycleOpen && (
        <div className="acm-modal-backdrop">
          <div className="acm-modal">
            <div className="acm-modal-header">
              <h3>New Cycle</h3>

              <button
                type="button"
                className="acm-modal-close"
                onClick={() => setNewCycleOpen(false)}
              >
                <X size={18} />
              </button>
            </div>

            <div className="acm-modal-body">
              <div className="acm-form-grid">
                <div className="acm-field full">
                  <label>Cycle Name</label>

                  <input
                    value={newForm.name}
                    onChange={(event) =>
                      setNewForm((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                    placeholder="e.g. Annual Appraisal FY27-28"
                  />
                </div>

                <div className="acm-field">
                  <label>Start Date</label>

                  <input
                    type="date"
                    value={newForm.start}
                    onChange={(event) =>
                      setNewForm((current) => ({
                        ...current,
                        start: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="acm-field">
                  <label>End Date</label>

                  <input
                    type="date"
                    value={newForm.end}
                    onChange={(event) =>
                      setNewForm((current) => ({
                        ...current,
                        end: event.target.value,
                      }))
                    }
                  />
                </div>

                <div className="acm-field full">
                  <label>Remarks</label>

                  <textarea
                    value={newForm.remarks}
                    onChange={(event) =>
                      setNewForm((current) => ({
                        ...current,
                        remarks: event.target.value,
                      }))
                    }
                    placeholder="Optional remarks"
                  />
                </div>
              </div>
            </div>

            <div className="acm-modal-footer">
              <button
                type="button"
                className="acm-btn"
                onClick={() => setNewCycleOpen(false)}
              >
                Cancel
              </button>

              <button
                type="button"
                className="acm-btn acm-btn-primary"
                onClick={createCycle}
              >
                Create Cycle
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AppraisalCycleMasterPage;
