import { useEffect, useMemo, useRef, useState } from "react";

/*
 * Feedback & Rating Master — HR Operations › Master.
 *
 * UI ONLY. Nothing here calls the backend. The screen takes three optional
 * props; when they are not passed it shows built-in DEMO data so the design
 * can be reviewed:
 *
 *   cycles   [{ id, name, type, status }]
 *   rows     [{ cid, id, name, desig, dept, band, eff, mr, mf, rr, ic, gm,
 *               client, cm, cr, cf, risk, ccm, te, batch }]
 *              cid  = cycle id            eff = effective date "YYYY-MM-DD"
 *              mr   = manager rating      mf  = manager feedback
 *              rr   = RR %                ic  = interview count
 *              gm   = gross margin        client = cost centre / client
 *              cm   = client manager      cr  = client rating
 *              cf   = client feedback     risk = "Yes" | "No"
 *              ccm  = comp manager        te  = tech ED
 *              batch = upload batch id
 *   batches  [{ id, cid, file, by, at, rows, nw, rep, eff }]   (Audit tab)
 *   loading  boolean      error  string
 *
 * To connect the backend: load the three lists in the parent (or in a
 * useEffect below, marked "BACKEND") and pass / set them. Field names above
 * are the only contract this file relies on.
 */

/* ============================== helpers ============================== */
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDate = (iso) => {
  if (!iso) return "";
  const p = String(iso).split("-");
  return p.length === 3 ? `${p[2]}-${MON[+p[1] - 1]}-${p[0]}` : String(iso);
};
const inr = (n, dp) => {
  const s = Number(n).toFixed(dp);
  const p = s.split(".");
  let i = p[0];
  let neg = "";
  if (i.charAt(0) === "-") {
    neg = "-";
    i = i.slice(1);
  }
  let last = i.slice(-3);
  let rest = i.slice(0, -3);
  if (rest) last = "," + last;
  rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return neg + rest + last + (p[1] ? "." + p[1] : "");
};
const lsGet = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : v;
  } catch (e) {
    return d;
  }
};
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch (e) {
    /* ignore */
  }
};
const esc = (s) =>
  String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/* ============================== columns ============================== */
const COLS = [
  { k: "emp", h: "Employee", t: "text", w: 220, fz: 1 },
  { k: "dept", h: "Department", t: "text", w: 110 },
  { k: "band", h: "Band", t: "text", w: 70 },
  { k: "cyc", h: "Cycle", t: "text", w: 120 },
  { k: "eff", h: "Effective Date", t: "date", w: 112 },
  { k: "mr", h: "Manager Rating", t: "num", w: 92, dp: 1 },
  { k: "mf", h: "Manager Feedback", t: "text", w: 250 },
  { k: "rr", h: "RR%", t: "num", w: 82, dp: 2, pct: 1 },
  { k: "ic", h: "Interview Count", t: "num", w: 92, dp: 0 },
  { k: "gm", h: "Gross Margin", t: "num", w: 104, dp: 2 },
  { k: "client", h: "Cost Center/Client", t: "text", w: 140 },
  { k: "cm", h: "Client Manager", t: "text", w: 120 },
  { k: "cr", h: "Client Rating", t: "num", w: 92, dp: 1 },
  { k: "cf", h: "Client Feedback", t: "text", w: 250 },
  { k: "risk", h: "At Risk", t: "text", w: 80 },
  { k: "ccm", h: "Comp Manager", t: "text", w: 120 },
  { k: "te", h: "Tech ED", t: "text", w: 100 },
  { k: "batch", h: "Upload batch", t: "text", w: 112 },
];
const PER = 20;
const VIEW_KEY = "fbo_view_v2";
const NOTES_KEY = "feedbackRatingMaster.notes";
const RPW_KEY = "feedbackRatingMaster.panelWidth";

/* ============================== DEMO data (remove when wired) ============================== */
const DEMO_CYCLES = [
  { id: 1004, name: "Annual 2026", type: "Annual", status: "Active" },
  { id: 1005, name: "Exceptional 2026-A", type: "Exceptional", status: "Active" },
  { id: 1003, name: "Annual 2025", type: "Annual", status: "Closed" },
  { id: 1002, name: "Annual 2024", type: "Annual", status: "Archived" },
];
const DEMO_BATCHES = [
  { id: "BATCH-0043", cid: 1004, file: "feedback_late_joiners.xlsx", by: "HR — N. Subramanian", at: "02 Oct 2026, 10:12", rows: 5, nw: 5, rep: 0, eff: "2026-07-01" },
  { id: "BATCH-0038", cid: 1004, file: "feedback_q3.xlsx", by: "HR — N. Subramanian", at: "15 Sep 2026, 16:04", rows: 25, nw: 25, rep: 0, eff: "2026-04-01" },
  { id: "BATCH-0029", cid: 1003, file: "feedback_2025_history.xlsx", by: "HR — N. Subramanian", at: "12 Oct 2025, 11:30", rows: 30, nw: 30, rep: 0, eff: "2025-04-01" },
  { id: "BATCH-0017", cid: 1002, file: "feedback_2024_history.xlsx", by: "HR — N. Subramanian", at: "20 Oct 2024, 15:45", rows: 30, nw: 30, rep: 0, eff: "2024-04-01" },
];
function buildDemoRows() {
  const NAMES = ["A. Kumar", "S. Nair", "P. Das", "M. Iyer", "K. Reddy", "R. Bose", "T. Nambiar", "L. Fernandes", "D. Menon", "H. Shah", "J. Thomas", "N. Pillai", "G. Rao", "B. Sen", "C. Joseph", "V. Hegde", "F. Khan", "O. Dsouza", "Q. Verma", "W. Mehta", "Y. Kapoor", "Z. Ali", "E. George", "I. Sharma", "U. Nayak", "X. Patel", "AA. Roy", "AB. Jain", "AC. Naidu", "AD. Bhat"];
  const DESIGS = ["Sr. Consultant", "Consultant", "Manager", "Principal Consultant", "Associate"];
  const TECHEDS = ["V. Rao", "S. Menon", "A. Gupta"];
  const CMS = ["R. Iyer", "K. Nair", "P. Das"];
  const CLIENTS = ["Acme Retail", "Northwind Bank", "Contoso Health", "Globex Logistics", "Initech Telecom"];
  const CMGR = ["J. Parker", "L. Chen", "M. Alvarez", "S. Okafor", "R. Singh"];
  const MFB = ["Owns delivery end to end and unblocks the team.", "Solid contributor; needs to speak up earlier on risks.", "Strong client rapport and consistent quality.", "Good growth this year; ready for a larger scope.", "Meets expectations; documentation can improve.", "Exceeded targets on two critical releases."];
  const CFB = ["Responsive and dependable.", "Technically strong, communication can be sharper.", "Would like to keep on the account.", "Quality of deliverables is high.", "Needs more proactive status updates."];
  const CYC_EFF = { 1004: "2026-04-01", 1003: "2025-04-01", 1002: "2024-04-01" };
  const rnd = (n) => {
    const x = Math.sin(n * 9301 + 49297) * 233280;
    return x - Math.floor(x);
  };
  const out = [];
  [1004, 1003, 1002].forEach((cid, ci) => {
    for (let i = 0; i < 30; i++) {
      const r1 = rnd(i + ci * 40 + 1);
      const r2 = rnd(i + ci * 40 + 77);
      const r3 = rnd(i + ci * 40 + 151);
      const late = cid === 1004 && i >= 25;
      out.push({
        cid,
        id: "E" + (10231 + i),
        name: NAMES[i],
        desig: DESIGS[i % 5],
        dept: ["Delivery", "Cloud", "Data", "ERP"][i % 4],
        band: "B" + (3 + (i % 4)),
        eff: late ? "2026-07-01" : CYC_EFF[cid],
        mr: Math.round((2.6 + r1 * 2.3) * 10) / 10,
        mf: MFB[Math.floor(r1 * 6)],
        rr: Math.round((70 + r2 * 30) * 100) / 100,
        ic: Math.floor(r3 * 12),
        gm: Math.round((18 + r2 * 40) * 100) / 100,
        client: CLIENTS[Math.floor(r3 * 5)],
        cm: CMGR[Math.floor(r2 * 5)],
        cr: Math.round((2.8 + r3 * 2.2) * 10) / 10,
        cf: CFB[Math.floor(r3 * 5)],
        risk: r1 < 0.14 ? "Yes" : "No",
        ccm: CMS[i % 3],
        te: TECHEDS[i % 3],
        batch: late ? "BATCH-0043" : cid === 1004 ? "BATCH-0038" : cid === 1003 ? "BATCH-0029" : "BATCH-0017",
      });
    }
  });
  return out;
}

/* ============================== column filter menu ============================== */
function ColumnMenu({ col, baseRows, filter, wrapOn, pos, rawOf, dispOf, onSort, onWrap, onApply, onClose }) {
  const f = filter || {};
  const vals = useMemo(() => {
    const seen = {};
    const list = [];
    baseRows.forEach((r) => {
      const d = dispOf(r, col);
      if (!seen[d]) {
        seen[d] = 1;
        list.push({ d, r: rawOf(r, col.k) });
      }
    });
    list.sort((a, b) =>
      col.t === "num" ? a.r - b.r : String(a.r).localeCompare(String(b.r), undefined, { numeric: true }),
    );
    return list;
  }, [baseRows, col, rawOf, dispOf]);

  const ops = col.t === "num" ? ["=", "≠", ">", "≥", "<", "≤"] : ["contains", "equals", "starts with", "does not contain"];
  const [op, setOp] = useState((f.cond && f.cond.op) || ops[0]);
  const [val, setVal] = useState((f.cond && f.cond.val) || "");
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState(() => {
    const s = {};
    vals.forEach((v) => {
      s[v.d] = f.vals ? !!f.vals[v.d] : true;
    });
    return s;
  });
  const shown = vals.filter((v) => v.d.toLowerCase().indexOf(search.toLowerCase()) >= 0);
  const allOn = shown.length > 0 && shown.every((v) => sel[v.d]);

  return (
    <div className="fb-cm" style={{ left: pos.left, top: pos.top }} onClick={(e) => e.stopPropagation()}>
      <button className="it" type="button" onClick={() => onSort(1)}>
        Sort ↑ {col.t === "num" ? "smallest to largest" : "A to Z"}
      </button>
      <button className="it" type="button" onClick={() => onSort(-1)}>
        Sort ↓ {col.t === "num" ? "largest to smallest" : "Z to A"}
      </button>
      <label className="chk">
        <input type="checkbox" checked={wrapOn} onChange={(e) => onWrap(e.target.checked)} /> Wrap text in this column
      </label>
      <hr />
      <h5>Condition</h5>
      <div className="r">
        <select value={op} onChange={(e) => setOp(e.target.value)}>
          {ops.map((o) => (
            <option key={o}>{o}</option>
          ))}
        </select>
        <input value={val} onChange={(e) => setVal(e.target.value)} placeholder="value" />
      </div>
      <div className="ft" style={{ marginTop: 2 }}>
        <button
          className="btn"
          type="button"
          onClick={() => onApply(f.vals || null, val.trim() ? { op, val: val.trim() } : null)}
        >
          Apply filter
        </button>
      </div>
      <hr />
      <h5>Values</h5>
      <input className="txt" style={{ width: "100%" }} placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} />
      <div className="lst">
        <label>
          <input
            type="checkbox"
            checked={allOn}
            onChange={(e) => {
              const on = e.target.checked;
              setSel((p) => {
                const n = { ...p };
                shown.forEach((v) => {
                  n[v.d] = on;
                });
                return n;
              });
            }}
          />{" "}
          Select all
        </label>
        {shown.map((v) => (
          <label key={v.d}>
            <input type="checkbox" checked={!!sel[v.d]} onChange={(e) => setSel((p) => ({ ...p, [v.d]: e.target.checked }))} /> {v.d}
          </label>
        ))}
      </div>
      <div className="ft">
        <button className="btn" type="button" onClick={() => onApply(null, null)}>
          Clear
        </button>
        <button
          className="btn pri"
          type="button"
          onClick={() => {
            let all = true;
            const vs = {};
            vals.forEach((v) => {
              if (sel[v.d]) vs[v.d] = 1;
              else all = false;
            });
            onApply(all ? null : vs, f.cond || null);
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

/* ============================== main screen ============================== */
export function FeedbackRatingMasterPage({
  cycles: cyclesProp,
  rows: rowsProp,
  batches: batchesProp,
  loading = false,
  error = "",
}) {
  // BACKEND: replace these three with the real data (props or your own fetch).
  const CYCLES = cyclesProp || DEMO_CYCLES;
  const ROWS = useMemo(() => rowsProp || buildDemoRows(), [rowsProp]);
  const BATCHES = batchesProp || DEMO_BATCHES;

  const saved = useMemo(() => {
    try {
      return JSON.parse(lsGet(VIEW_KEY, "null")) || {};
    } catch (e) {
      return {};
    }
  }, []);

  const [cid, setCid] = useState(() => (CYCLES[0] ? CYCLES[0].id : null));
  const [eff, setEff] = useState("");
  const [q, setQ] = useState("");
  const [te, setTe] = useState("");
  const [ccm, setCcm] = useState("");
  const [risk, setRisk] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState(saved.sort || "emp");
  const [dir, setDir] = useState(saved.dir || 1);
  const [cf, setCf] = useState(saved.cf || {});
  const [wrap, setWrap] = useState(saved.wrap || {});
  const [width, setWidth] = useState(saved.width || {});
  const [hidden, setHidden] = useState(saved.hidden || {});
  const [dens, setDens] = useState(saved.dens || "comfortable");

  const [menuOpen, setMenuOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(() => lsGet(NOTES_KEY, ""));
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelW, setPanelW] = useState(() => {
    const w = parseInt(lsGet(RPW_KEY, "0"), 10) || 0;
    return w ? Math.max(320, Math.min(760, w)) : 360;
  });
  const [pt, setPt] = useState("view");
  const [pp, setPp] = useState("cols");
  const [colMenu, setColMenu] = useState(null); // { k, left, top }
  const [toast, setToast] = useState("");
  const dragRef = useRef(false);

  // Persist "My view".
  useEffect(() => {
    lsSet(VIEW_KEY, JSON.stringify({ sort, dir, cf, wrap, width, hidden, dens }));
  }, [sort, dir, cf, wrap, width, hidden, dens]);
  useEffect(() => {
    lsSet(NOTES_KEY, notes);
  }, [notes]);
  useEffect(() => {
    if (cid == null && CYCLES[0]) setCid(CYCLES[0].id);
  }, [CYCLES, cid]);

  // Close pop-ups on outside click / Escape.
  useEffect(() => {
    const close = () => {
      setMenuOpen(false);
      setNotesOpen(false);
      setColMenu(null);
    };
    const onKey = (e) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("click", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  // Panel resize.
  useEffect(() => {
    const move = (e) => {
      if (!dragRef.current) return;
      setPanelW(Math.max(320, Math.min(760, window.innerWidth - 24 - e.clientX)));
    };
    const up = () => {
      if (dragRef.current) {
        dragRef.current = false;
        setPanelW((w) => {
          lsSet(RPW_KEY, String(w));
          return w;
        });
      }
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
    return () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
  }, []);

  const showToast = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2400);
  };

  /* ---------- derived ---------- */
  const cycName = (id) => {
    const c = CYCLES.find((x) => x.id === id);
    return c ? c.name : "";
  };
  const rawOf = (r, k) => (k === "emp" ? `${r.id} - ${r.name}` : k === "cyc" ? cycName(r.cid) : r[k]);
  const dispOf = (r, c) => {
    const v = rawOf(r, c.k);
    if (c.t === "num") return inr(v, c.dp) + (c.pct ? "%" : "");
    if (c.t === "date") return fmtDate(v);
    return String(v);
  };
  const colOf = (k) => COLS.find((c) => c.k === k);
  const colWidth = (c) => width[c.k] || c.w;
  const cols = COLS.filter((c) => c.fz || !hidden[c.k]);

  const scope = useMemo(
    () => ROWS.filter((r) => r.cid === cid && (!eff || r.eff === eff)),
    [ROWS, cid, eff],
  );
  const effList = useMemo(() => {
    const m = {};
    ROWS.forEach((r) => {
      if (r.cid === cid) m[r.eff] = 1;
    });
    return Object.keys(m).sort();
  }, [ROWS, cid]);
  const teList = useMemo(() => Array.from(new Set(scope.map((r) => r.te))).sort(), [scope]);
  const ccmList = useMemo(() => Array.from(new Set(scope.map((r) => r.ccm))).sort(), [scope]);

  const tbPass = (r) => {
    const s = q.toLowerCase();
    if (te && r.te !== te) return false;
    if (ccm && r.ccm !== ccm) return false;
    if (risk && r.risk !== risk) return false;
    if (s && [r.id, r.name, r.desig, r.client, r.cm, r.mf, r.cf].join(" ").toLowerCase().indexOf(s) < 0) return false;
    return true;
  };
  const condPass = (r, c, cd) => {
    const v = rawOf(r, c.k);
    const x = cd.val;
    if (x === "" || x == null) return true;
    if (c.t === "num") {
      const n = Number(String(x).replace(/,/g, ""));
      if (isNaN(n)) return true;
      switch (cd.op) {
        case "=": return v === n;
        case "≠": return v !== n;
        case ">": return v > n;
        case "≥": return v >= n;
        case "<": return v < n;
        case "≤": return v <= n;
        default: return true;
      }
    }
    const s = String(c.t === "date" ? dispOf(r, c) : v).toLowerCase();
    const y = String(x).toLowerCase();
    switch (cd.op) {
      case "equals": return s === y;
      case "starts with": return s.indexOf(y) === 0;
      case "does not contain": return s.indexOf(y) < 0;
      default: return s.indexOf(y) >= 0;
    }
  };
  const colPass = (r, except) => {
    for (const k in cf) {
      if (k === except) continue;
      const f = cf[k];
      const c = colOf(k);
      if (!c) continue;
      if (f.vals && !f.vals[dispOf(r, c)]) return false;
      if (f.cond && !condPass(r, c, f.cond)) return false;
    }
    return true;
  };

  const filtered = useMemo(() => {
    const f = scope.filter((r) => tbPass(r) && colPass(r, ""));
    const c = colOf(sort) || COLS[0];
    f.sort((a, b) => {
      const x = rawOf(a, sort);
      const y = rawOf(b, sort);
      if (c.t === "num") return (x - y) * dir;
      return String(x).localeCompare(String(y), undefined, { numeric: true }) * dir;
    });
    return f;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, q, te, ccm, risk, cf, sort, dir, CYCLES]);

  const filterCount = Object.keys(cf).length + (te ? 1 : 0) + (ccm ? 1 : 0) + (risk ? 1 : 0) + (q ? 1 : 0);
  const avg = (a, k) => (a.length ? a.reduce((s, r) => s + r[k], 0) / a.length : 0);
  const pages = Math.max(1, Math.ceil(filtered.length / PER));
  const curPage = Math.min(page, pages);
  const slice = filtered.slice((curPage - 1) * PER, curPage * PER);
  const tableW = cols.reduce((s, c) => s + colWidth(c), 0);
  const atRisk = filtered.filter((r) => r.risk === "Yes").length;

  /* ---------- actions ---------- */
  const clearFilters = () => {
    setCf({});
    setTe("");
    setCcm("");
    setRisk("");
    setQ("");
    setPage(1);
  };
  const onCycle = (v) => {
    setCid(+v);
    setEff("");
    setTe("");
    setCcm("");
    setPage(1);
  };
  const openColMenu = (e, k) => {
    e.stopPropagation();
    const rc = e.currentTarget.getBoundingClientRect();
    setColMenu({
      k,
      left: Math.max(8, Math.min(window.innerWidth - 262, rc.left - 200)),
      top: Math.min(rc.bottom + 4, Math.max(8, window.innerHeight - 420)),
    });
  };
  const startResize = (e, c) => {
    e.preventDefault();
    e.stopPropagation();
    const x0 = e.clientX;
    const w0 = colWidth(c);
    const mv = (ev) => setWidth((p) => ({ ...p, [c.k]: Math.max(60, w0 + ev.clientX - x0) }));
    const up = () => {
      document.removeEventListener("mousemove", mv);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", mv);
    document.addEventListener("mouseup", up);
  };

  const exportXls = () => {
    if (!filtered.length) {
      showToast("Nothing to export");
      return;
    }
    const heads = [];
    cols.forEach((c) => {
      if (c.k === "emp") heads.push({ h: "Emp ID", t: "text", x: "id" }, { h: "Employee Name", t: "text", x: "name" }, { h: "Designation", t: "text", x: "desig" });
      else heads.push({ h: c.h, t: c.t, x: c.k, c });
    });
    const st = "border:1px solid #C9D8EC;padding:4px 8px;font-family:Arial;font-size:11pt;";
    let h = '<html><head><meta charset="utf-8"></head><body><table style="border-collapse:collapse"><tr>';
    heads.forEach((x) => {
      h += `<th style="${st}background:#E6EEF8;color:#102A43;font-weight:bold;text-align:${x.t === "num" ? "right" : "left"}">${esc(x.h)}</th>`;
    });
    h += "</tr>";
    filtered.forEach((r, i) => {
      const bg = i % 2 ? "#F2F5F9" : "#FBFCFE";
      h += "<tr>";
      heads.forEach((x) => {
        const v = x.c ? dispOf(r, x.c) : r[x.x];
        let cell = bg;
        let extra = "";
        if (x.x === "id") {
          cell = "#EEF3FA";
          extra = "color:#102A43;font-weight:bold;";
        }
        if (x.x === "risk" && r.risk === "Yes") {
          cell = "#FEF6E7";
          extra = "color:#B7791F;font-weight:bold;";
        }
        h += `<td style="${st}background:${cell};${extra}text-align:${x.t === "num" ? "right" : "left"}">${esc(v)}</td>`;
      });
      h += "</tr>";
    });
    h += "</table></body></html>";
    const nm = "Feedback_Output_" + cycName(cid).replace(/[^A-Za-z0-9]+/g, "_") + (eff ? "_" + eff : "") + "_v2.xls";
    const b = new Blob([h], { type: "application/vnd.ms-excel" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(b);
    a.download = nm;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 400);
    setMenuOpen(false);
    showToast(`Exported ${filtered.length} rows`);
  };

  /* ---------- render ---------- */
  const cmCol = colMenu ? colOf(colMenu.k) : null;
  const effLabel = eff ? fmtDate(eff) : "all dates";
  const batchesForCycle = BATCHES.filter((b) => b.cid === cid);

  return (
    <div className="fb-root" onContextMenu={(e) => e.preventDefault()}>
      <style>{FB_CSS}</style>

      {/* Title row: pickers, My notes, Menu */}
      <div className="fb-tabrow">
        <span className="fb-title">Feedback &amp; Rating Master</span>
        <div className="tr-right" onClick={(e) => e.stopPropagation()}>
          <span className="flt">
            <span className="lbl">Cycle</span>
            <select className="sel" aria-label="Appraisal cycle" value={cid ?? ""} onChange={(e) => onCycle(e.target.value)}>
              {CYCLES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.status}
                </option>
              ))}
            </select>
          </span>
          <span className="flt">
            <span className="lbl">Effective date</span>
            <select
              className="sel"
              aria-label="Effective date"
              value={eff}
              onChange={(e) => {
                setEff(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All dates</option>
              {effList.map((d) => (
                <option key={d} value={d}>
                  {fmtDate(d)}
                </option>
              ))}
            </select>
          </span>
          <div className="menuwrap">
            <button
              className="btn"
              type="button"
              onClick={() => {
                setNotesOpen((v) => !v);
                setMenuOpen(false);
              }}
            >
              My notes
            </button>
            {notesOpen && (
              <div className="pop notes open">
                <h4>My notes</h4>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Write your notes here" />
                <small>Saved in this browser</small>
              </div>
            )}
          </div>
          <div className="menuwrap">
            <button
              className="btn pri"
              type="button"
              onClick={() => {
                setMenuOpen((v) => !v);
                setNotesOpen(false);
              }}
            >
              Menu ▾
            </button>
            {menuOpen && (
              <div className="pop open">
                <button className="item" type="button" onClick={exportXls}>
                  Export to Excel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="fb-gutter">
        <div className="fb-pane">
          <div className="fb-toolbar" onClick={(e) => e.stopPropagation()}>
            <input
              className="txt"
              style={{ width: 250 }}
              placeholder="Search name, ID, client, feedback"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
            <select className="sel" aria-label="Tech ED" value={te} onChange={(e) => { setTe(e.target.value); setPage(1); }}>
              <option value="">Tech ED: all</option>
              {teList.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <select className="sel" aria-label="Comp Manager" value={ccm} onChange={(e) => { setCcm(e.target.value); setPage(1); }}>
              <option value="">Comp Manager: all</option>
              {ccmList.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
            <select className="sel" aria-label="At Risk" value={risk} onChange={(e) => { setRisk(e.target.value); setPage(1); }}>
              <option value="">At Risk: all</option>
              <option value="Yes">At Risk: Yes</option>
              <option value="No">At Risk: No</option>
            </select>
            <button className="btn" type="button" disabled={!filterCount} onClick={clearFilters}>
              Clear filters
            </button>
            <span className="sp mut">
              {filtered.length} of {scope.length} employees
            </span>
          </div>

          {error && <div className="note" style={{ margin: 14 }}>{error}</div>}
          {loading && <div className="note" style={{ margin: 14 }}>Loading feedback and ratings…</div>}

          <div className="tiles2">
            <div className="tile">
              <small>Employees shown</small>
              <b>{filtered.length}</b>
              <em className="mut">of {scope.length}</em>
            </div>
            <div className="tile">
              <small>Avg Manager Rating</small>
              <b>{filtered.length ? avg(filtered, "mr").toFixed(2) : "—"}</b>
            </div>
            <div className="tile">
              <small>Avg Client Rating</small>
              <b>{filtered.length ? avg(filtered, "cr").toFixed(2) : "—"}</b>
            </div>
            <div className="tile">
              <small>At Risk</small>
              <b>{atRisk}</b>
            </div>
          </div>

          {!scope.length ? (
            <div className="note" style={{ margin: 14 }}>
              No feedback loaded for this cycle. Upload it from Upload › Feedback &amp; Rating, then come back here.
            </div>
          ) : !filtered.length ? (
            <div className="note" style={{ margin: 14 }}>No employee matches the filters. Use Clear filters.</div>
          ) : (
            <>
              <div className="twx">
                <table className={"fx" + (dens === "compact" ? " cmp" : "")} style={{ width: tableW }}>
                  <colgroup>
                    {cols.map((c) => (
                      <col key={c.k} style={{ width: colWidth(c) }} />
                    ))}
                  </colgroup>
                  <thead>
                    <tr>
                      {cols.map((c) => (
                        <th key={c.k} className={(c.fz ? "fz " : "") + (c.t === "num" ? "n" : "")}>
                          <div className="thc">
                            <span
                              className="tl"
                              onClick={() => {
                                if (sort === c.k) setDir(-dir);
                                else {
                                  setSort(c.k);
                                  setDir(1);
                                }
                                setPage(1);
                              }}
                            >
                              {cf[c.k] ? <i className="fdot" /> : null}
                              {c.h}
                              {sort === c.k ? (dir > 0 ? " ▲" : " ▼") : ""}
                            </span>
                            <button className="cbtn" type="button" aria-label={"Filter " + c.h} onClick={(e) => openColMenu(e, c.k)}>
                              ▾
                            </button>
                          </div>
                          <i className="rz" onMouseDown={(e) => startResize(e, c)} />
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {slice.map((r, i) => (
                      <tr className="data" key={`${r.cid}-${r.id}-${i}`}>
                        {cols.map((c) => {
                          const cl = (c.fz ? "fz rl " : "") + (c.t === "num" ? "n " : "") + (wrap[c.k] ? "wr" : "");
                          let v;
                          if (c.k === "emp")
                            v = (
                              <>
                                <b>{`${r.id} - ${r.name}`}</b>
                                <br />
                                <span className="sub">{r.desig}</span>
                              </>
                            );
                          else if (c.k === "risk") v = <span className={"tag2 " + (r.risk === "Yes" ? "w" : "g")}>{r.risk}</span>;
                          else v = dispOf(r, c);
                          return (
                            <td key={c.k} className={cl} title={c.t === "text" && c.k !== "emp" ? dispOf(r, c) : undefined}>
                              {v}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="tot">
                      {cols.map((c) => {
                        let v = "";
                        if (c.fz) v = `Total / Average · ${filtered.length} rows`;
                        else if (c.k === "ic") v = inr(filtered.reduce((s, r) => s + r.ic, 0), 0);
                        else if (["mr", "cr", "rr", "gm"].includes(c.k)) v = inr(avg(filtered, c.k), c.dp) + (c.pct ? "%" : "");
                        else if (c.k === "risk") v = `${atRisk} Yes`;
                        return (
                          <td key={c.k} className={(c.fz ? "fz " : "") + (c.t === "num" ? "n" : "")}>
                            {v}
                          </td>
                        );
                      })}
                    </tr>
                  </tfoot>
                </table>
              </div>
              <div className="pgr">
                <span>
                  Rows {(curPage - 1) * PER + 1}–{Math.min(curPage * PER, filtered.length)} of {filtered.length}
                </span>
                <button className="btn" type="button" disabled={curPage <= 1} onClick={() => setPage(curPage - 1)}>
                  ‹
                </button>
                <span>
                  Page {curPage} of {pages}
                </span>
                <button className="btn" type="button" disabled={curPage >= pages} onClick={() => setPage(curPage + 1)}>
                  ›
                </button>
              </div>
            </>
          )}
        </div>

        {/* Right panel */}
        {panelOpen && (
          <aside className="rp" style={{ width: panelW }} aria-label="Right panel" onClick={(e) => e.stopPropagation()}>
            <div
              className="rp-grip"
              title="Drag to resize"
              onMouseDown={(e) => {
                dragRef.current = true;
                e.preventDefault();
              }}
            />
            <div className="rp-head">
              <div className="rp-who">
                <b>Feedback &amp; Rating master</b> · {cycName(cid)} · {effLabel} · {scope.length} employees
              </div>
              <button
                className="rp-ic"
                type="button"
                title="Expand"
                onClick={() => {
                  const nw = panelW < 500 ? 640 : 360;
                  setPanelW(nw);
                  lsSet(RPW_KEY, String(nw));
                }}
              >
                ⤢
              </button>
              <button className="rp-ic" type="button" title="Close" aria-label="Close panel" onClick={() => setPanelOpen(false)}>
                ✕
              </button>
            </div>
            <div className="rp-tabs">
              {[["view", "My view"], ["audit", "Audit"]].map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  aria-selected={pt === k}
                  onClick={() => {
                    setPt(k);
                    setPp(k === "audit" ? "up" : "cols");
                  }}
                >
                  {l}
                </button>
              ))}
            </div>
            <div className="rp-subs">
              {(pt === "view" ? [["cols", "Show / hide columns"], ["dens", "Density"]] : [["up", "Uploads"]]).map(([k, l]) => (
                <button key={k} type="button" aria-pressed={pp === k} onClick={() => setPp(k)}>
                  {l}
                </button>
              ))}
            </div>
            <div className="rp-body">
              {pt === "view" ? (
                <>
                  <div className="rp-info">Widths, wrap, hidden columns, filters, sort and density are saved in this browser.</div>
                  {pp === "cols" ? (
                    <div className="rp-card">
                      <h4>Columns</h4>
                      <label className="rp-chk">
                        <input type="checkbox" checked disabled /> Employee (always on)
                      </label>
                      {COLS.filter((c) => !c.fz).map((c) => (
                        <label className="rp-chk" key={c.k}>
                          <input
                            type="checkbox"
                            checked={!hidden[c.k]}
                            onChange={(e) =>
                              setHidden((p) => {
                                const n = { ...p };
                                if (e.target.checked) delete n[c.k];
                                else n[c.k] = 1;
                                return n;
                              })
                            }
                          />{" "}
                          {c.h}
                        </label>
                      ))}
                    </div>
                  ) : (
                    <div className="rp-card">
                      <h4>Row density</h4>
                      <label className="rp-chk">
                        <input type="radio" name="fb-dn" checked={dens === "comfortable"} onChange={() => setDens("comfortable")} /> Comfortable
                      </label>
                      <label className="rp-chk">
                        <input type="radio" name="fb-dn" checked={dens === "compact"} onChange={() => setDens("compact")} /> Compact
                      </label>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <div className="rp-call">
                    <span className="tg">Information</span>
                    <div className="ln"><b>Read-only output</b></div>
                    <div className="sub">
                      Loaded through Upload › Feedback &amp; Rating. To correct a row, upload the corrected file; the same employee in the same cycle is replaced.
                    </div>
                  </div>
                  {!batchesForCycle.length && <div className="rp-info">No upload for this cycle yet.</div>}
                  {batchesForCycle.map((b) => (
                    <div className="rp-card" key={b.id}>
                      <h4>{b.id} · Uploaded</h4>
                      <div className="rp-row"><span>File</span><b>{b.file}</b></div>
                      <div className="rp-row"><span>By</span><b>{b.by}</b></div>
                      <div className="rp-row"><span>When</span><b>{b.at}</b></div>
                      <div className="rp-row"><span>Effective date</span><b>{fmtDate(b.eff)}</b></div>
                      <div className="rp-row"><span>Rows</span><b>{b.rows} ({b.nw} new · {b.rep} replaced)</b></div>
                    </div>
                  ))}
                </>
              )}
            </div>
            <div className="rp-foot">
              <form onSubmit={(e) => e.preventDefault()}>
                <input placeholder="Ask about this screen…" autoComplete="off" />
                <button className="ag-send" type="submit">Send</button>
              </form>
              <div className="rp-note">Facts only · no predictions · every question logged</div>
            </div>
          </aside>
        )}
      </div>

      {!panelOpen && (
        <button className="flap" type="button" aria-label="Open panel" onClick={(e) => { e.stopPropagation(); setPanelOpen(true); }}>
          Panel ›
        </button>
      )}

      {colMenu && cmCol && (
        <ColumnMenu
          key={colMenu.k}
          col={cmCol}
          baseRows={scope.filter((r) => tbPass(r) && colPass(r, colMenu.k))}
          filter={cf[colMenu.k]}
          wrapOn={!!wrap[colMenu.k]}
          pos={colMenu}
          rawOf={rawOf}
          dispOf={dispOf}
          onSort={(d) => {
            setSort(colMenu.k);
            setDir(d);
            setPage(1);
            setColMenu(null);
          }}
          onWrap={(on) =>
            setWrap((p) => {
              const n = { ...p };
              if (on) n[colMenu.k] = 1;
              else delete n[colMenu.k];
              return n;
            })
          }
          onApply={(vals, cond) => {
            const k = colMenu.k;
            setCf((p) => {
              const n = { ...p };
              const f = {};
              if (vals) f.vals = vals;
              if (cond) f.cond = cond;
              if (f.vals || f.cond) n[k] = f;
              else delete n[k];
              return n;
            });
            setPage(1);
            setColMenu(null);
            if (vals && !Object.keys(vals).length) showToast("Nothing ticked — no rows will show");
          }}
          onClose={() => setColMenu(null)}
        />
      )}

      <div className={"toast" + (toast ? " on" : "")}>{toast}</div>
    </div>
  );
}

export default FeedbackRatingMasterPage;

/* ============================== styles (scoped under .fb-root) ============================== */
const FB_CSS = `
.fb-root{--font:"Manrope","Segoe UI",Arial,sans-serif;--ink:#111827;--muted:#6B7280;--navy:#102A43;--link:#1559A6;--gutter:#D5DFEB;--line:#E5E7EB;--info-bg:#DCEBFF;--info-border:#B9D3F5;--th-bg:#E6EEF8;--th-line:#C9D8EC;--row-odd:#FBFCFE;--row-even:#F2F5F9;--row-hover:#EAF2FF;--rl-bg:#EEF3FA;--err:#C0392B;--ok:#15803D;--warn:#B7791F;--warn-bg:#FEF6E7;--grey:#6B7280;--grey-bg:#EEF0F3;--info:#1D4FA8;--main:#2F6FED;--totals-bg:#E6EEF8;--rp-line:#E5E7EB;--rp-muted:#6B7280;--rp-accent:#102A43;--rp-accent-soft:#EEF0F3;
 font:12.5px var(--font);color:var(--ink);display:flex;flex-direction:column;min-height:100%}
.fb-root *{box-sizing:border-box}
.fb-root button,.fb-root input,.fb-root select,.fb-root textarea{font:inherit;color:inherit}
.fb-root .fb-tabrow{background:#fff;border-bottom:1px solid var(--line);display:flex;align-items:center;padding:0 20px;height:48px;flex:none;gap:10px;position:relative;border-radius:8px 8px 0 0}
.fb-root .fb-title{font-size:15px;font-weight:800;color:var(--navy)}
.fb-root .tr-right{margin-left:auto;display:flex;align-items:center;gap:10px}
.fb-root .tr-right .flt{display:flex;align-items:center;gap:6px;margin-right:6px}.fb-root .tr-right .flt .lbl{font-size:11px;font-weight:600}
.fb-root .tr-right .flt select{max-width:190px}
.fb-root .btn{border:1px solid #D1D5DB;background:#fff;border-radius:6px;padding:6px 12px;font-weight:700;cursor:pointer;white-space:nowrap}
.fb-root .btn:hover{background:#F9FAFB}.fb-root .btn.pri{background:var(--navy);border-color:var(--navy);color:#fff}.fb-root .btn.pri:hover{background:#17385a}
.fb-root .btn:disabled{opacity:.45;cursor:not-allowed}
.fb-root .lbl{color:var(--muted)}.fb-root .mut{color:var(--muted)}
.fb-root select.sel,.fb-root input.txt{border:1px solid #D1D5DB;border-radius:6px;padding:6px 10px;background:#fff}
.fb-root .menuwrap{position:relative}
.fb-root .pop{position:absolute;right:0;top:36px;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 24px rgba(16,42,67,.16);z-index:60;min-width:200px;padding:6px}
.fb-root .pop button.item{display:block;width:100%;text-align:left;background:none;border:0;padding:8px 10px;border-radius:6px;cursor:pointer;font-weight:600}.fb-root .pop button.item:hover{background:var(--row-hover)}
.fb-root .notes{width:340px;padding:12px}.fb-root .notes h4{margin:0 0 6px;font-size:10.5px;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);font-weight:800}
.fb-root .notes textarea{width:100%;height:150px;border:1px solid #D1D5DB;border-radius:6px;padding:8px;resize:vertical}.fb-root .notes small{color:var(--muted)}
.fb-root .fb-gutter{background:var(--gutter);margin:10px 0 12px;border-radius:14px;padding:12px;flex:1;display:flex;gap:12px;align-items:flex-start;min-height:0}
.fb-root .fb-pane{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;flex:1;min-width:0}
.fb-root .fb-toolbar{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid var(--line);flex-wrap:wrap}
.fb-root .fb-toolbar .sp{margin-left:auto}
.fb-root .note{background:var(--info-bg);border:1px solid var(--info-border);color:var(--info);border-radius:10px;padding:9px 12px}
.fb-root .tiles2{display:flex;gap:10px;flex-wrap:wrap;padding:12px 14px 0}
.fb-root .tile{flex:1;min-width:150px;border:1px solid var(--line);border-radius:10px;padding:12px;border-left:5px solid var(--main)}
.fb-root .tile small{color:var(--muted);font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;display:block}
.fb-root .tile b{display:block;font-size:20px;font-weight:800;color:var(--navy);margin-top:4px;font-variant-numeric:tabular-nums}.fb-root .tile em{font-style:normal;font-size:11.5px;font-weight:700}
.fb-root .twx{border:1px solid var(--th-line);border-radius:8px;overflow:auto;margin:12px 14px 0;max-height:calc(100vh - 372px);min-height:240px}
.fb-root table{border-collapse:collapse}
.fb-root th{background:var(--th-bg);color:var(--navy);font-size:10.5px;font-weight:700;text-align:left;padding:9px 11px;border-bottom:1px solid var(--th-line);white-space:normal;vertical-align:bottom;line-height:1.25;position:sticky;top:0}
.fb-root td{padding:8px 11px;border-bottom:1px solid #F0F1F3;white-space:nowrap;font-variant-numeric:tabular-nums}
.fb-root td.n,.fb-root th.n{text-align:right}
.fb-root tbody tr:nth-child(odd) td{background:var(--row-odd)}.fb-root tbody tr:nth-child(even) td{background:var(--row-even)}
.fb-root tbody tr.data:hover td{background:var(--row-hover)}
.fb-root td.rl{background:var(--rl-bg)!important;color:var(--navy);font-weight:700;border-right:1px solid var(--th-line)}
.fb-root table.fx{table-layout:fixed;width:auto;border-collapse:separate;border-spacing:0}
.fb-root table.fx th{position:sticky;top:0;z-index:4;padding:7px 8px 7px 10px;vertical-align:bottom}
.fb-root table.fx th.fz{left:0;z-index:6;background:#DFE8F3}
.fb-root table.fx td{overflow:hidden;text-overflow:ellipsis;padding:7px 10px}
.fb-root table.fx td.fz{position:sticky;left:0;z-index:2;border-right:1px solid var(--th-line)}
.fb-root table.fx td.wr{white-space:normal}
.fb-root table.fx.cmp td{padding:3px 10px}.fb-root table.fx.cmp th{padding-top:4px;padding-bottom:4px}
.fb-root .thc{display:flex;align-items:flex-end;gap:4px}
.fb-root .thc .tl{flex:1;min-width:0;white-space:normal;line-height:1.25;cursor:pointer}
.fb-root .cbtn{flex:none;border:1px solid transparent;background:none;border-radius:4px;color:var(--navy);font-size:11px;line-height:1;padding:3px 4px;cursor:pointer}
.fb-root .cbtn:hover{background:#fff;border-color:var(--th-line)}
.fb-root .fdot{display:inline-block;width:7px;height:7px;border-radius:50%;background:#FFD54F;border:1px solid #C9A400;margin-right:2px;vertical-align:middle}
.fb-root .rz{position:absolute;right:0;top:0;bottom:0;width:6px;cursor:col-resize}.fb-root .rz:hover{background:var(--th-line)}
.fb-root table.fx tfoot td{position:sticky;bottom:0;z-index:3;background:var(--totals-bg)!important;color:var(--navy);font-weight:800;border-top:1px solid var(--th-line);border-bottom:0}
.fb-root table.fx tfoot td.fz{z-index:5;left:0}
.fb-root .sub{color:var(--muted);font-weight:600;font-size:11px}
.fb-root .pgr{display:flex;align-items:center;gap:8px;justify-content:flex-end;padding:10px 14px 14px;color:var(--muted);font-weight:600}
.fb-root .pgr .btn{padding:3px 10px}
.fb-root .tag2{display:inline-block;border-radius:10px;padding:2px 9px;font-size:10.5px;font-weight:700}
.fb-root .tag2.w{background:var(--warn-bg);color:var(--warn)}.fb-root .tag2.g{background:var(--grey-bg);color:var(--grey)}
.fb-cm{position:fixed;z-index:70;background:#fff;border:1px solid #E5E7EB;border-radius:10px;box-shadow:0 8px 24px rgba(16,42,67,.16);width:250px;padding:8px;font:12px "Manrope","Segoe UI",Arial,sans-serif;color:#111827}
.fb-cm *{box-sizing:border-box}
.fb-cm .it{display:block;width:100%;text-align:left;background:none;border:0;padding:6px 8px;border-radius:6px;cursor:pointer;font:inherit;font-weight:600}.fb-cm .it:hover{background:#EAF2FF}
.fb-cm .chk{display:flex;gap:6px;align-items:center;padding:4px 8px;font-weight:600}
.fb-cm hr{border:0;border-top:1px solid #E5E7EB;margin:6px 0}
.fb-cm h5{margin:4px 0;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#6B7280}
.fb-cm .r{display:flex;gap:6px;margin:4px 0}.fb-cm .r select,.fb-cm .r input{min-width:0;flex:1;border:1px solid #D1D5DB;border-radius:6px;padding:5px 7px;background:#fff;font:inherit}
.fb-cm .txt{border:1px solid #D1D5DB;border-radius:6px;padding:6px 10px;background:#fff;font:inherit}
.fb-cm .lst{max-height:150px;overflow:auto;border:1px solid #E5E7EB;border-radius:6px;padding:4px 6px;margin-top:4px}
.fb-cm .lst label{display:flex;gap:6px;align-items:center;padding:2px 0;font-weight:600}
.fb-cm .ft{display:flex;gap:6px;justify-content:flex-end;margin-top:8px}
.fb-cm .btn{border:1px solid #D1D5DB;background:#fff;border-radius:6px;padding:4px 10px;font:inherit;font-weight:700;cursor:pointer}
.fb-cm .btn.pri{background:#102A43;border-color:#102A43;color:#fff}
.fb-root .flap{position:fixed;right:0;top:38%;z-index:41;background:var(--navy);color:#fff;border:0;border-radius:8px 0 0 8px;width:30px;padding:14px 0;writing-mode:vertical-rl;font-weight:800;font-size:12px;letter-spacing:.02em;cursor:pointer;box-shadow:-2px 2px 8px rgba(16,42,67,.18)}.fb-root .flap:hover{background:#17385a}
.fb-root .rp{position:fixed;right:24px;top:116px;bottom:20px;background:#fff;border:1px solid var(--rp-line);border-radius:12px;box-shadow:0 10px 30px rgba(16,42,67,.18);display:flex;flex-direction:column;z-index:40;font-size:12px}
.fb-root .rp-grip{position:absolute;left:0;top:0;bottom:0;width:8px;cursor:ew-resize;z-index:2}.fb-root .rp-grip::after{content:"";position:absolute;left:2px;top:50%;width:4px;height:36px;margin-top:-18px;border-radius:3px;background:#D1D5DB}.fb-root .rp-grip:hover::after{background:var(--rp-accent)}
.fb-root .rp-head{display:flex;align-items:center;gap:8px;padding:8px 10px 8px 16px;border-bottom:1px solid var(--rp-line);flex:none}
.fb-root .rp-who{flex:1;min-width:0;font-size:12px;color:#374151;line-height:1.35}.fb-root .rp-who b{color:var(--navy);font-size:13px}
.fb-root .rp-ic{flex:none;border:1px solid #D1D5DB;background:#fff;border-radius:6px;height:26px;min-width:26px;padding:0 6px;font-size:13px;color:#374151;cursor:pointer}.fb-root .rp-ic:hover{border-color:var(--rp-accent);color:var(--rp-accent)}
.fb-root .rp-tabs{display:flex;border-bottom:1px solid var(--rp-line);flex:none;background:#FAFAFB}
.fb-root .rp-tabs button{flex:1;background:none;border:0;border-bottom:2px solid transparent;padding:9px 0;font-size:13px;font-weight:600;color:var(--rp-muted);cursor:pointer;white-space:nowrap}
.fb-root .rp-tabs button[aria-selected="true"]{color:var(--ink);border-bottom-color:var(--rp-accent);font-weight:800}
.fb-root .rp-subs{display:flex;flex-wrap:wrap;gap:6px;padding:10px 14px 4px 16px;flex:none}
.fb-root .rp-subs button{border:1px solid #D1D5DB;background:#fff;border-radius:14px;padding:3px 10px;font-size:11.5px;color:#374151;cursor:pointer}
.fb-root .rp-subs button[aria-pressed="true"]{background:var(--rp-accent-soft);border-color:#CBD2DA;color:var(--ink);font-weight:700}
.fb-root .rp-body{flex:1;min-height:0;overflow:auto;padding:6px 14px 14px 16px}
.fb-root .rp-foot{flex:none;border-top:1px solid var(--rp-line);padding:8px 14px 8px 16px}
.fb-root .rp-foot form{display:flex;gap:8px;margin:0}.fb-root .rp-foot input{flex:1;min-width:0;height:30px;border:1px solid #CBD5DA;border-radius:6px;padding:0 10px;font-size:12px}
.fb-root .ag-send{height:30px;padding:0 13px;border:0;border-radius:6px;background:#102A43;color:#fff;font-weight:700;font-size:12px;cursor:pointer}
.fb-root .rp-note{font-size:10.5px;color:var(--rp-muted);margin-top:4px}
.fb-root .rp-info{border:1px solid var(--rp-line);background:#F7F8FA;border-radius:8px;padding:6px 10px;margin-top:8px;font-size:12px}
.fb-root .rp-card{border:1px solid var(--rp-line);border-left:5px solid var(--main);border-radius:8px;padding:10px 12px;margin-top:8px}
.fb-root .rp-card h4{margin:0 0 6px;font-size:10.5px;font-weight:800;letter-spacing:.04em;color:var(--rp-muted);text-transform:uppercase}
.fb-root .rp-row{display:flex;justify-content:space-between;gap:8px;padding:3px 0;font-variant-numeric:tabular-nums}.fb-root .rp-row+.rp-row{border-top:1px dashed #EEF0F3}
.fb-root .rp-call{border:1px solid var(--rp-line);border-left:5px solid var(--main);border-radius:8px;padding:9px 12px;margin-top:8px;background:#fff}
.fb-root .rp-call .tg{font-size:10px;font-weight:800;text-transform:uppercase;color:var(--info);background:var(--info-bg);border-radius:4px;padding:2px 7px}
.fb-root .rp-call .ln{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:6px;font-weight:700}
.fb-root .rp-call .sub{color:var(--rp-muted);margin-top:2px;font-weight:400;font-size:12px}
.fb-root .rp-chk{display:flex;gap:8px;align-items:center;padding:4px 0;font-weight:600}
.fb-root .toast{position:fixed;left:50%;bottom:22px;transform:translateX(-50%);background:var(--navy);color:#fff;padding:9px 16px;border-radius:8px;font-weight:700;opacity:0;pointer-events:none;transition:opacity .2s;z-index:80}.fb-root .toast.on{opacity:1}
`;