/*
 * DEMO ONLY
 *
 * This file represents previous-year appraisal data.
 * Later this will be replaced with data fetched from Zoho Creator.
 *
 * Key: Employee ID
 */

const PREVIOUS_YEAR_DATA = {
  E001: {
    appraisalYear: "2024-25",

    basePay: 420000,

    allocatedPB: 40000,
    allocatedPBInstallment: "4",

    performanceBonus: 30000,
    performanceBonusInstallment: "4",

    retentionBonus: 20000,
    retentionBonusInstallment: "2",

    totalPB: 70000,
    totalBonus: 90000,

    hikeAmount: 42000,
    hikePct: 10,

    promotion: "No",
    title: "Software Engineer",

    targetPerformanceBonus: 40000,
    targetPBInstallment: "4",

    newCTC: 552000,
  },

  E002: {
    appraisalYear: "2024-25",

    basePay: 500000,

    allocatedPB: 50000,
    allocatedPBInstallment: "4",

    performanceBonus: 40000,
    performanceBonusInstallment: "4",

    retentionBonus: 25000,
    retentionBonusInstallment: "2",

    totalPB: 90000,
    totalBonus: 115000,

    hikeAmount: 50000,
    hikePct: 10,

    promotion: "Yes",
    title: "Senior Software Engineer",

    targetPerformanceBonus: 50000,
    targetPBInstallment: "4",

    newCTC: 665000,
  },

  E003: {
    appraisalYear: "2024-25",

    basePay: 600000,

    allocatedPB: 60000,
    allocatedPBInstallment: "4",

    performanceBonus: 50000,
    performanceBonusInstallment: "4",

    retentionBonus: 30000,
    retentionBonusInstallment: "2",

    totalPB: 110000,
    totalBonus: 140000,

    hikeAmount: 60000,
    hikePct: 10,

    promotion: "No",
    title: "Technical Lead",

    targetPerformanceBonus: 60000,
    targetPBInstallment: "4",

    newCTC: 800000,
  },
};

export function getPreviousYearData(empId) {
  return PREVIOUS_YEAR_DATA[empId] ?? null;
}