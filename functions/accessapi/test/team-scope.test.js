/* Tech ED / Comp Manager teams follow Delegation: each employee has one Tech
   ED and one Comp Manager, from the cycle's Delegation row, else the cycle's
   Appraisal_Sheet row, else Employee_Master. A reassigned employee leaves the
   old manager's team. Run: node test/team-scope.test.js */
'use strict';

const assert = require('assert');
const A = require('../accessCore');

let TABLES;
function seed() {
  TABLES = {
    Employee_Master: [
      { ROWID: '1001', emp_id: 'EMP0051', emp_name: 'Ashok Kumar', email_id: 'ashok@x.com' },
      { ROWID: '1002', emp_id: 'EMP0052', emp_name: 'Meena Rao', email_id: 'meena@x.com' },
      { ROWID: '1003', emp_id: 'EMP001', emp_name: 'Old Manager', email_id: 'old@x.com' },
      { ROWID: '1004', emp_id: 'EMP0012', emp_name: 'New Manager', email_id: 'new@x.com' },
      // Employees. Employee_Master still holds the assignment from before the change.
      { ROWID: '2001', emp_id: 'EMP0100', emp_name: 'Moved', comp_manager: 'EMP001', appraiser_tech_ed: 'EMP0051 - Ashok Kumar' },
      { ROWID: '2002', emp_id: 'EMP0101', emp_name: 'Sheet Only', comp_manager: 'EMP001', appraiser_tech_ed: 'EMP0051' },
      { ROWID: '2003', emp_id: 'EMP0102', emp_name: 'Not Generated', comp_manager: 'EMP001 - Old Manager', appraiser_tech_ed: 'EMP0052 - Meena Rao' },
      { ROWID: '2004', emp_id: 'EMP0103', emp_name: 'By Email', comp_manager: 'new@x.com' },
    ],
    Delegation: [
      // EMP0100 reassigned EMP001 -> EMP0012; Delegation names the employee by ROWID.
      { ROWID: '3001', cycle_id: 'C27', emp_id: '2001', comp_manager: 'EMP0012', appraiser_tech_ed: 'EMP0052' },
      { ROWID: '3002', cycle_id: 'C26', emp_id: '2002', comp_manager: 'EMP0052', appraiser_tech_ed: 'EMP0052' },
    ],
    Appraisal_Sheet: [
      // Active cycle: sheet still shows the old Comp Manager for EMP0100.
      { ROWID: '4001', cycle_id: 'C27', emp_id: 'EMP0100', comp_manager: 'EMP001', appraiser_tech_ed: '1001' },
      // No Delegation row: the sheet decides. Tech ED is a lookup (ROWID 1002).
      { ROWID: '4002', cycle_id: 'C27', emp_id: 'EMP0101', comp_manager: 'EMP0012 - New Manager', appraiser_tech_ed: '1002' },
      // Last cycle's row: a past manager, never a source.
      { ROWID: '4003', cycle_id: 'C26', emp_id: 'EMP0101', comp_manager: 'EMP0051', appraiser_tech_ed: '1001' },
    ],
  };
}

const zcql = {
  executeZCQLQuery: async (sql) => {
    const m = /^SELECT \* FROM (\w+) WHERE (?:\((.*)\) AND )?ROWID > (\d+) ORDER BY ROWID ASC LIMIT (\d+)$/.exec(sql);
    if (!m) throw new Error('unexpected query: ' + sql);
    const [, table, where, after, limit] = m;
    const cond = where ? /^(\w+) = '([^']*)'$/.exec(where) : null;
    if (where && !cond) throw new Error('unexpected condition: ' + where);
    return (TABLES[table] || [])
      .filter((r) => BigInt(r.ROWID) > BigInt(after))
      .filter((r) => !cond || String(r[cond[1]]) === cond[2])
      .slice(0, Number(limit))
      .map((r) => ({ [table]: { ...r } }));
  },
};

const team = (deleg, key, managerId) => (deleg[key][A.norm(managerId)] || []).slice().sort();
const scopeFor = (deleg, role, empId) =>
  A.scopeOf({ deleg, cycleId: 'C27' }, { seesAll: false }, { role, teams: [] }, { empId });

let pass = 0, fail = 0;
async function t(name, fn) {
  try { seed(); await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', String(e.stack).split('\n').slice(0, 3).join(' | ')); }
}

(async () => {
  await t('a reassignment in Delegation moves the employee to the new Comp Manager only', async () => {
    const d = await A.loadDelegation(zcql, 'C27');
    assert.ok(team(d, 'teamCompMgr', 'EMP0012').includes('EMP0100'));
    assert.ok(!team(d, 'teamCompMgr', 'EMP001').includes('EMP0100'), 'old manager keeps no access');
    assert.ok(team(d, 'teamTechEd', 'EMP0052').includes('EMP0100'));
    assert.ok(!team(d, 'teamTechEd', 'EMP0051').includes('EMP0100'));
  });

  await t('without a Delegation row the active cycle sheet decides; last cycle is ignored', async () => {
    const d = await A.loadDelegation(zcql, 'C27');
    assert.ok(team(d, 'teamCompMgr', 'EMP0012').includes('EMP0101'));
    assert.ok(team(d, 'teamTechEd', 'EMP0052').includes('EMP0101'), 'lookup ROWID 1002 resolves to EMP0052');
    assert.ok(!team(d, 'teamTechEd', 'EMP0051').includes('EMP0101'), "last cycle's Tech ED has no access");
    assert.ok(!team(d, 'teamCompMgr', 'EMP001').includes('EMP0101'), 'Employee_Master does not add a second manager');
  });

  await t('before Generate, Employee_Master assignments are used ("ID - Name" and email)', async () => {
    const d = await A.loadDelegation(zcql, 'C27');
    assert.ok(team(d, 'teamCompMgr', 'EMP001').includes('EMP0102'));
    assert.ok(team(d, 'teamTechEd', 'EMP0052').includes('EMP0102'));
    assert.ok(team(d, 'teamCompMgr', 'EMP0012').includes('EMP0103'));
  });

  await t('exact matching: EMP001 is not mistaken for EMP0012', async () => {
    const d = await A.loadDelegation(zcql, 'C27');
    assert.deepStrictEqual(team(d, 'teamCompMgr', 'EMP001'), ['EMP0102']);
  });

  await t('each employee has exactly one Tech ED and one Comp Manager', async () => {
    const d = await A.loadDelegation(zcql, 'C27');
    const count = (key) => Object.values(d[key]).flat().reduce((m, id) => m.set(id, (m.get(id) || 0) + 1), new Map());
    for (const key of ['teamTechEd', 'teamCompMgr']) {
      count(key).forEach((n, id) => assert.strictEqual(n, 1, id + ' in ' + n + ' ' + key + ' teams'));
    }
  });

  await t('scope matches rows by employee ID and by Employee_Master ROWID; self excluded', async () => {
    const d = await A.loadDelegation(zcql, 'C27');
    const scope = scopeFor(d, 'compMgr', 'EMP0012');
    const a = { scope };
    assert.deepStrictEqual(scope.empIds.slice().sort(), ['EMP0100', 'EMP0101', 'EMP0103']);
    assert.ok(A.inScope(a, 'EMP0100'));
    assert.ok(A.inScope(a, { emp_id: '2001' }), 'Payroll/Feedback rows use the ROWID');
    assert.ok(!A.inScope(a, 'EMP0102'));
    assert.ok(!A.inScope(a, '2003'));
    assert.ok(!A.inScope(a, 'EMP0012'), 'not their own row');
    assert.ok(!A.inScope(a, '1004'), 'not their own row by ROWID');
    const old = { scope: scopeFor(d, 'compMgr', 'EMP001') };
    assert.ok(!A.inScope(old, 'EMP0100') && !A.inScope(old, '2001'), 'old manager sees nothing of the moved employee');
  });

  await t('no active cycle: only Employee_Master assignments', async () => {
    const d = await A.loadDelegation(zcql, null);
    assert.ok(team(d, 'teamCompMgr', 'EMP001').includes('EMP0100'));
    assert.ok(!team(d, 'teamCompMgr', 'EMP0012').includes('EMP0100'));
  });

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
