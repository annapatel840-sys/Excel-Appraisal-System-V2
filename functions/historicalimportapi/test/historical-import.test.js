/* historicalimportapi: HR-only import of previous-year payroll and review /
   feedback into Payroll_Data and Feedback_And_Rating for past cycles.
   In-memory Data Store with the live column lists. Run: node test/historical-import.test.js */
'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const T = {
  master: '74008000000035727', payroll: '74008000000035326', feedback: '74008000000022041',
  cycles: '74008000000034190', audit: '74008000000034940',
};
const COLS = {
  [T.master]: ['emp_id', 'emp_name', 'designation', 'department', 'repo_manager', 'director', 'appraiser_tech_ed', 'email_id',
    'date_of_join', 'emp_status', 'emp_type', 'wissen_experience', 'total_experience', 'cost_center', 'current_salary',
    'location', 'last_appraisal_month_year', 'comp_manager'],
  [T.payroll]: ['performance_bonus', 'retention_bonus', 'joining_bonus', 'total_bonus', 'hike_amount', 'hike_pct', 'fy_year',
    'rb_to_be_paid', 'month_rb', 'new_base_pay', 'current_annual_base_pay', 'tb_to_be_paid', 'pb_to_be_paid',
    'appraisal_cycle_name', 'total_CTC_with_rewards', 'target_performance_bonus_for_next_year', 'emp_name', 'emp_id',
    'month_pb', 'month_tb', 'total_rewards_hike_amount', 'total_reward_hike_pct', 'target_pb_criteria'],
  [T.feedback]: ['emp_ID', 'emp_name', 'revenue_released', 'gross_margin', 'manager_feedback', 'manager_rating',
    'client_feedback', 'client_rating', 'interview_count', 'at_risk', 'new_title', 'remarks', 'appraisal_cycle_name',
    'Department', 'Band', 'Effective_Date', 'CostCenter_Client', 'Client_Manager', 'Comp_Manager', 'Tech_ED',
    'Upload_Batch', 'fy_year', 'eligible_for_promotion', 'last_appraisal_date', 'client_manager_feedback', 'designation'],
  [T.audit]: ['emp_id', 'employee_name', 'field_name', 'old_value', 'new_value', 'changed_by', 'changed_at', 'source',
    'batch_id', 'appraisal_year', 'details'],
  [T.cycles]: ['cycle_name', 'start_date', 'end_date', 'status', 'remarks', 'changed_by', 'changed_at', 'archived', 'effective_date'],
};
const LIMITS = { emp_id: 10, emp_name: 30, field_name: 20, source: 30, batch_id: 30, appraisal_year: 30, employee_name: 30, Department: 30 };

let seq = 9000;
let DB;
let clock = 0;
function table(id) {
  if (!DB[id]) DB[id] = [];
  const rows = DB[id];
  const check = (row) => Object.keys(row).forEach((k) => {
    if (k === 'ROWID') return;
    if (!COLS[id].includes(k)) throw new Error('Invalid column ' + k + ' in ' + id);
    const max = id === T.payroll && k === 'emp_name' ? 100 : LIMITS[k];
    if (max && row[k] != null && String(row[k]).length > max) throw new Error('Value too long for ' + k);
    if (id === T.audit && k === 'details' && String(row[k]).length > 10000) throw new Error('details too long');
  });
  const add = (row) => { check(row); const r = { ...row, ROWID: String(++seq), MODIFIEDTIME: String(++clock).padStart(8, '0') }; rows.push(r); return { ...r }; };
  const upd = (row) => {
    check(row);
    const r = rows.find((x) => x.ROWID === String(row.ROWID));
    if (!r) throw new Error('No row ' + row.ROWID);
    Object.assign(r, row, { MODIFIEDTIME: String(++clock).padStart(8, '0') });
    return { ...r };
  };
  return {
    getPagedRows: async () => ({ data: rows.map((r) => ({ ...r })), more_records: false }),
    insertRows: async (b) => { if (b.length > 200) throw new Error('batch too big'); return b.map(add); },
    updateRows: async (b) => { if (b.length > 200) throw new Error('batch too big'); return b.map(upd); },
    deleteRows: async (ids) => { ids.forEach((x) => { const i = rows.findIndex((r) => r.ROWID === String(x)); if (i >= 0) rows.splice(i, 1); }); return true; },
  };
}

let user;
let accessResult;
function load() {
  const dir = path.resolve(__dirname, '..');
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(dir) && !k.includes('node_modules')) delete require.cache[k]; });
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const accessStub = { HttpError, isEnforced: () => !!accessResult, check: async () => accessResult };
  const catalystStub = {
    initialize: () => ({ datastore: () => ({ table }), userManagement: () => ({ getCurrentUser: async () => user }) }),
  };
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
    const req = { method, url: '/?resource=' + resource, body, on() {} };
    const res = { status: 0, writeHead(s) { this.status = s; }, end(text) { resolve({ status: this.status, json: JSON.parse(text) }); } };
    api(req, res).catch(reject);
  });
}

const HR_USER = { user_id: '1', first_name: 'Prabhu', last_name: 'P', email_id: 'hr@x.com', role_details: { role_name: 'HR' } };
let ids;
async function seed() {
  DB = {}; seq = 9000; clock = 0; user = HR_USER; accessResult = null;
  DB[T.cycles] = [
    { ROWID: 'C22', cycle_name: 'Annual 2022', status: 'Closed', archived: true, effective_date: '2022-04-01', start_date: '2021-04-01', end_date: '2022-04-01', remarks: 'Past cycle (history import only)' },
    { ROWID: 'C24', cycle_name: 'Annual 2024', status: 'Closed', archived: false, effective_date: '2024-04-01', start_date: '2023-04-01', end_date: '2024-04-01' },
    { ROWID: 'C25', cycle_name: 'Annual 2025', status: 'Active', archived: false, effective_date: '2025-04-01' },
    { ROWID: 'C26', cycle_name: 'New Joiner 2025', status: 'Upcoming', archived: false },
    { ROWID: 'CX', cycle_name: 'Annual 2021', status: 'Cancelled', archived: false },
  ];
  const m = table(T.master);
  const rows = await m.insertRows([
    { emp_id: 'EMP001', emp_name: 'Prabhuprasad Parida', emp_status: 'Active' },
    { emp_id: 'EMP002', emp_name: 'Ashok Kumar', emp_status: 'Active' },
  ]);
  ids = Object.fromEntries(rows.map((r) => [r.emp_id, r.ROWID]));
  // An existing Annual 2022 payroll row for EMP001 (will be replaced).
  await table(T.payroll).insertRows([{ emp_id: ids.EMP001, appraisal_cycle_name: 'C22', current_annual_base_pay: 100, hike_pct: 5, month_pb: 'Apr-22' }]);
  // A current-cycle row that must never be touched.
  await table(T.payroll).insertRows([{ emp_id: ids.EMP001, appraisal_cycle_name: 'C25', current_annual_base_pay: 999 }]);
}

const payrollFile = () => [
  { row: 2, empId: 'EMP001', empName: 'Prabhuprasad Parida', appraisalCycleName: 'Annual 2022', basePay: '₹ 1,20,000', hikePct: '7.5%', hikeAmt: '9000.4', pbMonth: '' },
  { row: 3, empId: 'EMP002', basePay: 80000, hikePct: 6, totalRewardHikePct: '8.25' },
  { row: 4, empId: 'EMP090', empName: 'Ravi Menon (left)', basePay: 50000 },
];
const pRow = (emp, cycle) => DB[T.payroll].find((r) => r.emp_id === ids[emp] && r.appraisal_cycle_name === cycle);

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await seed(); await fn(); pass++; console.log('PASS', name); }
  catch (e) { fail++; console.log('FAIL', name, '\n   ', String(e.stack).split('\n').slice(0, 3).join(' | ')); }
}

(async () => {
  await t('only HR can use it (Tech-ED and Org refused, enforced and not)', async () => {
    user = { user_id: '2', email_id: 'te@x.com', role_details: { role_name: 'Tech-Ed' } };
    let r = await call('GET', 'cycles');
    assert.strictEqual(r.status, 403, JSON.stringify(r.json));
    accessResult = { role: 'org', scope: { all: true } };
    r = await call('GET', 'cycles');
    assert.strictEqual(r.status, 403, 'Org role that sees everyone is still refused');
    accessResult = { role: 'hr', scope: { all: true } };
    r = await call('GET', 'cycles');
    assert.strictEqual(r.status, 200);
    user = null;
    r = await call('GET', 'cycles');
    assert.strictEqual(r.status, 401);
  });

  await t('cycles: only Closed / archived, newest first; Active, Upcoming, Cancelled excluded', async () => {
    const r = await call('GET', 'cycles');
    assert.deepStrictEqual(r.json.data.map((c) => c.name), ['Annual 2024', 'Annual 2022']);
    assert.strictEqual(r.json.data[1].past, true);
  });

  await t('validate: new / update / new employee / errors; Active cycle refused', async () => {
    let r = await call('POST', 'validate', { type: 'payroll', cycleId: 'C25', records: payrollFile() });
    assert.strictEqual(r.status, 409);
    const file = payrollFile().concat([
      { row: 5, empId: 'EMP002', basePay: 1 },
      { row: 6, empId: 'EMP003', hikePct: '12 percent' },
      { row: 7, empId: 'EMP004', appraisalCycleName: 'Annual 2024' },
      { row: 8, empId: '' },
    ]);
    r = await call('POST', 'validate', { type: 'payroll', cycleId: 'C22', records: file });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const byRow = Object.fromEntries(r.json.data.rows.map((x) => [x.row, x]));
    assert.strictEqual(byRow[2].status, 'update');
    assert.strictEqual(byRow[3].status, 'new');
    assert.strictEqual(byRow[4].status, 'new');
    assert.ok(byRow[4].warnings.some((w) => /Inactive/.test(w)));
    assert.ok(byRow[2].warnings.some((w) => /rounded/.test(w)), 'hike amount 9000.4 rounded');
    assert.ok(/more than once/.test(byRow[5].errors[0]));
    assert.ok(/not a number/.test(byRow[6].errors[0]));
    assert.ok(/does not match/.test(byRow[7].errors[0]));
    assert.ok(/required/.test(byRow[8].errors[0]));
    assert.deepStrictEqual(r.json.data.summary, { total: 7, new: 2, update: 1, error: 4, warning: 2, newEmployees: 1 });
    assert.strictEqual(DB[T.payroll].length, 2, 'validate writes nothing');
  });

  await t('commit payroll: replaces the cycle row, adds new rows, adds the ex-employee as Inactive', async () => {
    const r = await call('POST', 'commit', { type: 'payroll', cycleId: 'C22', batchId: 'HI-test-001', fileName: 'Annual_2022_payroll.xlsx', records: payrollFile(), chunkIndex: 0, chunkCount: 1 });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual([r.json.data.inserted, r.json.data.updated, r.json.data.createdEmployees, r.json.data.skipped], [2, 1, 1, 0]);
    const e1 = pRow('EMP001', 'C22');
    assert.strictEqual(e1.current_annual_base_pay, 120000);
    assert.strictEqual(e1.hike_pct, 7.5);
    assert.strictEqual(e1.hike_amount, 9000);
    assert.strictEqual(e1.month_pb, null, 'blank cell in the file clears the value');
    assert.strictEqual(DB[T.payroll].filter((x) => x.emp_id === ids.EMP001 && x.appraisal_cycle_name === 'C22').length, 1, 'replaced, not duplicated');
    assert.strictEqual(pRow('EMP002', 'C22').total_reward_hike_pct, '8.25');
    const ex = DB[T.master].find((x) => x.emp_id === 'EMP090');
    assert.strictEqual(ex.emp_status, 'Inactive');
    assert.strictEqual(DB[T.payroll].find((x) => x.emp_id === ex.ROWID).appraisal_cycle_name, 'C22');
    assert.strictEqual(pRow('EMP001', 'C25').current_annual_base_pay, 999, 'current cycle untouched');
  });

  await t('commit feedback: lookups, cycle effective date, batch and date parsing', async () => {
    const r = await call('POST', 'commit', { type: 'feedback', cycleId: 'C24', batchId: 'HI-test-fb1', fileName: 'fb.xlsx', records: [
      { row: 2, empId: 'EMP001', managerRating: '4', rrPercent: '85%', lastAppraisal: '01/04/2023', interviewCount: '3', department: 'Engineering', techEd: 'EMP002 - Ashok Kumar' },
      { row: 3, empId: 'EMP002', lastAppraisal: 45017 },
    ] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const f1 = DB[T.feedback].find((x) => x.emp_ID === ids.EMP001);
    assert.strictEqual(f1.emp_name, ids.EMP001);
    assert.strictEqual(f1.appraisal_cycle_name, 'C24');
    assert.strictEqual(f1.revenue_released, 85);
    assert.strictEqual(f1.manager_rating, 4);
    assert.strictEqual(f1.interview_count, 3);
    assert.strictEqual(f1.last_appraisal_date, '2023-04-01');
    assert.strictEqual(f1.Effective_Date, '2024-04-01');
    assert.strictEqual(f1.Upload_Batch, 'HI-test-fb1');
    assert.strictEqual(f1.Tech_ED, 'EMP002 - Ashok Kumar');
    assert.strictEqual(DB[T.feedback].find((x) => x.emp_ID === ids.EMP002).last_appraisal_date, '2023-04-01');
  });

  await t('history groups chunks; undo restores replaced rows and removes added ones', async () => {
    const file = payrollFile();
    await call('POST', 'commit', { type: 'payroll', cycleId: 'C22', batchId: 'HI-test-002', fileName: 'p.xlsx', records: file.slice(0, 2), chunkIndex: 0, chunkCount: 2 });
    await call('POST', 'commit', { type: 'payroll', cycleId: 'C22', batchId: 'HI-test-002', fileName: 'p.xlsx', records: file.slice(2), chunkIndex: 1, chunkCount: 2 });
    let h = await call('GET', 'history');
    assert.strictEqual(h.json.data.length, 1);
    assert.deepStrictEqual([h.json.data[0].inserted, h.json.data[0].updated, h.json.data[0].chunks, h.json.data[0].cycleName], [2, 1, 2, 'Annual 2022']);
    const r = await call('POST', 'undo', { batchId: 'HI-test-002' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual([r.json.data.deleted, r.json.data.restored], [2, 1]);
    const e1 = pRow('EMP001', 'C22');
    assert.strictEqual(e1.current_annual_base_pay, 100);
    assert.strictEqual(e1.hike_pct, 5);
    assert.strictEqual(e1.month_pb, 'Apr-22');
    assert.ok(!pRow('EMP002', 'C22'));
    assert.strictEqual(DB[T.payroll].length, 2);
    assert.ok(DB[T.master].find((x) => x.emp_id === 'EMP090'), 'Inactive employee kept');
    assert.strictEqual((await call('POST', 'undo', { batchId: 'HI-test-002' })).status, 409);
    h = await call('GET', 'history');
    assert.strictEqual(h.json.data[0].undone, true);
  });

  await t('undo of an older import is blocked while a later one for the same cycle exists', async () => {
    await call('POST', 'commit', { type: 'payroll', cycleId: 'C22', batchId: 'HI-test-a', fileName: 'a.xlsx', records: payrollFile() });
    await call('POST', 'commit', { type: 'payroll', cycleId: 'C22', batchId: 'HI-test-b', fileName: 'b.xlsx', records: payrollFile() });
    assert.strictEqual((await call('POST', 'undo', { batchId: 'HI-test-a' })).status, 409);
    assert.strictEqual((await call('POST', 'undo', { batchId: 'HI-test-b' })).status, 200);
    assert.strictEqual((await call('POST', 'undo', { batchId: 'HI-test-a' })).status, 200);
    assert.strictEqual(pRow('EMP001', 'C22').current_annual_base_pay, 100);
  });

  await t('large import: undo data is split to fit the audit details column', async () => {
    const records = Array.from({ length: 240 }, (_, i) => ({ row: i + 2, empId: 'E' + String(i).padStart(4, '0'), empName: 'Person ' + i, basePay: 1000 + i, pbMonth: 'Apr-22', fyYear: '2021-22' }));
    const r = await call('POST', 'commit', { type: 'payroll', cycleId: 'C22', batchId: 'HI-test-big', fileName: 'big.xlsx', records });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.data.inserted, 240);
    const again = await call('POST', 'commit', { type: 'payroll', cycleId: 'C22', batchId: 'HI-test-big2', fileName: 'big.xlsx', records });
    assert.strictEqual(again.json.data.updated, 240);
    assert.strictEqual((await call('POST', 'undo', { batchId: 'HI-test-big2' })).json.data.restored, 240);
    assert.strictEqual((await call('POST', 'undo', { batchId: 'HI-test-big' })).json.data.deleted, 240);
    assert.strictEqual(DB[T.payroll].length, 2);
  });

  await t('rejects more than one chunk worth of rows per commit and bad batch IDs', async () => {
    const records = Array.from({ length: 251 }, (_, i) => ({ empId: 'X' + i }));
    assert.strictEqual((await call('POST', 'commit', { type: 'payroll', cycleId: 'C22', batchId: 'HI-test-x', records })).status, 400);
    assert.strictEqual((await call('POST', 'commit', { type: 'payroll', cycleId: 'C22', batchId: 'bad id!', records: payrollFile() })).status, 400);
    assert.strictEqual((await call('POST', 'commit', { type: 'salary', cycleId: 'C22', batchId: 'HI-test-x', records: payrollFile() })).status, 400);
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
