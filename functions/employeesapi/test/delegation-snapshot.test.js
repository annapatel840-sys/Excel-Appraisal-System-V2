/* Every employeesapi GET syncs one Delegation row per employee for the active
   cycle. It used to rewrite every row on every load; now it writes only a new
   or changed row, and reports delegation_saved so the Delegation screen can
   skip its one-time roster fill. Run: node test/delegation-snapshot.test.js */
'use strict';

const assert = require('assert');
const http = require('http');
const Module = require('module');
const path = require('path');

const T = {
  sheet: '74008000000039094', master: '74008000000035727', cycles: '74008000000034190',
  elig: '74008000000057046', payroll: '74008000000035326', delegation: '74008000000036124',
};

let DB;
let writes;
let seq;
function table(id) {
  if (!DB[id]) DB[id] = [];
  const rows = DB[id];
  return {
    getAllColumns: async () => [],
    getPagedRows: async () => ({ data: rows.map((r) => ({ ...r })), more_records: false }),
    getAllRows: async () => rows.map((r) => ({ ...r })),
    insertRow: async (row) => {
      if (id === T.delegation) writes.push({ type: 'insert', row });
      const saved = { ...row, ROWID: 'D' + (++seq) };
      rows.push(saved);
      return { ...saved };
    },
    updateRow: async (u) => {
      if (id === T.delegation) writes.push({ type: 'update', row: u });
      const r = rows.find((x) => x.ROWID === String(u.ROWID));
      Object.assign(r, u);
      return { ...r };
    },
  };
}

function load() {
  const dir = path.resolve(__dirname, '..');
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(dir) && !k.includes('node_modules')) delete require.cache[k]; });
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const accessStub = {
    HttpError,
    START_CATALOG: [],
    check: async () => ({ enforced: true, role: 'hr', scope: { all: true }, user: { email: 'hr@x.com' }, fields: {} }),
    isEnforced: () => true,
    guard: (a, fn) => fn(),
    requireScreen: () => {}, requireAction: () => {}, requireEditColumns: () => {},
    inScope: () => true,
    shapeRowByColumns: (a, row) => ({ ...row }),
    fieldOfColumn: () => '',
    bumpVersion: async () => {},
  };
  const catalystStub = { initialize: () => ({ datastore: () => ({ table }), userManagement: () => ({ getCurrentUser: async () => null }) }) };
  const orig = Module._load;
  Module._load = function (req, ...rest) {
    if (req === 'zcatalyst-sdk-node') return catalystStub;
    if (req === './accessCore') return accessStub;
    return orig.call(this, req, ...rest);
  };
  try { return require('../index.js'); } finally { Module._load = orig; }
}

function get(query) {
  const handler = load();
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler).listen(0, () => {
      http.get('http://127.0.0.1:' + server.address().port + '/?' + query, (res) => {
        let body = ''; res.on('data', (c) => (body += c));
        res.on('end', () => { server.close(); resolve({ status: res.statusCode, json: JSON.parse(body) }); });
      }).on('error', reject);
    });
  });
}

function seed() {
  writes = [];
  seq = 0;
  DB = {
    [T.cycles]: [
      { ROWID: 'C27', cycle_name: 'Annual 2027', status: 'Active', archived: false, start_date: '2026-04-01', end_date: '2027-03-31' },
    ],
    [T.master]: [
      { ROWID: 'M22', emp_id: 'EMP022', emp_name: 'Meena Das', emp_status: 'Active', appraiser_tech_ed: 'EMP051 - Ashok Kumar' },
      { ROWID: 'M51', emp_id: 'EMP051', emp_name: 'Ashok Kumar', emp_status: 'Active' },
      { ROWID: 'M60', emp_id: 'EMP060', emp_name: 'Ravi Rao', emp_status: 'Active' },
    ],
    [T.elig]: [{ ROWID: 'E1', appraisal_cycle_id: 'C27', employee_master_id: 'M22', emp_id: 'EMP022', eligibility_status: 'Eligible' }],
    [T.sheet]: [
      { ROWID: 'S27', emp_id: 'EMP022', name: 'Meena Das', emp_master_row_id: 'M22', cycle_id: 'C27',
        eligible_status: 'Eligible', status: 'Active' },
    ],
    [T.delegation]: [],
  };
}

const delegationRow = (r) => r.json.data.find((e) => e.emp_id === 'EMP022');

let pass = 0, fail = 0;
async function t(name, fn) { try { seed(); await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', String(e.stack).split('\n').slice(0, 3).join(' | ')); } }

(async () => {
  const origError = console.error;
  console.error = () => {};

  await t('first load saves a Delegation row and reports it was not saved before', async () => {
    const r = await get('page=1&limit=1000&view=delegation');
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(delegationRow(r).delegation_saved, false);
    assert.strictEqual(DB[T.delegation].length, 1);
    assert.deepStrictEqual(writes.map((w) => w.type), ['insert']);
  });

  await t('an unchanged load writes nothing and reports the row as saved', async () => {
    await get('page=1&limit=1000&view=delegation');
    writes = [];
    const r = await get('page=1&limit=1000&view=delegation');
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(delegationRow(r).delegation_saved, true);
    assert.deepStrictEqual(writes, []);
    assert.strictEqual(DB[T.delegation].length, 1);
  });

  await t('a changed assignment is still saved', async () => {
    await get('page=1&limit=1000&view=delegation');
    writes = [];
    DB[T.master].find((m) => m.ROWID === 'M22').appraiser_tech_ed = 'EMP060 - Ravi Rao';
    const r = await get('page=1&limit=1000&view=delegation');
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual(writes.map((w) => w.type), ['update']);
    assert.strictEqual(DB[T.delegation].length, 1);
    assert.match(String(DB[T.delegation][0].appraiser_tech_ed), /EMP060/);
  });

  console.error = origError;
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
