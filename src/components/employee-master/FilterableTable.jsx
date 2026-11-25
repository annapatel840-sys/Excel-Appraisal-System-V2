import { useMemo, useState } from "react";

import { ColumnFilter } from "@/components/appraisal/ColumnFilter";
import { NUMBER_OPS, TEXT_OPS, isEmptyFilter, matchesValue } from "@/lib/appraisal-filters";
import { X } from "lucide-react";

/* ============================================================
   Column filters for the Budget Distribution tables.
   Front-end only: it filters / sorts the rows a screen already has in memory.
   It reuses the Appraisal Sheet's header filter (same icon, same Excel-style
   menu: sort, text / number filters, value checklist) so every table looks and
   behaves the same.

   columns: [{ key, label, kind: "text" | "number", get: (row) => value,
               sort?: (row) => value }]   (sort: optional value used for ordering,
                                           e.g. a raw ISO date behind a formatted label)
   ============================================================ */

const MAX_SORT_LEVELS = 3;

const asNumber = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function useTableFilters(rows, columns) {
  const [filters, setFilters] = useState({});
  const [sorts, setSorts] = useState([]); // [{ key, dir }]

  const byKey = useMemo(() => {
    const map = new Map();
    columns.forEach((c) => map.set(c.key, c));
    return map;
  }, [columns]);

  const view = useMemo(() => {
    const active = Object.entries(filters).filter(
      ([key, f]) => f && byKey.has(key) && !isEmptyFilter(f),
    );
    let out = rows;
    if (active.length) {
      out = rows.filter((row) =>
        active.every(([key, f]) => matchesValue(byKey.get(key).get(row), f)),
      );
    }
    const live = sorts.filter((s) => byKey.has(s.key));
    if (!live.length) return out;
    return [...out].sort((a, b) => {
      for (const { key, dir } of live) {
        const col = byKey.get(key);
        const x = (col.sort || col.get)(a);
        const y = (col.sort || col.get)(b);
        let diff;
        if (col.kind === "number") {
          const nx = asNumber(x);
          const ny = asNumber(y);
          // Blanks always sort last.
          if (nx === null && ny === null) diff = 0;
          else if (nx === null) return 1;
          else if (ny === null) return -1;
          else diff = nx - ny;
        } else {
          diff = String(x ?? "").localeCompare(String(y ?? ""), undefined, {
            numeric: true,
            sensitivity: "base",
          });
        }
        if (diff !== 0) return dir === "asc" ? diff : -diff;
      }
      return 0;
    });
  }, [rows, filters, sorts, byKey]);

  const activeCount = Object.entries(filters).filter(
    ([key, f]) => f && byKey.has(key) && !isEmptyFilter(f),
  ).length;

  const setFilter = (key, filter) =>
    setFilters((current) => {
      const next = { ...current };
      if (filter && !isEmptyFilter(filter)) next[key] = filter;
      else delete next[key];
      return next;
    });

  const addSort = (key, dir) =>
    setSorts((current) => {
      const without = current.filter((s) => s.key !== key);
      return [...without, { key, dir }].slice(-MAX_SORT_LEVELS);
    });

  const clearAll = () => {
    setFilters({});
    setSorts([]);
  };

  const removeSort = (key) => setSorts((current) => current.filter((s) => s.key !== key));

  return {
    rows: view,
    total: rows.length,
    filters,
    sorts,
    activeCount,
    hasView: activeCount > 0 || sorts.length > 0,
    setFilter,
    addSort,
    removeSort,
    clearAll,
    labelOf: (key) => byKey.get(key)?.label || key,
    optionsFor: (col) =>
      Array.from(new Set(rows.map((r) => String(col.get(r) ?? "")))),
    valuesFor: (col) => rows.map((r) => col.get(r)),
  };
}

/* Column resizing (drag the right edge of a header, like the Appraisal Sheet).
   `defaults` is a module-level { columnKey: widthPx } map; keys in column order.

   Every column except the last owns a fixed pixel width, so dragging one edge
   changes ONLY that column. The last column has no fixed width: it takes
   whatever room is left, so the table always fills its container (no white
   gap on the right) and, when the columns need more room than is available,
   the table scrolls sideways instead. */
const MIN_COL = 90; // narrow enough to stay readable, wide enough to keep the filter icon visible

export function useColumnResize(defaults) {
  const [widths, setWidths] = useState(defaults);
  const widthOf = (key) => Math.max(MIN_COL, widths[key] ?? defaults[key] ?? 100);

  const startResize = (key) => (event) => {
    event.preventDefault();
    event.stopPropagation();
    const th = event.currentTarget.closest("th");
    const startX = event.clientX;
    // The last column is auto-width, so start from what is actually drawn.
    const startW = th ? Math.round(th.getBoundingClientRect().width) : widthOf(key);
    const move = (e) =>
      setWidths((cur) => ({ ...cur, [key]: Math.max(MIN_COL, Math.round(startW + e.clientX - startX)) }));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return { widthOf, startResize };
}

// Fixed layout: fills the container, never narrower than the columns need.
export const resizableTableStyle = (rz, keys) => ({
  tableLayout: "fixed",
  width: "100%",
  minWidth: keys.reduce((sum, key) => sum + rz.widthOf(key), 0),
  maxWidth: "none",
});

export function ResizableCols({ rz, keys, flexKey }) {
  return (
    <colgroup>
      {keys.map((key, i) => (
        <col
          key={key}
          data-key={key}
          style={(flexKey ? key === flexKey : i === keys.length - 1) ? undefined : { width: rz.widthOf(key) }}
        />
      ))}
    </colgroup>
  );
}

/* One header cell: label on the left, the Appraisal-sheet filter icon on the
   right. `className` is passed to <th> (e.g. "r" / "n" for right-aligned
   numeric columns) so each screen's own table CSS keeps controlling the look. */
export function FilterTh({ tf, col, rz, noFilter = false, className = "", style }) {
  const sortIndex = tf.sorts.findIndex((s) => s.key === col.key);
  return (
    <th className={(className + " ft-th").trim()} style={style}>
      <div className="ft-head">
        <span className="ft-label" title={col.label}>
          {col.label}
        </span>
        {!noFilter && (
        <ColumnFilter
          boxed
          alwaysBelow
          allowGroup={false}
          columnKey={col.key}
          label={col.label}
          kind={col.kind}
          filter={tf.filters[col.key]}
          options={tf.optionsFor(col)}
          allValues={col.kind === "number" ? tf.valuesFor(col) : []}
          onChange={(filter) => tf.setFilter(col.key, filter)}
          sortDirection={sortIndex >= 0 ? tf.sorts[sortIndex].dir : null}
          sortLevel={sortIndex + 1}
          onSortAsc={() => tf.addSort(col.key, "asc")}
          onSortDesc={() => tf.addSort(col.key, "desc")}
        />
        )}
      </div>
      {rz && (
        <div
          role="separator"
          aria-label={`Resize ${col.label} column`}
          title="Drag to resize column"
          className="ft-rz"
          onPointerDown={rz.startResize(col.key)}
        />
      )}
    </th>
  );
}

/* Readable text for one applied column filter ("Status: Active", "Code contains "AU""). */
export function describeTableFilter(label, f) {
  if (f.kind === "enum") return `${label}: ${(f.values || []).join(", ")}`;
  const ops = f.kind === "text" ? TEXT_OPS : NUMBER_OPS;
  const opText = (op) => (ops.find((o) => o.value === op)?.label || op).toLowerCase();
  const one = (op, v, v2) =>
    op === "between" ? `between ${v} and ${v2}` : f.kind === "text" ? `${opText(op)} "${v}"` : `${opText(op)} ${v}`;
  let text = `${label} ${one(f.op, f.value, f.value2)}`;
  if (f.op2 && String(f.value3 ?? "").trim() !== "") {
    text += ` ${f.join === "or" ? "or" : "and"} ${one(f.op2, f.value3)}`;
  }
  return text;
}

/* "Showing 3 of 12" strip with one removable tag per applied filter and per
   sort (click a tag to remove it), plus "Clear all". Only visible while a
   filter or sort is applied. */
export function FilterStatus({ tf, noun = "rows" }) {
  if (!tf.hasView) return null;
  const filterTags = Object.entries(tf.filters)
    .filter(([key, f]) => f && !isEmptyFilter(f))
    .map(([key, f]) => ({
      id: `f:${key}`,
      text: describeTableFilter(tf.labelOf(key), f),
      clear: () => tf.setFilter(key, null),
    }));
  const sortTags = tf.sorts.map((s) => ({
    id: `s:${s.key}`,
    text: `Sort: ${tf.labelOf(s.key)} ${s.dir === "desc" ? "↓" : "↑"}`,
    clear: () => tf.removeSort(s.key),
  }));
  return (
    <div className="ft-status">
      <span className="ft-count">
        {tf.activeCount > 0 ? `Showing ${tf.rows.length} of ${tf.total} ${noun}` : "Sorted view"}
      </span>
      {[...filterTags, ...sortTags].map((t) => (
        <button key={t.id} type="button" className="ft-tag" title="Remove" onClick={t.clear}>
          {t.text}
          <X size={12} />
        </button>
      ))}
      <button type="button" className="ft-clear" onClick={tf.clearAll}>
        Clear all
      </button>
    </div>
  );
}

/* Shared look for the filter header + status strip + bordered grid. Each
   screen appends this to its own CSS, scoped by its root class. */
export const filterTableCss = (root, table) => `
${root} ${table} th.ft-th { position: relative; vertical-align: top; white-space: normal; line-height: 1.2; }
${root} .ft-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 4px; min-height: 20px; }
${root} .ft-head .ft-label { flex: 1; min-width: 0; text-align: left; white-space: normal; overflow-wrap: break-word; word-break: normal; }
${root} ${table} th .ft-head > button { flex-shrink: 0; }
${root} ${table} td { overflow-wrap: break-word; }
${root} .ft-rz { position: absolute; top: 0; right: -3px; z-index: 5; width: 7px; height: 100%; cursor: col-resize; touch-action: none; }
${root} .ft-rz:hover { background: linear-gradient(90deg, transparent 2px, #2f6fed 2px, #2f6fed 5px, transparent 5px); }
${root} .ft-status { display: flex; align-items: center; gap: 12px; padding: 5px 14px; background: #eef4fc; border-bottom: 1px solid #c9d8ec; font-size: 11.5px; color: #334155; }
${root} .ft-status { flex-wrap: wrap; }
${root} .ft-tag { display: inline-flex; align-items: center; gap: 5px; border: 0; border-radius: 999px; background: #dbe7f6; color: #17365d; padding: 3px 10px; font-size: 11px; font-weight: 600; cursor: pointer; }
${root} .ft-tag:hover { background: #c8daf1; }
${root} .ft-clear { margin-left: auto; background: none; border: 0; padding: 0; color: #1859a8; font-size: 11.5px; font-weight: 700; cursor: pointer; }
${root} .ft-empty td { text-align: center !important; color: #64748b; padding: 12px 8px !important; }
`;