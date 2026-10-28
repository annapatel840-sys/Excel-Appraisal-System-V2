/* budgetmasterapi GET writes only the Active cycle, and only changed values.
   In-memory Data Store (ZCQL + tables). Run: node test/budget-write-scope.test.js */
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


const sheet = (id, techEd, cm, base, pb, cycleId) => ({ emp_id: id, appraiser_tech_ed: techEd, comp_manager: cm, status: 'Active', eligible_status: 'Eligible', current_annual_base_pay: base, allocated_pb_amount: pb, cycle_id: cycleId });
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); } }

function setup() {
  const store = makeStore({
    Appraisal_Cycle_Master: [
      { cycle_name: 'Annual 2026', start_date: '2025-04-01', status: 'Closed', archived: true },
      { cycle_name: 'Annual 2027', start_date: '2026-04-01', status: 'Active', archived: false },
    ],
    Budget_Master: [], Budget_Distribution: [], Budget_Distribution_Comp: [],
    Employee_Master: [], Eligibility_List: [], Payroll_Data: [], Appraisal_Sheet: [],
  });
  const [closed, active] = store.tables.Appraisal_Cycle_Master.map((c) => c.ROWID);
  const add = (name, row) => { const r = { ROWID: String(9000 + (store.tables[name] || []).length + Object.keys(store.tables).indexOf(name) * 100), ...row }; store.tables[name].push(r); return r; };
  const closedMaster = add('Budget_Master', { appraisal_cycle_id: closed, budget_percentage: 8, org_budget_base: 2105989, calculated_budget: 168479.12, applied_budget: 168479.12, budget_utilized: 605150 });
  add('Budget_Master', { appraisal_cycle_id: active, budget_percentage: 9 });
  const closedTech = add('Budget_Distribution', { appraisal_cycle_id: closed, appraiser_tech_ed_id: 'EMP0051', percentage: 8, budget_base: 794586, claculated_budget: 63566.88, applied_budget: 63566.88, total_utilization: 238900 });
  ['E1', 'E2'].forEach((id) => store.tables.Eligibility_List.push({ ROWID: id === 'E1' ? '8101' : '8102', appraisal_cycle_id: active, emp_id: id, eligibility_status: 'Eligible' }));
  store.tables.Appraisal_Sheet.push(
    { ROWID: '8201', ...sheet('E1', 'EMP0051 - Ashok Kumar', 'Anita', '1200000', '100000', active) },
    { ROWID: '8202', ...sheet('E2', 'EMP0051 - Ashok Kumar', 'Anita', '800000', '50000', active) },
  );
  // Count every write.
  const writes = [];
  const origDatastore = store.app.datastore;
  store.app.datastore = () => {
    const ds = origDatastore();
    return {
      table: (id) => {
        const tbl = ds.table(id);
        return { ...tbl, updateRow: async (row) => { writes.push({ id, row }); return tbl.updateRow(row); },
          insertRow: async (row) => { writes.push({ id, row, insert: true }); return tbl.insertRow(row); } };
      },
    };
  };
  return { store, writes, closedMaster, closedTech, closed, active };
}

(async () => {
  await t('closed and archived cycles are not recalculated or rewritten', async () => {
    const { store, writes, closedMaster, closedTech } = setup();
    const before = JSON.stringify([closedMaster, closedTech]);
    const r = await get(load(store));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const closedIds = [closedMaster.ROWID, closedTech.ROWID];
    assert.deepStrictEqual(writes.filter((w) => closedIds.includes(String(w.row.ROWID))), [], 'no write touches a closed-cycle row');
    assert.strictEqual(JSON.stringify([closedMaster, closedTech]), before, 'closed-cycle values unchanged');
    const activeMaster = store.tables.Budget_Master.find((m) => m.appraisal_cycle_id !== closedMaster.appraisal_cycle_id);
    assert.strictEqual(Number(activeMaster.org_budget_base), 1200000 + 100000 + 800000 + 50000, 'the Active cycle is still calculated');
  });

  await t('a second load with no data change writes nothing', async () => {
    const { store, writes } = setup();
    assert.strictEqual((await get(load(store))).status, 200);
    const firstWrites = writes.length;
    assert.ok(firstWrites > 0, 'first load stores the calculation');
    assert.strictEqual((await get(load(store))).status, 200);
    assert.deepStrictEqual(writes.slice(firstWrites).map((w) => Object.keys(w.row)), [], 'no writes on the second load');
  });

  await t('a changed value is still saved', async () => {
    const { store, writes } = setup();
    await get(load(store));
    store.tables.Appraisal_Sheet[0].current_annual_base_pay = '1300000';
    const firstWrites = writes.length;
    await get(load(store));
    const masterWrites = writes.slice(firstWrites).filter((w) => 'org_budget_base' in w.row);
    assert.strictEqual(masterWrites.length, 1);
    assert.strictEqual(Number(masterWrites[0].row.org_budget_base), 1300000 + 100000 + 800000 + 50000);
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
