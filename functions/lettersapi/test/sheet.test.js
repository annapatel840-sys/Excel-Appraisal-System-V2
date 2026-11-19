// Run with:  node --test functions/lettersapi/test
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const make = require("../lettersSheet.js");

const fail = (status, message) => Object.assign(new Error(message), { status });
const text = (v) => String(v ?? "").trim();

function fakeApp() {
  const master = [];
  const sheet = [];
  for (let i = 1; i <= 700; i += 1) {
    master.push({ ROWID: String(1000 + i), emp_id: "E" + i, emp_name: "N" + i, email_id: `e${i}@x`, location: i <= 500 ? "Dubai" : "India", emp_status: "Active" });
  }
  let rid = 1;
  for (let i = 1; i <= 700; i += 1) sheet.push({ ROWID: String(rid++), emp_id: "E" + i, cycle_id: "5", hike_amount: 100 });
  for (let i = 1; i <= 900; i += 1) sheet.push({ ROWID: String(rid++), emp_id: "E" + ((i % 700) + 1), cycle_id: "4" });
  const queries = [];
  const app = {
    zcql: () => ({
      executeZCQLQuery: async (sql) => {
        queries.push(sql);
        if (/COUNT\(ROWID\) FROM Appraisal_Sheet/.test(sql)) return [{ Appraisal_Sheet: { "COUNT(ROWID)": "700" } }];
        if (/ORDER BY MODIFIEDTIME/.test(sql)) return [{ Appraisal_Sheet: { ROWID: "700", MODIFIEDTIME: "t1" } }];
        if (/FROM Appraisal_Cycle_Master WHERE ROWID > 0/.test(sql)) {
          return [
            { Appraisal_Cycle_Master: { ROWID: "5", cycle_name: "Dubai - Annual 2027", location: "Dubai", status: "Active" } },
            { Appraisal_Cycle_Master: { ROWID: "4", cycle_name: "Old", location: "Dubai", status: "Closed" } },
            { Appraisal_Cycle_Master: { ROWID: "6", cycle_name: "Hidden", location: "India", status: "Active", hidden: "true" } },
            { Appraisal_Cycle_Master: { ROWID: "7", cycle_name: "India - Annual 2027", location: "India", status: "Active" } },
          ];
        }
        if (/FROM Appraisal_Cycle_Master/.test(sql)) return [{ Appraisal_Cycle_Master: { ROWID: "5", cycle_name: "Dubai - Annual 2027", location: "Dubai" } }];
        const table = /FROM (\w+)/.exec(sql)[1];
        const last = Number(/ROWID > (\d+)/.exec(sql)[1]);
        let rows = (table === "Employee_Master" ? master : sheet).filter((r) => Number(r.ROWID) > last);
        // Like the real table: cycle_id is a BIGINT lookup (number form only), and
        // there is no appraisal_cycle_id column.
        if (/AND appraisal_cycle_id/.test(sql)) throw new Error("Invalid column appraisal_cycle_id");
        if (/AND cycle_id = '/.test(sql)) throw new Error("cycle_id is a bigint: quoted value refused");
        const c = /AND cycle_id = (\d+)/.exec(sql);
        if (c) rows = rows.filter((r) => r.cycle_id === c[1]);
        const l = /AND location = '([^']+)'/.exec(sql);
        if (l) rows = rows.filter((r) => r.location === l[1]);
        return rows.slice(0, 300).map((r) => ({ [table]: r }));
      },
    }),
  };
  return { app, queries };
}

test("sheet: only the cycle's rows of the location are returned, with the master's details", async () => {
  const { app, queries } = fakeApp();
  const s = make({ fail, text });
  const d = await s.loadSheet(app, { cycleId: "5", location: "Dubai", page: "1", limit: "5000" });
  assert.equal(d.pagination.totalCount, 500);
  assert.equal(d.pagination.totalPages, 1);
  assert.equal(d.data.length, 500);
  assert.equal(d.data[0].name, "N1");
  assert.equal(d.data[0].location, "Dubai");
  assert.equal(d.data[0].hikeAmount, 100);
  // Appraisal_Sheet is only ever asked for this cycle (number form of cycle_id), never read whole.
  queries.filter((q) => /FROM Appraisal_Sheet/.test(q)).forEach((q) => assert.match(q, /cycle_id = (5|'5')/));
  assert.ok(queries.some((q) => /FROM Appraisal_Sheet WHERE ROWID > 0 AND cycle_id = 5 /.test(q)));
});

test("cycles: only Active, not hidden, cycles are listed", async () => {
  const { app } = fakeApp();
  const d = await make({ fail, text }).loadCycles(app);
  assert.deepEqual(d.cycles.map((c) => c.id), ["5", "7"]);
  assert.equal(d.cycles[0].location, "Dubai");
});

test("sheet: another location of the same cycle", async () => {
  const { app } = fakeApp();
  const d = await make({ fail, text }).loadSheet(app, { cycleId: "5", location: "India" });
  assert.equal(d.pagination.totalCount, 200);
});

test("sheet: page and limit slice the result like employeesapi", async () => {
  const { app } = fakeApp();
  const s = make({ fail, text });
  const p2 = await s.loadSheet(app, { cycleId: "5", location: "Dubai", page: "2", limit: "200" });
  assert.equal(p2.pagination.totalPages, 3);
  assert.equal(p2.data.length, 200);
  assert.equal(p2.data[0].empId, "E201");
  const last = await s.loadSheet(app, { cycleId: "5", location: "Dubai", page: "99", limit: "200" });
  assert.equal(last.pagination.page, 3);
  assert.equal(last.data.length, 100);
});

test("sheet: a cycle with no rows answers with an empty page, not an error", async () => {
  const { app } = fakeApp();
  const d = await make({ fail, text }).loadSheet(app, { cycleId: "5", location: "Nowhere" });
  assert.equal(d.pagination.totalCount, 0);
  assert.deepEqual(d.data, []);
});

test("sheet: a bad cycle id or paging position is refused", async () => {
  const { app } = fakeApp();
  const s = make({ fail, text });
  await assert.rejects(() => s.loadSheet(app, { cycleId: "5; DROP", location: "Dubai" }), /not valid/);
});
