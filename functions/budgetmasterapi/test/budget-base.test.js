/* budgetmasterapi GET: budget base from Appraisal_Sheet, with an in-memory
   Data Store (ZCQL + tables). Run: node test/budget-base.test.js */
'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const TABLE_IDS = { '74008000000034565': 'Budget_Master', '74008000000033809': 'Budget_Distribution', '74008000000023149': 'Budget_Distribution_Comp', '74008000000035326': 'Payroll_Data', '74008000000034190': 'Appraisal_Cycle_Master' };

function makeStore(data) {
  let seq = 5000;
  const tables = {};
  const store = { tables, app: null, schema: {} };
  Object.entries(data).forEach(([name, rows]) => {
    tables[name] = rows.map((r) => ({ ROWID: String(++seq), ...r }));
  });
  const tableApi = (name) => ({
    getAllColumns: async () => (store.schema[name] || []).map((column_name) => ({ column_name })),
    insertRow: async (row) => { const r = { ...row, ROWID: String(++seq) }; (tables[name] = tables[name] || []).push(r); return { ...r }; },
    updateRow: async (row) => { const r = (tables[name] || []).find((x) => x.ROWID === String(row.ROWID)); if (r) Object.assign(r, row); return { ...r }; },
    getPagedRows: async () => ({ data: (tables[name] || []).map((r) => ({ ...r })), more_records: false }),
  });
  const app = {
    zcql: () => ({
      executeZCQLQuery: async (sql) => {
        const m = sql.match(/FROM\s+(\w+)\s+WHERE ROWID > (\d+)/i);
        const name = m[1];
        const last = BigInt(m[2]);
        return (tables[name] || []).filter((r) => BigInt(r.ROWID) > last).slice(0, 300).map((r) => ({ [name]: { ...r } }));
      },
    }),
    datastore: () => ({ table: (id) => tableApi(TABLE_IDS[id] || id) }),
    userManagement: () => ({ getCurrentUser: async () => ({ user_id: '1', email_id: 'hr@x.com', role_details: { role_name: 'HR' } }) }),
  };
  store.app = app;
  return store;
}

function load(store) {
  const dir = path.resolve(__dirname, '..');
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(dir) && !k.includes('node_modules')) delete require.cache[k]; });
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const accessStub = {
    HttpError,
    check: async () => ({ dryRun: true, enforced: false, scope: { all: true } }),
    isEnforced: () => false,
    guard: (a, fn) => fn(),
    requireScreen: () => {},
    requireAction: () => {},
    bumpVersion: async () => {},
  };
  const orig = Module._load;
  Module._load = function (req, ...rest) {
    if (req === 'zcatalyst-sdk-node') return { initialize: () => store.app };
    if (req === './accessCore') return accessStub;
    return orig.call(this, req, ...rest);
  };
  try { return require('../index.js'); } finally { Module._load = orig; }
}

function get(api) {
  return new Promise((resolve, reject) => {
    const req = { method: 'GET', url: '/', headers: {}, on() {} };
    const res = { statusCode: 0, writeHead(s) { this.statusCode = s; }, setHeader() {}, end(t) { resolve({ status: this.statusCode, json: JSON.parse(t) }); } };
    api(req, res).catch(reject);
  });
}

const sheet = (id, techEd, cm, base, pb) => ({ emp_id: id, appraiser_tech_ed: techEd, comp_manager: cm, current_annual_base_pay: base, allocated_pb_amount: pb });
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); } }

(async () => {
  await t('formatted amounts (commas, ₹, lakh) give the right org and Tech-ED base', async () => {
    const store = makeStore({
      Budget_Master: [{ appraisal_cycle_id: 'Apr-26', budget_percentage: 8 }],
      Budget_Distribution: [], Budget_Distribution_Comp: [], Employee_Master: [], Eligibility_List: [
        { appraisal_cycle_id: 'Apr-26', emp_id: 'E1', eligibility_status: 'Eligible' },
        { appraisal_cycle_id: 'Apr-26', emp_id: 'E2', eligibility_status: 'Eligible' },
        { appraisal_cycle_id: 'Apr-26', emp_id: 'E3', eligibility_status: 'Eligible' },
      ],
      Appraisal_Sheet: [
        sheet('E1', 'EMP0051 - Ashok Kumar', 'Anita', '12,00,000', '1,00,000'),
        sheet('E2', 'EMP0051 - Ashok Kumar', 'Anita', '₹ 8,00,000', '50000'),
        sheet('E3', 'EMP0057 - Prabhu', 'Raj', '15 L', '1.5 L'),
      ],
    });
    const r = await get(load(store));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const master = r.json.master[0];
    assert.strictEqual(master.org_budget_base, 1200000 + 100000 + 800000 + 50000 + 1500000 + 150000);
    const ashok = r.json.techEd.find((x) => /Ashok/.test(x.appraiser_tech_ed_id));
    const prabhu = r.json.techEd.find((x) => /Prabhu/.test(x.appraiser_tech_ed_id));
    assert.strictEqual(ashok.budget_base, 2150000);
    assert.strictEqual(prabhu.budget_base, 1650000);
    assert.strictEqual(r.json.diagnostics.employeesWithBase, 3);
    assert.strictEqual(r.json.diagnostics.warning, undefined);
  });

  await t('prior-cycle total CTC is the budget base and new employees fall back to current CTC', async () => {
    const store = makeStore({
      Budget_Master: [{ appraisal_cycle_id: '', budget_percentage: 8 }],
      Budget_Distribution: [], Budget_Distribution_Comp: [],
      Employee_Master: [
        { emp_id: 'E1', emp_name: 'Existing Employee', emp_status: 'Active', eligibility: 'Eligible' },
        { emp_id: 'E2', emp_name: 'New Employee', emp_status: 'Active', eligibility: 'Eligible' },
      ],
      Eligibility_List: [],
      Payroll_Data: [],
      Appraisal_Cycle_Master: [
        { cycle_name: 'Apr-25', start_date: '2025-04-01', status: 'Closed' },
        { cycle_name: 'Apr-26', start_date: '2026-04-01', status: 'Active' },
      ],
      Appraisal_Sheet: [
        { emp_id: 'E1', appraiser_tech_ed: 'T1', comp_manager: 'C1', current_annual_base_pay: 1000000, hike_amount: 100000, allocated_pb_amount: 50000, new_pb_to_be_offered: 20000, new_rb: 10000 },
        { emp_id: 'E2', appraiser_tech_ed: 'T1', comp_manager: 'C1', current_annual_base_pay: 800000, hike_amount: 50000, allocated_pb_amount: 40000, new_pb_to_be_offered: 10000, new_rb: 5000 },
      ],
    });
    const previousCycleId = store.tables.Appraisal_Cycle_Master[0].ROWID;
    const currentCycleId = store.tables.Appraisal_Cycle_Master[1].ROWID;
    const existingEmployeeRowId = store.tables.Employee_Master.find((row) => row.emp_id === 'E1').ROWID;
    store.tables.Budget_Master[0].appraisal_cycle_id = currentCycleId;
    store.tables.Eligibility_List.push(
      { ROWID: '99881', appraisal_cycle_id: currentCycleId, emp_id: 'E1', eligibility_status: 'Eligible' },
      { ROWID: '99882', appraisal_cycle_id: currentCycleId, emp_id: 'E2', eligibility_status: 'Eligible' },
    );
    store.tables.Payroll_Data.push({
      ROWID: '99991',
      emp_id: existingEmployeeRowId,
      // Payroll_Data.appraisal_cycle_name stores Appraisal_Cycle_Master.ROWID.
      // The historical CTC total is computed from the prior-cycle pay/bonus columns.
      appraisal_cycle_name: previousCycleId,
      base_pay: '23,00,000',
      hike_amount: '1,00,000',
      allocated_pb: '50,000',
      performance_bonus: '25,000',
      retention_bonus: '25,000',
    });

    const r = await get(load(store));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.master[0].org_budget_base, 2500000 + 905000);
    const existing = r.json.employeeRoster.find((employee) => employee.emp_id === 'E1');
    const fresh = r.json.employeeRoster.find((employee) => employee.emp_id === 'E2');
    assert.strictEqual(existing.previous_appraisal_total_ctc_with_rewards, 2500000);
    assert.strictEqual(existing.last_appraisal_date, 'Apr-25');
    assert.strictEqual(fresh.previous_appraisal_total_ctc_with_rewards, 905000);
    assert.strictEqual(fresh.last_appraisal_date, 'New - 2026');
    const orgBase = 2500000 + 905000;
    const orgOriginal = orgBase * 0.08;
    assert.strictEqual(r.json.master[0].calculated_budget, orgOriginal);
    const techRow = r.json.techEd[0];
    const techBase = techRow.budget_base;
    const techOriginal = techRow.calculated_budget;
    assert.strictEqual(techOriginal, techBase * 0.08);

    // Changing Org and Tech-Ed percentages must change updated budgets only.
    store.tables.Budget_Master[0].budget_percentage = 10;
    const savedTech = store.tables.Budget_Distribution.find((row) => String(row.ROWID) === String(techRow.id));
    savedTech.percentage = 10;
    const changed = await get(load(store));
    assert.strictEqual(changed.status, 200, JSON.stringify(changed.json));
    assert.strictEqual(changed.json.master[0].calculated_budget, orgOriginal);
    assert.strictEqual(changed.json.master[0].applied_budget, orgBase * 0.10);
    const changedTech = changed.json.techEd.find((row) => String(row.id) === String(techRow.id));
    assert.strictEqual(changedTech.calculated_budget, techOriginal);
    assert.strictEqual(changedTech.applied_budget, techBase * 0.10);
  });

  await t('Appraisal Sheet roster (23) wins over a larger eligible master/list (30)', async () => {
    const employeeMaster = Array.from({ length: 30 }, (_, i) => ({
      emp_id: 'E' + (i + 1),
      emp_name: 'Employee ' + (i + 1),
      emp_status: 'Active',
      eligibility: 'Eligible',
      appraiser_tech_ed: 'T1',
      comp_manager: 'C1',
      current_annual_base_pay: 1000000,
    }));
    const appraisalRows = Array.from({ length: 23 }, (_, i) =>
      sheet('E' + (i + 1), 'T1', 'C1', 1000000, 0)
    );
    const store = makeStore({
      Budget_Master: [{ appraisal_cycle_id: 'Apr-26', budget_percentage: 8 }],
      Budget_Distribution: [], Budget_Distribution_Comp: [],
      Employee_Master: employeeMaster,
      Eligibility_List: Array.from({ length: 30 }, (_, i) => ({
        appraisal_cycle_id: 'Apr-26', emp_id: 'E' + (i + 1), eligibility_status: 'Eligible',
      })),
      Payroll_Data: [],
      Appraisal_Cycle_Master: [{ cycle_name: 'Apr-26', start_date: '2026-04-01', status: 'Active' }],
      Appraisal_Sheet: appraisalRows,
    });
    const cycleId = store.tables.Appraisal_Cycle_Master[0].ROWID;
    store.tables.Budget_Master[0].appraisal_cycle_id = cycleId;
    store.tables.Eligibility_List.forEach((row) => { row.appraisal_cycle_id = cycleId; });

    const r = await get(load(store));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.employeeRoster.length, 23, 'only generated Appraisal Sheet rows are returned');
    assert.strictEqual(Number(r.json.master[0].original_headcount), 23);
    assert.strictEqual(Number(r.json.master[0].current_headcount), 23);
    const tech = r.json.techEd.find((row) => row.appraiser_tech_ed_id === 'T1');
    assert.strictEqual(Number(tech.original_headcount), 23);
    assert.strictEqual(Number(tech.current_headcount), 23);
    const comp = r.json.compManager.find((row) => row.comp_manager === 'C1');
    assert.strictEqual(Number(comp.original_headcount), 23);
    assert.strictEqual(Number(comp.current_headcount), 23);

    // Reproduce the reported bug: after the baseline is saved as 23, the
    // Eligibility List later also contains 23 eligible people, but only 22 of
    // the generated Appraisal Sheet rows remain eligible. Original Count must
    // not be reset to 22 just because it matches the changing list count.
    store.tables.Eligibility_List.forEach((row) => {
      const id = String(row.emp_id);
      if (['E23', 'E24', 'E25', 'E26', 'E27', 'E28', 'E29'].includes(id)) {
        row.eligibility_status = 'Not Eligible';
      }
    });
    const changedRoster = await get(load(store));
    assert.strictEqual(changedRoster.status, 200, JSON.stringify(changedRoster.json));
    assert.strictEqual(Number(changedRoster.json.master[0].original_headcount), 23, 'Org Original Count remains the initial generated roster size');
    assert.strictEqual(Number(changedRoster.json.master[0].current_headcount), 22, 'Org Current Count follows current eligible sheet rows');
    const changedTech = changedRoster.json.techEd.find((row) => row.appraiser_tech_ed_id === 'T1');
    const changedComp = changedRoster.json.compManager.find((row) => row.comp_manager === 'C1');
    assert.strictEqual(Number(changedTech.original_headcount), 23, 'Tech-Ed Original Count remains fixed');
    assert.strictEqual(Number(changedTech.current_headcount), 22, 'Tech-Ed Current Count follows current eligible sheet rows');
    assert.strictEqual(Number(changedComp.original_headcount), 23, 'Comp Manager Original Count remains fixed');
    assert.strictEqual(Number(changedComp.current_headcount), 22, 'Comp Manager Current Count follows current eligible sheet rows');
  });

  await t('preserves saved original counts even when delegation or eligibility changes the live roster', async () => {
    const employeeMaster = Array.from({ length: 30 }, (_, i) => ({
      emp_id: 'E' + (i + 1),
      emp_name: 'Employee ' + (i + 1),
      emp_status: 'Active',
      eligibility: 'Eligible',
      appraiser_tech_ed: 'T1',
      comp_manager: 'C1',
    }));
    const store = makeStore({
      Budget_Master: [{ appraisal_cycle_id: 'Apr-26', budget_percentage: 8, original_headcount: 30, current_headcount: 30 }],
      Budget_Distribution: [{ appraisal_cycle_id: 'Apr-26', appraiser_tech_ed_id: 'T1', percentage: 8, original_headcount: 30, current_headcount: 30 }],
      Budget_Distribution_Comp: [{ appraisal_cycle_id: 'Apr-26', comp_manager: 'C1', percentage: 8, original_headcount: 30, current_headcount: 30 }],
      Employee_Master: employeeMaster,
      Eligibility_List: Array.from({ length: 30 }, (_, i) => ({
        appraisal_cycle_id: 'Apr-26',
        emp_id: 'E' + (i + 1),
        eligibility_status: i === 22 ? 'Not Eligible' : 'Eligible',
      })),
      Payroll_Data: [],
      Appraisal_Cycle_Master: [{ cycle_name: 'Apr-26', start_date: '2026-04-01', status: 'Active' }],
      Appraisal_Sheet: Array.from({ length: 23 }, (_, i) =>
        sheet('E' + (i + 1), 'T1', 'C1', 1000000, 0)
      ),
    });
    const cycleId = store.tables.Appraisal_Cycle_Master[0].ROWID;
    store.tables.Budget_Master[0].appraisal_cycle_id = cycleId;
    store.tables.Budget_Distribution[0].appraisal_cycle_id = cycleId;
    store.tables.Budget_Distribution_Comp[0].appraisal_cycle_id = cycleId;
    store.tables.Budget_Distribution_Comp[0].budget_distribution_id = store.tables.Budget_Distribution[0].ROWID;
    store.tables.Eligibility_List.forEach((row) => { row.appraisal_cycle_id = cycleId; });

    const r = await get(load(store));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(Number(r.json.master[0].original_headcount), 30, 'saved Org Original Count is never rewritten during a live refresh');
    assert.strictEqual(Number(r.json.master[0].current_headcount), 22, 'Org Current Count excludes the ineligible sheet employee');
    const tech = r.json.techEd.find((row) => row.appraiser_tech_ed_id === 'T1');
    assert.strictEqual(Number(tech.original_headcount), 30, 'saved Tech-Ed Original Count is never rewritten during a live refresh');
    assert.strictEqual(Number(tech.current_headcount), 22);
    const comp = r.json.compManager.find((row) => row.comp_manager === 'C1');
    assert.strictEqual(Number(comp.original_headcount), 30, 'saved Comp Manager Original Count is never rewritten during a live refresh');
    assert.strictEqual(Number(comp.current_headcount), 22);
  });

  await t('original counts remain fixed while current counts follow eligibility changes', async () => {
    const store = makeStore({
      Budget_Master: [{ appraisal_cycle_id: 'Apr-26', budget_percentage: 8 }],
      Budget_Distribution: [], Budget_Distribution_Comp: [],
      Employee_Master: [], Eligibility_List: [], Payroll_Data: [],
      Appraisal_Cycle_Master: [
        { cycle_name: 'Apr-26', start_date: '2026-04-01', status: 'Active' },
      ],
      Appraisal_Sheet: [
        sheet('E1', 'T1', 'C1', 1000000, 0),
        sheet('E2', 'T1', 'C1', 2000000, 0),
      ],
    });
    const cycleId = store.tables.Appraisal_Cycle_Master[0].ROWID;
    store.tables.Budget_Master[0].appraisal_cycle_id = cycleId;
    store.tables.Eligibility_List.push(
      { ROWID: '99001', appraisal_cycle_id: cycleId, emp_id: 'E1', eligibility_status: 'Eligible' },
      { ROWID: '99002', appraisal_cycle_id: cycleId, emp_id: 'E2', eligibility_status: 'Eligible' },
    );
    const api = load(store);
    const initial = await get(api);
    assert.strictEqual(initial.status, 200, JSON.stringify(initial.json));
    assert.strictEqual(Number(initial.json.master[0].original_headcount), 2);
    const initialTeam = initial.json.techEd.find((row) => /T1/.test(row.appraiser_tech_ed_id));
    assert.strictEqual(Number(initialTeam.original_headcount), 2);
    const initialComp = initial.json.compManager.find((row) => row.comp_manager === 'C1');
    assert.strictEqual(Number(initialComp.original_headcount), 2);
    const originalOrgBudget = initial.json.master[0].calculated_budget;
    const originalTechBudget = initialTeam.calculated_budget;
    const originalCompBudget = initialComp.calculated_budget;

    store.tables.Eligibility_List.find((row) => row.emp_id === 'E2').eligibility_status = 'Not Eligible';
    const changed = await get(api);
    assert.strictEqual(changed.status, 200, JSON.stringify(changed.json));
    assert.strictEqual(Number(changed.json.master[0].original_headcount), 2);
    assert.strictEqual(Number(changed.json.master[0].current_headcount), 1);
    const changedTeam = changed.json.techEd.find((row) => /T1/.test(row.appraiser_tech_ed_id));
    assert.strictEqual(Number(changedTeam.original_headcount), 2);
    assert.strictEqual(Number(changedTeam.current_headcount), 1);
    const changedComp = changed.json.compManager.find((row) => row.comp_manager === 'C1');
    assert.strictEqual(Number(changedComp.original_headcount), 2);
    assert.strictEqual(Number(changedComp.current_headcount), 1);
    assert.strictEqual(changed.json.master[0].calculated_budget, originalOrgBudget, 'Org Original Budget remains fixed when the roster changes');
    assert.strictEqual(changed.json.master[0].applied_budget, 80000, 'Org Updated Budget follows the current eligible roster and Budget Master percentage formula');
    assert.strictEqual(changedTeam.calculated_budget, originalTechBudget, 'Tech-Ed Original Budget remains fixed');
    assert.strictEqual(changedTeam.applied_budget, 80000, 'Tech-Ed Updated Budget follows the current eligible roster and Budget Master percentage formula');
    assert.strictEqual(changedComp.calculated_budget, originalCompBudget, 'Comp Manager Original Budget remains fixed');
    assert.strictEqual(changedComp.applied_budget, 80000, 'Comp Manager Updated Budget follows the current eligible roster');

    // A delegation changes team membership, not the original allocated count.
    store.tables.Eligibility_List.find((row) => row.emp_id === 'E2').eligibility_status = 'Eligible';
    const delegatedEmployee = store.tables.Appraisal_Sheet.find((row) => row.emp_id === 'E2');
    delegatedEmployee.appraiser_tech_ed = 'T2';
    delegatedEmployee.comp_manager = 'C2';
    const delegated = await get(api);
    assert.strictEqual(delegated.status, 200, JSON.stringify(delegated.json));
    assert.strictEqual(Number(delegated.json.master[0].original_headcount), 2, 'Org Original Count stays fixed after delegation');
    assert.strictEqual(Number(delegated.json.master[0].current_headcount), 2, 'Org Current Count follows the eligible roster');
    const delegatedT1 = delegated.json.techEd.find((row) => row.appraiser_tech_ed_id === 'T1');
    const delegatedT2 = delegated.json.techEd.find((row) => row.appraiser_tech_ed_id === 'T2');
    assert.strictEqual(Number(delegatedT1.original_headcount), 2, 'previous Tech-Ed baseline is not reset by delegation');
    assert.strictEqual(Number(delegatedT1.current_headcount), 1, 'previous Tech-Ed Current Count falls after delegation');
    assert.strictEqual(Number(delegatedT2.original_headcount), 1, 'new Tech-Ed baseline starts from its generated roster');
    assert.strictEqual(Number(delegatedT2.current_headcount), 1, 'new Tech-Ed Current Count uses the generated roster');
    const delegatedC1 = delegated.json.compManager.find((row) => row.comp_manager === 'C1');
    const delegatedC2 = delegated.json.compManager.find((row) => row.comp_manager === 'C2');
    assert.strictEqual(Number(delegatedC1.original_headcount), 2, 'previous Comp Manager baseline is not reset');
    assert.strictEqual(Number(delegatedC1.current_headcount), 1, 'previous Comp Manager Current Count falls after delegation');
    assert.strictEqual(Number(delegatedC2.original_headcount), 1, 'new Comp Manager baseline starts from its generated roster');
    assert.strictEqual(Number(delegatedC2.current_headcount), 1, 'new Comp Manager Current Count uses the generated roster');
  });

  await t('Comp Manager reassignment changes only live counts and preserves the Tech-Ed baseline', async () => {
    const store = makeStore({
      Budget_Master: [{ appraisal_cycle_id: 'Apr-26', budget_percentage: 8 }],
      Budget_Distribution: [],
      Budget_Distribution_Comp: [],
      Employee_Master: [],
      Eligibility_List: [],
      Payroll_Data: [],
      Appraisal_Cycle_Master: [
        { cycle_name: 'Apr-26', start_date: '2026-04-01', status: 'Active' },
      ],
      Appraisal_Sheet: [
        sheet('E1', 'T1', 'C1', 1000000, 0),
        sheet('E2', 'T1', 'C1', 1000000, 0),
      ],
    });
    const cycleId = store.tables.Appraisal_Cycle_Master[0].ROWID;
    store.tables.Budget_Master[0].appraisal_cycle_id = cycleId;
    store.tables.Eligibility_List.push(
      { ROWID: '99101', appraisal_cycle_id: cycleId, emp_id: 'E1', eligibility_status: 'Eligible' },
      { ROWID: '99102', appraisal_cycle_id: cycleId, emp_id: 'E2', eligibility_status: 'Eligible' },
    );

    const api = load(store);
    const initial = await get(api);
    assert.strictEqual(initial.status, 200, JSON.stringify(initial.json));
    const initialTech = initial.json.techEd.find((row) => /T1/.test(row.appraiser_tech_ed_id));
    const initialC1 = initial.json.compManager.find((row) => row.comp_manager === 'C1');
    assert.strictEqual(Number(initialTech.original_headcount), 2);
    assert.strictEqual(Number(initialC1.original_headcount), 2);

    // HR approves a Comp Manager-only delegation: Tech-Ed stays T1.
    store.tables.Appraisal_Sheet.find((row) => row.emp_id === 'E2').comp_manager = 'C2';
    const changed = await get(api);
    assert.strictEqual(changed.status, 200, JSON.stringify(changed.json));
    const changedTech = changed.json.techEd.find((row) => /T1/.test(row.appraiser_tech_ed_id));
    const changedC1 = changed.json.compManager.find((row) => row.comp_manager === 'C1');
    const changedC2 = changed.json.compManager.find((row) => row.comp_manager === 'C2');

    assert.strictEqual(Number(changedTech.original_headcount), 2, 'Tech-Ed Original Count remains unchanged');
    assert.strictEqual(Number(changedTech.current_headcount), 2, 'Tech-Ed Current Count remains 2 when the employee stays under the same Tech-Ed');
    assert.strictEqual(Number(changedC1.original_headcount), 2, 'old Comp Manager Original Count remains unchanged');
    assert.strictEqual(Number(changedC1.current_headcount), 1, 'old Comp Manager Current Count decreases');
    assert.strictEqual(Number(changedC2.original_headcount), 1, 'new Comp Manager gets a baseline when its allocation is first created');
    assert.strictEqual(Number(changedC2.current_headcount), 1, 'new Comp Manager Current Count reflects the reassigned employee');
  });

  await t('fails clearly when original headcount snapshot columns are missing', async () => {
    const store = makeStore({
      Budget_Master: [{ appraisal_cycle_id: 'Apr-26', budget_percentage: 8 }],
      Budget_Distribution: [],
      Budget_Distribution_Comp: [],
      Employee_Master: [],
      Eligibility_List: [],
      Payroll_Data: [],
      Appraisal_Cycle_Master: [
        { cycle_name: 'Apr-26', start_date: '2026-04-01', status: 'Active' },
      ],
      Appraisal_Sheet: [
        sheet('E1', 'T1', 'C1', 1000000, 0),
        sheet('E2', 'T1', 'C1', 1000000, 0),
      ],
    });
    const cycleId = store.tables.Appraisal_Cycle_Master[0].ROWID;
    store.tables.Budget_Master[0].appraisal_cycle_id = cycleId;
    store.tables.Eligibility_List.push(
      { ROWID: '99201', appraisal_cycle_id: cycleId, emp_id: 'E1', eligibility_status: 'Eligible' },
      { ROWID: '99202', appraisal_cycle_id: cycleId, emp_id: 'E2', eligibility_status: 'Eligible' },
    );

    // Model a real schema that has mutable Current Count but no dedicated
    // Original Count snapshot column. Silently returning the live roster size
    // would make Original Count change after delegation.
    store.schema = {
      Budget_Master: ['ROWID', 'appraisal_cycle_id', 'budget_percentage', 'org_budget_base', 'calculated_budget', 'applied_budget', 'budget_utilized', 'current_headcount', 'current_budget_base'],
      Budget_Distribution: ['ROWID', 'appraisal_cycle_id', 'appraiser_tech_ed_id', 'percentage', 'budget_base', 'claculated_budget', 'applied_budget', 'total_utilization', 'current_headcount', 'current_budget_base'],
      Budget_Distribution_Comp: ['ROWID', 'appraisal_cycle_id', 'budget_distribution_id', 'comp_manager', 'percentage', 'budget_base', 'calculated_budget', 'applied_budget', 'total_utilization', 'current_headcount', 'current_budget_base'],
    };
    const api = load(store);
    const response = await get(api);
    assert.strictEqual(response.status, 500);
    assert.match(response.json.message, /Budget_Distribution must have an original_headcount or allocation_headcount column/);
  });

  await t('Org and Tech-ED bases match all generated Appraisal Sheet previous CTC values while Current Count remains eligibility-scoped', async () => {
    const store = makeStore({
      Budget_Master: [{ appraisal_cycle_id: '', budget_percentage: 8 }],
      Budget_Distribution: [], Budget_Distribution_Comp: [],
      Employee_Master: [
        { emp_id: 'E1', emp_name: 'Eligible Employee', emp_status: 'Active', eligibility: 'Eligible' },
        { emp_id: 'E2', emp_name: 'Not Eligible Employee', emp_status: 'Active', eligibility: 'Eligible' },
      ],
      Eligibility_List: [],
      Payroll_Data: [],
      Appraisal_Cycle_Master: [
        { cycle_name: 'Apr-26', start_date: '2026-04-01', status: 'Active' },
      ],
      Appraisal_Sheet: [
        { emp_id: 'E1', appraiser_tech_ed: 'T1', comp_manager: 'C1', current_annual_base_pay: 1000000, Previous_Appraisal_total_CTC_with_rewards: 1100000, hike_amount: 100000 },
        { emp_id: 'E2', appraiser_tech_ed: 'T1', comp_manager: 'C1', current_annual_base_pay: 2000000, Previous_Appraisal_total_CTC_with_rewards: 2200000, hike_amount: 200000 },
      ],
    });
    const currentCycleId = store.tables.Appraisal_Cycle_Master[0].ROWID;
    store.tables.Budget_Master[0].appraisal_cycle_id = currentCycleId;
    store.tables.Eligibility_List.push(
      { ROWID: '99771', appraisal_cycle_id: currentCycleId, emp_id: 'E1', eligibility_status: 'Eligible' },
      { ROWID: '99772', appraisal_cycle_id: currentCycleId, emp_id: 'E2', eligibility_status: 'Not Eligible' },
    );
    const r = await get(load(store));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.master[0].org_budget_base, 3300000, 'Org Budget Base is the sum of both generated Appraisal Sheet previous-CTC values');
    const team = r.json.techEd.find((row) => /T1/.test(row.appraiser_tech_ed_id));
    assert.strictEqual(team.budget_base, 3300000, 'Tech-Ed base rolls up the same Appraisal Sheet CTC values');
    assert.strictEqual(Number(team.current_headcount), 1, 'Current Count still follows cycle eligibility');
  });

  await t('stale Tech-ED original budget smaller than the base is recalculated', async () => {
    const store = makeStore({
      Budget_Master: [{ appraisal_cycle_id: 'Apr-26', budget_percentage: 10 }],
      Budget_Distribution: [{
        appraisal_cycle_id: 'Apr-26', appraiser_tech_ed_id: 'T1', percentage: 10,
        budget_base: 1000000, original_budget_base: 1000000, calculated_budget: 2, applied_budget: 1100000,
      }],
      Budget_Distribution_Comp: [], Employee_Master: [],
      Eligibility_List: [{ appraisal_cycle_id: 'Apr-26', emp_id: 'E1', eligibility_status: 'Eligible' }],
      Appraisal_Sheet: [sheet('E1', 'T1', 'C1', 1000000, 0)],
    });
    const r = await get(load(store));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const team = r.json.techEd.find((row) => row.appraiser_tech_ed_id === 'T1');
    assert.strictEqual(team.calculated_budget, 100000, 'legacy tiny snapshot is repaired using base × percentage / 100');
  });

  await t('Org Budget Base uses Appraisal Sheet previous total CTC with rewards when payroll/current CTC is blank', async () => {
    const store = makeStore({
      Budget_Master: [{ appraisal_cycle_id: 'Apr-26', budget_percentage: 8 }],
      Budget_Distribution: [], Budget_Distribution_Comp: [],
      Employee_Master: [],
      Eligibility_List: [
        { appraisal_cycle_id: 'Apr-26', emp_id: 'E1', eligibility_status: 'Eligible' },
        { appraisal_cycle_id: 'Apr-26', emp_id: 'E2', eligibility_status: 'Eligible' },
      ],
      Payroll_Data: [],
      Appraisal_Cycle_Master: [
        { cycle_name: 'Apr-26', start_date: '2026-04-01', status: 'Active' },
      ],
      Appraisal_Sheet: [
        { ...sheet('E1', 'T1', 'C1', '', 0), Previous_Appraisal_total_CTC_with_rewards: '12,50,000' },
        { ...sheet('E2', 'T1', 'C1', '', 0), previous_appraisal_total_ctc_with_rewards: '8,75,000' },
      ],
    });
    const cycleId = store.tables.Appraisal_Cycle_Master[0].ROWID;
    store.tables.Budget_Master[0].appraisal_cycle_id = cycleId;
    store.tables.Eligibility_List.forEach((row) => { row.appraisal_cycle_id = cycleId; });

    const r = await get(load(store));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.master[0].org_budget_base, 1250000 + 875000);
    assert.strictEqual(r.json.employeeRoster.find((employee) => employee.emp_id === 'E1').previous_appraisal_total_ctc_with_rewards, 1250000);
    assert.strictEqual(r.json.employeeRoster.find((employee) => employee.emp_id === 'E2').previous_appraisal_total_ctc_with_rewards, 875000);
  });

  await t('empty pay columns: base 0 with a clear warning', async () => {
    const store = makeStore({
      Budget_Master: [{ appraisal_cycle_id: 'Apr-26', budget_percentage: 8 }],
      Budget_Distribution: [], Budget_Distribution_Comp: [], Employee_Master: [],
      Eligibility_List: [
        { appraisal_cycle_id: 'Apr-26', emp_id: 'E1', eligibility_status: 'Eligible' },
        { appraisal_cycle_id: 'Apr-26', emp_id: 'E2', eligibility_status: 'Eligible' },
      ],
      Appraisal_Sheet: [sheet('E1', 'EMP0051 - Ashok Kumar', 'Anita', '', ''), sheet('E2', 'EMP0051 - Ashok Kumar', 'Anita', null, null)],
    });
    const r = await get(load(store));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.master[0].org_budget_base, 0);
    assert.match(r.json.diagnostics.warning, /None of the 2 employees .* Current Annual Base Pay/);
  });

  await t('some employees without pay: partial warning', async () => {
    const store = makeStore({
      Budget_Master: [{ appraisal_cycle_id: 'Apr-26', budget_percentage: 8 }],
      Budget_Distribution: [], Budget_Distribution_Comp: [], Employee_Master: [],
      Eligibility_List: [
        { appraisal_cycle_id: 'Apr-26', emp_id: 'E1', eligibility_status: 'Eligible' },
        { appraisal_cycle_id: 'Apr-26', emp_id: 'E2', eligibility_status: 'Eligible' },
      ],
      Appraisal_Sheet: [sheet('E1', 'T1', 'C1', '1000000', '0'), sheet('E2', 'T1', 'C1', '', '')],
    });
    const r = await get(load(store));
    assert.match(r.json.diagnostics.warning, /1 of 2 employees have no/);
    assert.strictEqual(r.json.master[0].org_budget_base, 1000000);
  });

  await t('no Budget_Master cycle: nothing calculated, warning says so', async () => {
    const store = makeStore({
      Budget_Master: [], Budget_Distribution: [], Budget_Distribution_Comp: [], Employee_Master: [], Eligibility_List: [],
      Appraisal_Sheet: [sheet('E1', 'T1', 'C1', '1000000', '0')],
    });
    const r = await get(load(store));
    assert.strictEqual(r.status, 200);
    assert.match(r.json.diagnostics.warning, /No Budget_Master row has an appraisal cycle/);
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
