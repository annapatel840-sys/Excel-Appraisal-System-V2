import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { useAccess } from "@/lib/access-store";
import { useCurrentCycleInfo } from "@/lib/current-cycle";
import { useSelectedLocation } from "@/lib/location-store";
import { useCompareCycles, usePreviousCycleData } from "@/lib/overview-compare";
import { MIN_GROUP, bareCycleName, calcHikePct, inr, ratingOf } from "@/lib/dashboard-overview";
import {
  DEFAULT_AGAINST,
  DIM_GROUPS,
  EXC_BAR,
  EXC_COLOR,
  GUIDE_OWNER,
  GUIDE_SOURCES,
  OUTPUTS,
  ORDERED,
  PART_COLOR,
  bucketsOf,
  describeGroup,
  dimensionsFor,
  excAfter,
  fmtAvg,
  guideSourcesFor,
  insightLines,
  loadGuidance,
  ownerSourceOf,
  parseCuts,
  pbCounts,
  pbPair,
  pbPaid,
  pbStatus,
  pbTarget,
  rangeFor,
  ratingOfLabel,
  saveGuidance,
  shadesOf,
} from "@/lib/dashboard-analysis";
import { PEOPLE_COLS, PeopleList, YearMenu } from "./DashboardOverview";
import { DashboardOutliers, useOutlierFlags } from "./DashboardOutliers";
import { useScopedRows } from "./useScopedRows";

import "./overview.css";

/* The Dashboard tab: how hike, promotions and bonus are spread across the people
   in scope, split "against" Manager Rating, Promotion, RR% and so on, plus the
   Outliers To Review view. It reads the same rows as the Overview tab. "Compare
   With" is the same control and the same previous-cycle data as the Overview: the
   closed appraisal cycles of the selected location, same people only. */

const NOW = "#27548A";
const OUT_TABS = [...OUTPUTS.map((o) => [o.k, o.label]), ["o", "Outliers To Review"]];

// "**bold** and plain" -> React nodes (no HTML is ever injected).
const Rich = ({ text }) =>
  String(text)
    .split("**")
    .map((t, i) => (i % 2 ? <b key={i}>{t}</b> : <Fragment key={i}>{t}</Fragment>));

const short = (name) => String(name).replace(/^Exceptional\s+/i, "Exc. ");

/* ---------------- one bar ---------------- */

function BarLine({ value, scale, color, h, text, tip, add = 0, band, w }) {
  const pos = (v) => Math.max(0, Math.min(100, (v / scale) * 100));
  const bl = band ? Math.min(band[0], scale) : 0;
  const bh = band ? Math.min(band[1], scale) : 0;
  return (
    <div className="dpx-line" data-tip={tip}>
      <div className="dpx-trk">
        <div className="dpx-track" style={{ height: h, borderRadius: h / 2 }}>
          <div style={{ width: `${pos(value)}%`, background: color }} />
          {add > 0 ? <div style={{ width: `${pos(add)}%`, background: EXC_COLOR }} /> : null}
        </div>
        {band ? (
          <div
            className="dpx-guide"
            data-tip={`Your hike range ${band[0]} to ${band[1]}%`}
            style={{ left: `${pos(bl)}%`, width: `${Math.max(0.6, pos(bh) - pos(bl))}%` }}
          />
        ) : null}
      </div>
      <span className="dpx-txt" style={{ width: w }}>{text}</span>
    </div>
  );
}

/* ---------------- chart: bars ---------------- */

function BarsView({ T, m, onOpen, openGuide }) {
  const { measure, SC, kind, multi, excShown, rngOn, DG, thisCycle } = m;
  const w = (kind === "a" ? 104 : 52) + (multi ? 52 : 0) + (excShown ? 88 : 0);
  return (
    <div className="dpx-rows">
      {T.map((d) => {
        if (d.few) {
          return (
            <div className="dpx-grp" key={d.label} onClick={() => onOpen(d.label, d.rows)}>
              <div className="dpx-head"><b>{d.label}</b><span className="mut dpx-few">{d.n === 0 ? "No People" : `Under ${MIN_GROUP} people`}</span></div>
            </div>
          );
        }
        const rg = rngOn ? rangeFor(DG, ratingOfLabel(d.label)) : null;
        return (
          <div className="dpx-grp" key={d.label} onClick={() => onOpen(d.label, d.rows)}>
            <div className="dpx-head"><b>{d.label}</b><span className="mut dpx-few">{inr(d.n)}</span></div>
            {d.parts.map(({ part, st, cmp, exc }) =>
              st ? (
                <div key={part.k}>
                  <BarLine
                    value={st.avg}
                    scale={SC[part.k]}
                    color={PART_COLOR[part.k] || NOW}
                    h={11}
                    w={w}
                    band={part.k === "hk" ? rg : null}
                    tip={`${part.label} · ${thisCycle} · ${inr(st.n)} people`}
                    text={<>{multi ? <span className="mut pre">{part.label} </span> : null}<b>{fmtAvg(part.kind, st.avg)}</b></>}
                  />
                  {cmp.map((x) => (
                    <BarLine
                      key={x.c.key}
                      value={x.st.avg}
                      add={x.add}
                      scale={SC[part.k]}
                      color={shadesOf(PART_COLOR[part.k] || NOW)[x.j % 3]}
                      h={7}
                      w={w}
                      tip={`${part.label} · ${x.c.name} · ${inr(x.pn)} of the same people${x.add > 0 ? ` · plus Exceptional raises: ${x.n} people got a raise` : ""}`}
                      text={<>{fmtAvg(part.kind, x.st.avg)}{x.add > 0 ? <span className="dpx-add"> +{x.add.toFixed(2)}</span> : null}</>}
                    />
                  ))}
                  {exc.map((x) => (
                    <BarLine
                      key={x.c.key}
                      value={x.st.avg}
                      scale={SC[part.k]}
                      color={EXC_BAR}
                      h={7}
                      w={w}
                      tip={`${part.label} · ${x.c.name} · ${inr(x.n)} people got it`}
                      text={<><span className="dpx-add">{short(x.c.name)} </span>{fmtAvg(part.kind, x.st.avg)}</>}
                    />
                  ))}
                  {part.k === "hk" && rg ? <GuideSplit d={d} rg={rg} openGuide={openGuide} /> : null}
                </div>
              ) : (
                <div className="mut dpx-few" key={part.k}>{part.label}: nobody has a value here</div>
              ),
            )}
          </div>
        );
      })}
    </div>
  );
}

// Below / within / above the hike guidance for one rating.
function GuideSplit({ d, rg, openGuide }) {
  const hk = (r) => calcHikePct(r);
  const below = d.rows.filter((r) => hk(r) < rg[0]);
  const above = d.rows.filter((r) => hk(r) > rg[1]);
  const within = d.rows.filter((r) => hk(r) >= rg[0] && hk(r) <= rg[1]);
  const pc = (n) => (d.n ? (n / d.n) * 100 : 0);
  const rt = ratingOfLabel(d.label);
  const item = (label, rows, color, what) =>
    rows.length ? (
      <button
        type="button"
        className="dpx-gs"
        data-tip="List these people"
        onClick={(e) => {
          e.stopPropagation();
          openGuide({ kind: "hk", rows, lo: rg[0], hi: rg[1], title: `${d.label} · Hike ${label} Guidance`, filter: `Rating ${rt} · Hike % ${what} (guidance ${rg[0]} to ${rg[1]}%)` });
        }}
      >
        <b style={{ color }}>{rows.length}</b> {label}
      </button>
    ) : (
      <span><b style={{ color }}>0</b> {label}</span>
    );
  return (
    <div className="dpx-split" data-tip={`Guidance ${rg[0]} to ${rg[1]}%`}>
      <div className="dpx-sbar">
        <i style={{ width: `${pc(below.length)}%`, background: "#E0A93B" }} />
        <i style={{ width: `${pc(within.length)}%`, background: "#4F7FB8" }} />
        <i style={{ width: `${pc(above.length)}%`, background: "#C2562B" }} />
      </div>
      <div className="dpx-slab">
        {item(`within ${rg[0]} to ${rg[1]}%`, within, "#4F7FB8", `between ${rg[0]} and ${rg[1]}`)}
        {item("below", below, "#B7791F", `below ${rg[0]}`)}
        {item("above", above, "#C2562B", `above ${rg[1]}`)}
      </div>
    </div>
  );
}

/* ---------------- chart: PB paid against the target agreed last year ---------------- */

function PvtView({ T, m, onOpen, openGuide }) {
  const { DP, tol, g1IsRating } = m;
  return (
    <div className="dpx-rows">
      {T.map((d) => {
        if (d.few) {
          return (
            <div className="dpx-grp" key={d.label} onClick={() => onOpen(d.label, d.rows)}>
              <div className="dpx-head"><b>{d.label}</b><span className="mut dpx-few">{d.n === 0 ? "No People" : `Under ${MIN_GROUP} people`}</span></div>
            </div>
          );
        }
        const ta = d.parts.find((x) => x.part.k === "tpl");
        const pa = d.parts.find((x) => x.part.k === "pbl");
        const head = <div className="dpx-head"><b>{d.label}</b><span className="mut dpx-few">{inr(d.n)}</span></div>;
        if (!ta?.st || !pa?.st) {
          return (
            <div className="dpx-grp" key={d.label} onClick={() => onOpen(d.label, d.rows)}>
              {head}
              <div className="mut dpx-few">Nobody here has a target agreed last year</div>
            </div>
          );
        }
        const tv = ta.st.avg;
        const pv = pa.st.avg;
        const gap = pv - tv;
        const pc = tv ? (gap / tv) * 100 : 0;
        const g = g1IsRating ? rangeFor(DP, ratingOfLabel(d.label)) : null;
        const lo = g ? g[0] : 100 - tol;
        const hi = g ? g[1] : 100 + tol;
        const rt = tv ? (pv / tv) * 100 : 0;
        const ok = rt >= lo && rt <= hi;
        const label = ok ? "On Target" : gap > 0 ? "Over Target" : "Under Target";
        const col = ok ? "#5B7A99" : gap > 0 ? "#B7791F" : "#3E6FA8";
        const sc = Math.max(tv, pv, 1) * 1.12;
        const cn = pbCounts(d.rows, DP, tol);
        const sp = (n) => (cn.n ? (n / cn.n) * 100 : 0);
        const mk = (sg, txt, color, what) => {
          const rr = d.rows.filter((r) => pbStatus(r, DP, tol) === sg);
          if (!rr.length) return <span key={txt}><b style={{ color }}>0</b> {txt}</span>;
          return (
            <button
              key={txt}
              type="button"
              className="dpx-gs"
              data-tip="List these people"
              onClick={(e) => {
                e.stopPropagation();
                openGuide({ kind: "pb", rows: rr, lo, hi, title: `${d.label} · PB Paid ${txt} Guidance`, filter: `${d.label} · PB paid ${what} (guidance ${lo} to ${hi}% of target)` });
              }}
            >
              <b style={{ color }}>{rr.length}</b> {txt}
            </button>
          );
        };
        return (
          <div className="dpx-grp" key={d.label} onClick={() => onOpen(d.label, d.rows)}>
            {head}
            <div className="dpx-line">
              <div className="dpx-trk">
                <div className="dpx-track" style={{ height: 14, borderRadius: 7 }}>
                  <div style={{ width: `${(pv / sc) * 100}%`, background: "#1D3B5E" }} />
                </div>
                {g ? (
                  <div
                    className="dpx-guide tall"
                    data-tip={`Guidance ${g[0]} to ${g[1]}% of target`}
                    style={{ left: `${((tv * g[0]) / 100 / sc) * 100}%`, width: `${(((g[1] - g[0]) / 100) * tv / sc) * 100}%` }}
                  />
                ) : null}
                <div className="dpx-target" data-tip={`Target agreed last year ${inr(tv)}`} style={{ left: `calc(${(tv / sc) * 100}% - 1px)` }} />
              </div>
              <div className="dpx-bull">
                <span className="nw"><span className="mut">Paid</span> <b>{inr(pv)}</b> <span className="mut">of</span> <span className="tg">{inr(tv)}</span></span>
                <span className="dpx-pill" style={{ color: col }}>{pc >= 0 ? "+" : "−"}{Math.abs(pc).toFixed(1)}% · {label}</span>
              </div>
            </div>
            {cn.n ? (
              <div className="dpx-split" data-tip="People paid below, within or above the guidance">
                <div className="dpx-sbar">
                  <i style={{ width: `${sp(cn.u)}%`, background: "#3E6FA8" }} />
                  <i style={{ width: `${sp(cn.o)}%`, background: "#B8C0CC" }} />
                  <i style={{ width: `${sp(cn.v)}%`, background: "#E0A93B" }} />
                </div>
                <div className="dpx-slab">
                  {mk(-1, "below", "#3E6FA8", `below ${lo}% of target`)}
                  {mk(0, "within", "#5B7A99", `between ${lo} and ${hi}% of target`)}
                  {mk(1, "above", "#B7791F", `above ${hi}% of target`)}
                  <span className="mut">of {cn.n} people</span>
                </div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- chart: columns and table ---------------- */

function ColumnsView({ T, m, onOpen }) {
  const kinds = new Set(m.measure.parts.map((p) => p.kind));
  if (kinds.size > 1) return <div className="mut dpx-note">Columns need measures of the same type (all amounts, or all percentages). Use Bars.</div>;
  let mx = 0;
  T.forEach((d) => d.parts.forEach((pt) => { if (pt.st) mx = Math.max(mx, pt.st.avg); }));
  mx = mx * 1.1 || 1;
  const H = 150;
  return (
    <>
      <div className="dpx-cols">
        <div>
          {T.map((d) =>
            d.few ? (
              <div className="dpx-col" key={d.label}>
                <div className="bars mut"><span style={{ fontSize: 9.5 }}>{d.n === 0 ? "none" : `<${MIN_GROUP}`}</span></div>
                <div className="cap nm">{d.label}</div>
              </div>
            ) : (
              <div className="dpx-col click" key={d.label} onClick={() => onOpen(d.label, d.rows)}>
                <div className="bars" style={{ height: H }}>
                  {d.parts.map(({ part, st }) =>
                    st ? (
                      <div key={part.k} data-tip={`${part.label} · ${d.label} · ${inr(d.n)} people`} className="one">
                        <span>{fmtAvg(part.kind, st.avg)}</span>
                        <i style={{ height: Math.max(2, (st.avg / mx) * H), background: PART_COLOR[part.k] || NOW }} />
                      </div>
                    ) : null,
                  )}
                </div>
                <div className="cap nm">{d.label}</div>
              </div>
            ),
          )}
        </div>
      </div>
      {m.regCycles.length ? <div className="mut dpx-note">Compare With is shown in Bars and Table.</div> : null}
    </>
  );
}

function TableView({ T, total, m, onOpen }) {
  const { measure, regCycles } = m;
  const cols = [];
  measure.parts.forEach((p) => {
    cols.push({ p, c: null });
    regCycles.forEach((c) => cols.push({ p, c }));
  });
  const cell = (d, { p, c }) => {
    const pt = d.parts.find((x) => x.part.k === p.k);
    if (!pt || !pt.st) return <td className="n mut" key={`${p.k}${c?.key}`}>–</td>;
    if (!c) return <td className="n" key={p.k}><b>{fmtAvg(p.kind, pt.st.avg)}</b></td>;
    const x = pt.cmp.find((y) => y.c.key === c.key);
    return <td className="n mut" key={`${p.k}${c.key}`}>{x ? fmtAvg(p.kind, x.st.avg) : "–"}</td>;
  };
  return (
    <div className="tw">
      <table>
        <thead>
          <tr>
            <th>{m.dim1.label}</th>
            <th className="n">People</th>
            {cols.map(({ p, c }) => <th className="n" key={`${p.k}${c?.key}`}>{p.label}{c ? ` · ${c.name.replace(/^Annual\s+/i, "")}` : ""}</th>)}
          </tr>
        </thead>
        <tbody>
          {T.map((d) =>
            d.few ? (
              <tr className="data" key={d.label}>
                <td className="rl">{d.label}</td>
                <td className="n">{d.n}</td>
                <td className="n mut" colSpan={cols.length}>Under {MIN_GROUP} people</td>
              </tr>
            ) : (
              <tr className="data click" key={d.label} onClick={() => onOpen(d.label, d.rows)}>
                <td className="rl">{d.label}</td>
                <td className="n">{inr(d.n)}</td>
                {cols.map((c) => cell(d, c))}
              </tr>
            ),
          )}
          <tr className="tot">
            <td className="rl">Total</td>
            <td className="n">{inr(total.n)}</td>
            {cols.map((c) => cell(total, c))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

/* ---------------- guidance numbers ---------------- */

function RangeInput({ value, placeholder, onCommit }) {
  return (
    <input
      key={String(value)}
      className="dpx-rin"
      type="number"
      step="0.5"
      placeholder={placeholder}
      defaultValue={Number.isFinite(value) ? value : ""}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        const v = parseFloat(e.target.value);
        onCommit(Number.isNaN(v) ? null : v);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
    />
  );
}

function GuidanceBlock({ title, msg, src, sources, setSrc, own, ratings, map, onSet, onReset, kind, openGuide, rows }) {
  const edit = src === own;
  const any = Object.keys(map || {}).length > 0;
  return (
    <div>
      <div className="cap dpx-cap">{title}</div>
      <div className="pills dpx-srcp">
        {sources.map((k) => (
          <button key={k} type="button" className={`pill${src === k ? " on" : ""}`} onClick={() => setSrc(k)}>{GUIDE_SOURCES[k]}</button>
        ))}
      </div>
      <div className="mut dpx-msg">{msg(src, edit, any)}</div>
      {src !== "off"
        ? ratings.map(({ label, rows: rr }) => {
            const rn = ratingOfLabel(label);
            const v = map?.[rn] || [];
            const rg = rangeFor(map, rn);
            const outside = rg && kind === "hk" ? rr.filter((r) => calcHikePct(r) < rg[0] || calcHikePct(r) > rg[1]) : [];
            return (
              <div className="dpx-rr" key={label}>
                <div className="top"><b>{label}</b><span className="mut">{inr(rr.length)} people</span></div>
                <div className="ins">
                  {edit ? (
                    <>
                      <RangeInput value={v[0]} placeholder="min %" onCommit={(x) => onSet(rn, 0, x)} />
                      <span className="mut">to</span>
                      <RangeInput value={v[1]} placeholder="max %" onCommit={(x) => onSet(rn, 1, x)} />
                    </>
                  ) : (
                    <>
                      <span className="ro">{Number.isFinite(v[0]) ? v[0] : "–"}</span>
                      <span className="mut">to</span>
                      <span className="ro">{Number.isFinite(v[1]) ? v[1] : "–"}</span>
                    </>
                  )}
                </div>
                {rg && kind === "hk" ? (
                  <div className="out" style={{ color: outside.length ? "var(--amber)" : "var(--muted)" }}>
                    {outside.length ? (
                      <button
                        type="button"
                        className="dpx-gs"
                        onClick={() => openGuide({ kind: "hk", rows: outside, lo: rg[0], hi: rg[1], title: `${label} · Hike Outside Guidance`, filter: `Rating ${rn} · Hike % outside ${rg[0]} to ${rg[1]}%` })}
                      >
                        <b style={{ color: "var(--amber)" }}>{outside.length}</b> of {rr.length} outside range
                      </button>
                    ) : (
                      `0 of ${rr.length} outside range`
                    )}
                  </div>
                ) : null}
              </div>
            );
          })
        : null}
      {edit && any ? <button className="btn" type="button" style={{ marginTop: 8 }} onClick={onReset}>Reset Guidance</button> : null}
    </div>
  );
}

/* ---------------- main ---------------- */

export function DashboardAnalysis({ cmp, onCmpChange }) {
  const { rows, effectiveId } = useScopedRows();
  const { name: cycleName } = useCurrentCycleInfo();
  const [location] = useSelectedLocation();
  const thisCycle = bareCycleName(cycleName) || "This Cycle";
  const access = useAccess();
  const canOpenSheet = access.canScreen("appraisalSheet");

  /* "Compare With": the closed appraisal cycles of the selected location (same list as the Overview). */
  const compareCycles = useCompareCycles();
  const prev = usePreviousCycleData(rows, cmp.length > 0);
  useEffect(() => {
    if (!compareCycles.length) return;
    const keep = cmp.filter((k) => compareCycles.some((c) => c.key === k));
    if (keep.length !== cmp.length) onCmpChange(keep);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compareCycles]);

  const [out, setOut] = useState("inc");
  const [measureKey, setMeasureKey] = useState({});
  const [against, setAgainst] = useState(DEFAULT_AGAINST);
  const [active, setActive] = useState(DEFAULT_AGAINST[0]);
  const [views, setViews] = useState({});
  const [detail, setDetail] = useState(null);
  const [noEx, setNoEx] = useState(() => new Set()); // Exceptional cycles switched off
  const [addOpen, setAddOpen] = useState(false);
  const addRef = useRef(null);

  /* guidance (kept per location) */
  const [G, setG] = useState(() => loadGuidance(location));
  useEffect(() => { setG(loadGuidance(location)); }, [location]);
  const own = ownerSourceOf(effectiveId);
  const sources = guideSourcesFor(effectiveId);
  const [srcState, setSrc] = useState(own);
  useEffect(() => { setSrc(own); }, [own]);
  const src = sources.includes(srcState) ? srcState : own;
  const DG = G.DG[src] || {};
  const DP = G.DP[src] || {};
  const tol = G.TOL;
  const persist = (next) => { setG(next); saveGuidance(location, next); };

  /* hover tip */
  const tipRef = useRef(null);
  const onMove = (e) => {
    const t = tipRef.current;
    if (!t) return;
    const el = e.target.closest ? e.target.closest("[data-tip]") : null;
    if (!el) { t.style.display = "none"; return; }
    t.textContent = el.getAttribute("data-tip");
    t.style.display = "block";
    let x = e.clientX + 12;
    if (x + 270 > window.innerWidth) x = window.innerWidth - 275;
    t.style.left = `${x}px`;
    t.style.top = `${e.clientY + 14}px`;
  };

  useEffect(() => {
    if (!addOpen) return undefined;
    const close = (e) => { if (addRef.current && !addRef.current.contains(e.target)) setAddOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [addOpen]);

  /* parameters ("Against") */
  const dims = useMemo(() => dimensionsFor(effectiveId), [effectiveId]);
  const shown = against.filter((k) => dims.some((d) => d.k === k));
  const list = shown.length ? shown : [dims[0].k];
  const dagKey = list.includes(active) ? active : list[0];
  const dim1 = dims.find((d) => d.k === dagKey);
  const cutsFor = (d) => (d?.numeric ? (G.CUTS[d.k]?.length ? G.CUTS[d.k] : d.cuts) : []);

  /* compared cycles: regular ones (Annual and so on) and Exceptional ones */
  const cmpCycles = useMemo(() => compareCycles.filter((c) => cmp.includes(c.key)), [compareCycles, cmp]);
  const regCycles = useMemo(() => cmpCycles.filter((c) => !c.exceptional), [cmpCycles]);
  const allExc = useMemo(() => compareCycles.filter((c) => c.exceptional), [compareCycles]);
  const selExc = useMemo(() => cmpCycles.filter((c) => c.exceptional), [cmpCycles]);
  const excFor = (c) => excAfter(c, allExc).filter((e) => !noEx.has(e.key));
  const excBars = useMemo(() => {
    const bars = [...selExc];
    regCycles.forEach((c) => excAfter(c, allExc).forEach((e) => {
      if (!noEx.has(e.key) && !bars.includes(e)) bars.push(e);
    }));
    return bars.sort((a, b) => String(a.when).localeCompare(String(b.when)));
  }, [selExc, regCycles, allExc, noEx]);
  const includeExc = allExc.length > 0 && allExc.every((e) => !noEx.has(e.key));

  const output = OUTPUTS.find((o) => o.k === out);
  const measure = output ? output.measures.find((m) => m.k === measureKey[out]) || output.measures[0] : null;
  const isPvt = measure?.k === "pvt";
  const rngOn = !!measure && dim1.k === "mr" && measure.k === "hk";

  const pickOut = (k) => { setOut(k); setDetail(null); };

  /* the numbers */
  const T = useMemo(() => {
    if (!measure) return [];
    const o = { regCycles, excFor, excBars, historyOf: prev.historyOf };
    return bucketsOf(dim1, rows, cutsFor(dim1))
      .map((b) => describeGroup(rows.filter(b.test), b.label, measure.parts, o))
      .filter((d) => d.n > 0);
    // prev.progress.done changes while histories load, so the bars fill in as they arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, dim1, G.CUTS, measure, regCycles, excBars, noEx, allExc, prev.progress.done]);

  const total = useMemo(
    () => (measure ? describeGroup(rows, "Total", measure.parts, { regCycles, excFor: () => [], excBars: [], historyOf: prev.historyOf }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, measure, regCycles, prev.progress.done],
  );

  const SC = useMemo(() => {
    const o = {};
    (measure?.parts || []).forEach((p) => {
      let mx = 0;
      T.forEach((d) => {
        if (d.few) return;
        d.parts.forEach((pt) => {
          if (pt.part.k !== p.k) return;
          if (pt.st) mx = Math.max(mx, pt.st.avg);
          pt.cmp.forEach((x) => { mx = Math.max(mx, x.st.avg + x.add); });
          pt.exc.forEach((x) => { mx = Math.max(mx, x.st.avg); });
        });
      });
      o[p.k] = (mx || 1) * 1.1;
    });
    return o;
  }, [T, measure]);

  /* outliers (flags) */
  const flagsApi = useOutlierFlags({ rows, dims, cuts: G.CUTS, regCycles, historyOf: prev.historyOf, progress: prev.progress.done, location });

  /* people lists */
  const scrollToList = () =>
    setTimeout(() => {
      const el = document.getElementById("ov-people");
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 0);
  const openList = (title, rr) => { setDetail({ title, rows: rr }); scrollToList(); };
  const openGuide = ({ kind, rows: rr, lo, hi, title, filter }) => {
    const offOf = (r) => {
      if (kind === "hk") { const v = calcHikePct(r); return v < lo ? v - lo : v > hi ? v - hi : 0; }
      const c = (pbPaid(r) / pbTarget(r)) * 100;
      return c < lo ? c - lo : c > hi ? c - hi : 0;
    };
    const data = rr
      .filter((r) => kind === "hk" || pbTarget(r) !== null)
      .map((r) => ({ r, o: offOf(r) }))
      .sort((a, b) => Math.abs(b.o) - Math.abs(a.o));
    const offMap = new Map(data.map((x) => [x.r, x.o]));
    const unit = kind === "hk" ? "%" : "% of target";
    const cols = [
      PEOPLE_COLS[0],
      PEOPLE_COLS[1],
      PEOPLE_COLS[2],
      ...(kind === "hk"
        ? [{ k: "hk", l: "Hike %", t: "n", g: (r) => calcHikePct(r), cell: (r) => <td className="n"><b>{calcHikePct(r).toFixed(2)}</b></td> }]
        : [
            { k: "pa", l: "PB Paid", t: "n", g: (r) => pbPaid(r), cell: (r) => <td className="n">{inr(pbPaid(r))}</td> },
            { k: "pt", l: "Target PB", t: "n", g: (r) => pbTarget(r), cell: (r) => <td className="n mut">{inr(pbTarget(r))}</td> },
            { k: "pr", l: "Paid ÷ Target", t: "n", g: (r) => (pbPaid(r) / pbTarget(r)) * 100, cell: (r) => <td className="n"><b>{((pbPaid(r) / pbTarget(r)) * 100).toFixed(0)}%</b></td> },
          ]),
      { k: "gd", l: "Guidance", t: "t", g: () => `${lo} to ${hi}${unit}`, cell: () => <td className="n mut">{lo} to {hi}{unit}</td> },
      {
        k: "off", l: "Off By", t: "n", g: (r) => offMap.get(r) ?? 0,
        cell: (r) => {
          const o = offMap.get(r) ?? 0;
          return (
            <td>
              {o === 0 ? <span className="mut">within</span> : <span style={{ fontWeight: 700, color: o > 0 ? "#B7791F" : "#3E6FA8" }}>{o > 0 ? "+" : "−"}{Math.abs(o).toFixed(1)} pts {o > 0 ? "above" : "below"}</span>}
            </td>
          );
        },
      },
    ];
    setDetail({ title, rows: data.map((x) => x.r), cols, filter });
    scrollToList();
  };

  /* chart model shared by the views */
  const kind = measure?.parts[0].kind || "p";
  const model = {
    measure, SC, kind, dim1, regCycles, thisCycle, DG, DP, tol,
    multi: (measure?.parts.length || 0) > 1,
    excShown: excBars.length > 0,
    rngOn,
    g1IsRating: dim1.k === "mr",
  };
  const view = views[dim1.k] || "g";
  const withData = T.filter((d) => !d.few).length > 0;

  const title = measure ? `${measure.parts.map((p) => p.label).join(" + ")} by ${dim1.label} · Average` : "";
  const lines = !isPvt && measure ? insightLines(T, measure.parts[0], dim1.label, ORDERED.has(dim1.k)) : [];

  /* PB vs target summary */
  const pp = useMemo(() => pbPair(rows), [rows]);
  const cn = useMemo(() => pbCounts(rows, DP, tol), [rows, DP, tol]);
  const pvtNote = useMemo(() => {
    if (!isPvt) return null;
    const u = [], o = [], on = [];
    T.forEach((d) => {
      if (d.few) return;
      const ta = d.parts.find((x) => x.part.k === "tpl");
      const pa = d.parts.find((x) => x.part.k === "pbl");
      if (!ta?.st || !pa?.st) return;
      const tv = ta.st.avg;
      const pc = tv ? ((pa.st.avg - tv) / tv) * 100 : 0;
      const t = `${d.label} (${pc >= 0 ? "+" : "−"}${Math.abs(pc).toFixed(1)}%)`;
      const g2 = dim1.k === "mr" ? rangeFor(DP, ratingOfLabel(d.label)) : null;
      const r2 = 100 + pc;
      if (r2 >= (g2 ? g2[0] : 100 - tol) && r2 <= (g2 ? g2[1] : 100 + tol)) on.push(t);
      else if (pc > 0) o.push(t);
      else u.push(t);
    });
    return { u, o, on, n: u.length + o.length + on.length };
  }, [isPvt, T, dim1, DP, tol]);

  /* ratings with their people, for the guidance panel */
  const ratings = useMemo(
    () => bucketsOf(dims.find((d) => d.k === "mr"), rows, []).map((b) => ({ label: b.label, rows: rows.filter(b.test) })),
    [dims, rows],
  );

  const setRange = (map, rn, i, v) => {
    const cur = G[map][src] || {};
    const row = (cur[rn] || [null, null]).slice();
    row[i] = v;
    const next = { ...G, [map]: { ...G[map], [src]: { ...cur, [rn]: row } } };
    persist(next);
  };
  const resetMap = (map) => persist({ ...G, [map]: { ...G[map], [src]: {} } });

  const hikeMsg = (s, edit, any) =>
    s === "off"
      ? "Guidance is hidden. Pick HR, Tech ED or Comp Manager above to compare hikes against it."
      : edit
        ? "You set this guidance. It applies to the people you see here. The shaded band on the bars follows it."
        : any
          ? `Set by ${GUIDE_OWNER[s].toLowerCase()}. You can see it here but only they can change it.`
          : `Not set yet. ${GUIDE_OWNER[s]} has not given guidance.`;
  const pbMsg = (s, edit, any) =>
    s === "off"
      ? "Guidance is hidden. Pick HR, Tech ED or Comp Manager above."
      : edit
        ? "You set this guidance: PB paid as % of the agreed target, for each rating. For example 90 to 110."
        : any
          ? `Set by ${GUIDE_OWNER[s].toLowerCase()}. You can see it here but only they can change it.`
          : `Not set yet. ${GUIDE_OWNER[s]} has not given guidance.`;

  /* parameter menu, grouped */
  const addable = dims.filter((d) => !list.includes(d.k));

  const tile = (label, value, sub, color) => (
    <div className="tile dpx-sum" key={label}>
      <small>{label}</small>
      <b className="big" style={color ? { color } : undefined}>{value}</b>
      <span className="sub">{sub}</span>
    </div>
  );

  const flagBadge = flagsApi.flaggedCount;
  // Where the Outliers category pills are shown: in the header, beside the tabs.
  const [catSlot, setCatSlot] = useState(null);

  return (
    <div className="ovw" onMouseMove={onMove} onMouseLeave={() => { if (tipRef.current) tipRef.current.style.display = "none"; }}>
      <div className="ovw-tip" ref={tipRef} />

      <div className="ttl ttl-tabs">
        <div className="stabs">
          {OUT_TABS.map(([k, label]) => (
            <button key={k} type="button" className={`stab${out === k ? " on" : ""}`} onClick={() => pickOut(k)}>
              {label}
              {k === "o" ? <span className="dax-badge">{inr(flagBadge)}</span> : null}
            </button>
          ))}
        </div>
        <div className="ttl-slot" ref={setCatSlot} />
        <span className="meta">
          {inr(rows.length)} employees in scope · groups under {MIN_GROUP} people are not shown
        </span>
      </div>

      {out === "o" ? (
        <DashboardOutliers
          rows={rows}
          dims={dims}
          effectiveId={effectiveId}
          api={flagsApi}
          catSlot={catSlot}
          compareCycles={compareCycles}
          cmp={cmp}
          onCmpChange={onCmpChange}
          prev={prev}
          canOpenSheet={canOpenSheet}
        />
      ) : measure ? (
        <>
          {/* Same control and same data as the Overview tab's "Compare With". */}
          <div className="cmp">
            <span className="mut">Show</span>
            <div className="pills">
              {output.measures.map((mm) => (
                <button key={mm.k} type="button" className={`pill${measure.k === mm.k ? " on" : ""}`} onClick={() => { setMeasureKey((p) => ({ ...p, [out]: mm.k })); setDetail(null); }}>
                  {mm.label}
                </button>
              ))}
            </div>
            <span className="mut" style={{ marginLeft: 14 }}>Compare With</span>
            <YearMenu cycles={compareCycles} selected={cmp} onChange={onCmpChange} />
            {allExc.length ? (
              <label className="dpx-chk">
                <input
                  type="checkbox"
                  checked={includeExc}
                  onChange={(e) => setNoEx(e.target.checked ? new Set() : new Set(allExc.map((c) => c.key)))}
                />
                Include Exceptional Raises
              </label>
            ) : null}
            {prev.loading ? <span className="mut" style={{ fontSize: 11 }}>Loading previous cycles… {inr(prev.progress.done)} / {inr(prev.progress.total)}</span> : null}
          </div>

          <div className="cmp" style={{ marginTop: 12 }}>
            <span className="mut">Against</span>
            <div className="pills">
              {list.map((k) => {
                const d = dims.find((x) => x.k === k);
                return (
                  <button key={k} type="button" className={`pill${dagKey === k ? " on" : ""}`} onClick={() => { setActive(k); setDetail(null); }}>
                    {d.label}
                    {list.length > 1 ? (
                      <span
                        className="x"
                        title="Remove"
                        onClick={(e) => { e.stopPropagation(); setAgainst(list.filter((x) => x !== k)); if (active === k) setActive(list.find((x) => x !== k)); setDetail(null); }}
                      >
                        ×
                      </span>
                    ) : null}
                  </button>
                );
              })}
              <span className="dpx-add-wrap" ref={addRef}>
                <button type="button" className="pill add" onClick={() => setAddOpen((o) => !o)}>+ Add Parameter</button>
                {addOpen ? (
                  <div className="ypop dpx-addpop">
                    {addable.length === 0 ? <span className="mut" style={{ fontSize: 12 }}>All parameters are already shown</span> : null}
                    {DIM_GROUPS.map((gname, gi) => {
                      const items = addable.filter((d) => d.g === gi);
                      return items.length ? (
                        <div key={gname}>
                          <div className="cap" style={{ margin: "8px 0 2px" }}>{gname}</div>
                          {items.map((d) => (
                            <button key={d.k} type="button" className="pitem" onClick={() => { setAgainst([...list, d.k]); setActive(d.k); setAddOpen(false); setDetail(null); }}>
                              {d.label}
                            </button>
                          ))}
                        </div>
                      ) : null;
                    })}
                  </div>
                ) : null}
              </span>
            </div>
          </div>

          {isPvt ? (
            <div className="dpx-sums">
              {tile("Target Agreed Last Year", inr(pp.t), `${inr(pp.n)} people with a target`)}
              {tile("PB Paid This Year", inr(pp.p), "same people")}
              {(() => {
                const gp = pp.p - pp.t;
                const gpc = pp.t ? (gp / pp.t) * 100 : 0;
                const within = Math.abs(gpc) <= tol;
                return tile(
                  "Net Gap",
                  `${gp >= 0 ? "+" : "−"}${inr(Math.abs(gp))}`,
                  `${gpc >= 0 ? "+" : "−"}${Math.abs(gpc).toFixed(1)}% · ${within ? "On Target" : gp > 0 ? "Over Target" : "Under Target"}`,
                  within ? "" : gp > 0 ? "#B7791F" : "#3E6FA8",
                );
              })()}
              <div className="tile dpx-sum">
                <small>People vs Target</small>
                <b className="big"><span style={{ color: "#3E6FA8" }}>{cn.u}</span> · <span style={{ color: "#5B7A99" }}>{cn.o}</span> · <span style={{ color: "#B7791F" }}>{cn.v}</span></b>
                <span className="sub">below · within · above guidance</span>
              </div>
            </div>
          ) : null}

          <div className="dpx-main">
            <div className="tile dpx-chart">
              <div className="dpx-chead">
                <small>{title}</small>
                <div className="ctog">
                  {[["g", "Bars"], ["c", "Columns"], ["t", "Table"]].map(([k, l]) => (
                    <button key={k} type="button" className={view === k ? "on" : ""} onClick={() => setViews((p) => ({ ...p, [dim1.k]: k }))}>{l}</button>
                  ))}
                </div>
              </div>

              <div className="sleg">
                {measure.parts.some((p) => p.k === "tpl") && measure.parts.some((p) => p.k === "pbl") ? (
                  <>
                    <span><i style={{ background: "#1D3B5E" }} />PB Paid This Year</span>
                    <span><i style={{ width: 2, height: 12, borderRadius: 0, background: "#111827" }} />Target Agreed Last Year</span>
                  </>
                ) : (
                  measure.parts.map((p) => <span key={p.k}><i style={{ background: PART_COLOR[p.k] || NOW }} />{p.label}</span>)
                )}
                {regCycles.length ? <span className="mut">Thin bars: {regCycles.map((c) => c.name).join(" · ")} (lighter = older)</span> : null}
                {T.some((d) => d.parts.some((p) => p.cmp.some((x) => x.add > 0))) ? <span><i style={{ background: EXC_COLOR }} />Exceptional (added)</span> : null}
                {excBars.map((c) => <span key={c.key}><i style={{ background: EXC_BAR, border: `1px solid ${EXC_COLOR}` }} />{c.name} (Exceptional, only those who got it)</span>)}
              </div>

              {T.length === 0 ? (
                <div className="mut" style={{ padding: "8px 0" }}>No one in scope.</div>
              ) : !withData && view !== "t" && T.every((d) => d.few) ? (
                <div className="mut dpx-note">Every group has fewer than {MIN_GROUP} people, so nothing is shown. Try another parameter.</div>
              ) : view === "t" ? (
                <TableView T={T} total={total} m={model} onOpen={openList} />
              ) : view === "c" ? (
                <ColumnsView T={T} m={model} onOpen={openList} />
              ) : isPvt ? (
                <PvtView T={T} m={model} onOpen={openList} openGuide={openGuide} />
              ) : (
                <BarsView T={T} m={model} onOpen={openList} openGuide={openGuide} />
              )}

              {isPvt && pvtNote && pvtNote.n ? (
                <div className="note dpx-insight">
                  <div className="cap" style={{ marginBottom: 4 }}>What This Shows</div>
                  <div>{pvtNote.u.length} of {pvtNote.n} groups are paid under target, {pvtNote.o.length} over, {pvtNote.on.length} on target (within guidance).</div>
                  {[["Under", pvtNote.u], ["Over", pvtNote.o], ["On target", pvtNote.on]].map(([l, a]) => (a.length ? <div key={l}>{l}: <b>{a.join(", ")}</b></div> : null))}
                </div>
              ) : null}
              {lines.length ? (
                <div className="ins">
                  <div className="cap" style={{ marginBottom: 4 }}>What This Shows</div>
                  {lines.map((l) => <div key={l}><Rich text={l} /></div>)}
                </div>
              ) : null}
            </div>

            <aside className="tile dpx-side">
              <div className="dpx-sh">Ranges and Settings</div>
              {rngOn ? (
                <GuidanceBlock
                  title="Hike % Guidance Per Rating"
                  msg={hikeMsg}
                  src={src}
                  sources={sources}
                  setSrc={setSrc}
                  own={own}
                  ratings={ratings}
                  map={DG}
                  kind="hk"
                  onSet={(rn, i, v) => setRange("DG", rn, i, v)}
                  onReset={() => resetMap("DG")}
                  openGuide={openGuide}
                />
              ) : null}
              {dim1.numeric ? (
                <div>
                  <div className="cap dpx-cap">Ranges for {dim1.label}</div>
                  <input
                    key={cutsFor(dim1).join(",")}
                    className="txt dpx-cut"
                    aria-label="Cut points"
                    defaultValue={cutsFor(dim1).join(", ")}
                    onBlur={(e) => {
                      const v = parseCuts(e.target.value);
                      if (v.length) persist({ ...G, CUTS: { ...G.CUTS, [dim1.k]: v } });
                    }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                  />
                  <div className="mut dpx-msg">Cut points, for example {dim1.cuts.join(", ")}</div>
                  <button className="btn" type="button" style={{ marginTop: 8 }} onClick={() => { const c = { ...G.CUTS }; delete c[dim1.k]; persist({ ...G, CUTS: c }); }}>Reset</button>
                </div>
              ) : null}
              {isPvt ? (
                <>
                  <GuidanceBlock
                    title="PB Guidance Per Rating"
                    msg={pbMsg}
                    src={src}
                    sources={sources}
                    setSrc={setSrc}
                    own={own}
                    ratings={ratings}
                    map={DP}
                    kind="pb"
                    onSet={(rn, i, v) => setRange("DP", rn, i, v)}
                    onReset={() => resetMap("DP")}
                    openGuide={openGuide}
                  />
                  <div>
                    <div className="cap dpx-cap">Where No Guidance Is Set</div>
                    <div className="dpx-tol">
                      <span className="mut">Target ±</span>
                      <input
                        className="dpx-rin"
                        type="number"
                        min="0"
                        step="0.5"
                        defaultValue={tol}
                        key={tol}
                        onBlur={(e) => { const v = parseFloat(e.target.value); if (Number.isFinite(v) && v >= 0 && v !== tol) persist({ ...G, TOL: v }); }}
                        onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
                      />
                      <span className="mut">%</span>
                    </div>
                  </div>
                </>
              ) : null}
              {!rngOn && !dim1.numeric && !isPvt ? (
                <div className="mut" style={{ fontSize: 12 }}>No ranges to set for this view. Choose Hike % against Manager Rating, or a numeric parameter such as RR%.</div>
              ) : null}
            </aside>
          </div>

          {detail ? (
            <PeopleList list={detail} onClose={() => setDetail(null)} canOpenSheet={canOpenSheet} />
          ) : (
            <div className="mut dpx-note" style={{ marginTop: 12 }}>Click a bar or a row to see those people.</div>
          )}
        </>
      ) : null}
    </div>
  );
}