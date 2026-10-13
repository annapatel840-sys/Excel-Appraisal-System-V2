/* budgetmasterapi GET: budget base from Appraisal_Sheet, with an in-memory
   Data Store (ZCQL + tables). Run: node test/budget-base.test.js */
'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const TABLE_IDS = { '74008000000034565': 'Budget_Master', '74008000000033809': 'Budget_Distribution', '74008000000023149': 'Budget_Distribution_Comp' };

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
