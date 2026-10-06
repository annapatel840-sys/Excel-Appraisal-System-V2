import { Fragment, useEffect, useMemo, useState } from "react";

import { useCatalystUser } from "@/lib/catalyst-auth";
import { useAccess } from "@/lib/access-store";
import { useAppraisal } from "@/lib/appraisal-store";
import { useBudget } from "@/lib/budget-store";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";

/* Budget Distribution as a Tech ED sees it (design: Budget Allocation view of
   the "Detail Screen & Budget" prototype).
   - Tech ED budget: the Budget_Master row of the signed-in Tech ED.
   - Comp Managers: the comp_manager values of the Tech ED's team.
   - Budget base per Comp Manager = Current Annual Base Pay + Allocated PB
     Amount of their team; utilised = Hike Amount.
   - The Allot % a Tech ED sets for each Comp Manager, and its audit trail,
     are kept in this browser until the budget API stores them. */

const LEVELS = ["Tech ED", "Comp Manager"];
const BASE_COLUMNS = ["currentAnnualBasePay", "allocatedPBAmount"];
const UTILISED_COLUMNS = [{ key: "hikeAmount", label: "Hike Amount" }];
const NO_CM = "No Comp Manager";

const num = (v) => Number(v) || 0;
const lakh = (n) => "₹ " + (num(n) / 1e5).toFixed(2) + " L";
const norm = (v) => String(v || "").trim().toLowerCase().replace(/\s+/g, " ");
const ownerName = (v) => {
  const m = String(v || "").trim().match(/^\S+\s*-\s*(.+)$/);
  return m ? m[1].trim() : String(v || "").trim();
};
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dateText(iso) {
  const p = String(iso || "").slice(0, 10).split("-");
  return p.length === 3 && MONTHS[Number(p[1]) - 1] ? p[2] + "-" + MONTHS[Number(p[1]) - 1] : iso || "—";
}
function nowParts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return {
    date: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()),
    time: pad(d.getHours()) + ":" + pad(d.getMinutes()),
  };
}

// "EMP0051 - Ashok Kumar" matches the id, the name or the whole value.
function matchesMe(value, ids) {
  const v = norm(value);
  if (!v) return false;
  const m = v.match(/^(\S+)\s*-\s*(.+)$/);
  const candidates = m ? [v, m[1], m[2]] : [v];
  return ids.some((id) => id && candidates.includes(id));
}

const empBase = (e) => BASE_COLUMNS.reduce((s, k) => s + num(e[k]), 0);
const utilisedOf = (list) =>
  list.reduce((s, e) => s + UTILISED_COLUMNS.reduce((t, c) => t + num(e[c.key]), 0), 0);

function readStore(key) {
  try {
    const v = JSON.parse(window.localStorage.getItem(key) || "null");
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}
function writeStore(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: changes last for this visit only */
  }
}

function Chg({ d }) {
  if (Math.abs(d) < 1) return <span className="mut">No change</span>;
  return <span className={d > 0 ? "up" : "down"}>{(d > 0 ? "▲ " : "▼ ") + lakh(Math.abs(d))}</span>;
}

function AuditTable({ list, showName }) {
  if (!list.length) return <div className="muted-small" style={{ padding: "6px 0" }}>No % changes yet.</div>;
  return (
    <div className="bscroll">
      <table className="trail">
        <thead>
          <tr>
            <th>Date</th>
            {showName && <th>Owner</th>}
            <th className="n">Old %</th>
            <th className="n">New %</th>
            <th className="n">Budget before</th>
            <th className="n">Budget after</th>
            <th>Changed by</th>
            <th>Reason</th>
          </tr>
        </thead>
        <tbody>
          {list.map((x, i) => (
            <tr key={i}>
              <td>{dateText(x.date) + (x.time ? " " + x.time : "")}</td>
              {showName && <td style={{ fontWeight: 700 }}>{x.name}</td>}
              <td className="n">{x.from === null ? "—" : x.from + "%"}</td>
              <td className="n" style={{ fontWeight: 700 }}>{x.to}%</td>
              <td className="n">{x.before === null ? "—" : lakh(x.before)}</td>
              <td className="n">{lakh(x.after)}</td>
              <td>{x.by}</td>
              <td>{x.reason || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TechEdBudgetDistribution() {
  const user = useCatalystUser();
  const access = useAccess();
  const { rows: appraisalRows = [], loading: rowsLoading } = useAppraisal();
  const { budgetRows, loading: budgetLoading, error: budgetError } = useBudget();

  const [cycle, setCycle] = useState({ id: "", name: "", loaded: false });
  const [pane, setPane] = useState({ mine: true, alloc: true, audit: true });
  const [appliedOpen, setAppliedOpen] = useState(false);
  const [trailOpen, setTrailOpen] = useState({});
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [auditFilter, setAuditFilter] = useState("all");
  const [drafts, setDrafts] = useState({});

  useEffect(() => {
    let alive = true;
    payrollCycleRequest("cycles")
      .then((list) => {
        const active = (list || []).find((c) => String(c.status).toLowerCase() === "active" && !c.archived);
        if (alive) setCycle({ id: active ? active.id : "", name: active ? active.name : "", loaded: true });
      })
      .catch(() => {
        if (alive) setCycle({ id: "", name: "", loaded: true });
      });
    return () => {
      alive = false;
    };
  }, []);

  const meUser = access.user || {};
  const myName = meUser.name || user?.name || user?.email || "You";
  const ids = useMemo(
    () => [meUser.empId, meUser.name, meUser.email, user?.name, user?.email].map(norm).filter(Boolean),
    [meUser.empId, meUser.name, meUser.email, user?.name, user?.email],
  );

  const budget = useMemo(
    () =>
      budgetRows.find(
        (r) => matchesMe(r.tech_ed_id, ids) && (!cycle.id || !r.appraisal_cycle_id || String(r.appraisal_cycle_id) === String(cycle.id)),
      ) || budgetRows.find((r) => matchesMe(r.tech_ed_id, ids)) || null,
    [budgetRows, ids, cycle.id],
  );

  // The API already limits a Tech ED to their team; keep only rows that name
  // this Tech ED when the column is filled in.
  const team = useMemo(() => {
    const named = appraisalRows.filter((e) => matchesMe(e.appraiserTechED, ids));
    return named.length ? named : appraisalRows;
  }, [appraisalRows, ids]);

  const groups = useMemo(() => {
    const map = new Map();
    team.forEach((e) => {
      const cm = ownerName(e.compManager) || NO_CM;
      if (!map.has(cm)) map.set(cm, []);
      map.get(cm).push(e);
    });
    return [...map.entries()]
      .sort((a, b) => (a[0] === NO_CM) - (b[0] === NO_CM) || a[0].localeCompare(b[0]))
      .map(([name, list]) => ({ name, list, base: list.reduce((s, e) => s + empBase(e), 0), utilised: utilisedOf(list) }));
  }, [team]);

  const myPct = num(budget?.budget_percentage);
  const myOriginal = num(budget?.budget_amount);
  const myUpdated = budget ? num(budget.updated_budget) : 0;
  const allocDate = String(budget?.created_time || budget?.CREATEDTIME || budget?.updated_at || "").slice(0, 10);

  // Allot % per Comp Manager for this cycle, kept per Tech ED.
  const storeKey = "techEdBudget:v1:" + (cycle.id || "cycle") + ":" + (ids[0] || "me");
  // saved.key records which cycle/Tech ED the values belong to.
  const [saved, setSaved] = useState({ key: null, cms: {}, log: [], team0: null });
  useEffect(() => {
    if (!cycle.loaded) return;
    setSaved({ cms: {}, log: [], team0: null, ...(readStore(storeKey) || {}), key: storeKey });
  }, [storeKey, cycle.loaded]);
  const persist = (next) => {
    setSaved(next);
    const { key, ...data } = next;
    if (key) writeStore(key, data);
  };

  // First time a Comp Manager appears: allocate at the Tech ED's own %.
  useEffect(() => {
    if (rowsLoading || budgetLoading || !budget || saved.key !== storeKey) return;
    let changed = false;
    const next = { ...saved, cms: { ...saved.cms }, log: saved.log || [] };
    const today = nowParts().date;
    groups.forEach((g) => {
      if (g.name === NO_CM || next.cms[g.name]) return;
      next.cms[g.name] = { pct0: myPct, pct: myPct, base0: g.base, team0: g.list.length, date0: today };
      changed = true;
    });
    if (next.team0 === null) {
      next.team0 = team.length;
      changed = true;
    }
    if (changed) persist(next);
  }, [groups, team.length, budget, myPct, rowsLoading, budgetLoading, saved, storeKey]);

  const cmNodes = groups
    .filter((g) => g.name !== NO_CM)
    .map((g) => {
      const s = saved.cms[g.name] || { pct0: myPct, pct: myPct, base0: g.base, team0: g.list.length, date0: "" };
      return {
        name: g.name,
        pct: num(s.pct),
        pct0: num(s.pct0),
        base: g.base,
        team0: num(s.team0),
        team: g.list.length,
        original: (num(s.base0) * num(s.pct0)) / 100,
        updated: (g.base * num(s.pct)) / 100,
        utilised: g.utilised,
        date0: s.date0,
      };
    });
  const unassigned = groups.find((g) => g.name === NO_CM);
  const allotted = cmNodes.reduce((s, n) => s + n.updated, 0);
  const used = utilisedOf(team);
  const team0 = saved.team0 === null ? team.length : saved.team0;
  const canAllot = access.canAction("allotNextLevel");

  const auditFor = (names) => {
    const out = [];
    names.forEach((n) => {
      if (n === myName) {
        out.push({ date: allocDate, time: "", name: n, from: null, to: myPct, before: null, after: myOriginal, by: "HR", reason: "Initial allocation" });
        return;
      }
      const c = cmNodes.find((x) => x.name === n);
      if (c) out.push({ date: c.date0, time: "", name: n, from: null, to: c.pct0, before: null, after: c.original, by: myName, reason: "Initial allocation" });
    });
    (saved.log || []).forEach((l) => {
      if (names.includes(l.name)) out.push(l);
    });
    return out.sort((a, b) => String(b.date + b.time).localeCompare(String(a.date + a.time)));
  };

  const historyOf = (n) => (saved.log || []).filter((l) => l.name === n);

  function setPct(name, raw) {
    const node = cmNodes.find((x) => x.name === name);
    if (!node) return;
    const to = Math.round(Number(raw) * 10) / 10;
    setDrafts((d) => {
      const next = { ...d };
      delete next[name];
      return next;
    });
    if (!(to >= 0) || to === node.pct) return;
    const newUpd = (node.base * to) / 100;
    const sum = allotted - node.updated + newUpd;
    if (sum > myUpdated + 0.5) {
      setErr(
        "Blocked: " + to + "% for " + name + " would take total allotted to " + lakh(sum) + ", which is " +
          lakh(sum - myUpdated) + " more than your updated budget of " + lakh(myUpdated) + ".",
      );
      return;
    }
    const t = nowParts();
    const entry = { name, from: node.pct, to, by: myName, date: t.date, time: t.time, before: node.updated, after: newUpd, reason: reason.trim() };
    const next = {
      ...saved,
      cms: { ...saved.cms, [name]: { ...(saved.cms[name] || {}), pct: to } },
      log: [...(saved.log || []), entry],
    };
    persist(next);
    setReason("");
    setErr("");
  }

  const paneHead = (k, title, count) => (
    <button type="button" className="pane-head" aria-expanded={pane[k]} onClick={() => setPane((p) => ({ ...p, [k]: !p[k] }))}>
      <span>
        {title}
        {count ? <span className="cnt">{count}</span> : null}
      </span>
      <span className="chev">{pane[k] ? "▾" : "▸"}</span>
    </button>
  );

  const loading = rowsLoading || budgetLoading || !cycle.loaded;
  const over = myUpdated ? used / myUpdated > 1 : false;
  const usedPct = myUpdated ? (used / myUpdated) * 100 : 0;
  const cmLabel = LEVELS[1] + (cmNodes.length === 1 ? "" : "s");
  const auditNames = [myName, ...cmNodes.map((c) => c.name)];
  let auditList = auditFor(auditNames);
  if (auditFilter !== "all") auditList = auditList.filter((x) => x.name === auditFilter);

  return (
    <div className="tbd-root">
      <style>{CSS}</style>

      {loading ? (
        <div className="card empty">Loading your budget…</div>
      ) : !budget ? (
        <div className="card empty">
          {budgetError || "No budget has been allotted to you for " + (cycle.name || "this cycle") + " yet."}
        </div>
      ) : (
        <>
          <div className="btop">
            <span>
              Appraisal cycle <b>{cycle.name || "—"}</b>
            </span>
            <span className="sep" />
            <span>{allocDate ? "Allocated " + dateText(allocDate) + " by HR" : "Allocated by HR"}</span>
            <span className="sep" />
            <span>
              <b>{LEVELS[0]}</b>
            </span>
            <span className="sep" />
            <span className="applied">
              Budget applied by HR: <b>{myPct}%</b> = <b>{lakh(myUpdated)}</b> updated · original {lakh(myOriginal)}
              <button type="button" className="dd" aria-expanded={appliedOpen} onClick={() => setAppliedOpen((v) => !v)}>
                % history {appliedOpen ? "▴" : "▾"}
              </button>
            </span>
          </div>
          {appliedOpen && (
            <div className="apdrop">
              <AuditTable list={auditFor([myName])} showName={false} />
            </div>
          )}

          <div className="card">
            {paneHead("mine", "My Budget")}
            {pane.mine && (
              <>
                <div className="bsum flat">
                  <div>
                    <div className="f-label">Original allotted</div>
                    <div className="v">{lakh(myOriginal)}</div>
                    <div className="d mut">Fixed at allocation</div>
                  </div>
                  <div>
                    <div className="f-label">Updated budget</div>
                    <div className="v">{lakh(myUpdated)}</div>
                    <div className="d">
                      <Chg d={myUpdated - myOriginal} />
                    </div>
                  </div>
                  <div>
                    <div className="f-label">Team size</div>
                    <div className="v">
                      {team0} → {team.length}
                    </div>
                    <div className="d mut">At allocation → now</div>
                  </div>
                  {cmNodes.length > 0 && (
                    <>
                      <div>
                        <div className="f-label">Allotted to reports</div>
                        <div className="v">{lakh(allotted)}</div>
                      </div>
                      <div>
                        <div className="f-label">Buffer</div>
                        <div className="v">{lakh(myUpdated - allotted)}</div>
                        <div className="d mut">Not passed down</div>
                      </div>
                    </>
                  )}
                  <div>
                    <div className="f-label">Utilised</div>
                    <div className={"v" + (over ? " over" : "")}>
                      {lakh(used)} ({usedPct.toFixed(0)}%)
                    </div>
                    <div className="d">
                      {over ? (
                        <span className="over">▲ {lakh(used - myUpdated)} over</span>
                      ) : (
                        <span className="mut">Remaining {lakh(myUpdated - used)}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="ubar-wide">
                  <div className={"ubar" + (over ? " over" : "")}>
                    <span style={{ width: Math.min(usedPct, 100) + "%" }} />
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="card">
            {paneHead("alloc", "Allocation", cmNodes.length ? cmNodes.length + " " + cmLabel : "")}
            {pane.alloc && (
              <>
                {cmNodes.length > 0 && canAllot && (
                  <div className="reason">
                    <label htmlFor="tbdReason">Reason for next % change</label>
                    <input
                      id="tbdReason"
                      type="text"
                      value={reason}
                      placeholder="Optional — saved in the audit trail"
                      onChange={(e) => setReason(e.target.value)}
                    />
                  </div>
                )}
                {err && (
                  <div className="berr" role="alert">
                    <span>{err}</span>
                    <button type="button" className="link" onClick={() => setErr("")}>
                      Dismiss
                    </button>
                  </div>
                )}
                <div className="bscroll">
                  <table className="bal">
                    <thead>
                      <tr>
                        <th>Level</th>
                        <th>Owner</th>
                        <th className="r">Original Budget</th>
                        <th className="r">Updated Budget</th>
                        <th className="r">Change</th>
                        <th className="r">Original Count</th>
                        <th className="r">Current Count</th>
                        <th>Last Changed</th>
                        <th className="r">Allot %</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="self">
                        <td className="first">{LEVELS[0]}</td>
                        <td>
                          <b>{myName}</b> <span className="muted-small">(you)</span>
                        </td>
                        <td className="r">{lakh(myOriginal)}</td>
                        <td className="r">{lakh(myUpdated)}</td>
                        <td className="r">
                          <ChangeCell from={myOriginal} to={myUpdated} />
                        </td>
                        <td className="r">{team0}</td>
                        <td className="r">{team.length}</td>
                        <td>
                          <span className="mut">—</span>
                        </td>
                        <td className="r">
                          <span className="mut">{myPct}%</span>
                        </td>
                      </tr>
                      {cmNodes.map((n, i) => {
                        const hist = historyOf(n.name);
                        const open = !!trailOpen[n.name];
                        return (
                          <Fragment key={n.name}>
                            <tr className={i > 0 ? "grp" : ""}>
                              <td>
                                <span style={{ display: "inline-block", width: 18 }} />
                                {LEVELS[1]}
                              </td>
                              <td>
                                <b>{n.name}</b>
                              </td>
                              <td className="r">{lakh(n.original)}</td>
                              <td className="r">{lakh(n.updated)}</td>
                              <td className="r">
                                <ChangeCell from={n.original} to={n.updated} />
                              </td>
                              <td className="r">{n.team0}</td>
                              <td className="r">{n.team}</td>
                              <td>
                                {hist.length ? (
                                  <button
                                    type="button"
                                    className="dd"
                                    aria-expanded={open}
                                    title={(open ? "Hide" : "Show") + " budget history"}
                                    onClick={() => setTrailOpen((t) => ({ ...t, [n.name]: !t[n.name] }))}
                                  >
                                    {dateText(hist[hist.length - 1].date)} {open ? "▴" : "▾"}
                                  </button>
                                ) : (
                                  <span className="mut">—</span>
                                )}
                              </td>
                              <td className="r">
                                {canAllot ? (
                                  <input
                                    className="pct-in"
                                    type="number"
                                    min="0"
                                    step="0.1"
                                    aria-label={"Allot % for " + n.name}
                                    value={drafts[n.name] ?? n.pct}
                                    onChange={(e) => setDrafts((d) => ({ ...d, [n.name]: e.target.value }))}
                                    onBlur={(e) => setPct(n.name, e.target.value)}
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") e.currentTarget.blur();
                                    }}
                                  />
                                ) : (
                                  <span className="mut">{n.pct}%</span>
                                )}
                              </td>
                            </tr>
                            {open && hist.length > 0 && (
                              <tr className="tr">
                                <td colSpan={9}>
                                  <table className="trail" style={{ maxWidth: 640 }}>
                                    <thead>
                                      <tr>
                                        <th>Date</th>
                                        <th className="n">Old %</th>
                                        <th className="n">New %</th>
                                        <th className="n">Budget before</th>
                                        <th className="n">Budget after</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {hist.map((x, k) => (
                                        <tr key={k}>
                                          <td>{dateText(x.date) + " " + x.time}</td>
                                          <td className="n">{x.from}%</td>
                                          <td className="n">{x.to}%</td>
                                          <td className="n">{lakh(x.before)}</td>
                                          <td className="n">{lakh(x.after)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                      {unassigned && (
                        <tr className="grp">
                          <td>
                            <span style={{ display: "inline-block", width: 18 }} />
                            {LEVELS[1]}
                          </td>
                          <td className="mut">
                            {NO_CM} · {unassigned.list.length} employee{unassigned.list.length === 1 ? "" : "s"}
                          </td>
                          <td className="r mut" colSpan={7}>
                            Set a Comp. Manager on the Appraisal Sheet to allot budget for them
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {cmNodes.length > 0 && (
                  <div className="note">
                    Budget base = Current Annual Base Pay + Allocated PB Amount of each Comp Manager's team · Utilised ={" "}
                    {UTILISED_COLUMNS.map((c) => c.label).join(" + ")}
                  </div>
                )}
              </>
            )}
          </div>

          {cmNodes.length > 0 && (
            <div className="card">
              {paneHead("audit", "% Applied — audit trail (you and your " + cmLabel + ")")}
              {pane.audit && (
                <>
                  <div className="reason">
                    <label>
                      Owner{" "}
                      <select value={auditFilter} onChange={(e) => setAuditFilter(e.target.value)}>
                        <option value="all">All</option>
                        {auditNames.map((n) => (
                          <option key={n}>{n}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <div className="audit-wrap">
                    <AuditTable list={auditList} showName />
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function ChangeCell({ from, to }) {
  const d = to - from;
  if (Math.abs(d) < 1) return <span className="mut">—</span>;
  const p = from ? (d / from) * 100 : 0;
  return (
    <>
      <Chg d={d} /> <span className={d > 0 ? "up" : "down"}>({(d > 0 ? "+" : "") + p.toFixed(1)}%)</span>
    </>
  );
}

const CSS = `
.tbd-root { max-width: 1320px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 8px;
  font-family: "IBM Plex Sans", "Segoe UI", Arial, Helvetica, sans-serif; font-size: 12.5px; color: #0f1f33; font-variant-numeric: tabular-nums; }
.tbd-root * { box-sizing: border-box; }
.tbd-root .mut { color: #64748b; }
.tbd-root .muted-small { font-size: 11px; color: #475569; }
.tbd-root .up { color: #15803d; } .tbd-root .down { color: #c2410c; } .tbd-root .over { color: #c2410c; font-weight: 700; }
.tbd-root .card { background: #fff; border: 1px solid #d3dbe6; border-radius: 10px; box-shadow: 0 1px 2px rgba(18,48,79,.06); overflow: hidden; }
.tbd-root .card.empty { padding: 22px 16px; color: #64748b; }
.tbd-root .btop { background: #fff; border: 1px solid #d4dbe5; border-left: 4px solid #14a3a3; border-radius: 8px; display: flex; gap: 16px;
  align-items: center; flex-wrap: wrap; padding: 8px 14px; color: #334155; }
.tbd-root .btop .sep { width: 1px; align-self: stretch; background: #d7dce3; }
.tbd-root .applied { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.tbd-root .applied b, .tbd-root .btop b { color: #12304f; }
.tbd-root .apdrop { background: #f7f9fc; border: 1px solid #d4dbe5; border-radius: 8px; padding: 8px 14px; animation: tbd-pull 160ms ease-out; }
.tbd-root .pane-head { width: 100%; display: flex; align-items: center; justify-content: space-between; background: #12304f; color: #fff; border: 0;
  padding: 10px 16px; font-family: inherit; font-size: 13.5px; font-weight: 600; letter-spacing: .15px; cursor: pointer; text-align: left; }
.tbd-root .pane-head .cnt { font-weight: 400; color: #d6e4f5; margin-left: 8px; }
.tbd-root .pane-head .chev { font-size: 12px; }
.tbd-root .bsum { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); }
.tbd-root .bsum > div { padding: 12px 16px; border-right: 1px solid #d7dce3; border-top: 3px solid transparent; }
.tbd-root .bsum > div:nth-child(2) { border-top-color: #14a3a3; }
.tbd-root .bsum > div:last-child { border-right: 0; }
.tbd-root .f-label { font-size: 11px; color: #5b6b80; font-weight: 500; }
.tbd-root .bsum .v { font-size: 18px; font-weight: 600; color: #12304f; margin-top: 2px; }
.tbd-root .bsum .v.over { color: #c2410c; }
.tbd-root .bsum .d { font-size: 11px; margin-top: 2px; }
.tbd-root .ubar-wide { margin: 0 16px 14px; }
.tbd-root .ubar { height: 8px; background: #e6ebf2; border-radius: 3px; overflow: hidden; }
.tbd-root .ubar > span { display: block; height: 100%; background: linear-gradient(90deg, #14a3a3, #1b6fb5); }
.tbd-root .ubar.over > span { background: #d9480f; }
.tbd-root .reason { display: flex; align-items: center; gap: 8px; padding: 8px 14px; border-bottom: 1px solid #e1e5eb; font-size: 12px; color: #475569; }
.tbd-root .reason input { flex: 1; max-width: 420px; height: 28px; border: 1px solid #cbd3df; border-radius: 4px; padding: 0 8px; font-size: 12.5px; }
.tbd-root .reason select { height: 28px; border: 1px solid #cbd3df; border-radius: 4px; padding: 0 6px; font-size: 12.5px; background: #fff; }
.tbd-root .berr { margin: 10px 16px; background: #fff; border: 1px solid #e3e8ef; border-left: 4px solid #c2410c; color: #7c2d12; border-radius: 6px;
  padding: 7px 10px; font-size: 12px; display: flex; justify-content: space-between; gap: 10px; }
.tbd-root .link { background: none; border: 0; padding: 0; color: #1859a8; font-size: 11.5px; font-weight: 700; cursor: pointer; }
.tbd-root .bscroll { overflow-x: auto; }
.tbd-root table.bal { width: 100%; min-width: 980px; border-collapse: collapse; font-size: 12.5px; }
.tbd-root .bal th { background: #e8eef5; color: #12304f; font-weight: 600; font-size: 12px; text-align: left; padding: 8px 10px; border-bottom: 2px solid #9fb3cf; white-space: nowrap; }
.tbd-root .bal td { padding: 7px 10px; border-bottom: 1px solid #e1e5eb; vertical-align: middle; }
.tbd-root .bal .r { text-align: right; }
.tbd-root .bal tr.self td { background: #e9f4f4; font-weight: 700; }
.tbd-root .bal tr.self td.first { box-shadow: inset 4px 0 0 #14a3a3; }
.tbd-root .bal tr.grp td { border-top: 2px solid #9fb3cf; }
.tbd-root .bal tr.tr td { background: #f7f9fc; padding: 8px 12px 12px 40px; animation: tbd-pull 160ms ease-out; }
.tbd-root .pct-in { width: 64px; height: 26px; border: 1px solid #9fb3cf; border-radius: 4px; text-align: right; padding: 0 6px; font-size: 12.5px; background: #fffef5; }
.tbd-root .pct-in:focus { outline: 2px solid #14a3a3; outline-offset: 1px; }
.tbd-root .dd { border: 1px solid #c5d0dd; background: #fff; color: #17365d; border-radius: 4px; padding: 3px 8px; font-size: 12px; font-weight: 700; cursor: pointer; white-space: nowrap; }
.tbd-root .dd[aria-expanded="true"] { background: #12304f; border-color: #12304f; color: #fff; }
.tbd-root .trail { width: 100%; border-collapse: collapse; font-size: 12px; }
.tbd-root .trail th { text-align: left; font-weight: 700; color: #1e3a5f; font-size: 11px; padding: 4px 8px; border-bottom: 1px solid #d7dce3; }
.tbd-root .trail td { padding: 4px 8px; border-bottom: 1px solid #edf0f4; }
.tbd-root .trail .n { text-align: right; }
.tbd-root .audit-wrap { padding: 8px 14px 12px; }
.tbd-root .audit-wrap .trail td, .tbd-root .audit-wrap .trail th { padding: 6px 8px; }
.tbd-root .note { padding: 6px 14px 10px; font-size: 11px; color: #64748b; }
@keyframes tbd-pull { from { opacity: 0; transform: translateY(-6px); } to { opacity: 1; transform: none; } }
@media (prefers-reduced-motion: reduce) { .tbd-root .apdrop, .tbd-root .bal tr.tr td { animation: none; } }
`;
