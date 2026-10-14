/* employeesapi GET: Tech-ED sees the employees whose Appraiser Tech-ED points
   to their Employee_Master ROWID; the grid gets "EMP - Name", never the ROWID.
   In-memory Data Store. Run: node test/teched-rowid.test.js */
'use strict';

const assert = require('assert');
const http = require('http');
const Module = require('module');
const path = require('path');

const MASTER = '74008000000035727';
const SHEET = '74008000000039094';
const TABLES = {
  [MASTER]: [
    { ROWID: '74008000000027043', emp_id: 'EMP0051', emp_name: 'Ashok Kumar', email_id: 'ashok@x.com', emp_status: 'Active', eligibility: 'Eligible' },
    { ROWID: '74008000000027046', emp_id: 'EMP0057', emp_name: 'Prabhu Parida', email_id: 'prabhu@x.com', emp_status: 'Active', eligibility: 'Eligible' },
    { ROWID: '74008000000030001', emp_id: 'E1', emp_name: 'One', email_id: 'e1@x.com', emp_status: 'Active', eligibility: 'Eligible' },
    { ROWID: '74008000000030002', emp_id: 'E2', emp_name: 'Two', email_id: 'e2@x.com', emp_status: 'Active', eligibility: 'Eligible' },
    { ROWID: '74008000000030003', emp_id: 'E3', emp_name: 'Three', email_id: 'e3@x.com', emp_status: 'Active', eligibility: 'Eligible' },
    { ROWID: '74008000000030004', emp_id: 'E4', emp_name: 'Four', email_id: 'e4@x.com', emp_status: 'Active', eligibility: 'Eligible' },
    { ROWID: '74008000000030005', emp_id: 'E5', emp_name: 'Five', email_id: 'e5@x.com', emp_status: 'Active', eligibility: 'Eligible' },
  ],
  [SHEET]: [
    { ROWID: '1', emp_id: 'E1', appraiser_tech_ed1: '74008000000027043' },
    { ROWID: '2', emp_id: 'E2', appraiser_tech_ed1: '74008000000027043' },
    { ROWID: '3', emp_id: 'E3', appraiser_tech_ed1: '74008000000027046' },
    { ROWID: '4', emp_id: 'E4', appraiser_tech_ed: 'EMP0051 - Ashok Kumar' },     // legacy text
    { ROWID: '5', emp_id: 'E5', appraiser_tech_ed: '74008000000027046' },         // ROWID in the old column
  ],
};

let currentUser;
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
    requireScreen: () => {}, requireAction: () => {}, requireEditColumns: () => {},
    inScope: () => false,
    shapeRowByColumns: (a, row) => ({ ...row }),
    fieldOfColumn: () => '',
    bumpVersion: async () => {},
  };
  const catalystStub = {
    initialize: () => ({
      datastore: () => ({ table: (id) => ({ getPagedRows: async () => ({ data: (TABLES[id] || []).map((r) => ({ ...r })), more_records: false }) }) }),
      userManagement: () => ({ getCurrentUser: async () => currentUser }),
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

function get(handler, query) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler).listen(0, () => {
      http.get('http://127.0.0.1:' + server.address().port + '/?' + query, (res) => {
        let body = ''; res.on('data', (c) => (body += c));
        res.on('end', () => { server.close(); resolve({ status: res.statusCode, json: JSON.parse(body) }); });
      }).on('error', reject);
    });
  });
}

const ids = (r) => { if (!Array.isArray(r.json.data)) throw new Error('API ' + r.status + ': ' + JSON.stringify(r.json).slice(0, 300)); return r.json.data.map((e) => e.emp_id).sort(); };
let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', String(e.stack).split('\n').slice(0, 3).join(' | ')); } }

(async () => {
  const Q = 'page=1&limit=100&status=all&eligible=all';

  await t('enforced Tech-ED (Ashok): row-ID lookups + legacy text resolved to his row', async () => {
    accessResult = { enforced: true, role: 'techEd', scope: { all: false }, user: { email: 'ashok@x.com', empId: 'EMP0051', name: 'Ashok Kumar' }, fields: {} };
    const r = await get(load(), Q);
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual(ids(r), ['E1', 'E2', 'E4'], 'got ' + ids(r).join(','));
  });

  await t('enforced Tech-ED (Prabhu): only his rows, incl. ROWID stored in the old column', async () => {
    accessResult = { enforced: true, role: 'techEd', scope: { all: false }, user: { email: 'prabhu@x.com', empId: 'EMP0057', name: 'Prabhu Parida' }, fields: {} };
    const r = await get(load(), Q);
    assert.deepStrictEqual(ids(r), ['E3', 'E5'], 'got ' + ids(r).join(','));
  });

  await t('dry run Tech-ED (Catalyst user by email) gets the same team', async () => {
    accessResult = { dryRun: true, enforced: false };
    currentUser = { user_id: '9', email_id: 'ashok@x.com', first_name: 'Ashok', last_name: 'Kumar', role_details: { role_name: 'Tech-Ed' } };
    const r = await get(load(), Q);
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual(ids(r), ['E1', 'E2', 'E4'], 'got ' + ids(r).join(','));
  });

  await t('a name that merely looks similar does not match by row ID', async () => {
    accessResult = { enforced: true, role: 'techEd', scope: { all: false }, user: { email: 'someone@x.com', empId: 'EMP0099', name: 'Ashok Kumar' }, fields: {} };
    const r = await get(load(), Q);
    assert.deepStrictEqual(ids(r).filter((x) => ['E1', 'E2', 'E3', 'E5'].includes(x)), []);
  });

  await t('HR sees everyone and Appraiser Tech-ED is "EMP - Name", never a ROWID', async () => {
    accessResult = { enforced: true, role: 'hr', scope: { all: true }, user: { email: 'hr@x.com' }, fields: {} };
    const r = await get(load(), Q);
    const sheetIds = ['E1', 'E2', 'E3', 'E4', 'E5'];
    assert.deepStrictEqual(ids(r).filter((x) => sheetIds.includes(x)), sheetIds);
    const byId = Object.fromEntries(r.json.data.map((e) => [e.emp_id, e.appraiser_tech_ed]));
    assert.strictEqual(byId.E1, 'EMP0051 - Ashok Kumar');
    assert.strictEqual(byId.E3, 'EMP0057 - Prabhu Parida');
    assert.strictEqual(byId.E5, 'EMP0057 - Prabhu Parida');
    r.json.data.forEach((e) => assert.ok(!/^[0-9]{6,}$/.test(String(e.appraiser_tech_ed)), 'ROWID shown for ' + e.emp_id));
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
