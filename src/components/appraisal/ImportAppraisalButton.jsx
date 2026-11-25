import { hikeAmountFromPct, hikePctFromAmount, roundPct } from "@/lib/hike-math";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Upload, X } from "lucide-react";
import * as XLSX from "xlsx";

import { COLUMNS } from "@/lib/appraisal-data";
import { useAppraisal } from "@/lib/appraisal-store";
import { useAccess } from "@/lib/access-store";
import { cn } from "@/lib/utils";

/* ============================================================
   APPRAISAL SHEET IMPORT

   1. Pick a file.
   2. "Map columns": every column of the file is listed. Columns whose
      header matches a sheet column are mapped automatically; the others
      can be mapped by hand (or skipped). Only columns that can be updated
      are offered as targets, plus Emp ID (the key that matches the rows).
   3. "Review": the cell changes that will be made.
   4. Apply: the Appraisal Sheet is updated. One Apply is one batch
      ("IMP-...") so the last import of the cycle can be undone from
      Menu → Undo last import.
   ============================================================ */

const NUMERIC_TYPES = new Set(["currency", "number", "decimal", "percent"]);
const MAX_PREVIEW_ROWS = 300;
const EMP_KEY = "empId";
const SKIP = "";


const normalizeHeader = (value) =>
  String(value === null || value === undefined ? "" : value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

// Emp IDs are matched on letters/digits only: "EMP-001", "emp 001" and "EMP001" match.
const normalizeEmpId = (value) =>
  String(value === null || value === undefined ? "" : value)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");

// Employee names are compared on letters/digits only, case-insensitive.
const normalizeName = (value) =>
  String(value === null || value === undefined ? "" : value)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const NAME_HEADERS = new Set(["employeename", "name", "employee"]);

// Text from the file and the sheet are "the same" when they match, or one holds the other
// (the grid shows Comp. Manager as "EMP060 - Ravi Rao" while the file may carry the raw value).
const sameText = (a, b) => {
  const x = normalizeName(a);
  const y = normalizeName(b);
  return x === y || (x !== "" && y !== "" && (x.includes(y) || y.includes(x)));
};

// Returns the value to store, or undefined when the cell is not valid.
// `raw` is the real cell value: a number stays a number (never the rounded text Excel shows).
const cellToValue = (column, raw) => {
  if (raw === null || raw === undefined) return "";

  if (NUMERIC_TYPES.has(column.type)) {
    if (typeof raw === "number") return Number.isFinite(raw) ? raw : undefined;
    const text = String(raw).trim();
    if (text === "") return "";
    const number = Number(text.replace(/[₹,\s%]/g, ""));
    if (!Number.isFinite(number)) return undefined;
    // Typed text such as "5.29%" means 0.0529 (the sheet keeps percentages as fractions).
    return column.type === "percent" && text.includes("%") ? number / 100 : number;
  }

  const text = String(raw).trim();
  if (text === "") return "";

  if (column.type === "enum") {
    const match = (column.options || []).find(
      (option) => String(option).toLowerCase() === text.toLowerCase(),
    );
    return match !== undefined ? match : undefined;
  }

  return text;
};

const readFile = async (file) => {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
  // Headers of the first row only are not enough (empty cells are kept by defval,
  // but a column that is blank in every row would be lost): read the header row itself.
  const headerRow = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true })[0] || [];
  const headers = headerRow.map((h) => String(h ?? "").trim()).filter((h) => h !== "");
  return { rows, headers: headers.length ? headers : Object.keys(rows[0] || {}) };
};

const fmtTime = (iso) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getDate())} ${d.toLocaleString("en-US", { month: "short" })} ${d.getFullYear()}, ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/* The last import of the cycle, from the audit entries (local + server).
   null when there was none, or when it has already been undone. */
function buildLastImport(entries) {
  const seen = new Set();
  const groups = new Map();
  const undone = new Set();
  (entries || []).forEach((entry) => {
    const source = String(entry?.source || "");
    const batchId = String(entry?.batchId || "");
    if (!batchId) return;
    if (source === "Import undo" && batchId.startsWith("R-IMP-")) {
      undone.add(batchId.slice(2));
      return;
    }
    if (source !== "Import" || !batchId.startsWith("IMP-")) return;
    const dedupe = `${entry.empId}|${entry.field}|${batchId}|${entry.to}`;
    if (seen.has(dedupe)) return;
    seen.add(dedupe);
    if (!groups.has(batchId)) groups.set(batchId, []);
    groups.get(batchId).push(entry);
  });

  let last = null;
  groups.forEach((list, id) => {
    const at = Math.min(...list.map((e) => new Date(e.at).getTime() || Infinity));
    if (!last || at > last.atMs) {
      const first = list.find((e) => (new Date(e.at).getTime() || Infinity) === at) || list[0];
      last = {
        id,
        atMs: at,
        at: first.at,
        by: first.user || "",
        entries: list,
        cells: list.length,
        employees: new Set(list.map((e) => normalizeEmpId(e.empId))).size,
      };
    }
  });
  return last && !undone.has(last.id) ? last : null;
}

// ============================================================
// HOOK
// ============================================================

export function useAppraisalImport({ onDone } = {}) {
  const {
    rows,
    audit,
    loading,
    selectedLocation,
    updateLinkedCells,
    fetchImportHistory,
    undoImportBatch,
    getImportScope,
  } = useAppraisal();
  const access = useAccess();

  // Only the input columns of the Appraisal Sheet (editable, not calculated) that this login
  // may edit can be imported. Nothing else can be mapped.
  const importColumns = useMemo(
    () =>
      COLUMNS.filter(
        (column) => column.editable && !column.computed && access.canEditField(column.key),
      ),
    [access],
  );

  // Header text -> column key (label or key), only for columns that can be updated.
  const headerToKey = useMemo(() => {
    const map = new Map();
    importColumns.forEach((column) => {
      map.set(normalizeHeader(column.label), column.key);
      map.set(normalizeHeader(column.key), column.key);
    });
    map.set("empid", EMP_KEY);
    map.set("employeeid", EMP_KEY);
    map.set("id", EMP_KEY);
    return map;
  }, [importColumns]);

  // Every sheet column by header text: used to say "read-only in the sheet" for columns
  // that exist but cannot be updated (calculated, or not editable).
  const columnByHeader = useMemo(() => {
    const map = new Map();
    COLUMNS.forEach((column) => {
      map.set(normalizeHeader(column.label), column);
      map.set(normalizeHeader(column.key), column);
    });
    return map;
  }, []);

  // A file column that is a sheet column but cannot be imported (read-only / calculated /
  // no access): it is not shown in the mapping and its values are ignored.
  const isLockedHeader = (header) => {
    const column = columnByHeader.get(normalizeHeader(header));
    if (!column || column.key === EMP_KEY) return false;
    return !importColumns.some((c) => c.key === column.key);
  };

  const fileInputRef = useRef(null);

  // step: "" (closed) | "map" | "review" | "error"
  const [step, setStep] = useState("");
  const [message, setMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState([]);
  const [sheetRows, setSheetRows] = useState([]);
  // header -> { key: column key | EMP_KEY | "", auto: boolean }
  const [mapping, setMapping] = useState({});
  const [changes, setChanges] = useState([]);
  const [notes, setNotes] = useState([]);
  const [unmatchedIds, setUnmatchedIds] = useState([]);
  // Invalid cells (text in a number column, value not in the list...). Import is blocked until fixed.
  const [errors, setErrors] = useState([]);
  // Rows whose Emp ID and Employee Name point to different employees.
  const [mismatchRows, setMismatchRows] = useState([]);

  const [undoOpen, setUndoOpen] = useState(false);
  const [undoResult, setUndoResult] = useState("");

  /* ---------- last import of this cycle (drives the Undo menu item) ---------- */
  const [serverEntries, setServerEntries] = useState([]);
  useEffect(() => {
    if (loading) return undefined;
    let alive = true;
    setServerEntries([]);
    Promise.resolve(fetchImportHistory())
      .then((records) => {
        if (alive) setServerEntries(Array.isArray(records) ? records : []);
      })
      .catch(() => {
        // Not available: the in-memory audit still covers imports made in this session.
      });
    return () => {
      alive = false;
    };
  }, [loading, selectedLocation, fetchImportHistory]);

  const lastImport = useMemo(() => {
    const scope = getImportScope();
    const mine = (list) =>
      (list || []).filter(
        (entry) =>
          !scope.cycle ||
          String(entry?.appraisalYear || "").trim() === String(scope.cycle).trim(),
      );
    return buildLastImport([...mine(audit), ...mine(serverEntries)]);
  }, [audit, serverEntries, getImportScope]);

  /* ---------- file ---------- */
  const openImportPicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const close = () => {
    setStep("");
    setChanges([]);
    setNotes([]);
    setUnmatchedIds([]);
    setErrors([]);
    setMismatchRows([]);
    setSheetRows([]);
    setHeaders([]);
    setMapping({});
  };

  const autoMap = (fileHeaders) => {
    const used = new Set();
    const next = {};
    fileHeaders.forEach((header) => {
      const key = headerToKey.get(normalizeHeader(header));
      if (key && !used.has(key)) {
        used.add(key);
        next[header] = { key, auto: true };
      } else {
        next[header] = { key: SKIP, auto: false };
      }
    });
    return next;
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    try {
      const { rows: fileRows, headers: fileHeaders } = await readFile(file);
      setFileName(file.name);
      setChanges([]);
      setNotes([]);
      setUnmatchedIds([]);

      if (!fileRows.length) {
        setMessage(`${file.name} has no data rows.`);
        setStep("error");
        return;
      }

      const autoMapping = autoMap(fileHeaders);
      if (!Object.values(autoMapping).some((m) => m.key === EMP_KEY)) {
        setMessage(`${file.name} has no Emp ID column. Export the sheet, change the input cells and import that file.`);
        setStep("error");
        return;
      }
      setSheetRows(fileRows);
      setHeaders(fileHeaders);
      setMapping(autoMapping);

      // Always show the column mapping first. Matching columns are already mapped, and
      // "Review changes" lists only the cells that differ from the sheet.
      setStep("map");
    } catch (error) {
      console.error("Appraisal import failed:", error);
      setMessage(error?.message || "That file could not be read. Use the exported sheet format.");
      setStep("error");
    }
  };

  /* ---------- mapping ---------- */
  const setTarget = (header, key) =>
    setMapping((previous) => {
      // Emp ID is fixed: it cannot be unmapped, and no other column can take its place.
      if (previous[header]?.key === EMP_KEY || key === EMP_KEY) return previous;
      return { ...previous, [header]: { key, auto: false } };
    });

  const mapState = useMemo(() => {
    const targets = Object.values(mapping)
      .map((m) => m.key)
      .filter(Boolean);
    const counts = new Map();
    targets.forEach((k) => counts.set(k, (counts.get(k) || 0) + 1));
    const duplicates = [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k);
    const hasEmp = counts.has(EMP_KEY);
    const dataColumns = targets.filter((k) => k !== EMP_KEY).length;
    let error = "";
    if (!hasEmp) error = "Map one column to Emp ID so the rows can be matched.";
    else if (duplicates.length)
      error = `More than one column is mapped to ${duplicates
        .map((k) => (k === EMP_KEY ? "Emp ID" : importColumns.find((c) => c.key === k)?.label || k))
        .join(", ")}. Each sheet column can be mapped once.`;
    else if (!dataColumns) error = "Map at least one column to update.";
    return { error, dataColumns, duplicates: new Set(duplicates) };
  }, [mapping, importColumns]);

  /* ---------- review (what will change) ---------- */
  const buildChanges = (
    fileRows = sheetRows,
    fileHeaders = headers,
    fileMapping = mapping,
  ) => {
    const columnByKey = new Map(importColumns.map((c) => [c.key, c]));
    const empHeader = Object.keys(fileMapping).find((h) => fileMapping[h].key === EMP_KEY);
    const nameHeader = fileHeaders.find((h) => NAME_HEADERS.has(normalizeHeader(h)));
    const byEmpId = new Map(rows.map((row) => [normalizeEmpId(row.empId), row]));
    // Names that belong to exactly one employee (used when the Emp ID is missing or unknown).
    const byName = new Map();
    rows.forEach((row) => {
      const key = normalizeName(row.name);
      if (!key) return;
      byName.set(key, byName.has(key) ? null : row);
    });

    const found = [];
    const unmatchedList = [];
    const mismatchList = [];
    const skippedTitles = [];
    const invalidList = [];
    let blankHike = 0;
    let matchedByName = 0;

    fileRows.forEach((sheetRow) => {
      const rawEmpId = String(sheetRow[empHeader] ?? "").trim();
      const rawName = nameHeader ? String(sheetRow[nameHeader] ?? "").trim() : "";
      if (!rawEmpId && !rawName) return;

      // Emp ID + Employee Name identify the employee.
      let row = rawEmpId ? byEmpId.get(normalizeEmpId(rawEmpId)) : undefined;
      if (row && rawName && !sameText(row.name, rawName)) {
        mismatchList.push({ empId: rawEmpId, fileName: rawName, sheetName: row.name });
        return;
      }
      if (!row && rawName) {
        const byNameRow = byName.get(normalizeName(rawName));
        if (byNameRow) {
          row = byNameRow;
          matchedByName += 1;
        }
      }
      if (!row) {
        unmatchedList.push(rawEmpId || rawName);
        return;
      }

      const mapped = {};
      Object.entries(fileMapping).forEach(([header, target]) => {
        if (target.key && target.key !== EMP_KEY) mapped[target.key] = sheetRow[header];
      });

      // Promotion eligibility first (file value if valid, else the current row),
      // so the New Title rule does not depend on column order.
      const promotionColumn = columnByKey.get("eligibleForPromotion");
      const fileEligibility =
        promotionColumn && "eligibleForPromotion" in mapped
          ? cellToValue(promotionColumn, mapped.eligibleForPromotion)
          : undefined;
      const eligibility = fileEligibility !== undefined ? fileEligibility : row.eligibleForPromotion;

      Object.keys(mapped).forEach((key) => {
        const column = columnByKey.get(key);
        if (!column) return;

        const nextValue = cellToValue(column, mapped[key]);
        // A value the sheet already holds is "no change", even when it is not in the dropdown list
        // (e.g. an existing title such as "Senior Software Engineer").
        if (
          nextValue === undefined &&
          String(mapped[key] ?? "").trim().toLowerCase() ===
            String(row[key] ?? "").trim().toLowerCase()
        ) {
          return;
        }
        if (nextValue === undefined) {
          invalidList.push({
            empId: row.empId,
            name: row.name,
            label: column.label,
            value: String(mapped[key]).slice(0, 40),
            reason: NUMERIC_TYPES.has(column.type)
              ? "must be a number (no text)"
              : "is not an allowed value",
          });
          return;
        }

        // Hike Amount / Hike % cannot be blank in the Data Store.
        if ((key === "hikeAmount" || key === "hikePct") && nextValue === "") {
          blankHike += 1;
          return;
        }

        // New Title only applies to employees eligible for promotion.
        if (key === "newTitle" && nextValue !== "" && eligibility !== "Yes") {
          skippedTitles.push(row.empId || row.name);
          return;
        }

        const before = row[key] === null || row[key] === undefined ? "" : String(row[key]);
        const after = String(nextValue);
        if (before === after) return;
        // Same number written differently (27000 vs 27000.0000001): not a change.
        if (
          NUMERIC_TYPES.has(column.type) &&
          before !== "" &&
          after !== "" &&
          Math.abs(Number(before) - Number(after)) < 0.00001
        ) {
          return;
        }

        found.push({
          rowId: row.id,
          empId: row.empId,
          name: row.name,
          key,
          value: nextValue,
          label: column.label,
          before: before || "—",
          after: after || "—",
        });
      });
    });

    const noteList = [];
    if (matchedByName)
      noteList.push(`${matchedByName} row(s) matched by Employee Name because the Emp ID was not found`);
    if (unmatchedList.length)
      noteList.push(
        `${unmatchedList.length} row(s) had no matching employee (e.g. ${unmatchedList.slice(0, 5).join(", ")})`,
      );
    if (mismatchList.length)
      noteList.push(
        `${mismatchList.length} row(s) skipped because Emp ID and Employee Name belong to different employees (e.g. ${mismatchList
          .slice(0, 3)
          .map((m) => `${m.empId}: file "${m.fileName}" vs sheet "${m.sheetName}"`)
          .join("; ")})`,
      );
    if (blankHike) noteList.push(`${blankHike} blank Hike cell(s) skipped (enter 0 for no hike)`);
    if (skippedTitles.length)
      noteList.push(
        `${skippedTitles.length} New Title value(s) skipped because Eligible for Promotion is not "Yes" (e.g. ${skippedTitles
          .slice(0, 5)
          .join(", ")})`,
      );
    setChanges(found);
    setNotes(noteList);
    setUnmatchedIds(unmatchedList);
    setMismatchRows(mismatchList);
    setErrors(invalidList);
    setStep("review");
  };

  /* ---------- apply ---------- */
  const confirmImport = () => {
    const rowsById = new Map(rows.map((row) => [row.id, row]));
    const batchId = `IMP-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

    // One save per employee: all their changed cells go in one request.
    const perRow = new Map();
    changes.forEach((change) => {
      if (!perRow.has(change.rowId)) perRow.set(change.rowId, {});
      perRow.get(change.rowId)[change.key] = change.value;
    });

    let written = 0;
    perRow.forEach((fields, rowId) => {
      const row = rowsById.get(rowId);
      const values = { ...fields };

      if (values.eligibleForPromotion === "No") values.newTitle = null;

      if ("hikeAmount" in values || "hikePct" in values) {
        const basePay = Number(
          "currentAnnualBasePay" in values ? values.currentAnnualBasePay : row?.currentAnnualBasePay,
        );
        // An exported file carries BOTH columns, so a changed amount comes with a
        // (rounded) % that must not rebuild it: the amount drives; a % alone drives the amount.
        if ("hikeAmount" in values) {
          const amount = Number(values.hikeAmount) || 0;
          values.hikeAmount = amount;
          values.hikePct = hikePctFromAmount(basePay, amount);
        } else {
          const pct = roundPct(Number(values.hikePct) || 0);
          values.hikePct = pct;
          values.hikeAmount = hikeAmountFromPct(basePay, pct);
        }
      }

      written += updateLinkedCells(rowId, values, "Import", batchId) || 0;
    });

    close();
    if (onDone) onDone(written);
  };

  /* ---------- undo ---------- */
  const openUndoImport = useCallback(() => {
    if (!lastImport) return;
    setUndoResult("");
    setUndoOpen(true);
  }, [lastImport]);

  const confirmUndo = () => {
    if (!lastImport) {
      setUndoOpen(false);
      return;
    }
    const result = undoImportBatch(lastImport);
    setUndoOpen(false);
    if (onDone) onDone(result.cells, { undo: true, ...result });
  };

  /* ---------- UI ---------- */
  const targetOptions = [
    { key: SKIP, label: "— Don't import —" },
    ...importColumns.map((column) => ({ key: column.key, label: column.label })),
  ];

  const sampleOf = (header) => {
    const hit = sheetRows.find((r) => String(r[header] ?? "").trim() !== "");
    const text = hit ? String(hit[header]).trim() : "";
    return text.length > 28 ? text.slice(0, 27) + "…" : text;
  };

  const shell = (title, body, footer, wide) =>
    createPortal(
      <div className="fixed inset-0 z-[20000] flex items-center justify-center bg-black/40 p-4">
        <div
          className={cn(
            "flex max-h-[85vh] w-full flex-col overflow-hidden rounded-md bg-white shadow-xl",
            wide ? "max-w-[760px]" : "max-w-[520px]",
          )}
        >
          <div className="flex items-center justify-between bg-[#173b63] px-4 py-2.5 text-white">
            <span className="text-[13px] font-bold">{title}</span>
            <button
              type="button"
              onClick={() => {
                if (undoOpen) setUndoOpen(false);
                else close();
              }}
              aria-label="Close"
              className="flex size-6 items-center justify-center rounded hover:bg-white/10"
            >
              <X className="size-4" />
            </button>
          </div>
          {body}
          <div className="flex items-center justify-end gap-2 border-t border-[#e2e8f0] bg-[#f8fafc] px-4 py-2.5">
            {footer}
          </div>
        </div>
      </div>,
      document.body,
    );

  const btnGhost =
    "h-8 rounded border border-[#cbd5e1] bg-white px-3 text-[12px] font-medium text-slate-600 hover:bg-slate-100";
  const btnPrimary =
    "h-8 rounded bg-[#173b63] px-3 text-[12px] font-semibold text-white hover:bg-[#122e4d] disabled:cursor-not-allowed disabled:opacity-40";

  let modal = null;

  if (step === "error") {
    modal = shell(
      "Import appraisal sheet",
      <div className="px-4 py-4 text-[12px] text-slate-700">{message}</div>,
      <button type="button" onClick={close} className={btnGhost}>
        Close
      </button>,
    );
  }

  if (step === "map") {
    const autoCount = Object.values(mapping).filter((m) => m.key && m.auto).length;
    const manualCount = Object.values(mapping).filter((m) => m.key && !m.auto).length;
    const shownHeaders = headers.filter(
      (header) => !isLockedHeader(header) && !NAME_HEADERS.has(normalizeHeader(header)),
    );
    const skipCount = shownHeaders.length - autoCount - manualCount;
    modal = shell(
      "Import appraisal sheet — map columns",
      <>
        <div className="border-b border-[#e2e8f0] px-4 py-2.5 text-[12px] text-slate-700">
          <div className="font-semibold">{fileName}</div>
          <div className="mt-0.5 text-slate-500">
            {sheetRows.length} row(s) · {shownHeaders.length} input column(s) —{" "}
            <span className="text-emerald-700">{autoCount} auto-mapped</span>
            {manualCount > 0 && <span className="text-[#173b63]">, {manualCount} mapped by you</span>}
            {skipCount > 0 && <span className="text-amber-700">, {skipCount} not mapped</span>}
          </div>
          <div className="mt-0.5 text-[11px] text-slate-500">
            Emp ID is always the matching key and cannot be changed. Only the input columns of the
            Appraisal Sheet are listed; read-only and calculated columns are ignored.
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead>
              <tr className="bg-[#eef2f7] text-left text-[11px] font-bold text-[#24364d]">
                <th className="sticky top-0 bg-[#eef2f7] px-3 py-1.5">Column in file</th>
                <th className="sticky top-0 bg-[#eef2f7] px-3 py-1.5">Example</th>
                <th className="sticky top-0 bg-[#eef2f7] px-3 py-1.5">Update sheet column</th>
                <th className="sticky top-0 bg-[#eef2f7] px-3 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {headers.filter((header) => !isLockedHeader(header) && !NAME_HEADERS.has(normalizeHeader(header))).map((header) => {
                const target = mapping[header] || { key: SKIP, auto: false };
                const dup = target.key && mapState.duplicates.has(target.key);
                return (
                  <tr key={header} className="border-b border-[#eef2f7]">
                    <td className="px-3 py-1.5 font-medium text-slate-700">{header}</td>
                    <td className="px-3 py-1.5 text-slate-500">{sampleOf(header)}</td>
                    <td className="px-3 py-1.5">
                      {target.key === EMP_KEY ? (
                        <span className="inline-block h-7 w-full max-w-[230px] rounded border border-[#e2e8f0] bg-slate-50 px-2 py-1 text-[12px] font-medium text-slate-700">
                          Emp ID (fixed)
                        </span>
                      ) : (
                      <select
                        value={target.key}
                        onChange={(event) => setTarget(header, event.target.value)}
                        className={cn(
                          "h-7 w-full max-w-[230px] rounded border bg-white px-1.5 text-[12px]",
                          dup ? "border-red-400" : "border-[#cbd5e1]",
                        )}
                      >
                        {targetOptions.map((option) => (
                          <option key={option.key || "skip"} value={option.key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-[11px]">
                      {!target.key ? (
                        <span className="text-amber-700">Not mapped</span>
                      ) : target.key === EMP_KEY ? (
                        <span className="text-slate-500">Key</span>
                      ) : target.auto ? (
                        <span className="text-emerald-700">Auto</span>
                      ) : (
                        <span className="text-[#173b63]">Manual</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {mapState.error && (
          <div className="border-t border-[#fecaca] bg-[#fef2f2] px-4 py-2 text-[12px] text-red-700">
            {mapState.error}
          </div>
        )}
      </>,
      <>
        <button type="button" onClick={close} className={btnGhost}>
          Cancel
        </button>
        <button type="button" onClick={() => buildChanges()} disabled={!!mapState.error} className={btnPrimary}>
          Review changes
        </button>
      </>,
      true,
    );
  }

  if (step === "review") {
    const noteText = notes.length ? ` ${notes.join("; ")}.` : "";
    modal = shell(
      "Import appraisal sheet — review",
      <>
        <div className="border-b border-[#e2e8f0] px-4 py-2.5 text-[12px] text-slate-700">
          {changes.length
            ? `${fileName} — ${changes.length} cell${changes.length === 1 ? "" : "s"} will change.${noteText}`
            : `${fileName} — no cell changes detected (matched rows already have these values).${noteText}`}
        </div>
        {changes.length > 0 && (
          <div className="min-h-0 flex-1 overflow-auto">
            <table className="w-full border-collapse text-[12px]">
              <thead>
                <tr className="bg-[#eef2f7] text-left text-[11px] font-bold text-[#24364d]">
                  <th className="sticky top-0 bg-[#eef2f7] px-3 py-1.5">Employee</th>
                  <th className="sticky top-0 bg-[#eef2f7] px-3 py-1.5">Field</th>
                  <th className="sticky top-0 bg-[#eef2f7] px-3 py-1.5">Change</th>
                </tr>
              </thead>
              <tbody>
                {changes.slice(0, MAX_PREVIEW_ROWS).map((change, index) => (
                  <tr key={`${change.rowId}-${change.key}-${index}`} className="border-b border-[#eef2f7]">
                    <td className="px-3 py-1.5 text-slate-700">
                      {change.name}
                      <span className="ml-1 text-[11px] text-slate-400">{change.empId}</span>
                    </td>
                    <td className="px-3 py-1.5 text-slate-600">{change.label}</td>
                    <td className="px-3 py-1.5 tabular-nums">
                      <span className="text-slate-400">{change.before}</span>
                      {" → "}
                      <span className="font-semibold text-[#173b63]">{change.after}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {changes.length > MAX_PREVIEW_ROWS && (
              <div className="px-3 py-2 text-[11px] text-slate-500">
                Showing the first {MAX_PREVIEW_ROWS} of {changes.length} changes. All will be applied.
              </div>
            )}
          </div>
        )}
        {errors.length > 0 && (
          <div className="max-h-[220px] overflow-auto border-t border-[#fecaca] bg-[#fef2f2] px-4 py-2.5">
            <div className="mb-1 text-[11px] font-semibold text-red-700">
              {errors.length} invalid value{errors.length === 1 ? "" : "s"} — fix them in the file and import again:
            </div>
            <ul className="space-y-0.5 text-[11px] text-red-700">
              {errors.slice(0, 50).map((error, index) => (
                <li key={`${error.empId}-${error.label}-${index}`}>
                  {error.name} <span className="text-red-400">{error.empId}</span> — {error.label} "{error.value}"{" "}
                  {error.reason}
                </li>
              ))}
            </ul>
            {errors.length > 50 && <div className="pt-1 text-[11px]">Showing the first 50 of {errors.length}.</div>}
          </div>
        )}
        {!changes.length && unmatchedIds.length > 0 && (
          <div className="max-h-[220px] overflow-auto px-4 py-2.5">
            <div className="mb-1 text-[11px] font-semibold text-slate-600">Unmatched Emp IDs from the file:</div>
            <div className="text-[11px] text-slate-500">{unmatchedIds.join(", ")}</div>
          </div>
        )}
      </>,
      <>
        <button type="button" onClick={() => setStep("map")} className={btnGhost}>
          Back
        </button>
        <button type="button" onClick={close} className={btnGhost}>
          Cancel
        </button>
        {changes.length > 0 && (
          <button type="button" onClick={confirmImport} disabled={errors.length > 0} className={btnPrimary}>
            Apply {changes.length} change{changes.length === 1 ? "" : "s"}
          </button>
        )}
      </>,
      true,
    );
  }

  let undoModal = null;
  if (undoOpen && lastImport) {
    const scope = getImportScope();
    undoModal = shell(
      "Undo last import",
      <div className="space-y-2 px-4 py-3 text-[12px] text-slate-700">
        <div className="grid grid-cols-[90px_1fr] gap-y-1">
          <span className="text-slate-500">Cycle</span>
          <span className="font-medium">{scope.cycle || "—"}</span>
          <span className="text-slate-500">Location</span>
          <span className="font-medium">{scope.location || "—"}</span>
          <span className="text-slate-500">Imported</span>
          <span className="font-medium">
            {fmtTime(lastImport.at)}
            {lastImport.by ? ` by ${lastImport.by}` : ""}
          </span>
          <span className="text-slate-500">Changes</span>
          <span className="font-medium">
            {lastImport.cells} cell{lastImport.cells === 1 ? "" : "s"} · {lastImport.employees} employee
            {lastImport.employees === 1 ? "" : "s"}
          </span>
        </div>
        <div className="text-[11px] text-slate-500">
          The old values are put back. A cell that was changed again after the import is left as it is.
        </div>
      </div>,
      <>
        <button type="button" onClick={() => setUndoOpen(false)} className={btnGhost}>
          Cancel
        </button>
        <button type="button" onClick={confirmUndo} className={btnPrimary}>
          Undo import
        </button>
      </>,
    );
  }

  const importUi = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={handleFile}
      />
      {modal}
      {undoModal}
    </>
  );

  return {
    openImportPicker,
    importUi,
    // Undo last import: enabled only when this cycle (and location) has an import not yet undone.
    canUndoImport: !!lastImport,
    lastImport,
    openUndoImport,
  };
}

// ============================================================
// READY-MADE MENU ITEM
// ============================================================

export function ImportAppraisalButton({ className, onDone, onClick }) {
  const { openImportPicker, importUi } = useAppraisalImport({ onDone });

  return (
    <>
      <button
        type="button"
        onClick={() => {
          openImportPicker();
          if (onClick) onClick();
        }}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] text-slate-700 hover:bg-slate-100",
          className,
        )}
      >
        <Upload className="size-4 text-slate-500" />
        Import
      </button>

      {importUi}
    </>
  );
}