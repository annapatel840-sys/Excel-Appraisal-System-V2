/* budgetmasterapi: Comp Managers under a Tech-ED (in-memory Data Store).
   Run: node test/comp-managers.test.js */
'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const TABLE_IDS = { '74008000000034565': 'Budget_Master', '74008000000033809': 'Budget_Distribution', '74008000000023149': 'Budget_Distribution_Comp' };

function makeStore(data) {
  let seq = 7000;
  const tables = {};
  Object.entries(data).forEach(([name, rows]) => { tables[name] = rows.map((r) => ({ ROWID: String(++seq), ...r })); });
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
        return (tables[name] || []).filter((r) => BigInt(r.ROWID) > BigInt(m[2])).slice(0, 300).map((r) => ({ [name]: { ...r } }));
      },
    }),
    datastore: () => ({ table: (id) => tableApi(TABLE_IDS[id] || id) }),
    userManagement: () => ({ getCurrentUser: async () => ({ user_id: '1', email_id: 'ashok@x.com', role_details: { role_name: 'Tech-Ed' } }) }),
  };
  return { tables, app };
}

function load(store, accessResult) {
  const dir = path.resolve(__dirname, '..');
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(dir) && !k.includes('node_modules')) delete require.cache[k]; });
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const accessStub = {
    HttpError,
    check: async () => accessResult,
    isEnforced: () => Boolean(accessResult.enforced),
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

function call(api, method, body) {
  return new Promise((resolve, reject) => {
    const req = { method, url: '/', headers: {}, body, on() {} };
    const res = { statusCode: 0, writeHead(s) { this.statusCode = s; }, setHeader() {}, end(t) { resolve({ status: this.statusCode, json: JSON.parse(t) }); } };
    api(req, res).catch(reject);
  });
}

const DRY = { dryRun: true, enforced: false, scope: { all: true } };
const ASHOK = 'EMP0051 - Ashok Kumar';
function data() {
  return {
    Budget_Master: [{ appraisal_cycle_id: 'Apr-26', budget_percentage: 10 }],
    Budget_Distribution: [], Budget_Distribution_Comp: [],
    // Appraisal_Sheet has no comp_manager; Employee_Master.director is the Comp Manager.
    Appraisal_Sheet: [
      { emp_id: 'E1', appraiser_tech_ed: ASHOK, current_annual_base_pay: '10,00,000', allocated_pb_amount: '0' },
      { emp_id: 'E2', appraiser_tech_ed: ASHOK, current_annual_base_pay: '5,00,000', allocated_pb_amount: '0' },
      { emp_id: 'E3', appraiser_tech_ed: ASHOK, current_annual_base_pay: '8,00,000', allocated_pb_amount: '0', comp_manager: 'Raj Mehta' },
    ],
    Employee_Master: [
      { emp_id: 'E1', director: 'Anita Sharma' },
      { emp_id: 'E2', director: 'Anita Sharma' },
      { emp_id: 'E3', director: 'Someone Else' },
    ],
  };
}

let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); } }

(async () => {
  await t('GET creates a Comp Manager row from Employee_Master.director when the sheet has none', async () => {
    const store = makeStore(data());
    const r = await call(load(store, DRY), 'GET');
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const names = r.json.compManager.map((c) => c.comp_manager).sort();
    assert.deepStrictEqual(names, ['Anita Sharma', 'Raj Mehta']); // sheet value wins for E3
    const anita = r.json.compManager.find((c) => c.comp_manager === 'Anita Sharma');
    assert.strictEqual(anita.budget_base, 1500000);
  });

  await t('PUT without id creates the Comp Manager row under the Tech-ED and saves the %', async () => {
    const store = makeStore(data());
    const api = load(store, DRY);
    await call(api, 'GET');
    const parent = store.tables.Budget_Distribution[0];
    // remove the auto-created rows to simulate a manager with no saved row
    store.tables.Budget_Distribution_Comp = [];
    const r = await call(api, 'PUT', { resource: 'comp', id: '', budget_distribution_id: parent.ROWID, comp_manager: 'Anita Sharma', percentage: 8, budget_base: 1500000, applied_budget: 120000, calculated_budget: 120000 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const rows = store.tables.Budget_Distribution_Comp;
    assert.strictEqual(rows.length, 1);
    assert.strictEqual(rows[0].comp_manager, 'Anita Sharma');
    assert.strictEqual(String(rows[0].budget_distribution_id), parent.ROWID);
    assert.strictEqual(Number(rows[0].percentage), 8);
    // saving again reuses the row
    const r2 = await call(api, 'PUT', { resource: 'comp', id: '', budget_distribution_id: parent.ROWID, comp_manager: 'anita  sharma', percentage: 9, budget_base: 1500000, applied_budget: 135000, calculated_budget: 135000 });
    assert.strictEqual(r2.status, 200, JSON.stringify(r2.json));
    assert.strictEqual(store.tables.Budget_Distribution_Comp.length, 1);
  });

  await t('PUT without id is refused for another Tech-ED (enforced)', async () => {
    const store = makeStore(data());
    await call(load(store, DRY), 'GET');
    const parent = store.tables.Budget_Distribution[0];
    store.tables.Budget_Distribution_Comp = [];
    const other = { enforced: true, scope: { all: false }, user: { empId: 'EMP0099', email: 'other@x.com', name: 'Other Person' } };
    const r = await call(load(store, other), 'PUT', { resource: 'comp', id: '', budget_distribution_id: parent.ROWID, comp_manager: 'Anita Sharma', percentage: 5 });
    assert.strictEqual(r.status, 403, JSON.stringify(r.json));
    assert.strictEqual(store.tables.Budget_Distribution_Comp.length, 0);
  });

  await t('PUT without id and without parent/name is still refused', async () => {
    const store = makeStore(data());
    const r = await call(load(store, DRY), 'PUT', { resource: 'comp', id: '', percentage: 5 });
    assert.strictEqual(r.status, 400);
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
