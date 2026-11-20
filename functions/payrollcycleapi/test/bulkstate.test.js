/* Bulk Edit History + Scenarios tests (payrollcycleapi, resource=bulkstate).
   In-memory Data Store. Run: node test/bulkstate.test.js */
'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const NOTES_TABLE = '74008000000495355';
const MASTER_TABLE = '74008000000035727';

function makeStore() {
  let seq = 5000;
  const tables = {};
  const table = (id) => {
    if (tables[id]) return tables[id];
    const rows = [];
    tables[id] = {
      rows,
      getAllColumns: async () => [],
      getPagedRows: async () => ({ data: rows.map((r) => ({ ...r })), more_records: false }),
      insertRow: async (row) => { const r = { ...row, ROWID: String(++seq) }; rows.push(r); return { ...r }; },
      updateRow: async (row) => { const r = rows.find((x) => x.ROWID === String(row.ROWID)); Object.assign(r, row); return { ...r }; },
      deleteRow: async (rid) => { const i = rows.findIndex((x) => x.ROWID === String(rid)); rows.splice(i, 1); return true; },
    };
    return tables[id];
  };
  return { tables, table };
}

function load(store, user) {
  const dir = path.resolve(__dirname, '..');
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(dir) && !k.includes('node_modules')) delete require.cache[k]; });
  const catalystStub = {
    initialize: () => ({
      datastore: () => ({ table: (id) => store.table(id) }),
      userManagement: () => ({ getCurrentUser: async () => user }),
    }),
  };
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const accessStub = {
    HttpError,
    check: async () => ({ dryRun: true, enforced: false }),
    isEnforced: () => false,
    guard: (a, fn) => fn(),
    requireScreen: () => {},
    requireAction: () => {},
    requireEditFields: () => {},
    bumpVersion: async () => {},
  };
  const orig = Module._load;
  Module._load = function (req, parent, ...rest) {
    if (req === 'zcatalyst-sdk-node') return catalystStub;
    if (req === './accessCore') return accessStub;
    return orig.call(this, req, parent, ...rest);
  };
  try { return require('../index.js'); } finally { Module._load = orig; }
}

function call(api, method, query, body) {
  const qs = new URLSearchParams({ resource: 'bulkstate', ...(query || {}) }).toString();
  return new Promise((resolve, reject) => {
    const req = { method, url: '/?' + qs, body: body || (method === 'POST' ? {} : undefined), on() {} };
    const res = { status: 0, writeHead(s) { this.status = s; }, end(text) { resolve({ status: this.status, json: JSON.parse(text) }); } };
    api(req, res).catch(reject);
  });
}

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); }
}
const hr = { user_id: '1', first_name: 'Hr', last_name: 'User', email_id: 'hr@x.com', role_details: { role_name: 'HR' } };
const hr2 = { user_id: '2', first_name: 'Other', last_name: 'Hr', email_id: 'hr2@x.com', role_details: { role_name: 'HR' } };

(async () => {
  const store = makeStore();
  store.table(MASTER_TABLE).rows.push(
    { ROWID: '1', emp_id: 'EMP0001', email_id: 'hr@x.com', emp_status: 'Active' },
    { ROWID: '2', emp_id: 'EMP0002', email_id: 'hr2@x.com', emp_status: 'Active' },
  );
  const api = load(store, hr);
  const api2 = load(store, hr2);
  const post = (b, a = api) => call(a, 'POST', {}, b);
  const rowsOf = () => store.table(NOTES_TABLE).rows;
  const big = { id: 'BO-1', at: 1, time: '20 Nov 10:00', by: 'Hr', text: 'Hike +5%', restored: false,
    rows: Array.from({ length: 400 }, (_, i) => ({ id: 'E' + i, old: { hikePct: 1 }, nw: { hikePct: 6 }, bulk: false })) };

  await t('a batch survives a "new login": saved by one user, read by another (in pieces)', async () => {
    const r = await post({ action: 'save_batch', cycle: 'C1', batch: big });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.ok(rowsOf().length > 1, 'a big batch is cut into several rows');
    assert.ok(rowsOf().every((x) => x.Note_Text.length <= 4000 && x.Owner_Emp_ID === 'BULK' && x.App_Cycle === 'C1'));
    const g = await call(api2, 'GET', { type: 'batches', cycle: 'C1' });
    assert.deepStrictEqual(g.json.data.batches, [big]);
  });

  await t('history is per cycle', async () => {
    const g = await call(api, 'GET', { type: 'batches', cycle: 'C2' });
    assert.deepStrictEqual(g.json.data.batches, []);
  });

  await t('saving the same batch again (restored) replaces it, no duplicates', async () => {
    await post({ action: 'save_batch', cycle: 'C1', batch: { ...big, restored: true } });
    const g = await call(api, 'GET', { type: 'batches', cycle: 'C1' });
    assert.strictEqual(g.json.data.batches.length, 1);
    assert.strictEqual(g.json.data.batches[0].restored, true);
    const pieces = rowsOf().filter((x) => x.Batch_ID === 'BO-1');
    assert.strictEqual(new Set(pieces.map((x) => x.Emp_Count)).size, pieces.length);
  });

  await t('batches come back oldest first', async () => {
    await post({ action: 'save_batch', cycle: 'C1', batch: { id: 'BO-2', at: 2, text: 't', rows: [] } });
    const g = await call(api, 'GET', { type: 'batches', cycle: 'C1' });
    assert.deepStrictEqual(g.json.data.batches.map((b) => b.id), ['BO-1', 'BO-2']);
  });

  await t('scenarios: save, list, delete, per cycle', async () => {
    const sc = { id: 'SC-a', name: 'Plan A', text: 'Hike 5%', rows: 10, util: 91.2, rules: [{ field: 'hikePct', value: 5 }], skip: true };
    assert.strictEqual((await post({ action: 'save_scenario', cycle: 'C1', scenario: sc })).status, 200);
    await post({ action: 'save_scenario', cycle: 'C1', scenario: { ...sc, id: 'SC-b', name: 'Plan B' } });
    let g = await call(api2, 'GET', { type: 'scenarios', cycle: 'C1' });
    assert.deepStrictEqual(g.json.data.scenarios.map((x) => x.name).sort(), ['Plan A', 'Plan B']);
    assert.deepStrictEqual((await call(api, 'GET', { type: 'scenarios', cycle: 'C2' })).json.data.scenarios, []);
    await post({ action: 'delete_scenario', cycle: 'C1', id: 'SC-a' });
    g = await call(api, 'GET', { type: 'scenarios', cycle: 'C1' });
    assert.deepStrictEqual(g.json.data.scenarios.map((x) => x.id), ['SC-b']);
    assert.strictEqual((await call(api, 'GET', { type: 'batches', cycle: 'C1' })).json.data.batches.length, 2, 'batches untouched');
  });

  await t('an unfinished save (missing piece) is skipped, not shown broken', async () => {
    const piece = rowsOf().find((x) => x.Batch_ID === 'BO-1' && x.Emp_Count === 1);
    store.table(NOTES_TABLE).rows.splice(rowsOf().indexOf(piece), 1);
    const g = await call(api, 'GET', { type: 'batches', cycle: 'C1' });
    assert.deepStrictEqual(g.json.data.batches.map((b) => b.id), ['BO-2']);
  });

  await t('bad requests are refused', async () => {
    assert.strictEqual((await post({ action: 'save_batch', cycle: 'C1', batch: { text: 'no id' } })).status, 400);
    assert.strictEqual((await post({ action: 'save_batch', batch: { id: 'x' } })).status, 400);
    assert.strictEqual((await call(api, 'GET', { type: 'nope', cycle: 'C1' })).status, 400);
    assert.strictEqual((await post({ action: 'wat', cycle: 'C1' })).status, 400);
  });

  await t('Tech-Ed notes are not disturbed by bulk rows', async () => {
    const rows = rowsOf().filter((x) => x.Record_Type === 'NOTE' || x.Record_Type === 'LAST_EDIT');
    assert.strictEqual(rows.length, 0);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();