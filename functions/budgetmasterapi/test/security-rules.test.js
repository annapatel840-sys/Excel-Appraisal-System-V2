/* budgetmasterapi: a Tech-Ed cannot change their own budget (HR sets it),
   and Data Store "Concurrency limit reached" (429) is retried.
   In-memory Data Store (ZCQL + tables). Run: node test/security-rules.test.js */
'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const TABLE_IDS = { '74008000000034565': 'Budget_Master', '74008000000033809': 'Budget_Distribution', '74008000000023149': 'Budget_Distribution_Comp', '74008000000035326': 'Payroll_Data', '74008000000034190': 'Appraisal_Cycle_Master' };

function makeStore() {
  const tables = {
    Appraisal_Cycle_Master: [{ ROWID: '100', cycle_name: 'Annual 2027', start_date: '2026-04-01', status: 'Active', archived: false }],
    Budget_Master: [], Budget_Distribution_Comp: [], Payroll_Data: [], Eligibility_List: [], Appraisal_Sheet: [],
    Budget_Distribution: [{ ROWID: '200', appraisal_cycle_id: '100', appraiser_tech_ed_id: 'EMP0051', percentage: 8, budget_base: 1000, applied_budget: 80, total_utilization: 0 }],
    Employee_Master: [{ ROWID: '300', emp_id: 'EMP0051', emp_name: 'Ashok Kumar', email_id: 'ashok@x.com' }],
  };
  const store = { tables, busy: 0, writes: [] };
  const tableApi = (name) => ({
    getAllColumns: async () => [],
    updateRow: async (row) => { store.writes.push(row); const r = tables[name].find((x) => x.ROWID === String(row.ROWID)); Object.assign(r, row); return { ...r }; },
    insertRow: async (row) => { store.writes.push(row); const r = { ...row, ROWID: String(900 + store.writes.length) }; tables[name].push(r); return r; },
    getPagedRows: async () => ({ data: tables[name].map((r) => ({ ...r })), more_records: false }),
  });
  store.app = {
    zcql: () => ({
      executeZCQLQuery: async (sql) => {
        if (store.busy > 0) {
          store.busy -= 1;
          throw Object.assign(new Error('Concurrency limit reached for the feature COMPONENT'), { statusCode: 429, code: 'TOO_MANY_REQUESTS' });
        }
        const m = sql.match(/FROM\s+(\w+)\s+WHERE ROWID > (\d+)/i);
        return (tables[m[1]] || []).filter((r) => BigInt(r.ROWID) > BigInt(m[2])).map((r) => ({ [m[1]]: { ...r } }));
      },
    }),
    datastore: () => ({ table: (id) => tableApi(TABLE_IDS[id] || id) }),
    userManagement: () => ({ getCurrentUser: async () => ({ user_id: '1', email_id: 'ashok@x.com', role_details: { role_name: 'Tech-Ed' } }) }),
  };
  return store;
}

function load(store, a) {
  const dir = path.resolve(__dirname, '..');
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(dir) && !k.includes('node_modules')) delete require.cache[k]; });
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const accessStub = {
    HttpError,
    check: async () => a,
    isEnforced: () => a.enforced,
    guard: (x, fn) => fn(),
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

const techEd = { enforced: true, role: 'techEd', scope: { all: false, empIds: [] }, user: { email: 'ashok@x.com', empId: 'EMP0051' }, actions: {}, screens: {}, fields: {} };
const hr = { enforced: true, role: 'hr', scope: { all: true }, user: { email: 'hr@x.com', empId: 'EMP0001' }, actions: {}, screens: {}, fields: {} };

let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); } }

(async () => {
  const origError = console.error;
  console.error = () => {};

  await t('a Tech-Ed cannot raise their own budget', async () => {
    const store = makeStore();
    const r = await call(load(store, techEd), 'PUT', { resource: 'distribution', id: '200', percentage: 50, applied_budget: 500 });
    assert.strictEqual(r.status, 403, JSON.stringify(r.json));
    assert.strictEqual(store.tables.Budget_Distribution[0].applied_budget, 80);
  });

  await t('a Tech-Ed can still record utilization on their own row', async () => {
    const store = makeStore();
    const r = await call(load(store, techEd), 'PUT', { resource: 'distribution', id: '200', total_utilization: 40 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(store.tables.Budget_Distribution[0].total_utilization, 40);
  });

  await t('HR can change a Tech-Ed budget', async () => {
    const store = makeStore();
    const r = await call(load(store, hr), 'PUT', { resource: 'distribution', id: '200', percentage: 10, applied_budget: 100 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(store.tables.Budget_Distribution[0].applied_budget, 100);
  });

  await t('a "Concurrency limit reached" read is retried instead of failing', async () => {
    const store = makeStore();
    store.busy = 2;
    const r = await call(load(store, hr), 'PUT', { resource: 'distribution', id: '200', total_utilization: 5 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(store.busy, 0);
  });

  console.error = origError;
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
