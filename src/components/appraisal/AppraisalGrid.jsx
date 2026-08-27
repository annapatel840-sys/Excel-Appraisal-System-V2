import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useCallback, useMemo, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { ColumnFilter } from "./ColumnFilter";
import { RatingBadge } from "./StatusBadge";
import { COLUMNS, COMPUTED_COLUMNS, inr, } from "@/lib/appraisal-data";
import { useAppraisal } from "@/lib/appraisal-store";
const editableCols = COLUMNS.filter((c) => c.editable);
const editableIndex = new Map(editableCols.map((c, i) => [c.key, i]));
export function AppraisalGrid({ rows, filters, setFilter, optionsFor, selected, toggleSelected, toggleAll, onRowOpen, }) {
    const { updateCell, modified } = useAppraisal();
    const cellRefs = useRef({});
    const [active, setActive] = useState(null);
    const [saving, setSaving] = useState({});
    const focusCell = useCallback((r, c) => {
        const el = cellRefs.current[`${r}:${c}`];
        if (el) {
            el.focus();
            if (el instanceof HTMLInputElement)
                el.select();
        }
    }, []);
    const flashSaved = useCallback((key) => {
        setSaving((p) => ({ ...p, [key]: Date.now() }));
        setTimeout(() => setSaving((p) => {
            const n = { ...p };
            delete n[key];
            return n;
        }), 1200);
    }, []);
    const commit = useCallback((row, col, raw) => {
        const value = col.type === "currency" || col.type === "number" ? Number(raw.replace(/[^\d.-]/g, "")) || 0 : raw;
        if (String(row[col.key]) === String(value))
            return;
        updateCell(row.id, col.key, value);
        flashSaved(`${row.id}:${col.key}`);
    }, [updateCell, flashSaved]);
    const onKeyDown = (e, r, c) => {
        const max = rows.length - 1;
        const maxC = editableCols.length - 1;
        const target = e.target;
        const atStart = !("selectionStart" in target) || target.selectionStart === 0;
        const atEnd = !("selectionEnd" in target) || target.selectionEnd === (target.value?.length ?? 0);
        if (e.key === "Enter") {
            e.preventDefault();
            focusCell(e.shiftKey ? Math.max(0, r - 1) : Math.min(max, r + 1), c);
        }
        else if (e.key === "ArrowDown") {
            e.preventDefault();
            focusCell(Math.min(max, r + 1), c);
        }
        else if (e.key === "ArrowUp") {
            e.preventDefault();
            focusCell(Math.max(0, r - 1), c);
        }
        else if (e.key === "ArrowRight" && atEnd) {
            if (c < maxC) {
                e.preventDefault();
                focusCell(r, c + 1);
            }
        }
        else if (e.key === "ArrowLeft" && atStart) {
            if (c > 0) {
                e.preventDefault();
                focusCell(r, c - 1);
            }
        }
        else if (e.key === "Escape") {
            target.blur();
        }
    };
    const allSelected = rows.length > 0 && rows.every((r) => selected[r.id]);
    const headers = useMemo(() => [...COLUMNS.map((c) => ({ key: c.key, label: c.label, width: c.width })),
        ...COMPUTED_COLUMNS.map((c) => ({ key: c.key, label: c.label, width: c.width }))], []);
    return (_jsxs("div", { className: "relative overflow-auto rounded-xl border border-border bg-card", style: { maxHeight: "calc(100vh - 300px)" }, children: [_jsxs("table", { className: "w-max border-separate border-spacing-0 text-sm", children: [_jsx("thead", { className: "sticky top-0 z-30", children: _jsxs("tr", { children: [_jsx("th", { className: "sticky left-0 z-40 w-10 border-r border-b border-grid-line bg-grid-header px-2 py-2", children: _jsx(Checkbox, { checked: allSelected, onCheckedChange: (v) => toggleAll(!!v), "aria-label": "Select all" }) }), headers.map((h, i) => (_jsx("th", { style: { width: h.width, minWidth: h.width, left: i === 0 ? 40 : i === 1 ? 136 : undefined }, className: cn("border-r border-b border-grid-line bg-grid-header px-3 py-2 text-left text-xs font-semibold tracking-wide text-muted-foreground uppercase", i < 2 && "sticky z-40"), children: _jsxs("div", { className: "flex items-center justify-between gap-1", children: [_jsx("span", { className: "truncate", children: h.label }), _jsx(ColumnFilter, { columnKey: h.key, filter: filters[h.key], options: optionsFor(h.key), onChange: (f) => setFilter(h.key, f) })] }) }, h.key)))] }) }), _jsxs("tbody", { children: [rows.map((row, r) => (_jsxs("tr", { className: "group transition-colors hover:bg-accent/40", children: [_jsx("td", { className: "sticky left-0 z-20 border-r border-b border-grid-line bg-card px-2 py-1 group-hover:bg-accent/40", children: _jsx(Checkbox, { checked: !!selected[row.id], onCheckedChange: (v) => toggleSelected(row.id, !!v), "aria-label": `Select ${row.name}` }) }), COLUMNS.map((col, ci) => {
                                        const cellKey = `${row.id}:${col.key}`;
                                        const isModified = !!modified[cellKey];
                                        const c = editableIndex.get(col.key);
                                        const isActive = active === `${r}:${c}`;
                                        const sticky = ci < 2;
                                        return (_jsxs("td", { style: { width: col.width, minWidth: col.width, left: ci === 0 ? 40 : ci === 1 ? 136 : undefined }, onDoubleClick: () => !col.editable && onRowOpen(row), className: cn("relative border-r border-b border-grid-line px-0 py-0 align-middle", sticky ? "sticky z-20 bg-card group-hover:bg-accent/40" : "bg-transparent", isModified && "bg-cell-modified/70", isActive && "ring-2 ring-primary ring-inset"), children: [!col.editable ? (_jsx("button", { type: "button", onClick: () => onRowOpen(row), className: cn("block w-full truncate px-3 py-2 text-left", col.key === "name" && "font-medium text-foreground hover:text-primary", col.key === "empId" && "num text-xs text-muted-foreground"), children: String(row[col.key]) })) : col.type === "enum" ? (_jsx("select", { ref: (el) => { cellRefs.current[`${r}:${c}`] = el; }, value: String(row[col.key]), onFocus: () => setActive(`${r}:${c}`), onBlur: () => setActive(null), onKeyDown: (e) => onKeyDown(e, r, c), onChange: (e) => { updateCell(row.id, col.key, e.target.value); flashSaved(cellKey); }, className: "w-full cursor-pointer appearance-none bg-transparent px-3 py-2 text-sm outline-none", children: (col.options ?? []).map((o) => (_jsx("option", { value: o, children: o }, o))) })) : (_jsxs("div", { className: "relative", children: [_jsx("input", { ref: (el) => { cellRefs.current[`${r}:${c}`] = el; }, defaultValue: String(row[col.key]), inputMode: "numeric", onFocus: (e) => { setActive(`${r}:${c}`); e.currentTarget.select(); }, onBlur: (e) => { setActive(null); commit(row, col, e.target.value); }, onKeyDown: (e) => {
                                                                if (e.key === "Enter")
                                                                    commit(row, col, e.target.value);
                                                                onKeyDown(e, r, c);
                                                            }, className: "num w-full bg-transparent px-3 py-2 text-right text-[13px] outline-none" }, `${cellKey}-${row[col.key]}`), saving[cellKey] !== undefined && (_jsx("span", { className: "pointer-events-none absolute top-1/2 right-1 -translate-y-1/2 text-status-submitted", children: _jsx(Check, { className: "size-3.5" }) }))] })), col.key === "managerRating" && false && _jsx(RatingBadge, { rating: row.managerRating })] }, col.key));
                                    }), COMPUTED_COLUMNS.map((c) => (_jsx("td", { style: { width: c.width, minWidth: c.width }, className: "num border-r border-b border-grid-line px-3 py-2 text-right text-[13px] text-muted-foreground", children: c.kind === "currency" ? inr(c.fn(row)) : `${c.fn(row).toFixed(1)}%` }, c.key)))] }, row.id))), rows.length === 0 && (_jsx("tr", { children: _jsx("td", { colSpan: headers.length + 1, className: "px-6 py-16 text-center text-sm text-muted-foreground", children: "No employees match the current filters." }) }))] })] }), _jsx("div", { className: "pointer-events-none sticky bottom-0 left-0 hidden", children: _jsx(Loader2, { className: "size-3" }) })] }));
}
