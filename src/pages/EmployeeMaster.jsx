import { useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

import { AppShell } from "@/components/appraisal/AppShell";

import { FIELD_DEFS, INITIAL_EMPLOYEES } from "@/lib/employee-master-data";

import {
  findFieldForHeader,
  normalizeEligibleValue,
  parseCsv,
  csvRowsToObjects,
} from "@/lib/employee-master-utils";

import {
  downloadRosterTemplate,
  downloadRosterData,
  downloadEligibilityTemplate,
  exportEligibilityData,
} from "@/lib/employee-master-export";

import { EmployeeMasterToolbar } from "@/components/employee-master/EmployeeMasterToolbar";
import { EmployeeRosterTable } from "@/components/employee-master/EmployeeRosterTable";
import { EligibilityCriteria } from "@/components/employee-master/EligibilityCriteria";
import { EligibilityList } from "@/components/employee-master/EligibilityList";
import { EligibilityModal } from "@/components/employee-master/EligibilityModal";
import { ImportPreviewModal } from "@/components/employee-master/ImportPreviewModal";

import "@/styles/employee-master.css";

export function EmployeeMaster() {
  const [employees, setEmployees] = useState(INITIAL_EMPLOYEES);

  const [activeTab, setActiveTab] = useState("roster");

  const [search, setSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState("All");

  const [rosterFilters, setRosterFilters] = useState({});

  const [eligibilitySearch, setEligibilitySearch] = useState("");

  const [eligibilityFilters, setEligibilityFilters] = useState({});

  const [excludedEmployees, setExcludedEmployees] = useState([]);

  const [banner, setBanner] = useState(null);

  const [eligibilityEmployee, setEligibilityEmployee] = useState(null);

  const [previewOpen, setPreviewOpen] = useState(false);

  const [previewChanges, setPreviewChanges] = useState([]);

  const [pendingImportType, setPendingImportType] = useState(null);

  const fileInputRef = useRef(null);

  const total = employees.length;

  const active = employees.filter(
    (employee) => employee.status === "Active",
  ).length;

  const inactive = total - active;

  const filteredRosterEmployees = useMemo(() => {
    return employees.filter((employee) => {
      if (statusFilter !== "All" && employee.status !== statusFilter) {
        return false;
      }

      const term = search.trim().toLowerCase();

      if (!term) {
        return true;
      }

      return (
        employee.name.toLowerCase().includes(term) ||
        employee.empId.toLowerCase().includes(term) ||
        employee.organization.toLowerCase().includes(term)
      );
    });
  }, [employees, search, statusFilter]);

  const showBanner = (title, body, error = false) => {
    setBanner({
      title,
      body,
      error,
    });
  };

  const readFile = async (file) => {
    const extension = file.name.split(".").pop()?.toLowerCase();

    if (extension === "csv") {
      const text = await file.text();

      return csvRowsToObjects(parseCsv(text));
    }

    const XLSX = await import("xlsx");

    const buffer = await file.arrayBuffer();

    const workbook = XLSX.read(buffer, {
      type: "array",
    });

    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

    return XLSX.utils.sheet_to_json(firstSheet, {
      defval: "",
    });
  };

  const buildRosterImportChanges = (rows) => {
    const changes = [];

    rows.forEach((row) => {
      const mapped = {};

      Object.entries(row).forEach(([header, value]) => {
        const field = findFieldForHeader(header);

        if (field) {
          mapped[field.key] = String(value ?? "").trim();
        }
      });

      if (!mapped.empId) {
        return;
      }

      const existing = employees.find(
        (employee) =>
          employee.empId.toLowerCase() === mapped.empId.toLowerCase(),
      );

      const fields = {};

      FIELD_DEFS.forEach((field) => {
        if (
          field.key === "empId" ||
          mapped[field.key] === undefined ||
          mapped[field.key] === ""
        ) {
          return;
        }

        if (
          !existing ||
          String(existing[field.key] ?? "") !== mapped[field.key]
        ) {
          fields[field.key] = mapped[field.key];
        }
      });

      if (!existing || Object.keys(fields).length) {
        changes.push({
          empId: mapped.empId,
          name: mapped.name || existing?.name || "",
          fields,
          isNew: !existing,
        });
      }
    });

    return changes;
  };

  const buildEligibilityImportChanges = (rows) => {
    const changes = [];

    rows.forEach((row) => {
      const empId = String(
        row["Emp ID"] ?? row["Employee ID"] ?? row.EmpID ?? "",
      ).trim();

      if (!empId) {
        return;
      }

      const eligible = normalizeEligibleValue(row.Eligible);

      if (!eligible) {
        return;
      }

      const reason = String(row.Reason ?? "").trim();

      const employee = employees.find(
        (item) => item.empId.toLowerCase() === empId.toLowerCase(),
      );

      if (!employee || employee.status !== "Active") {
        return;
      }

      if (
        employee.eligible !== eligible ||
        employee.eligibleReason !== reason
      ) {
        changes.push({
          empId: employee.empId,
          name: employee.name,
          fields: {
            Eligible: eligible === "Yes" ? "Eligible" : "Not Eligible",
            Reason: reason || "—",
          },
        });
      }
    });

    return changes;
  };

  const handleRosterFile = async (file) => {
    try {
      const rows = await readFile(file);

      const changes = buildRosterImportChanges(rows);

      setPendingImportType("roster");
      setPreviewChanges(changes);
      setPreviewOpen(true);
    } catch (error) {
      showBanner(
        "Import failed",
        error.message || "Unable to read the file.",
        true,
      );
    }
  };

  const handleEligibilityFile = async (file) => {
    try {
      const rows = await readFile(file);

      const changes = buildEligibilityImportChanges(rows);

      setPendingImportType("eligibility");

      setPreviewChanges(changes);
      setPreviewOpen(true);
    } catch (error) {
      showBanner(
        "Import failed",
        error.message || "Unable to read the file.",
        true,
      );
    }
  };

  const confirmImport = () => {
    if (pendingImportType === "eligibility") {
      setEmployees((current) =>
        current.map((employee) => {
          const change = previewChanges.find(
            (item) => item.empId === employee.empId,
          );

          if (!change) {
            return employee;
          }

          return {
            ...employee,
            eligible: change.fields.Eligible === "Eligible" ? "Yes" : "No",
            eligibleReason:
              change.fields.Reason === "—" ? "" : change.fields.Reason,
            manualOverride: true,
          };
        }),
      );

      showBanner(
        "Eligibility imported",
        `${previewChanges.length} employee record(s) updated.`,
      );
    } else {
      setEmployees((current) => {
        const next = [...current];

        previewChanges.forEach((change) => {
          const index = next.findIndex(
            (employee) => employee.empId === change.empId,
          );

          if (index === -1) {
            next.push({
              empId: change.empId,
              name: change.name || "",
              designation: change.fields.designation || "",
              organization: change.fields.organization || "",
              doj: change.fields.doj || "",
              totalExp: change.fields.totalExp || "",
              reportingManager: change.fields.reportingManager || "",
              compManager: change.fields.compManager || "",
              superManager: change.fields.superManager || "",
              appraiser: change.fields.appraiser || "",
              managerMail: change.fields.managerMail || "",
              superManagerMail: change.fields.superManagerMail || "",
              status: change.fields.status || "Active",
              eligible: "Yes",
              eligibleReason: "",
              manualOverride: false,
            });

            return;
          }

          next[index] = {
            ...next[index],
            ...change.fields,
          };
        });

        return next;
      });

      showBanner(
        "Employee data imported",
        `${previewChanges.length} employee record(s) updated.`,
      );
    }

    setPreviewOpen(false);
    setPreviewChanges([]);
    setPendingImportType(null);
  };

  const applyEligibilityCriteria = ({
    departments,
    designations,
    excludedEmployees: excluded,
    cutoffDate,
  }) => {
    let evaluated = 0;

    setEmployees((current) =>
      current.map((employee) => {
        if (employee.status !== "Active" || employee.manualOverride) {
          return employee;
        }

        evaluated += 1;

        const reasons = [];

        if (departments.length && departments.includes(employee.organization)) {
          reasons.push("Department excluded");
        }

        if (
          designations.length &&
          designations.includes(employee.designation)
        ) {
          reasons.push("Designation excluded");
        }

        if (excluded.includes(employee.empId)) {
          reasons.push("Employee excluded");
        }

        if (cutoffDate && employee.doj > cutoffDate) {
          reasons.push("Joined after cutoff date");
        }

        if (reasons.length) {
          return {
            ...employee,
            eligible: "No",
            eligibleReason: reasons.join(", "),
          };
        }

        return {
          ...employee,
          eligible: "Yes",
          eligibleReason: "",
        };
      }),
    );

    showBanner(
      "Criteria applied",
      `${evaluated} active employee(s) evaluated. Manual overrides were left unchanged.`,
    );
  };

  const saveEligibility = ({ empId, eligible, eligibleReason }) => {
    setEmployees((current) =>
      current.map((employee) =>
        employee.empId === empId
          ? {
              ...employee,
              eligible,
              eligibleReason,
              manualOverride: true,
            }
          : employee,
      ),
    );

    setEligibilityEmployee(null);

    showBanner("Eligibility updated", `${empId} was manually updated.`);
  };

  return (
    <AppShell>
      <div className="employee-master-page">
        <div className="em-page-heading">
          <div>
            <h2>Employee Master</h2>

            <p>Roster of record — independent of any appraisal cycle</p>
          </div>

          <div className="em-page-stats">
            <div>
              <span>Total</span>
              <strong>{total}</strong>
            </div>

            <div>
              <span>Active</span>
              <strong className="active">{active}</strong>
            </div>

            <div>
              <span>Inactive</span>
              <strong className="inactive">{inactive}</strong>
            </div>
          </div>
        </div>

        <div className="em-tabs">
          <button
            type="button"
            className={activeTab === "roster" ? "active" : ""}
            onClick={() => setActiveTab("roster")}
          >
            Employee Master
          </button>

          <button
            type="button"
            className={activeTab === "eligibility" ? "active" : ""}
            onClick={() => setActiveTab("eligibility")}
          >
            Eligibility List
          </button>
        </div>

        {banner && (
          <div className={`em-banner ${banner.error ? "error" : ""}`}>
            <div>
              {banner.error ? (
                <AlertCircle size={17} />
              ) : (
                <CheckCircle2 size={17} />
              )}
            </div>

            <div>
              <strong>{banner.title}</strong>
              <span>{banner.body}</span>
            </div>

            <button type="button" onClick={() => setBanner(null)}>
              ×
            </button>
          </div>
        )}

        {activeTab === "roster" && (
          <div className="em-tab-content">
            <EmployeeMasterToolbar
              search={search}
              setSearch={setSearch}
              statusFilter={statusFilter}
              setStatusFilter={setStatusFilter}
              onDownloadTemplate={downloadRosterTemplate}
              onUpload={() => fileInputRef.current?.click()}
              onDownloadData={() => downloadRosterData(filteredRosterEmployees)}
            />

            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];

                if (file) {
                  handleRosterFile(file);
                }

                event.target.value = "";
              }}
            />

            <EmployeeRosterTable
              rows={filteredRosterEmployees}
              filters={rosterFilters}
              setFilters={setRosterFilters}
            />

            <div className="em-footer-note">
              Employee Master is the roster of record. Appraisal-cycle data
              should reference these employees.
            </div>
          </div>
        )}

        {activeTab === "eligibility" && (
          <div className="em-tab-content">
            <EligibilityCriteria
              employees={employees}
              excludedEmployees={excludedEmployees}
              setExcludedEmployees={setExcludedEmployees}
              onApply={applyEligibilityCriteria}
            />

            <EligibilityList
              employees={employees}
              search={eligibilitySearch}
              setSearch={setEligibilitySearch}
              filters={eligibilityFilters}
              setFilters={setEligibilityFilters}
              onChangeEligibility={setEligibilityEmployee}
              onDownloadTemplate={downloadEligibilityTemplate}
              onImport={handleEligibilityFile}
              onExport={exportEligibilityData}
            />
          </div>
        )}

        <EligibilityModal
          employee={eligibilityEmployee}
          onClose={() => setEligibilityEmployee(null)}
          onSave={saveEligibility}
        />

        <ImportPreviewModal
          open={previewOpen}
          title={
            pendingImportType === "eligibility"
              ? "Eligibility Import Preview"
              : "Employee Import Preview"
          }
          changes={previewChanges}
          onCancel={() => {
            setPreviewOpen(false);
            setPreviewChanges([]);
            setPendingImportType(null);
          }}
          onConfirm={confirmImport}
        />
      </div>
    </AppShell>
  );
}
