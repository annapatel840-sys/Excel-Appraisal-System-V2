/* employeesapi PATCH: edits go to the Active cycle's Appraisal_Sheet row even
   when the employee's first row belongs to an older cycle (or has no cycle)
   and the signed-in role cannot read Appraisal_Cycle_Master (only the admin
   scope can, as in the live project). Run: node test/save-active-cycle.test.js */
'use strict';

const assert = require('assert');
const http = require('http');
const Module = require('module');
const path = require('path');

const T = { sheet: '74008000000039094', master: '74008000000035727', cycles: '74008000000034190' };
let DB;
function makeTable(id, scope) {
  const rows = () => DB[id] || (DB[id] = []);
  const deny = () => {
    if (scope === 'user' && id === T.cycles) {
      const error = new Error('No privileges to perform this action');
      error.code = 'NO_PRIVILEGE';
      throw error;
    }
  };
  return {
    getPagedRows: async () => { deny(); return { data: rows().map((r) => ({ ...r })), more_records: false }; },
    getAllRows: async () => { deny(); return rows().map((r) => ({ ...r })); },
    updateRow: async (u) => { const r = rows().find((x) => x.ROWID === u.ROWID); Object.assign(r, u); return { ...r }; },
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
    isEnforced: () => true,
    guard: (a, fn) => fn(),
    requireScreen: () => {}, requireAction: () => {}, requireEditColumns: () => {},
    inScope: () => true,
    shapeRowByColumns: (a, row) => ({ ...row }),
    fieldOfColumn: () => '',
    bumpVersion: async () => {},
  };
  const catalystStub = {
    initialize: (req, opts) => {
      const scope = opts && opts.scope === 'admin' ? 'admin' : 'user';
      return { datastore: () => ({ table: (id) => makeTable(id, scope) }), userManagement: () => ({ getCurrentUser: async () => null }) };
    },
  };
  const orig = Module._load;
  Module._load = function (req, ...rest) {
    if (req === 'zcatalyst-sdk-node') return catalystStub;
    if (req === './accessCore') return accessStub;
    return orig.call(this, req, ...rest);
  };
  try { return require('../index.js'); } finally { Module._load = orig; }
}

function patch(body) {
  const handler = load();
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler).listen(0, () => {
      const data = JSON.stringify(body);
      const rq = http.request({ host: '127.0.0.1', port: server.address().port, path: '/', method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
        let out = ''; res.on('data', (c) => (out += c));
        res.on('end', () => { server.close(); resolve({ status: res.statusCode, json: JSON.parse(out || '{}') }); });
      });
      rq.on('error', reject); rq.end(data);
    });
  });
}

function seed(activeStatus = 'Active') {
  DB = {
    [T.cycles]: [
      { ROWID: 'C25', cycle_name: 'Annual 2025', status: 'Closed', archived: true },
      { ROWID: 'C27', cycle_name: 'Annual 2027', status: activeStatus, archived: false },
    ],
    [T.master]: [{ ROWID: 'M22', emp_id: 'EMP022', emp_name: 'Meena Das', emp_status: 'Active' }],
    // Same order as live: older-cycle row first, then a no-cycle row, then the Active one.
    [T.sheet]: [
      { ROWID: 'R25', emp_id: 'EMP022', cycle_id: 'C25', allocated_pb_amount: null },
      { ROWID: 'RNULL', emp_id: 'EMP022', cycle_id: null, allocated_pb_amount: null },
      { ROWID: 'R27', emp_id: 'EMP022', cycle_id: 'C27', allocated_pb_amount: null, hike_amount: '25000' },
    ],
  };
}
const row = (id) => DB[T.sheet].find((r) => r.ROWID === id);

let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', String(e.stack).split('\n').slice(0, 3).join(' | ')); } }

(async () => {
  accessResult = { enforced: true, role: 'hr', scope: { all: true }, user: { email: 'hr@x.com' }, fields: {} };

  await t('PB and instalment are saved on the Active cycle row, not the first row', async () => {
    seed();
    let r = await patch({ emp_id: 'EMP022', allocated_pb_amount: 30 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    r = await patch({ emp_id: 'EMP022', pb_installment: '2' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(row('R27').allocated_pb_amount, 30);
    assert.strictEqual(row('R27').pb_installment, '2');
    assert.strictEqual(row('R25').allocated_pb_amount, null, 'closed-cycle row untouched');
    assert.strictEqual(row('RNULL').allocated_pb_amount, null, 'no-cycle row untouched');
  });

  await t('without an Active cycle nothing is saved (409), no fallback row', async () => {
    seed('Closed');
    const r = await patch({ emp_id: 'EMP022', allocated_pb_amount: 30 });
    assert.strictEqual(r.status, 409, JSON.stringify(r.json));
    assert.ok(DB[T.sheet].every((x) => x.allocated_pb_amount === null));
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
