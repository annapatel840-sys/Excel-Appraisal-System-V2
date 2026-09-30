import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAppraisal } from "@/lib/appraisal-store";
import {
  NEW_TITLES,
  INSTALLMENT_OPTIONS,
  totalOfPB,
  totalBonus as calcTotalBonus,
  newBaseSalary,
  totalCTCWithRewards,
} from "@/lib/appraisal-data";
import { useBudget } from "@/lib/budget-store";
import { catalystFetch, catalystFunctionUrl } from "@/lib/catalyst-api";

/* Load Manrope once in index.html:
   <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet"> */
const HISTORY_URL = catalystFunctionUrl("appraisalhistoryapi");
const CYCLE = "Apr-26";

const n = (v) => Number(v) || 0;
const blank = (v) => v === "" || v == null;
const fmt = (v) => Math.round(n(v)).toLocaleString("en-IN");
const fmtB = (v) => (blank(v) ? "" : fmt(v));
const dash = (v) => (blank(v) ? "—" : v);
const signed = (v) => (v > 0 ? "+" : v < 0 ? "−" : "") + fmt(Math.abs(v));
const amount = (raw) => {
  const c = String(raw ?? "").replace(/[^0-9.]/g, "");
  return c === "" ? "" : Number(c) || 0;
};
const yearKey = (y) =>
  String(y ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
const isCurrentYear = (y) =>
  String(y ?? "")
    .toLowerCase()
    .includes("2026");

const normalize = (r) => {
  const basePay = n(r?.base_pay),
    hike = n(r?.hike_amount);
  return {
    year: r?.appraisal_year != null ? String(r.appraisal_year) : "—",
    basePay,
    hikeAmount: hike,
    newBasePay: basePay + hike,
    joiningBonus: n(r?.joining_bonus),
    performanceBonus: n(r?.performance_bonus),
    retentionBonus: n(r?.retention_bonus),
    totalBonus: n(r?.total_bonus),
    designation: r?.designation ? String(r.designation) : "—",
    rating: r?.rating ? String(r.rating) : "—",
    feedback: r?.manager_rating ? String(r.manager_rating) : "—",
    targetPB: n(r?.target_performance_bonus),
    newCTC: n(r?.new_ctc),
  };
};
const emptyRecord = (h) =>
  h.designation === "—" &&
  h.rating === "—" &&
  h.feedback === "—" &&
  !h.basePay &&
  !h.totalBonus &&
  !h.newCTC &&
  !h.hikeAmount;

/* PB / RB "to be paid" come from the appraisal sheet columns pbToBePaid, pbMonth, rbToBePaid, rbMonth */
const toBePaid = (e) => ({
  pb: n(e.pbToBePaid),
  pbMonth: e.pbMonth,
  rb: n(e.rbToBePaid),
  rbMonth: e.rbMonth,
});
const withFloor = (e) => {
  const t = toBePaid(e);
  return {
    ...e,
    newPB: blank(e.newPB) || n(e.newPB) < t.pb ? t.pb : e.newPB,
    newRB: blank(e.newRB) || n(e.newRB) < t.rb ? t.rb : e.newRB,
  };
};
const EDIT_FIELDS = [
  "hikeAmount",
  "newPB",
  "newRB",
  "pbInstallment",
  "targetPBNextYear",
  "newTitle",
  "newTargetPBCriteria",
  "atRisk",
];

const CSS = `
.ds{min-height:100vh;background:#F4F7F7;color:#1F2F3D;font-family:"Manrope","Segoe UI",system-ui,Arial,sans-serif;font-size:13px;font-variant-numeric:tabular-nums;padding:14px 16px 24px}
.ds *,.ds *::before,.ds *::after{box-sizing:border-box}
.ds button,.ds input,.ds select,.ds textarea{font-family:inherit}
.ds :focus-visible{outline:2px solid #0B7A75;outline-offset:2px}
.ds .wrap{max-width:1500px;margin:0 auto;display:flex;flex-direction:column;gap:12px}
.ds .ws{display:grid;grid-template-columns:minmax(540px,660px) minmax(0,1fr);gap:14px;align-items:start}
@media(max-width:1100px){.ds .ws{grid-template-columns:1fr}}
.ds .card{background:#fff;border:1px solid #E3E9EC;border-radius:10px;overflow:hidden}
.ds .cis-t{display:flex;align-items:center;justify-content:space-between;height:38px;padding:0 14px;border-bottom:1px solid #E5E7EB;font-size:15px;font-weight:700;color:#102A43}
.ds .edleg{font-size:11.5px;font-weight:600;color:#6B7280;display:inline-flex;align-items:center;gap:6px}
.ds .edleg i{width:11px;height:11px;border-radius:3px;background:#E3F4EF;border:1px solid #4FA38F}
.ds .cis-s{display:flex;gap:8px;align-items:center;padding:8px 12px;border-bottom:1px solid #E3E9EC}
.ds .cis-s input{flex:1;height:30px;border:1px solid #9AA7B4;border-radius:4px;padding:0 10px;font-size:12.5px}
.ds .scope{font-size:11.5px;font-weight:600;color:#0B5F5B;background:#E6F3F2;border-radius:6px;padding:4px 9px}
.ds table.cis{width:100%;border-collapse:collapse;table-layout:fixed}
.ds .cis th{background:#F4F6F9;color:#6B7A89;font-size:10.5px;font-weight:700;text-align:left;padding:6px 10px;border-bottom:1px solid #E3E9EC;border-right:1px solid #E3E9EC;text-transform:uppercase;letter-spacing:.02em}
.ds .cis th.r{text-align:right}
.ds .cis td{padding:5px 10px;border-bottom:1px solid #E3E9EC;border-right:1px solid #E3E9EC;vertical-align:top;font-size:12px}
.ds .cis th:last-child,.ds .cis td:last-child{border-right:0}
.ds .cis td.d{font-weight:700;color:#102A43;background:#F8FAFB;padding-top:11px}
.ds .cis td.f{text-align:right;font-weight:700;white-space:nowrap;padding-top:11px}
.ds .up{color:#1F8A3B}.ds .dn{color:#C0392B}.ds .mut{color:#9AA7B4;font-weight:400;font-size:11px}.ds .dark{color:#1F2937}
.ds .sub{display:block;font-size:10px;font-weight:400;color:#6B7280}
.ds .cap{display:flex;gap:8px;font-size:10px;color:#6B7280;margin-top:1px}.ds .cap span:first-child{flex:1}.ds .cap span:last-child{width:56px;flex:0 0 56px}
.ds .ro{height:26px;line-height:24px;border:1px solid #C9D1DA;background:#F1F3F6;border-radius:4px;padding:0 8px;font-size:12px;color:#374151;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ds .ro.na{color:#9AA7B4;font-size:11px;background:#fff;border-style:dashed}.ds .ro.calc{background:#fff;color:#102A43}
.ds .pair{display:flex;gap:8px}.ds .pair>.ro,.ds .pair>input{flex:1;min-width:0}.ds .pair .q{flex:0 0 56px;width:56px}
.ds .gi,.ds .gs{width:100%;height:26px;border:1px solid #D1D5DB;background:#fff;border-radius:4px;padding:0 8px;font-size:12px;color:#1F2937}
.ds .pair .gs{flex:0 0 56px;width:56px;padding:0 6px}
.ds .ed{background:#E3F4EF!important;border-color:#4FA38F!important;font-weight:700;color:#0B4F46!important}
.ds .ta{width:100%;height:34px;border-radius:4px;padding:5px 7px;font-size:11.5px;line-height:1.35;resize:vertical}
.ds .ta.cur{background:#F1F3F6;border:1px solid #C9D1DA;color:#374151;resize:none}.ds .ta.new{background:#fff;border:1px solid #D1D5DB}
.ds .note{font-size:10px;color:#9A3412;font-weight:700;margin-top:1px}.ds .pre{font-size:10px;color:#0B5F5B;margin-top:1px}
.ds .leg{display:flex;flex-wrap:wrap;gap:14px;padding:6px 12px;font-size:11px;color:#5F7482}
.ds .leg span{display:inline-flex;align-items:center;gap:5px}.ds .leg i{width:11px;height:11px;border-radius:2px;border:1px solid}
.ds .foot{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:8px 12px;border-top:1px solid #E3E9EC}
.ds .pg{font-size:13px;color:#486070}.ds .pg b{color:#102A43}.ds .acts{display:flex;gap:8px}
.ds .btn{height:34px;padding:0 16px;border-radius:7px;border:1px solid #102A43;background:#102A43;color:#fff;font-size:13px;font-weight:700;cursor:pointer}
.ds .btn.ghost{background:#fff;color:#102A43;border-color:#CBD5DA}.ds .btn:disabled{opacity:.45;cursor:not-allowed}
.ds .empty{padding:36px;color:#5F7482}
.ds .rp{background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;color:#111827}
.ds .rp-head{padding:10px 16px;border-bottom:1px solid #E5E7EB;font-size:12px;color:#374151;line-height:1.4}.ds .rp-head b{color:#102A43;font-size:13px}
.ds .rp-tabs{display:flex;border-bottom:1px solid #E5E7EB;background:#FAFAFB}
.ds .rp-tabs button{flex:1;background:none;border:0;border-bottom:2px solid transparent;padding:9px 0;font-size:13px;font-weight:600;color:#6B7280;cursor:pointer}
.ds .rp-tabs button[aria-selected=true]{color:#111827;border-bottom-color:#102A43;font-weight:800}
.ds .rp-subs{display:flex;gap:6px;padding:10px 16px 4px}
.ds .rp-subs button{border:1px solid #D1D5DB;background:#fff;border-radius:14px;padding:3px 10px;font-size:11.5px;color:#374151;cursor:pointer}
.ds .rp-subs button[aria-pressed=true]{background:#EEF0F3;border-color:#CBD2DA;color:#111827;font-weight:700}
.ds .rp-body{padding:6px 16px 14px;max-height:560px;overflow:auto}
.ds .rtl{list-style:none;margin:4px 0 0;padding:0 0 0 18px;position:relative}
.ds .rtl::before{content:"";position:absolute;left:5px;top:8px;bottom:8px;width:1px;background:#E0E4EA}
.ds .rtl li{position:relative;padding:6px 0 10px}
.ds .rtl li::before{content:"";position:absolute;left:-17px;top:11px;width:9px;height:9px;border-radius:50%;border:2px solid #C7CDD6;background:#fff}
.ds .rtl li.cur::before{border-color:#102A43;background:#102A43}
.ds .ry{font-weight:800;color:#102A43}.ds .rmut{color:#6B7280}
.ds .chip{display:inline-block;border:1px solid #E5E7EB;background:#F7F8FA;border-radius:4px;padding:1px 6px;font-size:11px;margin:3px 4px 0 0}
.ds .chip.good{background:#ECFDF3;border-color:#B7E4C7;color:#166534;font-weight:700}.ds .chip.now{background:#EEF0F3;font-weight:700}
.ds .rtxt{margin-top:4px;line-height:1.45}
.ds .rtbl{width:100%;border-collapse:collapse;font-size:12px}.ds .rtbl th{text-align:left;font-size:10.5px;color:#6B7280;padding:4px;border-bottom:1px solid #E5E7EB}
.ds .rtbl td{padding:4px;border-bottom:1px solid #F1F3F5}.ds .rn{text-align:right!important}
.ds .rinfo{border:1px solid #E5E7EB;background:#F7F8FA;border-radius:8px;padding:6px 10px;margin-top:8px}
.ds .fold{text-align:center;font-size:11px;color:#7B8F9B}
.ds .yh{background:#fff;border:1px solid #E3E9EC;border-radius:10px;overflow:hidden}
.ds .yh-h{background:#102A43;color:#fff;padding:6px 14px;font-size:12.5px;font-weight:700}
.ds .yh-w{overflow:auto}.ds .yh table{width:100%;min-width:980px;border-collapse:collapse}
.ds .yh th{background:#EEF2F7;font-size:10.5px;padding:5px 8px;text-align:center;color:#334E5C}
.ds .yh td{text-align:right;padding:3px 10px;font-size:11.5px;border-top:1px solid #EEF1F5;line-height:1.25;white-space:nowrap}
.ds .yh td:first-child{text-align:center;color:#1859A8;font-weight:700}
.ds .yh tr.cur td{background:#FFF9DC}.ds .yh tr.cur td.chg{background:#FFE8A3;font-weight:700;box-shadow:inset 0 -2px 0 #E8B04A}
.ds .yh small{display:block;font-size:10px}.ds .yh small.up,.ds .yh small.nw{color:#1F8A3B;font-weight:600}.ds .yh small.dn{color:#C0392B;font-weight:600}.ds .yh small.z{color:#7B8F9B}
.ds .yh small.was{font-size:9.5px;font-weight:400;color:#8A6D1F;text-decoration:line-through}
.ds .yh-l{display:flex;gap:14px;flex-wrap:wrap;padding:5px 14px;font-size:10.5px;color:#5F7482;border-top:1px solid #EEF1F5}
.ds .yh-l i{display:inline-block;width:11px;height:11px;border-radius:2px;margin-right:4px;vertical-align:-1px}
.ds .yh-e{padding:10px 14px;font-size:12px;color:#5F7482}
`;

const HIST_COLS = [
  ["base", "Curr Base Pay"],
  ["jb", "Joining Bonus"],
  ["pb", "Perf. Bonus"],
  ["rb", "Retention Bonus"],
  ["tb", "Total Bonus"],
  ["hike", "Hike Amount"],
  ["ctc", "Total CTC"],
  ["tpb", "Target PB"],
  ["nb", "New Base Pay"],
];

export function DetailScreenPage() {
  const { rows: liveRows, updateCell, updateLinkedCells } = useAppraisal();
  const { currentUser, isHR } = useBudget();
  const rows = liveRows || [];

  const [index, setIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [historyByEmpId, setHistoryByEmpId] = useState({});
  const [notes, setNotes] = useState({});
  const [tab, setTab] = useState("manager");
  const historyPromiseRef = useRef(new Map());
  const origRef = useRef({});

  useEffect(() => {
    setIndex(0);
    setSearch("");
  }, [currentUser?.name]);
  const employee = rows[Math.min(index, rows.length - 1)] || rows[0];

  /* ---------- history (unchanged API) ---------- */
  const loadHistory = useCallback((empId) => {
    const key = String(empId || "").trim();
    if (!key) return Promise.resolve([]);
    const existing = historyPromiseRef.current.get(key);
    if (existing) return existing;
    setHistoryByEmpId((p) => ({
      ...p,
      [key]: { loading: true, data: [], error: "" },
    }));
    const promise = (async () => {
      const res = await catalystFetch(
        `${HISTORY_URL}?emp_id=${encodeURIComponent(key)}`,
      );
      if (!res.ok) throw new Error(`History request failed (${res.status}).`);
      const json = await res.json();
      if (!json?.success)
        throw new Error(json?.message || "Failed to load history.");
      return (Array.isArray(json?.data) ? json.data : [])
        .map(normalize)
        .sort((a, b) => String(b.year).localeCompare(String(a.year)));
    })();
    historyPromiseRef.current.set(key, promise);
    promise
      .then((data) =>
        setHistoryByEmpId((p) => ({
          ...p,
          [key]: { loading: false, data, error: "" },
        })),
      )
      .catch((err) => {
        historyPromiseRef.current.delete(key);
        setHistoryByEmpId((p) => ({
          ...p,
          [key]: {
            loading: false,
            data: [],
            error: err?.message || "Unable to load history.",
          },
        }));
      });
    return promise;
  }, []);
  useEffect(() => {
    if (employee?.empId) loadHistory(employee.empId).catch(() => {});
  }, [employee?.empId, loadHistory]);

  const empKey = employee ? String(employee.empId || "").trim() : "";
  const hs = historyByEmpId[empKey];
  const prior = useMemo(() => {
    const seen = new Set(),
      out = [];
    for (const r of hs?.data || []) {
      const k = yearKey(r.year);
      if (isCurrentYear(r.year) || emptyRecord(r) || !k || seen.has(k))
        continue;
      seen.add(k);
      out.push(r);
    }
    return out;
  }, [hs]);

  if (employee && !origRef.current[empKey])
    origRef.current[empKey] = Object.fromEntries(
      EDIT_FIELDS.map((f) => [f, employee[f]]),
    );
  const orig = origRef.current[empKey] || {};
  const isEd = (f) =>
    employee &&
    String(orig[f === "newBase" ? "hikeAmount" : f] ?? "") !==
      String(employee[f === "newBase" ? "hikeAmount" : f] ?? "");

  /* ---------- edits (same store calls as before) ---------- */
  const commit = (field, value) => {
    if (
      String(blank(employee[field]) ? "" : employee[field]) ===
      String(blank(value) ? "" : value)
    )
      return;
    updateCell(employee.id, field, value, "Detail screen edit");
  };
  const commitLinked = (fields) =>
    updateLinkedCells(employee.id, fields, "Detail screen edit");
  const onBase = (raw) => {
    const v = amount(raw),
      base = n(employee.currentAnnualBasePay);
    if (v === "") {
      if (!blank(employee.hikeAmount) || !blank(employee.hikePct))
        commitLinked({ hikeAmount: "", hikePct: "" });
      return;
    }
    if (v === newBaseSalary(employee)) return;
    const hike = v - base;
    commitLinked({
      hikeAmount: hike,
      hikePct: base ? Number(((hike / base) * 100).toFixed(1)) : 0,
    });
  };
  const onReward = (field, raw) => {
    const t = toBePaid(employee)[field === "newPB" ? "pb" : "rb"],
      key = `${empKey}:${field}`;
    let v = amount(raw);
    if (v === "") v = 0;
    if (t && v < t) {
      setNotes((p) => ({
        ...p,
        [key]: `Less than to be paid — ${fmt(t)} will be paid`,
      }));
      v = t;
    } else
      setNotes((p) => {
        const c = { ...p };
        delete c[key];
        return c;
      });
    commit(field, v);
  };
  const onTitle = (v) =>
    commitLinked(
      v !== employee.designation
        ? { newTitle: v, eligibleForPromotion: "Yes" }
        : { eligibleForPromotion: "No", newTitle: null },
    );
  const onSearch = (value) => {
    setSearch(value);
    const q = value.trim().toLowerCase();
    if (!q) return;
    const i = rows.findIndex(
      (r) =>
        String(r.name || "")
          .toLowerCase()
          .startsWith(q) || String(r.empId || "").toLowerCase() === q,
    );
    if (i > -1) setIndex(i);
  };
  const flush = () => {
    const a = document.activeElement;
    if (a && a.hasAttribute?.("data-f")) a.blur();
  };

  if (!employee)
    return (
      <div className="ds">
        <style>{CSS}</style>
        <div className="empty">No employees are visible for this login.</div>
      </div>
    );

  /* ---------- derived ---------- */
  const view = withFloor(employee),
    t = toBePaid(employee);
  const base = n(employee.currentAnnualBasePay),
    hike = n(view.hikeAmount),
    hp = base ? (hike / base) * 100 : 0;
  const lastH = prior[0];
  const lastCTC = lastH
    ? lastH.newCTC ||
      lastH.newBasePay + lastH.performanceBonus + lastH.retentionBonus
    : 0;
  const total = totalCTCWithRewards(view),
    trPct = lastCTC ? ((total - lastCTC) / lastCTC) * 100 : 0;
  const pbD = n(view.newPB) - t.pb,
    rbD = n(view.newRB) - t.rb;
  const scopeLabel = isHR ? "All employees" : `${currentUser?.name}'s team`;
  const titles = NEW_TITLES.includes(employee.designation)
    ? NEW_TITLES
    : [employee.designation, ...NEW_TITLES];
  const last = index === rows.length - 1;

  const cro = (v, c = "") => <div className={`ro ${c}`}>{v}</div>;
  const amt = (f, value, onCommit, label) => (
    <input
      key={`${employee.id}-${f}-${fmtB(value)}`}
      data-f={f}
      className={`gi${isEd(f) ? " ed" : ""}`}
      inputMode="numeric"
      defaultValue={fmtB(value)}
      aria-label={label}
      onBlur={(e) => {
        if (e.target.value !== e.target.defaultValue) onCommit(e.target.value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
  const noteOf = (f, a) =>
    notes[`${empKey}:${f}`] ? (
      <div className="note">{notes[`${empKey}:${f}`]}</div>
    ) : (
      <div className="pre">Preloaded · less than this → {fmt(a)} paid</div>
    );
  const dTxt = (d) =>
    d ? (
      <>
        {signed(d)}
        <span className="sub">vs to be paid</span>
      </>
    ) : (
      <>
        —<span className="sub">= to be paid</span>
      </>
    );
  const dCls = (d) => (d > 0 ? "up" : d < 0 ? "dn" : "mut");
  const area = (f, value, ph) => (
    <textarea
      key={`${employee.id}-${f}-${value}`}
      data-f={f}
      className={`ta new${isEd(f) ? " ed" : ""}`}
      defaultValue={value || ""}
      placeholder={ph}
      onBlur={(e) => commit(f, e.target.value)}
    />
  );

  /* ---------- history grid ---------- */
  const mk = (x) => ({
    base: n(x.currentAnnualBasePay),
    jb: n(x.joiningBonus),
    pb: totalOfPB(x),
    rb: n(x.newRB),
    tb: calcTotalBonus(x),
    hike: n(x.hikeAmount),
    ctc: totalCTCWithRewards(x),
    tpb: n(x.targetPBNextYear),
    nb: newBaseSalary(x),
  });
  const curRow = mk(view),
    origRow = mk(withFloor({ ...employee, ...orig }));
  const pastRows = prior.map((h) => ({
    year: h.year,
    base: h.basePay,
    jb: h.joiningBonus,
    pb: h.performanceBonus,
    rb: h.retentionBonus,
    tb: h.performanceBonus + h.retentionBonus,
    hike: h.hikeAmount,
    ctc: h.newCTC || h.newBasePay + h.performanceBonus + h.retentionBonus,
    tpb: h.targetPB,
    nb: h.newBasePay,
  }));
  const pctChg = (v, p) => {
    if (!p)
      return v ? (
        <small className="nw">new</small>
      ) : (
        <small className="z">0.00%</small>
      );
    const c = ((v - p) / p) * 100;
    return (
      <small className={Math.abs(c) < 0.005 ? "z" : c < 0 ? "dn" : "up"}>
        {c > 0 ? "+" : ""}
        {c.toFixed(2)}%
      </small>
    );
  };

  /* ---------- right panel: feedback ---------- */
  const whoParts = [
    employee.empId,
    employee.designation,
    employee.band,
    !blank(employee.totalExperience)
      ? `${String(employee.totalExperience).replace(/\s*yrs?$/i, "")} yrs${!blank(employee.wissenExperience) ? ` (${String(employee.wissenExperience).replace(/\s*yrs?$/i, "")} here)` : ""}`
      : "",
  ].filter(Boolean);
  const cycles = [
    {
      y: CYCLE,
      cur: true,
      d: employee.designation,
      r: employee.managerRating,
      el: employee.eligibleForPromotion,
      tx: employee.feedback,
      cr: employee.clientRating,
      rr: employee.rrPercent,
      ic: employee.interviewCount,
    },
  ].concat(
    prior.map((h, i) => ({
      y: h.year,
      d: h.designation,
      r: h.rating,
      tx: h.feedback,
      promo:
        prior[i + 1]?.designation &&
        prior[i + 1].designation !== h.designation &&
        h.designation !== "—",
    })),
  );

  let body;
  if (tab === "manager") {
    body = (
      <ul className="rtl">
        {cycles.map((c) => (
          <li key={c.y} className={c.cur ? "cur" : ""}>
            <span className="ry">{c.y}</span>
            {c.cur && <span className="chip now">This cycle</span>}
            <div className="rmut">{dash(c.d)}</div>
            <span className="chip">
              Manager rating <b>{dash(c.r)}</b>
            </span>
            {c.el ? (
              <span className={`chip${c.el === "Yes" ? " good" : ""}`}>
                Eligible for promotion: {c.el}
              </span>
            ) : null}
            {c.promo ? <span className="chip good">Promoted</span> : null}
            {!blank(c.tx) && c.tx !== "—" ? (
              <div className="rtxt">{c.tx}</div>
            ) : null}
          </li>
        ))}
      </ul>
    );
  } else if (tab === "client") {
    body = blank(employee.clientRating) ? (
      <div className="rinfo">No client feedback recorded.</div>
    ) : (
      <ul className="rtl">
        <li className="cur">
          <span className="ry">{CYCLE}</span>
          <div>
            <span className="chip">
              Client rating <b>{employee.clientRating}</b>
            </span>
          </div>
        </li>
      </ul>
    );
  } else {
    body = (
      <table className="rtbl">
        <thead>
          <tr>
            <th>Cycle</th>
            <th className="rn">RR %</th>
            <th className="rn">IC</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{CYCLE}</td>
            <td className="rn">{dash(employee.rrPercent)}</td>
            <td className="rn">{dash(employee.interviewCount)}</td>
          </tr>
        </tbody>
      </table>
    );
  }

  return (
    <div className="ds">
      <style>{CSS}</style>
      <div className="wrap">
        <div className="ws">
          {/* ---------- Compensation input ---------- */}
          <section className="card" aria-label="Compensation input">
            <div className="cis-t">
              <span>Compensation input</span>
              <span className="edleg">
                <i />
                Edited this cycle
              </span>
            </div>
            <div className="cis-s">
              <input
                type="search"
                value={search}
                onChange={(e) => onSearch(e.target.value)}
                placeholder="Search your team by name or employee ID"
                aria-label="Search your team"
              />
              <span className="scope" title={scopeLabel}>
                {rows.length}
              </span>
            </div>
            <table className="cis">
              <colgroup>
                <col style={{ width: 150 }} />
                <col />
                <col />
                <col style={{ width: 112 }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Description</th>
                  <th>Current</th>
                  <th>Proposed</th>
                  <th className="r">Diff</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="d">Base Pay</td>
                  <td>{cro(fmt(base))}</td>
                  <td>
                    {amt(
                      "newBase",
                      newBaseSalary(employee),
                      onBase,
                      "Proposed base pay",
                    )}
                  </td>
                  <td className={`f ${hike < 0 ? "dn" : "up"}`}>
                    {signed(hike)}
                    <br />/ {hp.toFixed(1)}%
                  </td>
                </tr>
                <tr>
                  <td className="d">Joining Bonus</td>
                  <td>{cro(fmt(employee.joiningBonus))}</td>
                  <td>{cro("n/a this cycle", "na")}</td>
                  <td className="f" />
                </tr>
                <tr>
                  <td className="d">PB / Inst.</td>
                  <td>
                    <div className="pair">
                      {cro(fmt(t.pb))}
                      {cro(dash(t.pbMonth), "q")}
                    </div>
                    <div className="cap">
                      <span>PB to be Paid</span>
                      <span>Mo (PB)</span>
                    </div>
                  </td>
                  <td>
                    <div className="pair">
                      {amt(
                        "newPB",
                        view.newPB,
                        (v) => onReward("newPB", v),
                        "Proposed PB",
                      )}
                      <select
                        data-f="pbInstallment"
                        className={`gs${isEd("pbInstallment") ? " ed" : ""}`}
                        value={String(employee.pbInstallment || "1")}
                        onChange={(e) =>
                          commit("pbInstallment", e.target.value)
                        }
                        aria-label="PB instalments"
                      >
                        {INSTALLMENT_OPTIONS.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                    </div>
                    {noteOf("newPB", t.pb)}
                  </td>
                  <td className={`f ${dCls(pbD)}`}>{dTxt(pbD)}</td>
                </tr>
                <tr>
                  <td className="d">RB</td>
                  <td>
                    <div className="pair">
                      {cro(fmt(t.rb))}
                      {cro(dash(t.rbMonth), "q")}
                    </div>
                    <div className="cap">
                      <span>RB to be Paid</span>
                      <span>Mo (RB)</span>
                    </div>
                  </td>
                  <td>
                    <div className="pair">
                      {amt(
                        "newRB",
                        view.newRB,
                        (v) => onReward("newRB", v),
                        "Proposed RB",
                      )}
                      <div className="q" style={{ flex: "0 0 56px" }} />
                    </div>
                    {noteOf("newRB", t.rb)}
                  </td>
                  <td className={`f ${dCls(rbD)}`}>{dTxt(rbD)}</td>
                </tr>
                <tr>
                  <td className="d">Total Reward</td>
                  <td>{cro(fmt(lastCTC))}</td>
                  <td>{cro(<b>{fmt(total)}</b>, "calc")}</td>
                  <td className={`f ${trPct < 0 ? "dn" : "up"}`}>
                    {lastCTC
                      ? `${trPct < 0 ? "−" : ""}${Math.abs(trPct).toFixed(1)}%`
                      : "—"}
                  </td>
                </tr>
                <tr>
                  <td className="d">Target PB</td>
                  <td>{cro(fmt(employee.targetPBAllocatedForMay))}</td>
                  <td>
                    {amt(
                      "targetPBNextYear",
                      employee.targetPBNextYear,
                      (v) => commit("targetPBNextYear", amount(v)),
                      "Proposed target PB",
                    )}
                  </td>
                  <td className="f mut">next yr</td>
                </tr>
                <tr>
                  <td className="d">Target PB Criteria</td>
                  <td>
                    <textarea
                      className="ta cur"
                      readOnly
                      value={employee.targetPBCriteria || "—"}
                    />
                  </td>
                  <td>
                    {area(
                      "newTargetPBCriteria",
                      employee.newTargetPBCriteria || employee.targetPBCriteria,
                    )}
                  </td>
                  <td className="f" />
                </tr>
                <tr>
                  <td className="d">Designation</td>
                  <td>{cro(employee.designation)}</td>
                  <td>
                    <select
                      data-f="newTitle"
                      className={`gi${isEd("newTitle") ? " ed" : ""}`}
                      value={employee.newTitle || employee.designation || ""}
                      onChange={(e) => onTitle(e.target.value)}
                      aria-label="New title"
                    >
                      {titles.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </td>
                  <td className="f dark">
                    {employee.eligibleForPromotion === "Yes" ? "Yes" : "No"}
                  </td>
                </tr>
                <tr>
                  <td className="d" style={{ borderBottom: 0 }}>
                    Comp Manager Remarks
                  </td>
                  <td style={{ borderBottom: 0 }}>
                    <textarea
                      className="ta cur"
                      readOnly
                      value={employee.prevRemarks || "None last cycle"}
                    />
                  </td>
                  <td style={{ borderBottom: 0 }}>
                    {area(
                      "atRisk",
                      employee.atRisk,
                      "Add remarks for this cycle",
                    )}
                  </td>
                  <td className="f" style={{ borderBottom: 0 }} />
                </tr>
              </tbody>
            </table>
            <div className="leg">
              <span>
                <i style={{ background: "#F1F3F6", borderColor: "#C9D1DA" }} />
                Current (read-only)
              </span>
              <span>
                <i style={{ background: "#fff", borderColor: "#D1D5DB" }} />
                Proposed (editable)
              </span>
              <span>
                <i style={{ background: "#E3F4EF", borderColor: "#4FA38F" }} />
                Edited this cycle
              </span>
            </div>
            <div className="foot">
              <div className="pg">
                <b>{index + 1}</b> of {rows.length} · {scopeLabel}
              </div>
              <div className="acts">
                <button
                  type="button"
                  className="btn ghost"
                  disabled={index === 0}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    flush();
                    setIndex((i) => Math.max(0, i - 1));
                  }}
                >
                  ‹ Previous
                </button>
                <button
                  type="button"
                  className="btn"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    flush();
                    if (!last) setIndex((i) => i + 1);
                  }}
                >
                  {last ? "Save" : "Save & next ›"}
                </button>
              </div>
            </div>
          </section>

          {/* ---------- Right panel ---------- */}
          <aside className="rp" aria-label="Employee panel">
            <div className="rp-head">
              <b>{employee.name}</b> · {whoParts.join(" · ")}
            </div>
            <div className="rp-tabs" role="tablist">
              <button type="button" role="tab" aria-selected="true">
                Feedback
              </button>
            </div>
            <div className="rp-subs">
              {[
                ["manager", "Manager"],
                ["client", "Client"],
                ["other", "Other"],
              ].map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={tab === k}
                  onClick={() => setTab(k)}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="rp-body">{body}</div>
          </aside>
        </div>

        {/* ---------- Employee history ---------- */}
        <div className="fold">▾ Employee History</div>
        <section className="yh" aria-label="Employee history">
          <div className="yh-h">
            Employee History — {employee.name} · {pastRows.length + 1} cycle
            {pastRows.length ? "s" : ""}
          </div>
          {hs?.loading ? (
            <div className="yh-e">Loading history…</div>
          ) : hs?.error ? (
            <div className="yh-e">{hs.error}</div>
          ) : (
            <>
              <div className="yh-w">
                <table>
                  <thead>
                    <tr>
                      <th>Year</th>
                      {HIST_COLS.map(([k, l]) => (
                        <th key={k}>{l}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="cur">
                      <td>{CYCLE} ★</td>
                      {HIST_COLS.map(([k]) => {
                        const ch =
                          Math.round(origRow[k]) !== Math.round(curRow[k]);
                        return (
                          <td key={k} className={ch ? "chg" : ""}>
                            {fmt(curRow[k])}
                            {pctChg(curRow[k], pastRows[0]?.[k])}
                            {ch ? (
                              <small className="was">
                                was {fmt(origRow[k])}
                              </small>
                            ) : null}
                          </td>
                        );
                      })}
                    </tr>
                    {pastRows.map((r, i) => (
                      <tr key={r.year}>
                        <td>{r.year}</td>
                        {HIST_COLS.map(([k]) => (
                          <td key={k}>
                            {fmt(r[k])}
                            {pctChg(r[k], pastRows[i + 1]?.[k])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="yh-l">
                <span>
                  <i style={{ background: "#FFE8A3" }} />
                  Changed this cycle (not yet final)
                </span>
                <span>
                  <i style={{ background: "#1F8A3B" }} />
                  Increase vs previous cycle
                </span>
                <span>
                  <i style={{ background: "#C0392B" }} />
                  Decrease
                </span>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
