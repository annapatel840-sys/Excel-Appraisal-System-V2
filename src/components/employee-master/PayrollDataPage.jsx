import { useMemo, useRef, useState } from "react";

const BATCH_PRIOR = "BATCH-2025Q4-0021";
const BATCH_ID = "BATCH-2026Q3-0043";
const CYCLE_ORDER = {
  "FY25-Q4": 1,
  "Mid-Year Review FY25-26": 1.5,
  "FY26-Q3": 2,
};

const STORED = [
  {
    empId: "E10231",
    cycle: "FY25-Q4",
    empName: "A. Kumar",
    designation: "Sr. Consultant",
    compManager: "R. Iyer",
    superManager: "V. Rao",
    managerMail: "r.iyer@r2c.com",
    appraiser: "V. Rao",
    basePay: 5850000,
    targetPB: 585000,
    allocPB: 460000,
    newPB: 0,
    newRB: 180000,
    hikeAmt: 350000,
    promo: "No",
    newTitle: "",
    batch: BATCH_PRIOR,
  },
  {
    empId: "E10231",
    cycle: "FY26-Q3",
    empName: "A. Kumar",
    designation: "Sr. Consultant",
    compManager: "R. Iyer",
    superManager: "V. Rao",
    managerMail: "r.iyer@r2c.com",
    appraiser: "V. Rao",
    basePay: 6200000,
    targetPB: 620000,
    allocPB: 600000,
    newPB: 0,
    newRB: 180000,
    hikeAmt: 372000,
    promo: "No",
    newTitle: "",
    batch: BATCH_ID,
  },
  {
    empId: "E10232",
    cycle: "FY25-Q4",
    empName: "S. Nair",
    designation: "Sr. Consultant",
    compManager: "R. Iyer",
    superManager: "V. Rao",
    managerMail: "r.iyer@r2c.com",
    appraiser: "V. Rao",
    basePay: 7010000,
    targetPB: 701000,
    allocPB: 560000,
    newPB: 0,
    newRB: 200000,
    hikeAmt: 440000,
    promo: "No",
    newTitle: "",
    batch: BATCH_PRIOR,
  },
  {
    empId: "E10232",
    cycle: "FY26-Q3",
    empName: "S. Nair",
    designation: "Sr. Consultant",
    compManager: "R. Iyer",
    superManager: "V. Rao",
    managerMail: "r.iyer@r2c.com",
    appraiser: "V. Rao",
    basePay: 7450000,
    targetPB: 745000,
    allocPB: 720000,
    newPB: 60000,
    newRB: 210000,
    hikeAmt: 447000,
    promo: "No",
    newTitle: "",
    batch: BATCH_ID,
  },
  {
    empId: "E10233",
    cycle: "FY25-Q4",
    empName: "P. Das",
    designation: "Consultant",
    compManager: "A. Verma",
    superManager: "V. Rao",
    managerMail: "a.verma@r2c.com",
    appraiser: "V. Rao",
    basePay: 4870000,
    targetPB: 487000,
    allocPB: 390000,
    newPB: 0,
    newRB: 140000,
    hikeAmt: 250000,
    promo: "No",
    newTitle: "",
    batch: BATCH_PRIOR,
  },
  {
    empId: "E10233",
    cycle: "FY26-Q3",
    empName: "P. Das",
    designation: "Consultant",
    compManager: "A. Verma",
    superManager: "V. Rao",
    managerMail: "a.verma@r2c.com",
    appraiser: "V. Rao",
    basePay: 5120000,
    targetPB: 512000,
    allocPB: 490000,
    newPB: 0,
    newRB: 140000,
    hikeAmt: 307200,
    promo: "No",
    newTitle: "",
    batch: BATCH_ID,
  },
  {
    empId: "E10234",
    cycle: "FY25-Q4",
    empName: "M. Iyer",
    designation: "Consultant",
    compManager: "A. Verma",
    superManager: "V. Rao",
    managerMail: "a.verma@r2c.com",
    appraiser: "V. Rao",
    basePay: 8230000,
    targetPB: 823000,
    allocPB: 660000,
    newPB: 0,
    newRB: 240000,
    hikeAmt: 670000,
    promo: "No",
    newTitle: "",
    batch: BATCH_PRIOR,
  },
  {
    empId: "E10234",
    cycle: "FY26-Q3",
    empName: "M. Iyer",
    designation: "Consultant",
    compManager: "A. Verma",
    superManager: "V. Rao",
    managerMail: "a.verma@r2c.com",
    appraiser: "V. Rao",
    basePay: 8900000,
    targetPB: 890000,
    allocPB: 860000,
    newPB: 120000,
    newRB: 260000,
    hikeAmt: 801000,
    promo: "Yes",
    newTitle: "Principal Consultant",
    batch: BATCH_ID,
  },
  {
    empId: "E10235",
    cycle: "FY26-Q3",
    empName: "K. Reddy",
    designation: "Sr. Analyst",
    compManager: "R. Iyer",
    superManager: "V. Rao",
    managerMail: "r.iyer@r2c.com",
    appraiser: "V. Rao",
    basePay: 4680000,
    targetPB: 468000,
    allocPB: 440000,
    newPB: 0,
    newRB: 125000,
    hikeAmt: 280800,
    promo: "No",
    newTitle: "",
    batch: BATCH_ID,
  },
];

const AUDIT_TRAIL = [
  {
    time: "22 Sep 2026, 14:12",
    user: "HR — N. Subramanian",
    empId: "E10234",
    empName: "M. Iyer",
    cycle: "FY26-Q3",
    field: "Hike Amount",
    oldVal: "₹7,50,000",
    newVal: "₹8,01,000",
  },
  {
    time: "20 Sep 2026, 10:47",
    user: "HR — N. Subramanian",
    empId: "E10232",
    empName: "S. Nair",
    cycle: "FY26-Q3",
    field: "New PB to be Offered",
    oldVal: "₹0",
    newVal: "₹60,000",
  },
  {
    time: "18 Sep 2026, 16:30",
    user: "Comp Admin — R. Iyer",
    empId: "E10231",
    empName: "A. Kumar",
    cycle: "FY26-Q3",
    field: "New RB",
    oldVal: "₹1,60,000",
    newVal: "₹1,80,000",
  },
  {
    time: "12 Sep 2026, 09:05",
    user: "HR — N. Subramanian",
    empId: "E10233",
    empName: "P. Das",
    cycle: "FY25-Q4",
    field: "Target PB Allocated",
    oldVal: "₹4,60,000",
    newVal: "₹4,87,000",
  },
];

const COLS = [
  { key: "empId", label: "Employee ID", type: "text", frozen: true },
  { key: "cycle", label: "Cycle", type: "text" },
  { key: "batch", label: "Source Batch", type: "text" },
  { key: "empName", label: "Employee", type: "text", cat: "master" },
  { key: "designation", label: "Designation", type: "text", cat: "master" },
  { key: "compManager", label: "Comp. Manager", type: "text", cat: "master" },
  { key: "superManager", label: "Super Manager", type: "text", cat: "master" },
  { key: "managerMail", label: "Manager Mail", type: "text", cat: "master" },
  {
    key: "basePay",
    label: "Current Annual Base Pay",
    type: "number",
    cat: "master",
    money: true,
  },
  {
    key: "basePay_yoy",
    label: "YoY %",
    type: "number",
    cat: "calc",
    isYoy: true,
    baseKey: "basePay",
  },
  {
    key: "targetPB",
    label: "Target PB Allocated",
    type: "number",
    cat: "master",
    money: true,
  },
  {
    key: "allocPB",
    label: "Allocated PB Amount",
    type: "number",
    cat: "input",
    money: true,
  },
  {
    key: "newPB",
    label: "New PB to be Offered",
    type: "number",
    cat: "input",
    money: true,
  },
  { key: "newRB", label: "New RB", type: "number", cat: "input", money: true },
  {
    key: "hikeAmt",
    label: "Hike Amount",
    type: "number",
    cat: "input",
    money: true,
  },
  { key: "promo", label: "Promo?", type: "text", cat: "input" },
  { key: "newTitle", label: "New Title", type: "text", cat: "input" },
  {
    key: "totalPB",
    label: "Total of PB",
    type: "number",
    cat: "calc",
    money: true,
    computed: true,
  },
  {
    key: "totalBonus",
    label: "Total Bonus",
    type: "number",
    cat: "calc",
    money: true,
    computed: true,
  },
  {
    key: "totalBonus_yoy",
    label: "YoY %",
    type: "number",
    cat: "calc",
    isYoy: true,
    baseKey: "totalBonus",
  },
  {
    key: "hikePct",
    label: "Hike %",
    type: "number",
    cat: "calc",
    pct: true,
    computed: true,
  },
  {
    key: "newBasePay",
    label: "New Base Salary",
    type: "number",
    cat: "calc",
    money: true,
    computed: true,
  },
  {
    key: "totalCtc",
    label: "Total CTC with Rewards",
    type: "number",
    cat: "calc",
    money: true,
    computed: true,
  },
  {
    key: "totalCtc_yoy",
    label: "YoY %",
    type: "number",
    cat: "calc",
    isYoy: true,
    baseKey: "totalCtc",
  },
];

const NUMBER_OPS = [
  { v: "gt", l: "Greater than" },
  { v: "gte", l: "Greater than or equal to" },
  { v: "lt", l: "Less than" },
  { v: "lte", l: "Less than or equal to" },
  { v: "eq", l: "Equals" },
  { v: "neq", l: "Not equal to" },
  { v: "between", l: "Between" },
];
const TEXT_OPS = [
  { v: "contains", l: "Contains" },
  { v: "notcontains", l: "Does not contain" },
  { v: "eq", l: "Equals" },
  { v: "startswith", l: "Begins with" },
  { v: "endswith", l: "Ends with" },
  { v: "blank", l: "Is blank" },
  { v: "notblank", l: "Is not blank" },
];
const opsForType = (type) => (type === "number" ? NUMBER_OPS : TEXT_OPS);

function compute(r) {
  const totalPB = r.allocPB + r.newPB;
  const totalBonus = totalPB + r.newRB;
  const hikePct = r.basePay > 0 ? (r.hikeAmt / r.basePay) * 100 : 0;
  const newBasePay = r.basePay + r.hikeAmt;
  const totalCtc = newBasePay + totalBonus;
  return { totalPB, totalBonus, hikePct, newBasePay, totalCtc };
}
function priorRecordFor(rec, stored) {
  const mine = stored
    .filter((r) => r.empId === rec.empId)
    .sort((a, b) => (CYCLE_ORDER[a.cycle] || 0) - (CYCLE_ORDER[b.cycle] || 0));
  const idx = mine.findIndex((r) => r === rec);
  return idx > 0 ? mine[idx - 1] : null;
}
function fmtMoney(v) {
  return v == null ? "—" : "₹" + Math.round(v).toLocaleString("en-IN");
}
function yoyPctFor(r, baseKey, stored) {
  const prior = priorRecordFor(r, stored);
  if (!prior) return null;
  const curVal = baseKey === "basePay" ? r.basePay : compute(r)[baseKey];
  const priorVal =
    baseKey === "basePay" ? prior.basePay : compute(prior)[baseKey];
  if (priorVal === 0) return null;
  return ((curVal - priorVal) / Math.abs(priorVal)) * 100;
}
function rawValueFor(r, col, stored) {
  if (col.isYoy) return yoyPctFor(r, col.baseKey, stored);
  if (col.computed) return compute(r)[col.key];
  return r[col.key];
}
function displayValueFor(r, col, stored) {
  const val = rawValueFor(r, col, stored);
  if (col.isYoy)
    return val == null ? "new" : (val >= 0 ? "+" : "") + val.toFixed(2) + "%";
  if (col.money) return fmtMoney(val);
  if (col.pct) return val.toFixed(2) + "%";
  return val == null || val === "" ? "" : String(val);
}

function matchesCondition(raw, filter, type) {
  if (type === "number") {
    const n = Number(raw) || 0,
      v1 = Number(filter.value),
      v2 = Number(filter.value2);
    switch (filter.op) {
      case "gt":
        return n > v1;
      case "gte":
        return n >= v1;
      case "lt":
        return n < v1;
      case "lte":
        return n <= v1;
      case "eq":
        return n === v1;
      case "neq":
        return n !== v1;
      case "between":
        return n >= Math.min(v1, v2) && n <= Math.max(v1, v2);
      default:
        return true;
    }
  }
  const s = String(raw == null ? "" : raw).toLowerCase();
  const v = String(filter.value == null ? "" : filter.value).toLowerCase();
  switch (filter.op) {
    case "contains":
      return s.indexOf(v) !== -1;
    case "notcontains":
      return s.indexOf(v) === -1;
    case "eq":
      return s === v;
    case "startswith":
      return s.indexOf(v) === 0;
    case "endswith":
      return v.length === 0 || s.slice(-v.length) === v;
    case "blank":
      return s === "";
    case "notblank":
      return s !== "";
    default:
      return true;
  }
}

/* ============================================================
   COLUMN FILTER POPOVER
   ============================================================ */

function ColumnFilterPopover({
  colDef,
  stored,
  active,
  position,
  onSort,
  onApplyCondition,
  onApplySelect,
  onClear,
  onClose,
}) {
  const values = useMemo(
    () =>
      Array.from(
        new Set(stored.map((r) => displayValueFor(r, colDef, stored))),
      ).sort(),
    [stored, colDef],
  );
  const activeIsCondition = active && !(active instanceof Set);
  const ops = opsForType(colDef.type);
  const [op, setOp] = useState(activeIsCondition ? active.op : ops[0].v);
  const [val1, setVal1] = useState(
    activeIsCondition && active.value != null ? active.value : "",
  );
  const [val2, setVal2] = useState(
    activeIsCondition && active.value2 != null ? active.value2 : "",
  );
  const [search, setSearch] = useState("");
  const [checkedSet, setCheckedSet] = useState(() => {
    if (active instanceof Set) return new Set(active);
    return new Set(values);
  });

  const needsVal1 = op !== "blank" && op !== "notblank";
  const needsVal2 = op === "between";

  const visibleValues = values.filter((v) =>
    v.toLowerCase().includes(search.toLowerCase()),
  );
  const allChecked = values.every((v) => checkedSet.has(v));

  const toggleValue = (v) => {
    setCheckedSet((prev) => {
      const next = new Set(prev);
      if (next.has(v)) next.delete(v);
      else next.add(v);
      return next;
    });
  };
  const toggleAll = (checked) => {
    setCheckedSet(checked ? new Set(values) : new Set());
  };

  return (
    <div
      className="pd-colfilter-panel show"
      style={{ left: position.left, top: position.top }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="pd-colfilter-sort-row">
        <button type="button" onClick={() => onSort("asc")}>
          ↑ Sort
        </button>
        <button type="button" onClick={() => onSort("desc")}>
          ↓ Sort
        </button>
      </div>

      <div className="pd-colfilter-cond">
        <select value={op} onChange={(e) => setOp(e.target.value)}>
          {ops.map((o) => (
            <option key={o.v} value={o.v}>
              {o.l}
            </option>
          ))}
        </select>
        <div className="pd-colfilter-cond-inputs">
          {needsVal1 && (
            <input
              type="text"
              placeholder="Value"
              value={val1}
              onChange={(e) => setVal1(e.target.value)}
            />
          )}
          {needsVal2 && <span className="and">and</span>}
          {needsVal2 && (
            <input
              type="text"
              placeholder="Value"
              value={val2}
              onChange={(e) => setVal2(e.target.value)}
            />
          )}
        </div>
        <button
          type="button"
          onClick={() => onApplyCondition({ op, value: val1, value2: val2 })}
        >
          Apply filter
        </button>
      </div>

      <div className="pd-colfilter-divider">or pick values</div>
      <div className="pd-colfilter-search">
        <input
          type="text"
          placeholder="Search values..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="pd-colfilter-selall">
        <label>
          <input
            type="checkbox"
            checked={allChecked}
            onChange={(e) => toggleAll(e.target.checked)}
          />
          <span>(Select all)</span>
        </label>
      </div>
      <div className="pd-colfilter-options">
        {visibleValues.map((v) => (
          <label key={v}>
            <input
              type="checkbox"
              checked={checkedSet.has(v)}
              onChange={() => toggleValue(v)}
            />
            <span>{v === "" ? "(blank)" : v}</span>
          </label>
        ))}
      </div>
      <div className="pd-colfilter-apply-row">
        <button type="button" className="clear" onClick={onClear}>
          Clear
        </button>
        <button
          type="button"
          className="apply"
          onClick={() => {
            if (checkedSet.size === values.length) onApplySelect(null);
            else onApplySelect(checkedSet);
          }}
        >
          Apply
        </button>
      </div>
    </div>
  );
}

/* ============================================================
   MAIN COMPONENT
   ============================================================ */

export function PayrollDataPage() {
  const [stored] = useState(STORED);
  const [search, setSearch] = useState("");
  const [batchFilter, setBatchFilter] = useState("all");
  const [columnFilters, setColumnFilters] = useState({});
  const [sortState, setSortState] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [openFilterCol, setOpenFilterCol] = useState(null);
  const [filterPos, setFilterPos] = useState({ left: 0, top: 0 });
  const btnRefs = useRef({});

  const batches = useMemo(
    () => Array.from(new Set(stored.map((r) => r.batch))),
    [stored],
  );

  const colByKey = (key) => COLS.find((c) => c.key === key);

  const rows = useMemo(() => {
    let list = stored.filter((r) => {
      const term = search.toLowerCase();
      const matchesTerm =
        !term ||
        r.empName.toLowerCase().includes(term) ||
        r.empId.toLowerCase().includes(term);
      const matchesBatch = batchFilter === "all" || r.batch === batchFilter;
      return matchesTerm && matchesBatch;
    });

    const filterKeys = Object.keys(columnFilters);
    if (filterKeys.length) {
      list = list.filter((r) =>
        filterKeys.every((key) => {
          const filter = columnFilters[key];
          const colDef = colByKey(key);
          const raw = rawValueFor(r, colDef, stored);
          if (filter instanceof Set)
            return filter.has(displayValueFor(r, colDef, stored));
          return matchesCondition(raw, filter, colDef.type);
        }),
      );
    }

    if (sortState) {
      const colDef = colByKey(sortState.col);
      list = [...list].sort((a, b) => {
        let av = rawValueFor(a, colDef, stored);
        let bv = rawValueFor(b, colDef, stored);
        if (av == null) av = colDef.type === "number" ? -Infinity : "";
        if (bv == null) bv = colDef.type === "number" ? -Infinity : "";
        if (av < bv) return sortState.dir === "asc" ? -1 : 1;
        if (av > bv) return sortState.dir === "asc" ? 1 : -1;
        return 0;
      });
    } else {
      list = [...list].sort((a, b) => {
        if (a.empId !== b.empId) return a.empId < b.empId ? -1 : 1;
        return (CYCLE_ORDER[b.cycle] || 0) - (CYCLE_ORDER[a.cycle] || 0);
      });
    }

    return list;
  }, [stored, search, batchFilter, columnFilters, sortState]);

  const openColFilter = (colKey) => {
    const btn = btnRefs.current[colKey];
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    setFilterPos({
      left: Math.min(r.left, window.innerWidth - 240),
      top: r.bottom + 4,
    });
    setOpenFilterCol(openFilterCol === colKey ? null : colKey);
  };

  const handleExport = () => {
    const headers = COLS.map((c) => c.label);
    const lines = [headers.join(",")];
    rows.forEach((r) => {
      const c = compute(r);
      const merged = { ...r, ...c };
      const vals = COLS.map((col) => {
        const val = merged[col.key];
        if (col.money) return Math.round(val);
        if (col.pct) return val.toFixed(2) + "%";
        return val == null ? "" : val;
      });
      lines.push(
        vals.map((v) => (String(v).includes(",") ? `"${v}"` : v)).join(","),
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "payroll_data_export.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setMenuOpen(false);
  };

  return (
    <div
      className="pd-root"
      onClick={() => {
        setOpenFilterCol(null);
        setMenuOpen(false);
      }}
    >
      <style>{PAYROLL_DATA_CSS}</style>

      <div className="pd-topbar">
        <div>
          <h1>Payroll Data</h1>
          <p className="pd-sub">
            Stored Master + Input data, plus derived Calculated fields and YoY.
          </p>
        </div>
        <div className="pd-stat">
          <div className="pd-label">Records</div>
          <div className="pd-value">
            {rows.length} / {stored.length}
          </div>
        </div>
      </div>

      <div className="pd-toolbar" onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          placeholder="Search name / employee ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          value={batchFilter}
          onChange={(e) => setBatchFilter(e.target.value)}
        >
          <option value="all">All batches</option>
          {batches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <div className="pd-spacer" />
        <div className="pd-menu-wrap">
          <button
            type="button"
            className={`pd-btn pd-menu-btn ${menuOpen ? "open" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            Menu <span className="pd-caret">▾</span>
          </button>
          {menuOpen && (
            <div
              className="pd-menu-dropdown show"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="pd-menu-item"
                type="button"
                onClick={handleExport}
              >
                <span className="pd-menu-icon">↧</span>Export to CSV
              </button>
              <button
                className="pd-menu-item"
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  setAuditOpen(true);
                }}
              >
                <span className="pd-menu-icon">⏱</span>Audit Trail
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="pd-grid-wrap">
        <table>
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} className={c.frozen ? "frozen" : ""}>
                  <div className="pd-th-inner">
                    <span>
                      {c.label}
                      {c.cat && (
                        <span style={{ fontSize: 9, opacity: 0.6 }}>
                          {" "}
                          ({c.cat.toUpperCase().charAt(0)})
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      ref={(el) => {
                        btnRefs.current[c.key] = el;
                      }}
                      className={`pd-colfilter-btn ${columnFilters[c.key] ? "filtered" : ""}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openColFilter(c.key);
                      }}
                    >
                      ▾
                    </button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={`${r.empId}-${r.cycle}-${i}`}>
                {COLS.map((col) => {
                  const val = rawValueFor(r, col, stored);
                  if (col.isYoy) {
                    const cls = val == null ? "new" : val >= 0 ? "pos" : "neg";
                    const label =
                      val == null
                        ? "new"
                        : (val >= 0 ? "+" : "") + val.toFixed(2) + "%";
                    return (
                      <td
                        key={col.key}
                        className={`pd-calc-cell pd-yoy-col ${cls}`}
                      >
                        {label}
                      </td>
                    );
                  }
                  let display;
                  if (col.money) display = fmtMoney(val);
                  else if (col.pct) display = val.toFixed(2) + "%";
                  else display = val == null || val === "" ? "—" : val;

                  const cls =
                    (col.frozen
                      ? "frozen pd-name-cell"
                      : col.money || col.pct
                        ? "pd-master-cell"
                        : "") + (col.cat === "calc" ? " pd-calc-cell" : "");

                  if (col.key === "promo") {
                    return (
                      <td key={col.key} className={cls}>
                        <span
                          className={`pd-status-badge ${val === "Yes" ? "yes" : "no"}`}
                        >
                          {display}
                        </span>
                      </td>
                    );
                  }
                  return (
                    <td key={col.key} className={cls}>
                      {display}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pd-footer-note">
        Read-only by design: the Upload screen is the only way data enters here.
        Every column header has a filter — sort, filter by condition, or pick
        specific values, same as Excel.
      </div>

      {openFilterCol && (
        <ColumnFilterPopover
          colDef={colByKey(openFilterCol)}
          stored={stored}
          active={columnFilters[openFilterCol]}
          position={filterPos}
          onSort={(dir) => {
            setSortState({ col: openFilterCol, dir });
            setOpenFilterCol(null);
          }}
          onApplyCondition={(cond) => {
            setColumnFilters((prev) => ({ ...prev, [openFilterCol]: cond }));
            setOpenFilterCol(null);
          }}
          onApplySelect={(setOrNull) => {
            setColumnFilters((prev) => {
              const next = { ...prev };
              if (setOrNull === null) delete next[openFilterCol];
              else next[openFilterCol] = setOrNull;
              return next;
            });
            setOpenFilterCol(null);
          }}
          onClear={() => {
            setColumnFilters((prev) => {
              const next = { ...prev };
              delete next[openFilterCol];
              return next;
            });
            setOpenFilterCol(null);
          }}
          onClose={() => setOpenFilterCol(null)}
        />
      )}

      {auditOpen && (
        <div
          className="pd-modal-overlay show"
          onClick={() => setAuditOpen(false)}
        >
          <div className="pd-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pd-modal-head">
              <h2>Audit Trail — Payroll Data</h2>
              <span className="pd-x" onClick={() => setAuditOpen(false)}>
                ✕
              </span>
            </div>
            <div className="pd-modal-body">
              <div className="pd-audit-note">
                Every field-level correction made to a stored record,
                independent of how the record originally arrived. Distinct from
                Upload History on the Upload screen, which tracks batches
                entering the system, not changes to what's already here.
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>User</th>
                    <th>Employee</th>
                    <th>Cycle</th>
                    <th>Field</th>
                    <th>Old value</th>
                    <th>New value</th>
                  </tr>
                </thead>
                <tbody>
                  {AUDIT_TRAIL.map((a, i) => (
                    <tr key={i}>
                      <td>{a.time}</td>
                      <td>{a.user}</td>
                      <td>
                        {a.empName}{" "}
                        <span style={{ color: "#8592a6" }}>({a.empId})</span>
                      </td>
                      <td>{a.cycle}</td>
                      <td>{a.field}</td>
                      <td className="pd-old-val">{a.oldVal}</td>
                      <td className="pd-new-val">{a.newVal}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pd-modal-foot">
              <button
                className="pd-btn"
                type="button"
                onClick={() => setAuditOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const PAYROLL_DATA_CSS = `
.pd-root { font-family: Arial, Helvetica, sans-serif; background: #f4f6f9; color: #1f2937; font-size: 13px; display: flex; flex-direction: column; min-height: 100%; }
.pd-topbar { height: 58px; flex: 0 0 auto; background: #17365d; color: white; display: flex; align-items: center; justify-content: space-between; padding: 0 20px; }
.pd-topbar h1 { font-size: 16px; margin: 0; }
.pd-sub { font-size: 11.5px; color: #b9c6d9; margin: 2px 0 0; }
.pd-stat { text-align: right; }
.pd-label { font-size: 10.5px; color: #a9b8cd; }
.pd-value { font-size: 15px; font-weight: 700; }
.pd-toolbar { flex: 0 0 auto; background: white; padding: 12px 18px; border-bottom: 1px solid #d9dee7; display: flex; gap: 10px; align-items: center; }
.pd-toolbar input[type="text"] { padding: 8px 12px; border: 1px solid #cbd3df; border-radius: 6px; font-size: 13px; width: 260px; }
.pd-toolbar select { padding: 8px 10px; border: 1px solid #cbd3df; border-radius: 6px; font-size: 13px; background: white; }
.pd-spacer { flex: 1; }
.pd-btn { padding: 8px 14px; border-radius: 6px; font-size: 12.5px; cursor: pointer; border: 1px solid #cbd3df; background: white; color: #17365d; font-weight: 600; }
.pd-btn:hover { background: #eef2f8; }
.pd-menu-wrap { position: relative; }
.pd-menu-btn { display: flex; align-items: center; gap: 6px; }
.pd-caret { font-size: 10px; transition: transform .15s; }
.pd-menu-btn.open .pd-caret { transform: rotate(180deg); }
.pd-menu-dropdown { position: absolute; top: calc(100% + 6px); right: 0; z-index: 40; background: white; border: 1px solid #c7d0dc; border-radius: 8px; box-shadow: 0 10px 28px rgba(20,30,50,.18); width: 200px; padding: 8px; }
.pd-menu-item { display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px; border: none; background: none; border-radius: 6px; font-size: 12.5px; color: #1f2937; cursor: pointer; text-align: left; font-weight: 500; }
.pd-menu-item:hover { background: #eef2f8; }
.pd-menu-icon { width: 16px; text-align: center; flex-shrink: 0; }
.pd-th-inner { display: flex; align-items: center; gap: 5px; justify-content: space-between; }
.pd-colfilter-btn { border: none; background: none; cursor: pointer; color: #8592a6; font-size: 10px; padding: 2px 3px; border-radius: 3px; flex-shrink: 0; }
.pd-colfilter-btn:hover { background: #d7e0ed; color: #17365d; }
.pd-colfilter-btn.filtered { color: #17365d; }
.pd-colfilter-btn.filtered::after { content: ""; display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: #d1622f; margin-left: 3px; vertical-align: middle; }
.pd-colfilter-panel { position: fixed; z-index: 50; background: white; border: 1px solid #c7d0dc; border-radius: 6px; box-shadow: 0 8px 22px rgba(20,30,50,.2); width: 230px; font-weight: 400; }
.pd-colfilter-sort-row { display: flex; border-bottom: 1px solid #edf0f4; padding: 4px; gap: 2px; }
.pd-colfilter-sort-row button { flex: 1; padding: 6px 4px; border: none; background: none; font-size: 11px; border-radius: 4px; cursor: pointer; color: #374151; }
.pd-colfilter-sort-row button:hover { background: #eef2f8; }
.pd-colfilter-cond { padding: 8px; border-bottom: 1px solid #edf0f4; }
.pd-colfilter-cond select { width: 100%; padding: 6px 7px; border: 1px solid #cbd3df; border-radius: 4px; font-size: 11.5px; margin-bottom: 6px; }
.pd-colfilter-cond-inputs { display: flex; gap: 6px; margin-bottom: 6px; }
.pd-colfilter-cond-inputs input { flex: 1; min-width: 0; padding: 6px 7px; border: 1px solid #cbd3df; border-radius: 4px; font-size: 11.5px; }
.pd-colfilter-cond-inputs .and { font-size: 11px; color: #8592a6; align-self: center; }
.pd-colfilter-cond button { width: 100%; padding: 6px 4px; border-radius: 4px; font-size: 11.5px; cursor: pointer; border: 1px solid #17365d; background: #17365d; color: white; }
.pd-colfilter-cond button:hover { background: #0f2745; }
.pd-colfilter-divider { text-align: center; font-size: 9.5px; color: #9aa5b3; text-transform: uppercase; letter-spacing: .03em; padding: 6px 8px 2px; border-bottom: 1px solid #edf0f4; }
.pd-colfilter-search { padding: 7px 8px; border-bottom: 1px solid #edf0f4; }
.pd-colfilter-search input { width: 100%; padding: 6px 8px; border: 1px solid #cbd3df; border-radius: 4px; font-size: 11.5px; }
.pd-colfilter-options { max-height: 170px; overflow: auto; padding: 4px; }
.pd-colfilter-options label { display: flex; align-items: center; gap: 6px; padding: 5px 6px; border-radius: 4px; font-size: 12px; cursor: pointer; color: #374151; }
.pd-colfilter-options label:hover { background: #eef2f8; }
.pd-colfilter-selall { padding: 5px 6px 6px; border-bottom: 1px solid #edf0f4; font-size: 11.5px; font-weight: 600; }
.pd-colfilter-selall label { display: flex; align-items: center; gap: 7px; cursor: pointer; }
.pd-colfilter-apply-row { display: flex; gap: 6px; padding: 7px; border-top: 1px solid #edf0f4; }
.pd-colfilter-apply-row button { flex: 1; padding: 6px; border-radius: 4px; font-size: 11px; cursor: pointer; border: 1px solid #cbd3df; background: white; }
.pd-colfilter-apply-row button.apply { background: #17365d; color: white; border-color: #17365d; }
.pd-colfilter-apply-row button.clear { color: #a5432f; border-color: #e7c9c3; }
.pd-grid-wrap { margin: 14px 18px 0; background: white; border: 1px solid #d4dbe5; border-radius: 6px; overflow: auto; flex: 1 1 auto; min-height: 160px; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
.pd-grid-wrap table { border-collapse: separate; border-spacing: 0; width: max-content; min-width: 100%; }
.pd-grid-wrap th, .pd-grid-wrap td { border-right: 1px solid #e0e5ec; border-bottom: 1px solid #e0e5ec; padding: 5px 8px; white-space: nowrap; height: 28px; font-size: 11.5px; }
.pd-grid-wrap th { position: sticky; top: 0; z-index: 4; background: #e9eef5; color: #24364d; font-size: 10.5px; font-weight: 600; text-align: left; }
.pd-grid-wrap th.frozen, .pd-grid-wrap td.frozen { position: sticky; left: 0; z-index: 3; background: #fff; }
.pd-grid-wrap th.frozen { z-index: 8; background: #dfe8f3; }
.pd-master-cell { color: #374151; text-align: right; }
.pd-name-cell { color: #1559a6; font-weight: 600; text-align: left; }
.pd-calc-cell { background: #eaf5ff; color: #14527d; font-weight: 600; text-align: right; }
.pd-yoy-col { font-weight: 600; }
.pd-yoy-col.pos { color: #13804a; }
.pd-yoy-col.neg { color: #a5432f; }
.pd-yoy-col.new { color: #9a6b0c; font-style: italic; font-weight: 400; }
.pd-grid-wrap tbody tr:nth-child(odd) td:not(.pd-calc-cell) { background: #fbfcfe; }
.pd-grid-wrap tbody tr:nth-child(even) td:not(.pd-calc-cell) { background: #f2f5f9; }
.pd-grid-wrap tbody tr:nth-child(odd) td.pd-calc-cell { background: #eaf5ff; }
.pd-grid-wrap tbody tr:nth-child(even) td.pd-calc-cell { background: #dff0fc; }
.pd-grid-wrap tbody tr:hover td { background: #eaf2ff !important; }
.pd-status-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 700; }
.pd-status-badge.yes { background: #e2f6e8; color: #1e7a41; }
.pd-status-badge.no { background: #eef0f3; color: #6b7785; }
.pd-footer-note { flex: 0 0 auto; padding: 8px 18px 16px; font-size: 11px; color: #8592a6; }
.pd-modal-overlay { position: fixed; inset: 0; background: rgba(15,25,40,.45); z-index: 100; display: flex; align-items: center; justify-content: center; }
.pd-modal { background: white; border-radius: 8px; width: 720px; max-width: 92vw; max-height: 82vh; display: flex; flex-direction: column; box-shadow: 0 20px 50px rgba(0,0,0,.3); }
.pd-modal-head { padding: 14px 18px; border-bottom: 1px solid #edf0f4; display: flex; align-items: center; justify-content: space-between; }
.pd-modal-head h2 { font-size: 14.5px; margin: 0; color: #17365d; }
.pd-x { cursor: pointer; color: #8592a6; font-size: 18px; }
.pd-modal-body { padding: 14px 18px; overflow: auto; font-size: 12.5px; }
.pd-modal-body table { width: 100%; border-collapse: collapse; }
.pd-modal-body th { text-align: left; font-weight: 600; color: #5b6b82; font-size: 11px; padding: 7px 8px; border-bottom: 1px solid #edf0f4; }
.pd-modal-body td { font-size: 12px; padding: 7px 8px; border-bottom: 1px solid #edf0f4; vertical-align: top; }
.pd-modal-foot { padding: 12px 18px; border-top: 1px solid #edf0f4; display: flex; justify-content: flex-end; gap: 8px; }
.pd-audit-note { font-size: 11.5px; color: #6b7785; margin-bottom: 10px; line-height: 1.5; }
.pd-old-val { color: #a5432f; text-decoration: line-through; }
.pd-new-val { color: #1e7a41; font-weight: 600; }
`;
