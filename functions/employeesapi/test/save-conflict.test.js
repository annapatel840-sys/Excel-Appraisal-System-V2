/* Two people editing the same Appraisal Sheet cell: the second save must not
   silently overwrite the first. The browser sends the value it showed before
   the edit (expected); if the stored value has changed since, employeesapi
   answers 409 and saves nothing. Run: node test/save-conflict.test.js */
'use strict';

const assert = require('assert');
const http = require('http');
const Module = require('module');
const path = require('path');

const MASTER = '74008000000035727';
const SHEET = '74008000000039094';
const CYCLES = '74008000000034190';
const NAMES = { Appraisal_Sheet: SHEET, Employee_Master: MASTER };

let TABLES;
function seed() {
  TABLES = {
    [CYCLES]: [{ ROWID: 'C27', cycle_name: 'Annual 2027', status: 'Active', archived: false }],
    [MASTER]: [{ ROWID: 'M1', emp_id: 'EMP001', emp_name: 'Riya Sen', emp_status: 'Active' }],
    [SHEET]: [{
      ROWID: 'S1', emp_id: 'EMP001', cycle_id: 'C27', hike_amount: '50000', hike_pct: '10', comp_manager_remarks: null,
      new_rb: null, current_annual_base_pay: '500000',
    }],
  };
}

function load() {
  const dir = path.resolve(__dirname, '..');
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(dir) && !k.includes('node_modules')) delete require.cache[k]; });
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const accessStub = {
    HttpError, START_CATALOG: [],
    check: async () => ({ enforced: true, role: 'hr', scope: { all: true }, user: { email: 'hr@x.com' }, fields: {} }),
    isEnforced: () => true, guard: (a, fn) => fn(),
    requireScreen: () => {}, requireAction: () => {}, requireEditColumns: () => {},
    inScope: () => true, shapeRowByColumns: (a, row) => ({ ...row }), fieldOfColumn: () => '', bumpVersion: async () => {},
  };
  const tableApi = (tid) => ({
    getPagedRows: async () => ({ data: (TABLES[tid] || []).map((r) => ({ ...r })), more_records: false }),
    getAllRows: async () => (TABLES[tid] || []).map((r) => ({ ...r })),
    updateRow: async (u) => { const r = TABLES[tid].find((x) => x.ROWID === u.ROWID); Object.assign(r, u); return { ...r }; },
  });
  const zcql = () => ({
    executeZCQLQuery: async (query) => {
      const m = /^SELECT \* FROM (\w+) WHERE emp_id = '([^']*)'/.exec(query);
      return (TABLES[NAMES[m[1]]] || []).filter((r) => r.emp_id.toLowerCase() === m[2].toLowerCase()).map((r) => ({ [m[1]]: { ...r } }));
    },
  });
  const catalystStub = { initialize: () => ({ datastore: () => ({ table: tableApi }), zcql, userManagement: () => ({ getCurrentUser: async () => null }) }) };
  const orig = Module._load;
  Module._load = function (req, ...rest) {
    if (req === 'zcatalyst-sdk-node') return catalystStub;
    if (req === './accessCore') return accessStub;
    return orig.call(this, req, ...rest);
  };
  try { return require('../index.js'); } finally { Module._load = orig; }
}

function save(body) {
  const handler = load();
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler).listen(0, () => {
      const data = JSON.stringify({ emp_id: 'EMP001', ...body });
      const rq = http.request({ host: '127.0.0.1', port: server.address().port, path: '/', method: 'PATCH', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
        let out = ''; res.on('data', (c) => (out += c));
        res.on('end', () => { server.close(); resolve({ status: res.statusCode, json: JSON.parse(out || '{}') }); });
      });
      rq.on('error', reject); rq.end(data);
    });
  });
}
const row = () => TABLES[SHEET][0];

let pass = 0, fail = 0;
async function t(name, fn) { try { seed(); await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', String(e.stack).split('\n').slice(0, 3).join(' | ')); } }

(async () => {
  console.warn = () => {};

  await t('two people edit the same cell: the second save is refused, the first value stays', async () => {
    // Both loaded Hike Amount 50,000. User A saves 60,000 first.
    const a = await save({ hike_amount: 60000, expected: { hike_amount: 50000 } });
    assert.strictEqual(a.status, 200, JSON.stringify(a.json));
    assert.strictEqual(row().hike_amount, 60000);
    // User B, still showing 50,000, saves 70,000.
    const b = await save({ hike_amount: 70000, expected: { hike_amount: 50000 } });
    assert.strictEqual(b.status, 409, JSON.stringify(b.json));
    assert.strictEqual(b.json.conflict, true);
    assert.match(b.json.message, /Hike Amount was changed by someone else to 60000/);
    assert.deepStrictEqual(b.json.conflicts, [{ column: 'hike_amount', expected: 50000, current: '60000' }]);
    assert.strictEqual(row().hike_amount, 60000, 'A\'s value is kept');
  });

  await t('Hike Amount and Hike % saved together are refused if either changed', async () => {
    row().hike_pct = '12';
    const r = await save({ hike_amount: 55000, hike_pct: 11, expected: { hike_amount: 50000, hike_pct: 10 } });
    assert.strictEqual(r.status, 409, JSON.stringify(r.json));
    assert.strictEqual(row().hike_amount, '50000', 'nothing saved');
  });

  await t('the same person saving again, from the value they just saved, works', async () => {
    await save({ hike_amount: 60000, expected: { hike_amount: 50000 } });
    const again = await save({ hike_amount: 65000, expected: { hike_amount: 60000 } });
    assert.strictEqual(again.status, 200, JSON.stringify(again.json));
  });

  await t('an empty stored value matches 0 (numbers) and "" (text)', async () => {
    const n = await save({ new_rb: 5000, expected: { new_rb: 0 } });
    assert.strictEqual(n.status, 200, JSON.stringify(n.json));
    const s = await save({ comp_manager_remarks: 'Good year', expected: { comp_manager_remarks: '' } });
    assert.strictEqual(s.status, 200, JSON.stringify(s.json));
    const f = await save({ hike_pct: 10.5, expected: { hike_pct: '10.00' } });
    assert.strictEqual(f.status, 200, 'number formats compare by value');
  });

  await t('fields the grid derives on load are not checked', async () => {
    const r = await save({ current_annual_base_pay: 510000, expected: { current_annual_base_pay: 999 } });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
  });

  await t('a save without expected values (bulk tools, older screens) works as before', async () => {
    const r = await save({ hike_amount: 1 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(row().hike_amount, 1);
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
