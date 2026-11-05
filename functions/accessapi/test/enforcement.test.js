/* Enforcement test for the functions that call accessCore.
   Run:  node functions/accessapi/test/enforcement.test.js

   - Stubs zcatalyst-sdk-node with an in-memory Data Store (tables by name OR id),
     ZCQL (SELECT * / COUNT(ROWID), =, >, AND, LIMIT, OFFSET) and a current user
     taken from the x-user-email / x-user-role headers.
   - Loads each function's index.js (which requires its own ./accessCore copy) and
     serves it over http on a random port.
   - ACCESS_ENFORCE='true': allowed vs 401/403, scoped lists and counts, hidden
     columns removed, read-only edits refused, HR-only screens blocked.
   - ACCESS_ENFORCE unset (dry run): a request that enforcement would refuse is
     logged as "would deny" and not refused by the access layer.
     (Until 2026-11 this also compared every answer with the pre-access code of
     3a88bc5; enforcement is live and the code has moved on, so that was dropped.) */
'use strict';

const Module = require('module');
const path = require('path');
const fs = require('fs');
const http = require('http');
const assert = require('assert');

const FN_ROOT = path.join(__dirname, '..', '..');          // functions/
const FUNCS = ['employeesapi', 'employeemasterapi', 'appraisalhistoryapi', 'appraisalauditapi', 'payrollcycleapi', 'budgetmasterapi'];

/* ------------------------------------------------------------------ */
/* In-memory Catalyst stub                                             */
/* ------------------------------------------------------------------ */
const TABLE_IDS = {
  // Current project (ExcelAppraisalManagement)
  '74008000000039094': 'Appraisal_Sheet',
  '74008000000035727': 'Employee_Master',
  '74008000000035326': 'Payroll_Data',
  '74008000000034190': 'Appraisal_Cycle_Master',
  '74008000000034940': 'Appraisal_Audit',
  '74008000000034565': 'Budget_Master',
  '74008000000033809': 'Budget_Distribution',
  '74008000000023149': 'Budget_Distribution_Comp',
  '74008000000036124': 'Delegation',
  '74008000000057046': 'Eligibility_List',
  '74008000000022041': 'Feedback_And_Rating',
  '74008000000022481': 'Location_Master',
  '74008000000096255': 'Previous_Delegation'
};
let DB = {};
let nextId = 1000n;
const USERS = {
  'hr@x.com': { first_name: 'Hema', last_name: 'R' },
  'ashok@x.com': { first_name: 'Ashok', last_name: 'Kumar' },
  'priya@x.com': { first_name: 'Priya', last_name: 'Shah' },
  'b@x.com': { first_name: 'Emp', last_name: 'B' },
  'nobody@x.com': { first_name: 'No', last_name: 'Body' }
};

const tname = (n) => TABLE_IDS[String(n)] || String(n);
function tbl(name) { const n = tname(name); return (DB[n] = DB[n] || []); }
const clean = (v) => (typeof v === 'boolean' ? String(v) : v);
const copy = (r) => Object.assign({}, r);
function insert(name, row) {
  const r = {};
  Object.keys(row).forEach((k) => { if (k !== 'ROWID') r[k] = clean(row[k]); });
  r.ROWID = String(nextId++);
  tbl(name).push(r);
  return copy(r);
}
function update(name, row) {
  const r = tbl(name).find((x) => x.ROWID === String(row.ROWID));
  if (!r) throw new Error('No row ' + row.ROWID + ' in ' + tname(name));
  Object.keys(row).forEach((k) => { if (k !== 'ROWID') r[k] = clean(row[k]); });
  return copy(r);
}
function splitAnd(cond) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < cond.length; i++) {
    const ch = cond[i];
    if (ch === "'") { if (inQ && cond[i + 1] === "'") { cur += "''"; i++; continue; } inQ = !inQ; }
    if (!inQ && cond.slice(i, i + 5).toUpperCase() === ' AND ') { out.push(cur); cur = ''; i += 4; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim().replace(/^\(+/, '').replace(/\)+$/, '').trim());
}
function execZcql(sql) {
  const m = sql.trim().match(/^SELECT (\*|COUNT\(ROWID\)) FROM (\w+)(?: WHERE (.+?))?(?: ORDER BY ROWID ASC)?(?: LIMIT (\d+))?(?: OFFSET (\d+))?$/i);
  if (!m) throw new Error('Stub ZCQL cannot parse: ' + sql);
  const [, what, table, where, limit, offset] = m;
  let rows = tbl(table).slice();
  if (where) {
    splitAnd(where).forEach((term) => {
      const t = term.match(/^(\w+)\s*(=|>)\s*(.+)$/);
      if (!t) throw new Error('Stub ZCQL cannot parse term: ' + term);
      const [, col, op, raw] = t;
      const val = raw.trim()[0] === "'" ? raw.trim().slice(1, -1).replace(/''/g, "'") : raw.trim();
      rows = rows.filter((r) => (op === '>' ? BigInt(String(r[col])) > BigInt(val) : r[col] != null && String(r[col]) === String(val)));
    });
  }
  rows.sort((a, b) => (BigInt(a.ROWID) < BigInt(b.ROWID) ? -1 : 1));
  if (what.toUpperCase() !== '*') return [{ 'COUNT(ROWID)': String(rows.length) }];
  const off = Number(offset || 0);
  rows = rows.slice(off, limit ? off + Number(limit) : undefined);
  return rows.map((r) => ({ [table]: copy(r) }));
}
function makeTable(name) {
  return {
    getPagedRows: async (opts) => {
      const all = tbl(name), start = Number((opts && opts.nextToken) || 0), max = Number((opts && opts.maxRows) || 200);
      const data = all.slice(start, start + max).map(copy), more = start + max < all.length;
      return { data, more_records: more, next_token: more ? String(start + max) : null };
    },
    getAllRows: async () => tbl(name).map(copy),
    getRow: async (id) => { const r = tbl(name).find((x) => x.ROWID === String(id)); if (!r) throw new Error('No row ' + id); return copy(r); },
    insertRow: async (row) => insert(name, row),
    insertRows: async (rows) => { if (rows.length > 200) throw new Error('insertRows > 200'); return rows.map((r) => insert(name, r)); },
    updateRow: async (row) => update(name, row),
    updateRows: async (rows) => rows.map((r) => update(name, r)),
    deleteRow: async (id) => { DB[tname(name)] = tbl(name).filter((x) => x.ROWID !== String(id)); return true; },
    deleteRows: async (ids) => { const s = new Set(ids.map(String)); DB[tname(name)] = tbl(name).filter((x) => !s.has(x.ROWID)); return true; }
  };
}
function makeApp(req) {
  const h = (req && req.headers) || {};
  return {
    userManagement: () => ({
      getCurrentUser: async () => {
        const email = h['x-user-email'];
        if (!email) return null;
        const u = USERS[String(email).toLowerCase()] || {};
        return { user_id: 'U-' + email, email_id: email, first_name: u.first_name || '', last_name: u.last_name || '', role_details: { role_name: h['x-user-role'] || 'App User' } };
      },
      getAllUsers: async () => []
    }),
    zcql: () => ({ executeZCQLQuery: async (sql) => execZcql(sql) }),
    datastore: () => ({ table: (name) => makeTable(name) })
  };
}
const STUB_ID = '__zcatalyst_stub__';
const EXPRESS = require.resolve('express', { paths: [path.join(FN_ROOT, 'accessapi')] });
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  if (request === 'zcatalyst-sdk-node') return STUB_ID;
  if (request === 'express') return EXPRESS;
  return origResolve.call(this, request, ...rest);
};
require.cache[STUB_ID] = { id: STUB_ID, filename: STUB_ID, loaded: true, exports: { initialize: (req) => makeApp(req) } };

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */
const EM = 'Employee_Master', DEL = 'Delegation', CYC = 'Appraisal_Cycle_Master', SHEET = 'Appraisal_Sheet';
const cAct = insert(CYC, { cycle_name: 'FY2026', status: 'Active', start_date: '2026-04-01', end_date: '2027-03-31', archived: false });
insert(CYC, { cycle_name: 'FY2025', status: 'Closed', start_date: '2025-04-01', end_date: '2026-03-31', archived: false });
[['EMP0001', 'Hema R', 'hr@x.com'], ['EMP0051', 'Ashok Kumar', 'ashok@x.com'], ['EMP0060', 'Priya Shah', 'priya@x.com'],
  ['EMP0090', 'Emp B', 'b@x.com'], ['EMP0100', 'Emp A1', 'a1@x.com'], ['EMP0101', 'Emp A2', 'a2@x.com'], ['EMP0102', 'Emp A3', 'a3@x.com'],
  ['EMP0103', 'Emp A4', 'a4@x.com'], ['EMP0104', 'Emp Out', 'out@x.com']]
  .forEach(([id, name, email]) => insert(EM, { emp_id: id, emp_name: name, email_id: email, emp_status: 'Active' }));
function del(emp, cm, te) { insert(DEL, { cycle_id: cAct.ROWID, emp_id: emp, comp_manager: cm, appraiser_tech_ed: te }); }
del('EMP0100', 'EMP0060', 'EMP0051');
del('EMP0101', 'EMP0060', 'EMP0051');
del('EMP0102', '', 'EMP0051');
del('EMP0103', 'EMP0060', '');
del('EMP0104', '', 'EMP0099');
// Sheet rows carry the same Comp Manager / Tech ED as Delegation (Delegation
// Save writes both); employeesapi builds a team from the sheet row.
const SHEET_CM = ['Priya Shah', 'Priya Shah', '', 'Priya Shah', ''];
const SHEET_TE = ['EMP0051 - Ashok Kumar', 'EMP0051 - Ashok Kumar', 'EMP0051 - Ashok Kumar', '', 'EMP0099 - Other'];
['EMP0100', 'EMP0101', 'EMP0102', 'EMP0103', 'EMP0104'].forEach((id, i) => insert(SHEET, {
  cycle_id: cAct.ROWID, emp_id: id, name: 'Emp ' + id, designation: 'Engineer', comp_manager: SHEET_CM[i],
  appraiser_tech_ed: SHEET_TE[i], status: 'Active', eligible_status: 'Eligible',
  hike_amount: 100 + i, hike_pct: 5, new_rb: 10 + i, wissen_experience: 3
}));
// The sheet lists only employees with an Eligible decision for the Active cycle.
['EMP0100', 'EMP0101', 'EMP0102', 'EMP0103', 'EMP0104'].forEach((id) => insert('Eligibility_List', {
  appraisal_cycle_id: cAct.ROWID, emp_id: id, eligibility_status: 'Eligible'
}));
// Field limits: Comp Manager cannot see Hike Amount; Tech ED may only read New RB.
insert('FieldAccess', { role_key: 'compMgr', field_key: 'hikeAmount', access_limit: 'hidden' });
insert('FieldAccess', { role_key: 'techEd', field_key: 'newRB', access_limit: 'read' });
insert('Payroll_Data', { emp_id: 'EMP0100', appraisal_year: 'Apr-26', hike_amount: 100, hike_pct: 5, base_pay: 1000, retention_bonus: 10 });
insert('Payroll_Data', { emp_id: 'EMP0104', appraisal_year: 'Apr-26', hike_amount: 7 });
insert('Appraisal_Audit', { emp_id: 'EMP0100', field_name: 'hike_amount', old_value: '1', new_value: '2', changed_by: 'x', changed_at: '2026-09-01 10:00:00', appraisal_year: 'Apr-26' });
insert('Appraisal_Audit', { emp_id: 'EMP0104', field_name: 'hike_amount', old_value: '1', new_value: '2', changed_by: 'x', changed_at: '2026-09-02 10:00:00', appraisal_year: 'Apr-26' });
insert('Appraisal_Audit', { emp_id: 'CYCLE', field_name: 'Created cycle', changed_by: 'x', changed_at: '2026-09-03 10:00:00', source: 'cycle' });
// Budget_Master: one org-level row per cycle (per-Tech-ED budgets live in
// Budget_Distribution).
const BM = insert('Budget_Master', { appraisal_cycle_id: cAct.ROWID, budget_percentage: 8, org_budget_base: 1000000, status: 'Active' });

/* ------------------------------------------------------------------ */
/* Functions                                                           */
/* ------------------------------------------------------------------ */
const CORES = FUNCS.map((f) => require(path.join(FN_ROOT, f, 'accessCore.js')));
const resetCaches = () => CORES.forEach((c) => c.resetCache());
const NEW = {};
async function serve(handler) {
  const server = http.createServer((req, res) => {
    Promise.resolve(handler(req, res)).catch((e) => { if (!res.headersSent) { res.statusCode = 599; res.end(JSON.stringify({ unhandled: e.message })); } });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  return { base: 'http://127.0.0.1:' + server.address().port, server };
}

/* ------------------------------------------------------------------ */
/* Harness                                                             */
/* ------------------------------------------------------------------ */
const LOGS = [];
const orig = { log: console.log, warn: console.warn, error: console.error };
const capture = (...a) => LOGS.push(a.map((x) => (typeof x === 'string' ? x : (x && x.message) || JSON.stringify(x))).join(' '));
console.log = capture; console.warn = capture; console.error = capture;
const out = (...a) => orig.log(...a);
process.on('unhandledRejection', (e) => LOGS.push('UNHANDLED ' + (e && e.message)));

const U = {
  hr: { email: 'hr@x.com', role: 'HR' }, ashok: { email: 'ashok@x.com' }, priya: { email: 'priya@x.com' },
  b: { email: 'b@x.com' }, nobody: { email: 'nobody@x.com' }, anon: null
};
async function call(target, method, url, who, body) {
  const headers = { 'content-type': 'application/json' };
  if (who) { headers['x-user-email'] = who.email; headers['x-user-role'] = who.role || 'App User'; }
  const r = await fetch(target.base + url, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text }; }
  return { status: r.status, body: json };
}
const fnCall = (fn) => (method, url, who, body) => call(NEW[fn], method, url, who, body);
const EMP = fnCall('employeesapi'), MASTER = fnCall('employeemasterapi'), HIST = fnCall('appraisalhistoryapi'),
  AUDIT = fnCall('appraisalauditapi'), PAY = fnCall('payrollcycleapi'), BUDGET = fnCall('budgetmasterapi');
const ids = (r) => (r.body.data || []).map((x) => x.emp_id).sort();
const row = (t, f) => tbl(t).find(f);
const version = () => Number((tbl('AccessVersion')[0] || {}).version || 1);
const results = [];
async function test(name, fn) {
  try { await fn(); results.push(['PASS', name]); out('PASS', name); }
  catch (e) { results.push(['FAIL', name]); out('FAIL', name, '\n   ', e && e.stack ? e.stack.split('\n').slice(0, 4).join('\n    ') : e); }
}
function snapshot() { return { db: JSON.parse(JSON.stringify(DB)), nextId }; }
function restore(s) { DB = JSON.parse(JSON.stringify(s.db)); nextId = s.nextId; resetCaches(); }
/* Dry run: the request is not refused by the access layer, and the denial
   enforcement would have made is logged. Data is put back afterwards. */
async function dryRunLogs(fn, method, url, who, body, wouldDeny) {
  const s = snapshot();
  const from = LOGS.length;
  const r = await call(NEW[fn], method, url, who, body);
  const logs = LOGS.slice(from).filter((l) => l.startsWith('ACCESS'));
  restore(s);
  const tag = fn + ' ' + method + ' ' + url + ' as ' + (who ? who.email : 'anonymous');
  assert.ok(!(r.body && r.body.enforced === true), tag + ': answered as enforced ' + JSON.stringify(r.body));
  assert.ok(logs.some((l) => l.startsWith('ACCESS dry-run: would deny ' + wouldDeny)), tag + ': no would-deny log in ' + JSON.stringify(logs));
  return r;
}

(async () => {
  for (const fn of FUNCS) {
    NEW[fn] = await serve(require(path.join(FN_ROOT, fn, 'index.js')));
  }

  /* ================= ENFORCED ================= */
  process.env.ACCESS_ENFORCE = 'true';
  resetCaches();
  const start = snapshot();

  await test('employeesapi GET: HR all rows; Tech ED / Comp Mgr only their scope, counts scoped', async () => {
    const h = await EMP('GET', '/?page=1&limit=100', U.hr);
    assert.strictEqual(h.status, 200, JSON.stringify(h.body)); assert.strictEqual(h.body.data.length, 5); assert.strictEqual(h.body.counts.total, 5);
    assert.strictEqual(h.body.enforced, undefined);
    const t = await EMP('GET', '/?page=1&limit=100', U.ashok);
    assert.strictEqual(t.status, 200); assert.deepStrictEqual(ids(t), ['EMP0100', 'EMP0101', 'EMP0102']);
    assert.strictEqual(t.body.counts.total, 3); assert.strictEqual(t.body.pagination.totalCount, 3);
    const p = await EMP('GET', '/?page=1&limit=2', U.priya);
    assert.strictEqual(p.body.pagination.totalCount, 3); assert.strictEqual(p.body.pagination.totalPages, 2); assert.strictEqual(p.body.counts.total, 3);
    const p2 = await EMP('GET', '/?page=1&limit=100', U.priya);
    assert.deepStrictEqual(ids(p2), ['EMP0100', 'EMP0101', 'EMP0103']);
  });

  await test('employeesapi GET: hidden columns removed (Comp Mgr: hike_amount + paired hike_pct); read columns kept', async () => {
    const p = await EMP('GET', '/?page=1&limit=100', U.priya);
    p.body.data.forEach((r) => { assert.ok(!('hike_amount' in r) && !('hike_pct' in r), JSON.stringify(r)); assert.ok('new_rb' in r && 'name' in r); });
    const t = await EMP('GET', '/?page=1&limit=100', U.ashok);
    t.body.data.forEach((r) => assert.ok('hike_amount' in r && 'new_rb' in r));
  });

  await test('employeesapi GET: 401 anonymous, 403 not in Employee Master / no role; roster views and out-of-scope emp_id refused', async () => {
    assert.strictEqual((await EMP('GET', '/', U.anon)).status, 401);
    const n = await EMP('GET', '/', U.nobody);
    assert.strictEqual(n.status, 403); assert.strictEqual(n.body.success, false); assert.match(n.body.message, /Employee Master/);
    assert.strictEqual((await EMP('GET', '/', U.b)).status, 403);
    assert.strictEqual((await EMP('GET', '/?view=master', U.ashok)).status, 403);
    assert.strictEqual((await EMP('GET', '/?view=eligibility', U.hr)).status, 200);
    assert.strictEqual((await EMP('GET', '/?emp_id=EMP0104', U.ashok)).status, 403);
    assert.strictEqual((await EMP('GET', '/?emp_id=EMP0100', U.ashok)).status, 200);
  });

  await test('employeesapi PATCH: in-scope editable column ok; read-only / hidden / out-of-scope / hierarchy / status refused, nothing written', async () => {
    const ok = await EMP('PATCH', '/', U.ashok, { emp_id: 'EMP0100', hike_amount: 555 });
    assert.strictEqual(ok.status, 200, JSON.stringify(ok.body)); assert.strictEqual(row(SHEET, (r) => r.emp_id === 'EMP0100').hike_amount, 555);
    const before = JSON.stringify(tbl(SHEET));
    const ro = await EMP('PATCH', '/', U.ashok, { emp_id: 'EMP0100', new_rb: 1 });
    assert.strictEqual(ro.status, 403); assert.match(ro.body.message, /new_rb/);
    assert.strictEqual((await EMP('PATCH', '/', U.ashok, { emp_id: 'EMP0104', hike_amount: 1 })).status, 403);
    assert.strictEqual((await EMP('PUT', '/', U.ashok, { emp_id: 'EMP0100', comp_manager: 'Someone' })).status, 403);
    assert.strictEqual((await EMP('PATCH', '/', U.ashok, { emp_id: 'EMP0100', status: 'Inactive' })).status, 403);
    assert.strictEqual((await EMP('PATCH', '/', U.ashok, { emp_id: 'EMP0100', eligible_status: 'Not Eligible' })).status, 403);
    assert.strictEqual((await EMP('PATCH', '/', U.priya, { emp_id: 'EMP0100', hike_amount: 1 })).status, 403, 'hidden field not editable');
    assert.strictEqual(JSON.stringify(tbl(SHEET)), before);
    assert.strictEqual((await EMP('PATCH', '/', U.priya, { emp_id: 'EMP0103', new_rb: 2 })).status, 200);
  });

  await test('employeesapi PATCH by HR: hierarchy + status allowed and raise the access version', async () => {
    const v0 = version();
    const r = await EMP('PATCH', '/', U.hr, { emp_id: 'EMP0101', comp_manager: 'Neha Rao' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.body)); assert.strictEqual(version(), v0 + 1);
    const s = await EMP('PATCH', '/', U.hr, { emp_id: 'EMP0102', status: 'Inactive' });
    assert.strictEqual(s.status, 200, JSON.stringify(s.body)); assert.strictEqual(version(), v0 + 2);
    assert.strictEqual(row(EM, (x) => x.emp_id === 'EMP0102').emp_status, 'Inactive');
    restore(start);
  });

  await test('employeesapi POST bulk upsert: HR only (Tech ED refused even in scope); HR creates and raises the access version', async () => {
    // Bulk upsert of Appraisal_Sheet rows is HR only (Tech ED edits go
    // through PATCH, cell by cell). Nothing is written for a refused request.
    const before = JSON.stringify(tbl(SHEET));
    assert.strictEqual((await EMP('POST', '/', U.ashok, { employees: [{ emp_id: 'EMP0100', hike_amount: 9 }, { emp_id: 'EMP0101', hike_amount: 8 }] })).status, 403);
    assert.strictEqual(JSON.stringify(tbl(SHEET)), before);
    const n = tbl(SHEET).length;
    assert.strictEqual((await EMP('POST', '/', U.ashok, { employees: [{ emp_id: 'EMP0100', hike_amount: 1 }, { emp_id: 'EMP0104', hike_amount: 1 }] })).status, 403);
    assert.strictEqual((await EMP('POST', '/', U.ashok, { employees: [{ emp_id: 'EMP0100', name: 'Renamed' }] })).status, 403);
    assert.strictEqual((await EMP('POST', '/', U.ashok, { employees: [{ emp_id: 'EMP0100', new_rb: 3 }] })).status, 403);
    assert.strictEqual((await EMP('POST', '/', U.ashok, { emp_id: 'EMP0999', hike_amount: 1 })).status, 403);
    assert.strictEqual(tbl(SHEET).length, n);
    const v0 = version();
    const hr = await EMP('POST', '/', U.hr, { employees: [{ emp_id: 'EMP0105', name: 'New Joiner' }] });
    assert.strictEqual(hr.status, 200); assert.strictEqual(hr.body.data.created, 1); assert.strictEqual(version(), v0 + 1);
    restore(start);
  });

  await test('employeemasterapi: HR only (GET view, writes edit); HR write raises the access version', async () => {
    const h = await MASTER('GET', '/?page=1&limit=100', U.hr);
    assert.strictEqual(h.status, 200, JSON.stringify(h.body)); assert.strictEqual(h.body.data.length, 9); assert.strictEqual(h.body.counts.total, 9);
    assert.strictEqual((await MASTER('GET', '/', U.ashok)).status, 403);
    assert.strictEqual((await MASTER('GET', '/', U.anon)).status, 401);
    assert.strictEqual((await MASTER('PUT', '/', U.ashok, { emp_id: 'EMP0101', emp_name: 'X' })).status, 403);
    assert.strictEqual((await MASTER('POST', '/', U.priya, { employees: [{ emp_id: 'EMP0101' }] })).status, 403);
    const v0 = version();
    const w = await MASTER('PUT', '/', U.hr, { emp_id: 'EMP0101', emp_name: 'Emp A2 Renamed' });
    assert.strictEqual(w.status, 200, JSON.stringify(w.body)); assert.strictEqual(version(), v0 + 1);
    restore(start);
  });

  await test('appraisalhistoryapi GET: scope + hidden history columns removed', async () => {
    const t = await HIST('GET', '/?emp_id=EMP0100', U.ashok);
    assert.strictEqual(t.status, 200); assert.strictEqual(t.body.count, 1); assert.strictEqual(t.body.data[0].hike_amount, 100);
    const p = await HIST('GET', '/?emp_id=EMP0100', U.priya);
    assert.strictEqual(p.status, 200); assert.ok(!('hike_amount' in p.body.data[0]) && !('hike_pct' in p.body.data[0])); assert.strictEqual(p.body.data[0].base_pay, 1000);
    assert.strictEqual((await HIST('GET', '/?emp_id=EMP0104', U.ashok)).status, 403);
    assert.strictEqual((await HIST('GET', '/?emp_id=EMP0100', U.nobody)).status, 403);
    assert.strictEqual((await HIST('GET', '/?emp_id=EMP0104', U.hr)).status, 200);
  });

  await test('appraisalhistoryapi PATCH: mapped editable ok; read-only / master / out-of-scope refused; unmapped needs sheet edit', async () => {
    const P = (who, b) => HIST('PATCH', '/', who, Object.assign({ appraisal_year: 'Apr-26' }, b));
    assert.strictEqual((await P(U.ashok, { emp_id: 'EMP0100', hike_amount: 1 })).status, 200);
    assert.strictEqual((await P(U.ashok, { emp_id: 'EMP0100', retention_bonus: 1 })).status, 403);   // newRB read
    assert.strictEqual((await P(U.ashok, { emp_id: 'EMP0100', base_pay: 1 })).status, 403);          // master field
    assert.strictEqual((await P(U.priya, { emp_id: 'EMP0100', hike_pct: 1 })).status, 403);          // hidden pair
    assert.strictEqual((await P(U.ashok, { emp_id: 'EMP0104', hike_amount: 1 })).status, 403);
    assert.strictEqual((await P(U.ashok, { emp_id: 'EMP0100', rating: 'A' })).status, 200);          // unmapped
    assert.strictEqual((await P(U.hr, { emp_id: 'EMP0100', base_pay: 2000 })).status, 200);
    assert.strictEqual(row('Payroll_Data', (r) => r.emp_id === 'EMP0100').base_pay, 2000);
    restore(start);
  });

  await test('appraisalauditapi: list for any appraisal user, rows in scope only (CYCLE rows HR only); POST scope + changed_by from login', async () => {
    const h = await AUDIT('GET', '/?limit=500', U.hr);
    assert.strictEqual(h.status, 200); assert.strictEqual(h.body.total, 3);
    const t = await AUDIT('GET', '/?limit=500', U.ashok);
    assert.strictEqual(t.status, 200); assert.deepStrictEqual(t.body.data.map((x) => x.emp_id), ['EMP0100']); assert.strictEqual(t.body.total, 1);
    // A Comp Manager loads their own team's history too (no CYCLE / other rows).
    const p = await AUDIT('GET', '/?limit=500', U.priya);
    assert.strictEqual(p.status, 200); assert.deepStrictEqual(p.body.data.map((x) => x.emp_id), ['EMP0100']);
    assert.strictEqual((await AUDIT('GET', '/', U.b)).status, 403);                                   // no role
    assert.strictEqual((await AUDIT('GET', '/?emp_id=EMP0104', U.ashok)).status, 403);
    const w = await AUDIT('POST', '/', U.priya, [{ emp_id: 'EMP0100', field_name: 'hike_amount', new_value: '3', changed_by: 'spoofed' }]);
    assert.strictEqual(w.status, 200, JSON.stringify(w.body)); assert.strictEqual(w.body.data[0].changed_by, 'priya@x.com');
    assert.strictEqual((await AUDIT('POST', '/', U.ashok, [{ emp_id: 'CYCLE', field_name: 'x' }])).status, 403);
    assert.strictEqual((await AUDIT('POST', '/', U.ashok, [{ emp_id: 'EMP0100', field_name: 'x' }, { emp_id: 'EMP0104', field_name: 'x' }])).status, 403);
    assert.strictEqual((await AUDIT('POST', '/', U.hr, [{ emp_id: 'CYCLE', field_name: 'x' }])).status, 200);
    restore(start);
  });

  await test('payrollcycleapi: session/cycles for any role; payroll HR only; cycle admin HR only', async () => {
    const s = await PAY('GET', '/?resource=session', U.ashok);
    assert.strictEqual(s.status, 200); assert.strictEqual(s.body.data.email, 'ashok@x.com');
    assert.strictEqual((await PAY('GET', '/?resource=cycles', U.priya)).status, 200);
    for (const r of ['payroll', 'audit', 'history']) assert.strictEqual((await PAY('GET', '/?resource=' + r, U.ashok)).status, 403, r);
    assert.strictEqual((await PAY('POST', '/?resource=validate', U.priya, {})).status, 403);
    assert.strictEqual((await PAY('POST', '/?resource=cycles/create', U.ashok, { name: 'X', start: '2030-01-01', end: '2030-12-31' })).status, 403);
    // session answers any signed-in user with their own identity only.
    const ns = await PAY('GET', '/?resource=session', U.nobody);
    assert.strictEqual(ns.status, 200); assert.deepStrictEqual(Object.keys(ns.body.data).sort(), ['email', 'id', 'name', 'role']);
    assert.strictEqual(ns.body.data.email, 'nobody@x.com');
    assert.strictEqual((await PAY('GET', '/?resource=payroll', U.nobody)).status, 403);
    assert.strictEqual((await PAY('GET', '/?resource=session', U.anon)).status, 401);
    const p = await PAY('GET', '/?resource=payroll', U.hr);
    assert.strictEqual(p.status, 200); assert.strictEqual(p.body.data.length, 2);
    const c = await PAY('POST', '/?resource=cycles/create', U.hr, { name: 'FY2031', start: '2031-04-01', end: '2032-03-31' });
    assert.strictEqual(c.status, 201, JSON.stringify(c.body));
    const bad = await PAY('POST', '/?resource=validate', U.hr, {});
    assert.strictEqual(bad.status, 400, 'ApiError from routeRequest is answered (was an unhandled rejection)');
    restore(start);
  });

  await test('budgetmasterapi: Budget Master readable by roles, 401/403 otherwise; only HR changes it (PUT body parsed)', async () => {
    const h = await BUDGET('GET', '/', U.hr);
    assert.strictEqual(h.status, 200, JSON.stringify(h.body)); assert.ok((h.body.master || []).some((r) => r.id === BM.ROWID), JSON.stringify(h.body.master));
    assert.strictEqual((await BUDGET('GET', '/', U.ashok)).status, 200);
    assert.strictEqual((await BUDGET('GET', '/', U.b)).status, 403);
    assert.strictEqual((await BUDGET('GET', '/', U.anon)).status, 401);
    const before = JSON.stringify(tbl('Budget_Master'));
    for (const who of [U.ashok, U.priya]) {
      const r = await BUDGET('PUT', '/', who, { resource: 'master', id: BM.ROWID, budget_percentage: 9 });
      assert.strictEqual(r.status, 403, who.email + ' ' + JSON.stringify(r.body));
    }
    assert.strictEqual(JSON.stringify(tbl('Budget_Master')), before);
    const hr = await BUDGET('PUT', '/', U.hr, { resource: 'master', id: BM.ROWID, budget_percentage: 9 });
    assert.strictEqual(hr.status, 200, JSON.stringify(hr.body));
    assert.strictEqual(Number(row('Budget_Master', (r) => r.ROWID === BM.ROWID).budget_percentage), 9);
    restore(start);
  });

  /* ================= DRY RUN ================= */
  delete process.env.ACCESS_ENFORCE;
  resetCaches();

  await test('dry run: requests enforcement would refuse are logged as would-deny, not refused', async () => {
    await dryRunLogs('employeesapi', 'GET', '/?page=1&limit=100', U.nobody, undefined, 'nobody@x.com');
    await dryRunLogs('employeemasterapi', 'GET', '/', U.ashok, undefined, 'ashok@x.com');
    await dryRunLogs('budgetmasterapi', 'GET', '/', U.b, undefined, 'b@x.com');
  });

  for (const fn of FUNCS) NEW[fn].server.close();
  if (LOGS.some((l) => l.startsWith('UNHANDLED'))) out('note: unhandled rejections:', LOGS.filter((l) => l.startsWith('UNHANDLED')).join(' | '));
  const failed = results.filter((r) => r[0] === 'FAIL').length;
  out('\n' + (results.length - failed) + ' passed, ' + failed + ' failed');
  process.exit(failed ? 1 : 0);
})().catch((e) => { orig.error(e); process.exit(1); });
