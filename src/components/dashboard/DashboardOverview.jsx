import { useEffect, useMemo, useRef, useState } from "react";

import { useAppraisal } from "@/lib/appraisal-store";
import { useBudget } from "@/lib/budget-store";
import { useViewAs } from "@/lib/view-as-store";
import { useCurrentCycleInfo } from "@/lib/current-cycle";
import { HR_TAB_SCREENS, useAccess } from "@/lib/access-store";
import { resolveBudgetAllocated } from "@/components/appraisal/BudgetStatsBar";
import { MANAGER_RATING_LABELS } from "@/lib/appraisal-data";
import { useCompareCycles, usePreviousCycleData } from "@/lib/overview-compare";
import {
  MIN_GROUP,
  allocationFor,
  avgBy,
  avgHikePct,
  balanceRows,
  barNum,
  calcHikePct,
  cycleKeyOf,
  daysUntil,
  fmAmt,
  fmMoney,
  fmtDate,
  groupRows,
  inr,
  isPromoted,
  manualEditedRowIds,
  money,
  num,
  partsOf,
  pctOfBase,
  ratingOf,
  recordHikePct,
  screenOfSource,
  targetPair,
} from "@/lib/dashboard-overview";

import "./overview.css";

/* The Overview shows the rows the Appraisal store already narrowed to the
   selected location and the signed-in (or "View as") login; the budget comes
   from the Budget store for the same login and location. Nothing here widens
   that scope. */

const C = { hike: "#1D3B5E", pb: "#4F7FB8", rb: "#A9C4E4", left: "#DCE1E7", warn: "#C98A1B", track: "#EEF1F4", target: "#B8C0CC" };
const RATING_COLORS = ["#DCE1E7", "#A9C4E4", "#6F9BD0", "#3E6FA8", "#1D3B5E"];
const LIGHT = new Set(["#DCE1E7", "#A9C4E4", "#EEF1F4", "#B8C0CC"]);
const MAX_PEOPLE_SHOWN = 500;

const go = (to) => {
  window.history.pushState({}, "", to);
  window.dispatchEvent(new PopStateEvent("popstate"));
};

const tipMoney = (v) => Math.round(num(v)).toLocaleString("en-IN");

/* ---------------- small building blocks ---------------- */

function Toggle({ value, options, onChange }) {
  return (
    <div className="ctog">
      {options.map(([k, label]) => (
        <button key={k} type="button" className={value === k ? "on" : ""} onClick={() => onChange(k)}>
          {label}
        </button>
      ))}
    </div>
  );
}

// parts: [{ label, value, color, tip?, pText?, nText?, blank? }]
function Seg({ parts, total, unit }) {
  const t = total || parts.reduce((s, p) => s + p.value, 0) || 1;
  return (
    <div className="seg">
      {parts.map((p, i) => {
        const w = Math.max(0, (p.value / t) * 100);
        if (w <= 0) return null;
        if (p.blank) return <i key={i} style={{ width: `${w}%`, background: p.color }} />;
        const lab = unit === "p" ? (p.pText ?? `${w.toFixed(0)}%`) : (p.nText ?? barNum(p.value));
        return (
          <i
            key={i}
            className={LIGHT.has(p.color) ? "ovw-lt" : undefined}
            data-tip={p.tip || `${p.label.split(" · ")[0]}: ${tipMoney(p.value)} (${w.toFixed(1)}%)`}
            style={{ width: `${w}%`, background: p.color }}
          >
            {w >= Math.max(9, String(lab).length * 1.5 + 3) ? lab : ""}
          </i>
        );
      })}
    </div>
  );
}

function Legend({ items }) {
  return (
    <div className="sleg">
      {items.map(([label, color]) => (
        <span key={label}>
          <i style={{ background: color }} />
          {label}
        </span>
      ))}
    </div>
  );
}

function Donut({ parts, total }) {
  const R = 44;
  const CIRC = 2 * Math.PI * R;
  let off = 0;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 18, flexWrap: "wrap", marginTop: 6 }}>
      <svg width="120" height="120" viewBox="0 0 120 120">
        {parts.map((p) => {
          const len = (p.value / (total || 1)) * CIRC;
          const el = (
            <circle
              key={p.label}
              data-tip={`${p.label.split(" · ").slice(0, 2).join(" · ")}: ${p.value} (${((p.value / (total || 1)) * 100).toFixed(1)}%)`}
              r={R}
              cx="60"
              cy="60"
              fill="none"
              stroke={p.color}
              strokeWidth="20"
              strokeDasharray={`${len.toFixed(2)} ${(CIRC - len).toFixed(2)}`}
              strokeDashoffset={(-off).toFixed(2)}
              transform="rotate(-90 60 60)"
            />
          );
          off += len;
          return el;
        })}
        <text x="60" y="64" textAnchor="middle" style={{ font: "600 16px Inter, Segoe UI, Arial, sans-serif", fill: "#1D3B5E" }}>
          {total}
        </text>
      </svg>
      <div className="sleg" style={{ flexDirection: "column", margin: 0 }}>
        {parts.map((p) => (
          <span key={p.label}>
            <i style={{ background: p.color }} />
            {p.label.split(" · ").slice(0, 2).join(" · ")} ({((p.value / (total || 1)) * 100).toFixed(1)}%)
          </span>
        ))}
      </div>
    </div>
  );
}

function Arrow({ d, txt, good = true }) {
  if (Math.abs(d) < 0.0005) return <span>no change</span>;
  const up = d > 0;
  return <span className={up === good ? "up" : "dn"}>{up ? "▲ " : "▼ "}{txt}</span>;
}

/* ---------------- "Compare with" years ---------------- */

function YearMenu({ cycles, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const chosen = cycles.filter((c) => selected.includes(c.key));
  const label = chosen.length
    ? `${chosen.length === 1 ? "1 year" : `${chosen.length} years`} · ${chosen.map((c) => c.name.replace("Annual ", "")).join(", ")}`
    : "Pick years";
  const toggle = (k) => onChange(selected.includes(k) ? selected.filter((x) => x !== k) : [...selected, k]);
  return (
    <div className="ymenu" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}>{label} ▾</button>
      {open ? (
        <div className="ypop">
          {cycles.length === 0 ? <div className="mut" style={{ padding: "4px 0" }}>No closed Annual cycles yet</div> : null}
          {cycles.map((c) => (
            <label key={c.key}>
              <input type="checkbox" checked={selected.includes(c.key)} onChange={() => toggle(c.key)} />
              {c.name}
            </label>
          ))}
          <div className="yb">
            <button type="button" className="btn" onClick={() => onChange(cycles.map((c) => c.key))}>All years</button>
            <button type="button" className="btn" onClick={() => onChange([])}>Clear</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- people list (sort + filter per column) ---------------- */

const PEOPLE_COLS = [
  {
    k: "name", l: "Employee", t: "t",
    g: (r) => `${r.name || ""} ${r.empId || ""}`,
    cell: (r) => (
      <td className="rl">
        {r.name}
        <div className="mut" style={{ fontWeight: 600, fontSize: 11 }}>{r.empId} · {r.designation}</div>
      </td>
    ),
  },
  { k: "cm", l: "Comp Manager", t: "t", cl: true, g: (r) => r.compManager || "", cell: (r) => <td>{r.compManager}</td> },
  { k: "mr", l: "Rating", t: "n", cl: true, g: (r) => ratingOf(r), cell: (r) => <td className="n">{ratingOf(r) || "–"}</td> },
  { k: "hk", l: "Hike %", t: "n", g: (r) => calcHikePct(r), cell: (r) => <td className="n">{calcHikePct(r).toFixed(2)}</td> },
  {
    k: "pb", l: "PB %", t: "n", g: (r) => pctOfBase(r.allocatedPBAmount, r.currentAnnualBasePay),
    cell: (r) => <td className="n" data-tip={`PB ${money(r.allocatedPBAmount)}`}>{pctOfBase(r.allocatedPBAmount, r.currentAnnualBasePay).toFixed(1)}</td>,
  },
  {
    k: "rb", l: "RB %", t: "n", g: (r) => pctOfBase(r.newRB, r.currentAnnualBasePay),
    cell: (r) => <td className="n" data-tip={`RB ${money(r.newRB)}`}>{pctOfBase(r.newRB, r.currentAnnualBasePay).toFixed(1)}</td>,
  },
];

const NUM_OPS = [["=", "="], [">", "greater than"], [">=", "at least"], ["<", "less than"], ["<=", "at most"]];

function FilterMenu({ col, items, initial, style, onApply, onClear, onSort }) {
  const num_ = col.t === "n";
  const ops = num_ ? NUM_OPS : [["has", "contains"]];
  const [op, setOp] = useState(initial.op || ops[0][0]);
  const [val, setVal] = useState(initial.val || "");
  const values = useMemo(() => {
    if (!col.cl) return [];
    const seen = new Set(items.map((it) => String(col.g(it))));
    return Array.from(seen).sort((a, b) => (num_ ? a - b : a.localeCompare(b))).slice(0, 300);
  }, [col, items, num_]);
  const [checked, setChecked] = useState(() => new Set(initial.set || values));
  const [q, setQ] = useState("");
  const allOn = values.every((v) => checked.has(v));
  return (
    <div className="pm" style={style} onMouseDown={(e) => e.stopPropagation()}>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#102a43", marginBottom: 6 }}>{col.l}</div>
      <div className="r">
        <button className="btn" type="button" onClick={() => onSort("a")}>{num_ ? "Lowest → highest" : "A → Z"}</button>
        <button className="btn" type="button" onClick={() => onSort("d")}>{num_ ? "Highest → lowest" : "Z → A"}</button>
      </div>
      <div className="r">
        <select className="sel" style={{ minWidth: 0, flex: "0 0 auto" }} value={op} onChange={(e) => setOp(e.target.value)}>
          {ops.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <input className="inp" type="text" value={val} placeholder="value" onChange={(e) => setVal(e.target.value)} />
      </div>
      {col.cl ? (
        <>
          <input className="inp" type="text" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%", marginBottom: 6, border: "1px solid #d1d5db", borderRadius: 6, padding: "6px 10px" }} />
          <label style={{ marginBottom: 4 }}>
            <input type="checkbox" checked={allOn} onChange={(e) => setChecked(new Set(e.target.checked ? values : []))} /> Select all
          </label>
          <div className="list">
            {values.filter((v) => v.toLowerCase().includes(q.toLowerCase())).map((v) => (
              <label key={v}>
                <input
                  type="checkbox"
                  checked={checked.has(v)}
                  onChange={(e) => {
                    const next = new Set(checked);
                    if (e.target.checked) next.add(v); else next.delete(v);
                    setChecked(next);
                  }}
                />{" "}
                {v}
              </label>
            ))}
          </div>
        </>
      ) : null}
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6, marginTop: 10 }}>
        <button className="btn" type="button" onClick={onClear}>Clear</button>
        <button
          className="btn pri"
          type="button"
          onClick={() => {
            const f = {};
            if (val.trim() !== "") { f.op = op; f.val = val.trim(); }
            if (col.cl && checked.size < values.length) f.set = Array.from(checked);
            onApply(f.op || f.set ? f : null);
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

function passes(col, item, f) {
  if (!f) return true;
  const v = col.g(item);
  if (f.set && !f.set.includes(String(v))) return false;
  if (f.op && f.val !== "") {
    if (col.t === "t") return String(v).toLowerCase().includes(String(f.val).toLowerCase());
    const x = Number(f.val);
    const y = Number(v);
    if (f.op === ">" && !(y > x)) return false;
    if (f.op === "<" && !(y < x)) return false;
    if (f.op === ">=" && !(y >= x)) return false;
    if (f.op === "<=" && !(y <= x)) return false;
    if (f.op === "=" && Math.abs(y - x) > 1e-9) return false;
  }
  return true;
}

function PeopleList({ list, onClose, canOpenSheet }) {
  const [sort, setSort] = useState(null);
  const [filters, setFilters] = useState({});
  const [menu, setMenu] = useState(null); // { k, left, top }
  const box = useRef(null);

  // A different list starts with a clean sort and filters.
  useEffect(() => {
    setSort(null);
    setFilters({});
    setMenu(null);
  }, [list.title]);

  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [menu]);

  const shown = useMemo(() => {
    let r = list.rows.filter((it) => PEOPLE_COLS.every((c) => passes(c, it, filters[c.k])));
    if (sort) {
      const c = PEOPLE_COLS.find((x) => x.k === sort.k);
      const d = sort.d === "a" ? 1 : -1;
      if (c) {
        r = r.slice().sort((a, b) => {
          const x = c.g(a);
          const y = c.g(b);
          return (c.t === "t" ? String(x).localeCompare(String(y)) : x - y) * d;
        });
      }
    }
    return r;
  }, [list.rows, filters, sort]);

  const active = Object.keys(filters).length > 0;
  const total = list.rows.length;
  const openMenu = (e, k) => {
    e.stopPropagation();
    if (menu?.k === k) { setMenu(null); return; }
    const tr = box.current.getBoundingClientRect();
    const br = e.currentTarget.getBoundingClientRect();
    setMenu({ k, left: Math.max(8, Math.min(br.left - tr.left, tr.width - 268)), top: br.bottom - tr.top + 4 });
  };
  const menuCol = menu ? PEOPLE_COLS.find((c) => c.k === menu.k) : null;

  return (
    <div className="tile pl" id="ov-people" ref={box}>
      <div className="hd">
        <span className="cap" style={{ display: "inline" }}>People</span>
        <span style={{ fontWeight: 700, color: "var(--navy)", fontSize: 14 }}>{list.title}</span>
        <span className="mut" style={{ fontSize: 11.5 }}>
          {shown.length === total ? `${inr(total)} people` : `${inr(shown.length)} of ${inr(total)} people`}
          {shown.length > MAX_PEOPLE_SHOWN ? ` · showing first ${MAX_PEOPLE_SHOWN}` : ""}
          {active ? (
            <>
              {" · "}
              <button className="lnk" type="button" style={{ padding: 0 }} onClick={() => { setFilters({}); setSort(null); }}>Clear filters</button>
            </>
          ) : null}
        </span>
        <span className="acts">
          {canOpenSheet ? <button className="btn pri" type="button" onClick={() => go("/sheet")}>Open Appraisal Sheet ›</button> : null}
          <button className="btn" type="button" onClick={onClose}>Close</button>
        </span>
      </div>
      <div className="tw">
        <table>
          <thead>
            <tr>
              {PEOPLE_COLS.map((c) => (
                <th key={c.k} className={c.t === "n" ? "n" : undefined}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    {c.l}
                    <button type="button" className="fb" title="Sort and filter" onClick={(e) => openMenu(e, c.k)}>
                      ▾{filters[c.k] || sort?.k === c.k ? <i /> : null}
                    </button>
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr><td colSpan={PEOPLE_COLS.length} className="mut" style={{ padding: 14 }}>No one matches the filters.</td></tr>
            ) : shown.slice(0, MAX_PEOPLE_SHOWN).map((r) => (
              <tr key={r.id} className="data">{PEOPLE_COLS.map((c) => <Cell key={c.k} col={c} row={r} />)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {menu && menuCol ? (
        <FilterMenu
          key={menu.k}
          col={menuCol}
          items={list.rows}
          initial={filters[menu.k] || {}}
          style={{ left: menu.left, top: menu.top }}
          onSort={(d) => { setSort({ k: menu.k, d }); setMenu(null); }}
          onClear={() => {
            setFilters((p) => { const n = { ...p }; delete n[menu.k]; return n; });
            if (sort?.k === menu.k) setSort(null);
            setMenu(null);
          }}
          onApply={(f) => {
            setFilters((p) => { const n = { ...p }; if (f) n[menu.k] = f; else delete n[menu.k]; return n; });
            setMenu(null);
          }}
        />
      ) : null}
    </div>
  );
}

const Cell = ({ col, row }) => col.cell(row);

/* ---------------- main ---------------- */

export function DashboardOverview() {
  const { rows: allRows, audit } = useAppraisal();
  const budgetCtx = useBudget();
  const { effectiveId } = useViewAs();
  const { name: cycleName, info: cycleInfo } = useCurrentCycleInfo();
  const access = useAccess();

  // Same reporting scope as before: Active + Eligible employees only.
  const rows = useMemo(
    () =>
      allRows.filter(
        (r) =>
          String(r.status || "").trim().toLowerCase() === "active" &&
          String(r.eligibility || "").trim().toLowerCase() === "eligible",
      ),
    [allRows],
  );

  const [unit, setUnit] = useState("n"); // n = numbers, p = percent
  const [tab, setTab] = useState("s"); // s = summary, a = recent activity
  const [ratingView, setRatingView] = useState("s");
  const [budgetView, setBudgetView] = useState("t"); // t table, b bars, c columns
  const [open, setOpen] = useState({}); // expanded budget rows
  const [list, setList] = useState(null); // { title, rows }
  const [cmp, setCmp] = useState([]); // compared cycle keys

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

  const { allocated } = resolveBudgetAllocated({
    totals: budgetCtx.totals,
    loading: budgetCtx.loading,
    error: budgetCtx.error,
  });

  const edited = useMemo(() => manualEditedRowIds(rows, audit), [rows, audit]);
  const n = rows.length;
  const editedCount = rows.filter((r) => edited.has(String(r.id))).length;
  const remaining = n - editedCount;
  const parts = useMemo(() => partsOf(rows), [rows]);
  const used = parts.total;
  const usedPct = allocated ? (used / allocated) * 100 : 0;
  const avgHike = avgHikePct(rows);
  const tgt = targetPair(rows);
  const gapPct = tgt.target ? ((tgt.paid - tgt.target) / tgt.target) * 100 : 0;
  const promos = rows.filter(isPromoted).length;

  // The levels this login may look at: HR sees Tech-ED then Comp Manager,
  // Tech-ED sees its Comp Managers, a Comp Manager sees none.
  const levels = useMemo(() => {
    const all = [
      { k: "te", n: "Tech-ED", of: (r) => r.appraiserTechED },
      { k: "cm", n: "Comp Manager", of: (r) => r.compManager },
    ];
    if (effectiveId === "compmanager") return [];
    return effectiveId === "teched" ? all.slice(1) : all;
  }, [effectiveId]);
  const L0 = levels[0];
  const L1 = levels[1];

  /* ---- budget rows (level 1, optionally opened into level 2) ---- */
  const mkBudgetRow = (lvl, g, d, kids, key) => {
    const pt = partsOf(g.rows);
    const al = allocationFor(lvl.k, g.key, budgetCtx);
    return { key, k: g.key, rows: g.rows, n: g.rows.length, pt, al, hasAl: al > 0, u: al > 0 ? (pt.total / al) * 100 : null, rem: al > 0 ? al - pt.total : null, d, kids, lvl };
  };
  const budRows = useMemo(() => {
    if (!L0) return [];
    const out = [];
    groupRows(rows, L0.of).forEach((g) => {
      const key = `${L0.k}:${g.key}`;
      out.push(mkBudgetRow(L0, g, 0, Boolean(L1), key));
      if (L1 && open[key]) {
        groupRows(g.rows, L1.of).forEach((c) => out.push(mkBudgetRow(L1, c, 1, false, `${L1.k}:${key}:${c.key}`)));
      }
    });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, L0, L1, open, budgetCtx]);
  const overCount = budRows.filter((r) => r.d === 0 && r.hasAl && r.pt.total > r.al).length;

  /* ---- ratings ---- */
  const ratingCounts = [1, 2, 3, 4, 5].map((r) => rows.filter((x) => ratingOf(x) === r).length);
  const ratingParts = ratingCounts.map((c, i) => ({
    label: `${i + 1} · ${MANAGER_RATING_LABELS[i + 1]}`,
    value: c,
    color: RATING_COLORS[i],
  }));

  /* ---- outliers (same rule as before) ---- */
  const outliers = useMemo(
    () =>
      rows.filter((r) => {
        const rt = ratingOf(r);
        return (rt >= 4 && calcHikePct(r) < avgHike - 2) || (isPromoted(r) && rt > 0 && rt <= 2);
      }),
    [rows, avgHike],
  );

  /* ---- compare with previous Annual cycles (same people only) ---- */
  const compareCycles = useCompareCycles();
  const prev = usePreviousCycleData(rows, cmp.length > 0);
  const hikeLines = cmp.map((key) => {
    const c = compareCycles.find((x) => x.key === key);
    if (!c) return null;
    const pairs = [];
    rows.forEach((r) => {
      const rec = (prev.historyOf(r.empId) || []).find((h) => cycleKeyOf(h.cycleName) === key);
      const p = rec ? recordHikePct(rec) : null;
      if (p !== null) pairs.push([calcHikePct(r), p]);
    });
    if (pairs.length < MIN_GROUP) return { key, c, few: true };
    const cur = avgBy(pairs, (x) => x[0]);
    const old = avgBy(pairs, (x) => x[1]);
    return { key, c, cur, old };
  }).filter(Boolean);

  const openList = (title, list_) => {
    setList({ title, rows: list_ });
    setTimeout(() => {
      const el = document.getElementById("ov-people");
      if (el && el.scrollIntoView) el.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }, 0);
  };

  /* ---- title row ---- */
  const isHR = effectiveId === "hr";
  const dl = cycleInfo?.end ? daysUntil(cycleInfo.end) : null;
  const canOpenCycle = isHR && access.canScreen(HR_TAB_SCREENS["appraisal-cycle"]);
  const canOpenSheet = access.canScreen("appraisalSheet");

  /* ---- KPI tiles ---- */
  const tiles = [];
  tiles.push(
    <div className="tile" key="edited">
      <small>Edited vs remaining to edit</small>
      <b className="big">{n ? ((editedCount / n) * 100).toFixed(1) : "0.0"}<span className="un">%</span></b>
      <div className="sub gap">{inr(editedCount)} edited · {inr(remaining)} remaining</div>
      <Seg unit={unit} total={n} parts={[{ label: "Edited", value: editedCount, color: C.pb }, { label: "Remaining", value: remaining, color: C.left }]} />
      <Legend items={[["Edited", C.pb], ["Remaining", C.left]]} />
    </div>,
  );
  tiles.push(
    <div className="tile" key="budget">
      <small>Budget used</small>
      <b className="big" style={usedPct > 100 ? { color: "var(--err)" } : undefined}>{usedPct.toFixed(1)}<span className="un">%</span></b>
      <div className="sub gap">
        {allocated
          ? `${fmMoney(used)} of ${fmMoney(allocated)} · ${used > allocated ? `over by ${fmMoney(used - allocated)}` : `${fmMoney(allocated - used)} left`}`
          : `${fmMoney(used)} used · no allocation found`}
      </div>
      <Seg unit={unit} total={Math.max(allocated, used)} parts={[{ label: "Hike", value: parts.hike, color: C.hike }, { label: "PB", value: parts.pb, color: C.pb }, { label: "RB", value: parts.rb, color: C.rb }, { label: "Left", value: Math.max(allocated - used, 0), color: C.left }]} />
      <Legend items={[["Hike", C.hike], ["PB", C.pb], ["RB", C.rb], ["Left", C.left]]} />
    </div>,
  );
  tiles.push(
    <div className="tile" key="hike">
      <small>Average hike %</small>
      <b className="big">{avgHike.toFixed(2)}<span className="un">%</span></b>
      <div className="sub gap" style={{ marginBottom: hikeLines.length || prev.loading ? 10 : 0 }}>Across {inr(n)} people · hike amount {fmMoney(parts.hike)}</div>
      {prev.loading ? <div className="dl mut">Loading previous cycles… {inr(prev.progress.done)} / {inr(prev.progress.total)}</div> : null}
      {hikeLines.map((l) =>
        l.few ? (
          <div className="dl mut" key={l.key}>vs {l.c.name}: not enough people</div>
        ) : (
          <div className="dl" key={l.key}>
            vs {l.c.name} <b>{l.old.toFixed(2)}%</b> <Arrow d={l.cur - l.old} txt={`${Math.abs(l.cur - l.old).toFixed(2)} pts`} />
          </div>
        ),
      )}
    </div>,
  );
  tiles.push(
    <div className="tile" key="pbt">
      <small>PB vs Target PB</small>
      <b className="big" style={gapPct > 0 ? { color: "var(--amber)" } : undefined}>
        {gapPct > 0 ? "+" : gapPct < 0 ? "−" : ""}{Math.abs(gapPct).toFixed(1)}<span className="un">%</span>
      </b>
      <div className="sub gap">{gapPct > 0 ? "Over" : "Under"} target · {inr(tgt.n)} people with a last-year target</div>
      <div className="dl">PB paid <b data-tip={money(tgt.paid)}>{fmMoney(tgt.paid)}</b></div>
      <div className="dl">Target PB <b data-tip={money(tgt.target)}>{fmMoney(tgt.target)}</b></div>
    </div>,
  );
  if (L0) {
    tiles.push(
      <div className="tile" key="over">
        <small>{L0.n}s over allocation</small>
        <b className="big" style={overCount ? { color: "var(--amber)" } : undefined}>{overCount}</b>
        <div className="sub">Warning only, nothing is blocked</div>
      </div>,
    );
  }
  tiles.push(
    <div
      className={`tile click${list?.title === "Outliers to review" ? " sel" : ""}`}
      key="outliers"
      onClick={() => (list?.title === "Outliers to review" ? setList(null) : openList("Outliers to review", outliers))}
    >
      <small>Outliers to review</small>
      <b className="big">{inr(outliers.length)}</b>
      <div className="sub">High rating with low hike, or promoted with a low rating</div>
      <button className="lnk" type="button" style={{ padding: "6px 0 0" }}>Show the people ›</button>
    </div>,
  );
  const tileRows = balanceRows(tiles, 5);

  /* ---- ratings tile ---- */
  const ratingsBody =
    ratingView === "d" ? (
      <Donut parts={ratingParts} total={n} />
    ) : ratingView === "c" ? (
      <div className="vcol">
        {ratingParts.map((p, i) => {
          const mx = Math.max(...ratingCounts, 1);
          return (
            <div key={p.label} data-tip={`${p.label}: ${p.value} (${n ? ((p.value / n) * 100).toFixed(1) : 0}%)`}>
              <b>{unit === "p" ? `${n ? ((p.value / n) * 100).toFixed(0) : 0}%` : p.value}</b>
              <i style={{ height: Math.max(2, (p.value / mx) * 100), background: RATING_COLORS[i] }} />
              <span>{p.label}</span>
            </div>
          );
        })}
      </div>
    ) : (
      <>
        <Seg unit={unit} total={n} parts={ratingParts.map((p) => ({ ...p, label: p.label, tip: `${p.label.split(" · ").slice(0, 2).join(" · ")}: ${p.value} (${n ? ((p.value / n) * 100).toFixed(1) : 0}%)` }))} />
        <Legend items={ratingParts.map((p) => [`${p.label} · ${p.value}`, p.color])} />
      </>
    );

  /* ---- budget by level ---- */
  const mx = Math.max(1, ...budRows.map((r) => Math.max(r.al, r.pt.total))) * 1.08;
  const remText = (r) =>
    !r.hasAl ? <span className="mut">–</span> : r.rem < 0 ? <span style={{ color: "var(--err)", fontWeight: 700 }}>Over by {fmAmt(-r.rem)}</span> : fmAmt(r.rem);
  const utilText = (u) =>
    u === null ? <span className="mut">–</span> : <span style={{ fontWeight: 700, color: u > 100 ? "var(--err)" : "var(--navy)" }}>{u.toFixed(1)}%</span>;
  const rowName = (r) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, paddingLeft: r.d * 22 }}>
      {r.kids ? (
        <button type="button" className="ex" onClick={(e) => { e.stopPropagation(); setOpen((p) => ({ ...p, [r.key]: !p[r.key] })); }}>{open[r.key] ? "▾" : "▸"}</button>
      ) : <span style={{ width: 14 }} />}
      <span style={{ fontWeight: r.d ? 500 : 700 }}>{r.k}</span>
    </span>
  );
  const peopleLink = (r) => (
    <button className="lnk" type="button" style={{ padding: 0 }} onClick={(e) => { e.stopPropagation(); openList(`${r.k} · people`, r.rows); }}>People ›</button>
  );
  const allRow = { n, pt: parts, al: allocated, hasAl: allocated > 0, u: allocated > 0 ? (used / allocated) * 100 : null, rem: allocated > 0 ? allocated - used : null };
  const BudgetLegend = ({ line }) => (
    <div className="sleg" style={{ marginTop: 8 }}>
      <span><i style={{ background: C.hike }} />Hike</span>
      <span><i style={{ background: C.pb }} />PB</span>
      <span><i style={{ background: C.rb }} />RB</span>
      <span>
        <i style={line === "v" ? { width: 2, height: 12, background: "#111827", borderRadius: 0 } : { width: 12, height: 2, background: "#111827", borderRadius: 0 }} />
        Allocated
      </span>
    </div>
  );
  let budgetBody = null;
  if (L0) {
    if (budgetView === "t") {
      budgetBody = (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>{L0.n} / team</th><th className="n">Team size</th><th className="n">Budget allocated</th><th className="n">Budget utilised</th>
                <th className="n">Utilised %</th><th className="n">Remaining budget</th><th />
              </tr>
            </thead>
            <tbody>
              {budRows.map((r) => (
                <tr key={r.key} className={`data${r.kids ? " click" : ""}`} onClick={r.kids ? () => setOpen((p) => ({ ...p, [r.key]: !p[r.key] })) : undefined}>
                  <td className="rl">{rowName(r)}</td>
                  <td className="n">{inr(r.n)}</td>
                  <td className="n" data-tip={r.hasAl ? money(r.al) : "No allocation found in Budget Master"}>{r.hasAl ? fmAmt(r.al) : <span className="mut">–</span>}</td>
                  <td className="n" data-tip={money(r.pt.total)}>{fmAmt(r.pt.total)}</td>
                  <td className="n">{utilText(r.u)}</td>
                  <td className="n">{remText(r)}</td>
                  <td className="n">{peopleLink(r)}</td>
                </tr>
              ))}
              <tr className="tot">
                <td className="rl">Total</td><td className="n">{inr(allRow.n)}</td><td className="n">{allRow.hasAl ? fmAmt(allRow.al) : "–"}</td>
                <td className="n">{fmAmt(allRow.pt.total)}</td><td className="n">{utilText(allRow.u)}</td><td className="n">{remText(allRow)}</td><td />
              </tr>
            </tbody>
          </table>
        </div>
      );
    } else if (budgetView === "b") {
      const pw = (v) => `${(v / mx) * 100}%`;
      budgetBody = (
        <>
          {budRows.map((r) => (
            <div className="brow" key={r.key} style={{ paddingLeft: r.d * 22 }}>
              <div className="h">{rowName({ ...r, d: 0 })}<span className="mut" style={{ fontSize: 11 }}>{inr(r.n)} people</span>{peopleLink(r)}</div>
              <div className="t">
                <div className="track">
                  <div className="trk">
                    <div data-tip={`Hike ${fmMoney(r.pt.hike)}`} style={{ width: pw(r.pt.hike), background: C.hike }} />
                    <div data-tip={`PB ${fmMoney(r.pt.pb)}`} style={{ width: pw(r.pt.pb), background: C.pb }} />
                    <div data-tip={`RB ${fmMoney(r.pt.rb)}`} style={{ width: pw(r.pt.rb), background: C.rb }} />
                  </div>
                  {r.hasAl ? <div className="mk" data-tip={`Allocated ${fmMoney(r.al)}`} style={{ left: `calc(${pw(r.al)} - 1px)` }} /> : null}
                </div>
                <div className="nums">
                  <span>{utilText(r.u)} <span className="mut">{r.hasAl ? `of ${fmAmt(r.al)}` : "no allocation"}</span></span>
                  <span>{remText(r)}</span>
                </div>
              </div>
            </div>
          ))}
          <BudgetLegend line="v" />
        </>
      );
    } else {
      const H = 170;
      const ph = (v) => (v / mx) * H;
      budgetBody = (
        <>
          <div className="bcols">
            <div>
              {budRows.map((r) => (
                <div className="bcol" key={r.key}>
                  <div style={{ fontSize: 12, marginBottom: 4 }}>{utilText(r.u)}</div>
                  <div className="stk" style={{ height: H, opacity: r.d ? 0.8 : 1 }}>
                    <div data-tip={`Hike ${fmMoney(r.pt.hike)}`} style={{ height: ph(r.pt.hike), background: C.hike }} />
                    <div data-tip={`PB ${fmMoney(r.pt.pb)}`} style={{ height: ph(r.pt.pb), background: C.pb }} />
                    <div data-tip={`RB ${fmMoney(r.pt.rb)}`} style={{ height: ph(r.pt.rb), background: C.rb, borderRadius: "4px 4px 0 0" }} />
                    {r.hasAl ? <div className="ln" data-tip={`Allocated ${fmMoney(r.al)}`} style={{ bottom: ph(r.al) }} /> : null}
                  </div>
                  <div className="nm">
                    {r.kids ? <button type="button" className="lnk" style={{ padding: 0 }} onClick={() => setOpen((p) => ({ ...p, [r.key]: !p[r.key] }))}>{open[r.key] ? "▾ " : "▸ "}{r.k}</button> : r.k}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <BudgetLegend line="h" />
        </>
      );
    }
  }

  const cell = (v, al) => (
    <td className="n">
      <span style={{ fontWeight: 800, color: "var(--navy)" }}>{al > 0 ? `${((v / al) * 100).toFixed(1)}%` : "–"}</span>
      <div className="sub2">{fmAmt(v)}</div>
    </td>
  );
  const totCell = (pt, al) => {
    const u = al > 0 ? (pt.total / al) * 100 : null;
    return (
      <td className="n">
        <span style={{ fontWeight: 800, color: u > 100 ? "var(--err)" : "var(--navy)" }}>{u === null ? "–" : `${u.toFixed(1)}%`}</span>
        <div className="sub2">{fmAmt(pt.total)}</div>
      </td>
    );
  };

  /* ---- recent activity ---- */
  const recent = (Array.isArray(audit) ? audit : [])
    .slice()
    .sort((a, b) => String(b.at).localeCompare(String(a.at)))
    .slice(0, 10);
  // The audit "field" column keeps only 20 characters, so a longer stored label
  // arrives cut off ("Appraisal Sheet upda", "Apply Criteria compl"). Give the
  // full label back when the stored text is the start of exactly one known label.
  const FULL_LABELS = [
    "Appraisal Sheet updated",
    "Appraisal Sheet generated",
    "Appraisal Sheet feedback refreshed",
    "Apply Criteria completed",
    "Cycle deleted before its start date.",
    "Employee import completed",
    "Eligibility import partially completed",
    "Bulk status partially completed",
    "Change partially completed",
  ];
  const fieldLabel = (v) => {
    const t = String(v ?? "");
    if (t.length < 18 || FULL_LABELS.includes(t)) return t;
    const hits = FULL_LABELS.filter((label) => label.length > t.length && label.startsWith(t));
    return hits.length === 1 ? hits[0] : t;
  };
  const fmtWhen = (v) => {
    const d = new Date(v);
    return Number.isNaN(d.getTime())
      ? String(v)
      : d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="ovw" onMouseMove={onMove} onMouseLeave={() => { if (tipRef.current) tipRef.current.style.display = "none"; }}>
      <div className="ovw-tip" ref={tipRef} />

      <div className="ttl">
        <h2>Appraisal Cycle: {cycleName || "—"}</h2>
        {cycleName ? <span className="badge">{cycleInfo?.status || "Active"}</span> : null}
        <span className="meta">
          {inr(n)} employees in scope
          {cycleInfo?.end && fmtDate(cycleInfo.end) ? (
            <>
              {" · "}Closes <b>{fmtDate(cycleInfo.end)}</b>
              {dl !== null ? ` · ${dl > 0 ? `${dl} day${dl > 1 ? "s" : ""} left` : dl === 0 ? "closes today" : "close date passed"}` : ""}
            </>
          ) : null}
          {canOpenCycle ? (
            <>
              {" · "}
              <button className="lnk" type="button" style={{ padding: 0 }} onClick={() => go("/employee-master?tab=appraisal-cycle")}>Open ›</button>
            </>
          ) : null}
        </span>
      </div>

      <div className="cmp">
        <span className="mut">Compare with</span>
        <YearMenu cycles={compareCycles} selected={cmp} onChange={(v) => setCmp(v)} />
        <span className="mut" style={{ fontSize: 11 }}>Annual cycles, same people only</span>
        <span className="sp"><Toggle value={unit} onChange={setUnit} options={[["n", "Numbers"], ["p", "%"]]} /></span>
      </div>

      <div className="stabs">
        <button type="button" className={`stab${tab === "s" ? " on" : ""}`} onClick={() => setTab("s")}>Summary</button>
        <button type="button" className={`stab${tab === "a" ? " on" : ""}`} onClick={() => setTab("a")}>Recent activity</button>
      </div>

      {tab === "s" ? (
        <>
          {tileRows.map((r, i) => (
            <div className="balrow" key={i} style={{ gridTemplateColumns: `repeat(${r.length}, minmax(0, 1fr))` }}>{r}</div>
          ))}

          <div className="tile" style={{ marginTop: 12 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
              <small>Ratings summary</small>
              <Toggle value={ratingView} onChange={setRatingView} options={[["s", "Bar"], ["c", "Columns"], ["d", "Donut"]]} />
            </div>
            {ratingsBody}
            <div className="dl" style={{ marginTop: 8 }}>
              <b>{promos}</b> promotions <span className="mut">({n ? ((promos / n) * 100).toFixed(1) : 0}% of {inr(n)} people)</span>
            </div>
          </div>

          {L0 ? (
            <>
              <div className="tile" style={{ marginTop: 12 }}>
                <div className="cmsel">
                  <span style={{ fontWeight: 700, color: "var(--navy)" }}>Budget by {L0.n}</span>
                  {L1 ? <span className="mut" style={{ fontSize: 11.5 }}>Click a row to open its {L1.n}s</span> : null}
                  <span style={{ marginLeft: "auto" }}>
                    <Toggle value={budgetView} onChange={setBudgetView} options={[["b", "Bars"], ["c", "Columns"], ["t", "Table"]]} />
                  </span>
                </div>
                {budgetBody}
              </div>
            </>
          ) : null}

          {list ? <PeopleList list={list} onClose={() => setList(null)} canOpenSheet={canOpenSheet} /> : null}

          {L0 ? (
            <div className="tile" style={{ marginTop: 12 }}>
              <small>Utilisation breakdown · % of budget allocated</small>
              <div className="tw" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr><th>{L0.n} / team</th><th className="n">Budget allocated</th><th className="n">Hike</th><th className="n">PB</th><th className="n">RB</th><th className="n">Total utilised</th></tr>
                  </thead>
                  <tbody>
                    {budRows.map((r) => (
                      <tr className="data" key={r.key}>
                        <td className="rl"><span style={{ paddingLeft: r.d * 22 }}>{r.k}</span></td>
                        <td className="n">{r.hasAl ? fmAmt(r.al) : <span className="mut">–</span>}</td>
                        {cell(r.pt.hike, r.al)}{cell(r.pt.pb, r.al)}{cell(r.pt.rb, r.al)}{totCell(r.pt, r.al)}
                      </tr>
                    ))}
                    <tr className="tot">
                      <td className="rl">Total</td><td className="n">{allRow.hasAl ? fmAmt(allRow.al) : "–"}</td>
                      {cell(parts.hike, allocated)}{cell(parts.pb, allocated)}{cell(parts.rb, allocated)}{totCell(parts, allocated)}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="tw">
          <table>
            <thead><tr><th>When</th><th>Who</th><th>What</th><th>Screen</th></tr></thead>
            <tbody>
              {recent.length === 0 ? (
                <tr><td colSpan={4} className="mut" style={{ padding: 14 }}>No activity yet.</td></tr>
              ) : recent.map((a, i) => {
                const scr = screenOfSource(a.source);
                return (
                  <tr className="data" key={a.id || i}>
                    <td className="rl">{fmtWhen(a.at)}</td>
                    <td>{a.user}</td>
                    <td>{fieldLabel(a.field)} edited for {a.employeeName || a.empId}{a.to !== "" && a.to != null ? ` (${a.from || "–"} → ${a.to})` : ""}</td>
                    <td><button className="lnk" type="button" style={{ padding: 0 }} onClick={() => go(scr.to)}>{scr.label} ›</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}