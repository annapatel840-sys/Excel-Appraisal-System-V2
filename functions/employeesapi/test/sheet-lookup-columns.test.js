/* employeesapi GET writes the payroll-derived lookups back to Appraisal_Sheet
   using the live column names (previous_year_CTC_with_rewards,
   target_PB_criteria). An unknown column used to make Catalyst reject the whole
   update, so none of the values were stored. Run: node test/sheet-lookup-columns.test.js */
'use strict';

const assert = require('assert');
const http = require('http');
const Module = require('module');
const path = require('path');

const T = {
  sheet: '74008000000039094', master: '74008000000035727', cycles: '74008000000034190',
  elig: '74008000000057046', payroll: '74008000000035326',
};
const SHEET_COLS = ['emp_id', 'name', 'designation', 'reporting_manager', 'comp_manager', 'department', 'manager', 'status',
  'wissen_experience', 'total_experience', 'last_appraisal_date', 'manager_rating', 'interview_count', 'rr_percent',
  'gross_margin', 'month_rb', 'month_pb', 'current_annual_base_pay', 'target_pb_allocated_for_may', 'allocated_pb_amount',
  'pb_installment', 'new_pb_to_be_offered', 'new_pb_installment', 'new_rb', 'hike_amount', 'hike_pct', 'target_pb_next_year',
  'eligible_for_promotion', 'new_title', 'at_risk', 'joining_date', 'manager_email_id', 'super_man_email_id', 'rating',
  'eligible_status', 'joining_bonus', 'emp_master_row_id', 'appraiser_tech_ed', 'cycle_id', 'target_PB_criteria',
  'comp_manager_remarks', 'previous_year_CTC_with_rewards'];

let DB;
let updates;
function table(id) {
  if (!DB[id]) DB[id] = [];
  const rows = DB[id];
  return {
    getAllColumns: async () => (id === T.sheet ? SHEET_COLS : []).map((c) => ({ column_name: c })),
    getPagedRows: async () => ({ data: rows.map((r) => ({ ...r })), more_records: false }),
    getAllRows: async () => rows.map((r) => ({ ...r })),
    updateRow: async (u) => {
      if (id === T.sheet) {
        Object.keys(u).forEach((k) => {
          if (k !== 'ROWID' && !SHEET_COLS.includes(k)) throw new Error('Invalid column name ' + k);
        });
        updates.push(u);
      }
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
  updates = [];
  DB = {
    [T.cycles]: [
      { ROWID: 'C26', cycle_name: 'Annual 2026', status: 'Closed', archived: true, start_date: '2025-04-01', end_date: '2026-03-31' },
      { ROWID: 'C27', cycle_name: 'Annual 2027', status: 'Active', archived: false, start_date: '2026-04-01', end_date: '2027-03-31' },
    ],
    [T.master]: [{ ROWID: 'M22', emp_id: 'EMP022', emp_name: 'Meena Das', emp_status: 'Active' }],
    [T.elig]: [{ ROWID: 'E1', appraisal_cycle_id: 'C27', employee_master_id: 'M22', emp_id: 'EMP022', eligibility_status: 'Eligible' }],
    [T.payroll]: [
      // Last closed Annual cycle: previous CTC and the target criteria come from here.
      { ROWID: 'P26', emp_id: 'M22', appraisal_cycle_name: 'C26', current_annual_base_pay: 360000,
        total_CTC_with_rewards: '4,23,000', target_pb_criteria: 'billability >84%',
        target_performance_bonus_for_next_year: 40000, pb_to_be_paid: 30000 },
    ],
    [T.sheet]: [
      { ROWID: 'S27', emp_id: 'EMP022', name: 'Meena Das', emp_master_row_id: 'M22', cycle_id: 'C27',
        current_annual_base_pay: '360000', eligible_status: 'Eligible' },
    ],
  };
}

let pass = 0, fail = 0;
async function t(name, fn) { try { seed(); await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', String(e.stack).split('\n').slice(0, 3).join(' | ')); } }

(async () => {
  const errors = [];
  const origError = console.error;
  console.error = (...args) => { errors.push(args.join(' ')); };

  await t('loading the sheet stores previous CTC and criteria in the live columns', async () => {
    const r = await get('page=1&limit=100');
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const persistErrors = errors.filter((e) => /Could not persist|Invalid column/.test(e));
    assert.deepStrictEqual(persistErrors, [], 'no rejected updates');
    const row = DB[T.sheet][0];
    assert.strictEqual(row.previous_year_CTC_with_rewards, 423000);
    assert.strictEqual(row.target_PB_criteria, 'billability >84%');
    assert.ok(!('Previous_Appraisal_total_CTC_with_rewards' in row));
    assert.ok(!('target_pb_criteria' in row));
  });

  await t('a second load does not rewrite unchanged values', async () => {
    await get('page=1&limit=100');
    const writesAfterFirst = updates.length;
    await get('page=1&limit=100');
    assert.strictEqual(updates.length, writesAfterFirst, 'no update on an unchanged row');
  });

  console.error = origError;
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
