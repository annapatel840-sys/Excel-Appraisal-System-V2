import { useMemo, useRef, useState } from "react";

import { useAppraisal } from "@/lib/appraisal-store";
import { useBudget } from "@/lib/budget-store";
import { buildChangeLog, subtreeOf, TYPE_LABEL, dateText } from "@/lib/budget-engine";
import { manualEditedEmpIds } from "@/lib/dashboard-overview";
import { cycleKey } from "@/lib/employee-feedback";
import {
  HL_COLORS,
  HL_FIELDS,
  HL_OPS,
  describeRule,
  hlField,
  levelFor,
  loadRules,
  matchingRules,
  saveRules,
  valuesForField,
} from "@/lib/detail-highlight-rules";
import { PANEL_CSS } from "./detailPanelCss";

/* ============================================================
   DETAIL SCREEN > PANEL (replaces the old "Feedback" side panel)

   Same layout as the reference page's right panel:
     header   : "Employee Information" + width − / + and close
     tabs     : Info (with a badge for flags) · Feedback · Budget · Config
     sub-tabs : Budget has Budget / Team metrics / Hike percentile /
                No hike / PB paid vs target / Team changes
     body     : the tab's content

   UI only. Everything shown is worked out from data the Detail Screen
   already has (the open employee, the team rows, payroll history,
   Feedback & Rating rows, the budget figures). Nothing is fetched or
   saved here; only the Config tab's highlight rules are kept, in this
   browser, as in the reference page.
============================================================ */

/* ---------- helpers ---------- */

const num = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const inr = (n) => Math.round(num(n)).toLocaleString("en-IN");
const lakhs = (n) => `${(num(n) / 100000).toFixed(2)} L`;
const pct = (n, d) => (d ? (num(n) / num(d)) * 100 : 0);
const f1 = (n) => (Math.round(n * 10) / 10).toFixed(1);
const ratingNum = (v) => {
  const n = parseFloat(String(v ?? ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const median = (a) => {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const cls = (p) => (p > 100 ? "rp-bad" : p > 90 ? "rp-warn" : "rp-ok");
const ordinal = (n) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};
const blank = (v) => v === null || v === undefined || String(v).trim() === "" || v === "—";
const show = (v) => (blank(v) ? "—" : String(v));

const hikeAmtOf = (e) => num(e.hikeAmount);
const hikePctOf = (e) => pct(e.hikeAmount, e.currentAnnualBasePay);
const hasHike = (e) => hikeAmtOf(e) > 0;
const rewardOf = (e) => num(e.hikeAmount) + num(e.allocatedPBAmount) + num(e.newRB);
const isPromoted = (e) =>
  /^y/i.test(String(e.eligibleForPromotion || "")) && e.newTitle && e.newTitle !== e.designation;

const TABS = [
  ["info", "Info"],
  ["feedback", "Feedback"],
  ["budget", "Budget"],
  ["config", "Config"],
];
const BUDGET_SUBS = [
  ["budget", "Budget"],
  ["team", "Team metrics"],
  ["pct", "Hike percentile"],
  ["nohike", "No hike"],
  ["pb", "PB paid vs target"],
  ["changes", "Team changes"],
];

// Width limits. The maximum is not fixed: the page passes `maxWidth`, which is
// the distance from the right edge to the divider between "Budget Allocated"
// and "Consumed" in the budget bar above. MAX_W is only a fallback.
export const PANEL_MIN_W = 300;
const MIN_W = PANEL_MIN_W;
const MAX_W = 720;
const STEP_W = 40; // each − / + click (same as the Appraisal Sheet panel)
const WIDE_AT = 500; // at/after this width the split layout is used

/* ---------- Info tab data ---------- */

function buildInfo(e, history, live, rules) {
  const orgYrs = parseFloat(e.wissenExperience) || 0;
  const proRata = orgYrs > 0 && orgYrs < 1 ? orgYrs : 1;
  const ctx = {
    raw: e,
    doj: e.doj || "",
    hikePctNow: hikePctOf(e),
    proRata,
  };

  const flags = [];
  const L = (level, title, text) => flags.push({ level, title, text });

  // Manager rating trend over the last three cycles
  const rs = [ratingNum(e.managerRating), ...history.map((h) => ratingNum(h.rating))].filter(
    (x) => x !== null,
  );
  if (rs.length >= 3) {
    const t = rs.slice(0, 3).reverse().join(" → ");
    if (rs[0] > rs[1] && rs[1] > rs[2]) L("green", "Manager Rating rising", `${t} over 3 cycles.`);
    else if (rs[0] < rs[1] && rs[1] < rs[2]) L("red", "Manager Rating falling", `${t} over 3 cycles.`);
  }

  const cr = ratingNum(e.clientRating);
  const mr = ratingNum(e.managerRating);
  if (cr !== null && mr !== null && Math.abs(cr - mr) >= 0.5) {
    L(
      "amber",
      "Manager Rating vs Client Rating",
      `Manager Rating ${mr}, Client Rating ${cr} (gap ${Math.abs(cr - mr).toFixed(1)}).`,
    );
  }

  // Promotion
  let sinceP = 0;
  for (let i = 0; i < history.length - 1; i += 1) {
    const a = history[i].designation;
    const b = history[i + 1].designation;
    if (a && b && a !== "—" && b !== "—" && a !== b) break;
    sinceP += 1;
  }
  if (e.newTitle && e.newTitle !== e.designation) {
    L("green", "Promotion proposed", `${e.designation} → ${e.newTitle}.`);
  } else if (e.eligibleForPromotion === "Yes") {
    L(
      "amber",
      "Eligible for Promotion, New Title not set",
      `Eligible for Promotion is Yes and New Title is unchanged${sinceP ? ` · ${sinceP + 1} cycles in this designation.` : "."}`,
    );
  }

  if (!(num(e.hikeAmount) > 0)) L("amber", "No hike this cycle", "Hike Amount is 0.");

  if (orgYrs > 0 && orgYrs < 1) {
    L(
      "amber",
      "Part-year employee",
      `Wissen exp as on 1st Jan is ${orgYrs} yrs, so pro rata ${Math.round(orgYrs * 100)}% of the year.`,
    );
  }

  // Bonus against what was paid last cycle
  const last = history[0];
  const lastBonus = last ? num(last.performanceBonus) + num(last.retentionBonus) : 0;
  const bonusNow = live.pb + live.rb;
  if (lastBonus) {
    if (bonusNow < lastBonus) {
      L("red", "Total Bonus-PB and RB lower than last year", `This year PB + RB ${inr(bonusNow)} vs ${inr(lastBonus)} last year.`);
    } else if (bonusNow > lastBonus) {
      L("green", "Total Bonus-PB and RB higher than last year", `This year PB + RB ${inr(bonusNow)} vs ${inr(lastBonus)}.`);
    }
  }

  const targetPB = num(e.targetPBAllocatedForMay);
  const lastPB = last ? num(last.performanceBonus) : null;
  if (targetPB && lastPB !== null && lastPB < targetPB * 0.7) {
    L("amber", "PB paid well below Target PB allocated", `${inr(lastPB)} paid vs ${inr(targetPB)}.`);
  }

  // Only when a value exists (a missing RR% reads as 0 in the sheet data)
  const rr = num(e.rrPercent);
  if (rr > 0 && rr < 70) L("amber", "RR% below 70", `RR% is ${rr}.`);

  matchingRules(rules, ctx).forEach((m) => L(m.color, m.label || describeRule(m), m.label ? describeRule(m) : ""));

  const tpbSet = targetPB || (last ? num(last.targetPB) : 0);
  const items = [
    { label: "Wissen exp as on 1st Jan", value: e.wissenExperience ? String(e.wissenExperience) : "", lv: levelFor(rules, ctx, "orgExp") },
    { label: "Total Experience as on 1st Jan", value: e.totalExperience ? String(e.totalExperience) : "", lv: levelFor(rules, ctx, "totalExp") },
    { label: "Date of Joining", value: ctx.doj, lv: levelFor(rules, ctx, "doj") },
    { label: "Source", value: e.sourceOfHire || "", lv: levelFor(rules, ctx, "source") },
    { label: "Target PB allocated", value: tpbSet ? inr(tpbSet) : "—" },
    { label: "Months in cycle", value: proRata < 1 ? `${Math.round(proRata * 12)} of 12` : "", lv: proRata < 1 ? "amber" : "", skip: true },
    { label: "Target PB allocated (pro rata)", value: proRata < 1 && tpbSet ? inr(Math.round(tpbSet * proRata)) : "", lv: proRata < 1 ? "amber" : "", skip: true },
    { label: "Band", value: e.band || "", lv: levelFor(rules, ctx, "band"), skip: true },
  ].filter((it) => !(it.skip && !it.value));

  return { items, flags };
}

/* ---------- Feedback tab data ---------- */

function buildFeedbackRows(e, history, items, currentCycleName) {
  const byKey = new Map();
  (items || []).forEach((it) => {
    const k = cycleKey(it.cycleName);
    if (k && !byKey.has(k)) byKey.set(k, it);
  });

  const curKey = cycleKey(currentCycleName);
  const order = [];
  const seen = new Set();
  const add = (label) => {
    const k = cycleKey(label);
    if (!k || seen.has(k)) return;
    seen.add(k);
    order.push({ key: k, label });
  };

  add(currentCycleName);
  (items || []).forEach((it) => add(it.cycleName));
  history.forEach((h) => add(h.cycleName && h.cycleName !== "—" ? h.cycleName : h.year));

  const histByKey = new Map();
  history.forEach((h) => {
    [h.cycleName, h.year].forEach((n) => {
      const k = cycleKey(n);
      if (k && !histByKey.has(k)) histByKey.set(k, h);
    });
  });

  return order.map(({ key, label }, i) => {
    const isCur = key === curKey;
    const it = byKey.get(key) || {};
    const h = histByKey.get(key);
    const pick = (...vals) => vals.find((v) => !blank(v) && v !== 0);
    return {
      key,
      label,
      current: isCur || (i === 0 && !curKey),
      designation: pick(it.desig, isCur ? e.designation : h?.designation) || "",
      mgrRating: pick(it.mr, isCur ? e.managerRating : h?.feedback !== "—" ? h?.feedback : h?.rating),
      mgrText: it.mf || "",
      clientRating: pick(it.cr, isCur ? e.clientRating : undefined),
      clientText: it.cf || "",
      client: it.client || "",
      rr: pick(it.rr, isCur ? e.rrPercent : undefined),
      ic: pick(it.ic, isCur ? e.interviewCount : undefined),
    };
  });
}

/* ---------- small pieces ---------- */

const Empty = ({ children }) => <div className="rp-info">{children}</div>;

/* ============================================================
   THE PANEL
============================================================ */

export function DetailSidePanel({
  employee,
  rows,
  priorCycles,
  feedbackItems,
  currentCycleName,
  live,
  budget,
  onViewBudget,
  width,
  maxWidth,
  onWidthChange,
  onClose,
}) {
  const { audit } = useAppraisal();
  const budgetCtx = useBudget();

  const [tab, setTab] = useState("info");
  const [sub, setSub] = useState("budget");
  const [rules, setRules] = useState(loadRules);
  const [dragging, setDragging] = useState(false);
  const panelRef = useRef(null);

  const maxW = Math.max(MIN_W, Math.round(maxWidth || MAX_W));
  const wide = width >= WIDE_AT;

  const updateRules = (next) => {
    setRules(next);
    saveRules(next);
  };

  const history = priorCycles || [];
  const info = useMemo(
    () => (employee ? buildInfo(employee, history, live, rules) : { items: [], flags: [] }),
    [employee, history, live, rules],
  );
  const nRed = info.flags.filter((f) => f.level === "red").length;
  const nAmber = info.flags.filter((f) => f.level === "amber").length;

  /* ----- resize (drag the left edge) ----- */
  const startDrag = (event) => {
    event.preventDefault();
    const x0 = event.clientX;
    const w0 = panelRef.current ? panelRef.current.getBoundingClientRect().width : width;
    setDragging(true);
    const move = (ev) =>
      onWidthChange(Math.max(MIN_W, Math.min(maxW, Math.round(w0 + (x0 - ev.clientX)))));
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      setDragging(false);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  };

  return (
    <div
      ref={panelRef}
      className={`rp${wide ? " rp-wide" : ""}${dragging ? " rp-dragging" : ""}`}
      style={{ width: "100%", minWidth: 0, maxWidth: "none", borderRadius: 10 }}
    >
      <style>{PANEL_CSS}</style>
      <div className="rp-grip" title="Drag to resize" onPointerDown={startDrag} />

      <div className="rp-head">
        <div className="rp-who">
          <b>Employee Information</b>
        </div>
        <button
          type="button"
          className="rp-ic rp-zoom"
          title="Decrease panel width"
          aria-label="Decrease panel width"
          disabled={width <= MIN_W}
          onClick={() => onWidthChange(Math.max(MIN_W, width - STEP_W))}
        >
          −
        </button>
        <button
          type="button"
          className="rp-ic rp-zoom"
          title="Increase panel width"
          aria-label="Increase panel width"
          disabled={width >= maxW}
          onClick={() => onWidthChange(Math.min(maxW, width + STEP_W))}
        >
          +
        </button>
        <button type="button" className="rp-ic" title="Close" aria-label="Close panel" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="rp-tabs" role="tablist">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
          >
            {label}
            {k === "info" && nRed + nAmber > 0 ? (
              <>
                {" "}
                <span className={`rp-bd rp-bd-${nRed ? "red" : "amber"}`}>{nRed + nAmber}</span>
              </>
            ) : null}
          </button>
        ))}
      </div>

      <div className="rp-subs">
        {tab === "budget"
          ? BUDGET_SUBS.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={sub === k} onClick={() => setSub(k)}>
                {label}
              </button>
            ))
          : null}
      </div>

      <div className="rp-body">
        {tab === "info" ? (
          <InfoTab employee={employee} info={info} />
        ) : tab === "feedback" ? (
          <FeedbackTab
            employee={employee}
            history={history}
            items={feedbackItems}
            currentCycleName={currentCycleName}
          />
        ) : tab === "budget" ? (
          <BudgetTab
            sub={sub}
            employee={employee}
            rows={rows}
            budget={budget}
            audit={audit}
            budgetCtx={budgetCtx}
            onViewBudget={onViewBudget}
          />
        ) : (
          <ConfigTab rules={rules} onChange={updateRules} rows={rows} />
        )}
      </div>
    </div>
  );
}

/* ============================================================
   INFO
============================================================ */

function InfoTab({ employee, info }) {
  if (!employee) return <Empty>Select an employee to see their info.</Empty>;

  const order = { red: 0, amber: 1, green: 2 };
  const flags = [...info.flags].sort((a, b) => order[a.level] - order[b.level]);
  const nCheck = flags.filter((f) => f.level !== "green").length;

  return (
    <>
      <div className="rp-ig">
        {info.items.map((it) => (
          <div key={it.label} className={`rp-it${it.lv ? ` rp-it-${it.lv}` : ""}`}>
            <span>{it.label}</span>
            <b>{show(it.value)}</b>
          </div>
        ))}
      </div>

      <div className="rp-fbh">Flags · {nCheck} to check</div>
      {flags.length ? (
        <ul className="rp-flags">
          {flags.map((f, i) => (
            <li key={`${f.title}-${i}`} className={`rp-fl rp-fl-${f.level}`}>
              <b>{f.title}</b>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rp-muted">Nothing to flag.</div>
      )}
    </>
  );
}

/* ============================================================
   FEEDBACK  (one grid for the cycles, then the written feedback)
============================================================ */

function FeedbackTab({ employee, history, items, currentCycleName }) {
  const cycles = useMemo(
    () => (employee ? buildFeedbackRows(employee, history, items, currentCycleName) : []),
    [employee, history, items, currentCycleName],
  );

  if (!employee) return <Empty>Select an employee to see their feedback.</Empty>;
  if (!cycles.length) return <Empty>No feedback recorded.</Empty>;

  const v = (x) => (blank(x) ? "—" : String(x));
  const designationCell = (c, i) => {
    const older = cycles[i + 1];
    let text = c.designation || "—";
    if (i === 0 && employee.newTitle && employee.newTitle !== employee.designation) {
      text = `${text} → ${employee.newTitle} ▲ (proposed)`;
    } else if (older?.designation && c.designation && older.designation !== c.designation) {
      text = `${older.designation} → ${c.designation} ▲`;
    } else if (i === 0 && /^y/i.test(employee.eligibleForPromotion || "")) {
      text += " · Eligible for Promotion";
    }
    return text;
  };

  const written = cycles.filter((c) => c.mgrText || c.clientText);

  return (
    <>
      <table className="rp-tbl rp-rg">
        <thead>
          <tr>
            <th>Cycle</th>
            <th className="rp-n">Manager Rating</th>
            <th className="rp-n">Client Rating</th>
            <th className="rp-n">RR%</th>
            <th className="rp-n">Interview Count</th>
            <th>Designation</th>
          </tr>
        </thead>
        <tbody>
          {cycles.map((c, i) => (
            <tr key={c.key} className={i === 0 ? "rp-cur" : ""}>
              <td>
                {c.label}
                {i === 0 ? " ★" : ""}
              </td>
              <td className="rp-n">{v(c.mgrRating)}</td>
              <td className="rp-n">{v(c.clientRating)}</td>
              <td className="rp-n">{v(c.rr)}</td>
              <td className="rp-n">{v(c.ic)}</td>
              <td className="rp-wrap">{designationCell(c, i)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="rp-fbh">Feedback</div>
      {written.length ? (
        <ul className="rp-tl">
          {written.map((c) => (
            <li key={c.key} className={c.key === cycles[0].key ? "rp-cur" : ""}>
              <span className="rp-y">{c.label}</span>
              {c.mgrText ? (
                <div className="rp-txt">
                  <b>Manager:</b> {c.mgrText}
                </div>
              ) : null}
              {c.clientText ? (
                <div className="rp-txt">
                  <b>Client{c.client ? ` · ${c.client}` : ""}:</b> {c.clientText}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <div className="rp-muted">No written feedback recorded.</div>
      )}
    </>
  );
}

/* ============================================================
   BUDGET
============================================================ */

function BudgetTab({ sub, employee, rows, budget, audit, budgetCtx, onViewBudget }) {
  const team = rows || [];
  const alloc = num(budget?.allocated);
  const used = num(budget?.used);
  const cur = pct(used, alloc);

  const edited = useMemo(() => manualEditedEmpIds(audit), [audit]);

  const changes = useMemo(() => {
    try {
      const all = buildChangeLog(budgetCtx.eligibilityEvents, budgetCtx.gridSupervisorChanges);
      if (budgetCtx.isHR) return all;
      const tree = subtreeOf(budgetCtx.hierarchy, budgetCtx.currentUser?.name);
      return all.filter((c) => tree.indexOf(c.manager) > -1);
    } catch {
      return [];
    }
  }, [budgetCtx]);

  if (sub === "budget") {
    return (
      <>
        <div className="rp-card">
          <h4>Current consumption</h4>
          <div className="rp-row">
            <span>Used</span>
            <span className={`rp-big ${cls(cur)}`}>{f1(cur)}%</span>
          </div>
          <div className="rp-bar">
            <i className={cls(cur)} style={{ width: `${Math.min(100, cur)}%` }} />
          </div>
          <div className="rp-muted">
            {lakhs(used)} used ·{" "}
            {alloc - used >= 0 ? `${lakhs(alloc - used)} left` : `${lakhs(used - alloc)} over`} of{" "}
            {lakhs(alloc)}
          </div>
        </div>
        {typeof onViewBudget === "function" ? (
          <div style={{ marginTop: 10 }}>
            <button type="button" className="rp-link" onClick={onViewBudget}>
              View budget ›
            </button>
          </div>
        ) : null}
      </>
    );
  }

  if (sub === "team") {
    const ed = team.filter((e) => edited.has(String(e.empId || "").trim())).length;
    const pr = team.filter(isPromoted).length;
    const hk = team.filter(hasHike).map(hikePctOf);
    const rt = team.map((e) => num(e.managerRating)).filter(Boolean);
    return (
      <div className="rp-card">
        <h4>Team · {team.length} people</h4>
        <div className="rp-row">
          <span>Edited this cycle</span>
          <b>
            {ed} of {team.length}
          </b>
        </div>
        <div className="rp-row">
          <span>Promotions</span>
          <b>{pr}</b>
        </div>
        <div className="rp-row">
          <span>Average hike % (where given)</span>
          <b>{hk.length ? `${f1(hk.reduce((a, x) => a + x, 0) / hk.length)}%` : "—"}</b>
        </div>
        <div className="rp-row">
          <span>Median hike %</span>
          <b>{hk.length ? `${f1(median(hk))}%` : "—"}</b>
        </div>
        <div className="rp-row">
          <span>Average rating</span>
          <b>{rt.length ? (rt.reduce((a, x) => a + x, 0) / rt.length).toFixed(1) : "—"}</b>
        </div>
      </div>
    );
  }

  if (sub === "pct") {
    const tr = team
      .map((e) => ({ e, v: pct(rewardOf(e), e.currentAnnualBasePay) }))
      .sort((a, b) => b.v - a.v);
    const idx = employee ? tr.findIndex((x) => x.e.empId === employee.empId) : -1;
    const rank = tr.length > 1 && idx > -1 ? Math.round(((tr.length - 1 - idx) / (tr.length - 1)) * 100) : 100;
    return (
      <div className="rp-card">
        <h4>Total Reward hike % in team</h4>
        <table className="rp-tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>Employee</th>
              <th className="rp-n">Reward hike %</th>
            </tr>
          </thead>
          <tbody>
            {tr.map((x, i) => (
              <tr key={x.e.id} className={employee && x.e.empId === employee.empId ? "rp-me" : ""}>
                <td>{i + 1}</td>
                <td>{x.e.name}</td>
                <td className="rp-n">{f1(x.v)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
        {employee && idx > -1 ? (
          <div className="rp-note" style={{ marginTop: 6 }}>
            {employee.name} is {ordinal(rank)} percentile
          </div>
        ) : null}
      </div>
    );
  }

  if (sub === "nohike") {
    const nh = team.filter((e) => !hasHike(e));
    return (
      <div className="rp-card">
        <h4>
          No hike this cycle · {nh.length} of {team.length}
        </h4>
        {nh.length ? (
          <ul className="rp-list">
            {nh.map((e) => (
              <li key={e.id}>
                {e.name}{" "}
                <span className="rp-muted">
                  · {e.designation || ""}
                  {num(e.managerRating) ? ` · rating ${e.managerRating}` : ""}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="rp-muted">Everyone has a hike.</div>
        )}
      </div>
    );
  }

  if (sub === "pb") {
    const paid = team.reduce((a, e) => a + num(e.pbToBePaid), 0);
    const tgt = team.reduce((a, e) => a + num(e.targetPBAllocatedForMay), 0);
    const p = pct(paid, tgt);
    return (
      <div className="rp-card">
        <h4>PB paid vs target</h4>
        <div className="rp-row">
          <span>Paid</span>
          <span className="rp-big">{f1(p)}%</span>
        </div>
        <div className="rp-bar">
          <i style={{ width: `${Math.min(100, p)}%` }} />
        </div>
        <div className="rp-muted">
          {lakhs(paid)} paid of {lakhs(tgt)} target
        </div>
      </div>
    );
  }

  return (
    <div className="rp-card">
      <h4>Team changes · {changes.length}</h4>
      {changes.length ? (
        <ul className="rp-list">
          {changes.map((c, i) => (
            <li key={`${c.empId}-${c.type}-${i}`}>
              {c.name || c.empId}{" "}
              <span className="rp-muted">
                · {TYPE_LABEL[c.type] || c.type}
                {c.date ? ` · ${dateText(c.date)}` : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rp-muted">No changes since allocation.</div>
      )}
    </div>
  );
}

/* ============================================================
   CONFIG  (highlight rules for the Info tab)
============================================================ */

function ConfigTab({ rules, onChange, rows }) {
  const set = (i, patch) => onChange(rules.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const del = (i) => onChange(rules.filter((_, k) => k !== i));
  const add = () =>
    onChange([
      ...rules,
      { id: `r${Date.now()}`, on: true, field: "source", op: "is", value: "", color: "amber", label: "" },
    ]);

  return (
    <>
      <div className="rp-fbh" style={{ marginTop: 2 }}>
        Highlight rules
      </div>
      <div className="rp-muted" style={{ marginBottom: 6 }}>
        Choose what to highlight on the Info tab. Rules are saved in this browser.
      </div>

      {rules.map((r, i) => {
        const fd = hlField(r.field) || {};
        let list =
          fd.type === "text" && (r.op === "is" || r.op === "isnot") ? valuesForField(rows, r.field) : null;
        if (list && r.value && !list.includes(r.value)) list = [...list, r.value];

        return (
          <div key={r.id || i} className={`hl-r${r.on ? "" : " hl-off"}`}>
            <label className="hl-on" title="Switch on or off">
              <input type="checkbox" checked={!!r.on} onChange={(e) => set(i, { on: e.target.checked })} />
            </label>
            <select aria-label="Field" value={r.field} onChange={(e) => set(i, { field: e.target.value, value: "" })}>
              {HL_FIELDS.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
            <select aria-label="Condition" value={r.op} onChange={(e) => set(i, { op: e.target.value })}>
              {HL_OPS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            {r.op === "blank" ? (
              <span />
            ) : list && list.length ? (
              <select data-hl="value" aria-label="Value" value={r.value || ""} onChange={(e) => set(i, { value: e.target.value })}>
                <option value="">Select…</option>
                {list.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            ) : (
              <input
                data-hl="value"
                aria-label="Value"
                placeholder="Value"
                value={r.value ?? ""}
                onChange={(e) => set(i, { value: e.target.value })}
              />
            )}
            <select
              data-hl="color"
              className={`hl-c hl-c-${r.color}`}
              aria-label="Colour"
              value={r.color}
              onChange={(e) => set(i, { color: e.target.value })}
            >
              {HL_COLORS.map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
            <input
              data-hl="label"
              aria-label="Label"
              placeholder="Label (optional)"
              value={r.label ?? ""}
              onChange={(e) => set(i, { label: e.target.value })}
            />
            <button type="button" className="hl-x" title="Delete rule" aria-label="Delete rule" onClick={() => del(i)}>
              ✕
            </button>
          </div>
        );
      })}

      <button type="button" className="rp-link" style={{ marginTop: 8 }} onClick={add}>
        + Add rule
      </button>
      {rules.length ? null : <div className="rp-info">No rules yet.</div>}
    </>
  );
}