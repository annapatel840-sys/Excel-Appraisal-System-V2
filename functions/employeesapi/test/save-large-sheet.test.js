/* Saving works for every employee, not only the first 200 rows of a table.
   Catalyst's getAllRows() returns just the first 200 rows; the save used it,
   so an employee further down was "not found in the Active appraisal cycle"
   and Import inserted a second row for them. The employees saved here all
   sit past row 200. ZCQL is available (one-employee queries) or switched
   off (whole-table paged reads). Run: node test/save-large-sheet.test.js */
'use strict';

const assert = require('assert');
const http = require('http');
const Module = require('module');
const path = require('path');

const MASTER = '74008000000035727';
const SHEET = '74008000000039094';
const CYCLES = '74008000000034190';
const NAMES = { Appraisal_Sheet: SHEET, Employee_Master: MASTER };
const COUNT = 600;

let TABLES;
let calls;
let zcqlOn;
const id = (i) => 'EMP' + String(i).padStart(4, '0');
function seed() {
  calls = { zcql: 0, pages: {} };
  zcqlOn = true;
  TABLES = { [MASTER]: [], [SHEET]: [], [CYCLES]: [{ ROWID: 'C27', cycle_name: 'Annual 2027', status: 'Active', archived: false }] };
  for (let i = 1; i <= COUNT; i++) {
    // Tech-ED EMP0590 (row 590) owns the even employees, EMP0591 the odd ones.
    TABLES[MASTER].push({ ROWID: 'M' + i, emp_id: id(i), emp_name: 'Employee ' + i, email_id: 'e' + i + '@x.com', emp_status: 'Active' });
    // Cycle-less row from the Employee Master import, then the Active cycle row.
    TABLES[SHEET].push({ ROWID: 'O' + i, emp_id: id(i), cycle_id: null, hike_amount: '' });
  }
  for (let i = 1; i <= COUNT; i++) {
    TABLES[SHEET].push({ ROWID: 'S' + i, emp_id: id(i), cycle_id: 'C27', hike_amount: '', appraiser_tech_ed1: i % 2 ? 'M591' : 'M590' });
  }
}

let accessResult;
function load() {
  const dir = path.resolve(__dirname, '..');
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(dir) && !k.includes('node_modules')) delete require.cache[k]; });
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const accessStub = {
    HttpError,
    START_CATALOG: [],
    check: async () => accessResult,
    isEnforced: () => true,
    guard: (a, fn) => fn(),
    requireScreen: (a, key) => { if (key === 'employeeMaster' && a.role !== 'hr') throw new HttpError(403, 'No access to Employee Master.'); },
    requireAction: () => {}, requireEditColumns: () => {},
    inScope: (a) => Boolean(a.scope && a.scope.all),
    shapeRowByColumns: (a, row) => ({ ...row }),
    fieldOfColumn: () => '',
    bumpVersion: async () => {},
  };
  const tableApi = (tid) => ({
    getPagedRows: async (o = {}) => {
      calls.pages[tid] = (calls.pages[tid] || 0) + 1;
      const rows = TABLES[tid] || [];
      const start = Number(o.nextToken || 0);
      const size = o.maxRows || 200;
      const more = start + size < rows.length;
      return { data: rows.slice(start, start + size).map((r) => ({ ...r })), more_records: more, next_token: more ? String(start + size) : null };
    },
    // Like Catalyst: only the first 200 rows.
    getAllRows: async () => (TABLES[tid] || []).slice(0, 200).map((r) => ({ ...r })),
    insertRows: async (rows) => rows.map((r, i) => { const x = { ...r, ROWID: 'N' + i }; TABLES[tid].push(x); return x; }),
    updateRows: async (rows) => rows.map((u) => { const r = TABLES[tid].find((x) => x.ROWID === u.ROWID); Object.assign(r, u); return { ...r }; }),
    updateRow: async (u) => { const r = TABLES[tid].find((x) => x.ROWID === u.ROWID); Object.assign(r, u); return { ...r }; },
  });
  // Only the one-employee query the save sends: SELECT * FROM <table> WHERE emp_id = '<id>' ...
  const zcql = () => ({
    executeZCQLQuery: async (query) => {
      calls.zcql += 1;
      const m = /^SELECT \* FROM (\w+) WHERE emp_id = '([^']*)' ORDER BY ROWID ASC LIMIT 300$/.exec(query);
      if (!m) throw new Error('Unexpected query ' + query);
      return (TABLES[NAMES[m[1]]] || [])
        .filter((r) => String(r.emp_id || '').toLowerCase() === m[2].toLowerCase())
        .map((r) => ({ [m[1]]: { ...r } }));
    },
  });
  const catalystStub = {
    initialize: () => ({
      datastore: () => ({ table: tableApi }),
      ...(zcqlOn ? { zcql } : {}),
      userManagement: () => ({ getCurrentUser: async () => null }),
    }),
  };
  const orig = Module._load;
  Module._load = function (req, ...rest) {
    if (req === 'zcatalyst-sdk-node') return catalystStub;
    if (req === './accessCore') return accessStub;
    return orig.call(this, req, ...rest);
  };
  try { return require('../index.js'); } finally { Module._load = orig; }
}

function send(body, method = 'PATCH') {
  const handler = load();
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler).listen(0, () => {
      const data = JSON.stringify(body);
      const rq = http.request({ host: '127.0.0.1', port: server.address().port, path: '/', method, headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
        let out = ''; res.on('data', (c) => (out += c));
        res.on('end', () => { server.close(); resolve({ status: res.statusCode, json: JSON.parse(out || '{}') }); });
      });
      rq.on('error', reject); rq.end(data);
    });
  });
}

const hr = { enforced: true, role: 'hr', scope: { all: true }, user: { email: 'hr@x.com' }, fields: {} };
const techEd590 = { enforced: true, role: 'techEd', scope: { all: false, empIds: [] }, user: { email: 'e590@x.com', empId: id(590), name: 'Employee 590' }, fields: {} };
const sheetRow = (rowId) => TABLES[SHEET].find((r) => r.ROWID === rowId);

let pass = 0, fail = 0;
async function t(name, fn) { try { seed(); await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', String(e.stack).split('\n').slice(0, 3).join(' | ')); } }

(async () => {
  const origWarn = console.warn;
  console.warn = () => {};

  await t('HR saves an employee far past row 200 with one-employee queries', async () => {
    accessResult = hr;
    const r = await send({ emp_id: id(450), hike_amount: '50000' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(sheetRow('S450').hike_amount, '50000', 'the Active cycle row is updated');
    assert.strictEqual(sheetRow('O450').hike_amount, '', 'the cycle-less row is left alone');
    assert.strictEqual(calls.zcql, 2, 'one query for the sheet, one for Employee Master');
    assert.ok(!calls.pages[SHEET] && !calls.pages[MASTER], 'no whole-table read');
  });

  await t('the save still works when ZCQL is unavailable (whole tables, page by page)', async () => {
    accessResult = hr;
    zcqlOn = false;
    const r = await send({ emp_id: id(599), hike_amount: '7' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(sheetRow('S599').hike_amount, '7');
    assert.ok(calls.pages[SHEET] > 1, 'read past the first page');
  });

  await t('the employee ID is matched regardless of case', async () => {
    accessResult = hr;
    const r = await send({ emp_id: id(300).toLowerCase(), hike_amount: '3' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(sheetRow('S300').hike_amount, '3');
  });

  await t('a Tech-ED saves an own employee past row 200 and is refused for another team', async () => {
    accessResult = techEd590;
    const own = await send({ emp_id: id(420), hike_amount: '11' });
    assert.strictEqual(own.status, 200, JSON.stringify(own.json));
    assert.strictEqual(sheetRow('S420').hike_amount, '11');
    const other = await send({ emp_id: id(421), hike_amount: '12' });
    assert.strictEqual(other.status, 403, JSON.stringify(other.json));
    assert.strictEqual(sheetRow('S421').hike_amount, '');
  });

  await t('changing the Tech-ED finds a Tech-ED past row 200 of Employee Master', async () => {
    accessResult = hr;
    const r = await send({ emp_id: id(250), appraiser_tech_ed: id(591) + ' - Employee 591' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(sheetRow('S250').appraiser_tech_ed, 'M591');
  });

  await t('Import updates the Active cycle row of an employee past row 200 instead of adding one', async () => {
    accessResult = hr;
    const before = TABLES[SHEET].length;
    const r = await send({ employees: [{ emp_id: id(500), hike_amount: '999' }] }, 'POST');
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.data.created, 0, JSON.stringify(r.json.data));
    assert.strictEqual(TABLES[SHEET].length, before, 'no row inserted');
    assert.strictEqual(sheetRow('S500').hike_amount, '999');
    assert.strictEqual(sheetRow('O500').hike_amount, '');
  });

  console.warn = origWarn;
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
