/* employeesapi PUT: a Tech-ED can save the employees they own by
   Employee_Master ROWID even when Delegation scope is empty
   (access.inScope -> false), and is still refused for other teams.
   In-memory Data Store. Run: node test/teched-save-scope.test.js */
'use strict';

const assert = require('assert');
const http = require('http');
const Module = require('module');
const path = require('path');

const MASTER = '74008000000035727';
const SHEET = '74008000000039094';
let TABLES;
function seed() {
  TABLES = {
    [MASTER]: [
      { ROWID: '74008000000027043', emp_id: 'EMP0051', emp_name: 'Ashok Kumar', email_id: 'ashok@x.com', emp_status: 'Active' },
      { ROWID: '74008000000027046', emp_id: 'EMP0057', emp_name: 'Prabhu Parida', email_id: 'prabhu@x.com', emp_status: 'Active' },
      { ROWID: '74008000000030001', emp_id: 'EMP013', emp_name: 'Thirteen', email_id: 'e13@x.com', emp_status: 'Active' },
      { ROWID: '74008000000030002', emp_id: 'E2', emp_name: 'Two', email_id: 'e2@x.com', emp_status: 'Active' },
    ],
    // Saves go to the Active cycle's row.
    '74008000000034190': [{ ROWID: 'C1', cycle_name: 'Annual 2027', status: 'Active', archived: false }],
    [SHEET]: [
      { ROWID: '1', emp_id: 'EMP013', appraiser_tech_ed1: '74008000000027043', hike_amount: '', cycle_id: 'C1' },
      { ROWID: '2', emp_id: 'E2', appraiser_tech_ed1: '74008000000027046', hike_amount: '', cycle_id: 'C1' },
    ],
  };
}

let accessResult;
function load() {
  const dir = path.resolve(__dirname, '..');
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(dir) && !k.includes('node_modules')) delete require.cache[k]; });
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const accessStub = {
    HttpError,
    START_CATALOG: require('../accessCore').START_CATALOG || [],
    check: async () => accessResult,
    isEnforced: () => Boolean(accessResult.enforced),
    guard: (a, fn) => fn(),
    // Employee Master is HR-only (the bulk POST checks it).
    requireScreen: (a, key) => { if (key === 'employeeMaster' && a.role !== 'hr') throw new HttpError(403, 'No access to Employee Master.'); },
    requireAction: () => {}, requireEditColumns: () => {},
    inScope: (a) => Boolean(a.scope && a.scope.all), // Delegation scope empty
    shapeRowByColumns: (a, row) => ({ ...row }),
    fieldOfColumn: () => '',
    bumpVersion: async () => {},
  };
  const tableApi = (id) => ({
    getPagedRows: async () => ({ data: (TABLES[id] || []).map((r) => ({ ...r })), more_records: false }),
    getAllRows: async () => (TABLES[id] || []).map((r) => ({ ...r })),
    insertRows: async (rows) => rows.map((r, i) => { const x = { ...r, ROWID: 'N' + i }; TABLES[id].push(x); return x; }),
    updateRows: async (rows) => rows.map((u) => { const r = TABLES[id].find((x) => x.ROWID === u.ROWID); Object.assign(r, u); return { ...r }; }),
    updateRow: async (u) => { const r = TABLES[id].find((x) => x.ROWID === u.ROWID); Object.assign(r, u); return { ...r }; },
  });
  const catalystStub = {
    initialize: () => ({ datastore: () => ({ table: tableApi }), userManagement: () => ({ getCurrentUser: async () => null }) }),
  };
  const orig = Module._load;
  Module._load = function (req, ...rest) {
    if (req === 'zcatalyst-sdk-node') return catalystStub;
    if (req === './accessCore') return accessStub;
    return orig.call(this, req, ...rest);
  };
  try { return require('../index.js'); } finally { Module._load = orig; }
}

function put(handler, body, method = 'PUT') {
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

const ashok = { enforced: true, role: 'techEd', scope: { all: false, empIds: [] }, user: { email: 'ashok@x.com', empId: 'EMP0051', name: 'Ashok Kumar' }, fields: {} };
let pass = 0, fail = 0;
async function t(name, fn) { try { seed(); await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', String(e.stack).split('\n').slice(0, 3).join(' | ')); } }

(async () => {
  await t('Tech-ED saves Hike Amount for own employee (row-ID owner), no Delegation rows', async () => {
    accessResult = ashok;
    const r = await put(load(), { emp_id: 'EMP013', hike_amount: '50000' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(TABLES[SHEET][0].hike_amount, '50000');
  });

  await t('Tech-ED is refused for another Tech-ED\'s employee', async () => {
    accessResult = ashok;
    const r = await put(load(), { emp_id: 'E2', hike_amount: '1' });
    assert.strictEqual(r.status, 403, JSON.stringify(r.json));
    assert.ok(/do not have access to employee\(s\): E2/.test(r.json.message), r.json.message);
    assert.strictEqual(TABLES[SHEET][1].hike_amount, '');
  });

  await t('HR can still save any employee', async () => {
    accessResult = { enforced: true, role: 'hr', scope: { all: true }, user: { email: 'hr@x.com' }, fields: {} };
    const r = await put(load(), { emp_id: 'E2', hike_amount: '7' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  });

  await t('Tech-ED cannot change Delegation directly, even for an own employee', async () => {
    accessResult = ashok;
    const r = await put(load(), { emp_id: 'EMP013', comp_manager: 'EMP0057' });
    assert.strictEqual(r.status, 403, JSON.stringify(r.json));
    assert.match(r.json.message, /Delegation request/);
  });

  await t('Tech-ED cannot bulk-write Appraisal Sheet rows, even for an own employee', async () => {
    accessResult = ashok;
    const r = await put(load(), { employees: [{ emp_id: 'EMP013', hike_amount: '999' }] }, 'POST');
    assert.strictEqual(r.status, 403, JSON.stringify(r.json));
    assert.match(r.json.message, /Employee Master/);
    assert.strictEqual(TABLES[SHEET][0].hike_amount, '');
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
