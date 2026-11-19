import { Component, useMemo, useState } from "react";

import { totalRewardsHikePct, yoeRatio } from "@/lib/appraisal-data";
import { cycleKey } from "@/lib/employee-feedback";

/* ============================================================
   Detail Screen > Feedback panel > "Metrics" tab.

   Read-only view built from data the screen already has:
   - this cycle: the employee's row (live PB / RB / hike % are passed in)
   - earlier cycles: payroll history (priorCycles) + Feedback & Rating rows
   - peers: the other employees this login can see on the sheet
   No fetching happens here.
   ============================================================ */

const INK = "#102A43";

const CARDS = [
  ["rating", "Rating metric"],
  ["contribution", "Contribution metric"],
  ["experience", "Experience metric"],
  ["reward", "Reward metric"],
  ["flag", "Feedback completeness (flag)"],
];
const DEFAULT_SHOWN = { rating: true, contribution: true, experience: true, reward: true, flag: false };
const PEER_BASES = [
  ["desig", "Designation"],
  ["desig-exp", "Designation + Experience"],
  ["desig-rating", "Designation + Rating tier"],
];
const MIN_PEERS = 3;
const EXP_WINDOW_YEARS = 2;
const SHOWN_KEY = "detail.metrics.cards";
const PEER_KEY = "detail.metrics.peer";

/* ---------------- small helpers ---------------- */

const num = (v) => {
  if (v === null || v === undefined || String(v).trim() === "") return null;
  const n = Number(String(v).replace(/[,%\s]/g, ""));
  return Number.isFinite(n) ? n : null;
};
// 0 in a feedback / sheet column means "nothing recorded", not a real zero.
const nz = (v) => (v === null || v === undefined || v === 0 ? null : v);
const fx = (v, d = 1) => (v === null || v === undefined ? "—" : Number(v).toFixed(d));
// Small amounts are shown in full rupees (so 8,000 is not "0.1L"); 1 lakh and
// above is shown as lakhs.
const lakh = (v) =>
  v === null || v === undefined
    ? "—"
    : Math.abs(v) < 1e5
      ? Math.round(v).toLocaleString("en-IN")
      : `${(v / 1e5).toFixed(1)}L`;
const norm = (v) => String(v ?? "").trim().toLowerCase();
const last = (arr) => arr[arr.length - 1];

const sortedNums = (arr) => arr.filter((v) => v !== null && Number.isFinite(v)).sort((a, b) => a - b);
const quantile = (sorted, q) => {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
};

const tierOf = (row) => {
  const m = num(row.managerRating);
  return m === null ? "" : m >= 4 ? "high" : m >= 3 ? "mid" : "low";
};

function peersFor(employee, rows, basis) {
  const desig = norm(employee.designation);
  const exp = num(employee.totalExperience);
  return rows.filter((r) => {
    if (r.id === employee.id || norm(r.designation) !== desig) return false;
    if (basis === "desig-exp") {
      const e = num(r.totalExperience);
      return e !== null && exp !== null && Math.abs(e - exp) <= EXP_WINDOW_YEARS;
    }
    if (basis === "desig-rating") return tierOf(r) !== "" && tierOf(r) === tierOf(employee);
    return true;
  });
}

const readStore = (key, fallback) => {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
};
const writeStore = (key, value) => {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage can be blocked; the choice just won't persist */
  }
};

/* ---------------- series per cycle (oldest -> newest) ---------------- */

function buildSeries({ employee, history, feedbackItems, currentCycleName, live }) {
  const byCycle = new Map();
  (feedbackItems || []).forEach((item) => {
    const k = cycleKey(item.cycleName);
    if (k && !byCycle.has(k)) byCycle.set(k, item);
  });

  const curFb = byCycle.get(cycleKey(currentCycleName));
  const current = {
    label: currentCycleName,
    current: true,
    mgr: num(employee.managerRating) ?? nz(num(curFb?.mr)),
    hike: live.hikePct,
    rr: nz(num(employee.rrPercent)) ?? nz(num(curFb?.rr)),
    margin: nz(num(employee.grossMargin)) ?? nz(num(curFb?.gm)),
    ic: nz(num(employee.interviewCount)) ?? nz(num(curFb?.ic)),
    yoe: nz(yoeRatio(employee)),
    pb: live.pb,
    rb: live.rb,
    total: live.pb + live.rb,
  };

  const prior = (history || [])
    .slice(0, 3)
    .reverse()
    .map((p) => {
      const label = p.cycleName || p.year;
      const fb = byCycle.get(cycleKey(label));
      const pb = Number(p.performanceBonus) || 0;
      const rb = Number(p.retentionBonus) || 0;
      return {
        label,
        current: false,
        mgr: nz(num(fb?.mr)) ?? num(p.feedback),
        hike: p.basePay ? ((Number(p.hikeAmount) || 0) / p.basePay) * 100 : null,
        rr: nz(num(fb?.rr)),
        margin: nz(num(fb?.gm)),
        ic: nz(num(fb?.ic)),
        yoe: nz(num(fb?.yoe)),
        pb,
        rb,
        total: pb + rb,
      };
    });

  return [...prior, current];
}

/* ---------------- tiny presentational pieces ---------------- */

function Spark({ values, color }) {
  const pts = values
    .map((v, i) => ({ v, i }))
    .filter((p) => p.v !== null && p.v !== undefined);
  if (pts.length < 2) {
    return <div className="mx-sp mx-sp-empty">Not enough cycles to plot</div>;
  }
  const lo = Math.min(...pts.map((p) => p.v));
  const hi = Math.max(...pts.map((p) => p.v));
  const span = hi - lo || 1;
  const step = values.length > 1 ? 120 / (values.length - 1) : 0;
  const xy = pts.map((p) => [5 + p.i * step, hi === lo ? 15 : 26 - ((p.v - lo) / span) * 22]);
  return (
    <div className="mx-sp">
      <svg viewBox="0 0 140 30" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={xy.map((p) => p.join(",")).join(" ")} fill="none" stroke={color} strokeWidth="2.5" />
        {xy.map((p, i) => (
          <circle key={i} cx={p[0]} cy={p[1]} r="3" fill={color} />
        ))}
      </svg>
    </div>
  );
}

function TrendRow({ label, value, values, color }) {
  return (
    <div className="mx-tr">
      <div className="mx-trh">
        <span className="mx-lab">{label}</span>
        <span className="mx-val">{value}</span>
      </div>
      <Spark values={values} color={color} />
    </div>
  );
}

function Card({ id, title, sub, open, onToggle, detail, children }) {
  return (
    <div
      className="mx-card"
      id={id}
      role="button"
      tabIndex={0}
      aria-expanded={open}
      onClick={onToggle}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onToggle())}
    >
      <div className="mx-top">
        <div>
          <span className="mx-name">{title}</span>
          <span className="mx-chev">{open ? "▴" : "▾"}</span>
        </div>
        <span className="mx-cyc">{sub}</span>
      </div>
      {children}
      {open && detail ? (
        <div className="mx-det" onClick={(e) => e.stopPropagation()}>
          {detail}
        </div>
      ) : null}
    </div>
  );
}

function DetailTable({ head, rows }) {
  return (
    <table>
      <thead>
        <tr>
          {head.map((h) => (
            <th key={h}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td className={r.current ? "cur" : ""}>{r.label}</td>
            {r.cells.map((c, i) => (
              <td key={i} className={r.current ? "cur" : ""}>
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/* ---------------- the tab ---------------- */

function DetailMetricsTabInner({
  employee,
  rows = [],
  history = [],
  historyLoading = false,
  feedbackItems = [],
  currentCycleName,
  live,
}) {
  const [shown, setShown] = useState(() => readStore(SHOWN_KEY, DEFAULT_SHOWN));
  const [basis, setBasis] = useState(() => {
    const saved = readStore(PEER_KEY, { basis: "desig" }).basis;
    return PEER_BASES.some(([k]) => k === saved) ? saved : "desig";
  });
  const [custom, setCustom] = useState(false);
  const [open, setOpen] = useState({});

  const series = useMemo(
    () => (employee ? buildSeries({ employee, history, feedbackItems, currentCycleName, live }) : []),
    // `live` is rebuilt every render, so depend on its values instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [employee, history, feedbackItems, currentCycleName, live.hikePct, live.pb, live.rb],
  );

  const peers = useMemo(() => (employee ? peersFor(employee, rows, basis) : []), [employee, rows, basis]);
  const basisLabel = PEER_BASES.find(([k]) => k === basis)[1];
  const enoughPeers = peers.length >= MIN_PEERS;

  if (!employee) return null;

  const cur = last(series);
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const col = (key) => series.map((s) => s[key]);
  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }));
  const setShownKey = (key, on) => {
    const next = { ...shown, [key]: on };
    setShown(next);
    writeStore(SHOWN_KEY, next);
  };
  const pickBasis = (value) => {
    setBasis(value);
    writeStore(PEER_KEY, { basis: value });
  };

  /* ---- peer comparisons ---- */
  const totalRaise = totalRewardsHikePct(employee);
  const peerRaise = sortedNums(peers.map((p) => totalRewardsHikePct(p)));
  const peerRaiseMedian = enoughPeers ? quantile(peerRaise, 0.5) : null;
  const peerYoe = sortedNums(peers.map((p) => nz(yoeRatio(p))));
  const yoeLo = enoughPeers && peerYoe.length >= MIN_PEERS ? quantile(peerYoe, 0.25) : null;
  const yoeHi = enoughPeers && peerYoe.length >= MIN_PEERS ? quantile(peerYoe, 0.75) : null;
  const yoeMid = yoeLo === null ? null : quantile(peerYoe, 0.5);

  /* ---- trend sentences ---- */
  const dir = (a, b) => (a === null || b === null || a === undefined || b === undefined ? 0 : Math.sign(a - b));
  const ratingDir = prev ? dir(cur.mgr, prev.mgr) : 0;
  const hikeDir = prev ? dir(cur.hike, prev.hike) : 0;
  let ratingNote = "Not enough earlier cycles to compare the trend.";
  if (prev && cur.mgr !== null && prev.mgr !== null && cur.hike !== null && prev.hike !== null) {
    if (ratingDir === 0 && hikeDir === 0) ratingNote = "Rating and hike are unchanged from last cycle.";
    else if (ratingDir >= 0 && hikeDir >= 0) ratingNote = ratingDir > 0 ? "Hike has tracked the rising rating." : "Rating steady; hike rose.";
    else if (ratingDir <= 0 && hikeDir <= 0) ratingNote = "Hike has tracked the falling rating.";
    else if (ratingDir > 0) ratingNote = "Rating rose but hike fell — worth a look.";
    else ratingNote = "Rating fell but hike rose — worth a look.";
  }

  const trendWord = (key) => {
    const vals = col(key).filter((v) => v !== null && v !== undefined);
    if (vals.length < 2) return null;
    const d = Math.sign(last(vals) - vals[vals.length - 2]);
    return d > 0 ? "up" : d < 0 ? "down" : "flat";
  };
  const contribTrends = ["rr", "margin", "ic"].map(trendWord).filter(Boolean);
  const contribNote = !contribTrends.length
    ? "No earlier RR %, margin or interview data to compare."
    : contribTrends.every((t) => t === "up")
      ? "All trending up."
      : contribTrends.every((t) => t === "down")
        ? "All trending down."
        : "Mixed trends across RR %, margin and interviews.";

  /* ---- experience ---- */
  const yoeNow = cur.yoe;
  let yoeNote = "No peers to compare against yet.";
  if (yoeNow !== null && yoeLo !== null) {
    const place = yoeNow < yoeLo ? "Below" : yoeNow > yoeHi ? "Above" : "Within";
    yoeNote = `${place} peer range (${fx(yoeMid, 2)} median, ${fx(yoeLo, 2)}–${fx(yoeHi, 2)})`;
  } else if (!enoughPeers) {
    yoeNote = `Not enough peers (${peers.length}) with this basis.`;
  }

  /* ---- reward ---- */
  // Target PB agreed last year = the newest earlier cycle's Target PB in the
  // Employee History panel; falls back to the sheet's target column.
  const target = nz(num(history?.[0]?.targetPB)) ?? nz(num(employee.targetPBAllocatedForMay));
  const pbPct = target ? (live.pb / target) * 100 : null;
  const remarks = String(employee.compManagerRemarks ?? "").trim();

  /* ---- rewards analysis + flags ---- */
  const flags = [];
  const promoYes = norm(employee.eligibleForPromotion) === "yes";
  const titleChanged = norm(employee.newTitle) && norm(employee.newTitle) !== norm(employee.designation);
  if (prev && ratingDir > 0 && hikeDir < 0) flags.push("Rating rose but hike fell.");
  if (prev && ratingDir < 0 && hikeDir > 0) flags.push("Rating fell but hike rose.");
  if (promoYes && !titleChanged) flags.push("Marked eligible for promotion but the title is unchanged.");
  if (String(employee.atRisk ?? "").trim() && !(live.rb > 0)) flags.push("Flagged At Risk with no retention bonus.");
  if (peerRaiseMedian !== null && cur.mgr !== null && cur.mgr <= 2 && totalRaise > peerRaiseMedian) {
    flags.push("Low rating but total raise is above the peer median.");
  }

  const hikeHistory = series
    .filter((s) => !s.current && s.hike !== null)
    .map((s) => `${fx(s.hike)}%`);
  const prevTotal = prev && prev.total ? prev.total : null;

  /* ---- feedback completeness (flag card) ---- */
  const missing = [];
  if (cur.mgr === null) missing.push("Manager rating");
  if (!String(employee.managerFeedback ?? "").trim()) missing.push("Manager feedback");
  if (nz(num(employee.clientRating)) === null) missing.push("Client rating");
  if (cur.rr === null) missing.push("RR %");

  return (
    <div className="mx">
      <style>{MX_CSS}</style>

      <div className="mx-ctrl">
        <button type="button" className="mx-cust" onClick={() => setCustom((v) => !v)} aria-expanded={custom}>
          ⚙ Customize which metrics show
        </button>
        <label className="mx-peer">
          Peers:
          <select value={basis} onChange={(e) => pickBasis(e.target.value)}>
            {PEER_BASES.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>

      {custom ? (
        <div className="mx-custp">
          {CARDS.map(([k, l]) => (
            <label key={k}>
              <input type="checkbox" checked={!!shown[k]} onChange={(e) => setShownKey(k, e.target.checked)} /> {l}
            </label>
          ))}
        </div>
      ) : null}

      {historyLoading ? <div className="mx-note-sm">Loading earlier cycles…</div> : null}

      <div className="mx-ra">
        <b>{flags.length ? "⚠ Rewards analysis" : "✓ Rewards analysis"}</b>
        <ul>
          <li>
            Hike: {fx(cur.hike)}% this cycle
            {hikeHistory.length ? ` — history ${hikeHistory.join(", ")}` : ""}
          </li>
          <li>
            Bonus: ₹{lakh(live.pb + live.rb)}
            {prevTotal ? `, ${live.pb + live.rb >= prevTotal ? "up" : "down"} from ₹${lakh(prevTotal)} last cycle` : ""}
            {pbPct !== null ? ` · PB paid ${fx(pbPct, 0)}% of target` : ""}
          </li>
          <li>
            Total reward hike {totalRaise >= 0 ? "+" : "−"}
            {Math.abs(totalRaise).toFixed(1)}% on previous total rewards
            {peerRaiseMedian !== null ? ` · peer median ${fx(peerRaiseMedian)}% (${basisLabel})` : ""}
          </li>
          <li>
            Rating {cur.mgr !== null ? `${fx(cur.mgr)}/5` : "—"}
            {ratingDir > 0 ? ", rising" : ratingDir < 0 ? ", falling" : prev && cur.mgr !== null ? ", steady" : ""}
          </li>
          {promoYes ? (
            <li className="promo">
              Promotion: eligible
              {titleChanged ? `, title changed to ${employee.newTitle}` : ", title not changed"}
            </li>
          ) : null}
          {flags.map((f) => (
            <li key={f} className="exc">
              ⚠ {f}
            </li>
          ))}
        </ul>
        <div className="mx-take">
          {flags.length
            ? `${flags.length} item${flags.length === 1 ? "" : "s"} to review.`
            : "No inconsistency flagged — hike, bonus, rating and contribution look consistent."}
        </div>
      </div>

      <div className="mx-grid">
        {shown.rating ? (
          <Card
            id="mx-rating"
            title="Rating metric"
            sub={`last ${series.length} cycle${series.length === 1 ? "" : "s"}`}
            open={!!open.rating}
            onToggle={() => toggle("rating")}
            detail={
              <DetailTable
                head={["Cycle", "Mgr Rating", "Hike%"]}
                rows={series.map((s) => ({
                  label: s.label,
                  current: s.current,
                  cells: [s.mgr === null ? "—" : `${fx(s.mgr)}/5`, s.hike === null ? "—" : `${fx(s.hike)}%`],
                }))}
              />
            }
          >
            <TrendRow label="Mgr Rating" value={cur.mgr === null ? "—" : `${fx(cur.mgr)}/5`} values={col("mgr")} color="#102A43" />
            <TrendRow label="Hike %" value={cur.hike === null ? "—" : `${fx(cur.hike)}%`} values={col("hike")} color="#14B8A6" />
            <div className="mx-n">
              {ratingNote}
              <div className="mx-n2">
                Total reward hike {fx(totalRaise)}%
                {peerRaiseMedian !== null
                  ? ` — ${Math.abs(totalRaise - peerRaiseMedian) < 0.05 ? "in line with" : totalRaise > peerRaiseMedian ? "above" : "below"} peer median ${fx(peerRaiseMedian)}% (${basisLabel})`
                  : ` — not enough peers (${peers.length}) on ${basisLabel}`}
                .
              </div>
            </div>
          </Card>
        ) : null}

        {shown.contribution ? (
          <Card
            id="mx-contribution"
            title="Contribution metric"
            sub={`last ${series.length} cycle${series.length === 1 ? "" : "s"}`}
            open={!!open.contribution}
            onToggle={() => toggle("contribution")}
            detail={
              <DetailTable
                head={["Cycle", "RR%", "Margin", "Interviews"]}
                rows={series.map((s) => ({
                  label: s.label,
                  current: s.current,
                  cells: [
                    s.rr === null ? "—" : `${fx(s.rr, 0)}%`,
                    s.margin === null ? "—" : fx(s.margin),
                    s.ic === null ? "—" : String(s.ic),
                  ],
                }))}
              />
            }
          >
            <TrendRow label="RR%" value={cur.rr === null ? "—" : `${fx(cur.rr, 0)}%`} values={col("rr")} color="#1D4FA8" />
            <TrendRow label="Margin" value={cur.margin === null ? "—" : fx(cur.margin)} values={col("margin")} color="#D9822B" />
            <TrendRow label="Interviews" value={cur.ic === null ? "—" : String(cur.ic)} values={col("ic")} color="#6B7280" />
            <div className="mx-n">{contribNote}</div>
          </Card>
        ) : null}

        {shown.experience ? (
          <Card
            id="mx-experience"
            title="Experience metric"
            sub={`vs peers, ${basisLabel}`}
            open={!!open.experience}
            onToggle={() => toggle("experience")}
            detail={
              <DetailTable
                head={["Cycle", "YoE Ratio", "Peer range"]}
                rows={series.map((s) => ({
                  label: s.label,
                  current: s.current,
                  cells: [
                    s.yoe === null ? "—" : fx(s.yoe, 2),
                    s.current && yoeLo !== null ? `${fx(yoeLo, 2)}–${fx(yoeHi, 2)}` : "—",
                  ],
                }))}
              />
            }
          >
            <div className="mx-st2">
              <div className="mx-s">
                <div className="mx-l">Org Exp.</div>
                <div className="mx-v">{num(employee.wissenExperience) === null ? "—" : `${fx(num(employee.wissenExperience))}y`}</div>
              </div>
              <div className="mx-s">
                <div className="mx-l">Overall Exp.</div>
                <div className="mx-v">{num(employee.totalExperience) === null ? "—" : `${fx(num(employee.totalExperience))}y`}</div>
              </div>
            </div>
            <TrendRow label="YoE Ratio" value={yoeNow === null ? "—" : fx(yoeNow, 2)} values={col("yoe")} color="#9333EA" />
            <div className="mx-n">{yoeNote}</div>
          </Card>
        ) : null}

        {shown.reward ? (
          <Card
            id="mx-reward"
            title="Reward metric"
            sub="this cycle"
            open={!!open.reward}
            onToggle={() => toggle("reward")}
            detail={
              <DetailTable
                head={["Cycle", "PB", "RB", "Total"]}
                rows={series.map((s) => ({
                  label: s.label,
                  current: s.current,
                  cells: [lakh(s.pb), lakh(s.rb), lakh(s.total)],
                }))}
              />
            }
          >
            <div className="mx-st2">
              <div className="mx-s">
                <div className="mx-l">Target PB (last yr)</div>
                <div className="mx-v">{target === null ? "—" : lakh(target)}</div>
              </div>
              <div className="mx-s">
                <div className="mx-l">PB Paid</div>
                <div className="mx-v">
                  {lakh(live.pb)}
                  {pbPct !== null ? ` · ${fx(pbPct, 0)}%` : ""}
                </div>
              </div>
            </div>
            <TrendRow label="Total Bonus" value={lakh(live.pb + live.rb)} values={col("total")} color="#D9822B" />
            {remarks ? <div className="mx-n mx-q">“{remarks}” — Comp. Manager Remarks</div> : null}
          </Card>
        ) : null}
      </div>

      {shown.flag ? (
        <div className={"mx-flag" + (missing.length ? " warn" : "")}>
          <b>Feedback completeness</b>
          <div>{missing.length ? `Missing for ${currentCycleName}: ${missing.join(", ")}.` : "All feedback inputs are recorded for this cycle."}</div>
        </div>
      ) : null}

      <div className="mx-note-sm">
        Peers = other employees on your sheet with the same {basisLabel.toLowerCase()} ({peers.length} found
        {enoughPeers ? "" : `; at least ${MIN_PEERS} needed to compare`}).
      </div>
    </div>
  );
}

const MX_CSS = `
.mx{padding-top:4px;color:${INK}}
.mx *{box-sizing:border-box}
.mx-ctrl{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin:0 0 6px}
.mx-cust{background:none;border:0;padding:0;font:inherit;font-size:11.5px;color:#1D4FA8;font-weight:600;cursor:pointer}
.mx-peer{display:flex;align-items:center;gap:5px;font-size:11.5px;color:#374151}
.mx-peer select{font:inherit;font-size:11.5px;border:1px solid #D1D5DB;border-radius:5px;padding:2px 5px;background:#fff;color:${INK};font-weight:700}
.mx-custp{background:#F7F9FC;border:1px solid #E5E7EB;border-radius:8px;padding:7px 9px;margin:0 0 7px;font-size:11.5px;color:#374151}
.mx-custp label{display:flex;align-items:center;gap:6px;margin:3px 0;cursor:pointer}
.mx-ra{background:#F2FAF4;border:1px solid #BFE3C8;border-radius:8px;padding:8px 10px;margin:0 0 7px;font-size:11.5px;color:#14532D;line-height:1.4}
.mx-ra b{font-size:12.5px}
.mx-ra ul{margin:4px 0 5px;padding-left:14px;list-style:disc}
.mx-ra li{margin-bottom:1px}
.mx-ra li.exc{color:#B42318}
.mx-ra li.promo{color:#7A5B12}
.mx-take{font-style:italic;color:#166534}
.mx-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:7px;margin-bottom:7px}
.mx-card{border:1px solid #E5E7EB;border-radius:9px;padding:7px 8px;min-width:0;cursor:pointer;transition:box-shadow .15s;background:#fff}
.mx-card:hover{box-shadow:0 1px 4px rgba(16,42,67,.15)}
.mx-card:focus-visible{outline:2px solid #2F6FED;outline-offset:1px}
.mx-top{display:flex;justify-content:space-between;align-items:flex-start;gap:6px;margin-bottom:4px}
.mx-name{font-size:11px;font-weight:800;color:${INK};text-transform:capitalize;letter-spacing:.02em}
.mx-chev{font-size:11px;color:#9CA3AF;margin-left:4px}
.mx-cyc{font-size:10px;color:#9CA3AF;margin-top:1px;text-align:right}
.mx-tr{margin-bottom:4px}
.mx-tr:last-child{margin-bottom:0}
.mx-trh{display:flex;justify-content:space-between;align-items:baseline;gap:6px;margin-bottom:2px}
.mx-lab{font-size:10.5px;color:#4B5563}
.mx-val{font-size:13px;font-weight:800;color:#111827;text-align:right}
.mx-sp{display:flex;width:100%}
.mx-sp svg{width:100%;height:18px;display:block}
.mx-sp-empty{font-size:10px;color:#9CA3AF;font-style:italic}
.mx-n{font-size:11px;color:#4B5563;margin-top:4px;padding-top:4px;border-top:1px dashed #E5E7EB;line-height:1.25}
.mx-n2{font-size:11px;color:#4B5563;margin-top:3px;line-height:1.25}
.mx-q{font-style:italic}
.mx-st2{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-bottom:4px}
.mx-s{background:#F7F8F9;border-radius:5px;padding:4px}
.mx-l{font-size:9.5px;color:#6B7280;line-height:1.1}
.mx-v{font-size:12.5px;font-weight:800;color:#111827;margin-top:1px}
.mx-det{margin-top:5px;padding-top:5px;border-top:1px dashed #E5E7EB;cursor:default}
.mx-det table{width:100%;border-collapse:collapse;font-size:10px}
.mx-det th{text-align:left;color:#9CA3AF;font-weight:700;padding:2px 3px;border-bottom:1px solid #F0F1F3}
.mx-det td{padding:2px 3px;color:#374151;border-bottom:1px solid #F7F8F9}
.mx-det td.cur{font-weight:800;color:#111827}
.mx-flag{border:1px solid #E5E7EB;border-radius:8px;padding:7px 9px;margin:0 0 7px;font-size:11.5px;color:#374151;background:#fff}
.mx-flag.warn{border-color:#F3C77B;background:#FFF8E8;color:#7A5B12}
.mx-note-sm{font-size:10.5px;color:#6B7280;margin:2px 0 6px}
`;

/* Safety net: if anything in the Metrics tab fails on real data, only this tab
   shows the message. The rest of the Detail Screen (history, Manager / Client /
   Other feedback, the form) keeps working. */
class MetricsBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.error("Metrics tab failed:", error);
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: "10px 4px", fontSize: 12, color: "#B42318" }}>
          Metrics could not be shown: {String(this.state.error?.message || this.state.error)}
        </div>
      );
    }
    return this.props.children;
  }
}

export function DetailMetricsTab(props) {
  return (
    <MetricsBoundary resetKey={props.employee?.id}>
      <DetailMetricsTabInner {...props} />
    </MetricsBoundary>
  );
}