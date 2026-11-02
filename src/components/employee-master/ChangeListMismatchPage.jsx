import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, History, Menu, Search } from "lucide-react";

import { ClientPager, DataGrid, useGridState, useGridView } from "./DataGrid";
import { PanelTab, SidePanel } from "./SidePanel";
import { usePanel } from "./panelStore";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import { useCurrentCycleName } from "@/lib/current-cycle";
import { useCatalystUser } from "@/lib/catalyst-auth";
import "./employee-master-ui.css";

/*
 * HR Operations -> Operation -> Change List & Mismatch
 *
 * Read-only comparison built from data the HR Operations page already has
 * (Employee Master + Eligibility List) and the existing payroll / cycles
 * reads. Nothing here writes to a backend: Accept / Ignore decisions and the
 * audit trail are kept in this browser, per appraisal cycle.
 *
 *  Change list  = what changed in the Employee Master since the Eligibility
 *                 List was made (New / Changed / Removed).
 *  Mismatch     = eligible employees with no payroll data in the active
 *                 cycle, and employees sitting in an open Exceptional cycle.
 */

const PAGE_SIZE = 20;
const TRACKED_FIELDS = [
  ["designation", "Designation"],
  ["compManager", "Comp Manager"],
  ["appraiser", "Tech ED"],
  ["reportingManager", "Reporting Manager"],
  ["status", "Status"],
];

const text = (value) => String(value ?? "").trim();
const norm = (value) => text(value).toLowerCase();
const isActive = (e) =>
  norm(e?.status || e?.rawEmployee?.emp_status || "active") === "active";
const isEligible = (e) => {
  const raw = norm(
    e?.eligibleStatus ??
      e?.rawEmployee?.eligibility_status ??
      e?.rawEmployee?.eligible_status ??
      e?.eligible ??
      "",
  ).replace(/[ _-]+/g, "");
  return ["eligible", "yes", "true", "1"].includes(raw);
};
const shortDate = (value) => {
  const raw = text(value);
  return /^\d{4}-\d{2}-\d{2}/.test(raw) ? raw.slice(0, 10) : raw || "—";
};
const tagOf = (e) =>
  e.changeTag || e.eligibilityTag || (e.manualOverride ? "Changed" : "");
const isActiveCycle = (cycle) =>
  norm(cycle?.status ?? cycle?.cycle_status) === "active" &&
  ![true, 1, "true", "1", "yes"].includes(
    typeof cycle?.archived === "string" ? norm(cycle.archived) : cycle?.archived,
  );

const storeKey = (cycleName, kind) =>
  `cmm.${kind}.v1:${norm(cycleName) || "no-cycle"}`;
const readStore = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
};
const writeStore = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable */
  }
};
const nowLabel = () => new Date().toLocaleString("en-GB");

const TAG_STYLE = {
  New: { background: "#ECFDF3", color: "#15803D" },
  Changed: { background: "#ECE7FB", color: "#5B3FB0" },
  Removed: { background: "#FEF6E7", color: "#B7791F" },
  Pending: { background: "#DCEBFF", color: "#1D4FA8" },
  Open: { background: "#DCEBFF", color: "#1D4FA8" },
  Accepted: { background: "#ECFDF3", color: "#15803D" },
  Ignored: { background: "#F3F4F6", color: "#6B7280" },
  "No payroll data": { background: "#FEF6E7", color: "#B7791F" },
  "In open Exceptional cycle": { background: "#ECE7FB", color: "#5B3FB0" },
};
const Tag = ({ label }) => (
  <span
    style={{
      display: "inline-block",
      borderRadius: 10,
      padding: "2px 9px",
      fontSize: 11,
      fontWeight: 700,
      ...(TAG_STYLE[label] || { background: "#F3F4F6", color: "#6B7280" }),
    }}
  >
    {label}
  </span>
);

function downloadCsv(filename, columns, rows) {
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [columns.map((c) => esc(c.label)).join(",")]
    .concat(rows.map((r) => columns.map((c) => esc(c.get(r))).join(",")))
    .join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

export function ChangeListMismatchPage({
  employees = [], // Employee Master (all employees)
  eligibilityEmployees = [], // Eligibility List of the cycle
  canEdit = true,
  onNavigate,
}) {
  const cycleName = useCurrentCycleName();
  const user = useCatalystUser();
  const userName = text(user?.name || user?.email || user?.email_id) || "HR";

  const [tab, setTab] = useState("chg");
  const [search, setSearch] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [pageByTab, setPageByTab] = useState({ chg: 1, mis: 1 });
  const [selected, setSelected] = useState({ chg: new Set(), mis: new Set() });
  const [ignoreFor, setIgnoreFor] = useState(null); // array of row ids
  const [remark, setRemark] = useState("");
  const [remarkError, setRemarkError] = useState(false);
  const [toast, setToast] = useState("");

  const [panel, updatePanel] = usePanel("cmm");

  /* ---------- decisions + audit (kept in this browser, per cycle) ---------- */
  const decKey = storeKey(cycleName, "decisions");
  const audKey = storeKey(cycleName, "audit");
  const [decisions, setDecisions] = useState(() => readStore(decKey, {}));
  const [audit, setAudit] = useState(() => readStore(audKey, []));
  useEffect(() => {
    setDecisions(readStore(decKey, {}));
    setAudit(readStore(audKey, []));
  }, [decKey, audKey]);

  /* ---------- existing payroll + cycles reads (same calls Payroll Master makes) ---------- */
  const [payroll, setPayroll] = useState({
    loading: true,
    error: "",
    rows: [],
    cycles: [],
  });
  useEffect(() => {
    let active = true;
    Promise.all([payrollCycleRequest("payroll"), payrollCycleRequest("cycles")])
      .then(([rows, cycles]) => {
        if (!active) return;
        setPayroll({
          loading: false,
          error: "",
          rows: Array.isArray(rows) ? rows : [],
          cycles: Array.isArray(cycles) ? cycles : [],
        });
      })
      .catch((error) => {
        if (active)
          setPayroll({
            loading: false,
            error: error?.message || "Could not load payroll data.",
            rows: [],
            cycles: [],
          });
      });
    return () => {
      active = false;
    };
  }, []);

  /* ---------- Change list rows ---------- */
  const changeBase = useMemo(() => {
    if (!eligibilityEmployees.length) return [];
    const master = new Map(employees.map((e) => [norm(e.empId), e]));
    const listed = new Set(eligibilityEmployees.map((e) => norm(e.empId)));
    const out = [];
    const push = (emp, type, field, oldV, newV, date, src) =>
      out.push({
        id: [type, emp.empId, field, oldV, newV].join("|"),
        empId: emp.empId,
        name: emp.name,
        designation: emp.designation,
        type,
        field,
        old: oldV,
        nw: newV,
        date: shortDate(date),
        source: src,
      });

    eligibilityEmployees.forEach((e) => {
      const m = master.get(norm(e.empId));
      const tag = tagOf(e);
      if (tag) {
        push(
          e,
          tag,
          "Eligibility",
          "—",
          e.eligibleReason || (tag === "New" ? "New employee" : tag),
          e.eligibilityUpdatedAt,
          "Eligibility List",
        );
        return;
      }
      if (!m) {
        push(e, "Removed", "Status", text(e.status) || "Active", "Not in Employee Master", "", "Employee Master");
        return;
      }
      TRACKED_FIELDS.forEach(([key, label]) => {
        const a = text(e[key]);
        const b = text(m[key]);
        if (a && b && norm(a) !== norm(b)) {
          push(
            m,
            key === "status" && norm(b) !== "active" ? "Removed" : "Changed",
            label,
            a,
            b,
            m.rawEmployee?.MODIFIEDTIME || m.eligibilityUpdatedAt,
            "Employee Master",
          );
        }
      });
    });

    employees.forEach((m) => {
      if (listed.has(norm(m.empId))) return;
      if (isActive(m) && isEligible(m)) {
        push(m, "New", "—", "—", "New employee", m.doj, "Employee Master");
      }
    });
    return out;
  }, [employees, eligibilityEmployees]);

  /* ---------- Mismatch rows ---------- */
  const mismatchBase = useMemo(() => {
    if (!eligibilityEmployees.length) return [];
    const activeCycle = payroll.cycles.find(isActiveCycle);
    const cycleById = new Map(payroll.cycles.map((c) => [String(c.id), c]));
    const byEmp = new Map();
    payroll.rows.forEach((r) => {
      const key = norm(r.empId);
      if (!key) return;
      if (!byEmp.has(key)) byEmp.set(key, new Set());
      byEmp.get(key).add(String(r.cycleId));
    });

    const out = [];
    eligibilityEmployees.forEach((e) => {
      if (!isActive(e) || !isEligible(e)) return;
      const cycles = byEmp.get(norm(e.empId)) || new Set();
      const exceptional =
        e.inExceptionalCycle ||
        [...cycles].some((id) => {
          const c = cycleById.get(id);
          return (
            c &&
            norm(c.type).startsWith("exceptional") &&
            norm(c.status) === "active"
          );
        });
      const row = (kind, reason) => ({
        id: `${kind}|${e.empId}`,
        empId: e.empId,
        name: e.name,
        designation: e.designation,
        kind,
        reason,
        techEd: text(e.appraiser),
        date: shortDate(e.eligibilityUpdatedAt),
      });
      if (exceptional) out.push(row("ex", "In open Exceptional cycle"));
      else if (
        !payroll.loading &&
        !payroll.error &&
        activeCycle &&
        !cycles.has(String(activeCycle.id))
      )
        out.push(row("np", "No payroll data"));
    });
    return out;
  }, [eligibilityEmployees, payroll]);

  /* ---------- merge decisions ---------- */
  const changeRows = useMemo(
    () =>
      changeBase.map((r) => {
        const d = decisions[r.id];
        return { ...r, status: d?.status || "Pending", remark: d?.remark || "" };
      }),
    [changeBase, decisions],
  );
  const mismatchRows = useMemo(
    () =>
      mismatchBase.map((r) => {
        const d = decisions[r.id];
        return {
          ...r,
          status: d?.status || "Open",
          remark: d?.remark || "",
        };
      }),
    [mismatchBase, decisions],
  );

  /* ---------- grid definitions ---------- */
  const chgDefs = useMemo(
    () => [
      {
        key: "employee",
        label: "Employee",
        w: 250,
        get: (r) => `${r.empId} - ${r.name}`,
        render: (r) => (
          <>
            <div className="emx-e1">
              {r.empId} - {r.name}
            </div>
            <div className="emx-e2">
              {r.type === "New" ? "New employee" : r.field}
            </div>
          </>
        ),
      },
      { key: "type", label: "Change type", w: 110, get: (r) => r.type, render: (r) => <Tag label={r.type} /> },
      { key: "field", label: "Field changed", w: 130, get: (r) => r.field },
      { key: "old", label: "Old value", w: 150, get: (r) => r.old },
      {
        key: "nw",
        label: "New value",
        w: 150,
        get: (r) => r.nw,
        render: (r) => <span style={{ color: "#15803D", fontWeight: 700 }}>{r.nw}</span>,
      },
      { key: "source", label: "Source", w: 140, get: (r) => r.source },
      { key: "date", label: "Date", w: 110, get: (r) => r.date },
      { key: "status", label: "Status", w: 100, get: (r) => r.status, render: (r) => <Tag label={r.status} /> },
    ],
    [],
  );
  const misDefs = useMemo(
    () => [
      {
        key: "employee",
        label: "Employee",
        w: 250,
        get: (r) => `${r.empId} - ${r.name}`,
        render: (r) => (
          <>
            <div className="emx-e1">
              {r.empId} - {r.name}
            </div>
            <div className="emx-e2">{r.designation || "—"}</div>
          </>
        ),
      },
      { key: "reason", label: "Reason", w: 210, get: (r) => r.reason, render: (r) => <Tag label={r.reason} /> },
      { key: "techEd", label: "Tech ED", w: 150, get: (r) => r.techEd },
      { key: "date", label: "Date detected", w: 120, get: (r) => r.date },
      { key: "status", label: "Status", w: 100, get: (r) => r.status, render: (r) => <Tag label={r.status} /> },
    ],
    [],
  );

  const chgGrid = useGridState(chgDefs);
  const misGrid = useGridState(misDefs);
  const isChg = tab === "chg";
  const defs = isChg ? chgDefs : misDefs;
  const grid = isChg ? chgGrid : misGrid;
  const allRows = isChg ? changeRows : mismatchRows;
  const openStatus = isChg ? "Pending" : "Open";

  // Start each grid on its unresolved rows (same default as the design).
  useEffect(() => {
    chgGrid.setFilter("status", { sel: new Set(["Pending"]) });
    misGrid.setFilter("status", { sel: new Set(["Open"]) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const searchPre = useCallback(
    (r) => {
      const term = search.trim().toLowerCase();
      if (!term) return true;
      return (
        norm(r.name).includes(term) || norm(r.empId).includes(term)
      );
    },
    [search],
  );
  const view = useGridView(allRows, defs, grid, searchPre);

  const pages = Math.max(1, Math.ceil(view.length / PAGE_SIZE));
  const page = Math.min(pageByTab[tab], pages);
  const pageRows = view.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const from = view.length ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to = Math.min(view.length, page * PAGE_SIZE);
  const setPage = (p) => setPageByTab((cur) => ({ ...cur, [tab]: p }));
  useEffect(
    () => setPage(1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [grid.filters, grid.sort, search],
  );

  /* ---------- selection ---------- */
  const isOpen = (r) =>
    r.status === openStatus && (isChg || r.kind === "np");
  const sel = selected[tab];
  const selectable = view.filter(isOpen);
  const selectedRows = allRows.filter((r) => sel.has(r.id) && isOpen(r));
  const viewSelected = selectable.filter((r) => sel.has(r.id)).length;
  const allSelected = selectable.length > 0 && viewSelected === selectable.length;
  const setSel = (next) => setSelected((cur) => ({ ...cur, [tab]: next }));
  const toggleRow = (id) => {
    const next = new Set(sel);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSel(next);
  };
  const toggleAll = () => {
    const next = new Set(sel);
    selectable.forEach((r) => (allSelected ? next.delete(r.id) : next.add(r.id)));
    setSel(next);
  };

  /* ---------- actions ---------- */
  const flash = (message) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  };
  const resolve = (ids, status, note) => {
    const list = allRows.filter((r) => ids.includes(r.id) && isOpen(r));
    if (!list.length) return;
    const nextDec = { ...decisions };
    const nextAud = [...audit];
    list.forEach((r) => {
      nextDec[r.id] = { status, remark: note, by: userName, at: nowLabel() };
      nextAud.unshift({
        title:
          status === "Accepted"
            ? "Accepted"
            : `Ignored — ${note}`,
        meta: `${r.name} (${r.empId})`,
        detail: isChg
          ? `${r.type}${r.field !== "—" ? ` · ${r.field}` : ""} · ${r.old} → ${r.nw}`
          : `Mismatch · ${r.reason}`,
        stamp: `${nowLabel()} · ${userName}`,
      });
    });
    setDecisions(nextDec);
    setAudit(nextAud);
    writeStore(decKey, nextDec);
    writeStore(audKey, nextAud);
    setSel(new Set());
    setIgnoreFor(null);
    setRemark("");
    setRemarkError(false);
    flash(`${status} ${list.length} row${list.length === 1 ? "" : "s"}`);
  };
  const askIgnore = (ids) => {
    if (!ids.length) return;
    setIgnoreFor(ids);
    setRemark("");
    setRemarkError(false);
  };
  const confirmIgnore = () => {
    const note = remark.trim();
    if (!note) {
      setRemarkError(true);
      return;
    }
    resolve(ignoreFor || [], "Ignored", note);
  };

  /* ---------- numbers ---------- */
  const count = (rows, status) => rows.filter((r) => r.status === status).length;
  const pendingChg = count(changeRows, "Pending");
  const openMis = mismatchRows.filter((r) => r.status === "Open").length;
  const typeCount = (t) =>
    changeRows.filter((r) => r.status === "Pending" && r.type === t).length;
  const noPayroll = mismatchRows.filter((r) => r.kind === "np" && r.status === "Open").length;
  const exceptional = mismatchRows.filter((r) => r.kind === "ex").length;

  const auditEntries = audit.map((a) => ({
    title: a.title,
    meta: a.meta,
    detail: `${a.detail} — ${a.stamp}`,
  }));

  const exportView = () => {
    downloadCsv(
      `${isChg ? "Change_list" : "Mismatch"}_${text(cycleName) || "cycle"}.csv`,
      defs.map((d) => ({ label: d.label, get: d.get })),
      view,
    );
  };

  const stats = {
    summary: [
      ["Change list · pending", pendingChg],
      ["Change list · accepted", count(changeRows, "Accepted")],
      ["Change list · ignored", count(changeRows, "Ignored")],
      ["Mismatch · open", openMis],
    ],
    sections: [
      {
        title: "Pending changes, by type",
        rows: ["New", "Changed", "Removed"]
          .map((t) => [t, typeCount(t)])
          .filter(([, n]) => n > 0),
      },
    ],
  };

  const emptyNote = !eligibilityEmployees.length
    ? "The Eligibility List for this cycle is empty, so there is nothing to compare yet."
    : isChg
      ? "No changes since the Eligibility List was made."
      : payroll.loading
        ? "Checking payroll data…"
        : payroll.error
          ? `Payroll data could not be loaded (${payroll.error}). Only Exceptional-cycle rows are shown.`
          : "No mismatches found.";

  return (
    <div className="em-eligibility-list">
      {/* ================= HEADER ================= */}
      <div className="em-eligibility-header">
        <div className="em-eligibility-stats">
          <div>
            <strong>{pendingChg + openMis}</strong>
            <span>Unresolved</span>
          </div>
          <div>
            <strong>{pendingChg}</strong>
            <span>
              Change list ({typeCount("New")} New · {typeCount("Changed")} Chg ·{" "}
              {typeCount("Removed")} Rem)
            </span>
          </div>
          <div>
            <strong>{openMis}</strong>
            <span>
              Mismatch ({noPayroll} No payroll · {exceptional} Exceptional)
            </span>
          </div>
          <div>
            <strong>{count(changeRows, "Accepted")}</strong>
            <span>Accepted</span>
          </div>
          <div>
            <strong>{count(changeRows, "Ignored") + count(mismatchRows, "Ignored")}</strong>
            <span>Ignored</span>
          </div>
        </div>

        <div className="em-eligibility-actions">
          <div style={{ display: "flex", gap: 6 }}>
            {[
              ["chg", `Change list (${pendingChg})`],
              ["mis", `Mismatch (${openMis})`],
            ].map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={tab === key}
                onClick={() => {
                  setTab(key);
                  setIgnoreFor(null);
                }}
                className={`rounded-full border px-3 py-1 text-xs ${
                  tab === key
                    ? "border-[#17365d] bg-[#17365d] text-white"
                    : "border-[#d7dce3] bg-white text-slate-700"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="em-search">
            <Search size={14} />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name / ID"
            />
          </div>

          <div
            className="em-menu-wrapper"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              type="button"
              className="em-btn em-btn-primary"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((c) => !c)}
            >
              <Menu size={14} /> Menu ▾
            </button>
            {menuOpen && (
              <div className="em-menu-dropdown" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    updatePanel({ open: true, tab: "aud" });
                  }}
                >
                  <History size={14} /> Audit Trail
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    exportView();
                  }}
                >
                  <Download size={14} /> Export to Excel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ================= TABLE + PANEL ================= */}
      <div className="emx-work">
        <div className="emx-main">
          {canEdit && (
            <div className="emx-selbar">
              <b>{selectedRows.length} selected</b>
              {isChg && (
                <button
                  type="button"
                  className="emx-mini good"
                  disabled={!selectedRows.length}
                  onClick={() => resolve(selectedRows.map((r) => r.id), "Accepted", "")}
                >
                  Accept selected
                </button>
              )}
              <button
                type="button"
                className="emx-mini"
                disabled={!selectedRows.length}
                onClick={() => askIgnore(selectedRows.map((r) => r.id))}
              >
                Ignore selected
              </button>
              {selectedRows.length > 0 && (
                <button type="button" className="emx-mini" onClick={() => setSel(new Set())}>
                  Clear selection
                </button>
              )}
            </div>
          )}

          {ignoreFor && (
            <div
              style={{
                background: "#FEF6E7",
                border: "1px solid #EBD9AE",
                borderRadius: 8,
                padding: "10px 12px",
                marginBottom: 10,
              }}
            >
              <b style={{ color: "#B7791F" }}>Ignore needs a remark.</b>{" "}
              {ignoreFor.length} row{ignoreFor.length > 1 ? "s" : ""} selected.
              <textarea
                value={remark}
                onChange={(event) => {
                  setRemark(event.target.value);
                  setRemarkError(false);
                }}
                placeholder="Remark (mandatory)"
                style={{
                  display: "block",
                  width: "100%",
                  margin: "7px 0",
                  minHeight: 50,
                  border: `1px solid ${remarkError ? "#C0392B" : "#D1D5DB"}`,
                  borderRadius: 6,
                  padding: "7px 9px",
                  background: "#fff",
                }}
              />
              {remarkError && (
                <span style={{ color: "#C0392B", fontSize: 11.5 }}>
                  Enter a remark to ignore.{" "}
                </span>
              )}
              <button type="button" className="emx-mini p" onClick={confirmIgnore}>
                Confirm ignore
              </button>{" "}
              <button type="button" className="emx-mini" onClick={() => setIgnoreFor(null)}>
                Cancel
              </button>
            </div>
          )}

          {toast && (
            <div className="emx-callout" role="status">
              {toast}
            </div>
          )}

          <DataGrid
            key={tab}
            defs={defs}
            grid={grid}
            allRows={allRows}
            rows={pageRows}
            rowKey={(r) => r.id}
            selectable={canEdit}
            selected={sel}
            onToggleRow={toggleRow}
            onToggleAll={toggleAll}
            allSelected={allSelected}
            someSelected={viewSelected > 0}
            canSelectRow={isOpen}
            rowClass={(r) => (r.status === "Ignored" ? "emx-dim" : "")}
            actionHeader="Action"
            renderAction={(r) => {
              if (r.status === "Ignored") return r.remark || "Ignored";
              if (r.status === "Accepted") return "Accepted";
              if (isChg)
                return canEdit ? (
                  <>
                    <button type="button" className="emx-mini good" onClick={() => resolve([r.id], "Accepted", "")}>
                      Accept
                    </button>{" "}
                    <button type="button" className="emx-mini" onClick={() => askIgnore([r.id])}>
                      Ignore
                    </button>
                  </>
                ) : (
                  "—"
                );
              if (r.kind === "np")
                return (
                  <>
                    <button type="button" className="emx-mini" onClick={() => onNavigate?.("payroll-upload")}>
                      Open Upload →
                    </button>
                    {canEdit && (
                      <>
                        {" "}
                        <button type="button" className="emx-mini" onClick={() => askIgnore([r.id])}>
                          Ignore
                        </button>
                      </>
                    )}
                  </>
                );
              return (
                <button type="button" className="emx-mini" onClick={() => onNavigate?.("eligibility")}>
                  Open Eligibility →
                </button>
              );
            }}
            emptyText={emptyNote}
          />

          <ClientPager
            page={page}
            pages={pages}
            from={from}
            to={to}
            total={view.length}
            allTotal={allRows.length}
            onPage={setPage}
            grid={grid}
          />
          <div className="emx-note" style={{ marginTop: 8 }}>
            Compared against the Eligibility List and payroll data of{" "}
            {cycleName || "the active cycle"}. Accept / Ignore decisions are
            recorded on this screen and its audit trail.
          </div>
        </div>

        <SidePanel
          open={panel.open}
          title={isChg ? "Change list" : "Mismatch"}
          tab={panel.tab}
          onTab={(t) => updatePanel({ tab: t })}
          onClose={() => updatePanel({ open: false })}
          defs={defs}
          grid={grid}
          stats={stats}
          audit={auditEntries}
          auditHint="Every Accept and Ignore: user, date and time, employee and change."
        />
        <PanelTab open={panel.open} onOpen={() => updatePanel({ open: true })} />
      </div>
    </div>
  );
}

export default ChangeListMismatchPage;