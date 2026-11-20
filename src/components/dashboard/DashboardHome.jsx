import { useEffect, useRef, useState } from "react";

import { exportRowsToExcel } from "@/lib/table-export";
import { hikeAmount as calcHikeAmount } from "@/lib/appraisal-data";
import { calcHikePct, isPromoted, pctOfBase, ratingOf } from "@/lib/dashboard-overview";
import { DashboardOverview } from "./DashboardOverview";
import { DashboardAnalysis } from "./DashboardAnalysis";
import { useScopedRows } from "./useScopedRows";

import "./overview.css";

/* The home screen: a tab row under the app header (Overview | Dashboard) with
   "My notes" and "Menu" on the right, like the Home mock. The chosen tab is kept
   in the address (?tab=dashboard) so a refresh stays on it, and the "Compare With"
   cycles picked on one tab carry over to the other. */

const TABS = [
  ["overview", "Overview"],
  ["dashboard", "Dashboard"],
];
const NOTES_KEY = "home_notes";

const tabFromUrl = () => {
  try {
    const t = new URLSearchParams(window.location.search).get("tab");
    return TABS.some(([k]) => k === t) ? t : "overview";
  } catch {
    return "overview";
  }
};

const EXPORT_COLUMNS = [
  { header: "Employee ID", value: (r) => r.empId },
  { header: "Name", value: (r) => r.name },
  { header: "Designation", value: (r) => r.designation },
  { header: "Tech-ED", value: (r) => r.appraiserTechED },
  { header: "Comp Manager", value: (r) => r.compManager },
  { header: "Manager Rating", value: (r) => ratingOf(r) || "" },
  { header: "Current Base Pay", value: (r) => Number(r.currentAnnualBasePay) || 0, numFmt: "#,##0" },
  { header: "Hike Amount", value: (r) => calcHikeAmount(r), numFmt: "#,##0" },
  { header: "Hike %", value: (r) => Number(calcHikePct(r).toFixed(2)), numFmt: "0.00" },
  { header: "PB", value: (r) => Number(r.allocatedPBAmount) || 0, numFmt: "#,##0" },
  { header: "PB % of base", value: (r) => Number(pctOfBase(r.allocatedPBAmount, r.currentAnnualBasePay).toFixed(2)), numFmt: "0.00" },
  { header: "RB", value: (r) => Number(r.newRB) || 0, numFmt: "#,##0" },
  { header: "RB % of base", value: (r) => Number(pctOfBase(r.newRB, r.currentAnnualBasePay).toFixed(2)), numFmt: "0.00" },
  { header: "Promoted", value: (r) => (isPromoted(r) ? "Yes" : "No") },
];

export function DashboardHome() {
  const { rows } = useScopedRows();
  const [tab, setTab] = useState(tabFromUrl);
  const [cmp, setCmp] = useState([]); // compared cycle keys, shared by both tabs
  const [pop, setPop] = useState(null); // "notes" | "menu" | null
  const [notes, setNotes] = useState(() => {
    try { return window.localStorage.getItem(NOTES_KEY) || ""; } catch { return ""; }
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const bar = useRef(null);

  const pick = (k) => {
    setTab(k);
    try {
      const url = new URL(window.location.href);
      if (k === "overview") url.searchParams.delete("tab");
      else url.searchParams.set("tab", k);
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    } catch { /* address bar is optional */ }
  };

  // Close the notes / menu pop-ups on an outside click or Escape.
  useEffect(() => {
    if (!pop) return undefined;
    const close = (e) => { if (bar.current && !bar.current.contains(e.target)) setPop(null); };
    const esc = (e) => { if (e.key === "Escape") setPop(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [pop]);

  useEffect(() => {
    if (!msg) return undefined;
    const t = setTimeout(() => setMsg(""), 2600);
    return () => clearTimeout(t);
  }, [msg]);

  const saveNotes = (v) => {
    setNotes(v);
    try { window.localStorage.setItem(NOTES_KEY, v); } catch { /* optional */ }
  };

  const exportExcel = async () => {
    setPop(null);
    if (busy) return;
    if (!rows.length) { setMsg("Nothing to export yet."); return; }
    setBusy(true);
    try {
      const n = await exportRowsToExcel({
        filename: `Dashboard_${new Date().toISOString().slice(0, 10)}`,
        sheetName: "Dashboard",
        columns: EXPORT_COLUMNS,
        rows,
      });
      setMsg(`Exported ${n.toLocaleString("en-IN")} people.`);
    } catch (e) {
      setMsg(`Export failed: ${e?.message || e}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="dhx">
      <div className="dhx-tabrow" ref={bar}>
        <div className="dhx-tabs" role="tablist">
          {TABS.map(([k, label]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              className={`dhx-tab${tab === k ? " on" : ""}`}
              onClick={() => pick(k)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="dhx-right">
          {msg ? <span className="dhx-msg">{msg}</span> : null}
          <div className="dhx-wrap">
            <button type="button" className="dhx-btn" aria-expanded={pop === "notes"} onClick={() => setPop(pop === "notes" ? null : "notes")}>
              My notes
            </button>
            {pop === "notes" ? (
              <div className="dhx-pop dhx-notes">
                <h4>My notes</h4>
                <textarea autoFocus value={notes} placeholder="Write your notes here" onChange={(e) => saveNotes(e.target.value)} />
                <small>Saved in this browser</small>
              </div>
            ) : null}
          </div>
          <div className="dhx-wrap">
            <button type="button" className="dhx-btn pri" aria-expanded={pop === "menu"} onClick={() => setPop(pop === "menu" ? null : "menu")}>
              Menu ▾
            </button>
            {pop === "menu" ? (
              <div className="dhx-pop">
                <button type="button" className="dhx-item" onClick={exportExcel} disabled={busy}>
                  {busy ? "Exporting…" : "Export to Excel"}
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {tab === "overview" ? (
        <DashboardOverview cmp={cmp} onCmpChange={setCmp} />
      ) : (
        <DashboardAnalysis cmp={cmp} onCmpChange={setCmp} />
      )}
    </div>
  );
}