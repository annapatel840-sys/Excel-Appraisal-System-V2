import { COLUMNS } from "./appraisal-data";

export const NUMBER_OPS = [
    { value: "eq", label: "Equals" },
    { value: "neq", label: "Does not equal" },
    { value: "gt", label: "Greater than" },
    { value: "gte", label: "Greater than or equal" },
    { value: "lt", label: "Less than" },
    { value: "lte", label: "Less than or equal" },
    { value: "between", label: "Between" },
];

export const TEXT_OPS = [
    { value: "equals", label: "Equals" },
    { value: "notEquals", label: "Does not equal" },
    { value: "startsWith", label: "Begins with" },
    { value: "endsWith", label: "Ends with" },
    { value: "contains", label: "Contains" },
    { value: "notContains", label: "Does not contain" },
];

export const FIELDS = COLUMNS.map((c) => ({
    key: c.key,
    label: c.label,
    kind:
        c.type === "currency" ||
        c.type === "number" ||
        c.type === "decimal" ||
        c.type === "percent"
            ? "number"
            : c.type === "enum"
                ? "enum"
                : "text",
    ...(c.options ? { options: c.options } : {}),
    ...(c.optionLabels ? { optionLabels: c.optionLabels } : {}),
    // Enum columns whose options are all numbers (e.g. Manager Rating 1-5)
    // also get the Number Filters menu.
    numericEnum:
        c.type === "enum" &&
        Array.isArray(c.options) &&
        c.options.length > 0 &&
        c.options.every((o) => o !== "" && Number.isFinite(Number(o))),
    get: (r) => (c.computed && c.fn ? c.fn(r) : r[c.key]),
}));

export const fieldByKey = (key) =>
    FIELDS.find((f) => f.key === key);

export function optionsFor(key, rows) {
    const f = fieldByKey(key);

    if (f?.options)
        return [...f.options];

    return Array.from(
        new Set(
            rows.map((r) => String(f?.get(r) ?? ""))
        )
    ).sort();
}

// One condition against one value. Returns true when the condition is empty.
function testText(raw, op, value) {
    const v = String(value ?? "").trim().toLowerCase();

    if (!v)
        return true;

    const s = String(raw ?? "").toLowerCase();

    switch (op) {
        case "equals":
            return s === v;
        case "notEquals":
            return s !== v;
        case "startsWith":
            return s.startsWith(v);
        case "endsWith":
            return s.endsWith(v);
        case "notContains":
            return !s.includes(v);
        default:
            return s.includes(v);
    }
}

function testNumber(raw, op, value, value2) {
    // A blank cell is not a number: it never satisfies a numeric condition.
    if (raw === "" || raw === null || raw === undefined)
        return value === "" || value === undefined || value === null;

    const n = Number(raw);
    const a = Number(value);
    const b = Number(value2);

    if (op === "between") {
        if (
            value === "" ||
            value2 === "" ||
            Number.isNaN(a) ||
            Number.isNaN(b)
        )
            return true;

        return (
            n >= Math.min(a, b) &&
            n <= Math.max(a, b)
        );
    }

    if (
        value === "" ||
        value === undefined ||
        value === null ||
        Number.isNaN(a)
    )
        return true;

    switch (op) {
        case "gt":
            return n > a;
        case "gte":
            return n >= a;
        case "lt":
            return n < a;
        case "lte":
            return n <= a;
        case "neq":
            return Math.abs(n - a) >= 0.0001;
        default:
            return Math.abs(n - a) < 0.0001;
    }
}

function matches(row, key, filter) {
    const field = fieldByKey(key);

    if (!field)
        return true;

    const raw = field.get(row);

    if (filter.kind === "enum") {
        return (
            filter.values.length === 0 ||
            filter.values.includes(String(raw))
        );
    }

    // A filter can hold a second condition (Excel "Custom AutoFilter"):
    // op2 / value3, joined by "and" (default) or "or".
    const test = (op, value, value2) =>
        filter.kind === "text"
            ? testText(raw, op, value)
            : testNumber(raw, op, value, value2);

    const first = test(filter.op, filter.value, filter.value2);

    if (!filter.op2 || String(filter.value3 ?? "").trim() === "")
        return first;

    const second = test(filter.op2, filter.value3);

    return filter.join === "or" ? first || second : first && second;
}

export function applyFilters(rows, filters, search) {
    const q = search.trim().toLowerCase();

    return rows.filter((row) => {
        if (
            q &&
            !(
                `${row.empId} ${row.name} ${row.department} ${row.designation} ${row.manager} ${row.reportingManager} ${row.compManager}`
                    .toLowerCase()
                    .includes(q)
            )
        ) {
            return false;
        }

        return Object.entries(filters).every(
            ([key, f]) => matches(row, key, f)
        );
    });
}

const opLabel = (kind, op) =>
    (kind === "text" ? TEXT_OPS : NUMBER_OPS)
        .find((o) => o.value === op)
        ?.label.toLowerCase() ?? op;

export function describeFilter(key, f) {
    const field = fieldByKey(key);
    const label = field?.label ?? key;

    if (f.kind === "enum") {
        const shown = f.values.map((v) => field?.optionLabels?.[v] ?? v);
        return `${label}: ${shown.join(", ")}`;
    }

    const one = (op, value, value2) =>
        op === "between"
            ? `between ${value} and ${value2}`
            : f.kind === "text"
              ? `${opLabel("text", op)} "${value}"`
              : `${opLabel("number", op)} ${value}`;

    let text = `${label} ${one(f.op, f.value, f.value2)}`;

    if (f.op2 && String(f.value3 ?? "").trim() !== "")
        text += ` ${f.join === "or" ? "or" : "and"} ${one(f.op2, f.value3)}`;

    return text;
}

export function isEmptyFilter(f) {
    if (f.kind === "enum")
        return f.values.length === 0;

    const hasSecond =
        !!f.op2 && String(f.value3 ?? "").trim() !== "";

    if (f.kind === "text")
        return String(f.value ?? "").trim() === "" && !hasSecond;

    const firstEmpty =
        f.op === "between"
            ? f.value === "" || f.value2 === ""
            : f.value === "";

    return firstEmpty && !hasSecond;
}