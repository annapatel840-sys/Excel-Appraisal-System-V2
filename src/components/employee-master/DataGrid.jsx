import { useEffect, useMemo, useRef, useState } from "react";

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
export function useGridState(defs) {
  const [cols, setCols] = useState(() =>
    defs.map((d) => ({ key: d.key, w: d.w || 140, vis: d.vis !== false, wrap: d.wrap !== false })),
  );
  const [filters, setFilters] = useState({});
  const [sort, setSort] = useState(null);
  const [dens, setDens] = useState("comfortable");

  const patchCol = (key, patch) =>
    setCols((current) => current.map((c) => (c.key === key ? { ...c, ...patch } : c)));

  const setFilter = (key, value) =>
    setFilters((current) => {
      const next = { ...current };
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

  return {
    cols, patchCol, filters, setFilter, clearColumn, clearAll,
    sort, setSort, dens, setDens, filterCount: Object.keys(filters).length,
  };
}

/* ---------- filtered + sorted rows ---------- */
export function useGridView(rows, defs, grid, pre) {
  return useMemo(() => {
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
export function DataGrid({
  defs, grid, allRows, rows, rowKey,
  selectable = false, selected, onToggleRow, onToggleAll,
  allSelected = false, someSelected = false, canSelectRow,
  rowClass, actionHeader, renderAction,
  emptyText = "No rows match the current filters.",
}) {
  const [menu, setMenu] = useState(null);

  const visible = defs
    .map((d) => ({ d, c: grid.cols.find((x) => x.key === d.key) }))
    .filter((x) => x.c && x.c.vis);

  const ACTION_W = 130;
  const totalW = visible.reduce((s, x) => s + x.c.w, 0) + (actionHeader ? ACTION_W : 0);
  const colSpan = visible.length + (actionHeader ? 1 : 0);

  const startResize = (event, key, w0) => {
    event.preventDefault();
    event.stopPropagation();
    const x0 = event.clientX;
    const move = (e) => grid.patchCol(key, { w: Math.max(70, w0 + e.clientX - x0) });
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
        <table className={"emx-table" + (grid.dens === "compact" ? " cmp" : "")} style={{ width: totalW }}>
          <colgroup>
            {visible.map(({ d, c }) => (
              <col key={d.key} style={{ width: c.w }} />
            ))}
            {actionHeader && <col style={{ width: ACTION_W }} />}
          </colgroup>

          <thead>
            <tr>
              {visible.map(({ d, c }, index) => {
                const arrow = grid.sort && grid.sort.key === d.key ? (grid.sort.dir === "asc" ? " ↑" : " ↓") : "";
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
                      {grid.filters[d.key] && <span className="emx-dot" />}
                      {d.info && <span className="emx-info" title={d.info}>ⓘ</span>}
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
                    </div>
                    <span className="emx-rs" onMouseDown={(e) => startResize(e, d.key, c.w)} />
                  </th>
                );
              })}
              {actionHeader && (
                <th>
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
                const selectableRow = selectable && (!canSelectRow || canSelectRow(row));
                return (
                  <tr key={id} className={`${on ? "emx-sel" : ""} ${rowClass ? rowClass(row) : ""}`}>
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
                    {actionHeader && <td>{renderAction(row)}</td>}
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

/* ---------- client-side pager (20 per page) ---------- */
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
        <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹</button>
        {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
          <button key={p} type="button" className={p === page ? "on" : ""} onClick={() => onPage(p)}>
            {p}
          </button>
        ))}
        <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)}>›</button>
      </span>
    </div>
  );
}