import { useMemo, useState } from "react";

import { ColumnFilter } from "@/components/appraisal/ColumnFilter";
import { isEmptyFilter, matchesValue } from "@/lib/appraisal-filters";

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

  return {
    rows: view,
    total: rows.length,
    filters,
    sorts,
    activeCount,
    hasView: activeCount > 0 || sorts.length > 0,
    setFilter,
    addSort,
    clearAll,
    optionsFor: (col) =>
      Array.from(new Set(rows.map((r) => String(col.get(r) ?? "")))),
    valuesFor: (col) => rows.map((r) => col.get(r)),
  };
}

/* One header cell: label on the left, the Appraisal-sheet filter icon on the
   right. `className` is passed to <th> (e.g. "r" / "n" for right-aligned
   numeric columns) so each screen's own table CSS keeps controlling the look. */
export function FilterTh({ tf, col, className = "", style }) {
  const sortIndex = tf.sorts.findIndex((s) => s.key === col.key);
  return (
    <th className={className} style={style}>
      <div className="ft-head">
        <span className="ft-label" title={col.label}>
          {col.label}
        </span>
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
      </div>
    </th>
  );
}

/* "Showing 3 of 12 · Clear filters" strip, only visible while a filter or sort
   is applied. */
export function FilterStatus({ tf, noun = "rows" }) {
  if (!tf.hasView) return null;
  return (
    <div className="ft-status">
      <span>
        {tf.activeCount > 0
          ? `${tf.activeCount} filter${tf.activeCount === 1 ? "" : "s"} · showing ${tf.rows.length} of ${tf.total} ${noun}`
          : "Sorted view"}
      </span>
      <button type="button" className="ft-clear" onClick={tf.clearAll}>
        Clear filters &amp; sort
      </button>
    </div>
  );
}

/* Shared look for the filter header + status strip + bordered grid. Each
   screen appends this to its own CSS, scoped by its root class. */
export const filterTableCss = (root, table) => `
${root} .ft-head { display: flex; align-items: center; gap: 6px; min-height: 22px; }
${root} .ft-head .ft-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
${root} ${table} th.r .ft-label, ${root} ${table} th.n .ft-label, ${root} ${table} th.num .ft-label { text-align: right; }
${root} ${table} th .ft-head > button { flex-shrink: 0; }
${root} .ft-status { display: flex; align-items: center; gap: 12px; padding: 6px 14px; background: #eef4fc; border-bottom: 1px solid #c9d8ec; font-size: 11.5px; color: #334155; }
${root} .ft-clear { margin-left: auto; background: none; border: 0; padding: 0; color: #1859a8; font-size: 11.5px; font-weight: 700; cursor: pointer; }
${root} .ft-empty td { text-align: center !important; color: #64748b; padding: 16px 10px !important; }
`;