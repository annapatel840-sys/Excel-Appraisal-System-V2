/* The Appraisal Sheet roster (employeesapi GET) must stay within Catalyst's
   ~30 s request limit for a 2,000-employee cycle: each table is read once,
   per-employee lookups don't rescan whole tables, only page 1 writes the
   payroll-derived lookups back, and those writes go in batches of 100.
   Run: node test/roster-load-scale.test.js */
'use strict';

const assert = require('assert');
const http = require('http');
const Module = require('module');
const path = require('path');

const T = {
  sheet: '74008000000039094', master: '74008000000035727', cycles: '74008000000034190',
  elig: '74008000000057046', payroll: '74008000000035326', feedback: '74008000000022041',
};
const SHEET_COLS = ['emp_id', 'name', 'status', 'last_appraisal_date', 'current_annual_base_pay', 'target_pb_allocated_for_may',
  'emp_master_row_id', 'appraiser_tech_ed', 'cycle_id', 'target_PB_criteria', 'previous_year_CTC_with_rewards', 'eligible_status'];
const EMPLOYEES = 2000;

let DB;
let calls;
let failBatch;
function table(id) {
  if (!DB[id]) DB[id] = [];
  const rows = DB[id];
  const upd = (u) => { const r = rows.find((x) => x.ROWID === String(u.ROWID)); Object.assign(r, u); return { ...r }; };
  return {
    getAllColumns: async () => (id === T.sheet ? SHEET_COLS : []).map((c) => ({ column_name: c })),
    getPagedRows: async (o = {}) => {
      calls.pages[id] = (calls.pages[id] || 0) + 1;
      const start = Number(o.nextToken || 0);
      const size = o.maxRows || 200;
      const more = start + size < rows.length;
      return { data: rows.slice(start, start + size).map((r) => ({ ...r })), more_records: more, next_token: more ? String(start + size) : null };
    },
    getAllRows: async () => rows.slice(0, 200).map((r) => ({ ...r })),
    updateRow: async (u) => { if (id === T.sheet) calls.rowWrites.push(u.ROWID); return upd(u); },
    updateRows: async (list) => {
      if (id === T.sheet) {
        calls.batches.push(list.length);
        if (failBatch) { failBatch = false; throw new Error('batch rejected'); }
      }
      return list.map(upd);
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
  calls = { pages: {}, rowWrites: [], batches: [] };
  failBatch = false;
  DB = {
    [T.cycles]: [
      { ROWID: 'C26', cycle_name: 'Annual 2026', status: 'Closed', start_date: '2025-04-01', effective_date: '2025-04-01' },
      { ROWID: 'C27', cycle_name: 'Annual 2027', status: 'Active', start_date: '2026-04-01' },
    ],
    [T.master]: [], [T.sheet]: [], [T.elig]: [], [T.payroll]: [], [T.feedback]: [],
  };
  for (let i = 1; i <= EMPLOYEES; i++) {
    const id = 'EMP' + String(i).padStart(5, '0');
    DB[T.master].push({ ROWID: 'M' + i, emp_id: id, emp_name: 'Employee ' + i, emp_status: 'Active', date_of_join: '2020-01-15' });
    // Employee Master import also leaves a cycle-less sheet row per employee.
    DB[T.sheet].push({ ROWID: 'O' + i, emp_id: id, name: 'Employee ' + i, emp_master_row_id: 'M' + i, cycle_id: null });
    DB[T.sheet].push({ ROWID: 'S' + i, emp_id: id, name: 'Employee ' + i, emp_master_row_id: 'M' + i, cycle_id: 'C27', status: 'Active' });
    DB[T.sheet].push({ ROWID: 'H' + i, emp_id: id, name: 'Employee ' + i, emp_master_row_id: 'M' + i, cycle_id: 'C26', comp_manager: 'EMP00001' });
    DB[T.elig].push({ ROWID: 'E' + i, appraisal_cycle_id: 'C27', employee_master_id: 'M' + i, emp_id: id, eligibility_status: 'Eligible' });
    DB[T.payroll].push({ ROWID: 'P' + i, emp_id: 'M' + i, appraisal_cycle_name: 'C26', new_base_pay: 500000 + i,
      total_CTC_with_rewards: 560000 + i, target_pb_criteria: 'criteria', target_performance_bonus_for_next_year: 50000 });
    DB[T.payroll].push({ ROWID: 'Q' + i, emp_id: 'M' + i, appraisal_cycle_name: 'C27', new_base_pay: 550000 + i });
    DB[T.feedback].push({ ROWID: 'F' + i, emp_ID: 'M' + i, appraisal_cycle_name: 'C27', manager_rating: 4 });
  }
}

let pass = 0, fail = 0;
async function t(name, fn) { try { seed(); await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', String(e.stack).split('\n').slice(0, 3).join(' | ')); } }

(async () => {
  const origError = console.error;
  const origWarn = console.warn;
  console.error = () => {};
  console.warn = () => {};

  await t('a 2,000-employee sheet loads with every table read once', async () => {
    const started = Date.now();
    const r = await get('page=1&limit=1000&view=appraisal&status=all&eligible=all');
    const elapsed = Date.now() - started;
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    assert.strictEqual(r.json.pagination.totalCount, EMPLOYEES);
    assert.strictEqual(r.json.data.length, 1000);
    Object.entries(DB).forEach(([id, rows]) => {
      const expected = Math.max(1, Math.ceil(rows.length / 200));
      assert.strictEqual(calls.pages[id] || 0, expected, 'table ' + id + ' read ' + calls.pages[id] + ' pages, expected ' + expected);
    });
    // Whole-table scans per employee made this take minutes; it is now well
    // under a second of processing. The bound only catches that regression.
    assert.ok(elapsed < 15000, 'roster took ' + elapsed + ' ms');
  });

  await t('page 1 writes the lookups in batches of 100; page 2 writes nothing', async () => {
    await get('page=2&limit=1000&view=appraisal&status=all&eligible=all');
    assert.deepStrictEqual(calls.batches, [], 'page 2 must not write');
    await get('page=1&limit=1000&view=appraisal&status=all&eligible=all');
    assert.strictEqual(calls.batches.length, EMPLOYEES / 100);
    assert.ok(calls.batches.every((size) => size === 100));
    assert.deepStrictEqual(calls.rowWrites, []);
    const row = DB[T.sheet].find((x) => x.ROWID === 'S10');
    assert.strictEqual(row.previous_year_CTC_with_rewards, 560010);
    assert.strictEqual(row.current_annual_base_pay, 500010);
    assert.strictEqual(row.target_PB_criteria, 'criteria');
  });

  await t('a rejected batch is retried row by row', async () => {
    failBatch = true;
    await get('page=1&limit=1000&view=appraisal&status=all&eligible=all');
    assert.strictEqual(calls.rowWrites.length, 100, 'the rejected batch is written one row at a time');
    assert.ok(DB[T.sheet].filter((x) => x.cycle_id === 'C27').every((x) => x.target_PB_criteria === 'criteria'));
  });

  console.error = origError;
  console.warn = origWarn;
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
