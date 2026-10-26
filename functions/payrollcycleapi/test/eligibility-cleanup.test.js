/* Eligibility_List clean-up: rows live only while a cycle is Active.
   Run: node test/eligibility-cleanup.test.js */
const assert = require('assert');
const path = require('path');
const Module = require('module');

const CYCLE_T = '74008000000034190';
const MASTER_T = '74008000000035727';
const ELIG_T = '74008000000057046';
const CYCLE_COLS = ['cycle_name', 'start_date', 'end_date', 'status', 'remarks', 'changed_by', 'changed_at', 'archived', 'cycle_type', 'process', 'effective_date', 'cancel_reason'];

function makeStore() {
  let seq = 1000;
  const tables = {};
  const table = (id, cols) => {
    if (tables[id]) return tables[id];
    const rows = [];
    const check = (row) => Object.keys(row).forEach((k) => {
      if (k !== 'ROWID' && cols && !cols.includes(k)) throw new Error(`Invalid column ${k}`);
    });
    const unique = (batch) => {
      if (id !== ELIG_T) return;
      const seen = new Set(rows.map((r) => r.emp_id));
      for (const r of batch) {
        if (seen.has(r.emp_id)) throw new Error('Duplicate value for emp_id. Please give a different value');
        seen.add(r.emp_id);
      }
    };
    const add = (row) => { const r = { ...row, ROWID: String(++seq) }; rows.push(r); return { ...r }; };
    tables[id] = {
      rows,
      getAllColumns: async () => (cols || []).map((c) => ({ column_name: c })),
      getPagedRows: async () => ({ data: rows.map((r) => ({ ...r })), more_records: false }),
      insertRow: async (row) => { check(row); unique([row]); return add(row); },
      insertRows: async (batch) => { unique(batch); return batch.map(add); },
      updateRow: async (row) => { check(row); const r = rows.find((x) => x.ROWID === String(row.ROWID)); Object.assign(r, row); return { ...r }; },
      deleteRow: async (id2) => { const i = rows.findIndex((x) => x.ROWID === String(id2)); rows.splice(i, 1); return true; },
      deleteRows: async (ids) => {
        assert.ok(ids.length <= 100, 'deleteRows batch too large');
        ids.forEach((x) => { const i = rows.findIndex((r) => r.ROWID === String(x)); if (i >= 0) rows.splice(i, 1); });
        return true;
      },
    };
    return tables[id];
  };
  return { tables, table };
}

function load(store) {
  const dir = path.resolve(__dirname, '..');
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(dir) && !k.includes('node_modules')) delete require.cache[k]; });
  const catalystStub = { initialize: () => ({
    datastore: () => ({ table: (id) => store.table(id, id === CYCLE_T ? CYCLE_COLS : null) }),
    userManagement: () => ({ getCurrentUser: async () => ({ user_id: '1', first_name: 'HR', last_name: 'A', email_id: 'hr@x.com', role_details: { role_name: 'HR' } }) }),
  }) };
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const accessStub = { HttpError, check: async () => ({ dryRun: true, enforced: false }), isEnforced: () => false, guard: (a, fn) => fn(), requireScreen: () => {}, bumpVersion: async () => {} };
  const orig = Module._load;
  Module._load = function (req, parent, ...rest) {
    if (req === 'zcatalyst-sdk-node') return catalystStub;
    if (req === './accessCore') return accessStub;
    return orig.call(this, req, parent, ...rest);
  };
  try { return require('../index.js'); } finally { Module._load = orig; }
}

function call(api, method, resource, body) {
  return new Promise((resolve, reject) => {
    const req = { method, url: '/?resource=' + encodeURIComponent(resource), body: body || (method === 'POST' ? {} : undefined), on() {} };
    const res = { status: 0, writeHead(s) { this.status = s; }, end(text) { resolve({ status: this.status, json: JSON.parse(text) }); } };
    api(req, res).catch(reject);
  });
}

const iso = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); }
}

async function setup() {
  const store = makeStore();
  const api = load(store);
  const post = (r, b) => call(api, 'POST', r, b);
  const master = store.table(MASTER_T, null);
  await master.insertRow({ emp_id: 'E1', emp_name: 'A', emp_status: 'Active' });
  await master.insertRow({ emp_id: 'E2', emp_name: 'B', emp_status: 'Active' });
  const mk = async (name) => {
    assert.strictEqual((await post('cycles/create', { name, type: 'Annual', process: 'Annual', effective: iso(9), start: iso(10), end: iso(40) })).status, 201);
    return (await call(api, 'GET', 'cycles')).json.data.find((c) => c.name === name);
  };
  return { store, api, post, mk, elig: store.table(ELIG_T, null) };
}

(async () => {
  await t('leftover rows from an old cycle no longer block a new cycle', async () => {
    const { post, mk, elig } = await setup();
    await elig.insertRows([{ appraisal_cycle_id: 'OLD', employee_master_id: '1', emp_id: 'E1' }, { appraisal_cycle_id: 'OLD', employee_master_id: '2', emp_id: 'E2' }]);
    const c = await mk('Annual NEW');
    const r = await post('cycles/status/' + c.id, { status: 'Active' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(elig.rows.length, 2);
    assert.ok(elig.rows.every((x) => x.appraisal_cycle_id === c.id));
  });

  await t('closing a cycle empties its eligibility rows; next cycle activates cleanly', async () => {
    const { post, mk, elig } = await setup();
    const a = await mk('Annual A');
    assert.strictEqual((await post('cycles/status/' + a.id, { status: 'Active' })).status, 200);
    assert.strictEqual(elig.rows.length, 2);
    const closed = await post('cycles/status/' + a.id, { status: 'Closed' });
    assert.strictEqual(closed.status, 200, JSON.stringify(closed.json));
    assert.strictEqual(closed.json.data.eligibilityCleared, 2);
    assert.strictEqual(elig.rows.length, 0);
    const b = await mk('Annual B');
    assert.strictEqual((await post('cycles/status/' + b.id, { status: 'Active' })).status, 200);
    assert.strictEqual(elig.rows.length, 2);
  });

  await t('reopening a closed cycle rebuilds its rows', async () => {
    const { post, mk, elig } = await setup();
    const a = await mk('Annual A');
    await post('cycles/status/' + a.id, { status: 'Active' });
    await post('cycles/status/' + a.id, { status: 'Closed' });
    assert.strictEqual((await post('cycles/status/' + a.id, { status: 'Active' })).status, 200);
    assert.strictEqual(elig.rows.length, 2);
  });

  await t('cancelling an Active cycle empties its eligibility rows', async () => {
    const { post, mk, elig } = await setup();
    const a = await mk('Annual A');
    await post('cycles/status/' + a.id, { status: 'Active' });
    assert.strictEqual(elig.rows.length, 2);
    assert.strictEqual((await post('cycles/cancel/' + a.id, { reason: 'test' })).status, 200);
    assert.strictEqual(elig.rows.length, 0);
  });

  await t('GET eligibility for the Active cycle returns rows without error', async () => {
    const { post, mk, api } = await setup();
    const a = await mk('Annual A');
    await post('cycles/status/' + a.id, { status: 'Active' });
    const r = await call(api, 'GET', 'eligibility');
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();