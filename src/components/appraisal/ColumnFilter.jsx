import { useEffect, useMemo, useRef, useState } from "react";
import { Filter } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { fieldByKey, isEmptyFilter } from "@/lib/appraisal-filters";

import { useCurrencyConfig, money as formatMoneyAmount } from "@/lib/currency-format";
/* ============================================================
   COLUMN FILTER — Excel-style column menu
   - Sort A→Z / Z→A (smallest / largest for numbers); up to 3 sort levels
   - Group by this column / remove grouping
   - Clear filter from this column
   - Text Filters / Number Filters ▸ (Equals, Begins with, Between, Top 10,
     Above / Below average, Custom filter with two conditions And / Or)
   - Search + checkbox list (Select All) with OK / Cancel
   - bulk edit this column  ->  ONLY for editable columns
   ============================================================ */

const INTER = '"Inter", "Segoe UI", system-ui, sans-serif';

const TEXT_MENU = [
  ["equals", "Equals…"],
  ["notEquals", "Does Not Equal…"],
  "-",
  ["startsWith", "Begins With…"],
  ["endsWith", "Ends With…"],
  "-",
  ["contains", "Contains…"],
  ["notContains", "Does Not Contain…"],
  "-",
  ["custom", "Custom Filter…"],
];

const NUMBER_MENU = [
  ["eq", "Equals…"],
  ["neq", "Does Not Equal…"],
  "-",
  ["gt", "Greater Than…"],
  ["gte", "Greater Than Or Equal To…"],
  ["lt", "Less Than…"],
  ["lte", "Less Than Or Equal To…"],
  ["between", "Between…"],
  "-",
  ["top", "Top 10…"],
  ["above", "Above Average"],
  ["below", "Below Average"],
  "-",
  ["custom", "Custom Filter…"],
];

const TEXT_OP_LABELS = {
  equals: "equals",
  notEquals: "does not equal",
  startsWith: "begins with",
  endsWith: "ends with",
  contains: "contains",
  notContains: "does not contain",
};

const NUMBER_OP_LABELS = {
  eq: "equals",
  neq: "does not equal",
  gt: "is greater than",
  gte: "is greater than or equal to",
  lt: "is less than",
  lte: "is less than or equal to",
};

const numberOf = (value) => {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(String(value).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/* Opening a column filter scrolls the page so the header of the table it belongs to is on screen. */
export function revealTableHeader(trigger, instant = false) {
  try {
    const th = trigger?.closest("th");
    const table = trigger?.closest("table");
    if (!th || !table) return;
    // The table's own scrolling box (rows scroll inside it), if it has one. A scrolling ancestor that is
    // taller than the table is the page itself, so the table is what must be brought into view then.
    let box = table.parentElement;
    while (box && box !== document.body) {
      const o = getComputedStyle(box).overflowY;
      if ((o === "auto" || o === "scroll") && box.scrollHeight > box.clientHeight + 1) break;
      box = box.parentElement;
    }
    const ownBox = box && box !== document.body && box.clientHeight < table.offsetHeight ? box : null;
    const head = th.getBoundingClientRect();
    const view = window.innerHeight;
    // Header already comfortably in the upper part of the screen: leave the page alone.
    if (head.top >= 70 && head.bottom <= view * 0.5) return;
    const behavior = instant ? "auto" : "smooth";

    if (ownBox) {
      // Rows scroll inside their own box: bring that box up, keep the rows where they are.
      const prev = ownBox.style.scrollMarginTop;
      ownBox.style.scrollMarginTop = "72px"; // clear the app's top bar
      ownBox.scrollIntoView({ block: "start", inline: "nearest", behavior });
      setTimeout(() => {
        ownBox.style.scrollMarginTop = prev;
      }, 700);
      return;
    }

    // The page (or a pane) scrolls. A table near the end of the page cannot reach the top because there is
    // nothing left to scroll, so the scrolling area gets extra room at its bottom, just enough for this table.
    // The browser then does the scrolling itself (scrollIntoView finds whichever element really scrolls).
    let pane = table.parentElement;
    while (pane && pane !== document.body) {
      const o = getComputedStyle(pane).overflowY;
      if ((o === "auto" || o === "scroll") && pane.clientHeight > 200 && pane.scrollHeight > pane.clientHeight) break;
      pane = pane.parentElement;
    }
    const spaceHolder = pane && pane !== document.body ? pane : document.body;
    const paneTop = spaceHolder === document.body ? 0 : spaceHolder.getBoundingClientRect().top;
    const delta = table.getBoundingClientRect().top - Math.max(paneTop, 0) - 72;
    const scroller = spaceHolder === document.body ? document.scrollingElement || document.documentElement : spaceHolder;
    const room = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
    if (delta > room) {
      // A real empty block at the end of the scrolling area (padding is not counted by every layout).
      // It goes inside the pane's child that holds this table, so it sits after the content (not at the
      // bottom of the visible area, which is where a flex pane would put a direct child).
      let holder = table;
      while (holder.parentElement && holder.parentElement !== spaceHolder) holder = holder.parentElement;
      if (holder === table || !holder.parentElement) holder = spaceHolder;
      let spacerEl = Array.from(holder.children).find((c) => c.hasAttribute("data-filter-scroll-spacer"));
      if (!spacerEl) {
        spacerEl = document.createElement("div");
        spacerEl.setAttribute("data-filter-scroll-spacer", "");
        spacerEl.setAttribute("aria-hidden", "true");
        spacerEl.style.cssText = "flex:none;width:1px;pointer-events:none;";
        holder.appendChild(spacerEl);
      }
      const have = parseFloat(spacerEl.style.height) || 0;
      spacerEl.style.height = `${have + Math.ceil(delta - room) + 8}px`;
    }
    const prev = table.style.scrollMarginTop;
    table.style.scrollMarginTop = "72px"; // clear the app's top bar
    table.scrollIntoView({ block: "start", inline: "nearest", behavior });
    setTimeout(() => {
      table.style.scrollMarginTop = prev;
    }, 700);
  } catch (_) {
    /* scrolling is a convenience only */
  }
}

function MenuItem({ children, onClick, disabled, icon, active, className, ...rest }) {
  return (
    <div
      role="menuitem"
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      className={cn(
        "relative cursor-default whitespace-nowrap py-[5px] pl-[30px] pr-2.5 text-[12px] text-[#1f2f3d]",
        disabled
          ? "pointer-events-none text-[#9ca3af]"
          : "hover:bg-[#dcebff]",
        active && "bg-[#eef4fc] font-semibold",
        className,
      )}
      {...rest}
    >
      {icon && (
        <span className="absolute left-2 top-1 text-[9px] font-extrabold leading-[9px] text-[#17365d]">
          {icon}
        </span>
      )}
      {children}
    </div>
  );
}

const Divider = () => <hr className="my-[3px] border-0 border-t border-[#d1d5db]" />;

export function ColumnFilter({
  boxed = false, // Appraisal Sheet header look: white boxed button
  sortHighlight = true, // false: only an applied filter darkens the button (a sort just shows its arrow)
  scrollToHeader = false, // on open, bring this table's header into view if it is cut off / far down the page
  columnKey,
  filter,
  options = [],
  allValues = [],
  onChange,

  // sort / group (wired to the grid)
  sortDirection = null,
  sortLevel = 0,
  onSortAsc,
  onSortDesc,
  isGrouped = false,
  onToggleGroup,

  // bulk edit
  bulkEditable = false,
  bulkRowCount = 0,
  onBulkApply,

  // optional: for screens whose columns are not in the appraisal column list
  label: labelProp,
  // "number" | "text": for screens whose columns are not in the appraisal
  // column list, choose Number Filters or Text Filters explicitly.
  kind: kindProp,
  allowGroup = true,
  // Always open directly under the header cell (never flip above the grid when
  // the window is short); the value list shrinks to fit instead.
  alwaysBelow = false,
}) {
  useCurrencyConfig();
  const meta = fieldByKey(columnKey);

  const [open, setOpen] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [subLeft, setSubLeft] = useState(true);
  const contentRef = useRef(null);
  const triggerRef = useRef(null);
  const [alignEnd, setAlignEnd] = useState(false);

  // checkbox list draft
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState([]);
  // Ticks as they were before a search started (restored when search is cleared).
  const pickedBeforeSearch = useRef(null);

  // bulk edit draft
  const [bulkValue, setBulkValue] = useState("");

  // Custom AutoFilter / Top 10 dialog
  const [dialog, setDialog] = useState(null);

  const isNumberColumn = (kindProp ?? meta?.kind) === "number";
  const isEnumColumn = meta?.kind === "enum";
  // Number Filters for number columns and for number-only enums (Manager Rating).
  const useNumberFilters = isNumberColumn || !!meta?.numericEnum;
  // Other enum columns have a fixed list of choices: pick from the list only.
  const showFilterSubmenu = !isEnumColumn || !!meta?.numericEnum;

  // Start every opening from the applied filter.
  useEffect(() => {
    if (!open) return;
    setSearch("");
    pickedBeforeSearch.current = null;
    setBulkValue("");
    setSubOpen(false);
    setPicked(
      filter?.kind === "enum" ? [...(filter.values || [])] : options.map(String),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const label = labelProp || meta?.label || columnKey;

  // Raw value -> text shown in the list (labels, thousands separators).
  const formatOption = (option) => {
    const text = String(option === null || option === undefined ? "" : option);

    if (meta?.optionLabels?.[text]) return meta.optionLabels[text];
    if (!isNumberColumn || text.trim() === "") return text;

    const number = Number(text);

    if (!Number.isFinite(number)) return text;
    return meta?.currency ? formatMoneyAmount(number) : number.toLocaleString("en-IN");
  };

  const sortedOptions = useMemo(
    () =>
      [...options].map(String).sort((a, b) => {
        if (useNumberFilters) {
          const an = Number(a);
          const bn = Number(b);
          if (a === "") return -1;
          if (b === "") return 1;
          if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn;
        }
        return a.localeCompare(b);
      }),
    [options, useNumberFilters],
  );

  const matchesSearch = (option, text) => {
    const needle = text.trim().toLowerCase();
    if (!needle) return true;
    return (
      option.toLowerCase().includes(needle) ||
      formatOption(option).toLowerCase().includes(needle)
    );
  };

  const visibleOptions = sortedOptions.filter((option) =>
    matchesSearch(option, search),
  );

  // Excel behaviour: typing in Search ticks exactly the matching values, so OK
  // filters to them. Clearing the search puts the earlier ticks back.
  const handleSearchChange = (text) => {
    const searching = text.trim() !== "";

    if (searching) {
      if (pickedBeforeSearch.current === null) {
        pickedBeforeSearch.current = picked;
      }
      setPicked(sortedOptions.filter((option) => matchesSearch(option, text)));
    } else if (pickedBeforeSearch.current !== null) {
      setPicked(pickedBeforeSearch.current);
      pickedBeforeSearch.current = null;
    }

    setSearch(text);
  };

  const allVisibleSelected =
    visibleOptions.length > 0 &&
    visibleOptions.every((option) => picked.includes(option));

  const toggleSelectAll = (checked) => {
    if (checked) {
      const next = [...picked];
      visibleOptions.forEach((option) => {
        if (!next.includes(option)) next.push(option);
      });
      setPicked(next);
      return;
    }
    setPicked(picked.filter((item) => !visibleOptions.includes(item)));
  };

  const filterActive = !!filter && !isEmptyFilter(filter);
  const triggerActive = filterActive || (sortHighlight && !!sortDirection) || isGrouped;

  const apply = (next) => {
    onChange(next);
    setOpen(false);
  };

  const applyPickedValues = () => {
    // Only values that exist in the list count (guards against stale ticks).
    const chosen = sortedOptions.filter((option) => picked.includes(option));
    if (chosen.length === 0) return;
    // Everything ticked = no filter.
    apply(
      chosen.length >= sortedOptions.length
        ? undefined
        : { kind: "enum", values: chosen },
    );
  };

  const numbers = () =>
    (allValues || []).map(numberOf).filter((n) => n !== null);

  const openDialog = (preset) => {
    setOpen(false);
    setDialog(preset);
  };

  // Menu item under "Text Filters" / "Number Filters".
  const pickFilterItem = (key) => {
    if (key === "above" || key === "below") {
      const nums = numbers();
      const average = nums.reduce((a, b) => a + b, 0) / (nums.length || 1);
      apply({
        kind: "number",
        op: key === "above" ? "gt" : "lt",
        value: String(Math.round(average * 100) / 100),
      });
      return;
    }

    if (key === "top") {
      openDialog({ mode: "top", dir: "top", count: "10" });
      return;
    }

    // Start from the applied condition (if any) so it can be edited.
    const kind = useNumberFilters ? "number" : "text";
    const current = filter && filter.kind === kind ? filter : null;
    let op1 = useNumberFilters ? "eq" : "contains";
    let v1 = "";
    let op2 = useNumberFilters ? "eq" : "contains";
    let v2 = "";
    let join = "and";

    if (current) {
      if (current.op === "between") {
        op1 = "gte";
        v1 = current.value;
        op2 = "lte";
        v2 = current.value2;
      } else {
        op1 = current.op;
        v1 = current.value;
        op2 = current.op2 || op2;
        v2 = current.value3 || "";
        join = current.join || "and";
      }
    }

    if (key === "between") {
      op1 = "gte";
      op2 = "lte";
      join = "and";
      if (!current) {
        v1 = "";
        v2 = "";
      }
    } else if (key !== "custom") {
      op1 = key;
      if (!current) {
        op2 = key === "gt" ? "lt" : useNumberFilters ? "eq" : "contains";
      }
    }

    openDialog({ mode: "custom", kind, op1, v1, op2, v2, join });
  };

  const submitDialog = () => {
    if (!dialog) return;

    if (dialog.mode === "top") {
      const count = Math.max(1, parseInt(dialog.count, 10) || 10);
      const top = dialog.dir === "top";
      const sorted = numbers().sort((a, b) => (top ? b - a : a - b));
      if (!sorted.length) {
        setDialog(null);
        return;
      }
      const threshold = sorted[Math.min(count, sorted.length) - 1];
      onChange({
        kind: "number",
        op: top ? "gte" : "lte",
        value: String(threshold),
      });
      setDialog(null);
      return;
    }

    const clean = (text) =>
      dialog.kind === "number"
        ? String(text ?? "").replace(/,/g, "").trim()
        : String(text ?? "");
    const a = clean(dialog.v1);
    const b = clean(dialog.v2);
    let next;

    if (a.trim() === "" && b.trim() === "") {
      next = undefined;
    } else if (a.trim() === "") {
      next = { kind: dialog.kind, op: dialog.op2, value: b };
    } else {
      next = { kind: dialog.kind, op: dialog.op1, value: a };
      if (b.trim() !== "") {
        next.op2 = dialog.op2;
        next.value3 = b;
        next.join = dialog.join;
      }
    }

    onChange(next);
    setDialog(null);
  };

  const showSub = () => {
    const rect = contentRef.current?.getBoundingClientRect();
    setSubLeft(rect ? rect.right + 210 < window.innerWidth : true);
    setSubOpen(true);
  };

  const applyBulkEdit = () => {
    if (!onBulkApply) return;
    if (String(bulkValue).trim() === "") return;

    onBulkApply(bulkValue);
    setBulkValue("");
    setOpen(false);
  };

  const inputClass =
    "h-8 w-full rounded border border-[#cbd5e1] bg-white px-2 text-[12px] text-[#1e293b] outline-none focus:border-[#17365d] focus:ring-1 focus:ring-[#17365d]";

  const darkButtonClass =
    "h-8 w-full rounded bg-[#17365d] px-3 text-[12px] font-semibold text-white hover:bg-[#122b4a] disabled:opacity-50";

  // Appraisal columns always have metadata. Other screens (Delegation) pass
  // their own `label` and use plain text/list filters.
  if (!meta && !labelProp) {
    return null;
  }

  const menu = useNumberFilters ? NUMBER_MENU : TEXT_MENU;
  const opLabels = useNumberFilters ? NUMBER_OP_LABELS : TEXT_OP_LABELS;

  return (
    <>
      <Popover
        open={open}
        onOpenChange={(next) => {
          // Near the right edge, line the menu up with the icon's right side so
          // it stays on screen without having to flip above the grid.
          if (next && alwaysBelow && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setAlignEnd(rect.left + 262 + 8 > window.innerWidth);
          }
          if (next && scrollToHeader) revealTableHeader(triggerRef.current);
          setOpen(next);
        }}
      >
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            aria-label={`Filter ${label}`}
            data-colfilter=""
            className={cn(
              boxed
                ? "flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-[5px] border border-[#9fb4ce] bg-white px-0.5 text-[#102a43] transition-colors hover:bg-[#dcebff]"
                : "flex items-center gap-0.5 rounded p-1 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700",
              triggerActive &&
                (boxed
                  ? "border-[#102a43] bg-[#102a43] text-white hover:bg-[#102a43]"
                  : "bg-[#17365d]/12 text-[#17365d]"),
            )}
          >
            <Filter className={cn("size-3.5", boxed && "size-[13px] fill-current")} />
            {sortDirection && (
              <span className="text-[10px] font-extrabold leading-none">
                {sortDirection === "asc" ? "▲" : "▼"}
                {sortLevel > 1 ? sortLevel : ""}
              </span>
            )}
          </button>
        </PopoverTrigger>

        <PopoverContent
          ref={contentRef}
          align={alwaysBelow && alignEnd ? "end" : "start"}
          {...(alwaysBelow ? { side: "bottom", avoidCollisions: false } : {})}
          hideWhenDetached={false}
          // Dragging / clicking the grid's horizontal or vertical scrollbar
          // counts as a click "outside" and used to close the menu. Keep it
          // open for scrollbar interaction (and for scroll-induced focus
          // changes); real outside clicks still close it.
          onInteractOutside={(event) => {
            const original = event.detail?.originalEvent;
            const target = original?.target;
            if (
              original &&
              typeof original.clientX === "number" &&
              target instanceof HTMLElement
            ) {
              const rect = target.getBoundingClientRect();
              const onVBar =
                target.scrollHeight > target.clientHeight &&
                original.clientX > rect.left + target.clientWidth;
              const onHBar =
                target.scrollWidth > target.clientWidth &&
                original.clientY > rect.top + target.clientHeight;
              if (onVBar || onHBar) event.preventDefault();
            }
          }}
          className="w-[262px] overflow-visible p-0 py-[3px]"
          style={{ fontFamily: INTER }}
        >
          {/* No overflow here: with overflow-y:auto the browser also clips the
              sideways Text/Number Filters submenu (overflow-x can't stay visible),
              so the submenu items could not be seen or clicked. */}
          <div>
            <MenuItem
              icon={
                useNumberFilters ? (
                  <>1↓<br />9</>
                ) : (
                  <>A↓<br />Z</>
                )
              }
              active={sortDirection === "asc"}
              onClick={() => {
                onSortAsc?.();
                setOpen(false);
              }}
              onMouseEnter={() => setSubOpen(false)}
            >
              {useNumberFilters ? "Sort Smallest to Largest" : "Sort A to Z"}
            </MenuItem>
            <MenuItem
              icon={
                useNumberFilters ? (
                  <>9↓<br />1</>
                ) : (
                  <>Z↓<br />A</>
                )
              }
              active={sortDirection === "desc"}
              onClick={() => {
                onSortDesc?.();
                setOpen(false);
              }}
              onMouseEnter={() => setSubOpen(false)}
            >
              {useNumberFilters ? "Sort Largest to Smallest" : "Sort Z to A"}
            </MenuItem>

            <Divider />

            {allowGroup && (
              <>
                <MenuItem
                  icon="▤"
                  onClick={() => {
                    onToggleGroup?.();
                    setOpen(false);
                  }}
                  onMouseEnter={() => setSubOpen(false)}
                >
                  {isGrouped ? "Remove Grouping" : `Group by "${label}"`}
                </MenuItem>

                <Divider />
              </>
            )}

            <MenuItem
              disabled={!filterActive}
              onClick={() => apply(undefined)}
              onMouseEnter={() => setSubOpen(false)}
            >
              Clear Filter From "{label}"
            </MenuItem>

            {showFilterSubmenu && (
              <>
                <Divider />

                <div
                  className="relative"
                  onMouseEnter={showSub}
                  onClick={showSub}
                >
                  <MenuItem active={subOpen}>
                    {useNumberFilters ? "Number Filters" : "Text Filters"}
                    <span className="absolute right-2.5">▸</span>
                  </MenuItem>

                  {subOpen && (
                    <div
                      role="menu"
                      className={cn(
                        "absolute top-[-1px] z-10 w-[200px] border border-[#9ca3af] bg-white py-[3px] shadow-[2px_3px_8px_rgba(0,0,0,.28)]",
                        subLeft ? "left-full" : "right-full",
                      )}
                    >
                      {menu.map((item, index) =>
                        item === "-" ? (
                          <Divider key={`d${index}`} />
                        ) : (
                          <MenuItem
                            key={item[0]}
                            onClick={(event) => {
                              event.stopPropagation();
                              pickFilterItem(item[0]);
                            }}
                            className="pl-3.5"
                          >
                            {item[1]}
                          </MenuItem>
                        ),
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            <Divider />

            <div
              className="mx-2 my-[5px] border border-[#9ca3af] px-1.5 py-[3px]"
              onMouseEnter={() => setSubOpen(false)}
            >
              <input
                type="text"
                placeholder="Search"
                value={search}
                onChange={(event) => handleSearchChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") applyPickedValues();
                }}
                className="w-full border-0 text-[12px] outline-none"
              />
            </div>

            <div
              className="mx-2 h-[150px] overflow-auto border border-[#9ca3af] py-[3px]"
              style={
                alwaysBelow
                  ? {
                      // Menu is pinned below the header: shrink the list (60-150px)
                      // when there is not much room under it.
                      height:
                        "clamp(60px, calc(var(--radix-popover-content-available-height, 460px) - 310px), 150px)",
                    }
                  : undefined
              }
              onMouseEnter={() => setSubOpen(false)}
            >
              <label className="flex cursor-pointer items-center gap-1.5 px-2 py-0.5 text-[12px] hover:bg-[#eef2f8]">
                <input
                  type="checkbox"
                  className="m-0 size-3.5 accent-[#17365d]"
                  checked={allVisibleSelected}
                  onChange={(event) => toggleSelectAll(event.target.checked)}
                />
                <span>(Select All)</span>
              </label>

              {visibleOptions.length === 0 ? (
                <p className="px-2 py-2 text-[11px] text-slate-400">
                  No values match this search.
                </p>
              ) : (
                visibleOptions.map((option) => (
                  <label
                    key={option}
                    className="flex cursor-pointer items-center gap-1.5 px-2 py-0.5 text-[12px] hover:bg-[#eef2f8]"
                  >
                    <input
                      type="checkbox"
                      className="m-0 size-3.5 accent-[#17365d]"
                      checked={picked.includes(option)}
                      onChange={(event) =>
                        setPicked(
                          event.target.checked
                            ? [...picked, option]
                            : picked.filter((item) => item !== option),
                        )
                      }
                    />
                    <span className="truncate">
                      {option === "" ? "(Blanks)" : formatOption(option)}
                    </span>
                  </label>
                ))
              )}
            </div>

            <div className="flex justify-end gap-2 px-2 pb-1.5 pt-[9px]">
              <button
                type="button"
                onClick={applyPickedValues}
                disabled={picked.length === 0}
                className="border border-[#17365d] bg-[#17365d] px-[18px] py-[3px] text-[12px] text-white disabled:opacity-50"
              >
                OK
              </button>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="border border-[#9ca3af] bg-[#f3f4f6] px-[18px] py-[3px] text-[12px]"
              >
                Cancel
              </button>
            </div>

            {/* BULK EDIT — editable columns only */}

            {bulkEditable && (
              <div className="border-t border-[#e2e8f0] bg-[#f8fafc] px-3 py-3">
                <p className="text-[10px] font-semibold tracking-wide text-slate-400">
                  BULK EDIT THIS COLUMN
                </p>

                <p className="mt-1 text-[11px] leading-snug text-slate-500">
                  Applies to <b className="text-slate-700">{bulkRowCount}</b>{" "}
                  rows matching the current grid filters
                </p>

                <div className="mt-2 flex gap-2">
                  {isEnumColumn && meta.options ? (
                    // Enum columns: only the allowed options, no free text.
                    <select
                      className={cn(inputClass, "cursor-pointer")}
                      value={bulkValue}
                      onChange={(event) => setBulkValue(event.target.value)}
                    >
                      <option value="">Select value...</option>
                      {meta.options.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      className={inputClass}
                      type={isNumberColumn ? "number" : "text"}
                      placeholder="New value"
                      value={bulkValue}
                      onChange={(event) => setBulkValue(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") applyBulkEdit();
                      }}
                    />
                  )}

                  <button
                    type="button"
                    onClick={applyBulkEdit}
                    disabled={String(bulkValue).trim() === ""}
                    className={cn(darkButtonClass, "w-[72px] shrink-0")}
                  >
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={!!dialog} onOpenChange={(next) => !next && setDialog(null)}>
        <DialogContent
          className="w-[380px] max-w-[92vw] gap-0 p-4 text-[12.5px]"
          style={{ fontFamily: INTER }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submitDialog();
            }
          }}
        >
          {dialog?.mode === "top" && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[14px] text-[#102a43]">
                  Top 10 AutoFilter
                </DialogTitle>
              </DialogHeader>
              <p className="mt-1 text-[#6b7280]">
                Show in <b>{label}</b>:
              </p>
              <div className="my-2 flex items-center gap-2">
                <select
                  className="h-8 w-[90px] rounded border border-[#d1d5db] px-2"
                  value={dialog.dir}
                  onChange={(event) =>
                    setDialog({ ...dialog, dir: event.target.value })
                  }
                >
                  <option value="top">Top</option>
                  <option value="bottom">Bottom</option>
                </select>
                <input
                  type="text"
                  inputMode="numeric"
                  className="h-8 w-[70px] rounded border border-[#d1d5db] px-2"
                  value={dialog.count}
                  onChange={(event) =>
                    setDialog({ ...dialog, count: event.target.value })
                  }
                  autoFocus
                />
                <span>items</span>
              </div>
            </>
          )}

          {dialog?.mode === "custom" && (
            <>
              <DialogHeader>
                <DialogTitle className="text-[14px] text-[#102a43]">
                  Custom AutoFilter
                </DialogTitle>
              </DialogHeader>
              <p className="mt-1 text-[#6b7280]">
                Show rows where <b>{label}</b>:
              </p>

              <div className="my-2 flex gap-2">
                <select
                  className="h-8 w-[160px] rounded border border-[#d1d5db] px-2"
                  value={dialog.op1}
                  onChange={(event) =>
                    setDialog({ ...dialog, op1: event.target.value })
                  }
                >
                  {Object.entries(opLabels).map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  className="h-8 min-w-0 flex-1 rounded border border-[#d1d5db] px-2"
                  value={dialog.v1}
                  onChange={(event) =>
                    setDialog({ ...dialog, v1: event.target.value })
                  }
                  autoFocus
                />
              </div>

              <div className="flex gap-4 py-0.5">
                {["and", "or"].map((join) => (
                  <label key={join} className="flex items-center gap-1.5">
                    <input
                      type="radio"
                      name="column-filter-join"
                      checked={dialog.join === join}
                      onChange={() => setDialog({ ...dialog, join })}
                    />
                    {join === "and" ? "And" : "Or"}
                  </label>
                ))}
              </div>

              <div className="my-2 flex gap-2">
                <select
                  className="h-8 w-[160px] rounded border border-[#d1d5db] px-2"
                  value={dialog.op2}
                  onChange={(event) =>
                    setDialog({ ...dialog, op2: event.target.value })
                  }
                >
                  {Object.entries(opLabels).map(([value, text]) => (
                    <option key={value} value={value}>
                      {text}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  className="h-8 min-w-0 flex-1 rounded border border-[#d1d5db] px-2"
                  value={dialog.v2}
                  onChange={(event) =>
                    setDialog({ ...dialog, v2: event.target.value })
                  }
                />
              </div>
            </>
          )}

          <div className="mt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={submitDialog}
              className="border border-[#17365d] bg-[#17365d] px-[18px] py-1 text-white"
            >
              OK
            </button>
            <button
              type="button"
              onClick={() => setDialog(null)}
              className="border border-[#9ca3af] bg-[#f3f4f6] px-[18px] py-1"
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}