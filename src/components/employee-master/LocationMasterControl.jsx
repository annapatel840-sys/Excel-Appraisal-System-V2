import { useCallback, useEffect, useState } from "react";
import { Plus, X } from "lucide-react";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import "./employee-master-ui.css";

const blankLocation = {
  location_name: "",
  location_code: "",
  address: "",
  currency_code: "",
};

export function LocationMasterControl({
  value = "All",
  onChange,
  canCreate = false,
  ariaLabel = "Filter by location",
}) {
  const [locations, setLocations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [form, setForm] = useState(blankLocation);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadLocations = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await payrollCycleRequest("locations");
      setLocations(Array.isArray(rows) ? rows : []);
      setError("");
    } catch (loadError) {
      setError(loadError?.message || "Unable to load Location Master.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLocations();
  }, [loadLocations]);

  const closeModal = () => {
    if (saving) return;
    setModalOpen(false);
    setForm(blankLocation);
    setError("");
  };

  const createLocation = async (event) => {
    event.preventDefault();
    const payload = {
      location_name: String(form.location_name || "").trim(),
      location_code: String(form.location_code || "").trim().toUpperCase(),
      address: String(form.address || "").trim(),
      currency_code: String(form.currency_code || "").trim().toUpperCase(),
    };
    if (!payload.location_name || !payload.location_code) {
      setError("Location Name and Location Code are required.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const created = await payrollCycleRequest("locations", {
        method: "POST",
        body: payload,
      });
      await loadLocations();
      const newCode = String(created?.location_code || payload.location_code);
      onChange?.(newCode);
      setModalOpen(false);
      setForm(blankLocation);
    } catch (saveError) {
      setError(saveError?.message || "Unable to create location.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="em-location-control">
        <select
          className="em-status-select em-location-select"
          aria-label={ariaLabel}
          value={value}
          disabled={loading}
          onChange={(event) => onChange?.(event.target.value)}
        >
          <option value="All">All Locations</option>
          {locations.map((location) => (
            <option key={location.id || location.location_code} value={location.location_code}>
              {location.location_name}
            </option>
          ))}
        </select>
        {canCreate && (
          <button
            type="button"
            className="em-btn"
            aria-label="Create new location"
            title="Create new location"
            onClick={() => {
              setError("");
              setForm(blankLocation);
              setModalOpen(true);
            }}
          >
            <Plus size={15} />
          </button>
        )}
      </div>

      {modalOpen && (
        <div
          className="em-location-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeModal();
          }}
        >
          <section
            className="em-location-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="em-location-modal-title"
          >
            <header className="em-location-modal-header">
              <div>
                <h2 id="em-location-modal-title">Create Location</h2>
                <p>Add a new row to Location Master.</p>
              </div>
              <button type="button" className="em-btn" aria-label="Close" onClick={closeModal} disabled={saving}>
                <X size={16} />
              </button>
            </header>
            <form onSubmit={createLocation} className="em-location-form">
              <label>
                Location Name *
                <input
                  required
                  value={form.location_name}
                  onChange={(event) => setForm((current) => ({ ...current, location_name: event.target.value }))}
                  placeholder="e.g. Bhubaneswar"
                  maxLength={120}
                />
              </label>
              <label>
                Location Code *
                <input
                  required
                  value={form.location_code}
                  onChange={(event) => setForm((current) => ({ ...current, location_code: event.target.value.toUpperCase() }))}
                  placeholder="e.g. BBSR"
                  maxLength={30}
                />
              </label>
              <label>
                Address
                <input
                  value={form.address}
                  onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                  placeholder="Optional address"
                  maxLength={250}
                />
              </label>
              <label>
                Currency Code
                <input
                  value={form.currency_code}
                  onChange={(event) => setForm((current) => ({ ...current, currency_code: event.target.value.toUpperCase() }))}
                  placeholder="e.g. INR"
                  maxLength={10}
                />
              </label>
              {error && <div className="em-location-error" role="alert">{error}</div>}
              <footer className="em-location-modal-actions">
                <button type="button" className="em-btn" onClick={closeModal} disabled={saving}>Cancel</button>
                <button type="submit" className="em-btn em-btn-primary" disabled={saving}>
                  {saving ? "Saving..." : "Create Location"}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
