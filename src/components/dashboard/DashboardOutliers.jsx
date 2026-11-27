import { useCallback, useEffect, useMemo, useState } from "react";

import { prefetchDetailHistory } from "@/components/appraisal/DetailScreenPage";
import { MIN_GROUP, calcHikePct, inr, isPromoted, pctOfBase, ratingOf, recordHikePct } from "@/lib/dashboard-overview";
import { bucketsOf } from "@/lib/dashboard-analysis";
import {
  CMP_KINDS,
  FLAG_FIELDS,
  FLAG_NUM_FIELDS,
  FLAG_OPS,
  FLAG_TYPES,
  LOGIC_FIRST,
  LOGIC_NEXT,
  PAST_FIELDS,
  PCT_DIRS,
  PEER_KEYS,
  TEXT_OPS,
  buildFlagContext,
  condSetField,
  condSetKind,
  fieldLabel,
  fieldOptions,
  flagDesc,
  flagSetType,
  flagWhy,
  isTextField,
  loadFlagSetup,
  opText,
  saveFlagSetup,
  starterCats,
  starterFlags,
} from "@/lib/dashboard-flags";
import { go, YearMenu } from "./DashboardOverview";

/* "Outliers To Review": people who match a flag. Flags are data rows (see Flag Setup),
   not code. Past-cycle flags look at the cycles picked in Compare With. */

const DEFAULT_PEERS = ["mr", "tx"];

/* ---------------- the flags, computed once for the tab badge and the view ---------------- */

export function useOutlierFlags({ rows, dims, cuts, regCycles, historyOf, progress, location }) {
  const [setup, setSetupState] = useState(() => loadFlagSetup(location));
  useEffect(() => { setSetupState(loadFlagSetup(location)); }, [location]);
  const setSetup = useCallback(
    (fn) =>
      setSetupState((s) => {
        const n = typeof fn === "function" ? fn(s) : fn;
        saveFlagSetup(location, n);
        return n;
      }),
    [location],
  );

  const [peersState, setPeers] = useState(DEFAULT_PEERS);
  const peers = peersState.filter((k) => dims.some((d) => d.k === k));

  const dimBy = useMemo(() => Object.fromEntries(dims.map((d) => [d.k, d])), [dims]);
  const cutsFor = (d) => (d?.numeric ? (cuts[d.k]?.length ? cuts[d.k] : d.cuts) : []);

  // Which bucket of a parameter a person falls in (cached per parameter and person).
  const bucketIndex = useMemo(() => {
    const bk = {};
    const cache = {};
    return (r, k) => {
      const d = dimBy[k];
      if (!d) return -1;
      if (!bk[k]) bk[k] = d.buckets(rows, cutsFor(d));
      const c = (cache[k] = cache[k] || new Map());
      if (c.has(r)) return c.get(r);
      const i = bk[k].findIndex((b) => b.test(r));
      c.set(r, i);
      return i;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, dimBy, cuts]);

  const pastKey = regCycles.map((c) => c.key).join("|");
  const ctx = useMemo(
    () =>
      buildFlagContext(rows, setup.flags, {
        peers,
        bucketIndex,
        pastCycles: regCycles.map((c) => c.key),
        historyOf,
      }),
    // progress changes while histories load, so past-cycle flags fill in as they arrive.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, setup.flags, peers.join("|"), bucketIndex, pastKey, progress],
  );

  const flaggedCount = useMemo(() => rows.filter((r) => (ctx.hits.get(r) || []).length).length, [rows, ctx]);

  return { setup, setSetup, peers, setPeers, dimBy, bucketIndex, ctx, flaggedCount, cutsFor };
}

/* ---------------- Flag Setup (HR) ---------------- */

function NumIn({ value, onCommit, style }) {
  return (
    <input
      key={String(value)}
      className="pin"
      type="number"
      step="0.5"
      style={style}
      defaultValue={value}
      onBlur={(e) => {
        const v = parseFloat(e.target.value);
        if (!Number.isNaN(v) && v !== value) onCommit(v);
      }}
      onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }}
    />
  );
}

function Sel({ value, options, onChange }) {
  return (
    <select className="sel" value={value} onChange={(e) => onChange(e.target.value)}>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}

function FlagSetup({ api, onBack }) {
  const { setup, setSetup, dimBy } = api;
  const edit = (fn) => setSetup((s) => { const n = JSON.parse(JSON.stringify(s)); fn(n); return n; });
  const flagFields = FLAG_FIELDS.map(([k, l]) => [k, l]); // every Appraisal Sheet column
  const numFields = FLAG_NUM_FIELDS; // number columns only (for averages and percentages)
  const shareOf = PEER_KEYS.filter((k) => dimBy[k]).map((k) => [k, dimBy[k].label]);
  const newId = (n) => { const id = `${n.nid}`; n.nid += 1; return id; };

  return (
    <div className="tile dpx-setup">
      <div className="dpx-sethead">
        <button className="btn" type="button" onClick={onBack}>‹ Back to Dashboard</button>
        <b style={{ color: "var(--navy)", fontSize: 15 }}>Flag Setup</b>
        <span className="mut">Each flag is a row. The dashboard reads these rows; nothing is fixed in the page.</span>
        <span className="sp" />
        <button className="btn" type="button" onClick={() => edit((n) => { n.cats = starterCats(); n.flags = starterFlags(); })}>Load Starter Set</button>
        <button className="btn" type="button" onClick={() => edit((n) => { n.cats = [{ id: `k${newId(n)}`, n: "General" }]; n.flags = []; })}>Start Empty</button>
      </div>

      <div className="cap dpx-cap2">Categories</div>
      <div className="dpx-catrow">
        {setup.cats.map((c) => {
          const used = setup.flags.some((r) => r.c === c.id);
          return (
            <span key={c.id}>
              <input
                key={c.n}
                className="txt"
                defaultValue={c.n}
                style={{ width: 140 }}
                onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.n) edit((n) => { n.cats.find((x) => x.id === c.id).n = v; }); }}
              />
              {used ? null : <button className="btn" type="button" title="Remove category" onClick={() => edit((n) => { n.cats = n.cats.filter((x) => x.id !== c.id); })}>✕</button>}
            </span>
          );
        })}
        <button className="btn" type="button" onClick={() => edit((n) => { n.cats.push({ id: `k${newId(n)}`, n: "New Category" }); })}>+ Category</button>
      </div>

      <div className="cap dpx-cap2">Flags</div>
      {!setup.flags.length ? <div className="mut">No flags yet. Add one below.</div> : null}
      {setup.flags.map((r) => {
        const row = (fn) => edit((n) => fn(n.flags.find((x) => x.id === r.id)));
        return (
          <div className="dpx-flag" key={r.id}>
            <div className="top">
              <label><input type="checkbox" checked={!!r.on} onChange={(e) => row((x) => { x.on = e.target.checked; })} />On</label>
              <input key={r.n} className="txt" defaultValue={r.n} style={{ width: 230 }} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== r.n) row((x) => { x.n = v; }); }} />
              <Sel value={r.c} options={setup.cats.map((c) => [c.id, c.n])} onChange={(v) => row((x) => { x.c = v; })} />
              <Sel value={r.ty} options={FLAG_TYPES} onChange={(v) => row((x) => flagSetType(x, v))} />
              <button className="btn" type="button" style={{ marginLeft: "auto" }} onClick={() => edit((n) => { n.flags = n.flags.filter((x) => x.id !== r.id); })}>Delete</button>
            </div>
            <div className="body2">
              {r.ty === "cmp" ? (
                <>
                  {r.cd.map((c, i) => (
                    <div className="cond" key={i}>
                      <Sel value={c.lg || (i ? "and" : "if")} options={i ? LOGIC_NEXT : LOGIC_FIRST} onChange={(v) => row((x) => { x.cd[i].lg = v; })} />
                      <Sel value={c.f} options={flagFields} onChange={(v) => row((x) => condSetField(x.cd[i], v))} />
                      {c.f === "promo" ? (
                        <Sel value={String(c.v)} options={[["1", "Yes"], ["0", "No"]]} onChange={(v) => row((x) => { x.cd[i].v = Number(v); })} />
                      ) : isTextField(c.f) ? (
                        <>
                          <Sel value={c.op} options={TEXT_OPS} onChange={(v) => row((x) => { x.cd[i].op = v; })} />
                          {c.op === "filled" || c.op === "empty" ? null : fieldOptions(c.f) ? (
                            <Sel value={c.s ?? ""} options={[["", "(pick)"], ...fieldOptions(c.f).map((o) => [o, o])]} onChange={(v) => row((x) => { x.cd[i].s = v; })} />
                          ) : (
                            <input key={c.s} className="txt" style={{ width: 150 }} defaultValue={c.s ?? ""} placeholder="text" onBlur={(e) => { if (e.target.value !== (c.s ?? "")) row((x) => { x.cd[i].s = e.target.value; }); }} onKeyDown={(e) => { if (e.key === "Enter") e.target.blur(); }} />
                          )}
                        </>
                      ) : (
                        <>
                          <Sel value={c.rt || "v"} options={CMP_KINDS} onChange={(v) => row((x) => condSetKind(x.cd[i], v))} />
                          {c.rt === "f" || c.rt === "avg" ? <Sel value={c.f2} options={numFields} onChange={(v) => row((x) => { x.cd[i].f2 = v; })} /> : null}
                          {c.rt === "f" ? (
                            <label className="chk"><input type="checkbox" checked={!!c.abs} onChange={(e) => row((x) => { x.cd[i].abs = e.target.checked; })} />ignore sign</label>
                          ) : null}
                          <Sel value={c.op} options={FLAG_OPS} onChange={(v) => row((x) => { x.cd[i].op = v; })} />
                          <NumIn value={c.v} onCommit={(v) => row((x) => { x.cd[i].v = v; })} />
                          {c.rt === "p" || c.rt === "pavg" ? (
                            <>
                              <span className="mut">%</span>
                              <Sel value={c.dir || "more"} options={PCT_DIRS} onChange={(v) => row((x) => { x.cd[i].dir = v; })} />
                              <Sel value={c.f2} options={numFields} onChange={(v) => row((x) => { x.cd[i].f2 = v; })} />
                            </>
                          ) : null}
                        </>
                      )}
                      <button className="btn" type="button" title="Remove condition" onClick={() => row((x) => { x.cd.splice(i, 1); if (x.cd[0] && x.cd[0].lg !== "not") x.cd[0].lg = "if"; })}>✕</button>
                    </div>
                  ))}
                  <button className="btn" type="button" onClick={() => row((x) => { x.cd.push({ lg: "and", f: "hk", op: "<=", rt: "v", v: 1 }); })}>+ Condition</button>
                  {r.cd.length > 1 ? <div className="mut" style={{ fontSize: 11.5, marginTop: 4 }}>“and” and “and not” are checked together first; “or” then starts a new set. A person is flagged if any set fully holds.</div> : null}
                </>
              ) : null}
              {r.ty === "past" ? (
                <div className="cond">
                  <span className="mut">If</span>
                  <Sel value={r.f} options={PAST_FIELDS} onChange={(v) => row((x) => { x.f = v; })} />
                  <span className="mut">is more than</span>
                  <NumIn value={r.v} onCommit={(v) => row((x) => { x.v = v; })} />
                  <Sel value={r.dir} options={[["above", "above"], ["below", "below"]]} onChange={(v) => row((x) => { x.dir = v; })} />
                  <span className="mut">own average of the cycles picked in Compare With</span>
                </div>
              ) : null}
              {r.ty === "peer" ? (
                <div className="cond">
                  <span className="mut">If</span>
                  <Sel value={r.f} options={numFields} onChange={(v) => row((x) => { x.f = v; })} />
                  <span className="mut">is more than</span>
                  <NumIn value={r.v} onCommit={(v) => row((x) => { x.v = v; })} />
                  <span className="mut">standard deviations from the peer group average</span>
                </div>
              ) : null}
              {r.ty === "share" ? (
                <div className="cond">
                  <span className="mut">If one person's</span>
                  <Sel value={r.f} options={numFields} onChange={(v) => row((x) => { x.f = v; })} />
                  <span className="mut">is</span>
                  <NumIn value={r.v} onCommit={(v) => row((x) => { x.v = v; })} />
                  <span className="mut">% or more of the total of their</span>
                  <Sel value={r.of} options={shareOf} onChange={(v) => row((x) => { x.of = v; })} />
                </div>
              ) : null}
              <div className="mut" style={{ fontSize: 11.5, marginTop: 8 }}>Reads as: {flagDesc(r, dimBy[r.of]?.label)}</div>
            </div>
          </div>
        );
      })}
      <button className="btn pri" type="button" onClick={() => edit((n) => { if (!n.cats.length) n.cats.push({ id: `k${newId(n)}`, n: "General" }); n.flags.push({ id: `f${newId(n)}`, n: "New Flag", c: n.cats[0].id, on: true, ty: "cmp", cd: [{ f: "hk", op: "<=", rt: "v", v: 1 }] }); })}>+ Add Flag</button>
      <div className="mut" style={{ fontSize: 11.5, marginTop: 10 }}>
        Fields come from the Appraisal Sheet columns. These rows are kept in this browser for the selected location.
      </div>
    </div>
  );
}

/* ---------------- the Outliers view ---------------- */

export function DashboardOutliers({ rows, dims, effectiveId, api, compareCycles, cmp, onCmpChange, prev, canOpenSheet }) {
  const { setup, setSetup, peers, setPeers, dimBy, bucketIndex, ctx, cutsFor } = api;
  const isHr = effectiveId === "hr";
  const [cat, setCat] = useState("");
  const [sel, setSel] = useState([]);
  const [mode, setMode] = useState("any");
  const [fCm, setFCm] = useState("");
  const [fMr, setFMr] = useState("");
  const [fTx, setFTx] = useState("");
  const [q, setQ] = useState("");
  const [only, setOnly] = useState(true);
  const [show, setShow] = useState(25);
  const [det, setDet] = useState(null);
  const [cfg, setCfg] = useState(false);
  const [detHist, setDetHist] = useState(null);

  const catId = setup.cats.some((c) => c.id === cat) ? cat : setup.cats[0]?.id || "";
  const keys = setup.flags.filter((f) => f.c === catId && f.on);
  const flagBy = (id) => setup.flags.find((f) => f.id === id);

  const regList = compareCycles.filter((c) => !c.exceptional);
  const regSel = cmp.filter((k) => regList.some((c) => c.key === k));
  const setReg = (next) => onCmpChange([...cmp.filter((k) => !regList.some((c) => c.key === k)), ...next]);

  const cmDim = dimBy.cm;
  const txDim = dimBy.tx;
  const cmOptions = cmDim ? bucketsOf(cmDim, rows, []).map((b) => b.label) : [];
  const txBuckets = txDim ? txDim.buckets(rows, cutsFor(txDim)) : [];

  const C = useMemo(
    () =>
      rows.filter((r) => {
        if (fCm && (r.compManager || "Unassigned") !== fCm) return false;
        if (fMr && ratingOf(r) !== Number(fMr)) return false;
        if (fTx !== "" && txBuckets[Number(fTx)] && !txBuckets[Number(fTx)].test(r)) return false;
        return true;
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, fCm, fMr, fTx, api],
  );
  const N = C.length;
  const hitsOf = (r) => ctx.hits.get(r) || [];

  const list = useMemo(() => {
    const ids = keys.map((f) => f.id);
    const act = sel.length ? sel : ids;
    const text = q.trim().toLowerCase();
    const out = C.filter((r) => {
      const h = hitsOf(r);
      if (only) {
        const m = mode === "all" && sel.length ? act.every((k) => h.includes(k)) : act.some((k) => h.includes(k));
        if (!m) return false;
      }
      if (text && `${r.name} ${r.empId}`.toLowerCase().indexOf(text) < 0) return false;
      return true;
    });
    const nf = (r) => hitsOf(r).filter((k) => ids.includes(k)).length;
    return out.sort((a, b) => nf(b) - nf(a) || String(a.name).localeCompare(String(b.name)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [C, ctx, keys.map((f) => f.id).join("|"), sel, mode, only, q]);

  const toggleSel = (id) => { setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); setShow(25); };

  // Details of one person: their own earlier cycles.
  const person = det ? rows.find((r) => String(r.empId) === String(det)) : null;
  useEffect(() => {
    setDetHist(null);
    if (!det) return undefined;
    let live = true;
    prefetchDetailHistory(det, {}).then((h) => live && setDetHist(h)).catch(() => live && setDetHist([]));
    return () => { live = false; };
  }, [det]);

  const editFlag = (id, fn) => setSetup((s) => { const n = JSON.parse(JSON.stringify(s)); fn(n.flags.find((f) => f.id === id)); return n; });

  if (cfg && isHr) return <FlagSetup api={api} onBack={() => setCfg(false)} />;

  const limit = (f, key, label, v, apply) => (
    <label className="dpx-lim" key={key}>
      <span className="lbl" style={{ fontSize: 11.5 }}>{f.n} · {label}</span>
      <NumIn value={v} onCommit={apply} />
    </label>
  );
  const limits = [];
  keys.forEach((r) => {
    if (r.ty === "cmp") {
      r.cd.forEach((c, i) => {
        if (c.f === "promo" || c.rt === "t" || isTextField(c.f)) return;
        const pc = c.rt === "p" || c.rt === "pavg" ? ` is a % ${c.dir === "of" ? "of" : c.dir === "less" ? "less than" : "more than"} ${c.rt === "pavg" ? "company average " : ""}${fieldLabel(c.f2)},` : "";
        limits.push(limit(r, `${r.id}|${i}`, `${fieldLabel(c.f)}${c.rt === "avg" ? " vs company average" : c.rt === "f" ? ` vs ${fieldLabel(c.f2)}` : ""}${pc} ${opText(c.op)}`, c.v, (v) => editFlag(r.id, (x) => { x.cd[i].v = v; })));
      });
    } else {
      limits.push(limit(r, `${r.id}|`, r.ty === "past" ? `${fieldLabel(r.f)} ${r.dir} own past by more than` : r.ty === "peer" ? `${fieldLabel(r.f)} standard deviations from peers` : `Share of ${fieldLabel(r.f)} (%)`, r.v, (v) => editFlag(r.id, (x) => { x.v = v; })));
    }
  });

  const peerOptions = ["cm", "te", "dg", "tx", "wx", "mr", "cr", "rr", "gm"].filter((k) => dimBy[k] && !peers.includes(k));
  const pastOf = (r, f) => ctx.x.past(r, f);

  return (
    <div className="dpx-out">
      <div className="dpx-outmain">
        <div className="pills">
          {setup.cats.map((c) => (
            <button key={c.id} className={`pill${catId === c.id ? " on" : ""}`} type="button" onClick={() => { setCat(c.id); setSel([]); setDet(null); setShow(25); }}>{c.n}</button>
          ))}
        </div>

        {!keys.length ? (
          <div className="mut" style={{ marginTop: 12 }}>No flags are switched on in this category.{isHr ? " Open Flag Setup to add one." : ""}</div>
        ) : (
          <>
            <div className="dpx-cards">
              {keys.map((f) => {
                const n = C.filter((r) => hitsOf(r).includes(f.id)).length;
                const w = N ? (n / N) * 100 : 0;
                const on = sel.includes(f.id);
                return (
                  <div key={f.id} className={`tile hrc click${on ? " on" : ""}`} data-tip={flagDesc(f, dimBy[f.of]?.label)} onClick={() => toggleSel(f.id)}>
                    <small>{f.n}</small>
                    <b className="big" style={{ fontSize: 22 }}>{inr(n)}</b>
                    <span className="sub">{w.toFixed(1)}% of {inr(N)}</span>
                    <div className="seg" style={{ height: 5, marginTop: 6 }}><i style={{ width: `${Math.min(100, w * 4)}%`, background: "#4F7FB8" }} /></div>
                  </div>
                );
              })}
            </div>
            <div className="mut" style={{ fontSize: 11, marginTop: 6 }}>Click a card to list only its people. Hover for the rule. Bar scaled ×4.</div>
          </>
        )}

        {person ? (
          <div className="tile dpx-det">
            <div className="dpx-dh">
              <span className="cap">Details</span>
              <b style={{ color: "var(--navy)", fontSize: 14 }}>{person.name}</b>
              <span className="mut">{person.empId} · {person.designation} · {person.compManager}</span>
              <span className="acts">
                {canOpenSheet ? <button className="btn" type="button" onClick={() => go("/sheet")}>Open Appraisal Sheet ›</button> : null}
                <button className="btn" type="button" onClick={() => setDet(null)}>Close</button>
              </span>
            </div>
            <div style={{ marginTop: 10 }}>
              {hitsOf(person).length ? hitsOf(person).map((k) => {
                const f = flagBy(k);
                return f ? <div key={k} style={{ margin: "3px 0" }}><span className="src o">{f.n}</span> {flagWhy(f, person, ctx.x, dimBy[f.of]?.label)}</div> : null;
              }) : <span className="mut">No flags for this person with the current rules.</span>}
            </div>
            <div className="tw" style={{ marginTop: 10 }}>
              <table>
                <thead><tr><th>Cycle</th><th className="n">Base Pay</th><th className="n">Hike %</th><th className="n">PB %</th><th className="n">RB %</th></tr></thead>
                <tbody>
                  <tr className="data">
                    <td className="rl">Current Cycle (Now)</td>
                    <td className="n">{inr(person.currentAnnualBasePay)}</td>
                    <td className="n"><b>{calcHikePct(person).toFixed(2)}</b></td>
                    <td className="n">{pctOfBase(person.allocatedPBAmount, person.currentAnnualBasePay).toFixed(1)}</td>
                    <td className="n">{pctOfBase(person.newRB, person.currentAnnualBasePay).toFixed(1)}</td>
                  </tr>
                  {detHist === null ? <tr className="data"><td colSpan={5} className="mut">Loading earlier cycles…</td></tr> : null}
                  {(detHist || []).map((h, i) => (
                    <tr className="data" key={`${h.cycleName}-${i}`}>
                      <td className="rl">{h.cycleName}</td>
                      <td className="n">{inr(h.basePay)}</td>
                      <td className="n">{recordHikePct(h) === null ? "–" : recordHikePct(h).toFixed(2)}</td>
                      <td className="n">{h.basePay > 0 ? ((h.performanceBonus / h.basePay) * 100).toFixed(1) : "–"}</td>
                      <td className="n">{h.basePay > 0 ? ((h.retentionBonus / h.basePay) * 100).toFixed(1) : "–"}</td>
                    </tr>
                  ))}
                  {detHist && !detHist.length ? <tr className="data"><td colSpan={5} className="mut">No earlier cycles on record.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}

        <div style={{ marginTop: 12 }}>
          <div className="mut" style={{ margin: "0 0 8px" }}>{inr(list.length)} people{list.length > show ? ` · showing ${show}` : ""}</div>
          <div className="tw ag" style={{ maxHeight: "46vh" }}>
            <table>
              <thead>
                <tr>
                  <th>Employee</th><th>Comp Manager</th><th className="n">Manager Rating</th><th>Promoted</th><th className="n">Hike %</th>
                  <th className="n">Past Hike %</th><th className="n">Peer Average Hike %</th><th className="n">RR%</th><th className="n">Gross Margin</th><th>Flags</th>
                </tr>
              </thead>
              <tbody>
                {!list.length ? <tr><td colSpan={10} className="mut" style={{ padding: 14 }}>No one matches. Change the limits or the filters.</td></tr> : null}
                {list.slice(0, show).map((r) => {
                  const pa = pastOf(r, "hk");
                  const s = ctx.x.peer(r, "hk");
                  return (
                    <tr key={r.id} className={`data click${String(det) === String(r.empId) ? " sel" : ""}`} onClick={() => setDet(String(det) === String(r.empId) ? null : r.empId)}>
                      <td className="rl">{r.name}<div className="mut" style={{ fontWeight: 600, fontSize: 11 }}>{r.empId} · {r.designation}</div></td>
                      <td>{r.compManager}</td>
                      <td className="n">{ratingOf(r) || "–"}</td>
                      <td>{isPromoted(r) ? "Yes" : "–"}</td>
                      <td className="n"><b>{calcHikePct(r).toFixed(2)}</b></td>
                      <td className="n mut">{pa === null ? "–" : pa.toFixed(2)}</td>
                      <td className="n mut">{s ? s.m.toFixed(2) : "–"}</td>
                      <td className="n">{Number(r.rrPercent) ? Number(r.rrPercent).toFixed(1) : "–"}</td>
                      <td className="n">{Number(r.grossMargin) ? Number(r.grossMargin).toFixed(1) : "–"}</td>
                      <td>{hitsOf(r).filter((k) => keys.some((f) => f.id === k)).map((k) => <span key={k} className="src o" style={{ marginRight: 4 }}>{flagBy(k)?.n}</span>)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {list.length > show ? <div style={{ marginTop: 10 }}><button className="btn" type="button" onClick={() => setShow((n) => n + 25)}>Show 25 More</button></div> : null}
        </div>
      </div>

      <aside className="tile dpx-side">
        <div className="dpx-sh">
          Ranges and Settings
          {isHr ? <button className="btn" type="button" style={{ marginLeft: "auto" }} onClick={() => { setCfg(true); setDet(null); }}>Flag Setup</button> : null}
        </div>
        <div>
          <div className="cap dpx-cap">Compare With</div>
          <YearMenu cycles={regList} selected={regSel} onChange={setReg} />
          {!regSel.length ? <div className="mut dpx-msg">Nothing picked, so past-cycle flags are not checked.</div> : null}
          {prev.loading ? <div className="mut dpx-msg">Loading previous cycles… {inr(prev.progress.done)} / {inr(prev.progress.total)}</div> : null}
        </div>
        <div>
          <div className="cap dpx-cap">Peers Are People With the Same</div>
          <div className="dpx-chips">
            {peers.map((k) => (
              <span key={k} className="chip" style={{ textTransform: "none", fontSize: 11.5 }}>
                {dimBy[k].label}
                <a href="#remove" title="Remove" onClick={(e) => { e.preventDefault(); setPeers(peers.filter((x) => x !== k)); }}>✕</a>
              </span>
            ))}
          </div>
          <Sel value="" options={[["", "+ Add"], ...peerOptions.map((k) => [k, dimBy[k].label])]} onChange={(v) => { if (v) setPeers([...peers, v]); }} />
          {!peers.length ? <div className="mut dpx-msg">Everyone is one group.</div> : null}
        </div>
        <div>
          <div className="cap dpx-cap">Limits · {setup.cats.find((c) => c.id === catId)?.n || ""}</div>
          <div className="dpx-lims">{limits.length ? limits : <span className="mut" style={{ fontSize: 12 }}>No flags in this category.</span>}</div>
        </div>
        <div>
          <div className="cap dpx-cap">Show</div>
          <div className="dpx-show">
            {cmDim ? <Sel value={fCm} options={[["", "All Comp Managers"], ...cmOptions.map((l) => [l, l])]} onChange={(v) => { setFCm(v); setShow(25); }} /> : null}
            <Sel value={fMr} options={[["", "All Ratings"], ...[1, 2, 3, 4, 5].map((r) => [String(r), `Rating ${r}`])]} onChange={(v) => { setFMr(v); setShow(25); }} />
            {txDim ? <Sel value={fTx} options={[["", "All Experience"], ...txBuckets.map((b, i) => [String(i), `${b.label} yrs`])]} onChange={(v) => { setFTx(v); setShow(25); }} /> : null}
            <input className="txt" placeholder="Search name or ID" value={q} onChange={(e) => { setQ(e.target.value); setShow(25); }} />
            <label className="chk"><input type="checkbox" checked={only} onChange={(e) => { setOnly(e.target.checked); setShow(25); }} />Show only flagged</label>
            {sel.length > 1 ? <Sel value={mode} options={[["any", "Match any picked flag"], ["all", "Match all picked flags"]]} onChange={setMode} /> : null}
          </div>
        </div>
        <div className="mut" style={{ fontSize: 11 }}>Flags are warnings to look at, not errors. Peer groups under {MIN_GROUP} people are left out.</div>
      </aside>
    </div>
  );
}