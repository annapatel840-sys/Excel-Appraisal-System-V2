import { useMemo, useRef, useState } from "react";

import { useAccess } from "@/lib/access-store";
import { useCurrentCycleInfo } from "@/lib/current-cycle";
import { useCompareCycles, usePreviousCycleData } from "@/lib/overview-compare";
import { MIN_GROUP, avgBy, bareCycleName, calcHikePct, cycleKeyOf, inr, isPromoted, ratingOf } from "@/lib/dashboard-overview";
import {
  DIM_GROUPS,
  OUTPUTS,
  SPREAD_MODES,
  bucketsOf,
  dimensionsFor,
  fmtVal,
  parseCuts,
  previousStats,
  statsOf,
  valuesOf,
} from "@/lib/dashboard-analysis";
import { Arrow, PeopleList, Toggle, YearMenu } from "./DashboardOverview";
import { useScopedRows } from "./useScopedRows";

import "./overview.css";

/* The Dashboard tab: how hike, promotions and bonus are spread across the people
   in scope, split "against" Manager Rating, Tech-ED, experience and so on. It reads
   the same rows as the Overview tab. "Compare With" is the same control and the same
   previous-cycle data as the Overview: same people only, closed cycles only. */

const NOW = "#27548A";
const PREV = ["#B8C2CE", "#CBD3DC", "#DCE1E7"]; // one shade per compared cycle
const PREV_BAND = ["#A9C4E4", "#C6D8EE", "#DCE8F5"];

/* ---------------- one bar (current or an earlier cycle) ---------------- */

function BarLine({ st, mode, kind, scale, color, tick, thin, label, tip }) {
  const pos = (v) => Math.max(0, Math.min(100, (v / scale) * 100));
  const h = thin ? 6 : 13;
  let track;
  if (mode === "spread") {
    track = (
      <div className="dax-track" style={{ height: h, borderRadius: h / 2 }}>
        <div className="dax-band" style={{ left: `${pos(st.min)}%`, width: `${Math.max(0.8, pos(st.max) - pos(st.min))}%`, background: color, borderRadius: h / 2 }} />
        <div className="dax-tick" style={{ left: `calc(${pos(st.avg)}% - 1px)`, background: tick }} />
      </div>
    );
  } else {
    const v = mode === "avg" ? st.avg : mode === "med" ? st.med : mode === "sum" ? st.sum : st.n;
    track = (
      <div className="dax-track" style={{ height: h, borderRadius: h / 2, overflow: "hidden" }}>
        <div style={{ width: `${pos(v)}%`, height: "100%", background: color }} />
      </div>
    );
  }
  const txt =
    mode === "spread"
      ? `${fmtVal(kind, st.min)} – ${fmtVal(kind, st.max)} · avg ${fmtVal(kind, st.avg)}`
      : mode === "cnt"
        ? inr(st.n)
        : fmtVal(kind, mode === "avg" ? st.avg : mode === "med" ? st.med : st.sum);
  return (
    <div className="dax-line" data-tip={tip}>
      <div className="dax-bar">{track}</div>
      <div className={`dax-txt${thin ? " thin" : ""}`}>
        {label ? <span className="mut">{label} </span> : null}
        {thin ? txt : <b>{txt}</b>}
      </div>
    </div>
  );
}

/* ---------------- main ---------------- */

export function DashboardAnalysis({ cmp, onCmpChange }) {
  const { rows, effectiveId } = useScopedRows();
  const { name: cycleName } = useCurrentCycleInfo();
  const thisCycle = bareCycleName(cycleName) || "This cycle";
  const access = useAccess();
  const canOpenSheet = access.canScreen("appraisalSheet");

  const compareCycles = useCompareCycles();
  const prev = usePreviousCycleData(rows, cmp.length > 0);

  const [out, setOut] = useState("inc");
  const [measureKey, setMeasureKey] = useState({}); // per output
  const [modeBy, setModeBy] = useState({}); // per measure
  const [g1, setG1] = useState("mr");
  const [g2, setG2] = useState("");
  const [cutsText, setCutsText] = useState({}); // per dimension, user typed cut points
  const [view, setView] = useState("g"); // g bars, t table
  const [list, setList] = useState(null);

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

  const dims = useMemo(() => dimensionsFor(effectiveId), [effectiveId]);
  const dim1 = dims.find((d) => d.k === g1) || dims[0];
  const dim2 = g2 && g2 !== dim1.k ? dims.find((d) => d.k === g2) : null;

  const cutsFor = (d) => {
    if (!d?.numeric) return [];
    const typed = cutsText[d.k];
    const parsed = typed === undefined ? d.cuts : parseCuts(typed);
    return parsed.length ? parsed : d.cuts;
  };

  /* ---- outliers (same rule as the Overview tile) ---- */
  const avgHike = avgBy(rows, calcHikePct);
  const highLow = useMemo(() => rows.filter((r) => ratingOf(r) >= 4 && calcHikePct(r) < avgHike - 2), [rows, avgHike]);
  const promoLow = useMemo(() => rows.filter((r) => isPromoted(r) && ratingOf(r) > 0 && ratingOf(r) <= 2), [rows]);
  const outliers = useMemo(() => rows.filter((r) => highLow.includes(r) || promoLow.includes(r)), [rows, highLow, promoLow]);

  const openList = (title, rows_) => {
    setList({ title, rows: rows_ });
    setTimeout(() => {
      const el = document.getElementById("ov-people");
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 0);
  };

  const output = OUTPUTS.find((o) => o.k === out);
  const measure = output ? output.measures.find((m) => m.k === measureKey[out]) || output.measures[0] : null;
  const modes = measure?.modes || SPREAD_MODES;
  const mode = modes.some(([k]) => k === modeBy[measure?.k]) ? modeBy[measure.k] : measure?.mode || "spread";

  /* ---- groups for the chosen split ---- */
  const groups = useMemo(() => {
    if (!measure) return [];
    const b1 = bucketsOf(dim1, rows, cutsFor(dim1));
    return b1.map((b) => {
      const gr = rows.filter(b.test);
      const subs = dim2 ? bucketsOf(dim2, gr, cutsFor(dim2)).map((s) => ({ label: s.label, rows: gr.filter(s.test) })) : [];
      return { label: b.label, rows: gr, subs };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, dim1, dim2, cutsText, measure]);

  const flat = useMemo(() => {
    const o = [];
    groups.forEach((g) => {
      o.push({ ...g, depth: 0 });
      g.subs.forEach((s) => o.push({ ...s, depth: 1 }));
    });
    return o;
  }, [groups]);

  const cmpCycles = cmp.map((key) => compareCycles.find((c) => c.key === key)).filter(Boolean);

  // One description per row: current stats and the same people's earlier stats, per part.
  const described = useMemo(() => {
    if (!measure) return [];
    return flat.map((g) => {
      const few = g.rows.length < MIN_GROUP;
      const parts = measure.parts.map((part) => {
        const st = few ? null : statsOf(valuesOf(g.rows, part));
        const old = few || !st || !part.hist
          ? []
          : cmpCycles.map((c) => ({ c, st: previousStats(g.rows, part, c.key, prev.historyOf, MIN_GROUP) }));
        return { part, st, old };
      });
      return { ...g, few, parts };
    });
    // prev.progress changes while histories load, so the bars fill in as they arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, measure, cmp, compareCycles, prev.progress.done]);

  // Shared scale for the measure (every part is the same kind).
  const scale = useMemo(() => {
    let m = 0;
    described.forEach((d) =>
      d.parts.forEach((p) => {
        const take = (st) => {
          if (!st) return;
          m = Math.max(m, mode === "spread" ? st.max : mode === "cnt" ? st.n : mode === "avg" ? st.avg : mode === "med" ? st.med : st.sum);
        };
        take(p.st);
        p.old.forEach((o) => take(o.st));
      }),
    );
    return (m || 1) * 1.05;
  }, [described, mode]);

  const kind = measure?.parts[0].kind || "p";
  const allRows = rows;
  const overall = useMemo(
    () => (measure ? measure.parts.map((part) => ({ part, st: statsOf(valuesOf(allRows, part)) })) : []),
    [allRows, measure],
  );

  /* ---- "vs previous cycle" lines for the headline numbers (same wording as the Overview) ---- */
  const headLines = useMemo(() => {
    if (!measure || !cmpCycles.length) return [];
    const part = measure.parts[0];
    if (!part.hist) return [];
    return cmpCycles.map((c) => {
      const pairs = [];
      allRows.forEach((r) => {
        const rec = (prev.historyOf(r.empId) || []).find((h) => cycleKeyOf(h.cycleName) === c.key);
        const old = rec ? part.hist(rec) : null;
        const cur = part.of(r);
        if (old !== null && old !== undefined && cur !== null && cur !== undefined) pairs.push([cur, old]);
      });
      if (pairs.length < MIN_GROUP) return { key: c.key, c, few: true };
      return { key: c.key, c, cur: avgBy(pairs, (x) => x[0]), old: avgBy(pairs, (x) => x[1]) };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, cmpCycles, allRows, prev.progress.done]);

  const dimSelect = (value, onChange, withNone) => (
    <select className="sel" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Split people by">
      {withNone ? <option value="">None</option> : null}
      {DIM_GROUPS.map((gname, gi) => {
        const items = dims.filter((d) => d.g === gi && (withNone || true));
        return items.length ? (
          <optgroup key={gname} label={gname}>
            {items.map((d) => (
              <option key={d.k} value={d.k} disabled={withNone && d.k === dim1.k}>{d.label}</option>
            ))}
          </optgroup>
        ) : null;
      })}
    </select>
  );

  const outTabs = [...OUTPUTS.map((o) => [o.k, o.label]), ["o", "Outliers to review"]];

  /* ---------------- bars view ---------------- */
  const barsBody = (
    <div className="dax-rows">
      {described.map((d, i) => (
        <div
          className="dax-row"
          key={`${d.depth}:${d.label}:${i}`}
          style={{ paddingLeft: d.depth * 20 }}
          onClick={() => openList(d.label, d.rows)}
        >
          <div className="dax-head">
            <b className={d.depth ? "sub" : undefined}>{d.label}</b>
            <span className="mut">{inr(d.rows.length)} {d.rows.length === 1 ? "person" : "people"}</span>
            {d.few ? <span className="mut dax-few">{d.rows.length === 0 ? "no people" : `fewer than ${MIN_GROUP} people, not shown`}</span> : null}
          </div>
          {d.few
            ? null
            : d.parts.map(({ part, st, old }) =>
                st ? (
                  <div key={part.k}>
                    <BarLine
                      st={st}
                      mode={mode}
                      kind={part.kind}
                      scale={scale}
                      color={NOW}
                      tick="#102a43"
                      label={measure.parts.length > 1 ? part.label : ""}
                      tip={`${part.label} · ${thisCycle} · ${inr(st.n)} people`}
                    />
                    {old.map((o, j) =>
                      o.st ? (
                        <BarLine
                          key={o.c.key}
                          st={o.st}
                          mode={mode}
                          kind={part.kind}
                          scale={scale}
                          color={mode === "spread" ? PREV_BAND[j % 3] : PREV[j % 3]}
                          tick="#6b7280"
                          thin
                          label={o.c.name}
                          tip={`${part.label} · ${o.c.name} · ${inr(o.st.n)} of the same people`}
                        />
                      ) : (
                        <div className="dax-line" key={o.c.key}>
                          <div className="dax-bar" />
                          <div className="dax-txt thin mut">{o.c.name}: not enough people</div>
                        </div>
                      ),
                    )}
                  </div>
                ) : (
                  <div className="mut dax-few" key={part.k}>{part.label}: nobody has a value here</div>
                ),
              )}
        </div>
      ))}
      {measure?.k === "pvt" ? null : (
        <div className="sleg" style={{ marginTop: 10 }}>
          <span><i style={{ background: NOW }} />{thisCycle}</span>
          {cmpCycles.map((c, j) => (
            <span key={c.key}><i style={{ background: mode === "spread" ? PREV_BAND[j % 3] : PREV[j % 3] }} />{c.name}</span>
          ))}
          {mode === "spread" ? <span><i style={{ width: 2, height: 12, borderRadius: 0, background: "#102a43" }} />Average</span> : null}
        </div>
      )}
    </div>
  );

  /* ---------------- table view ---------------- */
  const tableBody = (
    <div className="tw">
      <table>
        <thead>
          <tr>
            <th>{dim1.label}</th>
            <th className="n">People</th>
            {measure?.parts.map((p) => (
              <th key={p.k} className="n" colSpan={1}>{measure.parts.length > 1 ? `${p.label} · ` : ""}Lowest</th>
            ))}
            {measure?.parts.map((p) => <th key={`a${p.k}`} className="n">{measure.parts.length > 1 ? `${p.label} · ` : ""}Average</th>)}
            {measure?.parts.map((p) => <th key={`m${p.k}`} className="n">{measure.parts.length > 1 ? `${p.label} · ` : ""}Median</th>)}
            {measure?.parts.map((p) => <th key={`h${p.k}`} className="n">{measure.parts.length > 1 ? `${p.label} · ` : ""}Highest</th>)}
            {cmpCycles.map((c) => <th key={c.key} className="n">Avg · {c.name}</th>)}
          </tr>
        </thead>
        <tbody>
          {described.map((d, i) => (
            <tr className="data click" key={`${d.depth}:${d.label}:${i}`} onClick={() => openList(d.label, d.rows)}>
              <td className="rl" style={{ paddingLeft: 11 + d.depth * 20, fontWeight: d.depth ? 600 : 800 }}>{d.label}</td>
              <td className="n">{inr(d.rows.length)}</td>
              {["min", "avg", "med", "max"].map((f) =>
                d.parts.map(({ part, st }) => (
                  <td className="n" key={`${f}${part.k}`}>{d.few || !st ? <span className="mut">–</span> : fmtVal(part.kind, st[f])}</td>
                )),
              )}
              {cmpCycles.map((c, j) => {
                const first = d.parts[0];
                const o = first?.old[j];
                return <td className="n" key={c.key}>{o?.st ? fmtVal(first.part.kind, o.st.avg) : <span className="mut">–</span>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  /* ---------------- headline tile ---------------- */
  const headTile = measure ? (
    <div className="balrow" style={{ gridTemplateColumns: `repeat(${overall.length}, minmax(0, 1fr))`, marginBottom: 12 }}>
      {overall.map(({ part, st }) => (
        <div className="tile" key={part.k}>
          <small>{part.label} · everyone in view</small>
          <b className="big">{st ? fmtVal(part.kind, st.avg) : "–"}<span className="un">{part.kind === "p" ? "% average" : "average"}</span></b>
          <div className="sub gap" style={{ marginBottom: 6 }}>
            {st ? `${inr(st.n)} people · median ${fmtVal(part.kind, st.med)} · range ${fmtVal(part.kind, st.min)} – ${fmtVal(part.kind, st.max)}` : "No values yet"}
          </div>
          {part === measure.parts[0] && prev.loading ? <div className="dl mut">Loading previous cycles… {inr(prev.progress.done)} / {inr(prev.progress.total)}</div> : null}
          {part === measure.parts[0] && cmpCycles.length && !part.hist ? <div className="dl mut">Earlier cycles do not keep this number, so nothing to compare.</div> : null}
          {part === measure.parts[0]
            ? headLines.map((l) =>
                l.few ? (
                  <div className="dl mut" key={l.key}>vs {l.c.name}: not enough people</div>
                ) : (
                  <div className="dl" key={l.key}>
                    vs {l.c.name} <b>{fmtVal(part.kind, l.old)}{part.kind === "p" ? "%" : ""}</b>{" "}
                    <Arrow d={l.cur - l.old} txt={`${Math.abs(l.cur - l.old).toFixed(2)} ${part.kind === "p" ? "pts" : ""}`} />
                  </div>
                ),
              )
            : null}
        </div>
      ))}
    </div>
  ) : null;

  return (
    <div className="ovw" onMouseMove={onMove} onMouseLeave={() => { if (tipRef.current) tipRef.current.style.display = "none"; }}>
      <div className="ovw-tip" ref={tipRef} />

      <div className="ttl">
        <h2>Dashboard</h2>
        <span className="meta">
          {cycleName ? <>Appraisal Cycle <b>{cycleName}</b> · </> : null}
          {inr(rows.length)} employees in scope · groups under {MIN_GROUP} people are not shown
        </span>
      </div>

      {/* Same control and same data as the Overview tab's "Compare With". */}
      <div className="cmp">
        <span className="mut">Compare With</span>
        <YearMenu cycles={compareCycles} selected={cmp} onChange={onCmpChange} />
        <span className="mut" style={{ fontSize: 11 }}>All appraisal cycles, same people only</span>
      </div>

      <div className="stabs">
        {outTabs.map(([k, label]) => (
          <button key={k} type="button" className={`stab${out === k ? " on" : ""}`} onClick={() => setOut(k)}>
            {label}
            {k === "o" ? <span className="dax-badge">{inr(outliers.length)}</span> : null}
          </button>
        ))}
      </div>

      {out === "o" ? (
        <>
          <div className="balrow" style={{ gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}>
            {[
              ["All outliers", outliers, "Anyone caught by either rule below", "Outliers to review"],
              ["High rating, low hike", highLow, `Rating 4 or 5 with hike more than 2 points under the average (${avgHike.toFixed(2)}%)`, "High rating with low hike"],
              ["Promoted, low rating", promoLow, "Promoted with a rating of 1 or 2", "Promoted with a low rating"],
            ].map(([title, set, sub, listTitle]) => (
              <div
                key={title}
                className={`tile click${list?.title === listTitle ? " sel" : ""}`}
                onClick={() => (list?.title === listTitle ? setList(null) : openList(listTitle, set))}
              >
                <small>{title}</small>
                <b className="big">{inr(set.length)}</b>
                <div className="sub">{sub}</div>
                <button className="lnk" type="button" style={{ padding: "6px 0 0" }}>Show the people ›</button>
              </div>
            ))}
          </div>
        </>
      ) : measure ? (
        <>
          {output.measures.length > 1 ? (
            <div className="dax-ctl">
              <span className="mut">Measure</span>
              <Toggle value={measure.k} options={output.measures.map((m) => [m.k, m.label])} onChange={(k) => setMeasureKey((p) => ({ ...p, [out]: k }))} />
            </div>
          ) : null}

          <div className="dax-ctl">
            <span className="mut">Against</span>
            {dimSelect(dim1.k, (k) => { setG1(k); if (g2 === k) setG2(""); }, false)}
            <span className="mut">then by</span>
            {dimSelect(dim2 ? dim2.k : "", setG2, true)}
            <span className="sp" />
            <Toggle value={mode} options={modes} onChange={(k) => setModeBy((p) => ({ ...p, [measure.k]: k }))} />
            <Toggle value={view} options={[["g", "Bars"], ["t", "Table"]]} onChange={setView} />
          </div>

          {[dim1, dim2].filter((d) => d && d.numeric).map((d) => (
            <div className="dax-ctl" key={d.k}>
              <span className="mut">Ranges for {d.label}</span>
              <input
                className="dax-inp"
                type="text"
                aria-label={`Cut points for ${d.label}`}
                value={cutsText[d.k] ?? d.cuts.join(", ")}
                onChange={(e) => setCutsText((p) => ({ ...p, [d.k]: e.target.value }))}
              />
              <span className="mut" style={{ fontSize: 11 }}>Cut points, for example {d.cuts.join(", ")}</span>
              <button className="lnk" type="button" onClick={() => setCutsText((p) => { const n = { ...p }; delete n[d.k]; return n; })}>Reset</button>
            </div>
          ))}

          {headTile}

          <div className="tile">
            <div className="cmsel">
              <span style={{ fontWeight: 700, color: "var(--navy)" }}>{measure.label} against {dim1.label}{dim2 ? ` then ${dim2.label}` : ""}</span>
              <span className="mut" style={{ fontSize: 11.5 }}>Click a row to see the people</span>
            </div>
            {described.length === 0 ? <div className="mut" style={{ padding: "8px 0" }}>No one in scope.</div> : view === "t" ? tableBody : barsBody}
          </div>
        </>
      ) : null}

      {list ? <PeopleList list={list} onClose={() => setList(null)} canOpenSheet={canOpenSheet} /> : null}
    </div>
  );
}