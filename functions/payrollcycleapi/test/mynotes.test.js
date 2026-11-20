/* Tech-Ed My notes + Last Edited tests (payrollcycleapi, resource=mynotes).
   In-memory Data Store. Run: node test/mynotes.test.js */
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
  const qs = new URLSearchParams({ resource: 'mynotes', ...(query || {}) }).toString();
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

const techEd = { user_id: '9', first_name: 'Ashok', last_name: 'Kumar', email_id: 'ashok@x.com', role_details: { role_name: 'Tech-ED' } };
const hr = { user_id: '1', first_name: 'Hr', last_name: 'User', email_id: 'hr@x.com', role_details: { role_name: 'HR' } };

function seedMaster(store) {
  store.table(MASTER_TABLE).rows.push(
    { ROWID: '1', emp_id: 'EMP0051', email_id: 'ashok@x.com', emp_status: 'Active' },
    { ROWID: '2', emp_id: 'EMP0001', email_id: 'hr@x.com', emp_status: 'Active' },
  );
}

(async () => {
  const store = makeStore();
  seedMaster(store);
  const api = load(store, techEd);
  const post = (b) => call(api, 'POST', {}, b);
  const rowsOf = () => store.table(NOTES_TABLE).rows;

  await t('single sheet edit saves one employee and replaces the previous one', async () => {
    let r = await post({ action: 'save_last_edit', location: 'India', cycle: 'India - Annual 2027', source: 'SHEET', empIds: ['E7'] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    r = await post({ action: 'save_last_edit', location: 'India', cycle: 'India - Annual 2027', source: 'SHEET', empIds: ['E9'] });
    assert.strictEqual(rowsOf().length, 1, 'one row per owner + location + cycle');
    const g = await call(api, 'GET', { type: 'last_edit', location: 'india', cycle: 'India - Annual 2027' });
    assert.deepStrictEqual(g.json.data.lastEdit.empIds, ['E9']);
    assert.strictEqual(g.json.data.lastEdit.source, 'SHEET');
    assert.ok(g.json.data.lastEdit.editedAtMs > 0);
    assert.strictEqual(rowsOf()[0].Owner_Emp_ID, 'EMP0051');
  });

  await t('bulk edit stores every employee; steps of the same batch merge', async () => {
    await post({ action: 'save_last_edit', location: 'India', cycle: 'India - Annual 2027', source: 'BULK', batchId: 'B-1', empIds: ['E1', 'E2'], merge: true });
    await post({ action: 'save_last_edit', location: 'India', cycle: 'India - Annual 2027', source: 'BULK', batchId: 'B-1', empIds: ['E2', 'E3'], merge: true });
    const g = await call(api, 'GET', { type: 'last_edit', location: 'India', cycle: 'India - Annual 2027' });
    const le = g.json.data.lastEdit;
    assert.deepStrictEqual(le.empIds, ['E1', 'E2', 'E3']);
    assert.strictEqual(le.source, 'BULK');
    assert.strictEqual(le.count, 3);
    assert.strictEqual(le.batchId, 'B-1');
    assert.strictEqual(rowsOf().length, 1);
  });

  await t('a later single edit wins over the bulk edit (most recent is the priority)', async () => {
    await post({ action: 'save_last_edit', location: 'India', cycle: 'India - Annual 2027', source: 'SHEET', empIds: ['E5'] });
    const le = (await call(api, 'GET', { type: 'last_edit', location: 'India', cycle: 'India - Annual 2027' })).json.data.lastEdit;
    assert.deepStrictEqual([le.source, le.empIds, le.batchId], ['SHEET', ['E5'], '']);
  });

  await t('a new bulk batch replaces, it does not merge into an older batch', async () => {
    await post({ action: 'save_last_edit', location: 'India', cycle: 'India - Annual 2027', source: 'BULK', batchId: 'B-2', empIds: ['E8'], merge: true });
    const le = (await call(api, 'GET', { type: 'last_edit', location: 'India', cycle: 'India - Annual 2027' })).json.data.lastEdit;
    assert.deepStrictEqual(le.empIds, ['E8']);
  });

  await t('last edit is kept per location and per cycle', async () => {
    await post({ action: 'save_last_edit', location: 'UK', cycle: 'UK - Annual 2027', source: 'SHEET', empIds: ['U1'] });
    assert.strictEqual(rowsOf().length, 2);
    const uk = (await call(api, 'GET', { type: 'last_edit', location: 'UK', cycle: 'UK - Annual 2027' })).json.data.lastEdit;
    const india = (await call(api, 'GET', { type: 'last_edit', location: 'India', cycle: 'India - Annual 2027' })).json.data.lastEdit;
    assert.deepStrictEqual([uk.empIds, india.empIds], [['U1'], ['E8']]);
    const none = (await call(api, 'GET', { type: 'last_edit', location: 'UK', cycle: 'Other' })).json.data.lastEdit;
    assert.strictEqual(none, null);
  });

  await t('dashboard note is one row that is updated in place', async () => {
    await post({ action: 'save_note', screen: 'DASHBOARD', location: 'India', cycle: 'c', text: 'first' });
    await post({ action: 'save_note', screen: 'DASHBOARD', location: 'India', cycle: 'c', text: 'second' });
    const g = await call(api, 'GET', { type: 'notes', screen: 'DASHBOARD', location: 'India' });
    assert.deepStrictEqual(g.json.data.notes.map((n) => n.text), ['second']);
    const other = await call(api, 'GET', { type: 'notes', screen: 'DASHBOARD', location: 'UK' });
    assert.strictEqual(other.json.data.notes.length, 0);
  });

  await t('detail screen notes are separate rows and can be deleted', async () => {
    const a = await post({ action: 'save_note', screen: 'DETAIL', location: 'India', cycle: 'c', text: 'note A', ctx: 'E1 · Asha' });
    await post({ action: 'save_note', screen: 'DETAIL', location: 'India', cycle: 'c', text: 'note B' });
    let g = await call(api, 'GET', { type: 'notes', screen: 'DETAIL', location: 'India' });
    assert.deepStrictEqual(g.json.data.notes.map((n) => [n.text, n.ctx]), [['note A', 'E1 · Asha'], ['note B', '']]);
    const del = await post({ action: 'delete_note', id: a.json.data.note.id });
    assert.strictEqual(del.status, 200);
    g = await call(api, 'GET', { type: 'notes', screen: 'DETAIL', location: 'India' });
    assert.deepStrictEqual(g.json.data.notes.map((n) => n.text), ['note B']);
    assert.strictEqual((await post({ action: 'save_note', screen: 'DETAIL', location: 'India', text: '  ' })).status, 400);
  });

  await t("one Tech-Ed cannot read or delete another Tech-Ed's rows", async () => {
    const mine = await post({ action: 'save_note', screen: 'DETAIL', location: 'India', cycle: 'c', text: 'private' });
    store.table(MASTER_TABLE).rows.push({ ROWID: '3', emp_id: 'EMP0077', email_id: 'other@x.com', emp_status: 'Active' });
    const other = load(store, { ...techEd, user_id: '10', email_id: 'other@x.com' });
    const g = await call(other, 'GET', { type: 'notes', screen: 'DETAIL', location: 'India' });
    assert.strictEqual(g.json.data.notes.length, 0);
    const del = await call(other, 'POST', {}, { action: 'delete_note', id: mine.json.data.note.id });
    assert.strictEqual(del.status, 404);
  });

  await t('HR login is refused (Tech-Ed only)', async () => {
    const hrApi = load(store, hr);
    const r = await call(hrApi, 'GET', { type: 'notes', screen: 'DASHBOARD', location: 'India' });
    assert.strictEqual(r.status, 403);
  });

  await t('Tech-Ed login without an Employee Master record gets a clear 409', async () => {
    const lost = load(store, { ...techEd, user_id: '11', email_id: 'nobody@x.com' });
    const r = await call(lost, 'GET', { type: 'notes', screen: 'DASHBOARD', location: 'India' });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.json.code, 'NO_EMP_ID');
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();