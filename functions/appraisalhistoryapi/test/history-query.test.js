/* GET ?emp_id= reads only that employee's Payroll_Data rows, in every form
   they are stored (ROWID, bare ID, "ID - Name"); a query that errors is
   skipped; if every targeted query errors it falls back to the full read.
   Run: node test/history-query.test.js */
'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');
const PAYROLL = '74008000000035326'; // PAYROLL_DATA_TABLE_ID in index.js

function load(opts) {
  const dir = path.resolve(__dirname, '..');
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(dir) && !k.includes('node_modules')) delete require.cache[k]; });
  const payroll = [
    { ROWID: '1', emp_id: '9001', fy_year: '2025-26' },          // EM ROWID
    { ROWID: '2', emp_id: 'EMP001', fy_year: 'Annual 2024' },    // bare ID
    { ROWID: '3', emp_id: 'EMP001 - Asha', fy_year: 'Annual 2023' },
    { ROWID: '4', emp_id: 'EMP0012', fy_year: 'Annual 2023' },   // someone else
    { ROWID: '5', emp_id: '9002', fy_year: '2025-26' },          // someone else
  ];
  const queries = [];
  const zcql = {
    executeZCQLQuery: async (sql) => {
      queries.push(sql);
      if (/FROM Employee_Master WHERE \w+ = 'EMP001'/.test(sql)) return [{ Employee_Master: { ROWID: '9001' } }];
      if (/FROM Employee/.test(sql)) return [];
      if (/FROM Payroll_Data/.test(sql)) {
        if (opts.failAll || (opts.failText && !/= '\d+'/.test(sql))) throw new Error('bad query');
        let m = sql.match(/emp_id = '([^']*)'/);
        if (m) return payroll.filter((r) => r.emp_id.toUpperCase() === m[1]).map((r) => ({ Payroll_Data: r }));
        m = sql.match(/emp_id LIKE '([^']*) - \*'/);
        if (m) return payroll.filter((r) => r.emp_id.toUpperCase().startsWith(m[1] + ' - ')).map((r) => ({ Payroll_Data: r }));
      }
      return [];
    },
  };
  let fullReads = 0;
  const table = (id) => ({
    getPagedRows: async () => { if (id === PAYROLL) fullReads++; return { data: payroll, more_records: false }; },
    getAllColumns: async () => [],
  });
  const app = { zcql: () => zcql, datastore: () => ({ table }) };
  class HttpError extends Error { constructor(s, m) { super(m); this.status = s; } }
  const accessStub = {
    HttpError, START_CATALOG: [], check: async () => ({ enforced: false, dryRun: true, role: 'hr', scope: { all: true } }),
    isEnforced: () => false, guard: (a, fn) => fn(), requireScreen: () => {}, inScope: () => true,
  };
  const orig = Module._load;
  Module._load = function (req, ...rest) {
    if (req === 'zcatalyst-sdk-node') return { initialize: () => app };
    if (req === './accessCore') return accessStub;
    return orig.call(this, req, ...rest);
  };
  try { return { api: require('../index.js'), queries, fullReads: () => fullReads }; } finally { Module._load = orig; }
}

function get(api, empId) {
  return new Promise((resolve, reject) => {
    const req = { method: 'GET', url: '/?emp_id=' + empId, headers: { host: 'x' }, on() {} };
    const res = { writeHead(s) { this.status = s; }, setHeader() {}, end(t) { resolve({ status: this.status || this.statusCode, json: JSON.parse(t) }); } };
    Promise.resolve(api(req, res)).catch(reject);
  });
}

let pass = 0, fail = 0;
async function t(name, fn) { try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); } }
const ids = (r) => r.json.data.map((x) => x.ROWID).sort();

(async () => {
  console.log = () => {}; console.warn = () => {};
  const log = (...a) => process.stdout.write(a.join(' ') + '\n');
  const T = async (n, f) => { try { await f(); pass++; log('PASS', n); } catch (e) { fail++; log('FAIL', n, '\n   ', e.message); } };

  await T('finds the ROWID, bare-ID and "ID - Name" rows, nobody else\'s, without a full read', async () => {
    const s = load({});
    const r = await get(s.api, 'EMP001');
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual(ids(r), ['1', '2', '3']);
    assert.strictEqual(s.fullReads(), 0);
  });

  await T('a text-ID query that errors is skipped; ROWID rows still come back', async () => {
    const s = load({ failText: true });
    const r = await get(s.api, 'EMP001');
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual(ids(r), ['1']);
  });

  await T('every targeted query errors -> falls back to the full read', async () => {
    const s = load({ failAll: true });
    const r = await get(s.api, 'EMP001');
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual(ids(r), ['1', '2', '3']);
    assert.ok(s.fullReads() > 0);
  });

  log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
