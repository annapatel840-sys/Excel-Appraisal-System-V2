// ============================================================
// APPRAISAL DATA
// ============================================================

// Dropdown options
export const MANAGER_RATINGS = [
  "Exceeds Expectation",
  "Meets Expectation",
  "Sometimes Meets Expectation",
];

export const STATUSES = ["Pending", "In Progress", "Completed", "Submitted"];

export const INSTALLMENT_OPTIONS = ["1", "2", "4"];

export const PROMOTION_OPTIONS = ["Yes", "No"];

export const NEW_TITLES = [
  "Associate",
  "Senior Associate",
  "Senior Analyst",
  "Team Lead",
  "Manager",
  "Senior Manager",
  "Program Executive",
  "Specialist",
];

export const DEPARTMENTS = [
  "Sales",
  "HR",
  "Marketing",
  "Operations",
  "Engineering",
  "Finance",
];

export const MANAGERS = [
  "Priya Nair",
  "Vikram Iyer",
  "Neha Gupta",
  "Arjun Mehta",
  "Sunita Rao",
];

// ============================================================
// CALCULATIONS
// ============================================================

export const totalOfPB = (r) =>
  Number(r.allocatedPBAmount || 0) + Number(r.newPBToBeOffered || 0);

export const totalBonus = (r) => totalOfPB(r) + Number(r.newRB || 0);

export const hikeAmount = (r) => {
  if (r.hikeAmount !== undefined && r.hikeAmount !== null) {
    return Number(r.hikeAmount) || 0;
  }

  return Math.round(
    Number(r.currentAnnualBasePay || 0) * Number(r.hikeRate || 0),
  );
};

export const hikePct = (r) => {
  if (r.hikePct !== undefined && r.hikePct !== null) {
    return Number(r.hikePct) || 0;
  }

  const basePay = Number(r.currentAnnualBasePay || 0);

  return basePay ? (hikeAmount(r) / basePay) * 100 : 0;
};

export const newBaseSalary = (r) =>
  Number(r.currentAnnualBasePay || 0) + hikeAmount(r);

export const totalCTCWithRewards = (r) => newBaseSalary(r) + totalBonus(r);

export const currentRewards = (r) =>
  Number(r.rbToBePaid || 0) + Number(r.pbToBePaid || 0);

export const totalBonusHikeAmount = (r) => totalBonus(r) - currentRewards(r);

export const totalBonusHikePct = (r) => {
  const current = currentRewards(r);

  return current ? (totalBonusHikeAmount(r) / current) * 100 : 0;
};

export const totalRewardsHikeAmount = (r) =>
  hikeAmount(r) + totalBonusHikeAmount(r);

export const totalRewardsHikePct = (r) => {
  const current = Number(r.currentAnnualBasePay || 0);

  return current ? (totalRewardsHikeAmount(r) / current) * 100 : 0;
};

export const payoutPct = (r) => {
  const target = Number(r.targetPBAllocatedForMay || 0);

  return target ? (totalOfPB(r) / target) * 100 : 0;
};

export const revisedCTC = (r) =>
  Number(r.currentAnnualBasePay || 0) + hikeAmount(r);

export const totalPayout = (r) => totalBonus(r);

// ============================================================
// COLUMNS
// ============================================================

export const COLUMNS = [
  {
    key: "empId",
    label: "EMP ID",
    type: "text",
    editable: false,
    width: 100,
  },
  {
    key: "name",
    label: "Employee Name",
    type: "text",
    editable: false,
    width: 190,
  },
  {
    key: "designation",
    label: "Designation",
    type: "text",
    editable: false,
    width: 170,
  },
  {
    key: "reportingManager",
    label: "Reporting Manager",
    type: "text",
    editable: false,
    width: 170,
  },
  {
    key: "compManager",
    label: "Comp. Manager",
    type: "text",
    editable: false,
    width: 150,
  },
  {
    key: "appraiserTechED",
    label: "Appraiser Tech-ED",
    type: "text",
    editable: false,
    width: 160,
  },
  {
    key: "wissenExperience",
    label: "Wissen Experience",
    type: "decimal",
    editable: true,
    width: 150,
  },
  {
    key: "totalExperience",
    label: "Total Experience",
    type: "decimal",
    editable: true,
    width: 140,
  },
  {
    key: "lastAppraisalDate",
    label: "Last Appraisal (Date)",
    type: "date",
    editable: true,
    width: 160,
  },
  {
    key: "managerRating",
    label: "Manager Rating",
    type: "enum",
    editable: false,
    options: MANAGER_RATINGS,
    width: 210,
  },
  {
    key: "interviewCount",
    label: "Interview Count",
    type: "number",
    editable: true,
    width: 140,
  },
  {
    key: "rrPercent",
    label: "RR%",
    type: "percent",
    editable: true,
    width: 100,
  },
  {
    key: "grossMargin",
    label: "Gross Margin",
    type: "decimal",
    editable: true,
    width: 130,
  },
  {
    key: "rbToBePaid",
    label: "RB to be paid",
    type: "currency",
    editable: true,
    width: 140,
  },
  {
    key: "monthRB",
    label: "Month (RB)",
    type: "text",
    editable: true,
    width: 120,
  },
  {
    key: "pbToBePaid",
    label: "PB to be paid",
    type: "currency",
    editable: true,
    width: 140,
  },
  {
    key: "monthPB",
    label: "Month (PB)",
    type: "text",
    editable: true,
    width: 120,
  },
  {
    key: "currentAnnualBasePay",
    label: "Current Annual Base Pay",
    type: "currency",
    editable: true,
    width: 180,
  },
  {
    key: "targetPBAllocatedForMay",
    label: "Target PB allocated for May",
    type: "currency",
    editable: true,
    width: 190,
  },
  {
    key: "allocatedPBAmount",
    label: "Allocated PB Amount",
    type: "currency",
    editable: true,
    width: 170,
  },
  {
    key: "pbInstallment",
    label: "Instalment",
    type: "enum",
    editable: true,
    options: INSTALLMENT_OPTIONS,
    width: 110,
  },
  {
    key: "newPBToBeOffered",
    label: "New PB to be Offered",
    type: "currency",
    editable: true,
    width: 170,
  },
  {
    key: "newPBInstallment",
    label: "Instalment",
    type: "enum",
    editable: true,
    options: INSTALLMENT_OPTIONS,
    width: 110,
  },
  {
    key: "totalOfPB",
    label: "Total of PB",
    type: "currency",
    editable: false,
    computed: true,
    fn: totalOfPB,
    width: 140,
  },
  {
    key: "newRB",
    label: "New RB",
    type: "currency",
    editable: true,
    width: 120,
  },
  {
    key: "totalBonus",
    label: "Total Bonus (PB and RB)",
    type: "currency",
    editable: false,
    computed: true,
    fn: totalBonus,
    width: 190,
  },
  {
    key: "hikeAmount",
    label: "Hike Amount",
    type: "currency",
    editable: true,
    width: 140,
  },
  {
    key: "hikePct",
    label: "Hike%",
    type: "percent",
    editable: true,
    width: 100,
  },
  {
    key: "totalCTCWithRewards",
    label: "Total CTC with Rewards",
    type: "currency",
    editable: false,
    computed: true,
    fn: totalCTCWithRewards,
    width: 190,
  },
  {
    key: "totalBonusHikeAmount",
    label: "Total Bonus Hike Amount",
    type: "currency",
    editable: false,
    computed: true,
    fn: totalBonusHikeAmount,
    width: 190,
  },
  {
    key: "totalBonusHikePct",
    label: "Total Bonus Hike%",
    type: "percent",
    editable: false,
    computed: true,
    fn: totalBonusHikePct,
    width: 160,
  },
  {
    key: "totalRewardsHikeAmount",
    label: "Total Rewards Hike Amount",
    type: "currency",
    editable: false,
    computed: true,
    fn: totalRewardsHikeAmount,
    width: 200,
  },
  {
    key: "totalRewardsHikePct",
    label: "Total Rewards Hike%",
    type: "percent",
    editable: false,
    computed: true,
    fn: totalRewardsHikePct,
    width: 170,
  },
  {
    key: "newBaseSalary",
    label: "New Base Salary",
    type: "currency",
    editable: false,
    computed: true,
    fn: newBaseSalary,
    width: 160,
  },
  {
    key: "targetPBNextYear",
    label: "Target PB for Next Year",
    type: "currency",
    editable: true,
    width: 180,
  },
  {
    key: "eligibleForPromotion",
    label: "Eligible for Promotion",
    type: "enum",
    editable: true,
    options: PROMOTION_OPTIONS,
    width: 170,
  },
  {
    key: "newTitle",
    label: "New Title",
    type: "enum",
    editable: true,
    options: NEW_TITLES,
    width: 170,
  },
  {
    key: "atRisk",
    label: "At Risk",
    type: "textarea",
    editable: true,
    width: 220,
  },
];

// ============================================================
// COMPUTED / EDITABLE KEYS
// ============================================================

export const COMPUTED_COLUMNS = COLUMNS.filter((c) => c.computed).map((c) => ({
  key: c.key,
  label: c.label,
  fn: c.fn,
  kind: c.type === "currency" ? "currency" : "percent",
  width: c.width,
}));

export const EDITABLE_KEYS = COLUMNS.filter((c) => c.editable).map(
  (c) => c.key,
);

// ============================================================
// FORMATTING
// ============================================================

export const inr = (n) =>
  "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");

export const pct = (n) => `${Number(n || 0).toFixed(1)}%`;

export function formatValue(row, col) {
  const value = col.computed && col.fn ? col.fn(row) : row[col.key];

  if (col.type === "currency") return inr(value);

  if (col.type === "percent") return pct(value);

  if (col.type === "decimal") {
    return Number(value || 0).toFixed(2);
  }

  return String(value ?? "");
}
