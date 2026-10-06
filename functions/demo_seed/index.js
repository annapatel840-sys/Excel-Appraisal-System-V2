"use strict";

const catalyst = require("zcatalyst-sdk-node");
const accessCore = require("./accessCore");

const TABLES = {
  audit: "74008000000034940",
  cycle: "74008000000034190",
  budget: "74008000000034565",
  employeeMaster: "74008000000035727",
  appraisal: "74008000000039094",
  payroll: "74008000000035326",
  delegation: "74008000000036124",
};

const HR = "EMP001 - Prabhuprasad Parida";
const TECH_ED = [
  "EMP002 - Ashok Kumar",
  "EMP003 - Sarmistha Acharya",
];

const DEMO_NAMES = [
  "Rahul Sharma","Neha Patel","Vikash Kumar","Sneha Das","Amit Singh",
  "Priya Nair","Rakesh Mishra","Pooja Rao","Karan Mehta","Anjali Verma",
  "Sandeep Roy","Kavita Joshi","Manish Gupta","Riya Sen","Arjun Das",
  "Nitin Kumar","Swati Sharma","Rohit Jain","Meena Das","Deepak Rao",
  "Isha Patel","Varun Singh","Nisha Kapoor","Aditya Nair","Shreya Mishra",
  "Abhishek Roy","Tanya Mehta"
];

const DESIGNATIONS = [
  "Associate","Analyst","Senior Analyst","Consultant","Senior Consultant",
  "Lead","Manager"
];

const DEPARTMENTS = ["Technology","Finance","Operations","HR","Analytics"];

function send(res, code, body) {
  res.writeHead(code, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function allRows(table) {
  const rows = [];
  let nextToken = null;
  for (;;) {
    const options = { maxRows: 200 };
    if (nextToken) options.nextToken = nextToken;
    const page = await table.getPagedRows(options);
    rows.push(...(Array.isArray(page.data) ? page.data : []));
    if (!page.more_records || !page.next_token) break;
    nextToken = page.next_token;
  }
  return rows;
}

async function insertMissing(table, rows, keyFn, existingRows) {
  const existing = new Set((existingRows || []).map(keyFn).filter(Boolean));
  const missing = rows.filter((row) => {
    const key = keyFn(row);
    return key && !existing.has(key);
  });
  if (!missing.length) return 0;
  await table.insertRows(missing);
  return missing.length;
}


function normalizeEmpId(value) {
  return String(value || "").trim().toUpperCase();
}

function resolveMasterPerson(employees, value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return null;
  return employees.find((e) => {
    const id = String(e.emp_id || "").trim().toLowerCase();
    const name = String(e.emp_name || "").trim().toLowerCase();
    return raw === id || raw === name || raw.includes(id) || (name && raw.includes(name));
  }) || null;
}

function resolveManagerId(employees, value) {
  const person = resolveMasterPerson(employees, value);
  return person ? String(person.emp_id).trim() : String(value || "").trim();
}

function resolveManagerName(employees, value) {
  const person = resolveMasterPerson(employees, value);
  return person ? String(person.emp_name || "").trim() : String(value || "").trim();
}

function safeDate(value, fallback) {
  const s = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : fallback;
}

function buildHistoryRows(employees) {
  return employees.flatMap(function (e, index) {
    const currentBase = Math.max(
      600000,
      Math.round(Number(e.current_salary || 0) / 10000) * 10000 || (600000 + (index % 10) * 50000),
    );

    // Employee_Master.current_salary is the Apr-26 base before the Apr-26 appraisal.
    // Reverse-calculate Apr-25 and Apr-24 so every year's base/hike chain remains exact.
    const pct25Target = 6 + (index % 4);       // 6%..9%
    const pct24Target = 5 + ((index + 1) % 4); // 5%..8%
    const pct26Target = 7 + ((index + 2) % 4); // 7%..10%

    const base25 = Math.round(currentBase / (1 + pct25Target / 100));
    const hike25 = currentBase - base25;
    const base24 = Math.round(base25 / (1 + pct24Target / 100));
    const hike24 = base25 - base24;
    const hike26 = Math.round(currentBase * pct26Target / 100);

    const bases = { "Apr-24": base24, "Apr-25": base25, "Apr-26": currentBase };
    const hikes = { "Apr-24": hike24, "Apr-25": hike25, "Apr-26": hike26 };

    const joinDate = safeDate(e.date_of_join, "2021-01-15");
    // Joining bonus is a one-time benefit. Put it in the first appraisal
    // cycle on/after the employee's joining date, and never repeat it.
    let joiningBonusYear = null;
    if (joinDate <= "2024-04-30") joiningBonusYear = "Apr-24";
    else if (joinDate <= "2025-04-30") joiningBonusYear = "Apr-25";
    else if (joinDate <= "2026-04-30") joiningBonusYear = "Apr-26";

    return ["Apr-24", "Apr-25", "Apr-26"].map(function (year, yearIndex) {
      const basePay = bases[year];
      const hikeAmount = hikes[year];
      const hikePct = basePay ? Number((hikeAmount / basePay * 100).toFixed(2)) : 0;

      const allocatedPB = Math.round(basePay * (0.06 + (index % 3) * 0.01));
      const newPB = Math.round(basePay * (0.025 + (yearIndex % 2) * 0.005));
      const totalPB = allocatedPB + newPB;
      const retentionBonus = Math.round(basePay * 0.015);
      const joiningBonus = year === joiningBonusYear ? 25000 : 0;
      // Total Bonus excludes Joining Bonus because Joining Bonus is a separate one-time component.
      const totalBonus = totalPB + retentionBonus;
      const targetPerformanceBonus = Math.round(basePay * 0.10);

      const promotion = year === "Apr-26" && index % 7 === 0 ? "Yes" : "No";
      const title = promotion === "Yes"
        ? (String(e.designation || "Consultant").toLowerCase().includes("manager")
          ? String(e.designation)
          : "Senior " + String(e.designation || "Consultant"))
        : String(e.designation || "Consultant");

      const rating = Number((3.2 + ((index + yearIndex) % 8) * 0.2).toFixed(1));

      return {
        emp_id: String(e.emp_id || "").trim(),
        appraisal_year: year,
        base_pay: basePay,
        allocated_pb: allocatedPB,
        allocated_pb_installment: year === "Apr-24" ? 1 : 2,
        // The frontend history panel treats performance_bonus as the employee's total PB.
        performance_bonus: totalPB,
        performance_bonus_installment: year === "Apr-24" ? 1 : 2,
        retention_bonus: retentionBonus,
        total_pb: totalPB,
        joining_bonus: joiningBonus,
        total_bonus: totalBonus,
        hike_amount: hikeAmount,
        hike_pct: hikePct,
        promotion,
        title,
        target_performance_bonus: targetPerformanceBonus,
        new_ctc: basePay + hikeAmount + totalBonus,
        manager_rating: String(rating) + " / 5",
        rating,
      };
    });
  });
}

function buildAppraisalRows(employees) {
  const historyRows = buildHistoryRows(employees);
  const currentRows = historyRows.filter((r) => r.appraisal_year === "Apr-26");

  return currentRows.map((h, index) => {
    const e = employees.find((employee) => normalizeEmpId(employee.emp_id) === normalizeEmpId(h.emp_id)) || {};
    const reportingManager = resolveMasterPerson(employees, e.repo_manager);
    const compManager = resolveMasterPerson(employees, e.director);
    const techEd = resolveMasterPerson(employees, e.appraiser_tech_ed);
    const promotion = h.promotion === "Yes";

    const currentRewardsPB = Math.round(Number(h.base_pay || 0) * 0.04);
    const currentRewardsRB = Math.round(Number(h.base_pay || 0) * 0.02);

    return {
      emp_id: String(e.emp_id || "").trim(),
      name: String(e.emp_name || "").trim(),
      designation: String(e.designation || "Consultant").trim(),
      reporting_manager: reportingManager ? String(reportingManager.emp_name || "").trim() : String(e.repo_manager || "").trim(),
      comp_manager: compManager ? String(compManager.emp_name || "").trim() : String(e.director || "").trim(),
      appraiser_tech_ed: techEd ? String(techEd.emp_name || "").trim() : String(e.appraiser_tech_ed || "").trim(),
      department: String(e.department || "").trim(),
      manager: reportingManager ? String(reportingManager.emp_name || "").trim() : String(e.repo_manager || "").trim(),
      status: String(e.emp_status || "Active").trim(),
      wissen_experience: Number(e.wissen_experience || 0),
      total_experience: Number(e.total_experience || 0),
      last_appraisal_date: "2026-04-01",
      manager_rating: h.manager_rating,
      interview_count: (index % 4) + 1,
      rr_percent: Number((72 + (index % 6) * 2.5).toFixed(2)),
      gross_margin: Math.round(22 + (index % 5) * 3),
      rb_to_be_paid: currentRewardsRB,
      month_rb: "Apr-26",
      pb_to_be_paid: currentRewardsPB,
      month_pb: "Apr-26",
      current_annual_base_pay: h.base_pay,
      target_pb_allocated_for_may: h.target_performance_bonus,
      allocated_pb_amount: h.allocated_pb,
      pb_installment: h.allocated_pb_installment,
      new_pb_to_be_offered: h.performance_bonus - h.allocated_pb,
      new_pb_installment: h.performance_bonus_installment,
      new_rb: h.retention_bonus,
      hike_amount: h.hike_amount,
      hike_pct: h.hike_pct,
      target_pb_next_year: h.target_performance_bonus,
      eligible_for_promotion: promotion ? "Yes" : "No",
      new_title: promotion ? h.title : "",
      at_risk: index % 9 === 0 ? "Review required" : "",
      joining_date: safeDate(e.date_of_join, "2021-01-15"),
      manager_email_id: reportingManager ? String(reportingManager.email_id || "").trim() : "",
      super_man_email_id: compManager ? String(compManager.email_id || "").trim() : "",
      rating: h.rating,
      eligible_status: String(e.emp_status || "").toLowerCase() === "active" ? "eligible" : "not eligible",
      joining_bonus: h.joining_bonus,
      emp_master_row_id: e.ROWID,
    };
  });
}

function buildPayrollRows(employees) {
  return buildHistoryRows(employees);
}

function buildAuditRows(employees) {
  return employees.slice(0, 20).map((e, index) => ({
    emp_id: e.emp_id,
    employee_name: e.emp_name,
    field_name: index % 2 === 0 ? "hike_amount" : "eligible_for_promotion",
    old_value: index % 2 === 0 ? "0" : "No",
    new_value: index % 2 === 0 ? String(25000 + index * 1000) : "Yes",
    changed_by: HR,
    changed_at: "2026-04-" + String((index % 20) + 1).padStart(2, "0") + " 10:30:00",
    source: "demo_seed",
    batch_id: "DEMO-APR26",
    appraisal_year: "Apr-26",
  }));
}

async function ensureCycle(cycleTable) {
  const cycles = await allRows(cycleTable);
  let cycle = cycles.find((r) => String(r.cycle_name || "").trim() === "Apr-26");

  if (!cycle) {
    const activeExists = cycles.some((r) => String(r.status || "").toLowerCase() === "active");
    const created = await cycleTable.insertRow({
      cycle_name: "Apr-26",
      start_date: "2026-04-01",
      end_date: "2027-03-31",
      status: activeExists ? "Upcoming" : "Active",
      remarks: "Demo appraisal cycle for application testing",
      changed_by: HR,
      changed_at: "2026-04-01 09:00:00",
      archived: false,
    });
    cycle = created;
  }

  return cycle;
}

async function seed(req, res) {
  const userApp = catalyst.initialize(req);

  let user;
  try {
    user = await userApp.userManagement().getCurrentUser();
  } catch (error) {
    return send(res, 401, { success: false, message: "Please sign in as HR before running demo seed." });
  }

  const app = catalyst.initialize(req, { scope: "admin" });
  const ds = app.datastore();

  let access;
  try {
    access = await accessCore.get(userApp, { admin: app });
  } catch (error) {
    return send(res, 403, { success: false, message: error?.message || "Demo seed is restricted to HR." });
  }

  if (access?.role !== "hr") {
    return send(res, 403, { success: false, message: "Demo seed is restricted to HR." });
  }

  const tables = {
    audit: ds.table(TABLES.audit),
    cycle: ds.table(TABLES.cycle),
    budget: ds.table(TABLES.budget),
    employeeMaster: ds.table(TABLES.employeeMaster),
    appraisal: ds.table(TABLES.appraisal),
    payroll: ds.table(TABLES.payroll),
    delegation: ds.table(TABLES.delegation),
  };

  const existingMaster = await allRows(tables.employeeMaster);
  const employees = existingMaster
    .filter((e) => String(e.emp_id || "").trim())
    .sort((a, b) => normalizeEmpId(a.emp_id).localeCompare(normalizeEmpId(b.emp_id)))
    .slice(0, 30);

  if (employees.length !== 30) {
    return send(res, 400, {
      success: false,
      message: "Expected 30 Employee Master records, but found " + employees.length + ". Seed stopped without changing Appraisal Sheet or Payroll Data.",
    });
  }

  const cycle = await ensureCycle(tables.cycle);
  const cycleId = String(cycle.ROWID);

  const existingAppraisal = await allRows(tables.appraisal);
  const appraisalRows = buildAppraisalRows(employees);
  const appraisalAdded = await insertMissing(
    tables.appraisal,
    appraisalRows,
    (r) => String(r.emp_id || "").trim().toUpperCase(),
    existingAppraisal,
  );

  const existingPayroll = await allRows(tables.payroll);
  const payrollRows = buildPayrollRows(employees);
  const payrollAdded = await insertMissing(
    tables.payroll,
    payrollRows,
    (r) => String(r.emp_id || "").trim().toUpperCase() + "|" + String(r.appraisal_year || ""),
    existingPayroll,
  );

  const existingDelegation = await allRows(tables.delegation);
  const hrPerson = employees.find((e) => normalizeEmpId(e.emp_id) === "EMP001") || employees[0];
  const techPeople = employees.filter((e) =>
    String(e.designation || "").toLowerCase().includes("tech") ||
    String(e.emp_id || "").toUpperCase() === "EMP002" ||
    String(e.emp_id || "").toUpperCase() === "EMP003"
  );
  const techEdPeople = techPeople.length >= 2 ? techPeople.slice(0, 2) : employees.slice(1, 3);

  const delegationRows = employees
    .filter((e) => !["EMP001", "EMP002", "EMP003"].includes(normalizeEmpId(e.emp_id)))
    .map((e, index) => ({
      cycle_id: cycleId,
      emp_id: String(e.emp_id).trim(),
      comp_manager_id: String(hrPerson.emp_id).trim(),
      appraiser_tech_ed_id: String(techEdPeople[index % techEdPeople.length].emp_id).trim(),
    }));

  const delegationAdded = await insertMissing(
    tables.delegation,
    delegationRows,
    (r) => String(r.cycle_id || "") + "|" + String(r.emp_id || "").toUpperCase(),
    existingDelegation,
  );

  const existingBudget = await allRows(tables.budget);
  const budgetRows = [
    {
      appraisal_cycle_id: cycleId,
      tech_ed_id: String(techEdPeople[0].emp_id).trim(),
      budget_percentage: 50,
      budget_amount: 1000000,
      additional_budget: 50000,
      budget_utilized: 375000,
      budget_remaining: 675000,
      status: "Active",
    },
    {
      appraisal_cycle_id: cycleId,
      tech_ed_id: String(techEdPeople[1].emp_id).trim(),
      budget_percentage: 50,
      budget_amount: 1000000,
      additional_budget: 50000,
      budget_utilized: 425000,
      budget_remaining: 625000,
      status: "Active",
    },
  ];

  const budgetAdded = await insertMissing(
    tables.budget,
    budgetRows,
    (r) => String(r.appraisal_cycle_id || "") + "|" + String(r.tech_ed_id || "").trim().toUpperCase(),
    existingBudget,
  );

  const existingAudit = await allRows(tables.audit);
  const auditRows = buildAuditRows(employees);
  const auditAdded = await insertMissing(
    tables.audit,
    auditRows,
    (r) => String(r.batch_id || "") + "|" + String(r.emp_id || "") + "|" + String(r.field_name || ""),
    existingAudit,
  );

  return send(res, 200, {
    success: true,
    message: "Demo data seed completed.",
    cycle: { id: cycleId, name: cycle.cycle_name, status: cycle.status },
    added: {
      employeeMaster: 0,
      appraisalSheet: appraisalAdded,
      payrollData: payrollAdded,
      delegation: delegationAdded,
      budgetMaster: budgetAdded,
      auditTrail: auditAdded,
    },
    businessData: {
      totalEmployeesTarget: employees.length,
      techEdOwners: techEdPeople.map((e) => String(e.emp_id).trim()),
      hrOwner: String(hrPerson.emp_id).trim(),
      appraisalCycle: "Apr-26",
    },
  });
}

module.exports = async function demoSeed(req, res) {
  try {
    if (req.method === "GET") {
      return send(res, 200, {
        success: true,
        message: "Demo seed function is ready. POST to /server/demo_seed/ while signed in as HR.",
        targetEmployees: 30,
        targetBudgetOwners: TECH_ED,
        cycle: "Apr-26",
      });
    }

    if (req.method !== "POST") {
      return send(res, 405, { success: false, message: "POST /server/demo_seed/ is required." });
    }

    return await seed(req, res);
  } catch (error) {
    console.error("demo_seed:", error);
    return send(res, 500, {
      success: false,
      message: error?.message || "Demo seed failed.",
      stack: process.env.NODE_ENV === "development" ? error?.stack : undefined,
    });
  }
};
