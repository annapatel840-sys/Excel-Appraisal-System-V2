import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { ColumnFilter } from "@/components/appraisal/ColumnFilter";
import { isEmptyFilter, matchesValue } from "@/lib/appraisal-filters";

const OPS = [
  ["contains", "contains"],
  ["not", "does not contain"],
  ["eq", "equals"],
  ["starts", "starts with"],
  ["ends", "ends with"],
];

function condOk(op, value, term) {
  const v = value.toLowerCase();
  const x = term.toLowerCase();
  if (op === "contains") return v.includes(x);
  if (op === "not") return !v.includes(x);
  if (op === "eq") return v === x;
  if (op === "starts") return v.startsWith(x);
  return v.endsWith(x);
}

/* ---------- state hook: widths, visibility, wrap, filters, sort, density ---------- */
/* Pass { appraisal: true } to get the Appraisal Sheet's header filter (same icon,
   same Excel-style menu with sort, text / number filters and a value checklist).
   Without it the grid keeps its original ▾ menu, so other screens are unchanged. */
const MAX_SORT_LEVELS = 3;

export function useGridState(defs, options = {}) {
  const appraisal = Boolean(options.appraisal);
  const [cols, setCols] = useState(() =>
    defs.map((d) => ({ key: d.key, w: d.w || 140, vis: d.vis !== false, wrap: d.wrap !== false })),
  );
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null);
  const [sorts, setSorts] = useState([]); // appraisal mode: [{ key, dir }], up to 3 levels
  const [dens, setDens] = useState("comfortable");

  const patchCol = (key, patch) =>
    setCols((current) => current.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const setFilter = (key, value) =>
    setFilters((current) => {
      const next = { ...current };
      if (appraisal) {
        if (!value || isEmptyFilter(value)) delete next[key];
        else next[key] = value;
      } else if (!value || (!value.cond && !value.sel)) delete next[key];
      else next[key] = value;
      return next;
    });

  const addSort = (key, dir) =>
    setSorts((current) => [...current.filter((s) => s.key !== key), { key, dir }].slice(-MAX_SORT_LEVELS));

  const clearColumn = (key) => {
    setFilter(key, null);
    setSort((s) => (s && s.key === key ? null : s));
    setSorts((current) => current.filter((s) => s.key !== key));
  };

  const clearAll = () => {
    setFilters({});
    setSort(null);
    setSorts([]);
  };

  return {
    cols, patchCol, filters, setFilter, clearColumn, clearAll,
    appraisal, sorts, addSort,
    sort: appraisal ? sorts : sort, setSort, dens, setDens, filterCount: Object.keys(filters).length,
  };
}

/* ---------- filtered + sorted rows ---------- */
const asNumber = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function useGridView(rows, defs, grid, pre) {
  return useMemo(() => {
    if (grid.appraisal) {
      const active = defs.filter((d) => grid.filters[d.key]);
      let list = rows.filter((row) => {
        if (pre && !pre(row)) return false;
        return active.every((d) => {
          const raw = d.get(row);
          return matchesValue(d.kind === "number" ? raw : String(raw ?? ""), grid.filters[d.key]);
        });
      });
      const live = grid.sorts.filter((x) => defs.some((d) => d.key === x.key));
      if (!live.length) return list;
      return [...list].sort((a, b) => {
        for (const { key, dir } of live) {
          const d = defs.find((x) => x.key === key);
          const sv = d.sv || d.get;
          const x = sv(a);
          const y = sv(b);
          let diff;
          if (d.kind === "number") {
            const nx = asNumber(x);
            const ny = asNumber(y);
            if (nx === null && ny === null) diff = 0;
            else if (nx === null) return 1; // blanks always last
            else if (ny === null) return -1;
            else diff = nx - ny;
          } else {
            diff = String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true, sensitivity: "base" });
          }
          if (diff !== 0) return dir === "asc" ? diff : -diff;
        }
        return 0;
      });
    }

    let out = rows.filter((row) => {
      if (pre && !pre(row)) return false;
      return defs.every((d) => {
        const f = grid.filters[d.key];
        if (!f) return true;
        const v = String(d.get(row) ?? "");
        if (f.sel && !f.sel.has(v)) return false;
        if (f.cond && !condOk(f.cond.op, v, f.cond.val)) return false;
        return true;
      });
    });

    if (grid.sort) {
      const d = defs.find((x) => x.key === grid.sort.key);
      if (d) {
        const dir = grid.sort.dir === "asc" ? 1 : -1;
        const sv = d.sv || d.get;
        out = [...out].sort((a, b) => {
          const x = sv(a);
          const y = sv(b);
          if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
          return String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true }) * dir;
        });
      }
    }
    return out;
  }, [rows, defs, grid.filters, grid.sort, pre]);
}

/* ---------- Excel-style column menu ---------- */
function ColumnMenu({ def, grid, allRows, rect, onClose }) {
  const ref = useRef(null);
  const f = grid.filters[def.key] || {};
  const colState = grid.cols.find((c) => c.key === def.key);

  const [op, setOp] = useState(f.cond?.op || "contains");
  const [val, setVal] = useState(f.cond?.val || "");
  const [q, setQ] = useState("");

  const values = useMemo(
    () =>
      [...new Set(allRows.map((r) => String(def.get(r) ?? "")))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
    [allRows, def],
  );
  const [sel, setSel] = useState(() => new Set(f.sel ?? values));

  useEffect(() => {
    const outside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const esc = (e) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [onClose]);

  const shown = values.filter((v) => v.toLowerCase().includes(q.toLowerCase()));
  const allShown = shown.length > 0 && shown.every((v) => sel.has(v));

  const toggleValue = (v) =>
    setSel((current) => {
      const next = new Set(current);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });

  const toggleShown = () =>
    setSel((current) => {
      const next = new Set(current);
      shown.forEach((v) => (allShown ? next.delete(v) : next.add(v)));
      return next;
    });

  const commit = () => {
    const cond = val.trim() ? { op, val: val.trim() } : null;
    const everything = values.every((v) => sel.has(v));
    grid.setFilter(def.key, { cond, sel: everything ? null : sel });
    onClose();
  };

  const left = Math.min(window.innerWidth - 262, Math.max(6, rect.left - 200));

  return (
    <div className="emx-cm" ref={ref} style={{ left, top: rect.bottom + 4 }}>
      <button type="button" className="it" onClick={() => { grid.setSort({ key: def.key, dir: "asc" }); onClose(); }}>
        Sort ↑ A to Z
      </button>
      <button type="button" className="it" onClick={() => { grid.setSort({ key: def.key, dir: "desc" }); onClose(); }}>
        Sort ↓ Z to A
      </button>

      <label>
        <input
          type="checkbox"
          checked={!!colState?.wrap}
          onChange={(e) => grid.patchCol(def.key, { wrap: e.target.checked })}
        />
        Wrap text in this column
      </label>

      <div className="h">Condition filter</div>
      <div className="row">
        <select value={op} onChange={(e) => setOp(e.target.value)}>
          {OPS.map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        <input type="text" placeholder="Value" value={val} onChange={(e) => setVal(e.target.value)} />
      </div>

      <div className="h">Values</div>
      <input type="text" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} style={{ width: "100%" }} />
      <div className="lst">
        <label>
          <input type="checkbox" checked={allShown} onChange={toggleShown} /> (Select all)
        </label>
        {shown.map((v) => (
          <label key={v}>
            <input type="checkbox" checked={sel.has(v)} onChange={() => toggleValue(v)} />
            {v === "" ? "(blank)" : v}
          </label>
        ))}
      </div>

      <div className="ft">
        <button type="button" className="emx-mini" onClick={() => { grid.clearColumn(def.key); onClose(); }}>
          Clear
        </button>
        <button type="button" className="emx-mini p" onClick={commit}>
          Apply
        </button>
      </div>
    </div>
  );
}

/* ---------- the grid ---------- */
const MIN_COL = 110; // label + filter icon stay visible
const MIN_COL_SELECT = 140; // first column also holds the row checkbox
export function DataGrid({
  defs, grid, allRows, rows, rowKey,
  selectable = false, selected, onToggleRow, onToggleAll,
  allSelected = false, someSelected = false, canSelectRow,
  highlighted, // optional Set of row keys to tint (e.g. the row open in a side panel) when that differs from the ticked rows
  rowClass, actionHeader, renderAction,
  emptyText = "No rows match the current filters.",
  fillWidth = false, // stretch columns to the full width of the grid area
  actionWidth = 130,
  stickyAction = false, // keep the action column pinned on the right while the rest scrolls
}) {
  const [menu, setMenu] = useState(null);

  // Appraisal-style header filter: the value checklist lists every value of the column.
  const optionsByKey = useMemo(
    () =>
      grid.appraisal
        ? Object.fromEntries(
            defs.map((d) => [d.key, Array.from(new Set(allRows.map((r) => String(d.get(r) ?? ""))))]),
          )
        : null,
    [grid.appraisal, defs, allRows],
  );

  const visible = defs
    .map((d) => ({ d, c: grid.cols.find((x) => x.key === d.key) }))
    .filter((x) => x.c && x.c.vis);

  const ACTION_W = actionWidth;
  // Never let a column get so narrow that its filter icon is clipped.
  const minOf = (index) => (selectable && index === 0 ? MIN_COL_SELECT : MIN_COL);
  const widthOf = (c, index) => Math.max(minOf(index), c.w);
  const totalW = visible.reduce((s, x, i) => s + widthOf(x.c, i), 0) + (actionHeader ? ACTION_W : 0);
  const colSpan = visible.length + (actionHeader ? 1 : 0);

  const startResize = (event, key, w0, min) => {
    event.preventDefault();
    event.stopPropagation();
    const x0 = event.clientX;
    // The last column stretches to fill the table, so start from the width actually drawn.
    const th = event.currentTarget.closest("th");
    if (th) w0 = Math.round(th.getBoundingClientRect().width);
    const move = (e) => grid.patchCol(key, { w: Math.max(min, w0 + e.clientX - x0) });
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };

  const menuDef = menu ? defs.find((d) => d.key === menu.key) : null;

  return (
    <>
      <div className="emx-wrap">
        <table
          className={"emx-table" + (grid.dens === "compact" ? " cmp" : "")}
          style={{ tableLayout: "fixed", width: "100%", minWidth: totalW }}
        >
          <colgroup>
            {visible.map(({ d, c }, i) => (
              <col key={d.key} style={i === visible.length - 1 ? undefined : { width: widthOf(c, i) }} />
            ))}
            {actionHeader && <col style={{ width: ACTION_W }} />}
          </colgroup>

          <thead>
            <tr>
              {visible.map(({ d, c }, index) => {
                const arrow = !grid.appraisal && grid.sort && grid.sort.key === d.key ? (grid.sort.dir === "asc" ? " ↑" : " ↓") : "";
                return (
                  <th key={d.key}>
                    <div className="emx-thi">
                      {selectable && index === 0 && (
                        <input
                          type="checkbox"
                          className="emx-chk"
                          checked={allSelected}
                          ref={(el) => { if (el) el.indeterminate = !allSelected && someSelected; }}
                          onChange={onToggleAll}
                          title="Select all rows in the current filter"
                          aria-label="Select all"
                        />
                      )}
                      <span className="emx-tl" title={d.label}>{d.label}{arrow}</span>
                      {!grid.appraisal && grid.filters[d.key] && <span className="emx-dot" />}
                      {d.info && <span className="emx-info" title={d.info}>ⓘ</span>}
                      {grid.appraisal ? (
                        <ColumnFilter
                          boxed
                          alwaysBelow
                          scrollToHeader
                          allowGroup={false}
                          columnKey={`emx:${d.key}`}
                          label={d.label}
                          kind={d.kind === "number" ? "number" : "text"}
                          filter={grid.filters[d.key]}
                          options={optionsByKey[d.key]}
                          allValues={d.kind === "number" ? allRows.map((r) => d.get(r)) : []}
                          onChange={(filter) => grid.setFilter(d.key, filter)}
                          sortDirection={grid.sorts.find((x) => x.key === d.key)?.dir || null}
                          sortLevel={grid.sorts.findIndex((x) => x.key === d.key) + 1}
                          onSortAsc={() => grid.addSort(d.key, "asc")}
                          onSortDesc={() => grid.addSort(d.key, "desc")}
                        />
                      ) : (
                        <button
                          type="button"
                          className="emx-tb"
                          aria-label={`Filter ${d.label}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setMenu({ key: d.key, rect: e.currentTarget.getBoundingClientRect() });
                          }}
                        >
                          ▾
                        </button>
                      )}
                    </div>
                    <span className="emx-rs" onMouseDown={(e) => startResize(e, d.key, widthOf(c, index), minOf(index))} />
                  </th>
                );
              })}
              {actionHeader && (
                <th className={stickyAction ? "emx-actcol" : undefined}>
                  <div className="emx-thi"><span className="emx-tl">{actionHeader}</span></div>
                </th>
              )}
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={colSpan} className="emx-empty">{emptyText}</td>
              </tr>
            ) : (
              rows.map((row) => {
                const id = rowKey(row);
                const on = selected ? selected.has(id) : false;
                const tinted = highlighted ? highlighted.has(id) : on;
                const selectableRow = selectable && (!canSelectRow || canSelectRow(row));
                return (
                  <tr key={id} className={`${tinted ? "emx-sel" : ""} ${rowClass ? rowClass(row) : ""}`}>
                    {visible.map(({ d, c }, index) => {
                      const content = d.render ? d.render(row) : String(d.get(row) ?? "");
                      return (
                        <td key={d.key} className={c.wrap ? "wr" : ""} title={d.render ? undefined : String(d.get(row) ?? "")}>
                          {selectable && index === 0 ? (
                            <div className="emx-ef">
                              {selectableRow ? (
                                <input
                                  type="checkbox"
                                  className="emx-chk"
                                  checked={on}
                                  onChange={() => onToggleRow(id)}
                                  aria-label="Select row"
                                />
                              ) : (
                                <span style={{ width: 14, flex: "none" }} />
                              )}
                              <div className="emx-et">{content}</div>
                            </div>
                          ) : (
                            content
                          )}
                        </td>
                      );
                    })}
                    {actionHeader && (
                      <td className={stickyAction ? "emx-actcol" : undefined}>{renderAction(row)}</td>
                    )}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {menuDef && (
        <ColumnMenu
          key={menu.key}
          def={menuDef}
          grid={grid}
          allRows={allRows}
          rect={menu.rect}
          onClose={() => setMenu(null)}
        />
      )}
    </>
  );
}

/* ---------- client-side pager (20 per page) ----------
   Shows a sliding window of 5 page numbers with ‹ / › buttons
   (same behaviour as the appraisal sheet). */
const PAGER_WINDOW = 5;

function pagerWindow(page, pages) {
  const size = Math.min(pages, PAGER_WINDOW);
  let first = page - Math.floor(PAGER_WINDOW / 2);
  first = Math.max(1, Math.min(first, pages - size + 1));
  return Array.from({ length: size }, (_, i) => first + i);
}

export function ClientPager({ page, pages, from, to, total, allTotal, onPage, grid }) {
  return (
    <div className="emx-pg">
      <span>
        {from}–{to} of {total}
        {total !== allTotal ? ` (filtered from ${allTotal})` : ""}
      </span>

      {grid.filterCount > 0 && (
        <span className="emx-chip">
          Showing: {grid.filterCount} column filter{grid.filterCount > 1 ? "s" : ""}{" "}
          <button type="button" onClick={grid.clearAll}>✕ Clear</button>
        </span>
      )}

      <span className="emx-pgs">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
          title="Previous page"
        >
          <ChevronLeft size={14} />
        </button>
        {pagerWindow(page, pages).map((p) => (
          <button key={p} type="button" className={p === page ? "on" : ""} onClick={() => onPage(p)}>
            {p}
          </button>
        ))}
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
          title="Next page"
        >
          <ChevronRight size={14} />
        </button>
      </span>
    </div>
  );
}