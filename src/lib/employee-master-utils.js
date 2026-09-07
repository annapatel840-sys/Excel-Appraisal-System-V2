import { FIELD_DEFS } from "./employee-master-data";

/* ============================================================
   DATE / EXPERIENCE
============================================================ */

export function calcOrgExperience(dojStr, refDate) {
  if (!dojStr) return "";

  const doj = new Date(dojStr);

  if (Number.isNaN(doj.getTime())) {
    return "";
  }

  const ref = refDate || new Date();

  if (doj > ref) {
    return "0 yrs 0 mo";
  }

  let months =
    (ref.getFullYear() - doj.getFullYear()) * 12 +
    (ref.getMonth() - doj.getMonth());

  if (ref.getDate() < doj.getDate()) {
    months--;
  }

  months = Math.max(0, months);

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  return `${years} yrs ${remainingMonths} mo`;
}

export function fmtDoj(dojStr) {
  if (!dojStr) return "";

  const date = new Date(dojStr);

  if (Number.isNaN(date.getTime())) {
    return dojStr;
  }

  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/* ============================================================
   CSV PARSER
============================================================ */

export function parseCsv(text) {
  if (!text) return [];

  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (insideQuotes && next === '"') {
        cell += '"';
        i++;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (char === "," && !insideQuotes) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !insideQuotes) {
      if (char === "\r" && next === "\n") {
        i++;
      }

      row.push(cell.trim());
      cell = "";

      if (row.some((value) => value !== "")) {
        rows.push(row);
      }

      row = [];
    } else {
      cell += char;
    }
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell.trim());

    if (row.some((value) => value !== "")) {
      rows.push(row);
    }
  }

  return rows;
}

/* ============================================================
   CSV ROWS -> OBJECTS
============================================================ */

export function csvRowsToObjects(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const headers = rows[0].map((header) => String(header || "").trim());

  return rows.slice(1).map((row) => {
    const obj = {};

    headers.forEach((header, index) => {
      obj[header] = row[index] ?? "";
    });

    return obj;
  });
}

/* ============================================================
   HEADER NORMALIZATION
============================================================ */

function normalizeHeader(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s._/-]+/g, "")
    .replace(/[()]/g, "");
}

/* ============================================================
   FIND FIELD FOR UPLOAD HEADER
============================================================ */

export function findFieldForHeader(header) {
  const normalized = normalizeHeader(header);

  if (!normalized) {
    return null;
  }

  for (const field of FIELD_DEFS) {
    const candidates = [field.label, field.key, ...(field.uploadHeaders || [])];

    for (const candidate of candidates) {
      if (normalizeHeader(candidate) === normalized) {
        return field.key;
      }
    }
  }

  return null;
}

/* ============================================================
   ELIGIBILITY VALUE NORMALIZATION
============================================================ */

export function normalizeEligibleValue(value) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();

  if (["yes", "eligible", "y", "true", "1"].includes(normalized)) {
    return "Yes";
  }

  if (
    ["no", "not eligible", "noteligible", "n", "false", "0"].includes(
      normalized,
    )
  ) {
    return "No";
  }

  return "";
}

/* ============================================================
   TEXT SEARCH
============================================================ */

export function matchesSearch(employee, search) {
  const term = String(search || "")
    .trim()
    .toLowerCase();

  if (!term) {
    return true;
  }

  return [employee?.name, employee?.empId, employee?.organization].some(
    (value) =>
      String(value || "")
        .toLowerCase()
        .includes(term),
  );
}

/* ============================================================
   SAFE VALUE
============================================================ */

export function safeValue(value) {
  return value == null ? "" : String(value);
}
