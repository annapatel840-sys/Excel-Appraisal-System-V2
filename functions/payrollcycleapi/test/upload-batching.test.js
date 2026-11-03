/* Large uploads must not save rows twice. A request that ran past Catalyst's
   ~30 s limit was resent by the browser, so payroll / feedback uploads and
   Generate Appraisal Sheet wrote their rows two or three times. Writes now go
   100 rows per call and stop 20 s into a request, reporting what was not saved;
   a repeated feedback row in one file is refused. A fake clock stands in for
   slow Catalyst writes. Run: node test/upload-batching.test.js */
'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const T = {
  sheet: '74008000000039094', master: '74008000000035727', payroll: '74008000000035326',
  cycles: '74008000000034190', audit: '74008000000034940', feedback: '74008000000022041',
  elig: '74008000000057046', delegation: '74008000000036124',
};
const COUNT = 1200;
const id = (i) => 'EMP' + String(i).padStart(4, '0');

const realNow = Date.now;
let clockOffset = 0;
Date.now = () => realNow() + clockOffset;

let DB;
let calls;
let slowWrites; // table id -> ms added to the clock by each batch write
let seq;
function seed() {
  seq = 0;
  clockOffset = 0;
  slowWrites = {};
  calls = { insertRows: {}, updateRows: {}, insertRow: {}, updateRow: {} };
  DB = { [T.cycles]: [{ ROWID: 'C27', cycle_name: 'Annual 2027', status: 'Active', archived: false, start_date: '2026-04-01' }],
    [T.master]: [], [T.payroll]: [], [T.feedback]: [], [T.sheet]: [], [T.elig]: [], [T.audit]: [], [T.delegation]: [] };
  for (let i = 1; i <= COUNT; i++) {
    DB[T.master].push({ ROWID: 'M' + i, emp_id: id(i), emp_name: 'Employee ' + i, emp_status: 'Active', designation: 'Engineer', department: 'Eng', date_of_join: '2020-01-01' });
  }
}
const count = (kind, tid) => calls[kind][tid] || 0;
function table(tid) {
  if (!DB[tid]) DB[tid] = [];
  const rows = DB[tid];
  const add = (r) => { const x = { ...r, ROWID: String(r.ROWID || 'R' + (++seq)) }; rows.push(x); return { ...x }; };
  const upd = (u) => { const r = rows.find((x) => x.ROWID === String(u.ROWID)); Object.assign(r, u); return { ...r }; };
  const tick = (key) => { calls[key][tid] = (calls[key][tid] || 0) + 1; if (slowWrites[tid]) clockOffset += slowWrites[tid]; };
  return {
    getAllColumns: async () => (tid === T.feedback
      ? ['emp_ID', 'emp_name', 'designation', 'revenue_released', 'gross_margin', 'manager_feedback', 'manager_rating',
          'client_feedback', 'client_rating', 'appraisal_cycle_name', 'Upload_Batch', 'fy_year']
      : tid === T.sheet
        ? ['emp_id', 'emp_master_row_id', 'cycle_id', 'manager_rating', 'rr_percent', 'gross_margin', 'client_rating']
        : []).map((c) => ({ column_name: c })),
    getPagedRows: async (o = {}) => {
      const start = Number(o.nextToken || 0);
      const size = o.maxRows || 200;
      const more = start + size < rows.length;
      return { data: rows.slice(start, start + size).map((r) => ({ ...r })), more_records: more, next_token: more ? String(start + size) : null };
    },
    insertRows: async (list) => { tick('insertRows'); assert.ok(list.length <= 100, 'batch of ' + list.length); return list.map(add); },
    updateRows: async (list) => { tick('updateRows'); assert.ok(list.length <= 100, 'batch of ' + list.length); return list.map(upd); },
    insertRow: async (r) => { calls.insertRow[tid] = (calls.insertRow[tid] || 0) + 1; return add(r); },
    updateRow: async (u) => { calls.updateRow[tid] = (calls.updateRow[tid] || 0) + 1; return upd(u); },
    deleteRows: async (ids) => { ids.forEach((x) => { const i = rows.findIndex((r) => r.ROWID === String(x)); if (i >= 0) rows.splice(i, 1); }); return true; },
  };
}

function load() {
  const dir = path.resolve(__dirname, '..');
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(dir) && !k.includes('node_modules')) delete require.cache[k]; });
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const accessStub = {
    HttpError,
    check: async () => ({ enforced: true, role: 'hr', scope: { all: true }, user: { email: 'hr@x.com', name: 'HR' } }),
    isEnforced: () => true,
    guard: (x, fn) => fn(),
    requireScreen: () => {},
    bumpVersion: async () => {},
  };
  const catalystStub = {
    initialize: () => ({
      datastore: () => ({ table }),
      userManagement: () => ({ getCurrentUser: async () => ({ user_id: '1', email_id: 'hr@x.com', first_name: 'HR', role_details: { role_name: 'HR' } }) }),
    }),
  };
  const orig = Module._load;
  Module._load = function (req, parent, ...rest) {
    if (req === 'zcatalyst-sdk-node') return catalystStub;
    if (req === './accessCore') return accessStub;
    return orig.call(this, req, parent, ...rest);
  };
  try { return require('../index.js'); } finally { Module._load = orig; }
}

function call(method, resource, body) {
  const api = load();
  return new Promise((resolve, reject) => {
    const req = { method, url: '/?resource=' + encodeURIComponent(resource), body, headers: {}, on() {} };
    const res = { status: 0, setHeader() {}, writeHead(s) { this.status = s; }, end(text) { resolve({ status: this.status, json: JSON.parse(text) }); } };
    api(req, res).catch(reject);
  });
}

const payrollRecords = (from, to) => Array.from({ length: to - from + 1 }, (_, k) => ({
  row: k + 2, empId: id(from + k), fyYear: '2025-26', basePay: 500000, hikePct: 10, hikeAmt: 50000, newBasePay: 550000, totalCtcRewards: 600000,
}));
const commit = (records) => call('POST', 'commit', { cycleId: 'C27', batchId: 'BATCH-TEST-1', fileName: 'p.xlsx', records });
const feedbackRecords = (ids) => ids.map((n, k) => ({ row: k + 2, empId: id(n), managerRating: 4, managerFeedback: 'Good', clientRating: 4, clientFeedback: 'ok', rrPercent: 90, grossMargin: 30, fyYear: 2026 }));
const importFb = (records) => call('POST', 'import', { screen: 'fb', cycleId: 'C27', batchId: 'BATCH-TEST-2', fileName: 'f.xlsx', records });

let pass = 0, fail = 0;
async function t(name, fn) { try { seed(); await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', String(e.stack).split('\n').slice(0, 3).join(' | ')); } }

(async () => {
  console.warn = () => {};

  await t('a 1,200-row payroll file is written 100 rows per call, one row per employee', async () => {
    const r = await commit(payrollRecords(1, COUNT));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    assert.strictEqual(r.json.data.succeeded, COUNT);
    assert.strictEqual(DB[T.payroll].length, COUNT);
    assert.strictEqual(count('insertRows', T.payroll), COUNT / 100);
    assert.strictEqual(count('insertRow', T.payroll), 0);
    assert.ok(!('masterRows' in r.json.data) && !('payrollRows' in r.json.data), 'no table rows in the response');
  });

  await t('sending the same payroll file again updates the rows instead of adding more', async () => {
    await commit(payrollRecords(1, COUNT));
    const again = await commit(payrollRecords(1, COUNT));
    assert.strictEqual(again.json.data.succeeded, COUNT);
    assert.strictEqual(DB[T.payroll].length, COUNT, 'still one row per employee');
  });

  await t('a payroll commit stops writing at the time limit and reports the rows not saved', async () => {
    slowWrites[T.payroll] = 9000; // each batch "takes" 9 s: the third starts after 20 s
    const r = await commit(payrollRecords(1, 500));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.json.data.succeeded, 300);
    assert.strictEqual(r.json.data.notSaved, 200);
    assert.strictEqual(DB[T.payroll].length, 300);
    const notSaved = r.json.data.rows.filter((row) => !row.ok);
    assert.strictEqual(notSaved.length, 200);
    assert.ok(notSaved.every((row) => /ran out of time/.test(row.reason)));
    // Sending the rows that were not saved completes the upload without duplicates.
    slowWrites[T.payroll] = 0;
    const rest = await commit(payrollRecords(301, 500));
    assert.strictEqual(rest.json.data.succeeded, 200);
    assert.strictEqual(DB[T.payroll].length, 500);
  });

  await t('the payroll upload history shows a file sent in parts as one upload', async () => {
    await commit(payrollRecords(1, 500));
    await commit(payrollRecords(501, 1000));
    const h = await call('GET', 'history');
    const batch = h.json.data.filter((b) => b.batchId === 'BATCH-TEST-1');
    assert.strictEqual(batch.length, 1, JSON.stringify(h.json.data));
    assert.strictEqual(batch[0].succeeded, 1000);
  });

  await t('feedback is written in batches and a repeated employee in one file is refused', async () => {
    const ids = Array.from({ length: 600 }, (_, k) => k + 1);
    const r = await importFb(feedbackRecords([...ids, 5]));
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    assert.strictEqual(r.json.data.succeeded, 600);
    assert.strictEqual(r.json.data.failed, 1);
    assert.match(r.json.data.rows[600].reason, /Duplicate Employee ID/);
    assert.strictEqual(DB[T.feedback].length, 600, 'one Feedback row per employee');
    assert.strictEqual(count('insertRows', T.feedback), 6);
    assert.strictEqual(count('insertRow', T.feedback), 0);
  });

  await t('a feedback upload refreshes only its own employees\' sheet rows, and only changed values', async () => {
    for (let i = 1; i <= 300; i++) {
      DB[T.sheet].push({ ROWID: 'S' + i, emp_id: id(i), emp_master_row_id: 'M' + i, cycle_id: 'C27', manager_rating: '', rr_percent: '', gross_margin: '' });
    }
    await importFb(feedbackRecords(Array.from({ length: 100 }, (_, k) => k + 1)));
    const refreshed = DB[T.sheet].filter((row) => String(row.manager_rating) === '4');
    assert.strictEqual(refreshed.length, 100, 'employees 1-100 refreshed');
    assert.strictEqual(String(DB[T.sheet][150].manager_rating), '', 'an employee not in the file is left alone');
    assert.strictEqual(count('updateRow', T.sheet), 0, 'no one-row-per-call sheet writes');
    const sheetBatches = count('updateRows', T.sheet);
    await importFb(feedbackRecords(Array.from({ length: 100 }, (_, k) => k + 1)));
    assert.strictEqual(count('updateRows', T.sheet), sheetBatches, 'unchanged values are not written again');
  });

  await t('Generate stops at the time limit, reports what remains, and the next run finishes without duplicates', async () => {
    for (let i = 1; i <= COUNT; i++) {
      DB[T.elig].push({ ROWID: 'E' + i, appraisal_cycle_id: 'C27', employee_master_id: 'M' + i, emp_id: id(i),
        eligibility_status: 'Eligible', eligibility_source: 'Manual' });
      DB[T.payroll].push({ ROWID: 'P' + i, emp_id: 'M' + i, appraisal_cycle_name: 'C27', new_base_pay: 550000 });
      DB[T.feedback].push({ ROWID: 'F' + i, emp_ID: 'M' + i, appraisal_cycle_name: 'C27', manager_feedback: 'Good', manager_rating: 4 });
    }
    slowWrites[T.sheet] = 4000; // each 100-row batch "takes" 4 s
    const first = await call('POST', 'generate-sheet', { cycleId: 'C27' });
    assert.strictEqual(first.status, 200, JSON.stringify(first.json).slice(0, 300));
    assert.strictEqual(first.json.data.partial, true, JSON.stringify(first.json.data));
    assert.ok(first.json.data.remaining > 0 && first.json.data.created > 0);
    assert.strictEqual(first.json.data.created + first.json.data.remaining, COUNT);
    slowWrites[T.sheet] = 0;
    clockOffset = 0;
    const second = await call('POST', 'generate-sheet', { cycleId: 'C27' });
    assert.strictEqual(second.json.data.partial, false, JSON.stringify(second.json.data));
    assert.strictEqual(second.json.data.created, first.json.data.remaining);
    const cycleRows = DB[T.sheet].filter((row) => row.cycle_id === 'C27');
    assert.strictEqual(cycleRows.length, COUNT);
    assert.strictEqual(new Set(cycleRows.map((row) => row.emp_id)).size, COUNT, 'one sheet row per employee');
    assert.strictEqual(count('insertRow', T.sheet), 0);
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  Date.now = realNow;
  process.exit(fail ? 1 : 0);
})();
