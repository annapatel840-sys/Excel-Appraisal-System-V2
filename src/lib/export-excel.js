import * as XLSX from "xlsx";
import { COLUMNS } from "./appraisal-data";

/* ============================================================
   EXCEL FORMULA HELPERS
   ============================================================ */

const EXCEL_COLUMN_BY_KEY = {
  empId: "A",
  name: "B",
  designation: "C",
  reportingManager: "D",
  compManager: "E",
  appraiserTechED: "F",
  wissenExperience: "G",
  totalExperience: "H",
  lastAppraisalDate: "I",
  managerRating: "J",
  interviewCount: "K",
  rrPercent: "L",
  grossMargin: "M",
  rbToBePaid: "N",
  monthRB: "O",
  pbToBePaid: "P",
  monthPB: "Q",
  currentAnnualBasePay: "R",
  targetPBAllocatedForMay: "S",
  allocatedPBAmount: "T",
  pbInstallment: "U",
  newPBToBeOffered: "V",
  newPBInstallment: "W",
  totalOfPB: "X",
  newRB: "Y",
  totalBonus: "Z",
  hikeAmount: "AA",
  hikePct: "AB",
  totalCTCWithRewards: "AC",
  totalBonusHikeAmount: "AD",
  totalBonusHikePct: "AE",
  totalRewardsHikeAmount: "AF",
  totalRewardsHikePct: "AG",
  newBaseSalary: "AH",
  targetPBNextYear: "AI",
  eligibleForPromotion: "AJ",
  newTitle: "AK",
  atRisk: "AL",
};

/* ============================================================
   GET EXCEL COLUMN
   ============================================================ */

const excelColumn = (key) => EXCEL_COLUMN_BY_KEY[key] ?? null;

/* ============================================================
   FORMULA BUILDER
   ============================================================ */

const formulaFor = (rowNumber, col) => {
  const cell = (key) => {
    const column = excelColumn(key);

    if (!column) {
      return "0";
    }

    return `${column}${rowNumber}`;
  };

  switch (col.key) {
    /* ========================================================
       TOTAL PB
       allocatedPBAmount + newPBToBeOffered
       ======================================================== */

    case "totalOfPB":
      return `=${cell("allocatedPBAmount")}+${cell("newPBToBeOffered")}`;

    /* ========================================================
       TOTAL BONUS
       totalOfPB + newRB
       ======================================================== */

    case "totalBonus":
      return `=${cell("totalOfPB")}+${cell("newRB")}`;

    /* ========================================================
       NEW BASE SALARY
       currentAnnualBasePay + hikeAmount
       ======================================================== */

    case "newBaseSalary":
      return `=${cell("currentAnnualBasePay")}+${cell("hikeAmount")}`;

    /* ========================================================
       TOTAL CTC WITH REWARDS
       newBaseSalary + totalBonus
       ======================================================== */

    case "totalCTCWithRewards":
      return `=${cell("newBaseSalary")}+${cell("totalBonus")}`;

    /* ========================================================
       TOTAL BONUS HIKE AMOUNT
       totalBonus - rbToBePaid - pbToBePaid
       ======================================================== */

    case "totalBonusHikeAmount":
      return `=${cell("totalBonus")}-${cell(
        "rbToBePaid",
      )}-${cell("pbToBePaid")}`;

    /* ========================================================
       TOTAL BONUS HIKE %
       totalBonusHikeAmount /
       (rbToBePaid + pbToBePaid) * 100
       ======================================================== */

    case "totalBonusHikePct":
      return `=IFERROR(${cell(
        "totalBonusHikeAmount",
      )}/(${cell("rbToBePaid")}+${cell("pbToBePaid")})*100,0)`;

    /* ========================================================
       TOTAL REWARDS HIKE AMOUNT
       hikeAmount + totalBonusHikeAmount
       ======================================================== */

    case "totalRewardsHikeAmount":
      return `=${cell("hikeAmount")}+${cell("totalBonusHikeAmount")}`;

    /* ========================================================
       TOTAL REWARDS HIKE %
       totalRewardsHikeAmount /
       currentAnnualBasePay * 100
       ======================================================== */

    case "totalRewardsHikePct":
      return `=IFERROR(${cell(
        "totalRewardsHikeAmount",
      )}/${cell("currentAnnualBasePay")}*100,0)`;

    default:
      return null;
  }
};

/* ============================================================
   RAW VALUE FOR EXCEL
   ============================================================ */

const rawValueForColumn = (row, col) => {
  const value = row[col.key];

  if (value === null || value === undefined) {
    return "";
  }

  /*
   * Keep numeric fields as numbers.
   * Do NOT export display strings such as:
   *
   * ₹500000
   * 12.5%
   *
   * Excel formulas need actual numeric values.
   */

  if (
    col.type === "currency" ||
    col.type === "number" ||
    col.type === "decimal" ||
    col.type === "percent"
  ) {
    if (value === "") {
      return "";
    }

    const numberValue = Number(value);

    return Number.isFinite(numberValue) ? numberValue : "";
  }

  return value;
};

/* ============================================================
   EXPORT TO EXCEL
   ============================================================ */

export function exportToExcel(rows, filename = "appraisal-fy2025-26.xlsx") {
  /*
   * Build worksheet manually so calculated columns
   * contain actual Excel formulas.
   */

  const worksheetData = [];

  /* ==========================================================
     HEADER
     ========================================================== */

  worksheetData.push(COLUMNS.map((column) => column.label));

  /* ==========================================================
     ROWS
     ========================================================== */

  rows.forEach((row, index) => {
    /*
     * Excel row number starts at 2 because
     * row 1 contains headers.
     */

    const excelRowNumber = index + 2;

    const excelRow = COLUMNS.map((column) => {
      const formula = column.computed
        ? formulaFor(excelRowNumber, column)
        : null;

      /*
       * Computed fields get real Excel formulas.
       */

      if (formula) {
        return {
          f: formula.substring(1),
        };
      }

      /*
       * All other fields get their raw values.
       */

      return rawValueForColumn(row, column);
    });

    worksheetData.push(excelRow);
  });

  /* ==========================================================
     CREATE WORKSHEET
     ========================================================== */

  const worksheet = XLSX.utils.aoa_to_sheet(worksheetData);

  /* ==========================================================
     COLUMN WIDTHS
     ========================================================== */

  worksheet["!cols"] = COLUMNS.map((column) => {
    const labelLength = String(column.label ?? "").length;

    const width = Math.max(12, Math.min(28, labelLength + 3));

    return {
      wch: width,
    };
  });

  /* ==========================================================
     FREEZE HEADER ROW
     ========================================================== */

  worksheet["!freeze"] = {
    xSplit: 0,
    ySplit: 1,
  };

  /* ==========================================================
     CREATE WORKBOOK
     ========================================================== */

  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, worksheet, "Appraisal");

  /* ==========================================================
     DOWNLOAD XLSX
     ========================================================== */

  XLSX.writeFile(
    workbook,
    filename.endsWith(".xlsx") ? filename : `${filename}.xlsx`,
  );
}
