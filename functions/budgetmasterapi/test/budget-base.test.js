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
  Object.entries(data).forEach(([name, rows]) => {
    tables[name] = rows.map((r) => ({ ROWID: String(++seq), ...r }));
  });
  const tableApi = (name) => ({
    getAllColumns: async () => [],
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
  return { tables, app };
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
      Budget_Distribution: [], Budget_Distribution_Comp: [], Employee_Master: [],
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
    store.tables.Payroll_Data.push({
      ROWID: '99991',
      emp_id: existingEmployeeRowId,
      appraisal_cycle_id: previousCycleId,
      total_ctc_with_rewards: '25,00,000',
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
    const orgOriginal = orgBase * 1.08;
    assert.strictEqual(r.json.master[0].calculated_budget, orgOriginal);
    const techRow = r.json.techEd[0];
    const techBase = techRow.budget_base;
    const techOriginal = techRow.calculated_budget;
    assert.strictEqual(techOriginal, techBase * 1.08);

    // Changing Org and Tech-Ed percentages must change updated budgets only.
    store.tables.Budget_Master[0].budget_percentage = 10;
    const savedTech = store.tables.Budget_Distribution.find((row) => String(row.ROWID) === String(techRow.id));
    savedTech.percentage = 10;
    const changed = await get(load(store));
    assert.strictEqual(changed.status, 200, JSON.stringify(changed.json));
    assert.strictEqual(changed.json.master[0].calculated_budget, orgOriginal);
    assert.strictEqual(changed.json.master[0].applied_budget, orgBase * 1.10);
    const changedTech = changed.json.techEd.find((row) => String(row.id) === String(techRow.id));
    assert.strictEqual(changedTech.calculated_budget, techOriginal);
    assert.strictEqual(changedTech.applied_budget, techBase * 1.10);
  });

  await t('empty pay columns: base 0 with a clear warning', async () => {
    const store = makeStore({
      Budget_Master: [{ appraisal_cycle_id: 'Apr-26', budget_percentage: 8 }],
      Budget_Distribution: [], Budget_Distribution_Comp: [], Employee_Master: [],
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
      Appraisal_Sheet: [sheet('E1', 'T1', 'C1', '1000000', '0'), sheet('E2', 'T1', 'C1', '', '')],
    });
    const r = await get(load(store));
    assert.match(r.json.diagnostics.warning, /1 of 2 employees have no/);
    assert.strictEqual(r.json.master[0].org_budget_base, 1000000);
  });

  await t('no Budget_Master cycle: nothing calculated, warning says so', async () => {
    const store = makeStore({
      Budget_Master: [], Budget_Distribution: [], Budget_Distribution_Comp: [], Employee_Master: [],
      Appraisal_Sheet: [sheet('E1', 'T1', 'C1', '1000000', '0')],
    });
    const r = await get(load(store));
    assert.strictEqual(r.status, 200);
    assert.match(r.json.diagnostics.warning, /No Budget_Master row has an appraisal cycle/);
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
