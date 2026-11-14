/* Generate Appraisal Sheet stores the Comp Manager as the Employee ID
   ("EMP002"), whatever form the source gives: Delegation stores IDs, Employee
   Master "EMP002 - Name", older rows a name. Mixed forms made every Generate
   after a Delegation change rewrite assignments that had not changed. A value
   that matches no employee, or a name two employees share, is left as it is.
   Run: node test/generate-comp-manager.test.js */
'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const T = {
  sheet: '74008000000039094', master: '74008000000035727', payroll: '74008000000035326',
  cycles: '74008000000034190', audit: '74008000000034940', feedback: '74008000000022041',
  elig: '74008000000057046', delegation: '74008000000036124',
};

let DB;
let seq;
function seed() {
  seq = 0;
  const master = [
    { ROWID: 'M1', emp_id: 'EMP001', emp_name: 'Prabhu Parida', email_id: 'prabhu@x.com', emp_status: 'Active', appraiser_tech_ed: 'EMP002 - Ashok Kumar' },
    { ROWID: 'M2', emp_id: 'EMP002', emp_name: 'Ashok Kumar', email_id: 'ashok@x.com', emp_status: 'Active', appraiser_tech_ed: 'EMP001 - Prabhu Parida' },
    { ROWID: 'M3', emp_id: 'EMP003', emp_name: 'Riya Sen', emp_status: 'Active', appraiser_tech_ed: 'EMP002 - Ashok Kumar', comp_manager: 'EMP001 - Prabhu Parida' },
    { ROWID: 'M4', emp_id: 'EMP004', emp_name: 'Kabir Singh', emp_status: 'Active', appraiser_tech_ed: 'EMP002 - Ashok Kumar' },
    { ROWID: 'M5', emp_id: 'EMP005', emp_name: 'Neha Verma', emp_status: 'Active', appraiser_tech_ed: 'EMP002 - Ashok Kumar' },
    { ROWID: 'M6', emp_id: 'EMP006', emp_name: 'Neha Verma', emp_status: 'Active', appraiser_tech_ed: 'EMP002 - Ashok Kumar' },
    { ROWID: 'M7', emp_id: 'EMP007', emp_name: 'Arjun Das', emp_status: 'Active', appraiser_tech_ed: 'EMP002 - Ashok Kumar' },
  ];
  DB = {
    [T.cycles]: [{ ROWID: 'C27', cycle_name: 'Annual 2027', status: 'Active', archived: false, start_date: '2026-04-01' }],
    [T.master]: master,
    [T.elig]: master.map((m, i) => ({ ROWID: 'E' + i, appraisal_cycle_id: 'C27', employee_master_id: m.ROWID, emp_id: m.emp_id, eligibility_status: 'Eligible', eligibility_source: 'Manual' })),
    [T.payroll]: master.map((m, i) => ({ ROWID: 'P' + i, emp_id: m.ROWID, appraisal_cycle_name: 'C27', new_base_pay: 500000 })),
    [T.feedback]: master.map((m, i) => ({ ROWID: 'F' + i, emp_ID: m.ROWID, appraisal_cycle_name: 'C27', manager_feedback: 'Good', manager_rating: 4 })),
    // Delegation (stores IDs and, for EMP007, a row ID).
    [T.delegation]: [
      { ROWID: 'D1', cycle_id: 'C27', emp_id: 'M1', comp_manager: 'EMP002', appraiser_tech_ed: 'EMP002' },
      { ROWID: 'D7', cycle_id: 'C27', emp_id: 'M7', comp_manager: 'M1', appraiser_tech_ed: 'EMP002' },
    ],
    // Existing sheet rows with the forms found in the live data.
    [T.sheet]: [
      { ROWID: 'S2', emp_id: 'EMP002', emp_master_row_id: 'M2', cycle_id: 'C27', comp_manager: 'EMP001 - Prabhu Parida' },
      { ROWID: 'S4', emp_id: 'EMP004', emp_master_row_id: 'M4', cycle_id: 'C27', comp_manager: 'Ashok Kumar' },
      { ROWID: 'S5', emp_id: 'EMP005', emp_master_row_id: 'M5', cycle_id: 'C27', comp_manager: 'Meena Joshi' },
      { ROWID: 'S6', emp_id: 'EMP006', emp_master_row_id: 'M6', cycle_id: 'C27', comp_manager: 'Neha Verma' },
    ],
    [T.audit]: [],
  };
}
function table(tid) {
  if (!DB[tid]) DB[tid] = [];
  const rows = DB[tid];
  const add = (r) => { const x = { ...r, ROWID: String(r.ROWID || 'R' + (++seq)) }; rows.push(x); return { ...x }; };
  const upd = (u) => { const r = rows.find((x) => x.ROWID === String(u.ROWID)); Object.assign(r, u); return { ...r }; };
  return {
    getAllColumns: async () => (tid === T.sheet
      ? ['emp_id', 'name', 'designation', 'department', 'emp_master_row_id', 'cycle_id', 'status', 'eligible_status',
          'comp_manager', 'appraiser_tech_ed', 'manager_rating', 'current_annual_base_pay']
      : []).map((c) => ({ column_name: c })),
    getPagedRows: async (o = {}) => {
      const start = Number(o.nextToken || 0);
      const size = o.maxRows || 200;
      const more = start + size < rows.length;
      return { data: rows.slice(start, start + size).map((r) => ({ ...r })), more_records: more, next_token: more ? String(start + size) : null };
    },
    insertRows: async (list) => list.map(add),
    updateRows: async (list) => list.map(upd),
    insertRow: async (r) => add(r),
    updateRow: async (u) => upd(u),
    deleteRows: async (ids) => { ids.forEach((x) => { const i = rows.findIndex((r) => r.ROWID === String(x)); if (i >= 0) rows.splice(i, 1); }); return true; },
  };
}

function load() {
  const dir = path.resolve(__dirname, '..');
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(dir) && !k.includes('node_modules')) delete require.cache[k]; });
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const accessStub = {
    HttpError,
    check: async () => ({ enforced: true, role: 'hr', scope: { all: true }, user: { email: 'hr@x.com', name: 'HR' } }),
    isEnforced: () => true,
    guard: (x, fn) => fn(),
    requireScreen: () => {},
    bumpVersion: async () => {},
  };
  const catalystStub = {
    initialize: () => ({
      datastore: () => ({ table }),
      userManagement: () => ({ getCurrentUser: async () => ({ user_id: '1', email_id: 'hr@x.com', first_name: 'HR', role_details: { role_name: 'HR' } }) }),
    }),
  };
  const orig = Module._load;
  Module._load = function (req, parent, ...rest) {
    if (req === 'zcatalyst-sdk-node') return catalystStub;
    if (req === './accessCore') return accessStub;
    return orig.call(this, req, parent, ...rest);
  };
  try { return require('../index.js'); } finally { Module._load = orig; }
}

function generate(cycleId = 'C27') {
  const api = load();
  return new Promise((resolve, reject) => {
    const req = { method: 'POST', url: '/?resource=generate-sheet', body: { cycleId }, headers: {}, on() {} };
    const res = { status: 0, setHeader() {}, writeHead(s) { this.status = s; }, end(text) { resolve({ status: this.status, json: JSON.parse(text) }); } };
    api(req, res).catch(reject);
  });
}
const compManagerOf = (empId) => DB[T.sheet].find((r) => r.emp_id === empId && r.cycle_id === 'C27')?.comp_manager;

let pass = 0, fail = 0;
async function t(name, fn) { try { seed(); await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', String(e.stack).split('\n').slice(0, 3).join(' | ')); } }

(async () => {
  console.warn = () => {};

  await t('new rows store the Comp Manager as the Employee ID, from Delegation or Employee Master', async () => {
    const r = await generate();
    assert.strictEqual(r.status, 200, JSON.stringify(r.json).slice(0, 300));
    assert.strictEqual(compManagerOf('EMP001'), 'EMP002', 'Delegation ID');
    assert.strictEqual(compManagerOf('EMP003'), 'EMP001', 'Employee Master "EMP001 - Name"');
    assert.strictEqual(compManagerOf('EMP007'), 'EMP001', 'Delegation row ID');
  });

  await t('a kept assignment in another form is stored as the same person\'s ID', async () => {
    await generate();
    assert.strictEqual(compManagerOf('EMP002'), 'EMP001', '"EMP001 - Prabhu Parida"');
    assert.strictEqual(compManagerOf('EMP004'), 'EMP002', 'unique name "Ashok Kumar"');
  });

  await t('a value that matches no employee, or a name two employees share, is left as it is', async () => {
    await generate();
    assert.strictEqual(compManagerOf('EMP005'), 'Meena Joshi');
    DB[T.sheet].find((r) => r.ROWID === 'S6').comp_manager = 'Neha Verma'; // two employees are called Neha Verma
    await generate();
    assert.strictEqual(compManagerOf('EMP006'), 'Neha Verma');
  });

  await t('a second Generate finds nothing to change', async () => {
    await generate();
    const again = await generate();
    assert.strictEqual(again.json.data.updated, 0, JSON.stringify(again.json.data));
    assert.strictEqual(again.json.data.upToDate, true);
  });

  await t('a location cycle reuses payroll, feedback, and ratings from its closed Annual source', async () => {
    const source = DB[T.cycles][0];
    source.status = 'Closed';
    DB[T.master][0].location = 'India';
    DB[T.cycles].push({
      ROWID: 'C28',
      cycle_name: 'India - Annual 2027',
      status: 'Active',
      archived: false,
      location: 'India',
      start_date: '2027-04-01',
    });
    DB[T.elig].push({
      ROWID: 'E28',
      appraisal_cycle_id: 'C28',
      employee_master_id: 'M1',
      emp_id: 'EMP001',
      eligibility_status: 'Eligible',
      eligibility_source: 'Manual',
    });

    const result = await generate('C28');
    assert.strictEqual(result.status, 200, JSON.stringify(result.json));
    const generated = DB[T.sheet].find((row) => row.cycle_id === 'C28' && row.emp_id === 'EMP001');
    assert.ok(generated, 'the eligible location employee is generated');
    assert.strictEqual(generated.current_annual_base_pay, 500000);
    assert.strictEqual(DB[T.payroll].length, 7, 'source payroll rows are reused, not duplicated');
    assert.strictEqual(DB[T.feedback].length, 7, 'source feedback and rating rows are reused, not duplicated');
  });

  await t('a location cycle can reuse payroll, feedback, and ratings before the shared Annual source is closed', async () => {
    DB[T.master][0].location = 'India';
    DB[T.master][1].location = 'Dubai';
    DB[T.cycles].push({
      ROWID: 'C28',
      cycle_name: 'India - Annual 2027',
      status: 'Active',
      archived: false,
      location: 'India',
      start_date: '2027-04-01',
    });
    DB[T.elig].push({
      ROWID: 'E28',
      appraisal_cycle_id: 'C28',
      employee_master_id: 'M1',
      emp_id: 'EMP001',
      eligibility_status: 'Eligible',
      eligibility_source: 'Manual',
    });

    const result = await generate('C28');
    assert.strictEqual(result.status, 200, JSON.stringify(result.json));
    const generatedRows = DB[T.sheet].filter((row) => row.cycle_id === 'C28');
    assert.deepStrictEqual(generatedRows.map((row) => row.emp_id), ['EMP001']);
    assert.strictEqual(generatedRows[0].current_annual_base_pay, 500000);
    assert.strictEqual(DB[T.payroll].length, 7, 'source payroll rows are reused, not duplicated');
    assert.strictEqual(DB[T.feedback].length, 7, 'source feedback and rating rows are reused, not duplicated');
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
