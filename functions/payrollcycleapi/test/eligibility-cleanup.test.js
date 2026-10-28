/* Eligibility_List clean-up: rows live only while a cycle is Active.
   Run: node test/eligibility-cleanup.test.js */
const assert = require('assert');
const path = require('path');
const Module = require('module');

const CYCLE_T = '74008000000034190';
const MASTER_T = '74008000000035727';
const ELIG_T = '74008000000057046';
const CYCLE_COLS = ['cycle_name', 'start_date', 'end_date', 'status', 'remarks', 'changed_by', 'changed_at', 'archived', 'cycle_type', 'process', 'effective_date', 'cancel_reason'];

function makeStore() {
  let seq = 1000;
  const tables = {};
  const table = (id, cols) => {
    if (tables[id]) return tables[id];
    const rows = [];
    const check = (row) => Object.keys(row).forEach((k) => {
      if (k !== 'ROWID' && cols && !cols.includes(k)) throw new Error(`Invalid column ${k}`);
    });
    const unique = (batch) => {
      if (id !== ELIG_T) return;
      const seen = new Set(rows.map((r) => r.emp_id));
      for (const r of batch) {
        if (seen.has(r.emp_id)) throw new Error('Duplicate value for emp_id. Please give a different value');
        seen.add(r.emp_id);
      }
    };
    const add = (row) => { const r = { ...row, ROWID: String(++seq) }; rows.push(r); return { ...r }; };
    tables[id] = {
      rows,
      getAllColumns: async () => (cols || []).map((c) => ({ column_name: c })),
      getPagedRows: async () => ({ data: rows.map((r) => ({ ...r })), more_records: false }),
      insertRow: async (row) => { check(row); unique([row]); return add(row); },
      insertRows: async (batch) => { unique(batch); return batch.map(add); },
      updateRow: async (row) => { check(row); const r = rows.find((x) => x.ROWID === String(row.ROWID)); Object.assign(r, row); return { ...r }; },
      deleteRow: async (id2) => { const i = rows.findIndex((x) => x.ROWID === String(id2)); rows.splice(i, 1); return true; },
      deleteRows: async (ids) => {
        assert.ok(ids.length <= 100, 'deleteRows batch too large');
        ids.forEach((x) => { const i = rows.findIndex((r) => r.ROWID === String(x)); if (i >= 0) rows.splice(i, 1); });
        return true;
      },
    };
    return tables[id];
  };
  return { tables, table };
}

function load(store) {
  const dir = path.resolve(__dirname, '..');
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(dir) && !k.includes('node_modules')) delete require.cache[k]; });
  const catalystStub = { initialize: () => ({
    datastore: () => ({ table: (id) => store.table(id, id === CYCLE_T ? CYCLE_COLS : null) }),
    userManagement: () => ({ getCurrentUser: async () => ({ user_id: '1', first_name: 'HR', last_name: 'A', email_id: 'hr@x.com', role_details: { role_name: 'HR' } }) }),
  }) };
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const accessStub = { HttpError, check: async () => ({ dryRun: true, enforced: false }), isEnforced: () => false, guard: (a, fn) => fn(), requireScreen: () => {}, bumpVersion: async () => {} };
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
    const req = { method, url: '/?resource=' + encodeURIComponent(resource), body: body || (method === 'POST' ? {} : undefined), on() {} };
    const res = { status: 0, writeHead(s) { this.status = s; }, end(text) { resolve({ status: this.status, json: JSON.parse(text) }); } };
    api(req, res).catch(reject);
  });
}

const iso = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10);
let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); }
}

async function setup() {
  const store = makeStore();
  const api = load(store);
  const post = (r, b) => call(api, 'POST', r, b);
  const master = store.table(MASTER_T, null);
  await master.insertRow({ emp_id: 'E1', emp_name: 'A', emp_status: 'Active' });
  await master.insertRow({ emp_id: 'E2', emp_name: 'B', emp_status: 'Active' });
  const mk = async (name) => {
    assert.strictEqual((await post('cycles/create', { name, type: 'Annual', process: 'Annual', effective: iso(9), start: iso(10), end: iso(40) })).status, 201);
    return (await call(api, 'GET', 'cycles')).json.data.find((c) => c.name === name);
  };
  return { store, api, post, mk, elig: store.table(ELIG_T, null) };
}

(async () => {
  const apply = (post, cycleId, criteria = {}) => post('eligibility', { action: 'apply-criteria', cycleId, ...criteria });

  await t('leftover rows from an old cycle no longer block a new cycle', async () => {
    const { post, mk, elig } = await setup();
    await elig.insertRows([{ appraisal_cycle_id: 'OLD', employee_master_id: '1', emp_id: 'E1' }, { appraisal_cycle_id: 'OLD', employee_master_id: '2', emp_id: 'E2' }]);
    const c = await mk('Annual NEW');
    const r = await post('cycles/status/' + c.id, { status: 'Active' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(elig.rows.length, 0);
    const ap = await apply(post, c.id);
    assert.strictEqual(ap.status, 200, JSON.stringify(ap.json));
    assert.strictEqual(elig.rows.length, 2);
    assert.ok(elig.rows.every((x) => x.appraisal_cycle_id === c.id));
  });

  await t('first Eligibility List load seeds Active employees as Eligible', async () => {
    const { post, mk, elig } = await setup();
    const a = await mk('Annual A');
    const r = await post('cycles/status/' + a.id, { status: 'Active' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const listed = await call(api, 'GET', 'eligibility');
    assert.strictEqual(listed.status, 200, JSON.stringify(listed.json));
    assert.strictEqual(elig.rows.length, 2);
    assert.ok(elig.rows.every((x) => x.eligibility_status === 'Eligible'));
  });

  await t('closing a cycle empties its eligibility rows; next cycle activates cleanly', async () => {
    const { post, mk, elig } = await setup();
    const a = await mk('Annual A');
    assert.strictEqual((await post('cycles/status/' + a.id, { status: 'Active' })).status, 200);
    assert.strictEqual((await apply(post, a.id)).status, 200);
    assert.strictEqual(elig.rows.length, 2);
    const closed = await post('cycles/status/' + a.id, { status: 'Closed' });
    assert.strictEqual(closed.status, 200, JSON.stringify(closed.json));
    assert.strictEqual(closed.json.data.eligibilityCleared, 2);
    assert.strictEqual(elig.rows.length, 0);
    const b = await mk('Annual B');
    assert.strictEqual((await post('cycles/status/' + b.id, { status: 'Active' })).status, 200);
    assert.strictEqual(elig.rows.length, 0);
    assert.strictEqual((await apply(post, b.id)).status, 200);
    assert.strictEqual(elig.rows.length, 2);
  });

  await t('reopening a closed cycle starts with an empty list again', async () => {
    const { post, mk, elig } = await setup();
    const a = await mk('Annual A');
    await post('cycles/status/' + a.id, { status: 'Active' });
    await apply(post, a.id);
    await post('cycles/status/' + a.id, { status: 'Closed' });
    assert.strictEqual((await post('cycles/status/' + a.id, { status: 'Active' })).status, 200);
    assert.strictEqual(elig.rows.length, 0);
  });

  await t('cancelling an Active cycle empties its eligibility rows', async () => {
    const { post, mk, elig } = await setup();
    const a = await mk('Annual A');
    await post('cycles/status/' + a.id, { status: 'Active' });
    await apply(post, a.id);
    assert.strictEqual(elig.rows.length, 2);
    assert.strictEqual((await post('cycles/cancel/' + a.id, { reason: 'test' })).status, 200);
    assert.strictEqual(elig.rows.length, 0);
  });

  await t('GET eligibility for the Active cycle initializes active employees as Eligible before criteria', async () => {
    const { post, mk, api, elig } = await setup();
    const a = await mk('Annual A');
    await post('cycles/status/' + a.id, { status: 'Active' });
    const r = await call(api, 'GET', 'eligibility');
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.data.records.length, 2);
    assert.strictEqual(elig.rows.length, 2);
    assert.ok(r.json.data.records.every((x) => x.eligibility_status === 'Eligible'));
    await apply(post, a.id);
    const r2 = await call(api, 'GET', 'eligibility');
    assert.strictEqual(r2.json.data.records.length, 2);
  });

  // ---- Apply Criteria + Add An Employee --------------------------------
  const richSetup = async () => {
    const ctx = await setup();
    const master = ctx.store.table(MASTER_T, null);
    await master.insertRow({ emp_id: 'E3', emp_name: 'C', emp_status: 'Active', department: 'Sales', designation: 'Manager', joining_date: '2020-01-10' });
    await master.insertRow({ emp_id: 'E4', emp_name: 'D', emp_status: 'Active', department: 'Engineering', designation: 'Analyst', joining_date: '2025-08-01' });
    await master.insertRow({ emp_id: 'E5', emp_name: 'E', emp_status: 'Inactive', department: 'Engineering', designation: 'Analyst', joining_date: '2020-01-10' });
    const c = await ctx.mk('Annual R');
    await ctx.post('cycles/status/' + c.id, { status: 'Active' });
    return { ...ctx, c };
  };
  const ids = (elig) => elig.rows.map((r) => r.emp_id).sort();

  await t('apply criteria adds only active employees who pass; excluded ones are left out', async () => {
    const { post, c, elig, store } = await richSetup();
    store.table(MASTER_T, null).rows.find((m) => m.emp_id === 'E1').joining_date = '15-03-2023';
    const r = await apply(post, c.id, { departments: ['Sales'], designations: [], excludedEmployees: ['E2'], cutoffDate: '2025-01-01' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    // Rows stay visible: passing employees are Eligible and excluded employees are Not Eligible.
    assert.deepStrictEqual(ids(elig), ['E1', 'E2', 'E3', 'E4']);
    const status = Object.fromEntries(elig.rows.map((row) => [row.emp_id, row.eligibility_status]));
    assert.strictEqual(status.E1, 'Eligible');
    assert.strictEqual(status.E2, 'Not Eligible');
    assert.strictEqual(status.E3, 'Not Eligible');
    assert.strictEqual(status.E4, 'Not Eligible');
    assert.strictEqual(r.json.data.added, 0);
    assert.strictEqual(r.json.data.updated, 4);
  });

  await t('cutoff with a missing joining date leaves the employee out', async () => {
    const { post, c, elig } = await richSetup();
    await apply(post, c.id, { cutoffDate: '2025-12-31' });
    assert.deepStrictEqual(ids(elig), ['E1', 'E2', 'E3', 'E4']); // missing DOJ is Not Eligible; other active rows remain visible
    const status = Object.fromEntries(elig.rows.map((row) => [row.emp_id, row.eligibility_status]));
    assert.strictEqual(status.E1, 'Not Eligible');
    assert.strictEqual(status.E2, 'Not Eligible');
    assert.strictEqual(status.E3, 'Eligible');
    assert.strictEqual(status.E4, 'Eligible');
  });

  await t('Add An Employee: a left-out employee is added by hand and survives re-applying criteria', async () => {
    const { post, c, elig } = await richSetup();
    await apply(post, c.id, { departments: ['Sales'] });
    assert.ok(ids(elig).includes('E3'));
    assert.strictEqual(elig.rows.find((r) => r.emp_id === 'E3').eligibility_status, 'Not Eligible');
    const add = await post('eligibility', { cycleId: c.id, empId: 'E3', eligible_status: 'Eligible', reason: 'ML', source: 'Manual' });
    assert.strictEqual(add.status, 200, JSON.stringify(add.json));
    assert.ok(ids(elig).includes('E3'));
    assert.strictEqual(elig.rows.find((r) => r.emp_id === 'E3').eligibility_source, 'Manual');
    await apply(post, c.id, { departments: ['Sales'] });
    assert.ok(ids(elig).includes('E3'), 'manual row must be kept');
  });

  await t('re-applying stricter criteria removes Criteria rows that no longer pass but keeps manual ones', async () => {
    const { post, c, elig } = await richSetup();
    await apply(post, c.id, {});
    assert.deepStrictEqual(ids(elig), ['E1', 'E2', 'E3', 'E4']);
    await post('eligibility', { cycleId: c.id, empId: 'E4', eligible_status: 'Not Eligible', reason: 'x' });
    const r = await apply(post, c.id, { departments: ['Sales', 'Engineering'] });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.deepStrictEqual(ids(elig), ['E1', 'E2', 'E3', 'E4']);
    assert.strictEqual(r.json.data.removed, 0);
    assert.strictEqual(elig.rows.find((row) => row.emp_id === 'E4').eligibility_status, 'Not Eligible');
  });

  await t('inactive employees cannot be added by hand', async () => {
    const { post, c } = await richSetup();
    const r = await post('eligibility', { cycleId: c.id, empId: 'E5', eligible_status: 'Eligible', source: 'Manual' });
    assert.strictEqual(r.status, 409);
  });

  await t('apply criteria needs the Active cycle', async () => {
    const { post, mk } = await setup();
    const c = await mk('Annual U');
    const r = await apply(post, c.id, {});
    assert.strictEqual(r.status, 409);
  });

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();