import { useCallback, useEffect, useRef, useState } from "react";

/* Small helpers shared by the Letters screens. */

/* ---------- localStorage (never throws) ---------- */
export function readJson(key, fallback) {
  if (!key) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
export function writeJson(key, value) {
  if (!key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

/* ---------- grid state ----------
   Same shape as useGridState() in DataGrid.jsx, but the column list follows
   `defs`, because the Letter Fields tab can add or remove columns while the
   screen is open. Column visibility is remembered in this browser. */
export function useLtGrid(defs, visStorageKey) {
  const [over, setOver] = useState({});
  const [vis, setVis] = useState(() => readJson(visStorageKey, {}));
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null);
  const [dens, setDens] = useState("comfortable");

  const cols = defs.map((d) => {
    const o = over[d.key] || {};
    return {
      key: d.key,
      w: o.w ?? d.w ?? 140,
      wrap: o.wrap ?? d.wrap !== false,
      vis: d.fixed ? true : (vis[d.key] ?? d.vis !== false),
    };
  });

  const patchCol = (key, patch) => {
    if ("vis" in patch) {
      const next = { ...vis, [key]: patch.vis };
      setVis(next);
      writeJson(visStorageKey, next);
    }
    const { vis: _ignored, ...rest } = patch;
    if (Object.keys(rest).length) setOver((cur) => ({ ...cur, [key]: { ...cur[key], ...rest } }));
  };

  const setFilter = (key, value) =>
    setFilters((cur) => {
      const next = { ...cur };
      if (!value || (!value.cond && !value.sel)) delete next[key];
      else next[key] = value;
      return next;
    });
  const clearColumn = (key) => {
    setFilter(key, null);
    setSort((s) => (s && s.key === key ? null : s));
  };
  const clearAll = () => {
    setFilters({});
    setSort(null);
  };

  return { cols, patchCol, filters, setFilter, clearColumn, clearAll, sort, setSort, dens, setDens, filterCount: Object.keys(filters).length };
}

/* ---------- 20-per-page paging for ClientPager ---------- */
export function usePaged(rows, size = 20) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const cur = Math.min(page, pages);
  return {
    page: cur,
    setPage,
    pages,
    pageRows: rows.slice((cur - 1) * size, cur * size),
    from: rows.length ? (cur - 1) * size + 1 : 0,
    to: Math.min(rows.length, cur * size),
  };
}

/* ---------- inline message / reason bar (no pop-ups) ----------
   bar = { kind: "reason", title, cb, val, err } | { kind: "msg", text, err } */
export function useLtBar() {
  const [bar, setBar] = useState(null);
  const say = (text, err = false) => setBar({ kind: "msg", text, err: !!err });
  const askReason = (title, cb) => setBar({ kind: "reason", title, cb, err: "", val: "" });
  const close = () => setBar(null);
  const ok = () => {
    if (!bar || bar.kind !== "reason") return;
    const v = (bar.val || "").trim();
    if (!v) {
      setBar({ ...bar, err: "A reason is required." });
      return;
    }
    const cb = bar.cb;
    setBar(null);
    cb(v);
  };

  let el = null;
  if (bar && bar.kind === "reason") {
    el = (
      <div className="lt-bar">
        <b>{bar.title}</b>
        <input
          autoFocus
          className="lt-txt reason"
          placeholder="Reason (required)"
          value={bar.val || ""}
          onChange={(e) => setBar({ ...bar, val: e.target.value, err: "" })}
          onKeyDown={(e) => e.key === "Enter" && ok()}
        />
        <button type="button" className="lt-btn pri" onClick={ok}>Confirm</button>
        <button type="button" className="lt-btn" onClick={close}>Cancel</button>
        {bar.err && <span className="err">{bar.err}</span>}
      </div>
    );
  } else if (bar) {
    el = (
      <div className="lt-bar">
        <span className={bar.err ? "err" : "msg"}>{bar.text}</span>
        <button type="button" className="lt-btn lt-sp" onClick={close}>Close</button>
      </div>
    );
  }
  return { bar, say, askReason, close, el };
}

/* ---------- toast ---------- */
export function useToast() {
  const [text, setText] = useState("");
  const timer = useRef(null);
  const toast = useCallback((t) => {
    setText(t);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setText(""), 2600);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  return { toast, el: text ? <div className="lt-toast" role="status">{text}</div> : null };
}

/* ---------- letter preview: empty tags are highlighted ----------
   core.merge() wraps an empty tag as \u0001Name\u0002 */
export function LtPreview({ text }) {
  const parts = String(text).split(/\u0001([^\u0002]*)\u0002/);
  return (
    <div className="lt-pv">
      {parts.map((p, i) => (i % 2 ? <mark key={i}>{`{{${p}}}`}</mark> : p))}
    </div>
  );
}

/* ---------- warning list ---------- */
export function LtErrs({ errs }) {
  if (!errs || !errs.length) return null;
  return (
    <div className="lt-note warn lt-in-note" style={{ display: "block" }}>
      {errs.map((e, i) => (
        <div key={i}>{e}</div>
      ))}
    </div>
  );
}

/* ---------- Excel export of what a grid shows ---------- */
export async function exportRows(defs, rows, fileName, sheetName = "Letters") {
  const mod = await import("xlsx");
  const XLSX = mod.default && mod.default.utils ? mod.default : mod;
  const aoa = [
    defs.map((d) => d.label),
    ...rows.map((r) =>
      defs.map((d) => {
        const n = d.sv ? d.sv(r) : null;
        return typeof n === "number" ? n : String(d.get(r) ?? "");
      }),
    ),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, `${fileName}.xlsx`);
}
