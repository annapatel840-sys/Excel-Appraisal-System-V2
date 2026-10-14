/* Appraisal cycle API tests (payrollcycleapi, resource=cycles/...).
   In-memory Data Store; runs once with the current Appraisal_Cycle_Master
   columns and once with the optional columns (cycle_type, process,
   effective_date, cancel_reason). Run: node test/cycles.test.js */
'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const BASE_COLUMNS = ['cycle_name', 'start_date', 'end_date', 'status', 'remarks', 'changed_by', 'changed_at', 'archived'];
const OPTIONAL = ['cycle_type', 'process', 'effective_date', 'cancel_reason'];

function makeStore(columns) {
  let seq = 1000;
  const tables = {};
  const table = (id, cols) => {
    if (tables[id]) return tables[id];
    const rows = [];
    const check = (row) => Object.keys(row).forEach((k) => {
      if (k !== 'ROWID' && cols && !cols.includes(k)) throw new Error(`Invalid column ${k}`);
    });
    tables[id] = {
      rows,
      getAllColumns: async () => (cols || []).map((c) => ({ column_name: c })),
      getPagedRows: async () => ({ data: rows.map((r) => ({ ...r })), more_records: false }),
      insertRow: async (row) => { check(row); const r = { ...row, ROWID: String(++seq) }; rows.push(r); return { ...r }; },
      updateRow: async (row) => { check(row); const r = rows.find((x) => x.ROWID === String(row.ROWID)); Object.assign(r, row); return { ...r }; },
      deleteRow: async (id2) => { const i = rows.findIndex((x) => x.ROWID === String(id2)); rows.splice(i, 1); return true; },
    };
    return tables[id];
  };
  return { tables, table, cycleColumns: columns };
}

function load(store) {
  const dir = path.resolve(__dirname, '..');
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(dir) && !k.includes('node_modules')) delete require.cache[k]; });
  const catalystStub = {
    initialize: () => ({
      datastore: () => ({
        table: (id) => store.table(id, id === '74008000000034190' ? store.cycleColumns : null),
      }),
      userManagement: () => ({
        getCurrentUser: async () => ({ user_id: '1', first_name: 'Sarmistha', last_name: 'A', email_id: 'hr@x.com', role_details: { role_name: 'HR' } }),
      }),
    }),
  };
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const accessStub = {
    HttpError,
    check: async () => ({ dryRun: true, enforced: false }),
    isEnforced: () => false,
    guard: (a, fn) => fn(),
    requireScreen: () => {},
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

function call(api, method, resource, body) {
  return new Promise((resolve, reject) => {
    const req = { method, url: '/?resource=' + encodeURIComponent(resource), body: body || (method === 'POST' ? {} : undefined), on() {} };
    const res = { status: 0, writeHead(s) { this.status = s; }, end(text) { resolve({ status: this.status, json: JSON.parse(text) }); } };
    api(req, res).catch(reject);
  });
}

const iso = (offsetDays) => new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 10);
const ist = () => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); }
}

async function scenario(label, columns) {
  console.log('\n--- ' + label);
  const store = makeStore(columns);
  const api = load(store);
  const post = (r, b) => call(api, 'POST', r, b);
  const cycles = async () => (await call(api, 'GET', 'cycles')).json.data;
  const byName = async (n) => (await cycles()).find((c) => c.name === n);
  const optional = columns.includes('process');

  await t('create Annual cycle (dates required)', async () => {
    const r = await post('cycles/create', { name: 'Annual 2027', type: 'Annual', process: 'Annual', effective: iso(9), start: iso(10), end: iso(40) });
    assert.strictEqual(r.status, 201, JSON.stringify(r.json));
    const c = await byName('Annual 2027');
    assert.strictEqual(c.status, 'Upcoming');
    if (optional) assert.deepStrictEqual([c.type, c.process, c.effective], ['Annual', 'Annual', iso(9)]);
    else assert.deepStrictEqual([c.type, c.process], ['', '']);
  });

  await t('create New Joiner cycle on "No process" with only the effective date', async () => {
    const r = await post('cycles/create', { name: 'New Joiner 2027', type: 'New Joiner', process: 'None', effective: iso(5), start: '', end: '' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.json));
    const c = await byName('New Joiner 2027');
    // Without effective_date the effective date is kept in start_date.
    if (optional) assert.deepStrictEqual([c.start, c.effective], ['', iso(5)]);
    else assert.strictEqual(c.start, iso(5));
  });

  await t('"No process" without effective date is refused', async () => {
    const r = await post('cycles/create', { name: 'New Joiner X', type: 'New Joiner', process: 'None', effective: '' });
    assert.strictEqual(r.status, 400);
  });

  await t('Annual process without dates is refused; close must be after start', async () => {
    assert.strictEqual((await post('cycles/create', { name: 'Annual X', type: 'Annual', process: 'Annual', effective: iso(1) })).status, 400);
    assert.strictEqual((await post('cycles/create', { name: 'Annual Y', type: 'Annual', process: 'Annual', start: iso(5), end: iso(5) })).status, 400);
  });

  await t('duplicate name refused (case-insensitive)', async () => {
    const r = await post('cycles/create', { name: 'annual 2027', type: 'Annual', process: 'Annual', start: iso(10), end: iso(40) });
    assert.strictEqual(r.status, 409);
  });

  await t('status rules: Upcoming cannot jump to Closed', async () => {
    const c = await byName('Annual 2027');
    const r = await post('cycles/status/' + c.id, { status: 'Closed' });
    assert.strictEqual(r.status, 409);
    assert.match(r.json.message, /cannot move from Upcoming to Closed/);
  });

  await t('activate with a remark: remark appended in the same save, IST time', async () => {
    const c = await byName('Annual 2027');
    const r = await post('cycles/status/' + c.id, { status: 'Active', remark: 'All checks done' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const after = await byName('Annual 2027');
    assert.strictEqual(after.status, 'Active');
    assert.ok(after.remarks.endsWith('Activate: All checks done'), after.remarks);
    assert.ok(after.changedAt.startsWith(ist()), after.changedAt + ' vs IST ' + ist());
    if (optional) assert.strictEqual(after.process, 'Annual');
  });

  await t('only one Active cycle: second activation says close or archive', async () => {
    const r1 = await post('cycles/create', { name: 'Exceptional 2027', type: 'Exceptional', process: 'Exceptional', start: iso(10), end: iso(20) });
    assert.strictEqual(r1.status, 201);
    const c = await byName('Exceptional 2027');
    const r = await post('cycles/status/' + c.id, { status: 'Active' });
    assert.strictEqual(r.status, 409);
    assert.match(r.json.message, /Close or archive "Annual 2027" first/);
  });

  await t('Active cannot go back to Upcoming; process locked once Active', async () => {
    const c = await byName('Annual 2027');
    assert.strictEqual((await post('cycles/status/' + c.id, { status: 'Upcoming' })).status, 409);
    const r = await post('cycles/update/' + c.id, { name: c.name, process: 'Exceptional', start: c.start, end: c.end, effective: c.effective || c.start });
    assert.strictEqual(r.status, 409);
    assert.match(r.json.message, /only be changed while the cycle is Upcoming/);
  });

  await t('archive needs Closed; close, reopen, close, archive; archived is read-only', async () => {
    const c = await byName('Annual 2027');
    assert.strictEqual((await post('cycles/archive/' + c.id, { archived: true })).status, 409);
    assert.strictEqual((await post('cycles/status/' + c.id, { status: 'Closed', remark: 'done' })).status, 200);
    assert.strictEqual((await post('cycles/status/' + c.id, { status: 'Active' })).status, 200);
    assert.strictEqual((await post('cycles/status/' + c.id, { status: 'Closed' })).status, 200);
    assert.strictEqual((await post('cycles/archive/' + c.id, { archived: true, remark: 'final' })).status, 200);
    const a = await byName('Annual 2027');
    assert.ok(a.archived);
    assert.ok(/Close: done \| Archive: final$/.test(a.remarks), a.remarks);
    assert.strictEqual((await post('cycles/status/' + c.id, { status: 'Active' })).status, 409);
    assert.strictEqual((await post('cycles/update/' + c.id, { name: c.name, start: c.start, end: c.end })).status, 409);
  });

  await t('Add remark appends instead of overwriting; audit holds only the new remark', async () => {
    const c = await byName('Exceptional 2027');
    await post('cycles/remarks/' + c.id, { remark: 'first' });
    await post('cycles/remarks/' + c.id, { remarks: 'second' });
    assert.strictEqual((await byName('Exceptional 2027')).remarks, 'first | second');
    const audit = store.tables['74008000000034940'].rows.filter((r) => r.field_name === 'Remarks changed');
    assert.strictEqual(JSON.parse(audit[audit.length - 1].details).newRemarks, 'second');
  });

  await t('edit dates: audit records before and after', async () => {
    const c = await byName('Exceptional 2027');
    const r = await post('cycles/update/' + c.id, { name: c.name, process: 'Exceptional', start: iso(11), end: iso(25), effective: iso(11) });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const audit = store.tables['74008000000034940'].rows.filter((r2) => r2.field_name === 'Cycle edited').pop();
    const d = JSON.parse(audit.details);
    assert.strictEqual(d.before.start, iso(10));
    assert.strictEqual(d.after.end, iso(25));
    assert.match(d.message, /start .* → /);
  });

  await t('cancel: reason required, status Cancelled, reason shown, then read-only', async () => {
    const c = await byName('Exceptional 2027');
    assert.strictEqual((await post('cycles/cancel/' + c.id, { reason: '' })).status, 400);
    const r = await post('cycles/cancel/' + c.id, { reason: 'Merged into Annual' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const after = await byName('Exceptional 2027');
    assert.strictEqual(after.status, 'Cancelled');
    assert.strictEqual(after.cancelReason, 'Merged into Annual');
    assert.strictEqual((await post('cycles/status/' + c.id, { status: 'Active' })).status, 409);
    const dup = await post('cycles/create', { name: 'Exceptional 2027', type: 'Exceptional', process: 'Exceptional', start: iso(10), end: iso(20) });
    assert.strictEqual(dup.status, 409);
    assert.match(dup.json.message, /cancelled cycle/);
  });

  await t('cancel is refused for Closed / archived cycles', async () => {
    const c = await byName('Annual 2027');
    assert.strictEqual((await post('cycles/cancel/' + c.id, { reason: 'x' })).status, 409);
  });

  await t('delete: only Upcoming before its start date', async () => {
    const r1 = await post('cycles/create', { name: 'Mid-Year 2027', type: 'Mid-Year', process: 'Annual', start: iso(0), end: iso(30) });
    assert.strictEqual(r1.status, 201);
    const today = await byName('Mid-Year 2027');
    assert.strictEqual((await post('cycles/delete/' + today.id)).status, 409);
    const nj = await byName('New Joiner 2027');
    assert.strictEqual((await post('cycles/delete/' + nj.id)).status, 200);
    assert.strictEqual(await byName('New Joiner 2027'), undefined);
  });

  await t('unknown action still answers 404', async () => {
    const c = await byName('Annual 2027');
    assert.strictEqual((await post('cycles/explode/' + c.id)).status, 404);
  });
}

(async () => {
  await scenario('current table (no optional columns)', BASE_COLUMNS);
  await scenario('table with cycle_type, process, effective_date, cancel_reason', BASE_COLUMNS.concat(OPTIONAL));
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
