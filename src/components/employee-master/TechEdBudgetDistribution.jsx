import { Fragment, useMemo, useState } from "react";

import { useCatalystUser } from "@/lib/catalyst-auth";

/* Budget Distribution as a Tech ED sees it (design: Budget Allocation view of
   the "Detail Screen & Budget" prototype).

   UI REVIEW BUILD: this screen uses the sample data below and makes no
   backend calls. Allot % changes stay on screen until the page is reloaded.
   To go live, replace DEMO with the Tech ED's Budget_Master row, their team
   from the Appraisal Sheet and the allocation history. */

const LEVELS = ["Tech ED", "Comp Manager"];
const UTILISED_LABEL = "Hike Amount";

const DEMO = {
  cycle: "Apr-26",
  allocation: { date: "2026-09-01", by: "HR Admin" },
  techEdPct: 8,
  // Employees in the Tech ED's teams now and at allocation.
  // base = Current Annual Base Pay + Allocated PB Amount; hike = Hike Amount.
  employees: {
    EMP00125: { name: "Rohan Kapoor", base: 2500000 + 300000, hike: 250000 },
    EMP200: { name: "Aarav Iyer", base: 800000 + 86400, hike: 48000 },
    EMP205: { name: "Sai Gupta", base: 1550000 + 167400, hike: 170500 },
    EMP210: { name: "Ananya Bhatt", base: 2300000 + 248400, hike: 138000 },
    EMP220: { name: "Rahul Iyer", base: 3800000 + 410400, hike: 228000 },
    EMP225: { name: "Varun Gupta", base: 800000 + 86400, hike: 88000 },
    EMP201: { name: "Vivaan Mehta", base: 950000 + 102600, hike: 66500 },
    EMP206: { name: "Reyansh Reddy", base: 1700000 + 183600, hike: 204000 },
    EMP202: { name: "Aditya Singh", base: 1100000 + 118800, hike: 88000 },
    EMP290: { name: "Kiran Das", base: 1200000 + 130000, hike: 0 },
    EMP211: { name: "Diya Sharma", base: 2450000 + 264600, hike: 0 },
    EMP215: { name: "Myra Patel", base: 3050000 + 329400, hike: 0 },
  },
  compManagers: [
    {
      name: "Anita Sharma",
      pct0: 7.5,
      team0: ["EMP00125", "EMP200", "EMP205", "EMP210", "EMP215", "EMP290", "EMP202"],
      team: ["EMP00125", "EMP200", "EMP205", "EMP210", "EMP220", "EMP225"],
    },
    {
      name: "Raj Mehta",
      pct0: 6,
      team0: ["EMP201", "EMP206", "EMP211", "EMP220"],
      team: ["EMP201", "EMP206"],
    },
  ],
  // Team changes since allocation (eligibility list + appraisal grid).
  events: [
    { date: "2026-09-12", cm: "Anita Sharma", emp: "EMP290", sign: -1, text: "Resigned: Kiran Das" },
    { date: "2026-09-15", cm: "Anita Sharma", emp: "EMP225", sign: 1, text: "Added: Varun Gupta" },
    { date: "2026-09-18", cm: "Anita Sharma", emp: "EMP220", sign: 1, text: "Transferred in: Rahul Iyer (from Raj Mehta)" },
    { date: "2026-09-18", cm: "Raj Mehta", emp: "EMP220", sign: -1, text: "Transferred out: Rahul Iyer (to Anita Sharma)" },
    { date: "2026-09-20", cm: "Anita Sharma", emp: "EMP202", sign: -1, text: "Transferred out: Aditya Singh (to Suresh Iyer)" },
    { date: "2026-09-21", cm: "Raj Mehta", emp: "EMP211", sign: -1, text: "Resigned: Diya Sharma" },
    { date: "2026-09-22", cm: "Anita Sharma", emp: "EMP215", sign: -1, text: "Resigned: Myra Patel" },
  ],
  // % changes the Tech ED made after allocation.
  pctLog: [{ name: "Raj Mehta", from: 6, to: 6.5, date: "2026-09-24", time: "11:20", reason: "Rahul Iyer moved out; keep Raj's budget steady" }],
};

const num = (v) => Number(v) || 0;
const lakh = (n) => "₹ " + (num(n) / 1e5).toFixed(2) + " L";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dateText(iso) {
  const p = String(iso || "").slice(0, 10).split("-");
  return p.length === 3 && MONTHS[Number(p[1]) - 1] ? p[2] + "-" + MONTHS[Number(p[1]) - 1] : iso || "—";
}
function nowParts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return { date: d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()), time: pad(d.getHours()) + ":" + pad(d.getMinutes()) };
}
const baseOf = (ids) => ids.reduce((s, id) => s + num(DEMO.employees[id]?.base), 0);
const hikeOf = (ids) => ids.reduce((s, id) => s + num(DEMO.employees[id]?.hike), 0);
const empBase = (id) => num(DEMO.employees[id]?.base);
const byDate = (a, b) => String(a.date + (a.time || "")).localeCompare(String(b.date + (b.time || "")));

/* One Comp Manager: budget at allocation, now, and a dated history. */
function cmNode(cm, log) {
  const changes = log.filter((l) => l.name === cm.name).sort(byDate);
  const pct = changes.length ? changes[changes.length - 1].to : cm.pct0;
  const base0 = baseOf(cm.team0);
  const base = baseOf(cm.team);
  const original = (base0 * cm.pct0) / 100;
  const items = [{ date: DEMO.allocation.date, amount: original, team: cm.team0.length, pct: cm.pct0 }];
  let amount = original;
  let team = cm.team0.length;
  let p = cm.pct0;
  let b = base0;
  const steps = [
    ...DEMO.events.filter((e) => e.cm === cm.name).map((e) => ({ ...e, kind: "team" })),
    ...changes.map((c) => ({ ...c, kind: "pct" })),
  ].sort(byDate);
  steps.forEach((s) => {
    if (s.kind === "team") {
      b += s.sign * empBase(s.emp);
      team += s.sign;
    } else {
      p = s.to;
    }
    amount = (b * p) / 100;
    const row = { date: s.date, amount, team, pct: p };
    const last = items[items.length - 1];
    if (last.date === s.date) items[items.length - 1] = row;
    else items.push(row);
  });
  return {
    name: cm.name,
    pct,
    pct0: cm.pct0,
    base,
    team0: cm.team0.length,
    team: cm.team.length,
    original,
    updated: (base * pct) / 100,
    history: items,
    lastChanged: steps.length ? steps[steps.length - 1].date : "",
  };
}
const asOf = (hist, date) => hist.reduce((r, x) => (x.date <= date ? x : r), hist[0]);

function Chg({ d }) {
  if (Math.abs(d) < 1) return <span className="mut">No change</span>;
  return <span className={d > 0 ? "up" : "down"}>{(d > 0 ? "▲ " : "▼ ") + lakh(Math.abs(d))}</span>;
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
  const myName = user?.name || "Vikram Rao";

  const [pane, setPane] = useState({ mine: true, alloc: true, audit: true });
  const [appliedOpen, setAppliedOpen] = useState(false);
  const [trailOpen, setTrailOpen] = useState({});
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [auditFilter, setAuditFilter] = useState("all");
  const [drafts, setDrafts] = useState({});
  // Demo % log: sample entries plus whatever is changed during the review.
  const [log, setLog] = useState(() =>
    DEMO.pctLog.map((l) => {
      const cm = DEMO.compManagers.find((c) => c.name === l.name);
      const base = cm ? baseOf(cm.team) : 0;
      return { ...l, by: myName, before: (base * l.from) / 100, after: (base * l.to) / 100 };
    }),
  );

  const cmNodes = useMemo(() => DEMO.compManagers.map((cm) => cmNode(cm, log)), [log]);

  const allTeam0 = DEMO.compManagers.flatMap((c) => c.team0);
  const allTeam = DEMO.compManagers.flatMap((c) => c.team);
  const myPct = DEMO.techEdPct;
  const myOriginal = (baseOf([...new Set(allTeam0)]) * myPct) / 100;
  const myUpdated = (baseOf(allTeam) * myPct) / 100;
  const team0 = new Set(allTeam0).size;
  const allotted = cmNodes.reduce((s, n) => s + n.updated, 0);
  const used = hikeOf(allTeam);
  const usedPct = myUpdated ? (used / myUpdated) * 100 : 0;
  const over = usedPct > 100;

  // Tech ED history: own budget per date, rolled up with the Comp Managers.
  const myHistory = useMemo(() => {
    const dates = [...new Set([DEMO.allocation.date, ...cmNodes.flatMap((n) => n.history.map((h) => h.date))])].sort();
    let base = baseOf([...new Set(allTeam0)]);
    let team = team0;
    // Moves between this Tech ED's own Comp Managers don't change their total.
    const own = DEMO.events.filter((e) => !(e.sign > 0 && e.text.startsWith("Transferred in")) && !(e.sign < 0 && /\(to (Anita Sharma|Raj Mehta)\)/.test(e.text)));
    return dates.map((d) => {
      own.filter((e) => e.date === d).forEach((e) => {
        base += e.sign * empBase(e.emp);
        team += e.sign;
      });
      const allot = cmNodes.reduce((s, n) => s + asOf(n.history, d).amount, 0);
      const updated = (base * myPct) / 100;
      return { date: d, allocated: myOriginal, updated, team, allotted: allot, buffer: updated - allot };
    });
  }, [cmNodes, myOriginal, myPct, team0]);

  const auditFor = (names) => {
    const out = [];
    names.forEach((n) => {
      if (n === myName) {
        out.push({ date: DEMO.allocation.date, time: "", name: n, from: null, to: myPct, before: null, after: myOriginal, by: DEMO.allocation.by, reason: "Initial allocation" });
        return;
      }
      const c = cmNodes.find((x) => x.name === n);
      if (c) out.push({ date: DEMO.allocation.date, time: "", name: n, from: null, to: c.pct0, before: null, after: c.original, by: myName, reason: "Initial allocation" });
    });
    log.forEach((l) => {
      if (names.includes(l.name)) out.push(l);
    });
    return out.sort((a, b) => byDate(b, a));
  };

  function setPct(name, raw) {
    const node = cmNodes.find((x) => x.name === name);
    setDrafts((d) => {
      const next = { ...d };
      delete next[name];
      return next;
    });
    if (!node) return;
    const to = Math.round(Number(raw) * 10) / 10;
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
    setLog((l) => [...l, { name, from: node.pct, to, by: myName, date: t.date, time: t.time, before: node.updated, after: newUpd, reason: reason.trim() }]);
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

  const cmLabel = LEVELS[1] + (cmNodes.length === 1 ? "" : "s");
  const auditNames = [myName, ...cmNodes.map((c) => c.name)];
  let auditList = auditFor(auditNames);
  if (auditFilter !== "all") auditList = auditList.filter((x) => x.name === auditFilter);
  const selfOpen = !!trailOpen[myName];

  return (
    <div className="tbd-root">
      <style>{CSS}</style>

      <div className="demo-banner">Sample data for UI review — budgets, teams and changes on this screen are not from the Data Store.</div>

      <div className="btop">
        <span>
          Appraisal cycle <b>{DEMO.cycle}</b>
        </span>
        <span className="sep" />
        <span>
          Allocated {dateText(DEMO.allocation.date)} by {DEMO.allocation.by}
        </span>
        <span className="sep" />
        <span>
          <b>{LEVELS[0]}</b>
        </span>
        <span className="sep" />
        <span className="applied">
          Budget applied by HR: <b>{myPct}%</b> <span className="muted-small">(org default)</span> = <b>{lakh(myUpdated)}</b> updated · original{" "}
          {lakh(myOriginal)}
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
                  {team0} → {allTeam.length}
                </div>
                <div className="d mut">At allocation → now</div>
              </div>
              <div>
                <div className="f-label">Allotted to reports</div>
                <div className="v">{lakh(allotted)}</div>
              </div>
              <div>
                <div className="f-label">Buffer</div>
                <div className="v">{lakh(myUpdated - allotted)}</div>
                <div className="d mut">Not passed down</div>
              </div>
              <div>
                <div className="f-label">Utilised</div>
                <div className={"v" + (over ? " over" : "")}>
                  {lakh(used)} ({usedPct.toFixed(0)}%)
                </div>
                <div className="d">
                  {over ? <span className="over">▲ {lakh(used - myUpdated)} over</span> : <span className="mut">Remaining {lakh(myUpdated - used)}</span>}
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
        {paneHead("alloc", "Allocation", cmNodes.length + " " + cmLabel)}
        {pane.alloc && (
          <>
            <div className="reason">
              <label htmlFor="tbdReason">Reason for next % change</label>
              <input id="tbdReason" type="text" value={reason} placeholder="Optional — saved in the audit trail" onChange={(e) => setReason(e.target.value)} />
            </div>
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
                    <td className="r">{allTeam.length}</td>
                    <td>
                      <button
                        type="button"
                        className="dd"
                        aria-expanded={selfOpen}
                        title={(selfOpen ? "Hide" : "Show") + " budget history"}
                        onClick={() => setTrailOpen((t) => ({ ...t, [myName]: !t[myName] }))}
                      >
                        {dateText(myHistory[myHistory.length - 1].date)} {selfOpen ? "▴" : "▾"}
                      </button>
                    </td>
                    <td className="r">
                      <span className="mut">{myPct}%</span>
                    </td>
                  </tr>
                  {selfOpen && (
                    <tr className="tr">
                      <td colSpan={9}>
                        <table className="trail" style={{ maxWidth: 820 }}>
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th className="n">Allocated</th>
                              <th className="n">Updated</th>
                              <th className="n">Team size</th>
                              <th className="n">Allotted to {LEVELS[1]}s</th>
                              <th className="n">Buffer</th>
                            </tr>
                          </thead>
                          <tbody>
                            {myHistory.map((x) => (
                              <tr key={x.date}>
                                <td>{dateText(x.date)}</td>
                                <td className="n">{lakh(x.allocated)}</td>
                                <td className="n">{lakh(x.updated)}</td>
                                <td className="n">{x.team}</td>
                                <td className="n">{lakh(x.allotted)}</td>
                                <td className="n">{lakh(x.buffer)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                  {cmNodes.map((n, i) => {
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
                            {n.history.length > 1 ? (
                              <button
                                type="button"
                                className="dd"
                                aria-expanded={open}
                                title={(open ? "Hide" : "Show") + " budget history"}
                                onClick={() => setTrailOpen((t) => ({ ...t, [n.name]: !t[n.name] }))}
                              >
                                {dateText(n.lastChanged)} {open ? "▴" : "▾"}
                              </button>
                            ) : (
                              <span className="mut">—</span>
                            )}
                          </td>
                          <td className="r">
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
                          </td>
                        </tr>
                        {open && (
                          <tr className="tr">
                            <td colSpan={9}>
                              <table className="trail" style={{ maxWidth: 560 }}>
                                <thead>
                                  <tr>
                                    <th>Date</th>
                                    <th className="n">Allocated</th>
                                    <th className="n">Updated</th>
                                    <th className="n">Team size</th>
                                    <th className="n">Allot %</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {n.history.map((x) => (
                                    <tr key={x.date}>
                                      <td>{dateText(x.date)}</td>
                                      <td className="n">{lakh(n.original)}</td>
                                      <td className="n">{lakh(x.amount)}</td>
                                      <td className="n">{x.team}</td>
                                      <td className="n">{x.pct}%</td>
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
                </tbody>
              </table>
            </div>
            <div className="note">
              Budget base = Current Annual Base Pay + Allocated PB Amount of each {LEVELS[1]}'s team · Utilised = {UTILISED_LABEL}
            </div>
          </>
        )}
      </div>

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
    </div>
  );
}

const CSS = `
.tbd-root { max-width: 1320px; margin: 0 auto; width: 100%; display: flex; flex-direction: column; gap: 8px;
  font-family: "IBM Plex Sans", "Segoe UI", Arial, Helvetica, sans-serif; font-size: 12.5px; color: #0f1f33; font-variant-numeric: tabular-nums; }
.tbd-root * { box-sizing: border-box; }
.tbd-root .demo-banner { border: 1px solid #fcd34d; background: #fffbeb; color: #92400e; border-radius: 6px; padding: 5px 10px; font-size: 11.5px; }
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
