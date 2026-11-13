import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./hr-dashboard.css";

import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";
import { invalidatePayrollCycleReads, payrollCycleRequest } from "@/lib/payroll-cycle-api";
import { fetchEligibilityEmployees, invalidateEligibilityEmployees } from "@/lib/employee-master-data";
import { fetchDelegationRoster, invalidateDelegationRoster } from "@/lib/delegation-roster";
import { filterByLocation, isAllLocations, useSelectedLocation } from "@/lib/location-store";
import { isActionNeededStatus, isInactiveStatus, statusOf } from "@/lib/eligibility-rules";
import { useBudget } from "@/lib/budget-store";
import { useLetters } from "@/lib/letters-store";

/*
 * HR Operations -> HR Dashboard.
 *
 * Read-only roll-up of what needs HR's attention, for ONE location (the
 * header's selected location) and that location's cycle. It reads the same
 * sources the other screens read and changes nothing:
 *   Eligibility  -> payrollcycleapi ?resource=eligibility   (same loader as the Eligibility List)
 *   Delegation   -> employeesapi ?view=delegation           (same loader as the Delegation screen)
 *   Requests     -> accessapi  delegation/requests          (Delegation "Pending" approvals)
 *   Budget       -> BudgetProvider (already follows the selected location)
 *   Letters      -> letters store (the Letters screen's own state)
 *   Cycle        -> payrollcycleapi ?resource=cycles
 */

const ACCESS_API_URL = catalystFunctionUrl("accessapi");
const STEPS = ["Upcoming", "Active", "Closed", "Archived"];
const SCREENS = {
  req: { label: "Requests", tab: "delegation", open: "Delegation" },
  elig: { label: "Eligibility", tab: "eligibility", open: "Eligibility List" },
  del: { label: "Delegation", tab: "delegation", open: "Delegation" },
  bud: { label: "Budget not given", tab: "budget-distribution", open: "Budget Distribution" },
  let: { label: "Letters", tab: "letters", open: "Letters" },
};
const ORDER = ["req", "elig", "del", "bud", "let"];
const COLS = ["Screen", "Employee / From", "Type", "Detail", "Tech-ED", "Age", "Resolve in"];
const QUESTIONS = [
  "What needs attention first?",
  "What is oldest?",
  "Who has most open items?",
  "Who has no Comp Manager?",
  "What is pending for Tech-ED?",
];

/* ---------------- helpers ---------------- */
const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ");
// Tech-ED / manager values are a plain name, an id, or "EMP001 - Name".
const keysOf = (v) => {
  const n = norm(v);
  if (!n) return [];
  const m = n.match(/^(\S+)\s*-\s*(.+)$/);
  return m ? [n, m[1], m[2]] : [n];
};
const sameOwner = (a, b) => {
  const kb = keysOf(b);
  return keysOf(a).some((k) => kb.includes(k));
};
const truthy = (v) => v === true || v === 1 || ["true", "1", "yes"].includes(norm(v));
const cycleIdOf = (c) => String(c?.id || c?.appraisal_cycle_id || c?.cycle_id || c?.ROWID || "").trim();
const cycleNameOf = (c) => String(c?.name || c?.cycle_name || c?.appraisal_cycle_name || c?.appraisal_year || "").trim();
const cycleStatusOf = (c) => norm(c?.status ?? c?.cycle_status);

// Same location rule as the header cycle label (current-cycle.js): a cycle with
// no location belongs to "All"; a named location only sees its own cycle.
function cycleMatchesLocation(cycle, selected) {
  const raw = norm(cycle?.location);
  const cl = !raw || raw === "all" || raw === "all locations" ? "all" : raw;
  return isAllLocations(selected) ? cl === "all" : cl === norm(selected);
}
function pickCycle(cycles, selected) {
  const mine = (Array.isArray(cycles) ? cycles : []).filter(
    (c) => !truthy(c?.hidden) && cycleMatchesLocation(c, selected),
  );
  return (
    mine.find((c) => cycleStatusOf(c) === "active" && !truthy(c.archived)) ||
    mine.find((c) => cycleStatusOf(c) === "upcoming") ||
    mine[0] ||
    null
  );
}
function stepOf(cycle) {
  if (!cycle) return -1;
  if (truthy(cycle.archived)) return 3;
  const i = STEPS.findIndex((s) => s.toLowerCase() === cycleStatusOf(cycle));
  return i;
}
function ageDays(value) {
  const t = Date.parse(String(value || "").replace(" ", "T"));
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.floor((Date.now() - t) / 86400000));
}
const inr = (n) => Number(n || 0).toLocaleString("en-IN");
const pct = (n) => Number(n || 0).toFixed(2);
const locOf = (e) => e?.location || e?.rawEmployee?.location || e?.rawEmployee?.work_location || e?.work_location || "";
const C = (t, node) => ({ t: String(t), node: node === undefined ? String(t) : node });
const T = (c) => (c && typeof c === "object" && "t" in c ? c.t : String(c ?? ""));
const N = (c) => (c && typeof c === "object" && "node" in c ? c.node : String(c ?? ""));
const TONE = { Delegation: "b", Budget: "a", Correction: "v", Eligibility: "g" };
const pill = (text, tone) => C(text, <span className={`hrd-pill p-${tone}`}>{text}</span>);

/* ---------------- grid with Excel-style column filters ---------------- */
function Grid({ cols, rows, numCols = [], foot }) {
  const [filt, setFilt] = useState({});
  const [fp, setFp] = useState(null); // { col, x, y }
  const popRef = useRef(null);

  useEffect(() => {
    if (!fp) return undefined;
    const off = (e) => {
      if (popRef.current && !popRef.current.contains(e.target) && !e.target.closest?.(".hrd-fb")) setFp(null);
    };
    document.addEventListener("mousedown", off);
    return () => document.removeEventListener("mousedown", off);
  }, [fp]);

  const visible = rows.filter((r) => Object.keys(filt).every((k) => filt[k].has(T(r[k]))));
  const values = fp ? [...new Set(rows.map((r) => T(r[fp.col])))].sort() : [];

  const setCol = (col, set) => {
    setFilt((f) => {
      const next = { ...f };
      if (set.size === values.length) delete next[col];
      else next[col] = set;
      return next;
    });
  };

  return (
    <>
      <table className="hrd-t">
        <thead>
          <tr>
            {cols.map((c, i) => (
              <th key={c} className={numCols.includes(i) ? "n" : ""}>
                <div className="hrd-th">
                  <span>{c}</span>
                  <button
                    type="button"
                    className={`hrd-fb${filt[i] ? " act" : ""}`}
                    aria-label={`Filter ${c}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      const r = e.currentTarget.getBoundingClientRect();
                      setFp(fp?.col === i ? null : { col: i, x: Math.max(8, Math.min(r.left, window.innerWidth - 232)), y: r.bottom + 4 });
                    }}
                  >
                    ▾
                  </button>
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visible.map((r, ri) => (
            <tr key={ri}>
              {r.map((c, i) => (
                <td key={i} className={numCols.includes(i) ? "n" : ""}>{N(c)}</td>
              ))}
            </tr>
          ))}
          {!visible.length && (
            <tr>
              <td colSpan={cols.length} style={{ textAlign: "center", color: "#6b7280" }}>
                {rows.length ? "No rows match the filter" : "Nothing to show"}
              </td>
            </tr>
          )}
        </tbody>
        {foot && (
          <tfoot>
            <tr>
              {foot.map((c, i) => (
                <td key={i} className={numCols.includes(i) ? "n" : ""}>{c}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {fp && (
        <div className="hrd-fp" ref={popRef} style={{ top: fp.y, left: fp.x }}>
          <div className="ac">
            <button type="button" onClick={() => setCol(fp.col, new Set(values))}>Select all</button>
            <button type="button" onClick={() => setCol(fp.col, new Set())}>Clear</button>
          </div>
          {values.map((v) => {
            const checked = filt[fp.col] ? filt[fp.col].has(v) : true;
            return (
              <label key={v}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const cur = new Set(filt[fp.col] || values);
                    if (cur.has(v)) cur.delete(v);
                    else cur.add(v);
                    setCol(fp.col, cur);
                  }}
                />
                {v || "—"}
              </label>
            );
          })}
        </div>
      )}
    </>
  );
}

/* ---------------- page ---------------- */
export function HrDashboardPage({ onNavigate, canOpen }) {
  const [location] = useSelectedLocation();
  const budget = useBudget();
  const { S: lettersState, version: lettersVersion } = useLetters();

  const [cycle, setCycle] = useState(null);
  const [elig, setElig] = useState(null); // { data, masterEmployees }
  const [roster, setRoster] = useState(null); // raw delegation rows
  const [reqs, setReqs] = useState(null); // raw delegation requests
  const [status, setStatus] = useState({}); // key -> { s: "loading"|"ok"|"error", msg }
  const [checkedAt, setCheckedAt] = useState(null);
  const [sel, setSel] = useState("all");
  const [answer, setAnswer] = useState("");
  const [question, setQuestion] = useState("");
  const seq = useRef(0);
  const budgetReload = useRef(null);
  budgetReload.current = budget.reload;

  const load = useCallback(
    (fresh) => {
      const mine = ++seq.current;
      const live = () => seq.current === mine;
      if (fresh) {
        invalidatePayrollCycleReads();
        invalidateEligibilityEmployees();
        invalidateDelegationRoster();
        try {
          budgetReload.current?.();
        } catch (_) {
          /* budget refreshes on its own when it cannot be reloaded */
        }
      } else {
        // A different location must never show the previous location's numbers.
        setCycle(null);
        setElig(null);
        setRoster(null);
        setReqs(null);
      }
      setStatus({ cycle: { s: "loading" }, elig: { s: "loading" }, del: { s: "loading" }, req: { s: "loading" } });

      const run = (key, task, apply) =>
        task()
          .then((value) => {
            if (!live()) return;
            apply(value);
            setStatus((s) => ({ ...s, [key]: { s: "ok" } }));
          })
          .catch((error) => {
            if (!live()) return;
            setStatus((s) => ({ ...s, [key]: { s: "error", msg: error?.message || "Could not load." } }));
          });

      return Promise.all([
        run("cycle", () => payrollCycleRequest("cycles", { fresh }), (list) => setCycle(pickCycle(list, location) || { none: true })),
        run(
          "elig",
          () => fetchEligibilityEmployees({ page: 1, limit: 100000, search: "", location }),
          (r) => setElig({ data: Array.isArray(r?.data) ? r.data : [], masterEmployees: r?.masterEmployees || [], meta: r?.cycle || {} }),
        ),
        run("del", () => fetchDelegationRoster({ fresh, location }), (rows) => setRoster(Array.isArray(rows) ? rows : [])),
        run(
          "req",
          async () => {
            const response = await catalystFetch(ACCESS_API_URL + "delegation/requests", { method: "GET", cache: "no-store" });
            const payload = await response.json().catch(() => ({}));
            if (!response.ok || !payload.ok) throw new Error(payload.error || "Unable to load requests.");
            return payload.requests || [];
          },
          (list) => setReqs(list),
        ),
      ]).then(() => {
        if (live()) setCheckedAt(new Date());
      });
    },
    [location],
  );

  // Reload whenever the selected location changes, and when a cycle changes.
  useEffect(() => {
    load(false);
    const refresh = () => load(true);
    window.addEventListener("appraisal:cycle-updated", refresh);
    return () => {
      seq.current += 1; // drop answers still in flight
      window.removeEventListener("appraisal:cycle-updated", refresh);
    };
  }, [load]);

  const activeCycle = cycle && !cycle.none ? cycle : null;
  const cycleId = cycleIdOf(activeCycle) || String(elig?.meta?.cycleId || "");
  const cycleName = cycleNameOf(activeCycle) || String(elig?.meta?.cycleName || "");
  const step = stepOf(activeCycle);
  const noCycle = status.cycle?.s === "ok" && !activeCycle;

  /* ---- rows per screen ---- */
  const rowsBy = useMemo(() => {
    const out = { req: [], elig: [], del: [], bud: [], let: [] };

    // Employees of this location (for scoping requests): from the delegation roster.
    const rosterIds = new Set((roster || []).map((r) => norm(r.emp_id || r.employee_id)));

    // Requests: Delegation "Pending" approvals, limited to this location's employees.
    (reqs || []).forEach((q) => {
      if (norm(q.status) !== "pending") return;
      const emp = norm(q.empId || q.rowId);
      if (!isAllLocations(location) && roster && emp && !rosterIds.has(emp)) return;
      const isScreen = norm(q.requestType) === "screen" || norm(q.field) === "screen";
      const fieldLabel = norm(q.field) === "app" || norm(q.field).includes("appraiser") ? "Appraiser Tech-ED" : "Comp Manager";
      out.req.push([
        C("Requests"),
        C(q.empName || q.empId || "—"),
        isScreen ? pill("Screen", "v") : pill("Delegation", TONE.Delegation),
        C(isScreen ? q.reason || "Screen request" : `${fieldLabel}: ${q.oldId || "—"} → ${q.newId || "—"}`),
        C(q.byName || "—"),
        C(ageDays(q.on) == null ? "—" : `${ageDays(q.on)} d`),
        C(SCREENS.req.open, null),
      ]);
    });

    // Eligibility: exactly what the Eligibility List "Action Needed" tab counts
    // (status is neither Active nor Inactive), for this location, minus Removed rows.
    const eligRows = filterByLocation(elig?.data || [], location, locOf).filter(
      (e) => String(e.changeTag || e.eligibilityTag || "") !== "Removed",
    );
    eligRows.filter(isActionNeededStatus).forEach((e) => {
      const row = [
        C("Eligibility"),
        C(e.name || e.empId || "—"),
        pill("Action needed", "a"),
        C(`Status is ${statusOf(e)} — HR to decide`),
        C(e.appraiser || e.rawEmployee?.appraiser_tech_ed || "—"),
        C("—"),
        C(SCREENS.elig.open, null),
      ];
      out.elig.push(row);
    });

    // Delegation: no Comp Manager, or the Comp Manager is no longer active.
    const masters = elig?.masterEmployees || [];
    const statusOfPerson = (value) => {
      const hit = masters.find(
        (m) => sameOwner(value, m.empId) || sameOwner(value, m.name) || sameOwner(value, `${m.empId} - ${m.name}`),
      );
      return hit ? statusOf(hit) : "";
    };
    (roster || []).forEach((r) => {
      const comp = String(r.delegation_comp_manager || r.comp_manager || "").trim();
      const name = r.name || r.emp_name || r.emp_id || "—";
      const te = String(r.appraiser_tech_ed || "").trim() || "—";
      let type = "";
      let detail = "";
      if (!comp) {
        type = "No Comp Manager";
        detail = "Comp Manager cell is blank";
      } else if (isInactiveStatus({ status: statusOfPerson(comp) })) {
        type = "Comp Manager inactive";
        detail = `${comp} is inactive`;
      }
      if (!type) return;
      const row = [C("Delegation"), C(name), pill(type, "a"), C(detail), C(te), C("—"), C(SCREENS.del.open, null)];
      out.del.push(row);
    });

    // Letters: this cycle's letters from the Letters screen's own store.
    if (cycleId) {
      const nameOf = (id) => {
        const r = lettersState.sheet.find((x) => x.id === id);
        return r?.name || r?.v?.name || id;
      };
      lettersState.letters
        .filter((l) => String(l.cycle) === cycleId)
        .forEach((l) => {
          let type = "";
          let detail = "";
          let tone = "";
          if (l.status === "Failed") [type, detail, tone] = ["Failed", "Send failed — resend", "a"];
          else if (l.status === "Reviewed") [type, detail, tone] = ["Reviewed", "Reviewed — ready to send", "b"];
          else if (l.status === "Out of date") [type, detail, tone] = ["Alert", "Appraisal sheet changed after the letter was made", "v"];
          if (!type) return;
          const row = [C("Letters"), C(nameOf(l.emp)), pill(type, tone), C(detail), C("—"), C("—"), C(SCREENS.let.open, null)];
          out.let.push(row);
        });
    }
    return out;
  }, [reqs, roster, elig, location, cycleId, lettersState, lettersVersion]);

  /* ---- Tech-ED budget table (also feeds "Budget not given") ---- */
  const teRows = useMemo(() => {
    const owners = budget.techEdOwners || [];
    const nameFor = (raw) => {
      const hit = owners.find((o) =>
        [o?.employee_id, o?.row_id, o?.ROWID, o?.assignment, o?.name, o?.email].filter(Boolean).some((a) => sameOwner(a, raw)),
      );
      return String(hit?.name || raw || "").trim();
    };
    const wanted = String(budget.activeBudgetCycleId || "");
    const map = new Map();
    (budget.budgetRows || [])
      .filter((r) => !wanted || String(r.appraisal_cycle_id || "") === wanted)
      .forEach((r) => {
        const name = nameFor(r.tech_ed_id);
        if (!name) return;
        const key = norm(name);
        const applied = Number(r.applied_budget || r.updated_budget || r.calculated_budget || 0);
        const prev = map.get(key);
        if (prev && prev.budget) return;
        map.set(key, {
          name,
          team: Number(budget.employeeCounts?.[r.tech_ed_id] || 0),
          budget: applied > 0 ? applied : null,
          used: applied > 0 ? Number(r.utilization_percentage || 0) : null,
        });
      });
    // A Tech-ED with a team but no budget row at all is also "not given".
    const counts = new Map();
    (budget.locationEmployeeRows || []).forEach((e) => {
      const o = String(e.appraiser_tech_ed || e.tech_ed || e.appraiser || "").trim();
      if (!o) return;
      const k = norm(o);
      counts.set(k, { name: o, n: (counts.get(k)?.n || 0) + 1 });
    });
    counts.forEach(({ name, n }) => {
      const known = [...map.values()].some((x) => sameOwner(x.name, name));
      if (!known) map.set(norm(name), { name: nameFor(name), team: n, budget: null, used: null });
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [budget.budgetRows, budget.techEdOwners, budget.activeBudgetCycleId, budget.employeeCounts, budget.locationEmployeeRows]);

  const budgetReady = !budget.loading && !budget.error;
  const budRows = useMemo(() => {
    if (!budgetReady || noCycle) return [];
    return teRows
      .filter((t) => t.budget == null)
      .map((t) => {
        const row = [
          C("Budget"),
          C(t.name),
          pill("Budget not given", "a"),
          C(`No budget allocated${cycleName ? ` for ${cycleName}` : ""}`),
          C(t.name),
          C("—"),
          C(SCREENS.bud.open, null),
        ];
        return row;
      });
  }, [teRows, budgetReady, noCycle, cycleName]);

  const byScreen = { ...rowsBy, bud: budRows };
  const failed = [
    status.elig?.s === "error" && "Eligibility",
    status.del?.s === "error" && "Delegation",
    status.req?.s === "error" && "Requests",
    status.cycle?.s === "error" && "Cycle",
    budget.error && "Budget",
  ].filter(Boolean);
  const errored = { elig: status.elig?.s === "error", del: status.del?.s === "error", req: status.req?.s === "error", bud: Boolean(budget.error), let: false };
  const loading = ["cycle", "elig", "del", "req"].some((k) => status[k]?.s === "loading") || budget.loading;
  const total = ORDER.reduce((a, k) => a + byScreen[k].length, 0);

  const all = useMemo(() => ORDER.flatMap((k) => byScreen[k].map((r) => ({ k, r }))), [byScreen.req, byScreen.elig, byScreen.del, byScreen.bud, byScreen.let]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = all.filter((x) => sel === "all" || x.k === sel);

  const openCell = (k) => (
    canOpen && canOpen(SCREENS[k].tab) === false ? null : (
      <button type="button" className="hrd-btn go" onClick={() => onNavigate?.(SCREENS[k].tab)} disabled={!onNavigate}>
        Open › {SCREENS[k].open}
      </button>
    )
  );
  const gridRows = shown.map(({ k, r }) => r.map((c, i) => (i === 6 ? C(SCREENS[k].open, openCell(k)) : c)));

  /* ---- HR Assistant: answers come from the list on the left ---- */
  const ask = (text) => {
    const q = String(text || "").toLowerCase();
    const days = (x) => {
      const n = parseInt(T(x.r[5]), 10);
      return Number.isNaN(n) ? -1 : n;
    };
    const te = (x) => T(x.r[4]);
    const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
    let out = "";
    const byName = all.filter((x) => q && q.includes(T(x.r[1]).toLowerCase()) && T(x.r[1]).length > 2);
    const teName = [...new Set(all.map(te).filter((n) => n && n !== "—"))].find((n) => q.includes(n.toLowerCase()));
    if (!all.length) out = "Nothing needs attention for this location right now.";
    else if (/pending|waiting|open for/.test(q) && teName) {
      const mine = all.filter((x) => te(x) === teName);
      out = `<b>${esc(teName)}</b> has ${mine.length} open item${mine.length === 1 ? "" : "s"}: ${mine.map((x) => `${esc(T(x.r[1]))} › ${esc(T(x.r[2]))}`).join(", ")}.`;
    } else if (/\bwhy\b|listed|reason/.test(q) && byName.length) {
      out = `<b>${esc(T(byName[0].r[1]))}</b> is listed because: ${byName.map((x) => `${esc(T(x.r[2]))} — ${esc(T(x.r[3]))}`).join("; ")}. Resolve in ${esc(SCREENS[byName[0].k].open)}.`;
    } else if (/no comp manager|without comp|blank/.test(q)) {
      const m = all.filter((x) => T(x.r[2]) === "No Comp Manager");
      out = m.length ? `<b>${m.length}</b>: ${m.map((x) => esc(T(x.r[1]))).join(", ")}.` : "Everyone in this location has a Comp Manager.";
    } else if (/oldest|old|long/.test(q)) {
      const m = all.slice().sort((a, b) => days(b) - days(a))[0];
      out = days(m) < 0 ? "Only some items carry an age (requests do); the others have none to compare." : `Oldest item: <b>${esc(T(m.r[1]))}</b> in ${esc(SCREENS[m.k].label)} (${esc(T(m.r[3]))}), waiting ${esc(T(m.r[5]))}.`;
    } else if (/most|who|tech/.test(q)) {
      const c = {};
      all.forEach((x) => {
        const t = te(x);
        if (t && t !== "—") c[t] = (c[t] || 0) + 1;
      });
      const top = Object.keys(c).sort((a, b) => c[b] - c[a])[0];
      out = top ? `<b>${esc(top)}</b> has the most open items: ${c[top]}.` : "No open item is linked to a Tech-ED.";
    } else if (/first|priority|attention|start/.test(q)) {
      const lead = ORDER.map((k) => [k, byScreen[k].length]).filter(([, n]) => n).sort((a, b) => b[1] - a[1])[0];
      const failedLetters = byScreen.let.filter((r) => T(r[2]) === "Failed").length;
      out = `Largest pile: <b>${lead[1]} in ${esc(SCREENS[lead[0]].label)}</b>.${failedLetters ? ` Also <b>${failedLetters}</b> failed letter(s) to resend.` : ""}`;
    } else {
      const sc = ORDER.find((k) => q.includes(SCREENS[k].label.toLowerCase().split(" ")[0]));
      out = sc ? `<b>${byScreen[sc].length}</b> open in ${esc(SCREENS[sc].label)}.` : "I can answer about oldest items, who has the most, who has no Comp Manager, why someone is listed, and what is pending for a Tech-ED.";
    }
    setAnswer(out);
  };

  const teTotal = teRows.reduce((a, t) => a + t.team, 0);
  const locLabel = isAllLocations(location) ? "All locations" : location;
  const stateText = loading ? "Checking…" : checkedAt ? `Last check: ${checkedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}` : "";

  return (
    <div className="hrd">
      <div className="hrd-ph">
        <div>
          <h2>HR Dashboard</h2>
          <p>
            {locLabel} · {cycleName || (noCycle ? "No cycle for this location" : "…")}
            {activeCycle && ` · ${STEPS[step] || cycleStatusOf(activeCycle) || ""}`}
          </p>
        </div>
        <div className="hrd-dl">
          <div><small>OPEN ACTIONS</small><b>{loading && !total ? "…" : total}</b></div>
        </div>
      </div>

      {noCycle && (
        <div className="hrd-warn">
          {locLabel} has no appraisal cycle yet, so there is nothing to track. Create or activate one in Appraisal Cycle Master.
        </div>
      )}
      {failed.length > 0 && (
        <div className="hrd-warn">
          Could not load: {failed.join(", ")}. Those counts are left out, not shown as zero. Use “Check again”.
        </div>
      )}

      {activeCycle && (
        <div className="hrd-cyc">
          <div className="hrd-stp">
            {STEPS.map((s, i) => (
              <div key={s} className={i < step ? "done" : i === step ? "on" : ""}><i />{s}</div>
            ))}
          </div>
          <span className="hrd-cycname">Cycle<b>{cycleName}</b></span>
        </div>
      )}

      <div className="hrd-cols">
        <div className="hrd-stack">
          <section className="hrd-card">
            <div className="hrd-ch">
              <h3>Needs attention</h3>
              <span className="hrd-cnt">{total}</span>
              <span className="hrd-nt">{locLabel} · found across Requests, Eligibility, Delegation, Budget and Letters</span>
            </div>
            <div className="hrd-ag">
              <span className={`hrd-dot${failed.length ? " w" : ""}`} />
              <div className="hrd-agt">
                <b>HR Assistant checked the screens for {locLabel}.</b> {stateText}
              </div>
              <button type="button" className="hrd-btn" onClick={() => load(true)} disabled={loading}>Check again</button>
            </div>
            <div className="hrd-cb">
              <div className="hrd-strip">
                <button type="button" className={`hrd-pillb${sel === "all" ? " on" : ""}`} onClick={() => setSel("all")}>
                  All <b>{total}</b>
                </button>
                {ORDER.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`hrd-pillb${sel === k ? " on" : ""}${errored[k] ? " e" : byScreen[k].length ? "" : " z"}`}
                    onClick={() => setSel(k)}
                  >
                    {SCREENS[k].label} <b>{errored[k] ? "!" : byScreen[k].length}</b>
                  </button>
                ))}
              </div>
              <div className="hrd-detail">
                {loading && !all.length ? (
                  <div className="hrd-muted">Loading…</div>
                ) : (
                  <Grid key={`${location}|${sel}`} cols={COLS} rows={gridRows} />
                )}
              </div>
            </div>
          </section>

          <section className="hrd-card">
            <div className="hrd-ch">
              <h3>Tech-ED — team and budget</h3>
              <span className="hrd-nt">Budget not given is flagged</span>
            </div>
            {budget.error ? (
              <div className="hrd-muted">Budget could not be loaded. Use “Check again”.</div>
            ) : budget.loading && !teRows.length ? (
              <div className="hrd-muted">Loading…</div>
            ) : !teRows.length ? (
              <div className="hrd-muted">No Tech-ED budget data for {locLabel}.</div>
            ) : (
              <Grid
                key={location}
                cols={["Tech-ED", "Team size", "Budget", "Used"]}
                numCols={[1, 2]}
                rows={teRows.map((t) => [
                  C(t.name),
                  C(t.team),
                  t.budget == null ? pill("Not given", "a") : C(inr(t.budget)),
                  t.used == null
                    ? C("—")
                    : C(
                        `${pct(t.used)}%`,
                        <>
                          <span className="hrd-sb"><i className={t.used > 90 ? "w" : ""} style={{ width: `${Math.min(t.used, 100)}%` }} /></span>
                          {pct(t.used)}%
                        </>,
                      ),
                ])}
                foot={["Total", String(teTotal), "", ""]}
              />
            )}
          </section>
        </div>

        <div className="hrd-stack">
          <section className="hrd-card">
            <div className="hrd-ch"><h3>Ask the HR Assistant</h3></div>
            <div className="hrd-cb hrd-ask">
              <div className="q">
                {QUESTIONS.map((q) => (
                  <button key={q} type="button" onClick={() => ask(q)}>{q}</button>
                ))}
              </div>
              <div className="in">
                <input
                  value={question}
                  placeholder="e.g. why is a name listed, who has no Comp Manager"
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && ask(question)}
                />
                <button type="button" className="hrd-btn go" onClick={() => ask(question)}>Ask</button>
              </div>
              <div
                className="hrd-ans"
                dangerouslySetInnerHTML={{ __html: answer || "Pick a question or type one. Answers come from the list on the left." }}
              />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

export default HrDashboardPage;