/* Location-wise appraisal cycles (payrollcycleapi).
   A cycle is for one Location Master location or for All Locations; Apply
   Criteria and Add An Employee only use that location's employees.
   In-memory Data Store. Run: node test/cycle-location.test.js */
'use strict';

const assert = require('assert');
const Module = require('module');
const path = require('path');

const T = {
  cycles: '74008000000034190',
  employeeMaster: '74008000000035727',
  eligibility: '74008000000057046',
  locations: '74008000000022481',
};
const CYCLE_COLUMNS = ['cycle_name', 'start_date', 'end_date', 'status', 'remarks', 'changed_by', 'changed_at', 'archived',
  'cycle_type', 'process', 'effective_date', 'cancel_reason', 'location'];

function makeStore(cycleColumns) {
  let seq = 1000;
  const tables = {};
  const table = (id) => {
    if (tables[id]) return tables[id];
    const cols = id === T.cycles ? cycleColumns : null;
    const rows = [];
    const check = (row) => Object.keys(row).forEach((k) => {
      if (k !== 'ROWID' && cols && !cols.includes(k)) throw new Error(`Invalid column ${k}`);
    });
    tables[id] = {
      rows,
      getAllColumns: async () => (cols || []).map((c) => ({ column_name: c })),
      getPagedRows: async () => ({ data: rows.map((r) => ({ ...r })), more_records: false }),
      insertRow: async (row) => { check(row); const r = { ...row, ROWID: String(++seq) }; rows.push(r); return { ...r }; },
      insertRows: async (list) => Promise.all(list.map((row) => tables[id].insertRow(row))),
      updateRow: async (row) => { check(row); const r = rows.find((x) => x.ROWID === String(row.ROWID)); Object.assign(r, row); return { ...r }; },
      updateRows: async (list) => Promise.all(list.map((row) => tables[id].updateRow(row))),
      deleteRow: async (id2) => { const i = rows.findIndex((x) => x.ROWID === String(id2)); if (i > -1) rows.splice(i, 1); return true; },
      deleteRows: async (ids) => { ids.forEach((id2) => tables[id].deleteRow(id2)); return true; },
    };
    return tables[id];
  };
  // Location Master and Employee Master data.
  table(T.locations).rows.push(
    { ROWID: '1', location_name: 'India', location_code: 'IND', status: 'Active' },
    { ROWID: '2', location_name: 'Dubai', location_code: 'DXB', status: 'Active' },
    { ROWID: '3', location_name: 'Canada', location_code: 'CAN', status: 'Inactive' },
  );
  table(T.employeeMaster).rows.push(
    { ROWID: '11', emp_id: 'EMP001', emp_name: 'A', location: 'India', emp_status: 'Active', joining_date: '2020-01-01' },
    { ROWID: '12', emp_id: 'EMP002', emp_name: 'B', location: 'Dubai', emp_status: 'Active', joining_date: '2020-01-01' },
    { ROWID: '13', emp_id: 'EMP003', emp_name: 'C', location: 'dubai', emp_status: 'Active', joining_date: '2020-01-01' },
  );
  return { tables, table };
}

function load(store) {
  const dir = path.resolve(__dirname, '..');
  Object.keys(require.cache).forEach((k) => { if (k.startsWith(dir) && !k.includes('node_modules')) delete require.cache[k]; });
  const catalystStub = {
    initialize: () => ({
      datastore: () => ({ table: (id) => store.table(id) }),
      zcql: () => ({
        // Employee_Master rows whose email_id is named in the query (session home location).
        executeZCQLQuery: async (query) =>
          /FROM Employee_Master/.test(query)
            ? store.table(T.employeeMaster).rows
              .filter((r) => r.email_id && query.includes("'" + r.email_id + "'"))
              .map((r) => ({ Employee_Master: { emp_id: r.emp_id, location: r.location, emp_status: r.emp_status } }))
            : [],
      }),
      userManagement: () => ({
        getCurrentUser: async () => ({ user_id: '1', first_name: 'H', last_name: 'R', email_id: 'hr@x.com', role_details: { role_name: 'HR' } }),
      }),
    }),
  };
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const accessStub = {
    HttpError,
    check: async () => ({ dryRun: true, enforced: false }),
    isEnforced: () => false,
    guard: (a, fn) => fn(),
    requireScreen: () => {},
    requireEditFields: () => {},
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
    const req = { method, url: '/?resource=' + encodeURIComponent(resource), body: body || (method === 'POST' ? {} : undefined), on() {} };
    const res = { status: 0, writeHead(s) { this.status = s; }, setHeader() {}, end(text) { resolve({ status: this.status, json: JSON.parse(text) }); } };
    api(req, res).catch(reject);
  });
}

const iso = (offsetDays) => new Date(Date.now() + offsetDays * 864e5).toISOString().slice(0, 10);
let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); }
}

(async () => {
  const store = makeStore(CYCLE_COLUMNS);
  const api = load(store);
  const post = (r, b) => call(api, 'POST', r, b);
  const cycles = async () => (await call(api, 'GET', 'cycles')).json.data;
  const byName = async (n) => (await cycles()).find((c) => c.name === n);
  const dates = { process: 'Annual', type: 'Annual', effective: iso(1), start: iso(1), end: iso(60) };

  await t('create with a location saves the Location Master name (matched by code)', async () => {
    const r = await post('cycles/create', { ...dates, name: 'Annual 2027 Dubai', location: 'dxb' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.json));
    assert.strictEqual(r.json.data.location, 'Dubai');
    assert.strictEqual((await byName('Annual 2027 Dubai')).location, 'Dubai');
  });

  await t('"<Location> - <Type> <Year>" names: the type is read after the location', async () => {
    // No type/process sent: the server derives them from the name.
    const r = await post('cycles/create', { name: 'Dubai - New Joiner 2027', effective: iso(2), location: 'Dubai' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.json));
    const c = await byName('Dubai - New Joiner 2027');
    assert.strictEqual(c.type, 'New Joiner');
    assert.strictEqual(c.process, 'None');
  });

  await t('All Locations is saved as All', async () => {
    const r = await post('cycles/create', { ...dates, name: 'Annual 2027 Org', location: 'All Locations' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.json));
    assert.strictEqual(r.json.data.location, 'All');
  });

  await t('no location sent (older callers) = All Locations', async () => {
    const r = await post('cycles/create', { ...dates, name: 'Annual 2027 Legacy' });
    assert.strictEqual(r.status, 201, JSON.stringify(r.json));
    assert.strictEqual(r.json.data.location, 'All');
  });

  await t('an empty, unknown or inactive location is refused', async () => {
    const empty = await post('cycles/create', { ...dates, name: 'X1', location: '' });
    assert.strictEqual(empty.status, 400);
    assert.match(empty.json.message, /Select the location/);
    const unknown = await post('cycles/create', { ...dates, name: 'X2', location: 'Mars' });
    assert.strictEqual(unknown.status, 400);
    assert.match(unknown.json.message, /not a location/);
    const inactive = await post('cycles/create', { ...dates, name: 'X3', location: 'Canada' });
    assert.strictEqual(inactive.status, 400);
    assert.match(inactive.json.message, /inactive/);
  });

  await t('the location can be changed while Upcoming', async () => {
    const c = await byName('Annual 2027 Legacy');
    const r = await post('cycles/update/' + c.id, { ...dates, name: c.name, location: 'India' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual((await byName('Annual 2027 Legacy')).location, 'India');
  });

  await t('editing without sending a location keeps it', async () => {
    const c = await byName('Annual 2027 Legacy');
    const r = await post('cycles/update/' + c.id, { ...dates, name: c.name, end: iso(61) });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual((await byName('Annual 2027 Legacy')).location, 'India');
  });

  await t('different locations can have Active cycles at the same time', async () => {
    const dubai = await byName('Annual 2027 Dubai');
    const india = await byName('Annual 2027 Legacy');
    assert.strictEqual(dubai.status, 'Upcoming');
    const dubaiActive = await post('cycles/status/' + dubai.id, { status: 'Active' });
    assert.strictEqual(dubaiActive.status, 200, JSON.stringify(dubaiActive.json));
    const indiaActive = await post('cycles/status/' + india.id, { status: 'Active' });
    assert.strictEqual(indiaActive.status, 200, JSON.stringify(indiaActive.json));
    const current = await cycles();
    assert.strictEqual(current.find((x) => x.id === dubai.id).status, 'Active');
    assert.strictEqual(current.find((x) => x.id === india.id).status, 'Active');
  });

  await t('a second Active cycle in the same location remains blocked', async () => {
    const dubai = await byName('Annual 2027 Dubai');
    const r = await post('cycles/status/' + dubai.id, { status: 'Closed' });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const reopened = await post('cycles/status/' + dubai.id, { status: 'Active' });
    assert.strictEqual(reopened.status, 200, JSON.stringify(reopened.json));
    const duplicate = await post('cycles/create', { ...dates, name: 'Dubai - Annual 2028', location: 'Dubai' });
    assert.strictEqual(duplicate.status, 201, JSON.stringify(duplicate.json));
    const activateDuplicate = await post('cycles/status/' + duplicate.json.data.id, { status: 'Active' });
    assert.strictEqual(activateDuplicate.status, 409);
    assert.match(activateDuplicate.json.message, /Annual 2027 Dubai/);
  });

  await t('the location is fixed once the cycle is Active', async () => {
    const c = await byName('Annual 2027 Dubai');
    if (c.status === 'Active') {
      const close = await post('cycles/status/' + c.id, { status: 'Closed' });
      assert.strictEqual(close.status, 200, JSON.stringify(close.json));
    }
    const act = await post('cycles/status/' + c.id, { status: 'Active' });
    assert.strictEqual(act.status, 200, JSON.stringify(act.json));
    const r = await post('cycles/update/' + c.id, { ...dates, name: c.name, location: 'India' });
    assert.strictEqual(r.status, 409);
    assert.match(r.json.message, /only be changed while the cycle is Upcoming/);
  });

  await t('legacy All Locations cycle blocks every location until it is Closed', async () => {
    const allLocations = await byName('Annual 2027 Org');
    const india = await byName('Annual 2027 Legacy');
    for (const active of (await cycles()).filter((item) => item.status === 'Active')) {
      const closed = await post('cycles/status/' + active.id, { status: 'Closed' });
      assert.strictEqual(closed.status, 200, JSON.stringify(closed.json));
    }
    const allActive = await post('cycles/status/' + allLocations.id, { status: 'Active' });
    assert.strictEqual(allActive.status, 200, JSON.stringify(allActive.json));
    const blockedIndia = await post('cycles/status/' + india.id, { status: 'Active' });
    assert.strictEqual(blockedIndia.status, 409);
    assert.match(blockedIndia.json.message, /Annual 2027 Org/);
    const closeAll = await post('cycles/status/' + allLocations.id, { status: 'Closed' });
    assert.strictEqual(closeAll.status, 200, JSON.stringify(closeAll.json));
    const activateIndia = await post('cycles/status/' + india.id, { status: 'Active' });
    assert.strictEqual(activateIndia.status, 200, JSON.stringify(activateIndia.json));
  });

  await t('Apply Criteria lists only the cycle location\'s employees', async () => {
    // Employee Master may store a Location Master code instead of its display name.
    store.tables[T.employeeMaster].rows.find((row) => row.emp_id === 'EMP002').location = 'DXB';
    const c = await byName('Annual 2027 Dubai');
    if (c.status !== 'Active') {
      const activated = await post('cycles/status/' + c.id, { status: 'Active' });
      assert.strictEqual(activated.status, 200, JSON.stringify(activated.json));
    }
    const r = await call(api, 'POST', 'eligibility', { action: 'apply-criteria', cycleId: c.id });
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    const listed = store.tables[T.eligibility].rows
      .filter((row) => row.appraisal_cycle_id === c.id)
      .map((row) => row.emp_id)
      .sort();
    assert.deepStrictEqual(listed, ['EMP002', 'EMP003']);
  });

  await t('an employee from another location cannot be added by hand', async () => {
    const c = await byName('Annual 2027 Dubai');
    const r = await call(api, 'POST', 'eligibility', { cycleId: c.id, empId: 'EMP001', eligible: 'Eligible' });
    assert.strictEqual(r.status, 409, JSON.stringify(r.json));
    assert.match(r.json.message, /works in India; this cycle is for Dubai/);
  });

  await t('session returns the signed-in user\'s Employee Master location (Active row wins)', async () => {
    const rows = store.table(T.employeeMaster).rows;
    rows.push(
      { ROWID: '21', emp_id: 'EMP900', emp_name: 'HR old', location: 'Dubai', emp_status: 'Inactive', email_id: 'hr@x.com' },
      { ROWID: '22', emp_id: 'EMP901', emp_name: 'HR', location: 'India', emp_status: 'Active', email_id: 'hr@x.com' },
    );
    const r = await call(api, 'GET', 'session');
    assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    assert.strictEqual(r.json.data.location, 'India');
    assert.strictEqual(r.json.data.empId, 'EMP901');
    rows.splice(rows.length - 2, 2);
    const none = await call(api, 'GET', 'session');
    assert.strictEqual(none.json.data.location, '');
  });

  await t('without a location column, sending a location is refused instead of silently dropped', async () => {
    const store2 = makeStore(CYCLE_COLUMNS.filter((c) => c !== 'location'));
    const api2 = load(store2);
    const r = await call(api2, 'POST', 'cycles/create', { ...dates, name: 'NoCol', location: 'Dubai' });
    assert.strictEqual(r.status, 400);
    assert.match(r.json.message, /no location column/);
  });

  await t('All Locations selects its own cycle and closes independently from location cycles', async () => {
    const store2 = makeStore(CYCLE_COLUMNS);
    const api2 = load(store2);
    const create = (name, location) =>
      call(api2, 'POST', 'cycles/create', { ...dates, name, location });
    const global = await create('Annual 2032', 'All');
    const india = await create('India - Annual 2032', 'India');
    assert.strictEqual(global.status, 201, JSON.stringify(global.json));
    assert.strictEqual(india.status, 201, JSON.stringify(india.json));

    const globalId = global.json.data.id;
    const indiaId = india.json.data.id;
    assert.strictEqual((await call(api2, 'POST', 'cycles/status/' + globalId, { status: 'Active' })).status, 200);
    assert.strictEqual((await call(api2, 'POST', 'cycles/status/' + indiaId, { status: 'Active' })).status, 200);

    const eligibility = await new Promise((resolve, reject) => {
      const req = { method: 'GET', url: '/?resource=eligibility&location=All', on() {} };
      const res = {
        status: 0,
        writeHead(status) { this.status = status; },
        end(text) { resolve({ status: this.status, json: JSON.parse(text) }); },
      };
      api2(req, res).catch(reject);
    });
    assert.strictEqual(eligibility.status, 200, JSON.stringify(eligibility.json));
    assert.strictEqual(eligibility.json.data.meta.cycleId, globalId);
    assert.ok(eligibility.json.data.records.every((row) => row.appraisalCycleId === globalId));

    assert.strictEqual((await call(api2, 'POST', 'cycles/status/' + globalId, { status: 'Closed' })).status, 200);
    const currentCycles = (await call(api2, 'GET', 'cycles')).json.data;
    assert.strictEqual(currentCycles.find((cycle) => cycle.id === indiaId).status, 'Active');
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
