import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { historicalImportRequest } from "@/lib/historical-import-api";

/* ============================================================
   HISTORICAL IMPORT (HR only)

   Previous-year data goes straight into storage for a past cycle:
   Payroll -> Payroll_Data, Review and Feedback -> Feedback_And_Rating.
   No appraisal step runs (Eligibility, Delegation, Appraisal Sheet,
   budget). Past cycles are created in Appraisal Cycle Master.
   ============================================================ */

const PAGE = 20;
const TYPE_INFO = {
  payroll: { icon: "₹", note: "Saved to Payroll Data" },
  feedback: { icon: "★", note: "Saved to Review and Feedback" },
};

const headerKey = (value) =>
  String(value || "").trim().toLowerCase().replace(/[^a-z0-9%]+/g, "");

function cellValue(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return value;
}

const newBatchId = () =>
  `HI-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function when(value) {
  const text = String(value || "");
  return text ? text.slice(0, 16) : "—";
}

export function HistoricalImportPage() {
  const [schema, setSchema] = useState(null);
  const [cycles, setCycles] = useState([]);
  const [history, setHistory] = useState([]);
  const [loadError, setLoadError] = useState("");
  const [cycleId, setCycleId] = useState("");
  const [type, setType] = useState("payroll");
  const [file, setFile] = useState(null);
  const [fileError, setFileError] = useState("");
  const [check, setCheck] = useState(null);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState(null);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [confirmUndo, setConfirmUndo] = useState("");

  const say = (text, error = false) => setMessage({ text, error });

  const loadAll = useCallback(async () => {
    setLoadError("");
    try {
      const [s, c, h] = await Promise.all([
        historicalImportRequest("schema"),
        historicalImportRequest("cycles"),
        historicalImportRequest("history"),
      ]);
      setSchema(s);
      setCycles(Array.isArray(c) ? c : []);
      setHistory(Array.isArray(h) ? h : []);
      setCycleId((current) =>
        current && (c || []).some((x) => x.id === current) ? current : "",
      );
    } catch (error) {
      setLoadError(error.message || "Unable to load Historical Import.");
    }
  }, []);

  useEffect(() => {
    loadAll();
    const refresh = () => loadAll();
    window.addEventListener("appraisal:cycle-updated", refresh);
    return () => window.removeEventListener("appraisal:cycle-updated", refresh);
  }, [loadAll]);

  const fields = useMemo(
    () => schema?.types?.[type]?.fields || [],
    [schema, type],
  );
  const cycle = cycles.find((c) => c.id === cycleId) || null;

  // Header -> field key, by label or alias (case and punctuation ignored).
  const mapping = useMemo(() => {
    if (!file) return { map: [], ignored: [], missingRequired: [] };
    const lookup = new Map();
    fields.forEach((f) =>
      [f.label, f.key, ...(f.aliases || [])].forEach((name) =>
        lookup.set(headerKey(name), f),
      ),
    );
    const used = new Set();
    const map = file.headers.map((header) => {
      const field = lookup.get(headerKey(header));
      if (!field || used.has(field.key)) return null;
      used.add(field.key);
      return field;
    });
    return {
      map,
      ignored: file.headers.filter((h, i) => h && !map[i]),
      missingRequired: fields.filter((f) => f.required && !used.has(f.key)),
    };
  }, [file, fields]);

  const resetFile = () => {
    setFile(null);
    setCheck(null);
    setFileError("");
    setFilter("all");
    setPage(1);
  };

  const chooseType = (next) => {
    if (busy) return;
    setType(next);
    resetFile();
  };

  const readFile = async (picked) => {
    resetFile();
    setMessage(null);
    if (!picked) return;
    try {
      const ext = picked.name.split(".").pop()?.toLowerCase();
      if (!["xlsx", "xls", "csv"].includes(ext))
        throw new Error("Choose an Excel or CSV file.");
      const wb = XLSX.read(await picked.arrayBuffer(), {
        type: "array",
        cellDates: true,
      });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("The file has no worksheet.");
      const rows = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: "",
        raw: true,
      });
      const headers = (rows.shift() || []).map((h) => String(h || "").trim());
      if (!headers.some(Boolean))
        throw new Error("The first row must hold the column headers.");
      const dataRows = rows
        .map((cells, index) => ({ row: index + 2, cells }))
        .filter(({ cells }) => cells.some((v) => String(v ?? "").trim() !== ""));
      if (!dataRows.length) throw new Error("The file has no data rows.");
      const max = schema?.maxRows || 5000;
      if (dataRows.length > max)
        throw new Error(`The file has ${dataRows.length} rows; the limit is ${max}. Split it into smaller files.`);
      setFile({ name: picked.name, headers, rows: dataRows });
    } catch (error) {
      setFileError(error.message || "Unable to read the file.");
    }
  };

  const records = useMemo(() => {
    if (!file) return [];
    return file.rows.map(({ row, cells }) => {
      const record = { row };
      mapping.map.forEach((field, index) => {
        if (field) record[field.key] = cellValue(cells[index]);
      });
      return record;
    });
  }, [file, mapping]);

  const runCheck = async () => {
    setMessage(null);
    if (!cycleId) return setFileError("Select an appraisal cycle first.");
    if (!file) return setFileError("Choose a file first.");
    if (mapping.missingRequired.length)
      return setFileError(
        `The file needs a column for: ${mapping.missingRequired.map((f) => f.label).join(", ")}.`,
      );
    setBusy("check");
    try {
      const result = await historicalImportRequest("validate", {
        method: "POST",
        body: { type, cycleId, records },
      });
      setCheck(result);
      setFilter("all");
      setPage(1);
    } catch (error) {
      setFileError(error.message || "Unable to check the file.");
    } finally {
      setBusy("");
    }
  };

  const okRows = useMemo(() => {
    if (!check) return [];
    const good = new Set(
      check.rows.filter((r) => r.status !== "error").map((r) => r.row),
    );
    return records.filter((r) => good.has(r.row));
  }, [check, records]);

  const runImport = async () => {
    if (!check || !okRows.length) return;
    const batchId = newBatchId();
    const size = schema?.chunkRows || 250;
    const chunks = [];
    for (let i = 0; i < okRows.length; i += size) chunks.push(okRows.slice(i, i + size));
    const total = { inserted: 0, updated: 0, createdEmployees: 0, skipped: 0 };
    setBusy("import");
    setMessage(null);
    try {
      for (let index = 0; index < chunks.length; index += 1) {
        setMessage({ text: `Importing part ${index + 1} of ${chunks.length}…`, error: false });
        const result = await historicalImportRequest("commit", {
          method: "POST",
          body: {
            type,
            cycleId,
            batchId,
            fileName: file.name,
            records: chunks[index],
            chunkIndex: index,
            chunkCount: chunks.length,
          },
        });
        Object.keys(total).forEach((k) => { total[k] += Number(result?.[k]) || 0; });
      }
      say(
        `${schema.types[type].label} for ${cycle?.name}: ${total.inserted} added, ${total.updated} replaced` +
          (total.createdEmployees ? `, ${total.createdEmployees} employee(s) added as Inactive` : "") +
          (total.skipped + check.summary.error ? `, ${total.skipped + check.summary.error} skipped` : "") +
          ".",
      );
      resetFile();
    } catch (error) {
      say(
        `Import stopped: ${error.message}. Rows saved before the error are listed in Import history, where you can undo them.`,
        true,
      );
    } finally {
      setBusy("");
      loadAll();
    }
  };

  const runUndo = async (batchId) => {
    setConfirmUndo("");
    setBusy("undo");
    setMessage(null);
    try {
      const result = await historicalImportRequest("undo", {
        method: "POST",
        body: { batchId },
      });
      say(`Import undone: ${result.deleted} row(s) removed, ${result.restored} row(s) restored.`);
    } catch (error) {
      say(error.message || "Unable to undo the import.", true);
    } finally {
      setBusy("");
      loadAll();
    }
  };

  const downloadTemplate = () => {
    const sheet = XLSX.utils.aoa_to_sheet([fields.map((f) => f.label)]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, type === "payroll" ? "Payroll" : "Feedback");
    XLSX.writeFile(wb, `Historical_${type === "payroll" ? "Payroll" : "Review_Feedback"}_template.xlsx`);
  };

  const downloadReport = () => {
    const rows = (check?.rows || [])
      .filter((r) => r.errors.length || r.warnings.length)
      .map((r) => ({
        Row: r.row,
        "Employee ID": r.empId,
        Name: r.name,
        Status: r.status === "error" ? "Error (skipped)" : "Warning",
        Message: [...r.errors, ...r.warnings].join(" "),
      }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Report");
    XLSX.writeFile(wb, `${(file?.name || "import").replace(/\.[^.]+$/, "")}_report.xlsx`);
  };

  const shown = useMemo(() => {
    const rows = check?.rows || [];
    if (filter === "error") return rows.filter((r) => r.status === "error");
    if (filter === "warning") return rows.filter((r) => r.status !== "error" && r.warnings.length);
    if (filter === "new" || filter === "update") return rows.filter((r) => r.status === filter);
    return rows;
  }, [check, filter]);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  const pageRows = shown.slice((page - 1) * PAGE, page * PAGE);

  const statusTag = (r) => {
    if (r.status === "error") return <span className="hi-tag err">Error</span>;
    if (r.warnings.length) return <span className="hi-tag warn">{r.status === "update" ? "Update" : "New"} · warning</span>;
    return r.status === "update"
      ? <span className="hi-tag upd">Update</span>
      : <span className="hi-tag ok">New</span>;
  };

  if (loadError) {
    return (
      <div className="hi">
        <style>{CSS}</style>
        <div className="hi-msg err">{loadError}</div>
        <button type="button" className="hi-btn" onClick={loadAll}>Try again</button>
      </div>
    );
  }

  return (
    <div className="hi">
      <style>{CSS}</style>
      <div className="hi-head">
        <div>
          <div className="hi-title">Historical Import</div>
          <div className="hi-sub">
            Previous-year data goes straight into storage. No Eligibility, Delegation, Appraisal Sheet or budget step runs.
          </div>
        </div>
        <span className="hi-tag warn">HR only</span>
      </div>

      {message && <div className={`hi-msg${message.error ? " err" : ""}`}>{message.text}</div>}

      <section className="hi-card">
        <div className="hi-step"><span className="hi-num">1</span>Select appraisal cycle</div>
        <select
          className="hi-select"
          value={cycleId}
          disabled={!!busy}
          onChange={(e) => { setCycleId(e.target.value); setCheck(null); setFileError(""); }}
        >
          <option value="">Choose a past cycle…</option>
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} · {c.archived ? "Archived" : c.status}
              {c.effective ? ` · effective ${c.effective}` : ""}
              {c.past ? " · past cycle" : ""}
            </option>
          ))}
        </select>
        <div className="hi-hint">
          Only Closed or archived cycles are listed. To add an older year, open Appraisal Cycle Master → Set up cycle and tick “Past cycle”.
        </div>
      </section>

      <section className="hi-card">
        <div className="hi-step"><span className="hi-num">2</span>What are you importing?</div>
        <div className="hi-types">
          {Object.entries(schema?.types || {}).map(([key, def]) => (
            <button
              type="button"
              key={key}
              className={`hi-type${type === key ? " on" : ""}`}
              disabled={!!busy}
              onClick={() => chooseType(key)}
            >
              <span className="hi-ico" aria-hidden="true">{TYPE_INFO[key]?.icon}</span>
              <span>
                <b>{def.label}</b>
                <small>{TYPE_INFO[key]?.note}</small>
              </span>
            </button>
          ))}
        </div>
        <div className="hi-hint">
          Columns: {fields.map((f) => f.label).join(", ")}. A row that already exists for the same employee and cycle is replaced.
        </div>
      </section>

      <section className="hi-card">
        <div className="hi-step"><span className="hi-num">3</span>Upload file</div>
        <label className="hi-drop">
          <input
            type="file"
            accept=".xlsx,.xls,.csv"
            disabled={!!busy}
            onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ""; }}
          />
          {file ? `${file.name} · ${file.rows.length} row(s)` : "Choose an .xlsx or .csv file"}
        </label>
        {file && (
          <div className="hi-hint">
            {mapping.map.filter(Boolean).length} column(s) recognised
            {mapping.ignored.length ? ` · ignored: ${mapping.ignored.join(", ")}` : ""}
          </div>
        )}
        {fileError && <div className="hi-err">{fileError}</div>}
        <div className="hi-row">
          <button type="button" className="hi-btn" onClick={downloadTemplate} disabled={!fields.length}>
            Download template
          </button>
          <button type="button" className="hi-btn" onClick={runCheck} disabled={!!busy || !file}>
            {busy === "check" ? "Checking…" : "Check file"}
          </button>
        </div>
      </section>

      {check && (
        <section className="hi-card">
          <div className="hi-step"><span className="hi-num">4</span>Check and import · {check.cycleName}</div>
          <div className="hi-kpis">
            {[
              ["all", "Rows", check.summary.total, ""],
              ["new", "New", check.summary.new, "ok"],
              ["update", "Replace", check.summary.update, "upd"],
              ["warning", "Warnings", check.summary.warning, "warn"],
              ["error", "Errors", check.summary.error, "err"],
            ].map(([key, label, value, tone]) => (
              <button
                type="button"
                key={key}
                className={`hi-kpi${filter === key ? " on" : ""}`}
                onClick={() => { setFilter(key); setPage(1); }}
              >
                <span>{label}</span>
                <b className={tone}>{value}</b>
              </button>
            ))}
          </div>
          <table className="hi-table">
            <thead>
              <tr><th>Row</th><th>Employee ID</th><th>Name</th><th>Status</th><th>Message</th></tr>
            </thead>
            <tbody>
              {pageRows.map((r) => (
                <tr key={r.row}>
                  <td>{r.row}</td>
                  <td>{r.empId || "—"}</td>
                  <td>{r.name || "—"}</td>
                  <td>{statusTag(r)}</td>
                  <td>{[...r.errors, ...r.warnings].join(" ") || "Ready"}</td>
                </tr>
              ))}
              {!pageRows.length && (
                <tr><td colSpan={5} className="hi-empty">No rows in this view.</td></tr>
              )}
            </tbody>
          </table>
          {pages > 1 && (
            <div className="hi-row end">
              <button type="button" className="hi-btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
              <span className="hi-hint">Page {page} of {pages}</span>
              <button type="button" className="hi-btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
            </div>
          )}
          <div className="hi-row">
            <button
              type="button"
              className="hi-btn main"
              disabled={!!busy || !okRows.length}
              onClick={runImport}
            >
              {busy === "import" ? "Importing…" : `Import ${okRows.length} row(s) into ${check.cycleName}`}
            </button>
            {(check.summary.error > 0 || check.summary.warning > 0) && (
              <button type="button" className="hi-btn" onClick={downloadReport}>Download report</button>
            )}
            {check.summary.error > 0 && <span className="hi-hint">Rows with errors are skipped.</span>}
          </div>
        </section>
      )}

      <section className="hi-card">
        <div className="hi-step">Import history</div>
        <table className="hi-table">
          <thead>
            <tr><th>When</th><th>Cycle</th><th>Data</th><th>File</th><th>Result</th><th>By</th><th /></tr>
          </thead>
          <tbody>
            {history.map((h) => (
              <tr key={h.batchId}>
                <td>{when(h.at)}</td>
                <td>{h.cycleName}</td>
                <td>{schema?.types?.[h.type]?.label || h.type}</td>
                <td className="hi-file">{h.fileName || "—"}</td>
                <td>
                  {h.inserted} added, {h.updated} replaced
                  {h.createdEmployees ? `, ${h.createdEmployees} new Inactive` : ""}
                  {h.chunks < h.chunkCount ? ` · incomplete (${h.chunks}/${h.chunkCount})` : ""}
                </td>
                <td>{h.by}</td>
                <td>
                  {h.undone ? (
                    <span className="hi-tag grey">Undone {when(h.undoneAt)}</span>
                  ) : confirmUndo === h.batchId ? (
                    <span className="hi-row tight">
                      <button type="button" className="hi-btn sm danger" disabled={!!busy} onClick={() => runUndo(h.batchId)}>Confirm undo</button>
                      <button type="button" className="hi-btn sm" onClick={() => setConfirmUndo("")}>Cancel</button>
                    </span>
                  ) : (
                    <button type="button" className="hi-btn sm" disabled={!!busy} onClick={() => setConfirmUndo(h.batchId)}>Undo</button>
                  )}
                </td>
              </tr>
            ))}
            {!history.length && (
              <tr><td colSpan={7} className="hi-empty">No historical imports yet.</td></tr>
            )}
          </tbody>
        </table>
        <div className="hi-hint">
          Undo removes the rows an import added and restores the rows it replaced. Employees added as Inactive stay in Employee Master.
        </div>
      </section>
    </div>
  );
}

export default HistoricalImportPage;

const CSS = `
.hi{display:flex;flex-direction:column;gap:12px;font-size:13px;color:#1f2937}
.hi-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
.hi-title{font-size:16px;font-weight:700;color:#0f2a44}
.hi-sub,.hi-hint{color:#6b7280;font-size:12px;margin-top:4px}
.hi-card{background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px}
.hi-step{display:flex;align-items:center;gap:8px;font-weight:700;color:#0f2a44;margin-bottom:10px}
.hi-num{width:22px;height:22px;border-radius:50%;background:#e6f0fb;color:#1d4f8c;display:inline-flex;align-items:center;justify-content:center;font-size:12px}
.hi-select{width:100%;max-width:520px;height:34px;border:1px solid #d1d5db;border-radius:6px;padding:0 8px;background:#fff}
.hi-types{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px}
.hi-type{display:flex;gap:10px;align-items:center;text-align:left;border:1px solid #d1d5db;border-radius:8px;padding:10px 12px;background:#fff;cursor:pointer}
.hi-type.on{border:2px solid #2563eb;padding:9px 11px;background:#f5f9ff}
.hi-type b{display:block;color:#0f2a44}.hi-type small{color:#6b7280}
.hi-ico{width:28px;height:28px;border-radius:6px;background:#e6f0fb;color:#1d4f8c;display:inline-flex;align-items:center;justify-content:center;font-weight:700}
.hi-drop{display:block;border:1px dashed #9ca3af;border-radius:8px;padding:16px;text-align:center;color:#4b5563;cursor:pointer;background:#fafafa}
.hi-drop input{display:none}
.hi-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:10px}
.hi-row.end{justify-content:flex-end}.hi-row.tight{margin-top:0;flex-wrap:nowrap}
.hi-btn{height:32px;padding:0 12px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:#0f2a44;font-weight:600;cursor:pointer}
.hi-btn:disabled{opacity:.55;cursor:not-allowed}
.hi-btn.main{background:#2563eb;border-color:#2563eb;color:#fff}
.hi-btn.sm{height:26px;padding:0 8px;font-size:12px}
.hi-btn.danger{border-color:#dc2626;color:#b91c1c}
.hi-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin-bottom:10px}
.hi-kpi{display:flex;flex-direction:column;align-items:flex-start;gap:2px;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;background:#f9fafb;cursor:pointer}
.hi-kpi.on{border-color:#2563eb;background:#f5f9ff}
.hi-kpi span{color:#6b7280;font-size:12px}.hi-kpi b{font-size:18px}
.hi-kpi b.ok{color:#15803d}.hi-kpi b.upd{color:#1d4f8c}.hi-kpi b.warn{color:#b45309}.hi-kpi b.err{color:#b91c1c}
.hi-table{width:100%;border-collapse:collapse}
.hi-table th,.hi-table td{text-align:left;padding:7px 6px;border-bottom:1px solid #f1f5f9;vertical-align:top}
.hi-table th{color:#6b7280;font-weight:600;font-size:12px;background:#f9fafb}
.hi-file{max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hi-empty{text-align:center;color:#6b7280;padding:14px}
.hi-tag{display:inline-block;font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap}
.hi-tag.ok{background:#ecfdf3;color:#15803d}.hi-tag.upd{background:#e6f0fb;color:#1d4f8c}
.hi-tag.warn{background:#fff7e6;color:#b45309}.hi-tag.err{background:#fef2f2;color:#b91c1c}.hi-tag.grey{background:#f3f4f6;color:#4b5563}
.hi-msg{border-radius:8px;padding:10px 12px;background:#ecfdf3;color:#166534;border:1px solid #bbf7d0}
.hi-msg.err{background:#fef2f2;color:#991b1b;border-color:#fecaca}
.hi-err{color:#b91c1c;margin-top:8px}
`;
