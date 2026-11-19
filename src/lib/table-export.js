import { useCallback, useEffect, useMemo, useState } from "react";

/* ============================================================
   SHARED EXPORT RULES (every master screen)

   - nothing ticked            -> export ALL rows
   - some rows ticked          -> export ONLY the ticked rows
   - every row ticked          -> export ALL rows

   "All rows" means every row in the current search / filter, not just
   the page on screen.
============================================================ */

/**
 * Decide which rows to export.
 * @param {Array} rows       every row in the current filter (all pages)
 * @param {Set}   selected   keys of the ticked rows
 * @param {(row) => string} keyOf
 */
export function pickExportRows(rows, selected, keyOf) {
  const list = Array.isArray(rows) ? rows : [];
  if (!selected || selected.size === 0) return list;
  const chosen = list.filter((row) => selected.has(keyOf(row)));
  if (chosen.length === 0 || chosen.length === list.length) return list;
  return chosen;
}

/**
 * Row selection for a table (checkbox column), like the Delegation screen.
 * `rows` is every row in the current filter; `keyOf` returns a stable key.
 * Ticks that are no longer in the filtered list are dropped.
 */
export function useRowSelection(rows, keyOf) {
  const [selected, setSelected] = useState(() => new Set());

  const keys = useMemo(
    () => (Array.isArray(rows) ? rows : []).map(keyOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  );

  useEffect(() => {
    setSelected((current) => {
      if (current.size === 0) return current;
      const live = new Set(keys);
      const next = new Set([...current].filter((key) => live.has(key)));
      return next.size === current.size ? current : next;
    });
  }, [keys]);

  const selectedCount = keys.filter((key) => selected.has(key)).length;
  const allSelected = keys.length > 0 && selectedCount === keys.length;

  const toggle = useCallback(
    (key) =>
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      }),
    [],
  );

  const toggleAll = useCallback(
    () =>
      setSelected(() => (allSelected ? new Set() : new Set(keys))),
    [allSelected, keys],
  );

  const clear = useCallback(() => setSelected(new Set()), []);

  const pick = useCallback(
    (list = rows) => pickExportRows(list, selected, keyOf),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, selected],
  );

  return {
    selected,
    selectedCount,
    allSelected,
    someSelected: selectedCount > 0 && !allSelected,
    toggle,
    toggleAll,
    clear,
    pick,
  };
}

/* ============================================================
   WRITE THE FILE
============================================================ */

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Spreadsheet formula injection guard for text cells.
const safeText = (value) => {
  const text = value == null ? "" : String(value);
  return /^[=+\-@]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text;
};

/**
 * Export rows to a real .xlsx file.
 * @param {object} options
 * @param {string} options.filename   e.g. "Payroll_Master" (".xlsx" is added)
 * @param {string} [options.sheetName]
 * @param {Array<{header: string, value: (row) => any, numFmt?: string, width?: number}>} options.columns
 * @param {Array} options.rows
 * @returns {Promise<number>} number of rows written
 */
export async function exportRowsToExcel({
  filename,
  sheetName = "Export",
  columns,
  rows,
}) {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(String(sheetName).slice(0, 31), {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  sheet.columns = columns.map((column) => ({
    width:
      column.width ||
      Math.max(14, Math.min(40, String(column.header ?? "").length + 4)),
  }));

  const header = sheet.addRow(columns.map((column) => column.header));
  header.height = 28;
  header.eachCell((cell) => {
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF173B63" },
    };
    cell.alignment = { vertical: "middle", wrapText: true };
  });

  rows.forEach((row) => {
    const values = columns.map((column) => {
      const value = column.value(row);
      if (value == null || value === "") return null;
      return typeof value === "number" ? value : safeText(value);
    });
    const excelRow = sheet.addRow(values);
    columns.forEach((column, index) => {
      if (column.numFmt) excelRow.getCell(index + 1).numFmt = column.numFmt;
    });
  });

  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length },
  };

  const buffer = await workbook.xlsx.writeBuffer();
  download(
    new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`,
  );
  return rows.length;
}