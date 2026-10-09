import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Plus, Settings2, X } from "lucide-react";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import "./employee-master-ui.css";

const blank = {
  location_name: "",
  location_code: "",
  address: "",
  currency_code: "",
};
const normalize = (x) => ({
  ...x,
  id: String(x.id || ""),
  status:
    String(x.status || "Active").toLowerCase() === "inactive"
      ? "Inactive"
      : "Active",
});

export function LocationMasterControl({
  value = "All",
  onChange,
  ariaLabel = "Filter by location",
  valueKey = "location_name",
  showCurrencyCode = false,
  triggerClassName = "",
  managerOnly = false,
}) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [menu, setMenu] = useState(false);
  const dropdownRef = useRef(null);
  const [modal, setModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(blank);
  const [editing, setEditing] = useState("");
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await payrollCycleRequest("locations");
      setLocations((Array.isArray(data) ? data : []).map(normalize));
      setError("");
    } catch (e) {
      setError(e?.message || "Unable to load Location Master.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!menu) return undefined;

    const closeOnOutsidePointer = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setMenu(false);
      }
    };
    const closeOnEscape = (event) => {
      if (event.key === "Escape") setMenu(false);
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [menu]);

  const save = async (loc) => {
    const payload = {
      id: loc.id || undefined,
      location_name: String(loc.location_name || "").trim(),
      location_code: String(loc.location_code || "")
        .trim()
        .toUpperCase(),
      address: String(loc.address || "").trim(),
      currency_code: String(loc.currency_code || "")
        .trim()
        .toUpperCase(),
      status: loc.status === "Inactive" ? "Inactive" : "Active",
    };
    if (!payload.location_name || !payload.location_code) {
      setError("Location Name and Location Code are required.");
      return;
    }
    setSaving(loc.id || "new");
    setError("");
    try {
      const result = await payrollCycleRequest("locations", {
        method: "POST",
        body: payload,
      });
      await load();
      if (!loc.id) {
        onChange?.(
          valueKey === "location_code"
            ? result?.location_code || payload.location_code
            : result?.location_name || payload.location_name,
        );
      }
      setEditing("");
      setDraft(null);
      setCreating(false);
      setForm(blank);
    } catch (e) {
      setError(e?.message || "Unable to save location.");
    } finally {
      setSaving("");
    }
  };
  const close = () => {
    if (saving) return;
    setModal(false);
    setCreating(false);
    setEditing("");
    setDraft(null);
    setForm(blank);
    setError("");
  };

  useEffect(() => {
    if (!modal) return undefined;
    const closeModalOnEscape = (event) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", closeModalOnEscape);
    return () => document.removeEventListener("keydown", closeModalOnEscape);
  }, [modal, saving]);

  const active = locations.filter((x) => x.status === "Active");

  return (
    <>
      {managerOnly && (
        <section className="em-location-master-page">
          <div className="em-location-master-page-head">
            <div>
              <h2>Location Master</h2>
              <p>Add, edit, and activate or deactivate locations shared across Employee Master, Eligibility List, and Appraisal Cycle Master.</p>
            </div>
            <div className="em-location-master-page-actions">
              <button type="button" className="em-btn em-btn-primary" onClick={() => { setModal(true); setCreating(true); setForm(blank); setError(""); }}>
                Add Location <Plus size={14} />
              </button>
              <button type="button" className="em-btn" onClick={() => { setModal(true); setCreating(false); setError(""); }}>
                Manage Locations <Settings2 size={14} />
              </button>
            </div>
          </div>
          {error && !modal && <div className="em-location-error" role="alert">{error}</div>}
        </section>
      )}
      {!managerOnly && (
      <div className="em-location-control">
        <div className="em-location-dropdown" ref={dropdownRef}>
          <button
            type="button"
            className={`em-status-select em-location-select em-location-trigger ${triggerClassName}`}
            aria-label={ariaLabel}
            aria-expanded={menu}
            disabled={loading}
            onClick={() => setMenu((v) => !v)}
          >
            <span>
              {value === "All"
                ? "All Locations"
                : (locations.find((loc) => String(loc[valueKey]) === String(value))?.location_name || value)}
              {showCurrencyCode && value !== "All" && (() => {
                const selected = locations.find((loc) => String(loc[valueKey]) === String(value));
                return selected
                  ? ` ${selected.currency_code ? `${selected.currency_code} · ` : ""}${selected.location_code || ""}`
                  : "";
              })()}
            </span>
            <ChevronDown size={14} />
          </button>
          {menu && (
            <div className="em-location-menu" role="listbox">
              <button
                type="button"
                role="option"
                aria-selected={value === "All"}
                onClick={() => {
                  onChange?.("All");
                  setMenu(false);
                }}
              >
                <span>All Locations</span>
                {value === "All" && <Check size={14} />}
              </button>
              {active.map((loc) => (
                <button
                  key={loc.id || loc.location_code}
                  type="button"
                  role="option"
                  aria-selected={String(value) === String(loc[valueKey])}
                  onClick={() => {
                    onChange?.(loc[valueKey] || loc.location_name);
                    setMenu(false);
                  }}
                >
                  <span>{loc.location_name}</span>
                  {String(value) === String(loc[valueKey]) && <Check size={14} />}
                </button>
              ))}

            </div>
          )}
        </div>
      </div>
      )}
      {modal && (
        <div
          className="em-location-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <section
            className="em-location-modal em-location-manager"
            role="dialog"
            aria-modal="true"
            aria-labelledby="em-location-modal-title"
          >
            <header className="em-location-modal-header">
              <div>
                <h2 id="em-location-modal-title">
                  {creating ? "Create Location" : "Manage Locations"}
                </h2>
                <p>
                  Changes are saved to Location Master and shared across all
                  three screens.
                </p>
              </div>
              <button
                type="button"
                className="em-btn"
                aria-label="Close"
                disabled={Boolean(saving)}
                onClick={close}
              >
                <X size={16} />
              </button>
            </header>
            {creating ? (
              <form
                className="em-location-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  save({ ...form, status: "Active" });
                }}
              >
                <label>
                  Location Name *
                  <input
                    required
                    maxLength={120}
                    value={form.location_name}
                    onChange={(e) =>
                      setForm((v) => ({ ...v, location_name: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Location Code *
                  <input
                    required
                    maxLength={30}
                    value={form.location_code}
                    onChange={(e) =>
                      setForm((v) => ({
                        ...v,
                        location_code: e.target.value.toUpperCase(),
                      }))
                    }
                  />
                </label>
                <label>
                  Address
                  <input
                    maxLength={250}
                    value={form.address}
                    onChange={(e) =>
                      setForm((v) => ({ ...v, address: e.target.value }))
                    }
                  />
                </label>
                <label>
                  Currency Code
                  <input
                    maxLength={10}
                    value={form.currency_code}
                    onChange={(e) =>
                      setForm((v) => ({
                        ...v,
                        currency_code: e.target.value.toUpperCase(),
                      }))
                    }
                  />
                </label>
                {error && (
                  <div className="em-location-error" role="alert">
                    {error}
                  </div>
                )}
                <footer className="em-location-modal-actions">
                  <button
                    type="button"
                    className="em-btn"
                    onClick={() => setCreating(false)}
                  >
                    Back
                  </button>
                  <button
                    type="submit"
                    className="em-btn em-btn-primary"
                    disabled={Boolean(saving)}
                  >
                    {saving ? "Saving..." : "Create Location"}
                  </button>
                </footer>
              </form>
            ) : (
              <div className="em-location-manager-body">
                <div className="em-location-manager-head">
                  <span>{locations.length} locations</span>
                  <button
                    type="button"
                    className="em-btn em-btn-primary"
                    onClick={() => {
                      setCreating(true);
                      setForm(blank);
                    }}
                  >
                    Add Location
                    <Plus size={14} />
                  </button>
                </div>
                <div className="em-location-table-wrap">
                  <table className="em-location-table">
                    <thead>
                      <tr>
                        <th>Location</th>
                        <th>Code</th>
                        <th>Address</th>
                        <th>Currency</th>
                        <th>Status</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {locations.map((loc) => {
                        const edit = editing === loc.id;
                        const row = edit ? draft : loc;
                        return (
                          <tr key={loc.id || loc.location_code}>
                            {[
                              "location_name",
                              "location_code",
                              "address",
                              "currency_code",
                            ].map((key) => (
                              <td key={key}>
                                {edit ? (
                                  <input
                                    aria-label={key}
                                    value={row[key] || ""}
                                    onChange={(e) =>
                                      setDraft((v) => ({
                                        ...v,
                                        [key]:
                                          key === "location_code" ||
                                          key === "currency_code"
                                            ? e.target.value.toUpperCase()
                                            : e.target.value,
                                      }))
                                    }
                                  />
                                ) : (
                                  loc[key] || "—"
                                )}
                              </td>
                            ))}
                            <td>
                              <span
                                className={`em-location-status ${loc.status.toLowerCase()}`}
                              >
                                {loc.status}
                              </span>
                            </td>
                            <td className="em-location-row-actions">
                              {edit ? (
                                <>
                                  <button
                                    type="button"
                                    className="em-btn em-btn-primary"
                                    disabled={Boolean(saving)}
                                    onClick={() => save(row)}
                                  >
                                    {saving === loc.id ? "Saving..." : "Save"}
                                  </button>
                                  <button
                                    type="button"
                                    className="em-btn"
                                    onClick={() => {
                                      setEditing("");
                                      setDraft(null);
                                    }}
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <>
                                  <button
                                    type="button"
                                    className="em-btn"
                                    disabled={Boolean(saving)}
                                    onClick={() => {
                                      setEditing(loc.id);
                                      setDraft({ ...loc });
                                    }}
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    className="em-btn"
                                    disabled={Boolean(saving)}
                                    onClick={() =>
                                      save({
                                        ...loc,
                                        status:
                                          loc.status === "Active"
                                            ? "Inactive"
                                            : "Active",
                                      })
                                    }
                                  >
                                    {saving === loc.id
                                      ? "Saving..."
                                      : loc.status === "Active"
                                        ? "Deactivate"
                                        : "Activate"}
                                  </button>
                                </>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {!locations.length && (
                        <tr>
                          <td colSpan={6}>No locations found.</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {error && (
                  <div className="em-location-error" role="alert">
                    {error}
                  </div>
                )}
                <footer className="em-location-modal-actions">
                  <button
                    type="button"
                    className="em-btn"
                    onClick={close}
                    disabled={Boolean(saving)}
                  >
                    Close
                  </button>
                </footer>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
