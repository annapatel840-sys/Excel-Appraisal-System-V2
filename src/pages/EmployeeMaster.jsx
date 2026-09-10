import { useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertCircle } from "lucide-react";

import { AppShell } from "@/components/appraisal/AppShell";

import { FIELD_DEFS } from "@/lib/employee-master-data";

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

/* ============================================================
   STORAGE
   ============================================================ */

const EMPLOYEE_MASTER_STORAGE_KEY = "employee-master-employees";
const EMPLOYEE_MASTER_EVENT = "employee-master-updated";
const EMPLOYEE_MASTER_DATA_VERSION = 6;
const EMPLOYEE_MASTER_VERSION_KEY = "employee-master-data-version";

/* ============================================================
   CATALYST API
   ============================================================ */

const EMPLOYEE_API_URL =
  "https://excelappraisal-904056216.development.catalystserverless.com/server/employee-api-v2/";

/* ============================================================
   SERVER PAGE SIZE
   ============================================================ */

const PAGE_SIZE = 20;

/* ============================================================
   EMPLOYEE ID
   ============================================================ */

function normalizeEmpId(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/* ============================================================
   IMPORT HEADER NORMALIZATION
   ============================================================ */

function normalizeImportHeader(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s._/-]+/g, "")
    .replace(/[()]/g, "");
}

/* ============================================================
   GET EMPLOYEE ID FROM IMPORT
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
   NORMALIZE EMPLOYEE
   ============================================================ */

function normalizeEmployee(employee) {
  return {
    // ==========================================================
    // BASIC DETAILS
    // ==========================================================

    empId: String(employee?.emp_id ?? employee?.empId ?? ""),

    name: String(employee?.name ?? ""),

    designation: String(employee?.designation ?? ""),

    organization: String(
      employee?.organization ?? employee?.department ?? employee?.orgtn ?? "",
    ),

    // ==========================================================
    // DATE OF JOINING
    // ==========================================================
    // Catalyst column:
    // joining_date

    doj: String(
      employee?.Joining_date ??
        employee?.joining_date ??
        employee?.doj ??
        employee?.date_of_joining ??
        employee?.dateOfJoining ??
        employee?.joiningDate ??
        "",
    ),

    // ==========================================================
    // TOTAL EXPERIENCE
    // ==========================================================

    totalExp: String(
      employee?.total_experience ??
        employee?.totalExperience ??
        employee?.totalExp ??
        "",
    ),

    // ==========================================================
    // REPORTING MANAGER
    // ==========================================================

    reportingManager: String(
      employee?.reporting_manager ??
        employee?.reportingManager ??
        employee?.manager ??
        "",
    ),

    // ==========================================================
    // COMP MANAGER
    // ==========================================================

    compManager: String(employee?.comp_manager ?? employee?.compManager ?? ""),

    // ==========================================================
    // SUPER MANAGER
    // ==========================================================

    superManager: String(
      employee?.super_manager ??
        employee?.superManager ??
        employee?.appraiser_tech_ed ??
        employee?.appraiserTechED ??
        "",
    ),

    // ==========================================================
    // APPRAISER
    // ==========================================================

    appraiser: String(
      employee?.appraiser ??
        employee?.appraiser_tech_ed ??
        employee?.appraiserTechED ??
        employee?.super_manager ??
        employee?.superManager ??
        "",
    ),

    // ==========================================================
    // MANAGER EMAIL
    // ==========================================================
    // Catalyst column:
    // manager_email_id

    managerMail: String(
      employee?.manager_email_id ??
        employee?.manager_mail ??
        employee?.managerMail ??
        employee?.manager_email ??
        employee?.managerEmail ??
        "",
    ),

    // ==========================================================
    // SUPER MANAGER EMAIL
    // ==========================================================
    // Catalyst column:
    // super_man_email_id

    superManagerMail: String(
      employee?.super_man_email_id ??
        employee?.super_manager_mail ??
        employee?.superManagerMail ??
        employee?.super_manager_email ??
        employee?.superManagerEmail ??
        "",
    ),

    // ==========================================================
    // STATUS
    // ==========================================================

    status:
      String(employee?.status ?? "").toLowerCase() === "inactive"
        ? "Inactive"
        : "Active",

    // ==========================================================
    // ELIGIBILITY
    // ==========================================================

    eligible: employee?.eligible === "No" ? "No" : "Yes",

    eligibleReason: String(employee?.eligibleReason ?? ""),

    manualOverride: Boolean(employee?.manualOverride),
  };
}

/* ============================================================
   LOAD LOCAL ELIGIBILITY DATA ONLY
   ============================================================ */

function loadSavedEmployeeData() {
  try {
    const stored = localStorage.getItem(EMPLOYEE_MASTER_STORAGE_KEY);

    if (!stored) {
      return [];
    }

    const parsed = JSON.parse(stored);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.map((employee) => ({
      empId: String(employee?.empId ?? ""),

      eligible: employee?.eligible === "No" ? "No" : "Yes",

      eligibleReason: String(employee?.eligibleReason ?? ""),

      manualOverride: Boolean(employee?.manualOverride),
    }));
  } catch {
    return [];
  }
}

/* ============================================================
   MERGE CATALYST EMPLOYEES WITH LOCAL ELIGIBILITY
   ============================================================ */

function mergeCatalystEmployees(catalystEmployees) {
  const savedEmployees = loadSavedEmployeeData();

  const savedMap = new Map(
    savedEmployees.map((employee) => [
      normalizeEmpId(employee.empId),
      employee,
    ]),
  );

  return catalystEmployees.map((employee) => {
    const saved = savedMap.get(normalizeEmpId(employee.empId));

    if (!saved) {
      return employee;
    }

    return {
      ...employee,

      eligible: saved.eligible,

      eligibleReason: saved.eligibleReason,

      manualOverride: saved.manualOverride,

      status: employee.status,
    };
  });
}

/* ============================================================
   SAVE LOCAL ELIGIBILITY CACHE
   ============================================================ */

function saveEmployees(employees) {
  try {
    const existing = loadSavedEmployeeData();

    const existingMap = new Map(
      existing.map((employee) => [normalizeEmpId(employee.empId), employee]),
    );

    employees.forEach((employee) => {
      const empId = normalizeEmpId(employee.empId);

      if (!empId) {
        return;
      }

      existingMap.set(empId, {
        empId: employee.empId,

        eligible: employee.eligible === "No" ? "No" : "Yes",

        eligibleReason: employee.eligibleReason || "",

        manualOverride: Boolean(employee.manualOverride),
      });
    });

    localStorage.setItem(
      EMPLOYEE_MASTER_STORAGE_KEY,
      JSON.stringify(Array.from(existingMap.values())),
    );

    localStorage.setItem(
      EMPLOYEE_MASTER_VERSION_KEY,
      String(EMPLOYEE_MASTER_DATA_VERSION),
    );

    window.dispatchEvent(
      new CustomEvent(EMPLOYEE_MASTER_EVENT, {
        detail: employees,
      }),
    );
  } catch {
    // Ignore localStorage errors.
  }
}

/* ============================================================
   FETCH ONE PAGE FROM CATALYST
   ============================================================ */

async function fetchEmployeesFromCatalyst(page = 1, limit = PAGE_SIZE) {
  const safeRequestedPage = Math.max(1, Number(page) || 1);

  const safeRequestedLimit = Math.min(
    100,
    Math.max(1, Number(limit) || PAGE_SIZE),
  );

  const url = new URL(EMPLOYEE_API_URL);

  url.searchParams.set("page", String(safeRequestedPage));
  url.searchParams.set("limit", String(safeRequestedLimit));

  console.log(
    "[EmployeeMaster] Fetching Catalyst page:",
    safeRequestedPage,
    "limit:",
    safeRequestedLimit,
    "URL:",
    url.toString(),
  );

  const response = await fetch(url.toString(), {
    method: "GET",
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Employee API failed with status ${response.status}.`);
  }

  const payload = await response.json();

  console.log("[EmployeeMaster] Catalyst response:", payload);

  if (!payload?.success) {
    throw new Error(
      payload?.message || "Unable to load employees from Catalyst.",
    );
  }

  if (!Array.isArray(payload.data)) {
    throw new Error("Employee API returned invalid employee data.");
  }

  const apiPagination = payload.pagination || {};

  const totalCount = Number(apiPagination.totalCount) || 0;

  const totalPages =
    Number(apiPagination.totalPages) ||
    Math.max(1, Math.ceil(totalCount / safeRequestedLimit));

  const apiCounts = payload.counts || {};

  const total = Number(apiCounts.total) || totalCount;

  const active = Number(apiCounts.active) || 0;

  const inactive = Number(apiCounts.inactive) || 0;

  return {
    employees: payload.data.map(normalizeEmployee),

    pagination: {
      page: Number(apiPagination.page) || safeRequestedPage,

      limit: Number(apiPagination.limit) || safeRequestedLimit,

      totalCount,

      totalPages: Math.max(1, totalPages),
    },

    counts: {
      total,

      active,

      inactive,
    },
  };
}

/* ============================================================
   FETCH ALL EMPLOYEES FOR ELIGIBILITY LIST
   ============================================================ */

async function fetchAllEmployeesFromCatalyst() {
  console.log("[EmployeeMaster] Loading all employees for Eligibility List.");

  const firstPage = await fetchEmployeesFromCatalyst(1, PAGE_SIZE);

  let allEmployees = [...firstPage.employees];

  const totalPages = firstPage.pagination.totalPages;

  if (totalPages > 1) {
    for (let page = 2; page <= totalPages; page += 1) {
      const result = await fetchEmployeesFromCatalyst(page, PAGE_SIZE);

      allEmployees = allEmployees.concat(result.employees);
    }
  }

  const mergedEmployees = mergeCatalystEmployees(allEmployees);

  console.log(
    "[EmployeeMaster] All Eligibility employees loaded:",
    mergedEmployees.length,
  );

  return mergedEmployees;
}

/* ============================================================
   EMPLOYEE MASTER
   ============================================================ */

export function EmployeeMaster() {
  /* ==========================================================
     CURRENT API PAGE
     ========================================================== */

  const [employees, setEmployees] = useState([]);

  /* ==========================================================
     ALL EMPLOYEES FOR ELIGIBILITY
     ========================================================== */

  const [eligibilityEmployees, setEligibilityEmployees] = useState([]);

  /* ==========================================================
     ELIGIBILITY LOADING
     ========================================================== */

  const [eligibilityLoading, setEligibilityLoading] = useState(false);

  /* ==========================================================
     LOADING STATE
     ========================================================== */

  const [loading, setLoading] = useState(true);

  /* ==========================================================
     ACTIVE TAB
     ========================================================== */

  const [activeTab, setActiveTab] = useState("roster");

  /* ==========================================================
     ROSTER SEARCH
     ========================================================== */

  const [search, setSearch] = useState("");

  /* ==========================================================
     STATUS FILTER
     ========================================================== */

  const [statusFilter, setStatusFilter] = useState("All");

  /* ==========================================================
     COLUMN FILTERS
     ========================================================== */

  const [rosterFilters, setRosterFilters] = useState({});

  /* ==========================================================
     ELIGIBILITY SEARCH
     ========================================================== */

  const [eligibilitySearch, setEligibilitySearch] = useState("");

  /* ==========================================================
     ELIGIBILITY FILTERS
     ========================================================== */

  const [eligibilityFilters, setEligibilityFilters] = useState({});

  /* ==========================================================
     EXCLUDED EMPLOYEES
     ========================================================== */

  const [excludedEmployees, setExcludedEmployees] = useState([]);

  /* ==========================================================
     BANNER
     ========================================================== */

  const [banner, setBanner] = useState(null);

  /* ==========================================================
     ELIGIBILITY MODAL EMPLOYEE
     ========================================================== */

  const [eligibilityEmployee, setEligibilityEmployee] = useState(null);

  /* ==========================================================
     IMPORT PREVIEW
     ========================================================== */

  const [previewOpen, setPreviewOpen] = useState(false);

  const [previewChanges, setPreviewChanges] = useState([]);

  const [pendingImportType, setPendingImportType] = useState(null);

  /* ==========================================================
     FILE INPUT
     ========================================================== */

  const fileInputRef = useRef(null);

  /* ==========================================================
     SERVER PAGINATION
     ========================================================== */

  const [currentPage, setCurrentPage] = useState(1);

  const [pagination, setPagination] = useState({
    page: 1,

    limit: PAGE_SIZE,

    totalCount: 0,

    totalPages: 1,
  });

  /* ==========================================================
     SERVER COUNTS
     ========================================================== */

  const [counts, setCounts] = useState({
    total: 0,

    active: 0,

    inactive: 0,
  });

  /* ============================================================
     LOAD CURRENT EMPLOYEE MASTER PAGE
     ============================================================ */

  useEffect(() => {
    let cancelled = false;

    const loadCatalystEmployees = async () => {
      try {
        setLoading(true);

        const result = await fetchEmployeesFromCatalyst(currentPage, PAGE_SIZE);

        if (cancelled) {
          return;
        }

        const mergedEmployees = mergeCatalystEmployees(result.employees);

        setEmployees(mergedEmployees);

        setPagination(result.pagination);

        setCounts(result.counts);

        /*
         * Cache current page eligibility values.
         */
        saveEmployees(mergedEmployees);

        setBanner({
          title: "Employee data loaded",

          body: `${result.pagination.totalCount} employee(s) available in Catalyst.`,

          error: false,
        });
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

        setBanner({
          title: "Employee data failed to load",

          body: error?.message || "Unable to load employee data from Catalyst.",

          error: true,
        });
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadCatalystEmployees();

    return () => {
      cancelled = true;
    };
  }, [currentPage]);

  /* ============================================================
     LOAD ALL EMPLOYEES WHEN ELIGIBILITY TAB OPENS
     ============================================================ */

  useEffect(() => {
    if (activeTab !== "eligibility") {
      return;
    }

    /*
     * Already loaded.
     */
    if (eligibilityEmployees.length > 0) {
      return;
    }

    let cancelled = false;

    const loadEligibilityEmployees = async () => {
      try {
        setEligibilityLoading(true);

        const allEmployees = await fetchAllEmployeesFromCatalyst();

        if (cancelled) {
          return;
        }

        setEligibilityEmployees(allEmployees);

        /*
         * Save all eligibility values locally.
         * Catalyst remains the roster source for now.
         */
        saveEmployees(allEmployees);

        setBanner({
          title: "Eligibility data loaded",

          body: `${allEmployees.length} employee(s) loaded for eligibility.`,

          error: false,
        });
      } catch (error) {
        if (cancelled) {
          return;
        }

        setEligibilityEmployees([]);

        setBanner({
          title: "Eligibility data failed to load",

          body:
            error?.message ||
            "Unable to load all employees for the Eligibility List.",

          error: true,
        });
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

  /* ============================================================
     SAVE CURRENT PAGE ELIGIBILITY CACHE
     ============================================================ */

  useEffect(() => {
    if (!loading && employees.length > 0) {
      saveEmployees(employees);
    }
  }, [employees, loading]);

  /* ============================================================
     SAVE ALL ELIGIBILITY DATA
     ============================================================ */

  useEffect(() => {
    if (!eligibilityLoading && eligibilityEmployees.length > 0) {
      saveEmployees(eligibilityEmployees);
    }
  }, [eligibilityEmployees, eligibilityLoading]);

  /* ============================================================
     TOTAL / ACTIVE / INACTIVE
     ============================================================ */

  const total = counts.total;

  const active = counts.active;

  const inactive = counts.inactive;

  /* ============================================================
     ROSTER SEARCH + STATUS FILTER
     ============================================================ */

  const filteredRosterEmployees = useMemo(() => {
    const term = search.trim().toLowerCase();

    return employees.filter((employee) => {
      if (statusFilter !== "All" && employee.status !== statusFilter) {
        return false;
      }

      if (!term) {
        return true;
      }

      return (
        String(employee.name ?? "")
          .toLowerCase()
          .includes(term) ||
        String(employee.empId ?? "")
          .toLowerCase()
          .includes(term) ||
        String(employee.organization ?? "")
          .toLowerCase()
          .includes(term)
      );
    });
  }, [employees, search, statusFilter]);

  /* ============================================================
     RESET ROSTER PAGE WHEN SEARCH/FILTER CHANGES
     ============================================================ */

  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [search, statusFilter]);

  /* ============================================================
     BANNER
     ============================================================ */

  const showBanner = (title, body, error = false) => {
    setBanner({
      title,

      body,

      error,
    });
  };

  /* ============================================================
     READ CSV / XLSX
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
     ROSTER IMPORT
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
     ELIGIBILITY IMPORT
     ============================================================ */

  const buildEligibilityImportChanges = (rows) => {
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

      const employee = eligibilityEmployees.find(
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
     HANDLE ROSTER FILE
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

        error.message || "Unable to read the file.",

        true,
      );
    }
  };

  /* ============================================================
     HANDLE ELIGIBILITY FILE
     ============================================================ */

  const handleEligibilityFile = async (file) => {
    try {
      /*
       * If Eligibility List data is not loaded yet,
       * load it before processing the import.
       */
      let sourceEmployees = eligibilityEmployees;

      if (sourceEmployees.length === 0) {
        setEligibilityLoading(true);

        sourceEmployees = await fetchAllEmployeesFromCatalyst();

        setEligibilityEmployees(sourceEmployees);

        setEligibilityLoading(false);
      }

      const originalEmployees = employees;

      /*
       * Temporarily use all eligibility employees for import matching.
       */
      const originalEmployeesReference = employees;

      setEmployees(sourceEmployees);

      const rows = await readFile(file);

      /*
       * Build import changes against the full eligibility dataset.
       */
      const changes = [];

      if (Array.isArray(rows)) {
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

          const nextReason =
            reason !== "" ? reason : employee.eligibleReason || "";

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
      }

      setEmployees(originalEmployeesReference);

      setPendingImportType("eligibility");

      setPreviewChanges(changes);

      setPreviewOpen(true);
    } catch (error) {
      setEligibilityLoading(false);

      showBanner(
        "Import failed",

        error.message || "Unable to read the file.",

        true,
      );
    }
  };

  /* ============================================================
     CONFIRM IMPORT
     ============================================================ */

  const confirmImport = () => {
    /* ==========================================================
       ELIGIBILITY IMPORT
       ========================================================== */

    if (pendingImportType === "eligibility") {
      const changeMap = new Map(
        previewChanges.map((change) => [normalizeEmpId(change.empId), change]),
      );

      const updateEligibilityEmployee = (employee) => {
        const change = changeMap.get(normalizeEmpId(employee.empId));

        if (!change) {
          return employee;
        }

        const nextEligible = change.fields.Eligible === "Yes" ? "Yes" : "No";

        return {
          ...employee,

          eligible: nextEligible,

          eligibleReason: change.fields.Reason || employee.eligibleReason || "",

          manualOverride: true,

          status: nextEligible === "Yes" ? "Active" : "Inactive",
        };
      };

      setEligibilityEmployees((current) =>
        current.map(updateEligibilityEmployee),
      );

      setEmployees((current) => current.map(updateEligibilityEmployee));

      showBanner(
        "Eligibility imported",

        `${previewChanges.length} employee record(s) updated.`,
      );
    } else {
      /* ========================================================
         ROSTER IMPORT
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

          /* ====================================================
             NEW EMPLOYEE
             ==================================================== */

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

          /* ====================================================
             EXISTING EMPLOYEE
             ==================================================== */

          const updatedEmployee = {
            ...next[existingIndex],
          };

          Object.entries(change.fields || {}).forEach(([field, value]) => {
            const isSupportedField = FIELD_DEFS.some(
              (definition) => definition.key === field,
            );

            if (isSupportedField) {
              updatedEmployee[field] = String(value ?? "").trim();
            }
          });

          next[existingIndex] = updatedEmployee;
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

  /* ============================================================
     ELIGIBILITY CRITERIA
     ============================================================ */

  const applyEligibilityCriteria = ({
    departments,
    designations,
    excludedEmployees: excluded,
    cutoffDate,
  }) => {
    let evaluated = 0;

    const updateEmployee = (employee) => {
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
    };

    /*
     * Apply criteria to ALL eligibility employees.
     */
    setEligibilityEmployees((current) => current.map(updateEmployee));

    /*
     * Also update current roster page if those employees
     * are currently visible there.
     */
    setEmployees((current) => current.map(updateEmployee));

    showBanner(
      "Criteria applied",

      `${evaluated} active employee(s) evaluated. Manual overrides were left unchanged.`,
    );
  };

  /* ============================================================
     SAVE INDIVIDUAL ELIGIBILITY
     ============================================================ */

  const saveEligibility = ({ empId, eligible, eligibleReason }) => {
    const nextStatus = eligible === "Yes" ? "Active" : "Inactive";

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

    /*
     * Update the full Eligibility List dataset.
     */
    setEligibilityEmployees((current) => current.map(updateEmployee));

    /*
     * Update the current Employee Master page if the employee
     * happens to be visible there.
     */
    setEmployees((current) => current.map(updateEmployee));

    /*
     * Keep local eligibility cache updated.
     */
    const savedEmployee = eligibilityEmployees.find(
      (employee) => normalizeEmpId(employee.empId) === normalizeEmpId(empId),
    );

    if (savedEmployee) {
      saveEmployees([updateEmployee(savedEmployee)]);
    }

    setEligibilityEmployee(null);

    showBanner(
      "Eligibility updated",

      `${empId} is now ${
        eligible === "Yes" ? "Eligible / Active" : "Not Eligible / Inactive"
      }.`,
    );
  };

  /* ============================================================
     UI
     ============================================================ */

  return (
    <AppShell>
      <div className="employee-master-page">
        {/* ======================================================
            PAGE HEADING
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
            EMPLOYEE MASTER TAB
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

            {/* ==================================================
                IMPORT FILE INPUT
                ================================================== */}

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

            {/* ==================================================
                EMPLOYEE GRID
                ================================================== */}

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

            {/* ==================================================
                FOOTER NOTE
                ================================================== */}

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
