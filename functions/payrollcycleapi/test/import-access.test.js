/* payrollcycleapi POST resource=import (the Upload screen's Payroll / Review
   and Feedback upload) needs Payroll Upload edit access, like validate /
   commit / undo. Run: node test/import-access.test.js */
'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

let writes;
function load(a) {
  const dir = path.resolve(__dirname, '..');
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(dir) && !k.includes('node_modules')) delete require.cache[k]; });
  const table = () => ({
    getAllColumns: async () => [],
    getPagedRows: async () => ({ data: [], more_records: false }),
    insertRow: async (row) => { writes.push(row); return { ...row, ROWID: '1' }; },
    insertRows: async (rows) => { writes.push(...rows); return rows; },
    updateRow: async (row) => { writes.push(row); return row; },
    updateRows: async (rows) => { writes.push(...rows); return rows; },
  });
  const catalystStub = {
    initialize: () => ({
      datastore: () => ({ table }),
      userManagement: () => ({ getCurrentUser: async () => ({ user_id: '7', first_name: 'Ashok', last_name: 'K', email_id: 'ashok@x.com', role_details: { role_name: 'Tech-Ed' } }) }),
    }),
  };
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const accessStub = {
    HttpError,
    check: async () => a,
    isEnforced: () => true,
    guard: (x, fn) => fn(),
    // Payroll Upload is an HR-only screen.
    requireScreen: (x, key) => { if (key === 'payroll' && x.role !== 'hr') throw new HttpError(403, 'No access to Payroll Upload.'); },
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
    const req = { method, url: '/?resource=' + encodeURIComponent(resource), body, on() {} };
    const res = { status: 0, writeHead(s) { this.status = s; }, end(text) { resolve({ status: this.status, json: JSON.parse(text) }); } };
    api(req, res).catch(reject);
  });
}

let pass = 0, fail = 0;
async function t(name, fn) { try { writes = []; await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); } }

(async () => {
  const techEd = { enforced: true, role: 'techEd', scope: { all: false, empIds: ['EMP013'] }, user: { email: 'ashok@x.com' } };
  const upload = { screen: 'sheet', cycleId: 'C1', records: [{ empId: 'EMP999', hikeAmt: 999999 }] };

  await t('a Tech-ED cannot import payroll rows', async () => {
    const r = await call(load(techEd), 'POST', 'import', upload);
    assert.strictEqual(r.status, 403, JSON.stringify(r.json));
    assert.deepStrictEqual(writes, []);
  });

  await t('a Tech-ED cannot import ratings', async () => {
    const r = await call(load(techEd), 'POST', 'import', { ...upload, screen: 'fb' });
    assert.strictEqual(r.status, 403, JSON.stringify(r.json));
    assert.deepStrictEqual(writes, []);
  });

  await t('HR passes the access check', async () => {
    const r = await call(load({ enforced: true, role: 'hr', scope: { all: true }, user: { email: 'hr@x.com' } }), 'POST', 'import', upload);
    assert.notStrictEqual(r.status, 403, JSON.stringify(r.json));
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
