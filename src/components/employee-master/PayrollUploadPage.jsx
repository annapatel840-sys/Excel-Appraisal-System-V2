import { useState } from "react";

const SYSTEM_FIELDS = [
  { key: "empId", label: "Employee ID", cat: "key", required: true },
  { key: "empName", label: "Employee (Name)", cat: "master" },
  { key: "designation", label: "Designation", cat: "master" },
  { key: "compManager", label: "Comp. Manager", cat: "master" },
  { key: "superManager", label: "Super Manager", cat: "master" },
  { key: "managerMail", label: "Manager Mail", cat: "master" },
  { key: "superManagerMail", label: "Super Manager Mail", cat: "master" },
  { key: "appraiser", label: "Appraiser / Super Manager", cat: "master" },
  { key: "basePay", label: "Current Annual Base Pay", cat: "master" },
  { key: "targetPB", label: "Target PB Allocated for May", cat: "master" },
  { key: "rbPaid", label: "RB to be Paid", cat: "input" },
  { key: "joiningBonus", label: "Joining Bonus", cat: "input" },
  { key: "rbMonth", label: "Mo (RB)", cat: "input" },
  { key: "pbPaid", label: "PB to be Paid", cat: "input" },
  { key: "pbMonth", label: "Mo (PB)", cat: "input" },
  { key: "allocPB", label: "Allocated PB Amount", cat: "input" },
  { key: "allocInst", label: "Inst. (Allocated PB)", cat: "input" },
  { key: "newPB", label: "New PB to be Offered", cat: "input" },
  { key: "newPBInst", label: "Inst. (New PB)", cat: "input" },
  { key: "newRB", label: "New RB", cat: "input" },
  { key: "hikeAmt", label: "Hike Amount", cat: "input" },
  { key: "hikePct", label: "Hike %", cat: "input" },
  { key: "tpbNext", label: "Target PB for Next Year", cat: "input" },
  { key: "promo", label: "Promo? (Yes/No)", cat: "input" },
  { key: "newTitle", label: "New Title", cat: "input" },
  { key: "remarks", label: "Remarks", cat: "input" },
];

const FILE_COLUMNS = [
  { name: "Emp Code", guess: "empId" },
  { name: "Employee Name", guess: "empName" },
  { name: "Designation", guess: "designation" },
  { name: "Comp Manager", guess: "compManager" },
  { name: "Super Manager", guess: "superManager" },
  { name: "Mgr Email", guess: "" },
  { name: "Super Mgr Email", guess: "superManagerMail" },
  { name: "Appraiser/Super Mgr", guess: "appraiser" },
  { name: "Base Pay (Annual)", guess: "basePay" },
  { name: "PB Target (May)", guess: "targetPB" },
  { name: "RB Paid", guess: "rbPaid" },
  { name: "Joining Bonus", guess: "joiningBonus" },
  { name: "RB Month", guess: "rbMonth" },
  { name: "PB Paid", guess: "pbPaid" },
  { name: "PB Month", guess: "pbMonth" },
  { name: "PB Allocated Amt", guess: "allocPB" },
  { name: "PB Inst", guess: "allocInst" },
  { name: "New PB Offered", guess: "newPB" },
  { name: "New PB Inst", guess: "newPBInst" },
  { name: "Revised RB", guess: "" },
  { name: "Hike Amt", guess: "hikeAmt" },
  { name: "Hike %", guess: "hikePct" },
  { name: "Target PB Next Yr", guess: "tpbNext" },
  { name: "Promotion (Y/N)", guess: "promo" },
  { name: "New Designation", guess: "newTitle" },
  { name: "Remarks", guess: "remarks" },
  { name: "Notes", guess: "" },
];

function mk(overrides) {
  const base = {
    empId: "E10231",
    empName: "A. Kumar",
    designation: "Sr. Consultant",
    compManager: "R. Iyer",
    superManager: "V. Rao",
    managerMail: "v.rao@r2c.com",
    superManagerMail: "v.rao@r2c.com",
    appraiser: "V. Rao",
    basePay: 6200000,
    targetPB: 620000,
    rbPaid: 300000,
    rbMonth: "Apr",
    joiningBonus: 0,
    pbPaid: 250000,
    pbMonth: "Apr",
    allocPB: 600000,
    allocInst: 1,
    newPB: 0,
    newPBInst: 0,
    newRB: 180000,
    hikeAmt: 84000,
    hikePct: 6,
    tpbNext: 640000,
    promo: "No",
    newTitle: "",
    remarks: "",
  };
  return { ...base, ...overrides };
}

const CLEAN_ROWS = [
  { row: 2, ok: true, ...mk({}) },
  {
    row: 3,
    ok: true,
    ...mk({
      empId: "E10232",
      empName: "S. Nair",
      basePay: 7450000,
      targetPB: 745000,
      hikeAmt: 96000,
    }),
  },
  {
    row: 4,
    ok: true,
    ...mk({
      empId: "E10233",
      empName: "P. Das",
      basePay: 5120000,
      targetPB: 512000,
      hikeAmt: 60000,
    }),
  },
  {
    row: 5,
    ok: true,
    ...mk({
      empId: "E10234",
      empName: "M. Iyer",
      basePay: 8900000,
      targetPB: 890000,
      promo: "Yes",
      newTitle: "Principal Consultant",
      hikeAmt: 112000,
    }),
  },
  {
    row: 6,
    ok: true,
    ...mk({
      empId: "E10235",
      empName: "K. Reddy",
      basePay: 4680000,
      targetPB: 468000,
      joiningBonus: 150000,
      hikeAmt: 54000,
    }),
  },
];

const ERROR_ROWS = [
  { row: 2, ok: true, ...mk({}) },
  {
    row: 3,
    ok: false,
    reason: "Employee ID not found in Employee Master",
    badFields: ["empId"],
    ...mk({
      empId: "E10236",
      empName: "New Joiner",
      basePay: 5900000,
      targetPB: 590000,
    }),
  },
  {
    row: 4,
    ok: true,
    ...mk({
      empId: "E10233",
      empName: "P. Das",
      basePay: 5120000,
      targetPB: 512000,
      hikeAmt: 60000,
    }),
  },
  {
    row: 5,
    ok: false,
    reason:
      "Duplicate Employee ID within this file for the selected cycle (row 4 already covers E10233)",
    badFields: ["empId"],
    ...mk({
      empId: "E10233",
      empName: "P. Das",
      basePay: 5120000,
      targetPB: 512000,
      hikeAmt: 60000,
    }),
  },
  {
    row: 6,
    ok: false,
    reason: "Missing required field: Employee ID",
    badFields: ["empId"],
    ...mk({
      empId: "",
      empName: "M. Iyer",
      basePay: 8900000,
      targetPB: 890000,
      hikeAmt: 112000,
    }),
  },
  {
    row: 7,
    ok: false,
    reason:
      "Existing record conflict — this Employee ID already has a manual edit in the open cycle",
    badFields: ["empId"],
    ...mk({
      empId: "E10237",
      empName: "R. Bose",
      basePay: 5300000,
      targetPB: 530000,
      hikeAmt: 58000,
    }),
  },
  {
    row: 8,
    ok: false,
    reason: "Base Pay must be a positive number",
    badFields: ["basePay"],
    ...mk({
      empId: "E10238",
      empName: "T. Nambiar",
      basePay: -50000,
      targetPB: 500000,
      hikeAmt: 45000,
    }),
  },
  {
    row: 9,
    ok: true,
    ...mk({
      empId: "E10235",
      empName: "K. Reddy",
      basePay: 4680000,
      targetPB: 468000,
      hikeAmt: 54000,
    }),
  },
];

function fmt(v, field) {
  if (v === null || v === undefined || v === "")
    return field && field.required ? "—" : "—";
  if (typeof v === "number") return "₹" + v.toLocaleString("en-IN");
  return v;
}
function nextBatchId() {
  return "BATCH-2026Q3-" + String(Math.floor(Math.random() * 900) + 100);
}

const INITIAL_HISTORY = [
  {
    batchId: "BATCH-2026Q3-0041",
    file: "payroll_new_joiners_sep.xlsx",
    uploaded: "18 Sep 2026, 11:20",
    succeeded: 27,
    failed: 0,
  },
  {
    batchId: "BATCH-2026Q3-0038",
    file: "payroll_batch2.xlsx",
    uploaded: "15 Sep 2026, 16:04",
    succeeded: 19,
    failed: 4,
  },
  {
    batchId: "BATCH-2026Q2-0117",
    file: "payroll_q2_final.xlsx",
    uploaded: "30 Jun 2026, 09:47",
    succeeded: 12,
    failed: 0,
  },
];

export function PayrollUploadPage() {
  const [selectedCycle, setSelectedCycle] = useState("");
  const [step, setStep] = useState(1); // 1 upload, 2 map, 3 validate
  const [currentRows, setCurrentRows] = useState([]);
  const [mapping, setMapping] = useState({});
  const [batchId, setBatchId] = useState("");
  const [rowStatus, setRowStatus] = useState({}); // row -> "pending" | "locked" | "uploaded"
  const [outcome, setOutcome] = useState(null);
  const [committing, setCommitting] = useState(false);
  const [history, setHistory] = useState(INITIAL_HISTORY);

  const isClosedCycle = selectedCycle === "FY25-Q4";

  const resetAll = () => {
    setStep(1);
    setCurrentRows([]);
    setOutcome(null);
    setRowStatus({});
  };

  const runSim = (kind) => {
    setCurrentRows(kind === "clean" ? CLEAN_ROWS : ERROR_ROWS);
    const initMap = {};
    FILE_COLUMNS.forEach((c) => {
      initMap[c.name] = c.guess;
    });
    setMapping(initMap);
    setStep(2);
  };

  const missingRequired = SYSTEM_FIELDS.filter(
    (f) => f.required && !Object.values(mapping).includes(f.key),
  );

  const goToValidate = () => {
    const id = nextBatchId();
    setBatchId(id);
    const initStatus = {};
    currentRows.forEach((r) => {
      initStatus[r.row] = "pending";
    });
    setRowStatus(initStatus);
    setOutcome(null);
    setStep(3);
  };

  const validCount = currentRows.filter((r) => r.ok !== false).length;
  const invalidCount = currentRows.length - validCount;

  const commitBatch = () => {
    setCommitting(true);
    const validRows = currentRows.filter((r) => r.ok !== false);

    validRows.forEach((r, i) => {
      setTimeout(() => {
        setRowStatus((prev) => ({ ...prev, [r.row]: "locked" }));
      }, i * 100);
    });

    setTimeout(
      () => {
        setRowStatus((prev) => {
          const next = { ...prev };
          validRows.forEach((r) => {
            next[r.row] = "uploaded";
          });
          return next;
        });

        const failed = currentRows.filter((r) => r.ok === false).length;
        const succeeded = validRows.length;
        const total = currentRows.length;

        setOutcome({ succeeded, failed, total, batchId });
        setCommitting(false);

        setHistory((prev) => [
          {
            batchId,
            file: "payroll_upload_q3.xlsx",
            uploaded: "Just now",
            succeeded,
            failed,
          },
          ...prev,
        ]);
      },
      validRows.length * 100 + 260,
    );
  };

  return (
    <div className="pu-root">
      <style>{PAYROLL_UPLOAD_CSS}</style>
      <div className="pu-app">
        <div className="pu-crumb">
          Compensation Admin / Payroll / <b>Upload</b>
        </div>

        <div className="pu-topbar">
          <div>
            <h1>Payroll upload</h1>
            <p className="pu-sub">
              Bulk alternative to typing appraisal-sheet cells by hand — carries
              Master + Input columns only. Calculated columns are never
              uploaded; the DB recomputes them after write.
            </p>
          </div>
        </div>

        {/* Step 0: cycle */}
        <div className="pu-card">
          <div className="pu-card-head">
            <div>
              <h2>Choose appraisal cycle</h2>
              <div className="pu-meta">
                Every row in this upload will be written against the cycle
                selected here — Cycle is no longer read from the file itself.
              </div>
            </div>
          </div>
          <div className="pu-card-body">
            <select
              className="pu-cycle-select"
              value={selectedCycle}
              onChange={(e) => {
                setSelectedCycle(e.target.value);
                resetAll();
              }}
            >
              <option value="">— Select appraisal cycle —</option>
              <option value="FY26-Q3">FY26-Q3 (Open)</option>
              <option value="Mid-Year Review FY25-26">
                Mid-Year Review FY25-26 (Open)
              </option>
              <option value="FY25-Q4">
                FY25-Q4 (Closed — corrections only)
              </option>
            </select>
            {isClosedCycle && (
              <div className="pu-cycle-warning">
                This cycle is closed — only correction uploads are expected
                here.
              </div>
            )}
          </div>
        </div>

        {selectedCycle && (
          <>
            <p className="pu-toolbar-note">
              Mock screen — simulates parsing, since there's no real file behind
              it.
            </p>
            <div className="pu-sim-toggle">
              <button
                className="pu-btn pu-btn-ghost pu-btn-sm"
                onClick={() => runSim("clean")}
              >
                Simulate upload — clean file
              </button>
              <button
                className="pu-btn pu-btn-ghost pu-btn-sm"
                onClick={() => runSim("errors")}
              >
                Simulate upload — file with some bad rows
              </button>
              <button
                className="pu-btn pu-btn-ghost pu-btn-sm"
                onClick={resetAll}
              >
                Reset
              </button>
            </div>

            <div className="pu-stepper">
              {[1, 2, 3].map((n, i) => (
                <div key={n} style={{ display: "flex", alignItems: "center" }}>
                  <div
                    className={`pu-step ${step === n ? "active" : ""} ${step > n ? "done" : ""}`}
                  >
                    <span className="pu-num">{n}</span>
                    {n === 1
                      ? "Select file"
                      : n === 2
                        ? "Map fields"
                        : "Validate & upload"}
                  </div>
                  {i < 2 && <div className="pu-step-sep" />}
                </div>
              ))}
            </div>

            {/* Step 1 */}
            {step === 1 && (
              <div className="pu-card">
                <div className="pu-card-head">
                  <div>
                    <h2>Select file</h2>
                    <div className="pu-meta">Cycle: {selectedCycle}</div>
                  </div>
                  <button
                    className="pu-link-btn"
                    onClick={() =>
                      alert(
                        "Would download the Payroll upload template — all Master + Input columns as headers, no calculated columns.",
                      )
                    }
                  >
                    Download template ↓
                  </button>
                </div>
                <div className="pu-card-body">
                  <div className="pu-dropzone">
                    <strong>Drag a payroll file here, or browse</strong>
                    <p>
                      .xlsx or .csv · headers can use any names — you'll map
                      them next
                    </p>
                    <div className="pu-dz-actions">
                      <button
                        className="pu-btn pu-btn-primary pu-btn-sm"
                        onClick={() => runSim("clean")}
                      >
                        Browse files
                      </button>
                    </div>
                  </div>
                  <div className="pu-upload-meta-row">
                    <span>
                      Module: <b>Payroll</b>
                    </span>
                    <span>
                      Uniqueness key: <b>Employee ID + Cycle</b>
                    </span>
                    <span>
                      Uploaded by: <b>HR — N. Subramanian</b>
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Step 2 */}
            {step === 2 && (
              <div className="pu-card">
                <div className="pu-card-head">
                  <div>
                    <h2>Map fields</h2>
                    <div className="pu-meta">
                      payroll_upload_q3.xlsx · {FILE_COLUMNS.length} columns
                      detected
                    </div>
                  </div>
                  {missingRequired.length > 0 && (
                    <span
                      className="pu-link-btn"
                      style={{ color: "var(--pu-warn)", cursor: "default" }}
                    >
                      {missingRequired.length} required field
                      {missingRequired.length > 1 ? "s" : ""} unmapped
                    </span>
                  )}
                </div>
                <div className="pu-card-body">
                  <div className="pu-map-legend">
                    <span className="pu-sw">
                      <span
                        className="pu-chip"
                        style={{ background: "var(--pu-master)" }}
                      />
                      Master data
                    </span>
                    <span className="pu-sw">
                      <span
                        className="pu-chip"
                        style={{ background: "var(--pu-input-c)" }}
                      />
                      Input field
                    </span>
                    <span className="pu-sw">
                      <span className="pu-req-mark" style={{ marginLeft: 0 }}>
                        *
                      </span>
                      required (part of the uniqueness key)
                    </span>
                  </div>
                  <div className="pu-map-scroll">
                    <table className="pu-map">
                      <thead>
                        <tr>
                          <th>Column in file</th>
                          <th>Maps to</th>
                        </tr>
                      </thead>
                      <tbody>
                        {FILE_COLUMNS.map((col) => (
                          <tr key={col.name}>
                            <td className="pu-fromcol">{col.name}</td>
                            <td>
                              <select
                                className={`pu-mapsel ${mapping[col.name] ? "" : "unmapped"}`}
                                value={mapping[col.name] || ""}
                                onChange={(e) =>
                                  setMapping((prev) => ({
                                    ...prev,
                                    [col.name]: e.target.value,
                                  }))
                                }
                              >
                                <option value="">— Ignore this column —</option>
                                {SYSTEM_FIELDS.map((f) => (
                                  <option key={f.key} value={f.key}>
                                    {f.label}
                                    {f.required ? " *" : ""}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="pu-calc-footnote">
                    Calculated columns aren't offered here — Total of PB, Total
                    Bonus, Total CTC with Rewards, Total/Bonus/Rewards Hike
                    Amount & %, and New Base Salary are always derived by the DB
                    after a write, never accepted from a file.
                  </div>
                </div>
                <div className="pu-commit-footer">
                  <span className="pu-hint">
                    {missingRequired.length
                      ? `${missingRequired.map((f) => f.label).join(" and ")} must be mapped before continuing.`
                      : "All required fields are mapped. Unmapped optional columns will be ignored on upload."}
                  </span>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      className="pu-btn pu-btn-ghost pu-btn-sm"
                      onClick={resetAll}
                    >
                      Discard
                    </button>
                    <button
                      className="pu-btn pu-btn-primary"
                      disabled={missingRequired.length > 0}
                      onClick={goToValidate}
                    >
                      Continue to validation
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3 */}
            {step === 3 && (
              <div className="pu-card">
                <div className="pu-card-head">
                  <div>
                    <h2>Validate & upload</h2>
                    <div className="pu-meta">
                      <span className="pu-batch-tag">{batchId}</span>{" "}
                      &nbsp;·&nbsp; payroll_upload_q3.xlsx
                    </div>
                  </div>
                </div>
                <div className="pu-summary-bar">
                  <span className="pu-stat-item">
                    <span
                      className="pu-swatch"
                      style={{ background: "var(--pu-slate-soft)" }}
                    />
                    {currentRows.length} rows read
                  </span>
                  <span className="pu-stat-item">
                    <span
                      className="pu-swatch"
                      style={{ background: "var(--pu-success)" }}
                    />
                    <b>{validCount}</b> will upload
                  </span>
                  <span className="pu-stat-item">
                    <span
                      className="pu-swatch"
                      style={{ background: "var(--pu-error)" }}
                    />
                    <b>{invalidCount}</b> will fail
                  </span>
                </div>
                <div className="pu-grid-scroll">
                  <table className="pu-grid">
                    <thead>
                      <tr>
                        <th>Row</th>
                        <th>Status</th>
                        <th>Cycle</th>
                        {SYSTEM_FIELDS.map((f) => (
                          <th key={f.key}>
                            {f.label}
                            {f.required && (
                              <span className="pu-req-mark">*</span>
                            )}
                            {f.cat === "master" && " M"}
                            {f.cat === "input" && " I"}
                          </th>
                        ))}
                        <th>Reason (if failed)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentRows.map((r) => {
                        const status =
                          rowStatus[r.row] ||
                          (r.ok === false ? "invalid" : "pending");
                        return (
                          <tr
                            key={r.row}
                            className={
                              r.ok === false
                                ? "pu-row-invalid"
                                : status === "uploaded"
                                  ? "pu-row-written"
                                  : ""
                            }
                          >
                            <td className="pu-rownum">{r.row}</td>
                            <td>
                              {r.ok === false ? (
                                <span className="pu-status-chip pu-status-invalid">
                                  <span className="pu-dot" />
                                  Will fail
                                </span>
                              ) : status === "uploaded" ? (
                                <span className="pu-status-chip pu-status-valid">
                                  <span className="pu-dot" />
                                  Uploaded
                                </span>
                              ) : status === "locked" ? (
                                <span className="pu-status-chip pu-status-locked">
                                  <span className="pu-dot" />
                                  Locked
                                </span>
                              ) : (
                                <span className="pu-status-chip pu-status-pending">
                                  <span className="pu-dot" />
                                  Ready
                                </span>
                              )}
                            </td>
                            <td>{selectedCycle}</td>
                            {SYSTEM_FIELDS.map((f) => {
                              const isBad =
                                r.badFields && r.badFields.includes(f.key);
                              const cls =
                                (typeof r[f.key] === "number"
                                  ? "pu-num "
                                  : f.key === "empId"
                                    ? "pu-idcell "
                                    : "") + (isBad ? "pu-cell-error" : "");
                              return (
                                <td key={f.key} className={cls}>
                                  {fmt(r[f.key], f)}
                                </td>
                              );
                            })}
                            <td className="pu-reason-cell">{r.reason || ""}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {outcome && (
                  <div
                    className={`pu-banner ${outcome.failed === 0 ? "ok" : "mixed"}`}
                  >
                    <span className="pu-icon">
                      {outcome.failed === 0 ? "✓" : "⚠"}
                    </span>
                    <div className="pu-text">
                      <b>
                        {outcome.failed === 0
                          ? `${outcome.succeeded} of ${outcome.total} rows uploaded successfully`
                          : `${outcome.succeeded} of ${outcome.total} rows uploaded successfully. ${outcome.failed} failed — see failure report.`}
                      </b>
                      <span>
                        Written under{" "}
                        <span className="pu-batch-tag">{outcome.batchId}</span>.{" "}
                        {outcome.failed === 0
                          ? "Total CTC and other calculated columns have been recomputed by the DB. This batch now appears in Upload history and can be undone as a whole."
                          : "Failed rows were never touched — fix and re-upload them as a new batch when ready."}
                      </span>
                    </div>
                    {outcome.failed > 0 && (
                      <div className="pu-actions">
                        <button
                          className="pu-btn pu-btn-ghost pu-btn-sm"
                          onClick={() =>
                            alert(
                              `Would download failure_report_${outcome.batchId}.csv`,
                            )
                          }
                        >
                          Download failure report
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <div className="pu-commit-footer">
                  <span className="pu-hint">
                    Each row is validated on its own. Valid rows write
                    immediately; failed rows don't — both are reported together.
                  </span>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      className="pu-btn pu-btn-ghost pu-btn-sm"
                      onClick={resetAll}
                    >
                      Discard batch
                    </button>
                    <button
                      className="pu-btn pu-btn-primary"
                      disabled={validCount === 0 || committing || !!outcome}
                      onClick={commitBatch}
                    >
                      {outcome
                        ? "Uploaded"
                        : committing
                          ? "Locking rows…"
                          : "Upload valid rows"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* History */}
        <div className="pu-card">
          <div className="pu-card-head">
            <div>
              <h2>Upload history</h2>
              <div className="pu-meta">
                Payroll module only — distinct from this module's Audit Trail
              </div>
            </div>
          </div>
          <table className="pu-hist">
            <thead>
              <tr>
                <th>Batch ID</th>
                <th>File</th>
                <th>Uploaded</th>
                <th>Succeeded</th>
                <th>Failed</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.batchId + h.uploaded}>
                  <td>
                    <span className="pu-batch-tag">{h.batchId}</span>
                  </td>
                  <td>{h.file}</td>
                  <td>{h.uploaded}</td>
                  <td>{h.succeeded}</td>
                  <td>{h.failed}</td>
                  <td>
                    <div className="pu-hist-actions">
                      {h.failed > 0 && (
                        <button
                          className="pu-fail-link"
                          onClick={() =>
                            alert(
                              `Would open the retained failure report for ${h.batchId}.`,
                            )
                          }
                        >
                          View report ({h.failed})
                        </button>
                      )}
                      {h.succeeded > 0 && (
                        <button
                          className="pu-btn pu-btn-danger-ghost pu-btn-sm"
                          onClick={() =>
                            alert(
                              `Would remove the ${h.succeeded} rows tagged ${h.batchId} and log the undo.`,
                            )
                          }
                        >
                          Undo
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

const PAYROLL_UPLOAD_CSS = `
.pu-root {
  --pu-ink: #161B22; --pu-slate: #4B5563; --pu-slate-soft: #7B8794; --pu-border: #DDE2E8;
  --pu-ground: #FFFFFF; --pu-surface: #F5F7FA; --pu-surface-2: #ECEFF3;
  --pu-accent: #205072; --pu-accent-soft: #E6EEF2;
  --pu-success: #1C7C54; --pu-success-soft: #E7F5EC;
  --pu-error: #B3261E; --pu-error-soft: #FBEAE9;
  --pu-warn: #9A6A16; --pu-warn-soft: #FBF1DE;
  --pu-master: #5B3E96; --pu-master-soft: #EFE9F7;
  --pu-input-c: #1C6E8C; --pu-input-soft: #E4F1F5;
  font-family: "IBM Plex Sans", -apple-system, "Segoe UI", sans-serif;
  background: var(--pu-surface); color: var(--pu-ink); font-size: 14px; line-height: 1.5;
}
.pu-app { max-width: 1280px; margin: 0 auto; padding: 28px 24px 64px; }
.pu-crumb { font-size: 12.5px; color: var(--pu-slate-soft); margin-bottom: 10px; }
.pu-topbar { margin-bottom: 18px; }
.pu-topbar h1 { font-size: 22px; font-weight: 600; margin: 0 0 4px; }
.pu-sub { color: var(--pu-slate); font-size: 13.5px; margin: 0; }
.pu-stepper { display: flex; align-items: center; margin-bottom: 22px; }
.pu-step { display: flex; align-items: center; gap: 9px; color: var(--pu-slate-soft); font-size: 12.8px; font-weight: 600; }
.pu-num { width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid var(--pu-border); display: flex; align-items: center; justify-content: center; font-size: 11.5px; color: var(--pu-slate-soft); flex-shrink: 0; }
.pu-step.active { color: var(--pu-ink); }
.pu-step.active .pu-num { background: var(--pu-accent); border-color: var(--pu-accent); color: #fff; }
.pu-step.done .pu-num { background: var(--pu-success); border-color: var(--pu-success); color: #fff; }
.pu-step.done { color: var(--pu-slate); }
.pu-step-sep { width: 34px; height: 1.5px; background: var(--pu-border); margin: 0 8px; }
.pu-card { background: var(--pu-ground); border: 1px solid var(--pu-border); border-radius: 10px; margin-bottom: 20px; overflow: hidden; }
.pu-card-head { padding: 16px 18px; border-bottom: 1px solid var(--pu-border); display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
.pu-card-head h2 { font-size: 14.5px; font-weight: 600; margin: 0; }
.pu-meta { font-size: 12px; color: var(--pu-slate-soft); margin-top: 2px; }
.pu-card-body { padding: 18px; }
.pu-link-btn { background: none; border: none; color: var(--pu-accent); font: inherit; font-weight: 500; font-size: 12.5px; cursor: pointer; padding: 0; }
.pu-link-btn:hover { text-decoration: underline; }
.pu-cycle-select { width: 100%; max-width: 420px; padding: 9px 12px; border: 1px solid var(--pu-border); border-radius: 6px; font: inherit; font-size: 13.5px; background: var(--pu-ground); color: var(--pu-ink); }
.pu-cycle-warning { margin-top: 10px; font-size: 12px; color: var(--pu-warn); }
.pu-dropzone { border: 1.5px dashed var(--pu-border); border-radius: 8px; padding: 34px 20px; text-align: center; color: var(--pu-slate); background: var(--pu-surface); }
.pu-dropzone strong { color: var(--pu-ink); font-weight: 600; display: block; margin-bottom: 4px; font-size: 14.5px; }
.pu-dropzone p { margin: 4px 0 16px; font-size: 12.5px; color: var(--pu-slate-soft); }
.pu-dz-actions { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
.pu-btn { font: inherit; font-weight: 600; font-size: 13px; cursor: pointer; border-radius: 6px; padding: 9px 16px; border: 1px solid transparent; }
.pu-btn:disabled { opacity: .45; cursor: not-allowed; }
.pu-btn-primary { background: var(--pu-accent); color: #fff; }
.pu-btn-primary:hover:not(:disabled) { background: #1a4159; }
.pu-btn-ghost { background: var(--pu-ground); color: var(--pu-ink); border-color: var(--pu-border); }
.pu-btn-ghost:hover:not(:disabled) { background: var(--pu-surface-2); }
.pu-btn-danger-ghost { background: var(--pu-ground); color: var(--pu-error); border-color: var(--pu-border); }
.pu-btn-danger-ghost:hover:not(:disabled) { background: var(--pu-error-soft); border-color: var(--pu-error); }
.pu-btn-sm { padding: 6px 11px; font-size: 12px; }
.pu-upload-meta-row { display: flex; gap: 22px; margin-top: 14px; flex-wrap: wrap; font-size: 12.5px; color: var(--pu-slate); }
.pu-upload-meta-row b { color: var(--pu-ink); font-weight: 600; }
.pu-map-legend { display: flex; gap: 16px; flex-wrap: wrap; font-size: 12px; color: var(--pu-slate); margin-bottom: 4px; }
.pu-sw { display: inline-flex; align-items: center; gap: 6px; }
.pu-chip { width: 10px; height: 10px; border-radius: 3px; }
.pu-map-scroll { max-height: 420px; overflow: auto; }
table.pu-map { width: 100%; border-collapse: collapse; font-size: 13px; }
table.pu-map th { text-align: left; font-weight: 600; color: var(--pu-slate); font-size: 11.5px; padding: 9px 4px; border-bottom: 1px solid var(--pu-border); background: var(--pu-ground); position: sticky; top: 0; }
table.pu-map td { padding: 8px 4px; border-bottom: 1px solid var(--pu-border); vertical-align: middle; }
.pu-fromcol { font-family: "IBM Plex Mono", monospace; font-size: 12.3px; }
.pu-mapsel { width: 100%; max-width: 340px; font: inherit; font-size: 12.6px; padding: 6px 9px; border-radius: 6px; border: 1px solid var(--pu-border); background: var(--pu-ground); color: var(--pu-ink); }
.pu-mapsel.unmapped { border-color: var(--pu-warn); background: var(--pu-warn-soft); }
.pu-req-mark { color: var(--pu-error); margin-left: 3px; }
.pu-calc-footnote { margin-top: 14px; padding: 10px 12px; background: var(--pu-surface); border-radius: 6px; font-size: 12px; color: var(--pu-slate-soft); }
.pu-summary-bar { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; padding: 14px 18px; border-bottom: 1px solid var(--pu-border); font-size: 13px; color: var(--pu-slate); }
.pu-stat-item { display: flex; align-items: center; gap: 6px; }
.pu-swatch { width: 9px; height: 9px; border-radius: 2px; }
.pu-summary-bar b { color: var(--pu-ink); }
.pu-batch-tag { font-family: "IBM Plex Mono", monospace; font-size: 12px; color: var(--pu-slate); background: var(--pu-surface-2); border-radius: 4px; padding: 2px 7px; }
table.pu-grid { width: max-content; min-width: 100%; border-collapse: collapse; font-size: 12.4px; }
table.pu-grid th { text-align: left; font-weight: 600; color: var(--pu-slate); font-size: 11px; padding: 8px 10px; border-bottom: 1px solid var(--pu-border); background: var(--pu-surface); white-space: nowrap; position: sticky; top: 0; }
table.pu-grid td { padding: 8px 10px; border-bottom: 1px solid var(--pu-border); white-space: nowrap; }
table.pu-grid th:first-child, table.pu-grid td:first-child { position: sticky; left: 0; background: var(--pu-surface); z-index: 1; }
table.pu-grid td:first-child { background: var(--pu-ground); }
.pu-row-invalid td:first-child, .pu-row-invalid td { background: var(--pu-error-soft); }
.pu-row-written td:first-child, .pu-row-written td { background: var(--pu-success-soft); }
.pu-num, .pu-idcell { font-family: "IBM Plex Mono", monospace; font-variant-numeric: tabular-nums; }
.pu-grid-scroll { max-height: 420px; overflow: auto; }
.pu-status-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 11.5px; font-weight: 600; padding: 3px 8px; border-radius: 20px; white-space: nowrap; }
.pu-status-pending { background: var(--pu-surface-2); color: var(--pu-slate); }
.pu-status-valid { background: var(--pu-success-soft); color: var(--pu-success); }
.pu-status-invalid { background: var(--pu-error-soft); color: var(--pu-error); }
.pu-status-locked { background: var(--pu-warn-soft); color: var(--pu-warn); }
.pu-dot { width: 5px; height: 5px; border-radius: 50%; background: currentColor; }
.pu-reason-cell { color: var(--pu-error); font-size: 12px; max-width: 280px; white-space: normal; }
.pu-cell-error { background: var(--pu-error-soft); color: var(--pu-error); font-weight: 600; box-shadow: inset 0 0 0 1px rgba(179,38,30,.35); }
.pu-banner { display: flex; align-items: flex-start; gap: 12px; padding: 14px 18px; border-radius: 8px; margin: 16px 18px; border: 1px solid; }
.pu-banner.ok { background: var(--pu-success-soft); border-color: rgba(28,124,84,.25); }
.pu-banner.mixed { background: var(--pu-warn-soft); border-color: rgba(154,106,22,.3); }
.pu-icon { font-size: 16px; line-height: 1; margin-top: 1px; }
.pu-text b { display: block; font-size: 13.5px; margin-bottom: 2px; color: var(--pu-ink); }
.pu-text span { font-size: 12.5px; color: var(--pu-slate); }
.pu-actions { margin-left: auto; display: flex; gap: 8px; align-items: center; flex-shrink: 0; }
.pu-commit-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; flex-wrap: wrap; }
.pu-hint { font-size: 12px; color: var(--pu-slate-soft); max-width: 60%; }
table.pu-hist { width: 100%; border-collapse: collapse; font-size: 12.8px; }
table.pu-hist th { text-align: left; font-weight: 600; color: var(--pu-slate); font-size: 11.3px; padding: 9px 18px; border-bottom: 1px solid var(--pu-border); background: var(--pu-surface); }
table.pu-hist td { padding: 10px 18px; border-bottom: 1px solid var(--pu-border); vertical-align: middle; }
table.pu-hist tr:last-child td { border-bottom: none; }
.pu-hist-actions { display: flex; gap: 8px; justify-content: flex-end; }
.pu-fail-link { color: var(--pu-error); font-weight: 600; cursor: pointer; background: none; border: none; font: inherit; font-size: 12.5px; padding: 0; }
.pu-fail-link:hover { text-decoration: underline; }
.pu-toolbar-note { font-size: 12px; color: var(--pu-slate-soft); margin: -6px 0 14px; }
.pu-sim-toggle { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px; }
`;
