
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  RefreshCw,
  Save,
  X,
  Plus,
  Trash2,
} from "lucide-react";

import {
  loadDesignationMaster,
  saveDesignationMaster,
} from "@/lib/designation-master-api";

const TYPES = [
  { value: "S", label: "Single" },
  { value: "M", label: "Multiple" },
  { value: "G", label: "Group" },
  { value: "F", label: "Free Select" },
];

const clone = (value) => JSON.parse(JSON.stringify(value));

const emptyState = () => ({
  cycle: null,
  designations: [],
  groups: [],
  options: { S: true, M: true, G: true, F: true },
  audit: [],
});

function getMappingError(row, data) {
  if (row.status !== "Active") return "";

  if (!row.nextType) {
    return "Select a next-designation type.";
  }

  if (!data.options[row.nextType]) {
    return `${row.nextType} is switched off.`;
  }

  if (row.nextType === "S") {
    if (!row.singleNextId) {
      return "Select the next designation.";
    }

    if (String(row.singleNextId) === String(row.id)) {
      return "A designation cannot map to itself.";
    }

    const next = data.designations.find(
      (item) => String(item.id) === String(row.singleNextId),
    );

    if (!next || next.status !== "Active") {
      return "Select an active next designation.";
    }
  }

  if (row.nextType === "M") {
    const ids = row.multipleNextIds || [];

    if (!ids.length) {
      return "Select at least one next designation.";
    }

    if (new Set(ids.map(String)).size !== ids.length) {
      return "Duplicate next designations are not allowed.";
    }

    if (ids.some((id) => String(id) === String(row.id))) {
      return "A designation cannot map to itself.";
    }

    for (const id of ids) {
      const next = data.designations.find(
        (item) => String(item.id) === String(id),
      );

      if (!next || next.status !== "Active") {
        return "All next designations must be active.";
      }
    }
  }

  if (row.nextType === "G") {
    if (!row.groupId) {
      return "Select a group.";
    }

    const group = data.groups.find(
      (item) => String(item.id) === String(row.groupId),
    );

    if (!group) {
      return "Select an existing group.";
    }

    if (!group.memberIds?.length) {
      return "The selected group must have at least one member.";
    }
  }

  return "";
}

function mappingSummary(row, data) {
  if (!row.nextType) return "Not mapped";

  if (!data.options[row.nextType]) {
    return `${row.nextType} is switched off`;
  }

  if (row.nextType === "S") {
    return (
      data.designations.find(
        (item) => String(item.id) === String(row.singleNextId),
      )?.name || "Not mapped"
    );
  }

  if (row.nextType === "M") {
    const names = (row.multipleNextIds || [])
      .map(
        (id) =>
          data.designations.find(
            (item) => String(item.id) === String(id),
          )?.name,
      )
      .filter(Boolean);

    return names.length ? names.join(", ") : "Not mapped";
  }

  if (row.nextType === "G") {
    return (
      data.groups.find(
        (item) => String(item.id) === String(row.groupId),
      )?.name || "Not mapped"
    );
  }

  if (row.nextType === "F") {
    return "Free selection";
  }

  return "Not mapped";
}

export function DesignationMasterPage() {
  const [saved, setSaved] = useState(emptyState);
  const [draft, setDraft] = useState(emptyState);
  const [tab, setTab] = useState("designations");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(true);

  const dirty = useMemo(
    () => JSON.stringify(saved) !== JSON.stringify(draft),
    [saved, draft],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    setNotice("");

    try {
      const result = await loadDesignationMaster();

      const normalized = {
        ...emptyState(),
        ...result,
        options: {
          ...emptyState().options,
          ...(result.options || {}),
        },
        designations: (result.designations || []).map((row) => ({
          ...row,
          id: String(row.id),
          nextType: row.nextType || "",
          singleNextId: row.singleNextId
            ? String(row.singleNextId)
            : "",
          multipleNextIds: (row.multipleNextIds || []).map(String),
          groupId: row.groupId ? String(row.groupId) : "",
          status:
            row.status === true ||
            row.status === 1 ||
            row.status === "1" ||
            row.status === "Active"
              ? "Active"
              : "Inactive",
        })),
        groups: (result.groups || []).map((group) => ({
          ...group,
          id: String(group.id),
          name: group.name || "",
          memberIds: (group.memberIds || []).map(String),
        })),
        audit: result.audit || [],
      };

      setSaved(clone(normalized));
      setDraft(clone(normalized));
    } catch (e) {
      setError(e.message || "Unable to load Designation Master.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateDesignation = (id, patch) => {
    setDraft((current) => ({
      ...current,
      designations: current.designations.map((row) =>
        String(row.id) === String(id)
          ? { ...row, ...patch }
          : row,
      ),
    }));
  };

  const updateGroup = (id, patch) => {
    setDraft((current) => ({
      ...current,
      groups: current.groups.map((group) =>
        String(group.id) === String(id)
          ? { ...group, ...patch }
          : group,
      ),
    }));
  };

  const updateOption = (type, enabled) => {
    setDraft((current) => ({
      ...current,
      options: {
        ...current.options,
        [type]: enabled,
      },
    }));
  };

  const addGroup = () => {
    const name = window.prompt(
      "Enter a unique group name for this cycle:",
    );

    if (name === null) return;

    const cleanName = name.trim();

    if (!cleanName) {
      setError("Group name is required.");
      return;
    }

    const duplicate = draft.groups.some(
      (group) =>
        group.name.trim().toLowerCase() === cleanName.toLowerCase(),
    );

    if (duplicate) {
      setError("Group names must be unique within the current cycle.");
      return;
    }

    setError("");

    setDraft((current) => ({
      ...current,
      groups: [
        ...current.groups,
        {
          id: `new-${Date.now()}`,
          name: cleanName,
          memberIds: [],
          isNew: true,
        },
      ],
    }));
  };

  const deleteGroup = (group) => {
    const inUse = draft.designations.some(
      (row) =>
        row.nextType === "G" &&
        String(row.groupId) === String(group.id),
    );

    if (inUse) {
      setError(
        `Cannot remove "${group.name}" because a designation is mapped to this group.`,
      );
      return;
    }

    if (group.memberIds?.length) {
      const confirmed = window.confirm(
        `Remove group "${group.name}" and its selected members from this unsaved draft?`,
      );

      if (!confirmed) return;
    }

    setError("");

    setDraft((current) => ({
      ...current,
      groups: current.groups.filter(
        (item) => String(item.id) !== String(group.id),
      ),
    }));
  };

  const validate = () => {
    const errors = [];

    if (!Object.values(draft.options).some(Boolean)) {
      errors.push(
        "At least one next-designation type must be enabled.",
      );
    }

    const groupNames = new Set();

    draft.groups.forEach((group) => {
      const name = group.name.trim().toLowerCase();

      if (!name) {
        errors.push("Every group must have a name.");
      }

      if (groupNames.has(name)) {
        errors.push(`Duplicate group name: ${group.name}`);
      }

      groupNames.add(name);

      if (!group.memberIds?.length) {
        errors.push(
          `Group "${group.name}" must have at least one designation.`,
        );
      }

      const invalidMember = group.memberIds.some((id) =>
        !draft.designations.some(
          (row) => String(row.id) === String(id),
        ),
      );

      if (invalidMember) {
        errors.push(
          `Group "${group.name}" contains an invalid designation.`,
        );
      }
    });

    draft.designations.forEach((row) => {
      if (!row.name?.trim()) {
        errors.push("Every designation must have a name.");
        return;
      }

      const mappingError = getMappingError(row, draft);

      if (mappingError) {
        errors.push(`${row.name}: ${mappingError}`);
      }
    });

    return [...new Set(errors)];
  };

  const handleSave = async () => {
    setError("");
    setNotice("");

    const errors = validate();

    if (errors.length) {
      setError(errors.slice(0, 8).join(" "));
      return;
    }

    setSaving(true);

    try {
      await saveDesignationMaster({
        cycleId: draft.cycle?.id,
        designations: draft.designations,
        groups: draft.groups,
        options: draft.options,
      });

      await refresh();
      setNotice("Designation Master saved successfully.");
    } catch (e) {
      setError(e.message || "Unable to save Designation Master.");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    if (
      dirty &&
      !window.confirm("Discard all unsaved changes?")
    ) {
      return;
    }

    setDraft(clone(saved));
    setError("");
    setNotice("");
  };

  const filteredDesignations = draft.designations.filter((row) => {
    const query = search.trim().toLowerCase();

    const matchesSearch =
      !query ||
      [row.name, row.department, row.status].some((value) =>
        String(value || "").toLowerCase().includes(query),
      );

    return (
      matchesSearch &&
      (showInactive || row.status === "Active")
    );
  });

  const notMappedCount = draft.designations.filter(
    (row) => Boolean(getMappingError(row, draft)),
  ).length;

  if (loading) {
    return (
      <>
        <style>{DESIGNATION_MASTER_CSS}</style>
        <div className="designation-master dm-loading">
          <RefreshCw size={18} className="dm-spin" />
          Loading Designation Master…
        </div>
      </>
    );
  }

  return (
    <>
      <style>{DESIGNATION_MASTER_CSS}</style>

      <section className="designation-master">
        <header className="dm-header">
          <div>
            <h1>Designation Master</h1>
            <p>
              Current appraisal cycle:{" "}
              <strong>
                {draft.cycle?.name || "No active cycle found"}
              </strong>
            </p>
          </div>

          <div className="dm-actions">
            <button
              type="button"
              onClick={refresh}
              disabled={saving}
            >
              <RefreshCw size={15} />
              Refresh
            </button>

            <button
              type="button"
              onClick={handleDiscard}
              disabled={!dirty || saving}
            >
              <X size={15} />
              Discard
            </button>

            <button
              type="button"
              className="dm-primary"
              onClick={handleSave}
              disabled={!dirty || saving}
            >
              <Save size={15} />
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </header>

        {error && (
          <div className="dm-message dm-error">
            <AlertCircle size={17} />
            <span>{error}</span>
          </div>
        )}

        {notice && (
          <div className="dm-message dm-success">
            <CheckCircle2 size={17} />
            <span>{notice}</span>
          </div>
        )}

        <div className="dm-stats">
          <div>
            <span>Total designations</span>
            <strong>{draft.designations.length}</strong>
          </div>

          <div>
            <span>Active</span>
            <strong>
              {
                draft.designations.filter(
                  (row) => row.status === "Active",
                ).length
              }
            </strong>
          </div>

          <div>
            <span>Inactive</span>
            <strong>
              {
                draft.designations.filter(
                  (row) => row.status !== "Active",
                ).length
              }
            </strong>
          </div>

          <div>
            <span>Not mapped / invalid</span>
            <strong>{notMappedCount}</strong>
          </div>
        </div>

        <div className="dm-tabs">
          {[
            ["designations", "Designations"],
            ["groups", "Groups"],
            ["options", "Options"],
            ["history", "History"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={tab === value ? "active" : ""}
              onClick={() => setTab(value)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "designations" && (
          <>
            <div className="dm-toolbar">
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search designation or department…"
              />

              <label>
                <input
                  type="checkbox"
                  checked={showInactive}
                  onChange={(event) =>
                    setShowInactive(event.target.checked)
                  }
                />
                Show inactive
              </label>
            </div>

            <div className="dm-table-wrap">
              <table className="dm-table">
                <thead>
                  <tr>
                    <th>Designation</th>
                    <th>Department</th>
                    <th>Next type</th>
                    <th>Next designation / group</th>
                    <th>Status</th>
                    <th>Validation</th>
                  </tr>
                </thead>

                <tbody>
                  {filteredDesignations.map((row) => {
                    const rowError = getMappingError(row, draft);

                    const eligibleNext = draft.designations.filter(
                      (item) =>
                        String(item.id) !== String(row.id) &&
                        item.status === "Active",
                    );

                    return (
                      <tr key={row.id}>
                        <td>
                          <strong>{row.name}</strong>
                          {row.isNew && <small>New</small>}
                        </td>

                        <td>{row.department || "—"}</td>

                        <td>
                          <select
                            value={row.nextType}
                            onChange={(event) => {
                              const nextType = event.target.value;

                              updateDesignation(row.id, {
                                nextType,
                                singleNextId: "",
                                multipleNextIds: [],
                                groupId: "",
                              });
                            }}
                          >
                            <option value="">Select type</option>

                            {TYPES.filter(
                              (type) => draft.options[type.value],
                            ).map((type) => (
                              <option
                                key={type.value}
                                value={type.value}
                              >
                                {type.label}
                              </option>
                            ))}

                            {row.nextType &&
                              !draft.options[row.nextType] && (
                                <option
                                  value={row.nextType}
                                  disabled
                                >
                                  {row.nextType} — switched off
                                </option>
                              )}
                          </select>
                        </td>

                        <td>
                          {row.nextType === "S" && (
                            <select
                              value={row.singleNextId}
                              onChange={(event) =>
                                updateDesignation(row.id, {
                                  singleNextId: event.target.value,
                                })
                              }
                            >
                              <option value="">
                                Select designation
                              </option>

                              {eligibleNext.map((item) => (
                                <option
                                  key={item.id}
                                  value={item.id}
                                >
                                  {item.name}
                                </option>
                              ))}
                            </select>
                          )}

                          {row.nextType === "M" && (
                            <select
                              multiple
                              value={row.multipleNextIds}
                              onChange={(event) =>
                                updateDesignation(row.id, {
                                  multipleNextIds: Array.from(
                                    event.target.selectedOptions,
                                    (option) => option.value,
                                  ),
                                })
                              }
                            >
                              {eligibleNext.map((item) => (
                                <option
                                  key={item.id}
                                  value={item.id}
                                >
                                  {item.name}
                                </option>
                              ))}
                            </select>
                          )}

                          {row.nextType === "G" && (
                            <select
                              value={row.groupId}
                              onChange={(event) =>
                                updateDesignation(row.id, {
                                  groupId: event.target.value,
                                })
                              }
                            >
                              <option value="">Select group</option>

                              {draft.groups.map((group) => (
                                <option
                                  key={group.id}
                                  value={group.id}
                                >
                                  {group.name}
                                </option>
                              ))}
                            </select>
                          )}

                          {row.nextType === "F" && (
                            <span>Free selection</span>
                          )}

                          {!row.nextType && (
                            <span className="dm-muted">
                              Not mapped
                            </span>
                          )}
                        </td>

                        <td>
                          <select
                            value={row.status}
                            onChange={(event) =>
                              updateDesignation(row.id, {
                                status: event.target.value,
                              })
                            }
                          >
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                          </select>
                        </td>

                        <td>
                          {rowError ? (
                            <span className="dm-validation">
                              {rowError}
                            </span>
                          ) : (
                            <span className="dm-valid">Valid</span>
                          )}

                          <small className="dm-mapping-summary">
                            {mappingSummary(row, draft)}
                          </small>
                        </td>
                      </tr>
                    );
                  })}

                  {!filteredDesignations.length && (
                    <tr>
                      <td colSpan="6" className="dm-empty">
                        No designations found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <p className="dm-hint">
              For Multiple, hold Ctrl (Windows) or Command (Mac)
              while selecting multiple designations.
            </p>
          </>
        )}

        {tab === "groups" && (
          <div className="dm-groups">
            <div className="dm-groups-head">
              <h2>Designation Groups</h2>

              <button type="button" onClick={addGroup}>
                <Plus size={15} />
                Add group
              </button>
            </div>

            {draft.groups.map((group) => (
              <article className="dm-group-card" key={group.id}>
                <div className="dm-group-title">
                  <label>
                    Group name
                    <input
                      value={group.name}
                      onChange={(event) =>
                        updateGroup(group.id, {
                          name: event.target.value,
                        })
                      }
                    />
                  </label>

                  <button
                    type="button"
                    className="dm-delete"
                    onClick={() => deleteGroup(group)}
                    title="Remove group from draft"
                  >
                    <Trash2 size={15} />
                    Remove
                  </button>
                </div>

                <div className="dm-member-list">
                  <strong>Members</strong>

                  {draft.designations.map((designation) => (
                    <label
                      key={designation.id}
                      className={
                        designation.status !== "Active"
                          ? "dm-inactive-member"
                          : ""
                      }
                    >
                      <input
                        type="checkbox"
                        checked={group.memberIds.some(
                          (id) =>
                            String(id) === String(designation.id),
                        )}
                        onChange={(event) => {
                          const memberIds = event.target.checked
                            ? [
                                ...new Set([
                                  ...group.memberIds,
                                  designation.id,
                                ]),
                              ]
                            : group.memberIds.filter(
                                (id) =>
                                  String(id) !==
                                  String(designation.id),
                              );

                          updateGroup(group.id, { memberIds });
                        }}
                      />

                      {designation.name}

                      {designation.status !== "Active" &&
                        " (Inactive)"}
                    </label>
                  ))}
                </div>

                <small>
                  {group.memberIds.length} member(s)
                </small>
              </article>
            ))}

            {!draft.groups.length && (
              <p className="dm-empty">
                No groups created for this cycle.
              </p>
            )}
          </div>
        )}

        {tab === "options" && (
          <div className="dm-options">
            <h2>Next-designation options</h2>

            <p>
              Switch off an option to prevent new mappings of
              that type. Existing mappings should be preserved
              by the backend.
            </p>

            {TYPES.map((type) => (
              <label className="dm-option" key={type.value}>
                <span>
                  <strong>{type.label}</strong>
                  <small>Type {type.value}</small>
                </span>

                <input
                  type="checkbox"
                  checked={Boolean(draft.options[type.value])}
                  onChange={(event) =>
                    updateOption(type.value, event.target.checked)
                  }
                />
              </label>
            ))}
          </div>
        )}

        {tab === "history" && (
          <div className="dm-table-wrap">
            <table className="dm-table">
              <thead>
                <tr>
                  <th>Date/time</th>
                  <th>Designation / group</th>
                  <th>Field</th>
                  <th>Old value</th>
                  <th>New value</th>
                  <th>User</th>
                </tr>
              </thead>

              <tbody>
                {(draft.audit || []).map((item) => (
                  <tr key={item.id}>
                    <td>{item.changedAt || "—"}</td>
                    <td>{item.rowName || "—"}</td>
                    <td>{item.field || "—"}</td>
                    <td>{item.oldValue || "—"}</td>
                    <td>{item.newValue || "—"}</td>
                    <td>{item.changedBy || "—"}</td>
                  </tr>
                ))}

                {!draft.audit?.length && (
                  <tr>
                    <td colSpan="6" className="dm-empty">
                      No audit history returned.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

const DESIGNATION_MASTER_CSS = `
  .designation-master {
    color: #17211c;
    padding: 22px;
    background: #f7f9f7;
    min-height: 520px;
    border-radius: 12px;
    font-family: inherit;
  }

  .designation-master *,
  .designation-master *::before,
  .designation-master *::after {
    box-sizing: border-box;
  }

  .dm-header,
  .dm-actions,
  .dm-toolbar,
  .dm-groups-head,
  .dm-group-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .dm-header {
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .dm-header h1 {
    font-size: 24px;
    margin: 0 0 6px;
  }

  .dm-header p,
  .dm-hint,
  .dm-options p {
    color: #64736a;
    margin: 0;
    font-size: 13px;
  }

  .dm-actions button,
  .dm-groups-head button,
  .dm-delete {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    padding: 9px 12px;
    border: 1px solid #d4ddd6;
    border-radius: 8px;
    background: white;
    color: #24372b;
    cursor: pointer;
    font-weight: 600;
    font-size: 13px;
  }

  .dm-actions button:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .dm-actions .dm-primary {
    color: white;
    background: #176b43;
    border-color: #176b43;
  }

  .dm-stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(120px, 1fr));
    gap: 12px;
    margin-bottom: 20px;
  }

  .dm-stats > div {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 15px;
    border: 1px solid #e0e7e1;
    background: white;
    border-radius: 10px;
  }

  .dm-stats span {
    color: #66736b;
    font-size: 12px;
  }

  .dm-stats strong {
    font-size: 23px;
  }

  .dm-tabs {
    display: flex;
    gap: 4px;
    border-bottom: 1px solid #dce4dd;
    margin-bottom: 16px;
    overflow-x: auto;
  }

  .dm-tabs button {
    padding: 12px 16px;
    border: 0;
    border-bottom: 3px solid transparent;
    background: transparent;
    color: #657168;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
  }

  .dm-tabs button.active {
    color: #176b43;
    border-bottom-color: #176b43;
  }

  .dm-toolbar {
    margin-bottom: 14px;
    flex-wrap: wrap;
  }

  .dm-toolbar > input {
    width: min(380px, 100%);
  }

  .dm-toolbar input:not([type="checkbox"]),
  .dm-table input,
  .dm-table select,
  .dm-group-card input:not([type="checkbox"]) {
    padding: 8px 10px;
    border: 1px solid #d5ded7;
    border-radius: 6px;
    background: white;
    color: #17211c;
    min-width: 130px;
    max-width: 100%;
    font: inherit;
    font-size: 13px;
  }

  .dm-toolbar label {
    display: inline-flex;
    gap: 7px;
    align-items: center;
    color: #536258;
    font-size: 13px;
  }

  .dm-table-wrap {
    width: 100%;
    overflow: auto;
    border: 1px solid #e0e7e1;
    border-radius: 10px;
    background: white;
  }

  .dm-table {
    border-collapse: collapse;
    width: 100%;
    min-width: 900px;
    font-size: 13px;
  }

  .dm-table th {
    position: sticky;
    top: 0;
    text-align: left;
    padding: 12px;
    background: #eaf2ec;
    color: #294a35;
    font-weight: 700;
    white-space: nowrap;
  }

  .dm-table td {
    border-top: 1px solid #edf1ed;
    padding: 11px 12px;
    vertical-align: top;
  }

  .dm-table td select {
    width: 100%;
    min-width: 150px;
  }

  .dm-table td select[multiple] {
    min-height: 84px;
  }

  .dm-table small,
  .dm-mapping-summary {
    display: block;
    margin-top: 5px;
    color: #77847b;
    font-size: 11px;
  }

  .dm-validation {
    display: inline-block;
    color: #a72d28;
    background: #fff0ef;
    border-radius: 5px;
    padding: 4px 6px;
    max-width: 230px;
  }

  .dm-valid {
    color: #176b43;
    font-weight: 600;
  }

  .dm-muted,
  .dm-empty {
    color: #758178;
  }

  .dm-empty {
    text-align: center;
    padding: 28px !important;
  }

  .dm-hint {
    margin-top: 10px;
  }

  .dm-message {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    padding: 12px;
    margin-bottom: 14px;
    border-radius: 8px;
    font-size: 13px;
  }

  .dm-error {
    color: #922e28;
    border: 1px solid #efc6c3;
    background: #fff3f2;
  }

  .dm-success {
    color: #176b43;
    border: 1px solid #c6e2cf;
    background: #effaf2;
  }

  .dm-loading {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 28px;
    color: #526158;
  }

  .dm-spin {
    animation: dm-spin 1.2s linear infinite;
  }

  @keyframes dm-spin {
    to { transform: rotate(360deg); }
  }

  .dm-groups,
  .dm-options {
    display: grid;
    gap: 14px;
  }

  .dm-groups-head {
    margin-bottom: 2px;
  }

  .dm-groups-head h2,
  .dm-options h2 {
    margin: 0;
    font-size: 17px;
  }

  .dm-group-card {
    padding: 16px;
    border: 1px solid #e0e7e1;
    border-radius: 10px;
    background: white;
    display: grid;
    gap: 14px;
  }

  .dm-group-card > label,
  .dm-group-title > label {
    display: grid;
    gap: 7px;
    font-size: 12px;
    font-weight: 700;
  }

  .dm-group-card input:not([type="checkbox"]) {
    width: min(360px, 100%);
  }

  .dm-member-list {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 18px;
    align-items: center;
  }

  .dm-member-list > strong {
    width: 100%;
    font-size: 12px;
  }

  .dm-member-list label {
    display: inline-flex;
    gap: 6px;
    align-items: center;
    font-size: 12px;
  }

  .dm-inactive-member {
    color: #9a514c;
  }

  .dm-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 15px;
    padding: 14px 16px;
    border: 1px solid #e0e7e1;
    border-radius: 9px;
    background: white;
  }

  .dm-option span {
    display: grid;
    gap: 4px;
  }

  .dm-option small {
    color: #758178;
    font-size: 11px;
  }

  .dm-delete {
    color: #a72d28;
    flex-shrink: 0;
  }

  @media (max-width: 800px) {
    .designation-master {
      padding: 12px;
    }

    .dm-stats {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .dm-header {
      align-items: flex-start;
    }

    .dm-actions {
      flex-wrap: wrap;
      justify-content: flex-start;
    }

    .dm-group-title {
      align-items: flex-start;
      flex-wrap: wrap;
    }
  }
`;
