import { COLUMNS, COMPUTED_COLUMNS } from "./appraisal-data";
export function exportToExcel(rows, filename = "appraisal-fy2025-26.csv") {
    const headers = [...COLUMNS.map((c) => c.label), ...COMPUTED_COLUMNS.map((c) => c.label)];
    const escape = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [
        headers.map(escape).join(","),
        ...rows.map((r) => [
            ...COLUMNS.map((c) => escape(r[c.key])),
            ...COMPUTED_COLUMNS.map((c) => escape(Math.round(c.fn(r) * 10) / 10)),
        ].join(",")),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}
