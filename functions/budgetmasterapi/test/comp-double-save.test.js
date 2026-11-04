/* Two saves of the same Comp Manager allotment at the same moment (double
   click, Enter + Apply, two tabs) must leave ONE Budget_Distribution_Comp row,
   not two. Run: node test/comp-double-save.test.js */
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
  // Every call yields first, as a real Data Store call would: two requests
  // can both read "no row yet" before either insert lands.
  const tick = () => new Promise((r) => setImmediate(r));
  const tableApi = (name) => ({
    getAllColumns: async () => [],
    insertRow: async (row) => { await tick(); const r = { ...row, ROWID: String(++seq) }; (tables[name] = tables[name] || []).push(r); return { ...r }; },
    updateRow: async (row) => { await tick(); const r = (tables[name] || []).find((x) => x.ROWID === String(row.ROWID)); if (r) Object.assign(r, row); return { ...r }; },
    deleteRow: async (id) => { await tick(); tables[name] = (tables[name] || []).filter((x) => x.ROWID !== String(id)); return true; },
    getPagedRows: async () => ({ data: (tables[name] || []).map((r) => ({ ...r })), more_records: false }),
  });
  const app = {
    zcql: () => ({
      executeZCQLQuery: async (sql) => {
        await tick();
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
    requireScreen: () => {}, requireAction: () => {}, bumpVersion: async () => {},
  };
  const orig = Module._load;
  Module._load = function (req, ...rest) {
    if (req === 'zcatalyst-sdk-node') return { initialize: () => store.app };
    if (req === './accessCore') return accessStub;
    return orig.call(this, req, ...rest);
  };
  try { return require('../index.js'); } finally { Module._load = orig; }
}

function put(api, body) {
  return new Promise((resolve, reject) => {
    const req = { method: 'PUT', url: '/', headers: {}, body, on() {} };
    const res = { statusCode: 0, writeHead(s) { this.statusCode = s; }, setHeader() {}, end(t) { resolve({ status: this.statusCode, json: JSON.parse(t || '{}') }); } };
    api(req, res).catch(reject);
  });
}

function setup() {
  const store = makeStore({
    Appraisal_Cycle_Master: [{ cycle_name: 'Annual 2027', start_date: '2026-04-01', status: 'Active', archived: false }],
    Budget_Master: [], Budget_Distribution: [], Budget_Distribution_Comp: [],
    Employee_Master: [], Eligibility_List: [], Payroll_Data: [], Appraisal_Sheet: [],
  });
  const active = store.tables.Appraisal_Cycle_Master[0].ROWID;
  const parent = { ROWID: '7001', appraisal_cycle_id: active, appraiser_tech_ed_id: 'EMP0051', percentage: 8, budget_base: 1000000, applied_budget: 80000 };
  store.tables.Budget_Distribution.push(parent);
  return { store, parent };
}

let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); } }

(async () => {
  console.warn = () => {};

  await t('two saves at the same moment leave one Comp Manager row', async () => {
    const { store, parent } = setup();
    const api = load(store);
    const body = { resource: 'compmanager', budget_distribution_id: parent.ROWID, comp_manager: 'EMP0060', percentage: 10, budget_base: 80000 };
    const [a, b] = await Promise.all([put(api, { ...body }), put(api, { ...body })]);
    assert.strictEqual(a.status, 200, JSON.stringify(a.json));
    assert.strictEqual(b.status, 200, JSON.stringify(b.json));
    const rows = store.tables.Budget_Distribution_Comp.filter((r) => r.comp_manager === 'EMP0060');
    assert.strictEqual(rows.length, 1, rows.length + ' rows for EMP0060');
    assert.strictEqual(Number(rows[0].percentage), 10);
  });

  await t('a single save still creates the row once', async () => {
    const { store, parent } = setup();
    const r = await put(load(store), { resource: 'compmanager', budget_distribution_id: parent.ROWID, comp_manager: 'EMP0061', percentage: 5, budget_base: 80000 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(store.tables.Budget_Distribution_Comp.filter((x) => x.comp_manager === 'EMP0061').length, 1);
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
