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

/* ============================================================
   HELPERS
   ============================================================ */

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

/* ============================================================
   NORMALIZE EMPLOYEE
   ============================================================ */

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

    /* ========================================================
       STATUS
       Completely independent from eligibility.
       ======================================================== */

    status:
      String(row?.status ?? "")
        .trim()
        .toLowerCase() === "inactive"
        ? "Inactive"
        : "Active",

    /* ========================================================
       ELIGIBILITY
       Completely independent from status.
       ======================================================== */

    eligible:
      String(row?.eligible ?? "")
        .trim()
        .toLowerCase() === "no"
        ? "No"
        : "Yes",

    eligibleReason: String(
      row?.eligibleReason ?? row?.eligible_reason ?? "",
    ).trim(),

    manualOverride: Boolean(
      row?.manualOverride ?? row?.manual_override ?? false,
    ),
  };
}

function normalizeEmployeeList(data) {
  if (!Array.isArray(data)) {
    return [];
  }

  return data.map(normalizeEmployee);
}

/* ============================================================
   IMPORT HELPERS
   ============================================================ */

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

/* ============================================================
   ELIGIBILITY CACHE
   ============================================================ */

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

      /*
       * Only eligibility fields
       * come from the cache.
       *
       * STATUS IS NOT READ FROM
       * THE ELIGIBILITY CACHE.
       */

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

      /*
       * IMPORTANT:
       * status is intentionally NOT
       * stored in eligibility cache.
       */

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

/* ============================================================
   COMPONENT
   ============================================================ */

export function EmployeeMaster() {
  const [employees, setEmployees] = useState([]);

  const [eligibilityEmployees, setEligibilityEmployees] = useState([]);

  const [eligibilityLoading, setEligibilityLoading] = useState(false);

  const [loading, setLoading] = useState(true);

  const [statusActionLoading, setStatusActionLoading] = useState(false);

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

  /* ============================================================
     LOAD CURRENT ROSTER PAGE
     ============================================================ */

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

  /* ============================================================
     RESET PAGINATION WHEN SERVER FILTER CHANGES
     ============================================================ */

  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [search, statusFilter]);

  /* ============================================================
     LOAD ALL EMPLOYEES FOR ELIGIBILITY
     ============================================================ */

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

  /* ============================================================
     LOCAL ROSTER COLUMN FILTERS
     ============================================================ */

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

  /* ============================================================
     FILE READING
     ============================================================ */

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

  /* ============================================================
     ROSTER IMPORT CHANGES
     ============================================================ */

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

  /* ============================================================
     ELIGIBILITY IMPORT CHANGES

     IMPORTANT:
     "Status" is NO LONGER accepted as an
     eligibility header.
     ============================================================ */

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

        /*
         * IMPORTANT:
         * "status" is deliberately
         * excluded here.
         */

        if (normalized === "eligible" || normalized === "eligibility") {
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

  /* ============================================================
     FILE HANDLERS
     ============================================================ */

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

  /* ============================================================
     STATUS PERSISTENCE
     
     ONLY STATUS IS UPDATED.
     ============================================================ */

  const persistStatusChange = async (empId, nextStatus) => {
    const normalizedStatus = String(nextStatus ?? "").trim();

    if (normalizedStatus !== "Active" && normalizedStatus !== "Inactive") {
      throw new Error("Invalid employee status.");
    }

    return updateEmployeeMasterEmployee(empId, {
      status: normalizedStatus,
    });
  };

  /* ============================================================
     LOCAL STATUS UPDATE
     ============================================================ */

  const applyLocalStatusChanges = (successfulChanges) => {
    const statusMap = new Map(
      successfulChanges.map((change) => [
        normalizeEmpId(change.empId),
        change.status,
      ]),
    );

    const updateEmployee = (employee) => {
      const nextStatus = statusMap.get(normalizeEmpId(employee.empId));

      if (!nextStatus) {
        return employee;
      }

      /*
       * IMPORTANT:
       * We change ONLY status.
       *
       * eligible
       * eligibleReason
       * manualOverride
       *
       * remain untouched.
       */

      return {
        ...employee,
        status: nextStatus,
      };
    };

    setEmployees((current) => current.map(updateEmployee));

    setEligibilityEmployees((current) => current.map(updateEmployee));
  };

  /* ============================================================
     INDIVIDUAL ACTIVE / INACTIVE
     ============================================================ */

  const toggleEmployeeStatus = async (employee) => {
    if (!employee?.empId) {
      return;
    }

    const nextStatus = employee.status === "Active" ? "Inactive" : "Active";

    try {
      setStatusActionLoading(true);

      await persistStatusChange(employee.empId, nextStatus);

      applyLocalStatusChanges([
        {
          empId: employee.empId,

          status: nextStatus,
        },
      ]);

      setCounts((current) => ({
        ...current,

        active: current.active + (nextStatus === "Active" ? 1 : -1),

        inactive: current.inactive + (nextStatus === "Inactive" ? 1 : -1),
      }));

      /*
       * No eligibility update.
       * No eligibility cache write.
       * No eligibility recalculation.
       */

      showBanner(
        "Status updated",
        `${employee.empId} is now ${nextStatus}. Saved to Catalyst.`,
      );
    } catch (error) {
      showBanner(
        "Status update failed",
        error?.message || "Unable to save employee status to Catalyst.",
        true,
      );
    } finally {
      setStatusActionLoading(false);
    }
  };

  /* ============================================================
     BULK ACTIVE / INACTIVE
     ============================================================ */

  const bulkUpdateEmployeeStatus = async (empIds, nextStatus) => {
    if (!Array.isArray(empIds) || empIds.length === 0) {
      return;
    }

    const normalizedStatus = String(nextStatus ?? "").trim();

    if (normalizedStatus !== "Active" && normalizedStatus !== "Inactive") {
      return;
    }

    /*
     * Remove duplicate employee IDs.
     */

    const uniqueIds = Array.from(
      new Set(empIds.map((id) => String(id ?? "").trim()).filter(Boolean)),
    );

    if (uniqueIds.length === 0) {
      return;
    }

    try {
      setStatusActionLoading(true);

      /*
       * Update each employee in Catalyst.
       *
       * Only status is sent.
       */

      const results = await Promise.allSettled(
        uniqueIds.map(async (empId) => {
          await persistStatusChange(empId, normalizedStatus);

          return {
            empId,
            status: normalizedStatus,
          };
        }),
      );

      const successfulChanges = [];

      let failedCount = 0;

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          successfulChanges.push(result.value);
        } else {
          failedCount += 1;

          console.error("Bulk status update failed:", result.reason);
        }
      });

      if (successfulChanges.length > 0) {
        /*
         * Update only status locally.
         */

        applyLocalStatusChanges(successfulChanges);

        /*
         * Recalculate counts from
         * successful operations only.
         */

        let activeDelta = 0;

        let inactiveDelta = 0;

        successfulChanges.forEach((change) => {
          const previous = employees.find(
            (employee) =>
              normalizeEmpId(employee.empId) === normalizeEmpId(change.empId),
          );

          if (!previous) {
            return;
          }

          if (previous.status !== change.status) {
            if (change.status === "Active") {
              activeDelta += 1;
              inactiveDelta -= 1;
            } else {
              activeDelta -= 1;
              inactiveDelta += 1;
            }
          }
        });

        setCounts((current) => ({
          ...current,

          active: current.active + activeDelta,

          inactive: current.inactive + inactiveDelta,
        }));
      }

      if (failedCount > 0) {
        showBanner(
          "Bulk status partially completed",
          `${successfulChanges.length} employee(s) updated to ${normalizedStatus}. ${failedCount} employee(s) failed.`,
          true,
        );
      } else {
        showBanner(
          "Bulk status updated",
          `${successfulChanges.length} employee(s) are now ${normalizedStatus}. Changes saved to Catalyst.`,
        );
      }
    } catch (error) {
      showBanner(
        "Bulk status update failed",
        error?.message || "Unable to update employee status.",
        true,
      );
    } finally {
      setStatusActionLoading(false);
    }
  };

  /* ============================================================
     ELIGIBILITY LOCAL STATE
     
     IMPORTANT:
     Eligibility NEVER modifies status.
     ============================================================ */

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

        /*
         * Eligibility changes ONLY.
         */

        eligible: nextEligible,

        eligibleReason: change.fields?.Reason || employee.eligibleReason || "",

        manualOverride: true,

        /*
         * DO NOT CHANGE STATUS.
         */
        status: employee.status,
      };
    };

    setEligibilityEmployees((current) => {
      const updated = current.map(updateEmployee);

      saveEligibilityCache(updated);

      return updated;
    });

    setEmployees((current) => current.map(updateEmployee));
  };

  /* ============================================================
     CONFIRM IMPORT
     ============================================================ */

  const confirmImport = async () => {
    if (previewChanges.length === 0) {
      setPreviewOpen(false);

      setPreviewChanges([]);

      setPendingImportType(null);

      showBanner("Nothing to import", "No changes were found in the file.");

      return;
    }

    /* ========================================================
         ELIGIBILITY IMPORT

         ONLY eligibility fields.
         NO status update.
         ======================================================== */

    if (pendingImportType === "eligibility") {
      try {
        const successfulChanges = [];

        let failedCount = 0;

        for (const change of previewChanges) {
          try {
            /*
             * Eligibility is currently
             * a classification only.
             *
             * No status persistence.
             */

            successfulChanges.push(change);
          } catch {
            failedCount += 1;
          }
        }

        updateEligibilityState(successfulChanges);

        setPreviewOpen(false);

        setPreviewChanges([]);

        setPendingImportType(null);

        if (failedCount > 0) {
          showBanner(
            "Eligibility import partially completed",
            `${successfulChanges.length} updated. ${failedCount} record(s) failed.`,
            true,
          );
        } else {
          showBanner(
            "Eligibility imported",
            `${successfulChanges.length} employee record(s) updated. Active/Inactive status was not changed.`,
          );
        }
      } catch (error) {
        showBanner(
          "Eligibility import failed",
          error?.message || "Unable to update eligibility.",
          true,
        );
      }

      return;
    }

    /* ========================================================
         ROSTER IMPORT

         Keep existing local preview behavior.
         ======================================================== */

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

  /* ============================================================
     ELIGIBILITY CRITERIA
     
     IMPORTANT:
     This changes ONLY eligibility.
     ============================================================ */

  const applyEligibilityCriteria = async ({
    departments,
    designations,
    excludedEmployees: excluded,
    cutoffDate,
  }) => {
    let evaluated = 0;

    const evaluatedEmployees = eligibilityEmployees.map((employee) => {
      if (employee.manualOverride) {
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

          /*
           * STATUS REMAINS
           * EXACTLY AS IT WAS.
           */
          status: employee.status,
        };
      }

      return {
        ...employee,

        eligible: "Yes",

        eligibleReason: "",

        /*
         * STATUS REMAINS
         * EXACTLY AS IT WAS.
         */
        status: employee.status,
      };
    });

    setEligibilityEmployees(evaluatedEmployees);

    setEmployees((current) => {
      const eligibilityMap = new Map(
        evaluatedEmployees.map((employee) => [
          normalizeEmpId(employee.empId),
          employee,
        ]),
      );

      return current.map((employee) => {
        const updated = eligibilityMap.get(normalizeEmpId(employee.empId));

        if (!updated) {
          return employee;
        }

        return {
          ...employee,

          eligible: updated.eligible,

          eligibleReason: updated.eligibleReason,

          manualOverride: updated.manualOverride,

          /*
           * Preserve roster status.
           */
          status: employee.status,
        };
      });
    });

    saveEligibilityCache(evaluatedEmployees);

    showBanner(
      "Criteria applied",
      `${evaluated} employee(s) evaluated. Eligibility was updated without changing Active/Inactive status.`,
    );
  };

  /* ============================================================
     SAVE INDIVIDUAL ELIGIBILITY
     ============================================================ */

  const saveEligibility = async ({ empId, eligible, eligibleReason }) => {
    const updateEmployee = (employee) =>
      normalizeEmpId(employee.empId) === normalizeEmpId(empId)
        ? {
            ...employee,

            eligible,

            eligibleReason: eligibleReason || "",

            manualOverride: true,

            /*
             * Preserve status.
             */
            status: employee.status,
          }
        : employee;

    setEligibilityEmployees((current) => {
      const updated = current.map(updateEmployee);

      saveEligibilityCache(updated);

      return updated;
    });

    setEmployees((current) => current.map(updateEmployee));

    setEligibilityEmployee(null);

    showBanner(
      "Eligibility updated",
      `${empId} is now ${
        eligible === "Yes" ? "Eligible" : "Not Eligible"
      }. Active/Inactive status was not changed.`,
    );
  };

  /* ============================================================
     RENDER
     ============================================================ */

  return (
    <AppShell>
      <div className="employee-master-page">
        {/* ======================================================
            PAGE HEADER
            ====================================================== */}

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

        {/* ======================================================
            TABS
            ====================================================== */}

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

        {/* ======================================================
            BANNER
            ====================================================== */}

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

        {/* ======================================================
            ROSTER TAB
            ====================================================== */}

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
                /*
                 * =================================================
                 * STATUS ACTIONS
                 * =================================================
                 */

                onToggleStatus={toggleEmployeeStatus}
                onBulkStatusChange={bulkUpdateEmployeeStatus}
                statusActionLoading={statusActionLoading}
              />
            )}

            <div className="em-footer-note">
              Employee Master is the roster of record. Appraisal-cycle data
              should reference these employees.
            </div>
          </div>
        )}

        {/* ======================================================
            ELIGIBILITY TAB
            ====================================================== */}

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

        {/* ======================================================
            ELIGIBILITY MODAL
            ====================================================== */}

        <EligibilityModal
          employee={eligibilityEmployee}
          onClose={() => setEligibilityEmployee(null)}
          onSave={saveEligibility}
        />

        {/* ======================================================
            IMPORT PREVIEW
            ====================================================== */}

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
