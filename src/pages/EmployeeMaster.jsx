import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

import { AppShell } from "@/components/appraisal/AppShell";

import {
  FIELD_DEFS,
  fetchEmployeeMasterEmployees,
  fetchEligibilityEmployees,
  updateEmployeeMasterEmployee,
  updateEmployeeEligibility,
  createEmployeeMasterEmployees,
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

const ROSTER_FIELD_TO_CATALYST = {
  name: "name",
  designation: "designation",
  organization: "department",
  doj: "Joining_date",
  totalExp: "total_experience",
  reportingManager: "reporting_manager",
  compManager: "comp_manager",
  superManager: "appraiser_tech_ed",
  appraiser: "appraiser_tech_ed",
  managerMail: "manager_email_id",
  superManagerMail: "super_man_email_id",
  status: "status",
};

/* ============================================================
   HELPERS
   ============================================================ */

function normalizeEmpId(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeImportHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s._/-]+/g, "")
    .replace(/[()]/g, "");
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
      const result = String(value || "").trim();

      if (result) {
        return result;
      }
    }
  }

  return "";
}

/* ============================================================
   COMPONENT
   ============================================================ */

export function EmployeeMaster() {
  // Only the currently requested page is kept in memory.
  const [allEmployees, setAllEmployees] = useState([]);

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

  const [rosterPagination, setRosterPagination] = useState({
    page: 1,
    limit: PAGE_SIZE,
    totalCount: 0,
    totalPages: 1,
  });

  const [rosterCounts, setRosterCounts] = useState({
    total: 0,
    active: 0,
    inactive: 0,
  });

  const [refreshKey, setRefreshKey] = useState(0);

  const eligibilityLoadedKeyRef = useRef(null);

  const showBanner = (title, body, error = false) => {
    setBanner({ title, body, error });
  };

  /* ============================================================
     LOAD ONLY CURRENT ROSTER PAGE
     ============================================================ */

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setLoading(true);

        const result = await fetchEmployeeMasterEmployees({
          page: currentPage,
          limit: PAGE_SIZE,
          search,
          status:
            statusFilter === "All"
              ? "all"
              : String(statusFilter || "").toLowerCase(),
        });

        if (cancelled) {
          return;
        }

        const employees = Array.isArray(result?.data) ? result.data : [];

        setAllEmployees(employees);

        setRosterPagination({
          page:
            result?.pagination?.page !== undefined
              ? Number(result.pagination.page)
              : currentPage,
          limit:
            result?.pagination?.limit !== undefined
              ? Number(result.pagination.limit)
              : PAGE_SIZE,
          totalCount:
            result?.pagination?.totalCount !== undefined
              ? Number(result.pagination.totalCount)
              : employees.length,
          totalPages:
            result?.pagination?.totalPages !== undefined
              ? Number(result.pagination.totalPages)
              : 1,
        });

        setRosterCounts({
          total:
            result?.counts?.total !== undefined
              ? Number(result.counts.total)
              : employees.length,
          active:
            result?.counts?.active !== undefined
              ? Number(result.counts.active)
              : 0,
          inactive:
            result?.counts?.inactive !== undefined
              ? Number(result.counts.inactive)
              : 0,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setAllEmployees([]);

        setRosterPagination({
          page: 1,
          limit: PAGE_SIZE,
          totalCount: 0,
          totalPages: 1,
        });

        setRosterCounts({
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

    load();

    return () => {
      cancelled = true;
    };
  }, [currentPage, search, statusFilter, refreshKey]);

  /* ============================================================
     RESET PAGE WHEN SEARCH / STATUS FILTER CHANGES
     ============================================================ */

  useEffect(() => {
    setCurrentPage(1);
  }, [search, statusFilter]);

  /* ============================================================
     COUNTS
     ============================================================ */

  const counts = useMemo(() => {
    return {
      total: rosterCounts.total,
      active: rosterCounts.active,
      inactive: rosterCounts.inactive,
    };
  }, [rosterCounts]);

  /* ============================================================
     CURRENT PAGE ROSTER FILTERS
     ============================================================ */

  const filteredRosterEmployees = useMemo(() => {
    return allEmployees.filter((employee) => {
      return Object.entries(rosterFilters).every(([field, filter]) => {
        if (!filter) {
          return true;
        }

        if (typeof filter === "string" && filter.trim() === "") {
          return true;
        }

        const value = String(employee?.[field] || "").toLowerCase();

        if (typeof filter === "string") {
          return value.includes(filter.toLowerCase());
        }

        if (typeof filter === "object" && filter.value) {
          return value.includes(String(filter.value).toLowerCase());
        }

        return true;
      });
    });
  }, [allEmployees, rosterFilters]);

  const rosterTotalPages = Math.max(1, rosterPagination.totalPages);

  const rosterSafePage = Math.min(currentPage, rosterTotalPages);

  /* ============================================================
     LOAD ELIGIBILITY LIST
     ============================================================ */

  useEffect(() => {
    if (activeTab !== "eligibility") {
      return;
    }

    if (eligibilityLoadedKeyRef.current === "loaded") {
      return;
    }

    eligibilityLoadedKeyRef.current = "loaded";

    let cancelled = false;

    const loadEligibilityEmployees = async () => {
      try {
        setEligibilityLoading(true);

        const firstPage = await fetchEligibilityEmployees({
          page: 1,
          limit: 100,
          search: "",
        });

        let all = Array.isArray(firstPage?.data) ? firstPage.data : [];

        const totalPages = Number(firstPage?.pagination?.totalPages) || 1;

        for (let page = 2; page <= totalPages; page += 1) {
          if (cancelled) {
            return;
          }

          const result = await fetchEligibilityEmployees({
            page,
            limit: 100,
            search: "",
          });

          all = all.concat(Array.isArray(result?.data) ? result.data : []);
        }

        if (cancelled) {
          return;
        }

        setEligibilityEmployees(all);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setEligibilityEmployees([]);

        eligibilityLoadedKeyRef.current = null;

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
  }, [activeTab]);

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

      const workbook = XLSX.read(buffer, { type: "array" });

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
          mapped[field.key] = String(value || "").trim();
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

      const existing = allEmployees.find(
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

        const importedValue = String(mapped[field.key] || "").trim();

        if (importedValue === "") {
          return;
        }

        const existingValue = String(existing?.[field.key] || "").trim();

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

        if (normalized === "eligible" || normalized === "eligibility") {
          eligibleValue = String(value || "").trim();
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
          reason = String(value || "").trim();
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

        const firstPage = await fetchEligibilityEmployees({
          page: 1,
          limit: 100,
          search: "",
        });

        sourceEmployees = Array.isArray(firstPage?.data) ? firstPage.data : [];

        const totalPages = Number(firstPage?.pagination?.totalPages) || 1;

        for (let page = 2; page <= totalPages; page += 1) {
          const result = await fetchEligibilityEmployees({
            page,
            limit: 100,
            search: "",
          });

          sourceEmployees = sourceEmployees.concat(
            Array.isArray(result?.data) ? result.data : [],
          );
        }

        setEligibilityEmployees(sourceEmployees);
        eligibilityLoadedKeyRef.current = "loaded";
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
     ============================================================ */

  const persistStatusChange = async (empId, nextStatus) => {
    const normalizedStatus = String(nextStatus || "").trim();

    if (normalizedStatus !== "Active" && normalizedStatus !== "Inactive") {
      throw new Error("Invalid employee status.");
    }

    return updateEmployeeMasterEmployee(empId, { status: normalizedStatus });
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

      return {
        ...employee,
        status: nextStatus,
      };
    };

    setAllEmployees((current) => current.map(updateEmployee));

    setEligibilityEmployees((current) => current.map(updateEmployee));

    setRosterCounts((current) => {
      let activeDelta = 0;

      successfulChanges.forEach((change) => {
        const previous = allEmployees.find(
          (employee) =>
            normalizeEmpId(employee.empId) === normalizeEmpId(change.empId),
        );

        if (!previous) {
          return;
        }

        if (previous.status === "Active" && change.status === "Inactive") {
          activeDelta -= 1;
        }

        if (previous.status === "Inactive" && change.status === "Active") {
          activeDelta += 1;
        }
      });

      return {
        ...current,
        active: current.active + activeDelta,
        inactive: current.inactive - activeDelta,
      };
    });
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

  const bulkUpdateEmployeeStatus = async (nextStatus, selectedEmployees) => {
    if (!Array.isArray(selectedEmployees) || selectedEmployees.length === 0) {
      showBanner(
        "No employees selected",
        "Please select at least one employee before using Active or Inactive.",
        true,
      );
      return;
    }

    const normalizedStatus = String(nextStatus || "").trim();

    if (normalizedStatus !== "Active" && normalizedStatus !== "Inactive") {
      return;
    }

    const uniqueEmployees = Array.from(
      new Map(
        selectedEmployees
          .filter((employee) => employee?.empId)
          .map((employee) => [normalizeEmpId(employee.empId), employee]),
      ).values(),
    );

    const employeesToUpdate = uniqueEmployees.filter(
      (employee) => employee.status !== normalizedStatus,
    );

    if (employeesToUpdate.length === 0) {
      showBanner(
        "No status changes needed",
        `All selected employees are already ${normalizedStatus}.`,
      );
      return;
    }

    try {
      setStatusActionLoading(true);

      const results = await Promise.allSettled(
        employeesToUpdate.map(async (employee) => {
          await persistStatusChange(employee.empId, normalizedStatus);

          return {
            empId: employee.empId,
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
        applyLocalStatusChanges(successfulChanges);
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
     LOCAL ELIGIBILITY UPDATE
     ============================================================ */

  const applyLocalEligibilityChanges = (successfulChanges) => {
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
        eligibleStatus: nextEligible === "Yes" ? "Eligible" : "Not Eligible",
        eligibleReason: change.fields?.Reason || employee.eligibleReason || "",
        manualOverride: true,
        status: employee.status,
      };
    };

    setEligibilityEmployees((current) => current.map(updateEmployee));

    setAllEmployees((current) => current.map(updateEmployee));
  };

  /* ============================================================
     SAVE ELIGIBILITY TO CATALYST
     ============================================================ */

  const persistEligibilityChange = async (change) => {
    const eligible = change.fields?.Eligible === "Yes" ? "Yes" : "No";

    const eligibleReason = change.fields?.Reason || "";

    await updateEmployeeEligibility(change.empId, eligible, eligibleReason);

    return {
      empId: change.empId,
      name: change.name,
      fields: {
        Eligible: eligible,
        Reason: eligibleReason,
      },
    };
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

    if (pendingImportType === "eligibility") {
      try {
        const results = await Promise.allSettled(
          previewChanges.map((change) => persistEligibilityChange(change)),
        );

        const successfulChanges = [];
        let failedCount = 0;

        results.forEach((result) => {
          if (result.status === "fulfilled") {
            successfulChanges.push(result.value);
          } else {
            failedCount += 1;

            console.error("Eligibility import update failed:", result.reason);
          }
        });

        if (successfulChanges.length > 0) {
          applyLocalEligibilityChanges(successfulChanges);
        }

        setPreviewOpen(false);
        setPreviewChanges([]);
        setPendingImportType(null);

        if (failedCount > 0) {
          showBanner(
            "Eligibility import partially completed",
            `${successfulChanges.length} updated in Catalyst. ${failedCount} record(s) failed.`,
            true,
          );
        } else {
          showBanner(
            "Eligibility imported",
            `${successfulChanges.length} employee record(s) updated in Employees table. Active/Inactive status was not changed.`,
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

    /* Roster import */

    try {
      const records = previewChanges.map((change) => {
        const payload = {
          emp_id: change.empId,
        };

        Object.entries(change.fields || {}).forEach(([key, value]) => {
          const catalystField = ROSTER_FIELD_TO_CATALYST[key];

          if (catalystField) {
            payload[catalystField] = value;
          }
        });

        if (change.isNew && !payload.status) {
          payload.status = "Active";
        }

        return payload;
      });

      const result = await createEmployeeMasterEmployees(records);

      setPreviewOpen(false);
      setPreviewChanges([]);
      setPendingImportType(null);

      setRefreshKey((value) => value + 1);

      const created = result?.data?.created || 0;

      const updated = result?.data?.updated || 0;

      const skipped = result?.data?.skipped || 0;

      showBanner(
        "Employee import completed",
        `${created} created, ${updated} updated${
          skipped ? `, ${skipped} skipped` : ""
        } in Catalyst.`,
      );
    } catch (error) {
      showBanner(
        "Employee import failed",
        error?.message || "Unable to import employees to Catalyst.",
        true,
      );
    }
  };

  /* ============================================================
     ELIGIBILITY CRITERIA
     ============================================================ */

  const applyEligibilityCriteria = async ({
    departments,
    designations,
    excludedEmployees: excluded,
    cutoffDate,
  }) => {
    let evaluated = 0;

    const changes = [];

    eligibilityEmployees.forEach((employee) => {
      if (employee.manualOverride) {
        return;
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

      const nextEligible = reasons.length > 0 ? "No" : "Yes";

      const nextReason = reasons.join(", ");

      if (
        employee.eligible !== nextEligible ||
        employee.eligibleReason !== nextReason
      ) {
        changes.push({
          empId: employee.empId,
          name: employee.name,
          fields: {
            Eligible: nextEligible,
            Reason: nextReason,
          },
        });
      }
    });

    if (changes.length === 0) {
      showBanner(
        "Criteria applied",
        `${evaluated} employee(s) evaluated. No eligibility changes were required.`,
      );

      return;
    }

    try {
      const results = await Promise.allSettled(
        changes.map((change) => persistEligibilityChange(change)),
      );

      const successfulChanges = [];
      let failedCount = 0;

      results.forEach((result) => {
        if (result.status === "fulfilled") {
          successfulChanges.push(result.value);
        } else {
          failedCount += 1;

          console.error("Eligibility criteria update failed:", result.reason);
        }
      });

      if (successfulChanges.length > 0) {
        applyLocalEligibilityChanges(successfulChanges);
      }

      if (failedCount > 0) {
        showBanner(
          "Criteria partially applied",
          `${successfulChanges.length} employee(s) updated in Catalyst. ${failedCount} employee(s) failed.`,
          true,
        );
      } else {
        showBanner(
          "Criteria applied",
          `${successfulChanges.length} employee(s) eligibility updated in Catalyst. Active/Inactive status was not changed.`,
        );
      }
    } catch (error) {
      showBanner(
        "Criteria update failed",
        error?.message || "Unable to save eligibility changes to Catalyst.",
        true,
      );
    }
  };

  /* ============================================================
     SAVE INDIVIDUAL ELIGIBILITY
     ============================================================ */

  const saveEligibility = async ({ empId, eligible, eligibleReason }) => {
    try {
      const normalizedEligible = eligible === "Yes" ? "Yes" : "No";

      await updateEmployeeEligibility(
        empId,
        normalizedEligible,
        eligibleReason || "",
      );

      applyLocalEligibilityChanges([
        {
          empId,
          fields: {
            Eligible: normalizedEligible,
            Reason: eligibleReason || "",
          },
        },
      ]);

      setEligibilityEmployee(null);

      showBanner(
        "Eligibility updated",
        `${empId} is now ${
          normalizedEligible === "Yes" ? "Eligible" : "Not Eligible"
        }. Saved to Employees table. Active/Inactive status was not changed.`,
      );
    } catch (error) {
      showBanner(
        "Eligibility update failed",
        error?.message || "Unable to save eligibility to Catalyst.",
        true,
      );
    }
  };

  /* ============================================================
     RENDER
     ============================================================ */

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
              <strong>{counts.total}</strong>
            </div>

            <div>
              <span>Active</span>
              <strong className="active">{counts.active}</strong>
            </div>

            <div>
              <span>Inactive</span>
              <strong className="inactive">{counts.inactive}</strong>
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
                currentPage={rosterSafePage}
                setCurrentPage={setCurrentPage}
                totalPages={rosterTotalPages}
                totalCount={rosterPagination.totalCount}
                onToggleStatus={toggleEmployeeStatus}
                onBulkStatusChange={bulkUpdateEmployeeStatus}
                bulkStatusUpdating={statusActionLoading}
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
