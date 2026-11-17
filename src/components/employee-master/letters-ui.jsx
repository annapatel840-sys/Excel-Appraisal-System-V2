import { useCallback, useEffect, useRef, useState } from "react";

import { isEmptyFilter } from "@/lib/appraisal-filters";

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
  const [sorts, setSorts] = useState([]); // [{ key, dir }], up to 3 levels
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
      if (!value || isEmptyFilter(value)) delete next[key];
      else next[key] = value;
      return next;
    });
  const addSort = (key, dir) =>
    setSorts((cur) => [...cur.filter((s) => s.key !== key), { key, dir }].slice(-3));
  const clearColumn = (key) => {
    setFilter(key, null);
    setSort((s) => (s && s.key === key ? null : s));
    setSorts((cur) => cur.filter((s) => s.key !== key));
  };
  const clearAll = () => {
    setFilters({});
    setSort(null);
    setSorts([]);
  };

  // appraisal: true -> DataGrid draws the Employee Master header filter (same icon + popup).
  return {
    cols, patchCol, filters, setFilter, clearColumn, clearAll,
    appraisal: true, sorts, addSort,
    sort: sorts, setSort, dens, setDens, filterCount: Object.keys(filters).length,
  };
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

/* ---------- letter / template preview: fill the chips with real values ----------
   `html` is the editor HTML (tags are .lt-merge-field chips), `values` the tag
   values of one employee, `sg` the template's signatory block. Returns the HTML
   to show and the tags that had no value (they are highlighted, and block a send). */
export function mergeLetterHtml(html, values, sg) {
  const root = document.createElement("div");
  root.innerHTML = String(html || "");
  const miss = [];
  root.querySelectorAll(".lt-merge-field").forEach((chip) => {
    const key = chip.getAttribute("data-letter-tag") || chip.textContent || "";
    const value = values[key];
    let node;
    if (key === "Signature" && sg && sg.sigFile) {
      if (sg.sigData) {
        node = document.createElement("img");
        node.className = "lt-preview-signature";
        node.src = sg.sigData;
        node.alt = "Signature";
      } else {
        node = document.createElement("span");
        node.className = "lt-preview-field";
        node.textContent = "[Signature]";
      }
    } else if (value == null || value === "") {
      node = document.createElement("mark");
      node.className = "lt-miss";
      node.textContent = "{{" + key + "}}";
      if (!miss.includes(key)) miss.push(key);
    } else {
      node = document.createElement("span");
      node.style.whiteSpace = "pre-line";
      node.textContent = String(value);
    }
    chip.replaceWith(node);
  });
  return { html: root.innerHTML, miss };
}

export const letterFontStyle = (t) => ({
  fontFamily: `${t.font || "Calibri"}, Arial, sans-serif`,
  fontSize: `${t.fsize || 11}pt`,
  lineHeight: t.lh || 1.15,
});