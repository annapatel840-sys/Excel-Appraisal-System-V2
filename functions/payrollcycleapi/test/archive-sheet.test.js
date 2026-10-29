/* Archive moves a cycle's Appraisal Sheet into Payroll Data.
   In-memory Data Store with the live column lists. Run: node test/archive-sheet.test.js */
'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const T = {
  sheet: '74008000000039094', master: '74008000000035727', payroll: '74008000000035326',
  cycles: '74008000000034190', audit: '74008000000034940',
  delegation: '74008000000036124', previous: '74008000000096255',
};
const COLS = {
  [T.sheet]: ['emp_id', 'name', 'designation', 'reporting_manager', 'comp_manager', 'department', 'manager', 'status',
    'wissen_experience', 'total_experience', 'last_appraisal_date', 'manager_rating', 'interview_count', 'rr_percent',
    'gross_margin', 'month_rb', 'month_pb', 'current_annual_base_pay', 'target_pb_allocated_for_may', 'allocated_pb_amount',
    'pb_installment', 'new_pb_to_be_offered', 'new_pb_installment', 'new_rb', 'hike_amount', 'hike_pct', 'target_pb_next_year',
    'eligible_for_promotion', 'new_title', 'at_risk', 'joining_date', 'manager_email_id', 'super_man_email_id', 'rating',
    'eligible_status', 'joining_bonus', 'emp_master_row_id', 'appraiser_tech_ed', 'cycle_id', 'target_PB_criteria',
    'comp_manager_remarks', 'previous_year_CTC_with_rewards'],
  [T.payroll]: ['performance_bonus', 'retention_bonus', 'joining_bonus', 'total_bonus', 'hike_amount', 'hike_pct', 'fy_year',
    'rb_to_be_paid', 'month_rb', 'new_base_pay', 'current_annual_base_pay', 'tb_to_be_paid', 'pb_to_be_paid',
    'appraisal_cycle_name', 'total_CTC_with_rewards', 'target_performance_bonus_for_next_year', 'emp_name', 'emp_id',
    'month_pb', 'month_tb', 'total_rewards_hike_amount', 'total_reward_hike_pct', 'target_pb_criteria'],
  [T.audit]: ['emp_id', 'employee_name', 'field_name', 'old_value', 'new_value', 'changed_by', 'changed_at', 'source',
    'batch_id', 'appraisal_year', 'details'],
  [T.cycles]: ['cycle_name', 'start_date', 'end_date', 'status', 'remarks', 'changed_by', 'changed_at', 'archived', 'effective_date'],
  [T.master]: ['emp_id', 'emp_name', 'emp_status'],
  [T.delegation]: ['cycle_id', 'emp_id', 'comp_manager', 'appraiser_tech_ed', 'director', 'previous_comp_manager',
    'previous_appraiser_tech_ed', 'status', 'updated_by', 'updated_at'],
  [T.previous]: ['cycle_id', 'emp_id', 'comp_manager', 'appraiser_tech_ed', 'updated_by', 'updated_at'],
};

let DB;
let seq = 7000;
let failInsertPayroll = false;
function table(id) {
  if (!DB[id]) DB[id] = [];
  const rows = DB[id];
  const check = (row) => Object.keys(row).forEach((k) => {
    if (k !== 'ROWID' && COLS[id] && !COLS[id].includes(k)) throw new Error('Invalid column name ' + k);
    if (id === T.audit && k === 'details' && String(row[k]).length > 10000) throw new Error('details too long');
  });
  const add = (row) => { check(row); const r = { ...row, ROWID: String(++seq) }; rows.push(r); return { ...r }; };
  const upd = (row) => { check(row); const r = rows.find((x) => x.ROWID === String(row.ROWID)); Object.assign(r, row); return { ...r }; };
  const del = (x) => { const i = rows.findIndex((r) => r.ROWID === String(x)); if (i >= 0) rows.splice(i, 1); };
  return {
    getAllColumns: async () => (COLS[id] || []).map((c) => ({ column_name: c })),
    getPagedRows: async () => ({ data: rows.map((r) => ({ ...r })), more_records: false }),
    insertRow: async (r) => add(r),
    insertRows: async (b) => {
      if (id === T.payroll && failInsertPayroll) throw new Error('Catalyst is down');
      return b.map(add);
    },
    updateRow: async (r) => upd(r),
    updateRows: async (b) => b.map(upd),
    deleteRow: async (x) => { del(x); return true; },
    deleteRows: async (ids) => { assert.ok(ids.length <= 100); ids.forEach(del); return true; },
  };
}

function load() {
  const dir = path.resolve(__dirname, '..');
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(dir) && !k.includes('node_modules')) delete require.cache[k]; });
  const catalystStub = { initialize: () => ({
    datastore: () => ({ table }),
    userManagement: () => ({ getCurrentUser: async () => ({ user_id: '1', first_name: 'HR', last_name: 'A', email_id: 'hr@x.com', role_details: { role_name: 'HR' } }) }),
  }) };
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const accessStub = { HttpError, check: async () => ({ dryRun: true, enforced: false }), isEnforced: () => false, guard: (a, fn) => fn(), requireScreen: () => {}, bumpVersion: async () => {} };
  const orig = Module._load;
  Module._load = function (req, ...rest) {
    if (req === 'zcatalyst-sdk-node') return catalystStub;
    if (req === './accessCore') return accessStub;
    return orig.call(this, req, ...rest);
  };
  try { return require('../index.js'); } finally { Module._load = orig; }
}

function call(method, resource, body) {
  const api = load();
  return new Promise((resolve, reject) => {
    const req = { method, url: '/?resource=' + encodeURIComponent(resource), body: body || (method === 'POST' ? {} : undefined), on() {} };
    const res = { status: 0, writeHead(s) { this.status = s; }, end(text) { resolve({ status: this.status, json: JSON.parse(text) }); } };
    api(req, res).catch(reject);
  });
}

function seed() {
  DB = {};
  failInsertPayroll = false;
  DB[T.cycles] = [
    { ROWID: 'C26', cycle_name: 'Annual 2026', status: 'Closed', archived: false, start_date: '2025-04-01', end_date: '2026-03-31' },
    { ROWID: 'C27', cycle_name: 'Annual 2027', status: 'Active', archived: false, start_date: '2026-04-01', end_date: '2027-03-31' },
  ];
  DB[T.master] = [
    { ROWID: 'M22', emp_id: 'EMP022', emp_name: 'Meena Das', emp_status: 'Active' },
    { ROWID: 'M26', emp_id: 'EMP026', emp_name: 'Nisha Kapoor', emp_status: 'Active' },
  ];
  DB[T.sheet] = [
    { ROWID: 'S1', emp_id: 'EMP022', name: 'Meena Das', emp_master_row_id: 'M22', cycle_id: 'C26',
      current_annual_base_pay: '360000', hike_amount: '25000', hike_pct: 0.0694, allocated_pb_amount: '30000',
      pb_installment: '2', new_rb: '8000', target_pb_next_year: '40000', target_PB_criteria: 'billability >84%',
      manager_rating: '4', comp_manager_remarks: 'Strong year' },
    { ROWID: 'S2', emp_id: 'EMP026', name: 'Nisha Kapoor', emp_master_row_id: 'M26', cycle_id: 'C26',
      current_annual_base_pay: '370000', hike_amount: '30000', hike_pct: 0.081 },
    // The Active cycle's rows must not be touched.
    { ROWID: 'S3', emp_id: 'EMP022', name: 'Meena Das', emp_master_row_id: 'M22', cycle_id: 'C27', hike_amount: '1' },
  ];
  // EMP022 already has the cycle's input payroll row; EMP026 has none.
  DB[T.payroll] = [
    { ROWID: 'P1', emp_id: 'M22', appraisal_cycle_name: 'C26', current_annual_base_pay: 350000, fy_year: '2025-26', month_pb: 'Apr-25' },
  ];
  DB[T.audit] = [];
  DB[T.delegation] = [
    { ROWID: 'D1', cycle_id: 'C26', emp_id: 'M22', comp_manager: 'EMP060', appraiser_tech_ed: 'EMP051', MODIFIEDTIME: '2026-03-01 10:00:00' },
    { ROWID: 'D2', cycle_id: 'C26', emp_id: 'M26', comp_manager: 'EMP060', appraiser_tech_ed: 'EMP052', MODIFIEDTIME: '2026-03-01 10:00:00' },
    // Older duplicate for M26: the newer row above wins.
    { ROWID: 'D0', cycle_id: 'C26', emp_id: 'M26', comp_manager: 'OLD', appraiser_tech_ed: 'OLD', MODIFIEDTIME: '2026-01-01 10:00:00' },
    // The Active cycle's Delegation must not be copied.
    { ROWID: 'D3', cycle_id: 'C27', emp_id: 'M22', comp_manager: 'EMP061', appraiser_tech_ed: 'EMP051' },
  ];
  DB[T.previous] = [];
}

const pRow = (master, cycle) => DB[T.payroll].filter((r) => r.emp_id === master && r.appraisal_cycle_name === cycle);
let pass = 0, fail = 0;
async function t(name, fn) {
  try { seed(); await fn(); pass++; console.log('PASS', name); }
  catch (e) { fail++; console.log('FAIL', name, '\n   ', String(e.stack).split('\n').slice(0, 3).join(' | ')); }
}

(async () => {
  await t('archive moves final values into Payroll Data and clears the cycle from the sheet', async () => {
    const r = await call('POST', 'cycles/archive/C26', { archived: true });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual(r.json.data.sheetMoved, { moved: 2, inserted: 1, updated: 1, removed: 2 });

    const p22 = pRow('M22', 'C26');
    assert.strictEqual(p22.length, 1, 'existing payroll row updated, not duplicated');
    assert.strictEqual(p22[0].ROWID, 'P1');
    assert.strictEqual(p22[0].current_annual_base_pay, 360000);
    assert.strictEqual(p22[0].hike_amount, 25000);
    assert.strictEqual(p22[0].hike_pct, 0.0694);
    assert.strictEqual(p22[0].new_base_pay, 385000);
    assert.strictEqual(p22[0].pb_to_be_paid, 30000);
    assert.strictEqual(p22[0].performance_bonus, 30000);
    assert.strictEqual(p22[0].rb_to_be_paid, 8000);
    assert.strictEqual(p22[0].retention_bonus, 8000);
    assert.strictEqual(p22[0].total_bonus, 38000);
    assert.strictEqual(p22[0].total_CTC_with_rewards, 423000);
    assert.strictEqual(p22[0].target_performance_bonus_for_next_year, 40000);
    assert.strictEqual(p22[0].target_pb_criteria, 'billability >84%');
    assert.strictEqual(p22[0].fy_year, '2025-26', 'payroll fields the sheet does not hold are kept');
    assert.strictEqual(p22[0].month_pb, 'Apr-25');

    const p26 = pRow('M26', 'C26');
    assert.strictEqual(p26.length, 1);
    assert.strictEqual(p26[0].new_base_pay, 400000);
    assert.strictEqual(p26[0].emp_name, 'Nisha Kapoor');
    assert.strictEqual(p26[0].pb_to_be_paid, undefined, 'blank sheet values are not written');

    assert.deepStrictEqual(DB[T.sheet].map((r) => r.ROWID), ['S3'], 'only the Active cycle rows remain');
    const snapshots = DB[T.audit].filter((a) => a.source === 'sheet_archive');
    assert.strictEqual(snapshots.length, 2);
    assert.strictEqual(JSON.parse(snapshots[0].details).row.comp_manager_remarks, 'Strong year', 'full sheet row kept in the audit copy');
    const cycle = DB[T.cycles].find((c) => c.ROWID === 'C26');
    assert.strictEqual(cycle.archived, true);
    assert.match(cycle.remarks, /Appraisal Sheet moved to Payroll Data \(2 row\(s\)\)/);
  });

  await t('the per-row copies are not listed in the payroll audit', async () => {
    await call('POST', 'cycles/archive/C26', { archived: true });
    const r = await call('GET', 'audit');
    assert.strictEqual(r.status, 200);
    assert.ok(!r.json.data.some((e) => e.source === 'sheet_archive'));
    assert.ok(r.json.data.some((e) => /moved to Payroll Data/.test(e.details)));
  });

  await t('an archived cycle whose sheet was moved cannot be unarchived', async () => {
    await call('POST', 'cycles/archive/C26', { archived: true });
    const r = await call('POST', 'cycles/archive/C26', { archived: false });
    assert.strictEqual(r.status, 409, JSON.stringify(r.json));
  });

  await t('if writing payroll fails, the sheet is kept and the cycle is not archived', async () => {
    failInsertPayroll = true;
    const r = await call('POST', 'cycles/archive/C26', { archived: true });
    assert.notStrictEqual(r.status, 200);
    assert.strictEqual(DB[T.sheet].length, 3, 'no sheet row removed');
    assert.strictEqual(DB[T.cycles].find((c) => c.ROWID === 'C26').archived, false);
    failInsertPayroll = false;
    const retry = await call('POST', 'cycles/archive/C26', { archived: true });
    assert.strictEqual(retry.status, 200, JSON.stringify(retry.json));
    assert.strictEqual(pRow('M22', 'C26').length, 1, 'retry does not duplicate payroll rows');
  });

  await t('a sheet row with no Employee Master record stops the archive; nothing changes', async () => {
    DB[T.sheet].push({ ROWID: 'S9', emp_id: 'EMP999', name: 'Ghost', cycle_id: 'C26' });
    const r = await call('POST', 'cycles/archive/C26', { archived: true });
    assert.strictEqual(r.status, 409, JSON.stringify(r.json));
    assert.match(r.json.message, /EMP999/);
    assert.strictEqual(DB[T.sheet].length, 4);
    assert.strictEqual(DB[T.payroll].length, 1);
    assert.strictEqual(DB[T.audit].length, 0);
    assert.strictEqual(DB[T.previous].length, 0, 'Delegation is not copied when the archive stops');
  });

  await t('archiving a cycle with no sheet rows just archives it', async () => {
    DB[T.sheet] = DB[T.sheet].filter((r) => r.cycle_id !== 'C26');
    const r = await call('POST', 'cycles/archive/C26', { archived: true });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.data.sheetMoved.moved, 0);
    assert.strictEqual(DB[T.cycles].find((c) => c.ROWID === 'C26').archived, true);
  });

  await t('archive copies the cycle\'s Delegation into Previous_Delegation and keeps Delegation', async () => {
    const r = await call('POST', 'cycles/archive/C26', { archived: true });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual(r.json.data.delegationCopied, { copied: 2, inserted: 2, updated: 0 });
    const by = Object.fromEntries(DB[T.previous].map((x) => [x.emp_id, x]));
    assert.deepStrictEqual(Object.keys(by).sort(), ['M22', 'M26']);
    assert.strictEqual(by.M22.cycle_id, 'C26');
    assert.strictEqual(by.M22.comp_manager, 'EMP060');
    assert.strictEqual(by.M26.appraiser_tech_ed, 'EMP052', 'newest duplicate wins');
    assert.strictEqual(by.M22.updated_by, 'HR A');
    assert.match(by.M22.updated_at, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    assert.strictEqual(DB[T.delegation].length, 4, 'Delegation rows are kept');
  });

  await t('an imported Previous_Delegation row is replaced, not duplicated', async () => {
    DB[T.previous].push({ ROWID: 'H1', cycle_id: 'C26', emp_id: 'M22', comp_manager: 'IMPORTED', appraiser_tech_ed: 'IMPORTED' });
    const r = await call('POST', 'cycles/archive/C26', { archived: true });
    assert.deepStrictEqual(r.json.data.delegationCopied, { copied: 2, inserted: 1, updated: 1 });
    assert.strictEqual(DB[T.previous].length, 2);
    assert.strictEqual(DB[T.previous].find((x) => x.ROWID === 'H1').comp_manager, 'EMP060');
  });

  await t('a failed archive can be retried without duplicating Previous_Delegation', async () => {
    failInsertPayroll = true;
    await call('POST', 'cycles/archive/C26', { archived: true });
    failInsertPayroll = false;
    const retry = await call('POST', 'cycles/archive/C26', { archived: true });
    assert.strictEqual(retry.status, 200, JSON.stringify(retry.json));
    assert.strictEqual(DB[T.previous].length, 2);
  });

  await t('a cycle with no sheet rows still copies its Delegation', async () => {
    DB[T.sheet] = DB[T.sheet].filter((r) => r.cycle_id !== 'C26');
    const r = await call('POST', 'cycles/archive/C26', { archived: true });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.data.delegationCopied.copied, 2);
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
