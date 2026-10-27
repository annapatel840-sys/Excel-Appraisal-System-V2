/* Cycle flow: Eligibility -> Delegation (before the sheet exists) -> Generate.
   employeesapi and payrollcycleapi share one in-memory Data Store whose
   Appraisal_Sheet / Employee_Master columns match the live schema.
   Run: node test/delegation-generate.test.js */
'use strict';

const assert = require('assert');
const http = require('http');
const Module = require('module');
const path = require('path');

const T = {
  sheet: '74008000000039094', master: '74008000000035727', cycles: '74008000000034190',
  elig: '74008000000057046',
};
const COLS = {
  [T.sheet]: ['emp_id', 'name', 'designation', 'reporting_manager', 'comp_manager', 'department', 'manager', 'status',
    'wissen_experience', 'total_experience', 'last_appraisal_date', 'manager_rating', 'interview_count', 'rr_percent',
    'gross_margin', 'month_rb', 'month_pb', 'current_annual_base_pay', 'target_pb_allocated_for_may', 'allocated_pb_amount',
    'pb_installment', 'new_pb_to_be_offered', 'new_pb_installment', 'new_rb', 'hike_amount', 'hike_pct', 'target_pb_next_year',
    'eligible_for_promotion', 'new_title', 'at_risk', 'joining_date', 'manager_email_id', 'super_man_email_id', 'rating',
    'eligible_status', 'joining_bonus', 'emp_master_row_id', 'appraiser_tech_ed', 'cycle_id', 'target_PB_criteria',
    'comp_manager_remarks', 'previous_year_CTC_with_rewards'],
  [T.master]: ['emp_id', 'emp_name', 'designation', 'department', 'repo_manager', 'director', 'appraiser_tech_ed', 'email_id',
    'date_of_join', 'emp_status', 'emp_type', 'wissen_experience', 'total_experience', 'cost_center', 'current_salary',
    'location', 'last_appraisal_month_year', 'comp_manager'],
};

let seq = 5000;
let DB;
function table(id) {
  if (!DB[id]) DB[id] = [];
  const rows = DB[id];
  const check = (row) => Object.keys(row).forEach((k) => {
    if (k !== 'ROWID' && COLS[id] && !COLS[id].includes(k)) throw new Error('Invalid column ' + k + ' in ' + id);
  });
  const add = (row) => { check(row); const r = { ...row, ROWID: String(++seq) }; rows.push(r); return { ...r }; };
  const upd = (row) => {
    check(row);
    const r = rows.find((x) => x.ROWID === String(row.ROWID));
    if (!r) throw new Error('No row ' + row.ROWID);
    Object.assign(r, row);
    return { ...r };
  };
  const del = (x) => { const i = rows.findIndex((r) => r.ROWID === String(x)); if (i >= 0) rows.splice(i, 1); };
  return {
    getAllColumns: async () => (COLS[id] || []).map((c) => ({ column_name: c })),
    getPagedRows: async () => ({ data: rows.map((r) => ({ ...r })), more_records: false }),
    getAllRows: async () => rows.map((r) => ({ ...r })),
    insertRow: async (r) => add(r),
    insertRows: async (b) => b.map(add),
    updateRow: async (r) => upd(r),
    updateRows: async (b) => b.map(upd),
    deleteRows: async (ids) => { ids.forEach(del); return true; },
    deleteRow: async (x) => { del(x); return true; },
  };
}

let accessResult;
function load(dirName) {
  const dir = path.resolve(__dirname, '..', '..', dirName);
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(dir) && !k.includes('node_modules')) delete require.cache[k]; });
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const accessStub = {
    HttpError,
    START_CATALOG: [],
    check: async () => accessResult,
    isEnforced: () => Boolean(accessResult.enforced),
    guard: (a, fn) => fn(),
    requireScreen: () => {}, requireAction: () => {}, requireEditColumns: () => {},
    inScope: (a) => Boolean(a.scope && a.scope.all), // Delegation table empty
    shapeRowByColumns: (a, row) => ({ ...row }),
    fieldOfColumn: () => '',
    bumpVersion: async () => {},
  };
  const catalystStub = { initialize: () => ({
    datastore: () => ({ table }),
    userManagement: () => ({ getCurrentUser: async () => ({ user_id: '1', email_id: 'hr@x.com', first_name: 'HR', last_name: 'A', role_details: { role_name: 'HR' } }) }),
  }) };
  const orig = Module._load;
  Module._load = function (req, ...rest) {
    if (req === 'zcatalyst-sdk-node') return catalystStub;
    if (req === './accessCore') return accessStub;
    return orig.call(this, req, ...rest);
  };
  try { return require(path.join(dir, 'index.js')); } finally { Module._load = orig; }
}

function send(handler, method, query, body) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler).listen(0, () => {
      const data = body ? JSON.stringify(body) : '';
      const rq = http.request({
        host: '127.0.0.1', port: server.address().port, path: '/?' + (query || ''), method,
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
      }, (res) => {
        let out = '';
        res.on('data', (c) => (out += c));
        res.on('end', () => { server.close(); resolve({ status: res.statusCode, json: JSON.parse(out || '{}') }); });
      });
      rq.on('error', reject);
      rq.end(data);
    });
  });
}

function generate(cycleId) {
  const api = load('payrollcycleapi');
  return new Promise((resolve, reject) => {
    const req = { method: 'POST', url: '/?resource=generate-sheet', body: { cycleId }, on() {} };
    const res = { status: 0, writeHead(s) { this.status = s; }, end(text) { resolve({ status: this.status, json: JSON.parse(text) }); } };
    api(req, res).catch(reject);
  });
}

const HR = { enforced: true, role: 'hr', scope: { all: true }, user: { email: 'hr@x.com' }, fields: {} };
const ASHOK = { enforced: true, role: 'techEd', scope: { all: false, empIds: [] }, user: { email: 'ashok@x.com', empId: 'EMP002', name: 'Ashok Kumar' }, fields: {} };
const PRABHU_T = 'EMP001 - Prabhuprasad Parida';
const ASHOK_T = 'EMP002 - Ashok Kumar';

let ids;
async function seed() {
  DB = {};
  seq = 5000;
  DB[T.cycles] = [
    { ROWID: 'C0', cycle_name: 'New Joiner 2023', status: 'Closed', archived: true, start_date: '2023-01-01', end_date: '2023-12-31' },
    { ROWID: 'C1', cycle_name: 'Annual 2024', status: 'Active', archived: false, start_date: '2023-04-01', end_date: '2024-04-01', cycle_type: 'Annual', process: 'Annual' },
  ];
  const m = table(T.master);
  const mk = (r) => m.insertRow({ emp_status: 'Active', ...r });
  const rows = [
    await mk({ emp_id: 'EMP001', emp_name: 'Prabhuprasad Parida', email_id: 'prabhu@x.com', appraiser_tech_ed: ASHOK_T }),
    await mk({ emp_id: 'EMP002', emp_name: 'Ashok Kumar', email_id: 'ashok@x.com', appraiser_tech_ed: PRABHU_T, comp_manager: PRABHU_T }),
    await mk({ emp_id: 'EMP011', emp_name: 'Pooja Rao', appraiser_tech_ed: ASHOK_T, comp_manager: ASHOK_T }),
    await mk({ emp_id: 'EMP013', emp_name: 'Anjali Verma', appraiser_tech_ed: ASHOK_T }),
    await mk({ emp_id: 'EMP020', emp_name: 'Not Eligible', appraiser_tech_ed: ASHOK_T }),
  ];
  ids = Object.fromEntries(rows.map((r) => [r.emp_id, r.ROWID]));
  const e = table(T.elig);
  for (const r of rows) {
    await e.insertRow({
      appraisal_cycle_id: 'C1', employee_master_id: r.ROWID, emp_id: r.emp_id,
      eligibility_status: r.emp_id === 'EMP020' ? 'Not Eligible' : 'Eligible', eligibility_source: 'Criteria',
    });
  }
  // A row of the earlier (closed) cycle for the same employee.
  await table(T.sheet).insertRow({ emp_id: 'EMP011', cycle_id: 'C0', emp_master_row_id: ids.EMP011, comp_manager: 'OLD CYCLE' });
}

const byEmp = (r) => {
  if (!Array.isArray(r.json.data)) throw new Error('API ' + r.status + ': ' + JSON.stringify(r.json).slice(0, 300));
  return Object.fromEntries(r.json.data.map((e) => [e.emp_id, e]));
};
const sheetRow = (emp, cycle) => DB[T.sheet].find((r) => r.emp_id === emp && r.cycle_id === cycle);
const masterRow = (emp) => DB[T.master].find((r) => r.emp_id === emp);
let pass = 0, fail = 0;
async function t(name, fn) {
  try { await seed(); await fn(); pass++; console.log('PASS', name); }
  catch (e) { fail++; console.log('FAIL', name, '\n   ', String(e.stack).split('\n').slice(0, 3).join(' | ')); }
}
const LIST = 'page=1&limit=100&view=delegation';

(async () => {
  await t('Delegation before Generate lists the eligible employees with Tech-ED and Comp Manager', async () => {
    accessResult = HR;
    const r = byEmp(await send(load('employeesapi'), 'GET', LIST));
    assert.deepStrictEqual(Object.keys(r).sort(), ['EMP001', 'EMP002', 'EMP011', 'EMP013']);
    assert.strictEqual(r.EMP013.appraiser_tech_ed, ASHOK_T);
    assert.strictEqual(r.EMP011.comp_manager, ASHOK_T);
  });

  await t('the normal Appraisal Sheet view stays empty until Generate', async () => {
    accessResult = HR;
    const r = await send(load('employeesapi'), 'GET', 'page=1&limit=100');
    assert.deepStrictEqual(r.json.data, []);
  });

  await t('Tech-ED sees only his team in Delegation before Generate', async () => {
    accessResult = ASHOK;
    const r = byEmp(await send(load('employeesapi'), 'GET', LIST));
    assert.deepStrictEqual(Object.keys(r).sort(), ['EMP001', 'EMP011', 'EMP013']);
  });

  await t('Delegation change before Generate is saved on Employee_Master; old cycle row untouched', async () => {
    accessResult = HR;
    const api = load('employeesapi');
    let r = await send(api, 'PATCH', '', { emp_id: 'EMP013', comp_manager: PRABHU_T });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.data.comp_manager, PRABHU_T);
    r = await send(api, 'PATCH', '', { emp_id: 'EMP011', appraiser_tech_ed: PRABHU_T });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(masterRow('EMP013').comp_manager, PRABHU_T);
    assert.strictEqual(masterRow('EMP011').appraiser_tech_ed, PRABHU_T);
    assert.strictEqual(sheetRow('EMP011', 'C0').comp_manager, 'OLD CYCLE');
    assert.strictEqual(DB[T.sheet].length, 1, 'no sheet row is created before Generate');
  });

  await t('Generate creates the sheet with Tech-ED (row ID) and Comp Manager from Delegation', async () => {
    accessResult = HR;
    const api = load('employeesapi');
    await send(api, 'PATCH', '', { emp_id: 'EMP013', comp_manager: PRABHU_T });
    await send(api, 'PATCH', '', { emp_id: 'EMP011', appraiser_tech_ed: PRABHU_T });
    const g = await generate('C1');
    assert.strictEqual(g.status, 200, JSON.stringify(g.json));
    assert.strictEqual(g.json.data.created, 4);
    assert.strictEqual(sheetRow('EMP013', 'C1').appraiser_tech_ed, ids.EMP002);
    assert.strictEqual(sheetRow('EMP013', 'C1').comp_manager, PRABHU_T);
    assert.strictEqual(sheetRow('EMP011', 'C1').appraiser_tech_ed, ids.EMP001);
    assert.strictEqual(sheetRow('EMP011', 'C1').comp_manager, ASHOK_T);
    assert.strictEqual(sheetRow('EMP001', 'C1').comp_manager, ASHOK_T, 'Comp Manager defaults to the Tech-ED');
    assert.ok(!sheetRow('EMP020', 'C1'), 'not eligible is not generated');
    assert.strictEqual(sheetRow('EMP011', 'C0').comp_manager, 'OLD CYCLE');

    const sheet = byEmp(await send(api, 'GET', 'page=1&limit=100'));
    assert.deepStrictEqual(Object.keys(sheet).sort(), ['EMP001', 'EMP002', 'EMP011', 'EMP013']);
    assert.strictEqual(sheet.EMP011.appraiser_tech_ed, PRABHU_T);
    accessResult = ASHOK;
    const mine = byEmp(await send(api, 'GET', 'page=1&limit=100'));
    assert.deepStrictEqual(Object.keys(mine).sort(), ['EMP001', 'EMP013']);
  });

  await t('Delegation after Generate updates the Active cycle row (Tech-ED lookup + Comp Manager)', async () => {
    accessResult = HR;
    assert.strictEqual((await generate('C1')).status, 200);
    const api = load('employeesapi');
    let r = await send(api, 'PATCH', '', { emp_id: 'EMP011', appraiser_tech_ed: PRABHU_T });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(sheetRow('EMP011', 'C1').appraiser_tech_ed, ids.EMP001);
    assert.strictEqual(masterRow('EMP011').appraiser_tech_ed, PRABHU_T);
    r = await send(api, 'PATCH', '', { emp_id: 'EMP011', comp_manager: PRABHU_T });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(sheetRow('EMP011', 'C1').comp_manager, PRABHU_T);
    assert.strictEqual(sheetRow('EMP011', 'C0').comp_manager, 'OLD CYCLE');
    assert.strictEqual(masterRow('EMP011').comp_manager, ASHOK_T, 'master default kept after Generate');
    r = await send(api, 'PATCH', '', { emp_id: 'EMP011', appraiser_tech_ed: 'EMP999 - Nobody' });
    assert.strictEqual(r.status, 422, JSON.stringify(r.json));
  });

  await t('Generate repairs a stale Eligibility_List master reference by emp_id and keeps the Eligible decision', async () => {
    accessResult = HR;
    const eligibility = DB[T.elig].find((row) => row.emp_id === 'EMP013' && row.appraisal_cycle_id === 'C1');
    assert.ok(eligibility, 'EMP013 eligibility row seeded');
    eligibility.employee_master_id = 'STALE-MASTER-ROWID';

    const g = await generate('C1');
    assert.strictEqual(g.status, 200, JSON.stringify(g.json));
    assert.ok(sheetRow('EMP013', 'C1'), 'EMP013 must be generated from the Eligible row');
    assert.strictEqual(eligibility.employee_master_id, ids.EMP013, 'stale master reference is repaired');
    assert.strictEqual(eligibility.eligibility_status, 'Eligible', 'eligibility decision is preserved');
  });

  await t('Generate corrects a valid-but-wrong Employee_Master reference using emp_id', async () => {
    accessResult = HR;
    const eligibility = DB[T.elig].find((row) => row.emp_id === 'EMP013' && row.appraisal_cycle_id === 'C1');
    assert.ok(eligibility);
    eligibility.employee_master_id = ids.EMP011; // valid ROWID, but belongs to another employee

    const g = await generate('C1');
    assert.strictEqual(g.status, 200, JSON.stringify(g.json));
    assert.ok(sheetRow('EMP013', 'C1'), 'EMP013 is generated');
    assert.ok(!sheetRow('EMP011', 'C1') || sheetRow('EMP011', 'C1').emp_master_row_id === ids.EMP011,
      'EMP013 eligibility must not be applied to EMP011');
    assert.strictEqual(eligibility.employee_master_id, ids.EMP013, 'wrong reference is corrected');
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
