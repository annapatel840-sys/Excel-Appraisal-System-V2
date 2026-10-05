"use strict";

const catalyst = require("zcatalyst-sdk-node");
const accessCore = require("./accessCore");

const TABLES = {
  audit: "74008000000034940",       // Catalyst Console → Data Store → Appraisal_AuditTable → Table ID
  cycle: "74008000000034190",       // Catalyst Console → Data Store → Appraisal_Cycle_MasterTable → Table ID
  budget: "74008000000034565",      // Catalyst Console → Data Store → Budget_MasterTable → Table ID
  employeeMaster: "74008000000035727", // Catalyst Console → Data Store → Employee_MasterTable → Table ID
  appraisal: "74008000000039094",   // Catalyst Console → Data Store → Appraisal_SheetTable → Table ID
  payroll: "74008000000035326",     // Catalyst Console → Data Store → Payroll_DataTable → Table ID
  delegation: "74008000000036124",  // Catalyst Console → Data Store → DelegationTable → Table ID
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

function buildEmployees() {
  const base = [
    {
      emp_id: "EMP001",
      emp_name: "Prabhuprasad Parida",
      designation: "HR Manager",
      department: "HR",
      repo_manager: "Management",
      director: "Management",
      appraiser_tech_ed: "",
      email_id: "prabhuprasad.parida@demo.local",
      emp_status: "Active",
      emp_type: "Full Time",
      location: "Bhubaneswar",
      cost_center: "HR-001",
      current_salary: 900000,
      wissen_experience: 3.5,
      total_experience: 4.5,
    },
    {
      emp_id: "EMP002",
      emp_name: "Ashok Kumar",
      designation: "Tech-Ed",
      department: "Technology",
      repo_manager: HR,
      director: HR,
      appraiser_tech_ed: "",
      email_id: "ashok.kumar@demo.local",
      emp_status: "Active",
      emp_type: "Full Time",
      location: "Bhubaneswar",
      cost_center: "TECH-001",
      current_salary: 1100000,
      wissen_experience: 4.2,
      total_experience: 5.5,
    },
    {
      emp_id: "EMP003",
      emp_name: "Sarmistha Acharya",
      designation: "Tech-Ed",
      department: "Technology",
      repo_manager: HR,
      director: HR,
      appraiser_tech_ed: "",
      email_id: "sarmistha.acharya@demo.local",
      emp_status: "Active",
      emp_type: "Full Time",
      location: "Bhubaneswar",
      cost_center: "TECH-002",
      current_salary: 1050000,
      wissen_experience: 3.8,
      total_experience: 5.0,
    },
  ];

  const demos = DEMO_NAMES.map((name, index) => {
    const n = index + 4;
    const tech = n % 2 === 0 ? TECH_ED[0] : TECH_ED[1];
    return {
      emp_id: "EMP" + String(n).padStart(3, "0"),
      emp_name: name,
      designation: DESIGNATIONS[index % DESIGNATIONS.length],
      department: DEPARTMENTS[index % DEPARTMENTS.length],
      repo_manager: tech,
      director: HR,
      appraiser_tech_ed: tech,
      email_id: name.toLowerCase().replace(/[^a-z]+/g, ".") + "@demo.local",
      date_of_join: "2021-" + String((index % 9) + 1).padStart(2, "0") + "-15",
      emp_status: "Active",
      emp_type: index % 9 === 0 ? "Contract" : "Full Time",
      wissen_experience: Number((2.0 + (index % 7) * 0.6).toFixed(1)),
      total_experience: Number((3.0 + (index % 8) * 0.8).toFixed(1)),
      cost_center: "CC-" + String((index % 5) + 1).padStart(3, "0"),
      current_salary: 450000 + index * 25000,
      location: index % 3 === 0 ? "Bhubaneswar" : index % 3 === 1 ? "Pune" : "Bengaluru",
      last_appraisal_month_year: "Apr-25",
    };
  });

  return base.concat(demos);
}

function buildAppraisalRows(employees) {
  return employees.map((e, index) => {
    const salary = Number(e.current_salary || 500000);
    const hikePct = Number((5 + (index % 6)).toFixed(1));
    const hikeAmount = Math.round(salary * hikePct / 100);

    const allocatedPb = Math.round(salary * 0.08);
    const performanceBonus = Math.round(salary * 0.04);
    const retentionBonus = Math.round(salary * 0.02);
    const joiningBonus = index % 12 === 0 ? 25000 : 0;
    const targetPerformanceBonus = Math.round(salary * 0.11);
    const totalPb = allocatedPb + performanceBonus;
    const totalBonus = totalPb + retentionBonus + joiningBonus;
    const promotion = index % 7 === 0 ? "Yes" : "No";
    const title = promotion === "Yes"
      ? DESIGNATIONS[Math.min(DESIGNATIONS.length - 1, (index % 6) + 1)]
      : e.designation;

    return {
      emp_id: e.emp_id,
      appraisal_year: "Apr-26",
      base_pay: salary,
      allocated_pb: allocatedPb,
      allocated_pb_installment: (index % 2) + 1,
      performance_bonus: performanceBonus,
      performance_bonus_installment: (index % 2) + 1,
      retention_bonus: retentionBonus,
      total_pb: totalPb,
      joining_bonus: joiningBonus,
      total_bonus: totalBonus,
      hike_amount: hikeAmount,
      hike_pct: hikePct,
      promotion,
      title,
      target_performance_bonus: targetPerformanceBonus,
      new_ctc: salary + hikeAmount + totalBonus,
      manager_rating: String((3.2 + (index % 9) * 0.2).toFixed(1)) + " / 5",
      rating: Number((3.2 + (index % 9) * 0.2).toFixed(1)),
    };
  });
}

function buildPayrollRows(employees) {
  return employees.map((e, index) => {
    const salary = Number(e.current_salary || 500000);
    const hikePct = Number((5 + (index % 6)).toFixed(1));
    const hikeAmount = Math.round(salary * hikePct / 100);

    const allocatedPb = Math.round(salary * 0.08);
    const performanceBonus = Math.round(salary * 0.04);
    const retentionBonus = Math.round(salary * 0.02);
    const joiningBonus = index % 12 === 0 ? 25000 : 0;
    const targetPerformanceBonus = Math.round(salary * 0.11);
    const totalPb = allocatedPb + performanceBonus;
    const totalBonus = totalPb + retentionBonus + joiningBonus;
    const promotion = index % 7 === 0 ? "Yes" : "No";
    const title = promotion === "Yes"
      ? DESIGNATIONS[Math.min(DESIGNATIONS.length - 1, (index % 6) + 1)]
      : e.designation;

    return {
      emp_id: e.emp_id,
      appraisal_year: "Apr-26",
      base_pay: salary,
      allocated_pb: allocatedPb,
      allocated_pb_installment: (index % 2) + 1,
      performance_bonus: performanceBonus,
      performance_bonus_installment: (index % 2) + 1,
      retention_bonus: retentionBonus,
      total_pb: totalPb,
      joining_bonus: joiningBonus,
      total_bonus: totalBonus,
      hike_amount: hikeAmount,
      hike_pct: hikePct,
      promotion,
      title,
      target_performance_bonus: targetPerformanceBonus,
      new_ctc: salary + hikeAmount + totalBonus,
      manager_rating: String((3.2 + (index % 9) * 0.2).toFixed(1)) + " / 5",
      rating: Number((3.2 + (index % 9) * 0.2).toFixed(1)),
    };
  });
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

  const employees = buildEmployees();
  const cycle = await ensureCycle(tables.cycle);
  const cycleId = String(cycle.ROWID);

  const existingMaster = await allRows(tables.employeeMaster);
  const masterAdded = await insertMissing(
    tables.employeeMaster,
    employees,
    (r) => String(r.emp_id || "").trim().toUpperCase(),
    existingMaster,
  );

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
  const delegationRows = employees
    .filter((e) => !["EMP001", "EMP002", "EMP003"].includes(e.emp_id))
    .map((e) => ({
      cycle_id: cycleId,
      emp_id: e.emp_id,
      comp_manager_id: "EMP001",
      appraiser_tech_ed_id: Number(e.emp_id.slice(3)) % 2 === 0 ? "EMP002" : "EMP003",
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
      tech_ed_id: TECH_ED[0],
      budget_percentage: 50,
      budget_amount: 1000000,
      additional_budget: 50000,
      budget_utilized: 375000,
      budget_remaining: 675000,
      status: "Active",
    },
    {
      appraisal_cycle_id: cycleId,
      tech_ed_id: TECH_ED[1],
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
      employeeMaster: masterAdded,
      appraisalSheet: appraisalAdded,
      payrollData: payrollAdded,
      delegation: delegationAdded,
      budgetMaster: budgetAdded,
      auditTrail: auditAdded,
    },
    businessData: {
      totalEmployeesTarget: employees.length,
      techEdOwners: TECH_ED,
      hrOwner: HR,
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
