import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

import { AppShell } from "@/components/appraisal/AppShell";

import {
  FIELD_DEFS,
  fetchEmployeeMasterEmployees,
  updateEmployeeMasterEmployee,
} from "@/lib/employee-master-data";

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

const PAGE_SIZE = 20;

function normalizeEmpId(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function normalizeImportHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s._/-]+/g, "")
    .replace(/[()]/g, "");
}

/*
 * Catalyst ZCQL may return rows in this shape:
 *
 * {
 *   Employees: {
 *     emp_id: "EMP001",
 *     name: "Amit Kumar",
 *     ...
 *   }
 * }
 *
 * Some responses may already be flat.
 *
 * This helper supports both formats.
 */
function normalizeEmployee(employee) {
  const row = employee?.Employees ?? employee ?? {};

  return {
    empId: String(row?.emp_id ?? row?.empId ?? "").trim(),

    name: String(row?.name ?? "").trim(),

    designation: String(row?.designation ?? "").trim(),

    organization: String(
      row?.organization ?? row?.department ?? row?.orgtn ?? "",
    ).trim(),

    doj: String(
      row?.Joining_date ??
        row?.joining_date ??
        row?.doj ??
        row?.date_of_joining ??
        row?.dateOfJoining ??
        row?.joiningDate ??
        "",
    ).trim(),

    totalExp: String(
      row?.total_experience ?? row?.totalExperience ?? row?.totalExp ?? "",
    ).trim(),

    reportingManager: String(
      row?.reporting_manager ?? row?.reportingManager ?? row?.manager ?? "",
    ).trim(),

    compManager: String(row?.comp_manager ?? row?.compManager ?? "").trim(),

    superManager: String(
      row?.super_manager ??
        row?.superManager ??
        row?.appraiser_tech_ed ??
        row?.appraiserTechED ??
        "",
    ).trim(),

    appraiser: String(
      row?.appraiser ??
        row?.appraiser_tech_ed ??
        row?.appraiserTechED ??
        row?.super_manager ??
        row?.superManager ??
        "",
    ).trim(),

    managerMail: String(
      row?.manager_email_id ??
        row?.manager_mail ??
        row?.managerMail ??
        row?.manager_email ??
        row?.managerEmail ??
        "",
    ).trim(),

    superManagerMail: String(
      row?.super_man_email_id ??
        row?.super_manager_mail ??
        row?.superManagerMail ??
        row?.super_manager_email ??
        row?.superManagerEmail ??
        "",
    ).trim(),

    status:
      String(row?.status ?? "").toLowerCase() === "inactive"
        ? "Inactive"
        : "Active",

    eligible: row?.eligible === "No" ? "No" : "Yes",

    eligibleReason: String(row?.eligibleReason ?? "").trim(),

    manualOverride: Boolean(row?.manualOverride),
  };
}

function normalizeEmployeeList(data) {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map(normalizeEmployee);
}

function getImportedEmpId(row) {
  const directHeaders = [
    "Emp ID",
    "Employee ID",
    "EmpID",
    "EmployeeID",
    "EMP ID",
    "EMPLOYEE ID",
    "EMPID",
  ];

  for (const header of directHeaders) {
    if (row[header] !== undefined && row[header] !== null) {
      const value = String(row[header]).trim();

      if (value) {
        return value;
      }
    }
  }

  for (const [header, value] of Object.entries(row)) {
    const normalized = normalizeImportHeader(header);

    if (normalized === "empid" || normalized === "employeeid") {
      const result = String(value ?? "").trim();

      if (result) {
        return result;
      }
    }
  }

  return "";
}

function mergeEligibilityData(employees, savedEligibility = []) {
  const savedMap = new Map(
    savedEligibility.map((employee) => [
      normalizeEmpId(employee.empId),
      employee,
    ]),
  );

  return employees.map((employee) => {
    const saved = savedMap.get(normalizeEmpId(employee.empId));

    if (!saved) {
      return employee;
    }

    return {
      ...employee,
      eligible: saved.eligible,
      eligibleReason: saved.eligibleReason,
      manualOverride: saved.manualOverride,
    };
  });
}

function loadSavedEligibility() {
  try {
    const stored = localStorage.getItem("employee-master-eligibility");

    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed;
  } catch {
    return [];
  }
}

function saveEligibilityCache(employees) {
  try {
    const existing = loadSavedEligibility();

    const map = new Map(
      existing.map((employee) => [normalizeEmpId(employee.empId), employee]),
    );

    employees.forEach((employee) => {
      const empId = normalizeEmpId(employee.empId);

      if (!empId) {
        return;
      }

      map.set(empId, {
        empId: employee.empId,
        eligible: employee.eligible === "No" ? "No" : "Yes",
        eligibleReason: employee.eligibleReason || "",
        manualOverride: Boolean(employee.manualOverride),
      });
    });

    localStorage.setItem(
      "employee-master-eligibility",
      JSON.stringify(Array.from(map.values())),
    );
  } catch {
    // Ignore localStorage errors.
  }
}

export function EmployeeMaster() {
  const [employees, setEmployees] = useState([]);

  const [eligibilityEmployees, setEligibilityEmployees] = useState([]);

  const [eligibilityLoading, setEligibilityLoading] = useState(false);

  const [loading, setLoading] = useState(true);

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

  const [currentPage, setCurrentPage] = useState(1);

  const [refreshKey, setRefreshKey] = useState(0);

  const [pagination, setPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    totalCount: 0,
    totalPages: 1,
  });

  const [counts, setCounts] = useState({
    total: 0,
    active: 0,
    inactive: 0,
  });

  const showBanner = (title, body, error = false) => {
    setBanner({
      title,
      body,
      error,
    });
  };

  /*
   * Load only the current Employee Master page.
   */
  useEffect(() => {
    let cancelled = false;

    const loadEmployees = async () => {
      try {
        setLoading(true);

        const result = await fetchEmployeeMasterEmployees({
          page: currentPage,
          limit: PAGE_SIZE,
          search,
          status: statusFilter,
        });

        if (cancelled) {
          return;
        }

        const savedEligibility = loadSavedEligibility();

        /*
         * Normalize here as a safety layer too.
         * This makes the component safe whether
         * employee-master-data already normalizes
         * the response or returns raw Catalyst rows.
         */
        const normalizedEmployees = normalizeEmployeeList(result?.data);

        const mergedEmployees = mergeEligibilityData(
          normalizedEmployees,
          savedEligibility,
        );

        setEmployees(mergedEmployees);

        setPagination(
          result?.pagination || {
            page: currentPage,
            limit: PAGE_SIZE,
            totalCount: mergedEmployees.length,
            totalPages: 1,
          },
        );

        setCounts(
          result?.counts || {
            total: mergedEmployees.length,
            active: mergedEmployees.filter(
              (employee) => employee.status === "Active",
            ).length,
            inactive: mergedEmployees.filter(
              (employee) => employee.status === "Inactive",
            ).length,
          },
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        setEmployees([]);

        setPagination({
          page: currentPage,
          limit: PAGE_SIZE,
          totalCount: 0,
          totalPages: 1,
        });

        setCounts({
          total: 0,
          active: 0,
          inactive: 0,
        });

        showBanner(
          "Employee data failed to load",
          error?.message || "Unable to load employee data from Catalyst.",
          true,
        );
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadEmployees();

    return () => {
      cancelled = true;
    };
  }, [currentPage, search, statusFilter, refreshKey]);

  /*
   * Reset pagination when server-side filters change.
   */
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [search, statusFilter]);

  /*
   * Load employees for Eligibility List.
   *
   * This intentionally loads all employees because
   * Eligibility Criteria currently evaluates the
   * complete employee population.
   */
  useEffect(() => {
    if (activeTab !== "eligibility") {
      return;
    }

    if (eligibilityEmployees.length > 0) {
      return;
    }

    let cancelled = false;

    const loadEligibilityEmployees = async () => {
      try {
        setEligibilityLoading(true);

        const firstPage = await fetchEmployeeMasterEmployees({
          page: 1,
          limit: 100,
          status: "all",
        });

        let allEmployees = normalizeEmployeeList(firstPage?.data);

        const totalPages = Number(firstPage?.pagination?.totalPages) || 1;

        for (let page = 2; page <= totalPages; page += 1) {
          if (cancelled) {
            return;
          }

          const result = await fetchEmployeeMasterEmployees({
            page,
            limit: 100,
            status: "all",
          });

          allEmployees = allEmployees.concat(
            normalizeEmployeeList(result?.data),
          );
        }

        if (cancelled) {
          return;
        }

        const savedEligibility = loadSavedEligibility();

        const mergedEmployees = mergeEligibilityData(
          allEmployees,
          savedEligibility,
        );

        setEligibilityEmployees(mergedEmployees);

        showBanner(
          "Eligibility data loaded",
          `${mergedEmployees.length} employee(s) loaded for eligibility.`,
        );
      } catch (error) {
        if (cancelled) {
          return;
        }

        setEligibilityEmployees([]);

        showBanner(
          "Eligibility data failed to load",
          error?.message ||
            "Unable to load employees for the Eligibility List.",
          true,
        );
      } finally {
        if (!cancelled) {
          setEligibilityLoading(false);
        }
      }
    };

    loadEligibilityEmployees();

    return () => {
      cancelled = true;
    };
  }, [activeTab, eligibilityEmployees.length]);

  const total = counts.total;

  const active = counts.active;

  const inactive = counts.inactive;

  /*
   * Apply local column filters to the currently
   * loaded roster page.
   */
  const filteredRosterEmployees = useMemo(() => {
    return employees.filter((employee) => {
      return Object.entries(rosterFilters).every(([field, filter]) => {
        if (!filter) {
          return true;
        }

        if (typeof filter === "string" && filter.trim() === "") {
          return true;
        }

        const value = String(employee?.[field] ?? "").toLowerCase();

        if (typeof filter === "string") {
          return value.includes(filter.toLowerCase());
        }

        if (typeof filter === "object" && filter.value) {
          return value.includes(String(filter.value).toLowerCase());
        }

        return true;
      });
    });
  }, [employees, rosterFilters]);

  const readFile = async (file) => {
    const extension = file.name.split(".").pop()?.toLowerCase();

    if (extension === "csv") {
      const text = await file.text();

      return csvRowsToObjects(parseCsv(text));
    }

    if (extension === "xlsx" || extension === "xls") {
      const XLSX = await import("xlsx");

      const buffer = await file.arrayBuffer();

      const workbook = XLSX.read(buffer, {
        type: "array",
      });

      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

      if (!firstSheet) {
        throw new Error("No worksheet found in the file.");
      }

      return XLSX.utils.sheet_to_json(firstSheet, {
        defval: "",
        raw: false,
      });
    }

    throw new Error(
      "Unsupported file format. Please upload CSV or Excel file.",
    );
  };

  const buildRosterImportChanges = (rows) => {
    const changes = [];

    if (!Array.isArray(rows) || rows.length === 0) {
      return changes;
    }

    rows.forEach((row) => {
      if (!row || typeof row !== "object") {
        return;
      }

      const mapped = {};

      Object.entries(row).forEach(([header, value]) => {
        const field = findFieldForHeader(header);

        if (field) {
          mapped[field.key] = String(value ?? "").trim();
        }
      });

      const importedEmpId = getImportedEmpId(row);

      if (importedEmpId) {
        mapped.empId = importedEmpId;
      }

      if (!mapped.empId) {
        return;
      }

      const normalizedImportedId = normalizeEmpId(mapped.empId);

      const existing = employees.find(
        (employee) => normalizeEmpId(employee.empId) === normalizedImportedId,
      );

      const fields = {};

      FIELD_DEFS.forEach((field) => {
        if (field.key === "empId") {
          return;
        }

        if (mapped[field.key] === undefined) {
          return;
        }

        const importedValue = String(mapped[field.key] ?? "").trim();

        if (importedValue === "") {
          return;
        }

        const existingValue = String(existing?.[field.key] ?? "").trim();

        if (!existing || existingValue !== importedValue) {
          fields[field.key] = importedValue;
        }
      });

      if (!existing) {
        changes.push({
          empId: mapped.empId,
          name: mapped.name || "",
          fields,
          isNew: true,
        });

        return;
      }

      if (Object.keys(fields).length > 0) {
        changes.push({
          empId: existing.empId,
          name: mapped.name || existing.name || "",
          fields,
          isNew: false,
        });
      }
    });

    return changes;
  };

  const buildEligibilityImportChanges = (rows, sourceEmployees) => {
    const changes = [];

    if (!Array.isArray(rows) || rows.length === 0) {
      return changes;
    }

    rows.forEach((row) => {
      if (!row || typeof row !== "object") {
        return;
      }

      const empId = getImportedEmpId(row);

      if (!empId) {
        return;
      }

      let eligibleValue = "";

      Object.entries(row).forEach(([header, value]) => {
        const normalized = normalizeImportHeader(header);

        if (
          normalized === "eligible" ||
          normalized === "eligibility" ||
          normalized === "status"
        ) {
          eligibleValue = String(value ?? "").trim();
        }
      });

      if (!eligibleValue) {
        return;
      }

      const eligible = normalizeEligibleValue(eligibleValue);

      if (!eligible) {
        return;
      }

      let reason = "";

      Object.entries(row).forEach(([header, value]) => {
        const normalized = normalizeImportHeader(header);

        if (
          normalized === "reason" ||
          normalized === "eligiblereason" ||
          normalized === "remarks"
        ) {
          reason = String(value ?? "").trim();
        }
      });

      const employee = sourceEmployees.find(
        (item) => normalizeEmpId(item.empId) === normalizeEmpId(empId),
      );

      if (!employee) {
        return;
      }

      const nextReason = reason !== "" ? reason : employee.eligibleReason || "";

      if (
        employee.eligible !== eligible ||
        employee.eligibleReason !== nextReason
      ) {
        changes.push({
          empId: employee.empId,
          name: employee.name,
          fields: {
            Eligible: eligible,
            Reason: nextReason,
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
        error?.message || "Unable to read the file.",
        true,
      );
    }
  };

  const handleEligibilityFile = async (file) => {
    try {
      let sourceEmployees = eligibilityEmployees;

      if (sourceEmployees.length === 0) {
        setEligibilityLoading(true);

        const firstPage = await fetchEmployeeMasterEmployees({
          page: 1,
          limit: 100,
          status: "all",
        });

        sourceEmployees = normalizeEmployeeList(firstPage?.data);

        const totalPages = Number(firstPage?.pagination?.totalPages) || 1;

        for (let page = 2; page <= totalPages; page += 1) {
          const result = await fetchEmployeeMasterEmployees({
            page,
            limit: 100,
            status: "all",
          });

          sourceEmployees = sourceEmployees.concat(
            normalizeEmployeeList(result?.data),
          );
        }

        const savedEligibility = loadSavedEligibility();

        sourceEmployees = mergeEligibilityData(
          sourceEmployees,
          savedEligibility,
        );

        setEligibilityEmployees(sourceEmployees);

        setEligibilityLoading(false);
      }

      const rows = await readFile(file);

      const changes = buildEligibilityImportChanges(rows, sourceEmployees);

      setPendingImportType("eligibility");

      setPreviewChanges(changes);

      setPreviewOpen(true);
    } catch (error) {
      setEligibilityLoading(false);

      showBanner(
        "Import failed",
        error?.message || "Unable to read the file.",
        true,
      );
    }
  };

  /*
   * Persist employee status to Catalyst.
   */
  const persistStatusChange = async (empId, nextStatus) => {
    return updateEmployeeMasterEmployee(empId, {
      status: nextStatus,
    });
  };

  /*
   * Update local eligibility state after
   * successful backend changes.
   */
  const updateEligibilityState = (successfulChanges) => {
    const changeMap = new Map(
      successfulChanges.map((change) => [normalizeEmpId(change.empId), change]),
    );

    const updateEmployee = (employee) => {
      const change = changeMap.get(normalizeEmpId(employee.empId));

      if (!change) {
        return employee;
      }

      const nextEligible = change.fields?.Eligible === "Yes" ? "Yes" : "No";

      return {
        ...employee,
        eligible: nextEligible,
        eligibleReason: change.fields?.Reason || employee.eligibleReason || "",
        manualOverride: true,
        status: nextEligible === "Yes" ? "Active" : "Inactive",
      };
    };

    setEligibilityEmployees((current) => {
      const updated = current.map(updateEmployee);

      saveEligibilityCache(updated);

      return updated;
    });

    setEmployees((current) => current.map(updateEmployee));
  };

  const confirmImport = async () => {
    if (previewChanges.length === 0) {
      setPreviewOpen(false);
      setPreviewChanges([]);
      setPendingImportType(null);

      showBanner("Nothing to import", "No changes were found in the file.");

      return;
    }

    if (pendingImportType === "eligibility") {
      try {
        const results = await Promise.allSettled(
          previewChanges.map(async (change) => {
            const nextEligible =
              change.fields?.Eligible === "Yes" ? "Yes" : "No";

            const nextStatus = nextEligible === "Yes" ? "Active" : "Inactive";

            await persistStatusChange(change.empId, nextStatus);

            return change;
          }),
        );

        const successfulChanges = [];

        let failedCount = 0;

        results.forEach((result) => {
          if (result.status === "fulfilled") {
            successfulChanges.push(result.value);
          } else {
            failedCount += 1;
          }
        });

        updateEligibilityState(successfulChanges);

        setRefreshKey((value) => value + 1);

        setPreviewOpen(false);
        setPreviewChanges([]);
        setPendingImportType(null);

        if (failedCount > 0) {
          showBanner(
            "Eligibility import partially completed",
            `${successfulChanges.length} updated successfully. ${failedCount} record(s) failed to update in Catalyst.`,
            true,
          );
        } else {
          showBanner(
            "Eligibility imported",
            `${successfulChanges.length} employee record(s) updated in Catalyst.`,
          );
        }
      } catch (error) {
        showBanner(
          "Eligibility import failed",
          error?.message || "Unable to update eligibility in Catalyst.",
          true,
        );
      }

      return;
    }

    /*
     * Roster import remains local-preview behavior
     * exactly as in your current implementation.
     */
    setEmployees((current) => {
      const next = [...current];

      const indexByEmpId = new Map();

      next.forEach((employee, index) => {
        const key = normalizeEmpId(employee.empId);

        if (key) {
          indexByEmpId.set(key, index);
        }
      });

      previewChanges.forEach((change) => {
        const key = normalizeEmpId(change.empId);

        if (!key) {
          return;
        }

        const existingIndex = indexByEmpId.get(key);

        if (existingIndex === undefined) {
          const newEmployee = {
            empId: String(change.empId ?? "").trim(),

            name: change.fields?.name || change.name || "",

            designation: change.fields?.designation || "",

            organization: change.fields?.organization || "",

            doj: change.fields?.doj || "",

            totalExp: change.fields?.totalExp || "",

            reportingManager: change.fields?.reportingManager || "",

            compManager: change.fields?.compManager || "",

            superManager: change.fields?.superManager || "",

            appraiser: change.fields?.appraiser || "",

            managerMail: change.fields?.managerMail || "",

            superManagerMail: change.fields?.superManagerMail || "",

            status:
              change.fields?.status === "Inactive" ? "Inactive" : "Active",

            eligible: "Yes",

            eligibleReason: "",

            manualOverride: false,
          };

          next.push(newEmployee);

          indexByEmpId.set(key, next.length - 1);

          return;
        }

        const updatedEmployee = {
          ...next[existingIndex],
        };

        Object.entries(change.fields || {}).forEach(([field, value]) => {
          const supported = FIELD_DEFS.some(
            (definition) => definition.key === field,
          );

          if (supported) {
            updatedEmployee[field] = String(value ?? "").trim();
          }
        });

        next[existingIndex] = updatedEmployee;
      });

      return next;
    });

    setPreviewOpen(false);
    setPreviewChanges([]);
    setPendingImportType(null);

    showBanner(
      "Employee import preview applied locally",
      `${previewChanges.length} employee record(s) prepared.`,
    );
  };

  const applyEligibilityCriteria = async ({
    departments,
    designations,
    excludedEmployees: excluded,
    cutoffDate,
  }) => {
    let evaluated = 0;

    const evaluatedEmployees = eligibilityEmployees.map((employee) => {
      if (employee.status !== "Active" || employee.manualOverride) {
        return employee;
      }

      evaluated += 1;

      const reasons = [];

      if (departments.length && departments.includes(employee.organization)) {
        reasons.push("Department excluded");
      }

      if (designations.length && designations.includes(employee.designation)) {
        reasons.push("Designation excluded");
      }

      if (excluded.includes(employee.empId)) {
        reasons.push("Employee excluded");
      }

      if (cutoffDate && employee.doj > cutoffDate) {
        reasons.push("Joined after cutoff date");
      }

      if (reasons.length > 0) {
        return {
          ...employee,
          eligible: "No",
          eligibleReason: reasons.join(", "),
          status: "Inactive",
        };
      }

      return {
        ...employee,
        eligible: "Yes",
        eligibleReason: "",
        status: "Active",
      };
    });

    const changedEmployees = evaluatedEmployees.filter((employee, index) => {
      const previous = eligibilityEmployees[index];

      return previous && previous.status !== employee.status;
    });

    if (changedEmployees.length === 0) {
      setEligibilityEmployees(evaluatedEmployees);

      saveEligibilityCache(evaluatedEmployees);

      showBanner(
        "Criteria applied",
        `${evaluated} active employee(s) evaluated. No status changes were required.`,
      );

      return;
    }

    try {
      const results = await Promise.allSettled(
        changedEmployees.map(async (employee) => {
          await persistStatusChange(employee.empId, employee.status);

          return employee;
        }),
      );

      const successfulIds = new Set();

      let failedCount = 0;

      results.forEach((result, index) => {
        if (result.status === "fulfilled") {
          successfulIds.add(normalizeEmpId(changedEmployees[index].empId));
        } else {
          failedCount += 1;
        }
      });

      const finalEmployees = evaluatedEmployees.map((employee) => {
        const key = normalizeEmpId(employee.empId);

        if (!successfulIds.has(key)) {
          const original = eligibilityEmployees.find(
            (item) => normalizeEmpId(item.empId) === key,
          );

          return original || employee;
        }

        return employee;
      });

      setEligibilityEmployees(finalEmployees);

      saveEligibilityCache(finalEmployees);

      setRefreshKey((value) => value + 1);

      if (failedCount > 0) {
        showBanner(
          "Criteria partially applied",
          `${successfulIds.size} employee(s) updated. ${failedCount} employee(s) failed to update in Catalyst.`,
          true,
        );
      } else {
        showBanner(
          "Criteria applied",
          `${evaluated} active employee(s) evaluated and ${changedEmployees.length} status change(s) saved to Catalyst.`,
        );
      }
    } catch (error) {
      showBanner(
        "Criteria update failed",
        error?.message || "Unable to save eligibility changes.",
        true,
      );
    }
  };

  const saveEligibility = async ({ empId, eligible, eligibleReason }) => {
    const nextStatus = eligible === "Yes" ? "Active" : "Inactive";

    const existingEmployee = eligibilityEmployees.find(
      (employee) => normalizeEmpId(employee.empId) === normalizeEmpId(empId),
    );

    try {
      await persistStatusChange(empId, nextStatus);

      const updateEmployee = (employee) =>
        normalizeEmpId(employee.empId) === normalizeEmpId(empId)
          ? {
              ...employee,
              eligible,
              eligibleReason: eligibleReason || "",
              manualOverride: true,
              status: nextStatus,
            }
          : employee;

      setEligibilityEmployees((current) => {
        const updated = current.map(updateEmployee);

        saveEligibilityCache(updated);

        return updated;
      });

      setEmployees((current) => current.map(updateEmployee));

      setEligibilityEmployee(null);

      setRefreshKey((value) => value + 1);

      if (existingEmployee && existingEmployee.status !== nextStatus) {
        setCounts((current) => ({
          ...current,

          active: current.active + (nextStatus === "Active" ? 1 : -1),

          inactive: current.inactive + (nextStatus === "Inactive" ? 1 : -1),
        }));
      }

      showBanner(
        "Eligibility updated",
        `${empId} is now ${
          eligible === "Yes" ? "Eligible / Active" : "Not Eligible / Inactive"
        }. Status saved to Catalyst.`,
      );
    } catch (error) {
      showBanner(
        "Eligibility update failed",
        error?.message || "Unable to save the employee status to Catalyst.",
        true,
      );
    }
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

            {loading ? (
              <div className="em-empty">Loading employees...</div>
            ) : (
              <EmployeeRosterTable
                rows={filteredRosterEmployees}
                filters={rosterFilters}
                setFilters={setRosterFilters}
                currentPage={currentPage}
                setCurrentPage={setCurrentPage}
                totalPages={pagination.totalPages}
                totalCount={pagination.totalCount}
              />
            )}

            <div className="em-footer-note">
              Employee Master is the roster of record. Appraisal-cycle data
              should reference these employees.
            </div>
          </div>
        )}

        {activeTab === "eligibility" && (
          <div className="em-tab-content">
            {eligibilityLoading ? (
              <div className="em-empty">
                Loading all employees for Eligibility List...
              </div>
            ) : (
              <div className="em-eligibility-layout">
                <EligibilityCriteria
                  employees={eligibilityEmployees}
                  excludedEmployees={excludedEmployees}
                  setExcludedEmployees={setExcludedEmployees}
                  onApply={applyEligibilityCriteria}
                />

                <EligibilityList
                  employees={eligibilityEmployees}
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
