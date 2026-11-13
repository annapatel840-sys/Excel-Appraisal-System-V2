/* =====================================================================
   accessCore.js — the access rules of the Appraisal / Compensation tool
   (adapted from Access_Catalyst_v5 per docs/ACCESS_SPEC.md)

   Used by accessapi AND copied into every other function so all of them decide
   access the same way.

   Order a person's access is decided in:
     1. Locked rule (HR Operations screens = HR Admin only; fixed actions)
     2. Personal override (AccessOverride, not past its end date — IST)
     3. Role setting (RoleScreen / RoleAction / FieldAccess)
   Role of a person: Catalyst role ('HR' → hr, + roles added on the Access screen)
     → 'App Administrator' (bootstrap HR)
     → else Delegation for the Active cycle (appraiser_tech_ed_id → techEd,
       comp_manager_id → compMgr) → else no access.

   ---------------------------------------------------------------------
   CALLING PATTERN for other functions (Advanced I/O, express):

     const access = require('./accessCore');
     const userApp  = catalyst.initialize(req);                      // who is signed in
     const adminApp = catalyst.initialize(req, { scope: 'admin' });  // Data Store reads

     // 1. authenticate (+ dry run). Never throws in dry run (ACCESS_ENFORCE != 'true').
     const a = await access.check(userApp, adminApp);
     //    a.enforced === true  → a is the full access object; rules must be applied.
     //    a.dryRun   === true  → keep legacy behaviour; a.denied is set when the person
     //                           would have been refused (already logged).

     // 2. screens / actions — guard() throws when enforced, only logs in dry run:
     access.guard(a, () => access.requireScreen(a, 'appraisalSheet', 'edit'));
     access.guard(a, () => access.requireAction(a, 'bulkEdit'));

     // 3. rows (DB-shaped, snake_case): scope + drop hidden columns (no-op in dry run)
     rows = access.scopeRows(a, rows);
     //    or by hand when enforced:
     //    rows = rows.filter((r) => access.inScope(a, r)).map((r) => access.shapeRowByColumns(a, r));

     // 4. edits on a DB column
     if (a.enforced && !access.canEditColumn(a, 'hike_amount')) throw new access.HttpError(403, '…');
     //    (or: access.guard(a, () => access.requireEditColumns(a, Object.keys(patch))) )

     // 5. after any change to Delegation / Employee_Master / access tables:
     await access.bumpVersion(adminApp, userEmail, 'Delegation changed');

   Rule errors are access.HttpError (status 401/403/…); answer them as
   HTTP 200 { ok:false, status, error, enforced }.
   ===================================================================== */
'use strict';

/* ---------------------------------------------------------------------
   SETTINGS
   --------------------------------------------------------------------- */
const SETTINGS = {
  // Catalyst roles always treated as HR Admin (first login before set-up).
  bootstrapHrRoles: ['App Administrator'],

  employeeMaster: {
    table: 'Employee_Master',
    empId: 'emp_id', name: 'emp_name', email: 'email_id',
    status: 'emp_status', activeValue: 'Active'
  },
  // Delegation.cycle_id and emp_id are lookups; assignment fields store employee IDs as text.
  delegation: {
    table: 'Delegation', cycleColumn: 'cycle_id', empId: 'emp_id',
    compManagerId: 'comp_manager', appraiserTechEdId: 'appraiser_tech_ed'
  },
  cycle: { table: 'Appraisal_Cycle_Master', idColumn: 'ROWID', statusColumn: 'status', activeValue: 'Active', nameColumn: 'cycle_name' },
  appraisalSheet: { table: 'Appraisal_Sheet', empId: 'emp_id' },

  versionCheckMs: 30 * 1000
};

const T = {
  catalog: 'AccessCatalog', role: 'AccessRole', screen: 'RoleScreen', action: 'RoleAction', field: 'FieldAccess',
  override: 'AccessOverride', log: 'AccessLog', version: 'AccessVersion', seen: 'CatalystRoleSeen'
};

// Built-in roles. Their keys are fixed; labels can be changed in AccessRole.
const BUILT_IN_ROLES = [
  { key: 'hr', label: 'HR Admin', source: 'catalyst', catalystRole: 'HR', seesAll: true, fixed: true },
  { key: 'techEd', label: 'Tech-ED', source: 'delegation', seesAll: false, fixed: true },
  { key: 'compMgr', label: 'Comp Manager', source: 'delegation', seesAll: false, fixed: true }
];

/* Starting catalogue (written to AccessCatalog by POST /seed). d = defaults for [hr, techEd, compMgr].
   Exactly the tables of docs/ACCESS_SPEC.md, in that order. */
const scr = (key, label, group, hrOnly, d) => ({ type: 'screen', key, label, group, hrOnly: !!hrOnly, fixed: '', note: '', d: hrOnly ? [] : d });
const act = (key, label, group, fixed, d) => ({ type: 'action', key, label, group, hrOnly: false, fixed: fixed || '', note: '', d });
const fld = (key, label, kind, extra) => Object.assign({ type: 'field', key, label, group: '', hrOnly: false, fixed: '', note: '', kind, deps: [], pairOf: '' }, extra || {});
const CMP = 'Compensation', HRO = 'HR Operations';
/* Fields of the other screens (group = screen key). m = shown/system value (read-only), otherwise an input. */
const fslug = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
const SCREEN_FIELD_SPEC = {
  employeeMaster: [['Employee ID', 'm'], 'Employee Name', 'Designation', 'Department', 'Reporting Manager', 'Director', 'Appraiser Tech-ED', 'Employee Type', 'Email ID', 'Date of Joining', 'Location', 'Cost Center', 'Organization Experience', 'Total Experience', 'Current Salary', 'Last Appraisal Month/Year', 'Employee Status', 'Exit Date', 'Remark'],
  cycleMaster: ['Cycle Name', 'Cycle Type', 'Year', 'Process', 'Start Date', 'Close Date', 'Effective Date', ['Status', 'm'], 'Letters to Send', ['Mismatch', 'm'], 'Remarks'],
  locationMaster: ['Location Name', 'Location Code', 'Address', 'Currency Code', 'Status'],
  budgetMaster: [['Tech-ED', 'm'], 'Budget %', 'Reason for Change', ['Allocated', 'm'], ['Updated', 'm'], ['Team Size', 'm'], 'Allotted to Comp Managers', ['Buffer', 'm']],
  payrollMaster: [['Employee ID', 'm'], ['Employee Name', 'm'], ['Appraisal Cycle Name', 'm'], 'Effective Date', 'FY Year', 'Current Annual Base Pay', 'Joining Bonus', 'Performance Bonus', 'Retention Bonus', 'Hike %', 'Hike Amount', 'Total CTC with Rewards', 'Total Reward Hike Amount', 'Total Reward Hike %', 'Target Performance Bonus for Next Year', 'Target PB Criteria', 'Total Bonus', 'New Base Pay', 'RB to be Paid', 'Month (RB)', 'PB to be Paid', 'Month (PB)', 'TB to be Paid', 'Month (TB)'],
  feedbackRating: [['Employee', 'm'], ['Department', 'm'], ['Band', 'm'], ['Cycle', 'm'], 'Effective Date', 'Manager Rating', 'Manager Feedback', 'RR%', 'YoE Ratio', 'Interview Count', 'Gross Margin', 'Cost Center/Client', 'Client Manager', 'Client Rating', 'Client Feedback', 'At Risk', ['Comp Manager', 'm'], ['Tech-ED', 'm'], ['Upload Batch', 'm']],
  designationMaster: ['Designation', 'Department', 'Band', 'Next Type', 'Next Designations', 'Status', 'Group Name', 'Mapped Designations'],
  eligibility: [['Employee', 'm'], ['Location', 'm'], ['Department', 'm'], ['Date of Joining', 'm'], ['Tech-ED/BU Head Name', 'm'], ['Employee Status', 'm'], 'Eligibility', 'Reason', ['Set By', 'm'], ['Change Tag', 'm'], ['Last Updated', 'm']],
  payrollUpload: ['Cycle to Upload Into', 'Upload File'],
  historicalImport: ['Cycle', 'Data to Import', 'File'],
  teamChanges: ['Manager', 'Employee Name or ID'],
  budgetDistribution: [['Level', 'm'], ['Tech-ED', 'm'], 'Budget %', ['Original Budget', 'm'], 'Additional Budget', ['Updated Budget', 'm'], ['Utilised', 'm'], ['Remaining', 'm'], ['Utilisation %', 'm'], ['Original Count', 'm'], ['Current Count', 'm'], ['Status', 'm'], 'Access'],
  delegation: [['Employee', 'm'], ['Reporting Manager', 'm'], ['Director', 'm'], ['Tech-ED', 'm'], 'Comp. Manager', 'Appraiser Tech-ED', ['Previous Comp. Manager', 'm'], ['Previous Appraiser Tech-ED', 'm'], 'HR Remarks'],
  letters: [['Employee', 'm'], ['Appraisal Cycle', 'm'], ['Cycle Type', 'm'], ['Promotion', 'm'], 'Letter Type', 'Template', ['Status', 'm'], ['Alert', 'm'], ['Sent On', 'm'], ['Sent By', 'm'], ['Sent To', 'm'], ['Resend Count', 'm'], ['Last Resent On', 'm'], 'Remarks']
};
/* Screens only HR can open: other roles get Hidden on their fields by default. */
const HR_FIELD_GROUPS = new Set(['employeeMaster', 'cycleMaster', 'locationMaster', 'budgetMaster', 'payrollMaster', 'feedbackRating', 'designationMaster', 'eligibility', 'payrollUpload', 'historicalImport']);
const SCREEN_FIELD_CATALOG = [].concat(...Object.keys(SCREEN_FIELD_SPEC).map((scr) => SCREEN_FIELD_SPEC[scr].map((it) => {
  const label = Array.isArray(it) ? it[0] : it, m = Array.isArray(it) && it[1] === 'm';
  return fld(scr + '_' + fslug(label), label, m ? 'master' : 'input', { group: scr });
})));

const START_CATALOG = [
  scr('dashboard', 'Dashboard', CMP, false, ['view', 'view', 'view']),
  scr('appraisalSheet', 'Appraisal Sheet', CMP, false, ['edit', 'edit', 'edit']),
  scr('detailScreen', 'Detailed Screen', CMP, false, ['edit', 'edit', 'edit']),
  scr('bulkEditScreen', 'Bulk Edit', CMP, false, ['edit', 'edit', 'edit']),
  scr('budgetAllocation', 'Budget Master', CMP, false, ['edit', 'edit', 'edit']),
  scr('budgetDistribution', 'Budget Distribution', CMP, false, ['edit', 'edit', 'edit']),
  scr('teamChanges', 'Team Changes', CMP, false, ['view', 'view', 'view']),
  scr('delegation', 'Delegation', CMP, false, ['edit', 'edit', 'none']),
  scr('employeeMaster', 'Employee Master · Eligibility List', HRO, true),
  scr('hrDashboard', 'HR Dashboard', HRO, true),
  scr('cycleMaster', 'Appraisal Cycle Master', HRO, true),
  scr('locationMaster', 'Location Master', HRO, true),
  scr('feedbackRatingMaster', 'Feedback & Rating Master', HRO, true),
  scr('designationMaster', 'Designation Master', HRO, true),
  scr('historicalImport', 'Historical Import', HRO, true),
  scr('letters', 'Letters', HRO, true),
  scr('payroll', 'Payroll Data · Payroll Upload', HRO, true),
  scr('settings', 'Settings', HRO, true),
  scr('access', 'Access', HRO, true),

  act('bulkEdit', 'Bulk edit', 'Editing', '', [1, 1, 1]),
  act('promote', 'Promote (Designation cell)', 'Editing', '', [1, 1, 1]),
  act('importAppraisal', 'Import appraisal sheet (Excel)', 'Editing', '', [1, 1, 1]),
  act('exportGrid', 'Export Appraisal Sheet (Excel)', 'Editing', '', [1, 1, 1]),
  act('delegateRequest', 'Delegate (request)', 'Delegation', '', [1, 1, 0]),
  act('delegateApprove', 'Approve delegation', 'Delegation', 'HR only', [1, 0, 0]),
  act('allotNextLevel', 'Allot budget to next level', 'Budget', '', [0, 1, 1]),
  act('changeBudgetConfig', 'Change budget config', 'Budget', 'HR only', [1, 0, 0]),
  act('viewAudit', 'View audit trails', 'Access', '', [1, 1, 0]),

  fld('name', 'EMP Name', 'master'),
  fld('designation', 'Designation', 'master'),
  fld('reportingManager', 'Reporting Manager', 'master'),
  fld('compManager', 'Comp. Manager', 'master'),
  fld('appraiserTechED', 'Appraiser Tech/ED', 'master'),
  fld('wissenExperience', 'Organization Experience', 'master'),
  fld('totalExperience', 'Total Experience', 'master'),
  fld('lastAppraisalDate', 'Last Appraisal Date', 'master'),
  fld('managerRating', 'Manager Rating', 'master'),
  fld('interviewCount', 'Interview Count', 'master'),
  fld('rrPercent', 'RR %', 'master'),
  fld('grossMargin', 'Gross Margin', 'master'),
  fld('currentAnnualBasePay', 'Current Annual Base Pay', 'master'),
  fld('targetPBAllocatedForMay', 'Target PB Allocated for May', 'master'),
  fld('rbToBePaid', 'RB to be Paid', 'upload'),
  fld('monthRB', 'Month RB', 'upload'),
  fld('pbToBePaid', 'PB to be Paid', 'upload'),
  fld('monthPB', 'Month PB', 'upload'),
  fld('allocatedPBAmount', 'Allocated PB Amount', 'input'),
  fld('pbInstallment', 'PB Installment', 'input'),
  fld('newPBToBeOffered', 'New PB to be Offered', 'input'),
  fld('newPBInstallment', 'New PB Installment', 'input'),
  fld('newRB', 'New RB', 'input'),
  fld('hikeAmount', 'Hike Amount', 'input'),
  fld('hikePct', 'Hike %', 'pair', { pairOf: 'hikeAmount' }),
  fld('targetPBNextYear', 'Target PB Next Year', 'input'),
  fld('targetPBCriteria', 'Target PB Criteria', 'input'),
  fld('compManagerRemarks', 'Comp. Manager Remarks', 'input'),
  fld('eligibleForPromotion', 'Eligible for Promotion', 'input'),
  fld('newTitle', 'New Title', 'input'),
  fld('atRisk', 'At Risk', 'input'),
  fld('totalOfPB', 'Total of PB', 'calc', { deps: ['allocatedPBAmount', 'newPBToBeOffered'] }),
  fld('totalBonus', 'Total Bonus', 'calc', { deps: ['totalOfPB', 'newRB'] }),
  fld('newBaseSalary', 'New Base Salary', 'calc', { deps: ['currentAnnualBasePay', 'hikeAmount'] }),
  fld('totalCTCWithRewards', 'Total CTC with Rewards', 'calc', { deps: ['newBaseSalary', 'totalBonus'] }),
  fld('totalBonusHikeAmount', 'Total Bonus Hike Amount', 'calc', { deps: ['totalBonus', 'rbToBePaid', 'pbToBePaid'] }),
  fld('totalBonusHikePct', 'Total Bonus Hike %', 'calc', { deps: ['totalBonus', 'rbToBePaid', 'pbToBePaid'] }),
  fld('totalRewardsHikeAmount', 'Total Rewards Hike Amount', 'calc', { deps: ['hikeAmount', 'totalBonusHikeAmount'] }),
  fld('totalRewardsHikePct', 'Total Rewards Hike %', 'calc', { deps: ['totalRewardsHikeAmount', 'currentAnnualBasePay'] })
].concat(SCREEN_FIELD_CATALOG).map((c, i) => Object.assign(c, { sort: i + 1 }));

/* Field key → Appraisal_Sheet column. Calculated fields have no column (computed). */
const FIELD_COLUMNS = {
  name: 'name', designation: 'designation', reportingManager: 'reporting_manager', compManager: 'comp_manager',
  appraiserTechED: 'appraiser_tech_ed', wissenExperience: 'wissen_experience', totalExperience: 'total_experience',
  lastAppraisalDate: 'last_appraisal_date', managerRating: 'manager_rating', interviewCount: 'interview_count',
  rrPercent: 'rr_percent', grossMargin: 'gross_margin', currentAnnualBasePay: 'current_annual_base_pay',
  targetPBAllocatedForMay: 'target_pb_allocated_for_may', rbToBePaid: 'rb_to_be_paid', monthRB: 'month_rb',
  pbToBePaid: 'pb_to_be_paid', monthPB: 'month_pb', allocatedPBAmount: 'allocated_pb_amount', pbInstallment: 'pb_installment',
  newPBToBeOffered: 'new_pb_to_be_offered', newPBInstallment: 'new_pb_installment', newRB: 'new_rb', hikeAmount: 'hike_amount',
  hikePct: 'hike_pct', targetPBNextYear: 'target_pb_next_year',
  targetPBCriteria: 'target_PB_criteria', compManagerRemarks: 'comp_manager_remarks',
  eligibleForPromotion: 'eligible_for_promotion',
  newTitle: 'new_title', atRisk: 'at_risk'
};
const COLUMN_FIELDS = Object.fromEntries(Object.entries(FIELD_COLUMNS).map(([k, c]) => [c, k]));

const LEVELS = ['none', 'view', 'edit'];
const LIMITS = ['edit', 'read', 'hidden'];          // no masking
const STRICT = { edit: 0, read: 1, hidden: 2 };
const OV_TYPES = ['screen', 'action', 'field', 'role', 'team'];
const BUILT_IN_KEYS = ['hr', 'techEd', 'compMgr'];

/* ---------------------------------------------------------------------
   Helpers
   --------------------------------------------------------------------- */
class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const IST_MS = 330 * 60 * 1000;
// Data Store datetime text in IST (the project timezone); toISOString alone is UTC.
function nowDT() { return new Date(Date.now() + IST_MS).toISOString().replace('T', ' ').slice(0, 19); }
/** Today's date (YYYY-MM-DD) in Asia/Kolkata — used for override end dates. */
function today() { return new Date(Date.now() + IST_MS).toISOString().slice(0, 10); }
function q(v) { return String(v).replace(/'/g, "''"); }
const bool = (v) => v === true || v === 'true' || v === 1 || v === '1';
const norm = (v) => String(v == null ? '' : v).trim().toUpperCase();
const ID_RE = /^[A-Za-z0-9_.\-@]{1,150}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isEnforced() { return process.env.ACCESS_ENFORCE === 'true'; }

/* zcql of an app (or a zcql object itself). */
function zq(appOrZcql) { return appOrZcql && typeof appOrZcql.zcql === 'function' ? appOrZcql.zcql() : appOrZcql; }

function bigOf(v) { try { return BigInt(String(v)); } catch (e) { return null; } }

/* ZCQL returns at most 300 rows per query, so read in pages by ROWID.
   ROWIDs may come back as strings; progress is checked numerically (BigInt) and
   rows are de-duplicated so a bad comparison can never loop forever. */
const PAGE = 300;
// Catalyst answers 429 "Concurrency limit reached" when too many Data Store
// calls run at once; wait briefly and retry instead of failing the request.
async function whenNotBusy(fn) {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); } catch (err) {
      const busy = err && (err.statusCode === 429 || err.code === 'TOO_MANY_REQUESTS');
      if (!busy || attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1) + Math.random() * 250));
    }
  }
}
async function selectAll(zcql, table, where) {
  const out = [], seen = new Set();
  let last = '0';
  for (let guard = 0; guard < 10000; guard++) {
    const cond = (where ? '(' + where + ') AND ' : '') + 'ROWID > ' + last;
    const res = await whenNotBusy(() => zcql.executeZCQLQuery('SELECT * FROM ' + table + ' WHERE ' + cond + ' ORDER BY ROWID ASC LIMIT ' + PAGE));
    const rows = (res || []).map((r) => (r && r[table]) || (r && Object.values(r)[0]) || {});
    let max = bigOf(last), added = 0;
    for (const row of rows) {
      const id = String(row.ROWID);
      if (seen.has(id)) continue;
      seen.add(id); out.push(row); added++;
      const b = bigOf(id);
      if (b !== null && (max === null || b > max)) max = b;
    }
    if (rows.length < PAGE || !added || max === null || String(max) === String(last)) break;
    last = String(max);
  }
  return out;
}

/* ---------------------------------------------------------------------
   Catalogue, roles, matrix
   --------------------------------------------------------------------- */
function catalogRow(r) {
  return {
    type: r.item_type, key: r.item_key, label: r.label, group: r.grp || '', hrOnly: bool(r.hr_only), fixed: r.fixed_note || '',
    note: r.note || '', kind: r.field_kind || '', deps: r.deps ? String(r.deps).split(',').map((s) => s.trim()).filter(Boolean) : [],
    pairOf: r.pair_of || '', sort: Number(r.sort_order) || 0
  };
}
function buildCatalog(src) {
  const C = { screens: [], actions: [], fields: [] };
  src.forEach((c) => { if (c.type === 'screen') C.screens.push(c); else if (c.type === 'action') C.actions.push(c); else if (c.type === 'field') C.fields.push(c); });
  // defaults (d) for catalogue rows read from the table come from START_CATALOG when the key is known
  const startBy = Object.fromEntries(START_CATALOG.map((x) => [x.type + '|' + x.key, x]));
  C.screens.concat(C.actions).forEach((x) => { if (!x.d) { const s = startBy[x.type + '|' + x.key]; x.d = s ? s.d : []; } });
  C.screenBy = Object.fromEntries(C.screens.map((x) => [x.key, x]));
  C.actionBy = Object.fromEntries(C.actions.map((x) => [x.key, x]));
  C.fieldBy = Object.fromEntries(C.fields.map((x) => [x.key, x]));
  return C;
}
async function loadCatalog(zcql) {
  const rows = await selectAll(zq(zcql), T.catalog);
  let src;
  if (rows.length) {
    const knownKeys = new Set(rows.map((r) => String(r.item_type || '') + '|' + String(r.item_key || '')));
    const activeRows = rows.filter((r) => bool(r.active)).map(catalogRow);
    // Add newly introduced built-in fields when the catalogue was seeded earlier.
    // Existing inactive entries stay inactive because their keys are still known.
    const missingDefaults = START_CATALOG.filter((item) => !knownKeys.has(item.type + '|' + item.key));
    src = activeRows.concat(missingDefaults).sort((a, b) => a.sort - b.sort);
  } else {
    src = START_CATALOG;
  }
  return buildCatalog(src);
}
async function loadRoles(zcql) {
  const rows = await selectAll(zq(zcql), T.role);
  const by = {};
  BUILT_IN_ROLES.forEach((r) => { by[r.key] = Object.assign({}, r); });
  rows.forEach((r) => {
    const base = by[r.role_key] || { key: r.role_key, source: 'catalyst', fixed: false };
    by[r.role_key] = Object.assign(base, {
      label: r.label || base.label, catalystRole: base.source === 'catalyst' ? (base.key === 'hr' ? base.catalystRole : (r.catalyst_role || base.catalystRole)) : undefined,
      seesAll: base.key === 'hr' ? true : bool(r.sees_all), retired: base.fixed ? false : bool(r.retired), rowid: r.ROWID
    });
  });
  return Object.values(by);
}
function defaultLevel(C, s, roleKey) {
  if (s.hrOnly) return roleKey === 'hr' ? 'edit' : 'none';
  const i = BUILT_IN_KEYS.indexOf(roleKey);
  return i > -1 && s.d && s.d[i] ? s.d[i] : (roleKey === 'hr' ? 'edit' : 'none');
}
function defaultAllowed(a, roleKey) {
  const i = BUILT_IN_KEYS.indexOf(roleKey);
  return i > -1 && a.d && a.d.length ? !!a.d[i] : roleKey === 'hr';
}
function defaultLimit(f, roleKey) {
  if (f.kind === 'master' || f.kind === 'upload') return 'read';
  if (f.kind === 'input') return BUILT_IN_KEYS.indexOf(roleKey) > -1 ? 'edit' : 'read';
  return null;
}
async function loadMatrix(zcql, C, roles) {
  const z = zq(zcql);
  const [s, a, f] = await Promise.all([selectAll(z, T.screen), selectAll(z, T.action), selectAll(z, T.field)]);
  const m = { screens: {}, actions: {}, fields: {}, rowids: { screen: {}, action: {}, field: {} } };
  roles.forEach((r) => {
    m.screens[r.key] = {}; m.actions[r.key] = {}; m.fields[r.key] = {};
    C.screens.forEach((x) => { m.screens[r.key][x.key] = defaultLevel(C, x, r.key); });
    C.actions.forEach((x) => { m.actions[r.key][x.key] = defaultAllowed(x, r.key); });
    C.fields.forEach((x) => { let d = defaultLimit(x, r.key); if (d && HR_FIELD_GROUPS.has(x.group) && r.key !== 'hr') d = 'hidden'; if (d) m.fields[r.key][x.key] = d; });
  });
  s.forEach((x) => { const it = C.screenBy[x.screen_key]; if (!it || !m.screens[x.role_key]) return; m.rowids.screen[x.role_key + '|' + x.screen_key] = x.ROWID; if (!it.hrOnly && LEVELS.indexOf(x.level) > -1) m.screens[x.role_key][x.screen_key] = x.level; });
  a.forEach((x) => { const it = C.actionBy[x.action_key]; if (!it || !m.actions[x.role_key]) return; m.rowids.action[x.role_key + '|' + x.action_key] = x.ROWID; if (!it.fixed) m.actions[x.role_key][x.action_key] = bool(x.allowed); });
  f.forEach((x) => {
    const it = C.fieldBy[x.field_key]; if (!it || !m.fields[x.role_key]) return; m.rowids.field[x.role_key + '|' + x.field_key] = x.ROWID;
    if ((it.kind === 'input' || it.kind === 'master' || it.kind === 'upload') && LIMITS.indexOf(x.access_limit) > -1 && !(it.kind !== 'input' && x.access_limit === 'edit')) m.fields[x.role_key][x.field_key] = x.access_limit;
  });
  return m;
}
// Paired field = same as partner; calculated = strictest of its inputs.
function resolveFields(C, lim) {
  C.fields.forEach((f) => { if (f.kind === 'pair') lim[f.key] = lim[f.pairOf] || 'read'; });
  const seen = {};
  function get(k) {
    const f = C.fieldBy[k]; if (!f) return 'read';
    if (f.kind !== 'calc') return lim[k] || 'read';
    if (seen[k]) return lim[k] || 'read';
    seen[k] = true;
    let worst = 'read';
    (f.deps || []).forEach((d) => { const v = get(d); if (STRICT[v] > STRICT[worst]) worst = v; });
    return (lim[k] = worst);
  }
  C.fields.forEach((f) => { if (f.kind === 'calc') get(f.key); });
  return lim;
}

/* ---------------------------------------------------------------------
   People: Employee_Master + Delegation + Catalyst roles
   --------------------------------------------------------------------- */
async function activeCycleId(zcql, context = {}) {
  const c = SETTINGS.cycle;
  const rows = await selectAll(zq(zcql), c.table);
  const isTruthyFlag = (value) =>
    [true, 1, "true", "1", "yes"].includes(
      typeof value === "string" ? value.trim().toLowerCase() : value,
    );
  const activeRows = rows.filter((row) =>
    String(row[c.statusColumn] || "").trim().toLowerCase() === String(c.activeValue).toLowerCase() &&
    !isTruthyFlag(row.archived) &&
    !isTruthyFlag(row.hidden)
  );
  const requestedCycleId = norm(context.cycleId);
  const requestedLocation = norm(context.location);
  const isAllLocations = !requestedLocation || requestedLocation === "all" || requestedLocation === "all locations";
  const active = requestedCycleId
    ? activeRows.find((row) =>
        norm(row[c.idColumn]) === requestedCycleId ||
        norm(row[c.nameColumn]) === requestedCycleId
      )
    : isAllLocations
      ? activeRows[0]
      : activeRows.find((row) => norm(row.location) === requestedLocation);
  return active ? String(active[c.idColumn] || "") || null : null;
}
/* Delegation of a cycle:
     techEd / compMgr : { normEmpId: number of employees }   (who has a team)
     byEmp            : { normEmpId: { empId, techEd, compMgr } }
     teamTechEd / teamCompMgr : { normManagerId: [empId, …] }
     rowIdOf          : { normEmpId: Employee_Master ROWID }

   Each employee has ONE Tech ED and ONE Comp Manager, taken per role from the
   first source that names one:
     1. Delegation row of the cycle (changes only when HR assigns or approves),
     2. the cycle's Appraisal_Sheet row (approval also writes it; Generate copies it),
     3. the employee's Appraisal_Sheet row without a cycle (left by Employee
        Master import), then Employee_Master (before Generate).
   A person reassigned in Delegation therefore leaves the old manager's team.
   Sheet rows of other cycles are not used: they hold past managers. */
async function loadDelegation(zcql, cycleId) {
  const d = SETTINGS.delegation, out = { techEd: {}, compMgr: {}, byEmp: {}, teamTechEd: {}, teamCompMgr: {}, rowIdOf: {} };
  const z = zq(zcql);
  const e = SETTINGS.employeeMaster, s = SETTINGS.appraisalSheet;
  const [rows, masterRows, sheetRows] = await Promise.all([
    cycleId
      ? selectAll(z, d.table, d.cycleColumn + " = '" + q(cycleId) + "'")
      : Promise.resolve([]),
    selectAll(z, e.table),
    selectAll(z, s.table),
  ]);
  // A lookup value as text: Catalyst may return a ROWID or an object. Defined
  // before cycleOf, which uses it straight away (a later const throws
  // "Cannot access 'lookupText' before initialization").
  const lookupText = (value) => {
    if (value == null) return '';
    if (typeof value === 'object') {
      return lookupText(
        value.ROWID ?? value.rowid ?? value.emp_id ?? value.employee_id ??
        value.id ?? value.value ?? value.display_value ?? value.name ?? ''
      );
    }
    return String(value).trim();
  };
  // Appraisal_Sheet schemas use appraisal_cycle_id in the current app, while
  // older imports may use cycle_id / camelCase aliases. Resolve the first
  // populated value so active-cycle rows are not silently omitted from scope.
  const cycleOf = (r) => {
    for (const value of [
      r.cycle_id,
      r.appraisal_cycle_id,
      r.appraisalCycleId,
      r.cycleId,
      r.appraisal_cycle,
      r.appraisal_cycle_name,
      r.cycle_name,
    ]) {
      const resolved = lookupText(value);
      if (resolved) return resolved;
    }
    return '';
  };
  const cycleSheetRows = cycleId
    ? sheetRows.filter((r) => cycleOf(r) === String(cycleId))
    : [];
  const noCycleSheetRows = sheetRows.filter((r) => !cycleOf(r));

  // Employee_Master people, reachable by employee ID and by ROWID (lookup
  // columns and Delegation.emp_id hold the ROWID).
  const byId = new Map(), byRowId = new Map(), byEmail = new Map(), nameCount = new Map(), byName = new Map();
  masterRows.forEach((r) => {
    const empId = String(r[e.empId] || '').trim();
    if (!empId) return;
    const p = { empId, rowId: String(r.ROWID || r.rowid || '').trim() };
    byId.set(norm(empId), p);
    if (p.rowId) { byRowId.set(p.rowId, p); out.rowIdOf[norm(empId)] = p.rowId; }
    const email = String(r[e.email] || '').trim().toLowerCase();
    if (email) byEmail.set(email, p);
    const name = String(r[e.name] || '').trim().toLowerCase().replace(/\s+/g, ' ');
    if (name) { nameCount.set(name, (nameCount.get(name) || 0) + 1); byName.set(name, p); }
  });

  // A stored person ("EMP001", a ROWID, "EMP001 - Name", an email or a unique
  // name) -> normalized employee ID. Exact matches only: a partial match could
  // put an employee in the wrong manager's team ("EMP001" is inside "EMP0012").
  const person = (value) => {
    const raw = lookupText(value);
    if (!raw) return null;
    const viaId = byId.get(norm(raw)) || byRowId.get(raw);
    if (viaId) return viaId;
    const idPart = raw.match(/^(\S+)\s+-\s+.+$/);
    if (idPart && byId.has(norm(idPart[1]))) return byId.get(norm(idPart[1]));
    const lower = raw.toLowerCase().replace(/\s+/g, ' ');
    if (byEmail.has(lower)) return byEmail.get(lower);
    if (nameCount.get(lower) === 1) return byName.get(lower);
    return null;
  };
  // Managers not in Employee_Master keep their own normalized value.
  const managerKey = (value) => {
    const p = person(value);
    return p ? norm(p.empId) : norm(lookupText(value));
  };
  const employeeOf = (value) => {
    const p = person(value);
    return p ? p.empId : lookupText(value);
  };

  // Assignment columns differ between older imports and newer generated sheets.
  // Prefer a value that resolves to a real Employee_Master person; a stale but
  // non-empty alias must not mask a valid assignment in another populated column.
  const managerValue = (values) => {
    const candidates = (Array.isArray(values) ? values : [values])
      .filter((value) => value !== null && value !== undefined && String(lookupText(value)).trim());
    const resolved = candidates.find((value) => !!person(value));
    return resolved !== undefined ? resolved : (candidates[0] ?? '');
  };

  // Pick, per employee, the first source that names each manager.
  const assign = (emp, techEdValues, compMgrValues) => {
    if (!emp) return;
    const k = norm(emp);
    const cur = out.byEmp[k] || (out.byEmp[k] = { empId: emp, techEd: '', compMgr: '' });
    if (!cur.techEd) cur.techEd = managerKey(managerValue(techEdValues));
    if (!cur.compMgr) cur.compMgr = managerKey(managerValue(compMgrValues));
  };
  // The active-cycle Appraisal_Sheet is the same assignment source shown to
  // reviewers in the app. It must win when it conflicts with an older/stale
  // Delegation row; otherwise the UI can show an employee under one Tech-Ed
  // while the access scope silently assigns that employee to another.
  cycleSheetRows.forEach((r) => assign(
    employeeOf(r[s.empId]),
    [r.appraiser_tech_ed, r.appraiser_tech_ed1, r.appraiser_tech_ed_id, r.appraiser_teched, r.appraiserTechED, r.tech_ed, r.tech_ed_id],
    [r.comp_manager, r.comp_manager_id, r.compManager, r.comp_manager_name, r.comp_manager_display],
  ));
  // Delegation remains the fallback for employees without an active-cycle
  // Appraisal_Sheet assignment.
  rows.forEach((r) => assign(
    employeeOf(r[d.empId]),
    [r[d.appraiserTechEdId], r.appraiser_tech_ed_id, r.appraiser_teched, r.tech_ed, r.tech_ed_id],
    [r[d.compManagerId], r.comp_manager_id, r.compManager, r.comp_manager_name, r.comp_manager_display],
  ));
  // Legacy / imported rows are fallback-only and cannot override this cycle.
  noCycleSheetRows.forEach((r) => assign(
    employeeOf(r[s.empId]),
    [r.appraiser_tech_ed, r.appraiser_tech_ed1, r.appraiser_tech_ed_id, r.appraiser_teched, r.appraiserTechED, r.tech_ed, r.tech_ed_id],
    [r.comp_manager, r.comp_manager_id, r.compManager, r.comp_manager_name, r.comp_manager_display],
  ));
  masterRows.forEach((r) => assign(
    String(r[e.empId] || '').trim(),
    [r.appraiser_tech_ed, r.appraiser_tech_ed1, r.appraiser_tech_ed_id, r.appraiser_teched, r.appraiserTechED, r.tech_ed, r.tech_ed_id],
    [r.comp_manager, r.comp_manager_id, r.compManager, r.comp_manager_name, r.comp_manager_display],
  ));

  Object.values(out.byEmp).forEach(({ empId, techEd: t, compMgr: c }) => {
    if (t) { out.techEd[t] = (out.techEd[t] || 0) + 1; (out.teamTechEd[t] = out.teamTechEd[t] || []).push(empId); }
    if (c) { out.compMgr[c] = (out.compMgr[c] || 0) + 1; (out.teamCompMgr[c] = out.teamCompMgr[c] || []).push(empId); }
  });
  return out;
}
function hasTeam(deleg, empId) { const k = norm(empId); return deleg.techEd[k] != null || deleg.compMgr[k] != null; }
function emRow(r) {
  const e = SETTINGS.employeeMaster;
  return { empId: String(r[e.empId] || '').trim(), name: r[e.name] || String(r[e.empId]), email: String(r[e.email] || '').trim().toLowerCase(), active: String(r[e.status] || '').trim().toLowerCase() === e.activeValue.toLowerCase(), inEM: true };
}
async function findEmployee(zcql, by, value) {
  const e = SETTINGS.employeeMaster, z = zq(zcql);
  const col = by === 'email' ? e.email : e.empId;
  const tries = [String(value).trim()];
  if (by === 'email' && tries[0].toLowerCase() !== tries[0]) tries.push(tries[0].toLowerCase());
  for (const v of tries) {
    const rows = await selectAll(z, e.table, col + " = '" + q(v) + "'");
    if (rows.length) { const ps = rows.map(emRow); return ps.find((p) => p.active) || ps[0]; }
  }
  return null;
}
function overrideRow(o) {
  return { id: String(o.ROWID), empId: o.emp_id, type: o.ov_type, key: o.target_key || '', value: o.ov_type === 'action' ? bool(o.value) : o.value,
    to: o.end_date ? String(o.end_date).slice(0, 10) : '', reason: o.reason || '', by: o.set_by || '', at: String(o.set_at || '').slice(0, 10) };
}
async function loadOverrides(zcql, empId) {
  const rows = await selectAll(zq(zcql), T.override, empId ? "emp_id = '" + q(empId) + "'" : null);
  return rows.filter((o) => !bool(o.removed)).map(overrideRow);
}
const live = (o) => !o.to || o.to >= today();

/* ---------------------------------------------------------------------
   Effective access of one person
   --------------------------------------------------------------------- */
function baseRoleOf(roles, person, catalystRole, deleg) {
  const cr = roles.find((r) => r.source === 'catalyst' && !r.retired && r.catalystRole && catalystRole && r.catalystRole.toLowerCase() === String(catalystRole).toLowerCase());
  if (cr) return { role: cr.key, from: 'Catalyst role' };
  if (catalystRole && SETTINGS.bootstrapHrRoles.indexOf(catalystRole) > -1) return { role: 'hr', from: 'Catalyst bootstrap' };
  if (person && deleg.techEd[norm(person.empId)] != null) return { role: 'techEd', from: 'Delegation' };
  if (person && deleg.compMgr[norm(person.empId)] != null) return { role: 'compMgr', from: 'Delegation' };
  return { role: '', from: 'No role' };
}
function accessOf(C, roles, m, person, roleKey, ovs) {
  const mine = ovs.filter(live);
  const ro = mine.find((o) => o.type === 'role' && roles.some((r) => r.key === o.value && !r.retired));
  const role = ro ? ro.value : roleKey;
  const screens = {}, actions = {}, lim = {};
  C.screens.forEach((s) => {
    if (!role) { screens[s.key] = 'none'; return; }
    if (s.hrOnly) { screens[s.key] = role === 'hr' ? 'edit' : 'none'; return; }
    const o = mine.find((x) => x.type === 'screen' && x.key === s.key);
    screens[s.key] = o && LEVELS.indexOf(o.value) > -1 ? o.value : m.screens[role][s.key];
  });
  C.actions.forEach((a) => {
    if (!role) { actions[a.key] = false; return; }
    const o = a.fixed ? null : mine.find((x) => x.type === 'action' && x.key === a.key);
    actions[a.key] = o ? !!o.value : !!m.actions[role][a.key];
  });
  C.fields.forEach((f) => { if (f.kind !== 'calc' && f.kind !== 'pair') lim[f.key] = role ? (m.fields[role][f.key] || 'read') : 'hidden'; });
  mine.forEach((o) => {
    if (o.type === 'field' && lim[o.key] !== undefined && LIMITS.indexOf(o.value) > -1 && !(C.fieldBy[o.key].kind !== 'input' && o.value === 'edit')) lim[o.key] = o.value;
  });
  resolveFields(C, lim);
  return { role, roleOverride: !!ro, screens, actions, fields: lim, teams: mine.filter((o) => o.type === 'team').map((o) => o.key) };
}

/* ---------------------------------------------------------------------
   Per-instance cache, keyed by AccessVersion (Data Store read limit!)
   --------------------------------------------------------------------- */
const CACHE = { version: null, checkedAt: 0, base: null, loading: null, loadingScopeKey: "", scopeKey: "", emails: new Map() };
function resetCache() {
  CACHE.version = null;
  CACHE.checkedAt = 0;
  CACHE.base = null;
  CACHE.loading = null;
  CACHE.loadingScopeKey = "";
  CACHE.scopeKey = "";
  CACHE.emails = new Map();
}

async function getVersion(zcql) {
  const rows = await selectAll(zq(zcql), T.version, "version_key = 'ACCESS'");
  return rows[0] ? { version: Number(rows[0].version) || 1, rowid: rows[0].ROWID } : { version: 1, rowid: null };
}
async function loadBase(z, version, context = {}) {
  const [C, roles, cycleId, ovRows] = await Promise.all([loadCatalog(z), loadRoles(z), activeCycleId(z, context), selectAll(z, T.override)]);
  const [deleg, m] = await Promise.all([loadDelegation(z, cycleId), loadMatrix(z, C, roles)]);
  const overridesBy = {};
  ovRows.filter((o) => !bool(o.removed)).map(overrideRow).forEach((o) => { const k = norm(o.empId); (overridesBy[k] = overridesBy[k] || []).push(o); });
  return { version, C, roles, cycleId, deleg, m, overridesBy };
}
/* Returns the cached base data; at most one query (the version row) when warm,
   and none when the version was checked less than 30 s ago. */
async function ensureCache(zcql, context = {}) {
  const z = zq(zcql);
  const scopeKey = norm(context.cycleId) || norm(context.location) || "all";
  const now = Date.now();
  if (CACHE.base && CACHE.scopeKey === scopeKey && now - CACHE.checkedAt < SETTINGS.versionCheckMs) {
    return CACHE.base;
  }
  if (CACHE.loading && CACHE.loadingScopeKey === scopeKey) return CACHE.loading;
  const loading = (async () => {
    const v = await getVersion(z);
    if (CACHE.base && CACHE.scopeKey === scopeKey && CACHE.version === v.version) {
      CACHE.checkedAt = Date.now();
      return CACHE.base;
    }
    const base = await loadBase(z, v.version, context);
    if (CACHE.loading === loading) {
      CACHE.base = base;
      CACHE.version = v.version;
      CACHE.scopeKey = scopeKey;
      CACHE.checkedAt = Date.now();
      CACHE.emails = new Map();
    }
    return base;
  })();
  CACHE.loading = loading;
  CACHE.loadingScopeKey = scopeKey;
  try {
    return await loading;
  } finally {
    if (CACHE.loading === loading) {
      CACHE.loading = null;
      CACHE.loadingScopeKey = "";
    }
  }
}
/* Version number for GET /version — uses the cache (≤1 query per 30 s). */
async function currentVersion(zcql) {
  const now = Date.now();
  if (CACHE.version != null && now - CACHE.checkedAt < SETTINGS.versionCheckMs) return CACHE.version;
  const v = await getVersion(zq(zcql));
  if (CACHE.version !== v.version) { CACHE.base = null; CACHE.emails = new Map(); }
  CACHE.version = v.version; CACHE.checkedAt = now;
  return v.version;
}
async function cachedEmployeeByEmail(z, email) {
  const k = String(email || '').trim().toLowerCase();
  if (!k) return null;
  if (CACHE.emails.has(k)) return CACHE.emails.get(k);
  const p = await findEmployee(z, 'email', email);
  CACHE.emails.set(k, p);
  return p;
}

/* ---------------------------------------------------------------------
   get(userApp, adminApp): who is signed in and what they may do. Throws HttpError 401/403.
   adminApp (catalyst.initialize(req, { scope:'admin' })) is used for Data Store reads;
   it may also be passed as { admin: adminApp }. Defaults to userApp.
   --------------------------------------------------------------------- */
function adminOf(cat, opts) {
  if (opts && typeof opts.zcql === 'function') return opts;
  if (opts && opts.admin) return opts.admin;
  return cat;
}
function scopeOf(base, ro, a, person) {
  if (ro.seesAll) return { all: true };
  const d = base.deleg, me = person ? norm(person.empId) : '';
  const ids = [];
  if (me && a.role === 'techEd') ids.push(...(d.teamTechEd[me] || []));
  if (me && a.role === 'compMgr') ids.push(...(d.teamCompMgr[me] || []));
  a.teams.forEach((t) => { const k = norm(t); ids.push(...(d.teamTechEd[k] || []), ...(d.teamCompMgr[k] || [])); });
  const seen = new Set(), empIds = [], rowIds = [];
  ids.forEach((id) => {
    const k = norm(id);
    if (!k || k === me || seen.has(k)) return;
    seen.add(k);
    empIds.push(String(id).trim());
    // Payroll_Data / Feedback rows name the employee by Employee_Master ROWID.
    const rowId = (d.rowIdOf || {})[k];
    if (rowId) rowIds.push(rowId);
  });
  return { all: false, cycleId: base.cycleId, empIds, rowIds };
}
async function get(cat, opts, context = {}) {
  // getCurrentUser() throws when the request carries no user credentials.
  let u = null;
  try { u = await cat.userManagement().getCurrentUser(); } catch (e) { u = null; }
  if (!u) throw new HttpError(401, 'Please sign in.');
  const email = String(u.email_id || '').trim().toLowerCase();
  const fail = (status, msg) => { const e = new HttpError(status, msg); e.email = email; return e; };
  const catalystRole = u.role_details && u.role_details.role_name;
  const z = zq(adminOf(cat, opts));
  const base = await ensureCache(z, context);
  const person = await cachedEmployeeByEmail(z, email);
  const b = baseRoleOf(base.roles, person, catalystRole, base.deleg);
  const viaCatalyst = b.from === 'Catalyst role' || b.from === 'Catalyst bootstrap';
  if (!viaCatalyst) {
    if (!person) throw fail(403, 'Your login email is not in the Employee Master. Please contact HR.');
    if (!person.active) throw fail(403, 'You are inactive in the Employee Master. Please contact HR.');
  }
  const ovs = (person ? base.overridesBy[norm(person.empId)] : null) || base.overridesBy[norm(email)] || [];
  const a = accessOf(base.C, base.roles, base.m, person, b.role, ovs);
  if (!a.role) throw fail(403, 'You have no access to the Compensation tool. Please contact HR.');
  const ro = base.roles.find((r) => r.key === a.role);
  return {
    version: base.version,
    user: { email, empId: person ? person.empId : '', name: person ? person.name : email },
    role: a.role, roleLabel: ro.label, roleFrom: a.roleOverride ? 'Override' : b.from,
    screens: a.screens, actions: a.actions, fields: a.fields, scope: scopeOf(base, ro, a, person)
  };
}

/* check(userApp, adminApp | { admin }) — get() + dry run.
   Enforced (ACCESS_ENFORCE='true'): returns access with enforced:true, dryRun:false; rethrows HttpError.
   Dry run: never throws an HttpError. Returns the access with enforced:false, dryRun:true, or
   { dryRun:true, enforced:false, denied:HttpError } when the person would be refused (logged). */
async function check(cat, opts, context = {}) {
  const enforced = isEnforced();
  try {
    const a = await get(cat, opts, context);
    return Object.assign(a, { enforced, dryRun: !enforced });
  } catch (err) {
    if (enforced) throw err;
    // Dry run must never change behaviour: log any failure (rule refusal or not) and carry on.
    if (err instanceof HttpError) console.log('ACCESS dry-run: would deny', err.email || '(unknown)', err.message);
    else console.error('ACCESS dry-run: access check failed', err && err.message ? err.message : err);
    return { dryRun: true, enforced: false, denied: err };
  }
}
/* guard(a, fn): run a rule check. Enforced → fn throws as usual. Dry run → a refusal is
   only logged. Returns true when allowed (always true in dry run, except already-denied). */
function guard(a, fn) {
  if (a && a.enforced) { fn(a); return true; }
  if (!a || a.denied) return true;
  try { fn(a); return true; } catch (err) {
    if (!(err instanceof HttpError)) throw err;
    console.log('ACCESS dry-run: would deny', (a.user && a.user.email) || '(unknown)', err.message);
    return true;
  }
}

const RANK = { none: 0, view: 1, edit: 2 };
function requireScreen(a, key, level) { if (RANK[a.screens[key] || 'none'] < RANK[level || 'view']) throw new HttpError(403, 'You do not have access to this screen.'); }
function requireAction(a, key) { if (!a.actions[key]) throw new HttpError(403, 'You are not allowed to do this.'); }
/* canEdit(a, fieldKey) — also accepts an Appraisal_Sheet column name. */
function canEdit(a, fieldKey) {
  if (a.fields[fieldKey] !== undefined) return a.fields[fieldKey] === 'edit';
  const k = COLUMN_FIELDS[fieldKey];
  return k ? a.fields[k] === 'edit' : false;
}
/* canEditColumn(a, column) — Appraisal_Sheet column. Columns that are not access-controlled
   fields (emp_id, ROWID, cycle columns…) return null so the caller can decide. */
function canEditColumn(a, column) { const k = COLUMN_FIELDS[column]; return k ? a.fields[k] === 'edit' : null; }
function requireEditColumns(a, columns) {
  const bad = (columns || []).filter((c) => canEditColumn(a, c) === false);
  if (bad.length) throw new HttpError(403, 'You cannot edit: ' + bad.join(', ') + '.');
}
function fieldOfColumn(column) { return COLUMN_FIELDS[column] || null; }

/* Fields of the screens other than the Appraisal Sheet (Fields tab, one group per screen).
   Key = <screen>_<slug of the field label>. A field the catalogue does not know stays editable
   (nothing to restrict), exactly like the screens' own front-end. */
function fieldKeyOf(screen, label) { return screen + '_' + fslug(label); }
function fieldLimitOf(a, screen, label) {
  const v = a && a.fields ? a.fields[fieldKeyOf(screen, label)] : undefined;
  return v === 'read' || v === 'hidden' ? v : 'edit';
}
function requireEditFields(a, screen, labels) {
  const bad = (labels || []).filter((l) => fieldLimitOf(a, screen, l) !== 'edit');
  if (bad.length) throw new HttpError(403, 'You cannot edit: ' + bad.join(', ') + '.');
}

const scopeSets = new WeakMap();
function inScope(a, rowOrEmpId) {
  if (!a || !a.scope) return false;
  if (a.scope.all) return true;
  let set = scopeSets.get(a.scope);
  if (!set) { set = new Set((a.scope.empIds || []).concat(a.scope.rowIds || []).map(norm)); scopeSets.set(a.scope, set); }
  const id = rowOrEmpId && typeof rowOrEmpId === 'object' ? (rowOrEmpId.emp_id != null ? rowOrEmpId.emp_id : rowOrEmpId.empId) : rowOrEmpId;
  const k = norm(id);
  return !!k && set.has(k);
}
/* shapeRow — page-shaped row (field keys). */
function shapeRow(a, row) { const out = {}; Object.keys(row).forEach((k) => { if (k === 'empId' || a.fields[k] !== 'hidden') out[k] = row[k]; }); return out; }
/* shapeRowByColumns — DB-shaped row (Appraisal_Sheet snake_case columns). emp_id always kept. */
function shapeRowByColumns(a, row) {
  const out = {};
  Object.keys(row).forEach((c) => {
    if (c === 'emp_id') { out[c] = row[c]; return; }
    const k = COLUMN_FIELDS[c];
    if (k && a.fields[k] === 'hidden') return;
    out[c] = row[c];
  });
  return out;
}
/* scopeRows(a, rows) — enforced: own scope + hidden columns removed; dry run: unchanged. */
function scopeRows(a, rows) {
  if (!a || !a.enforced) return rows;
  return rows.filter((r) => inScope(a, r)).map((r) => shapeRowByColumns(a, r));
}

/* Version — raised on every change that can alter anyone's access. Other functions call
   bumpVersion() after Delegation / Employee_Master changes. Invalidates this instance's cache. */
async function bumpVersion(cat, by, why) {
  const v = await getVersion(zq(cat)), t = cat.datastore().table(T.version);
  const row = { version_key: 'ACCESS', version: v.version + 1, changed_by: by || '', changed_at: nowDT(), why: String(why || '').slice(0, 200) };
  if (v.rowid) await t.updateRow(Object.assign({ ROWID: v.rowid }, row)); else await t.insertRow(row);
  resetCache();
  return v.version + 1;
}

module.exports = {
  SETTINGS, T, BUILT_IN_ROLES, START_CATALOG, FIELD_COLUMNS, COLUMN_FIELDS, LEVELS, LIMITS, OV_TYPES, HttpError,
  nowDT, today, q, bool, norm, ID_RE, DATE_RE, isEnforced,
  whenNotBusy, selectAll, buildCatalog, loadCatalog, loadRoles, loadMatrix, resolveFields, activeCycleId, loadDelegation, hasTeam, emRow, findEmployee,
  loadOverrides, live, baseRoleOf, accessOf, scopeOf, get, check, guard, requireScreen, requireAction, canEdit, canEditColumn, requireEditColumns,
  fieldOfColumn, fieldKeyOf, fieldLimitOf, requireEditFields, inScope, shapeRow, shapeRowByColumns, scopeRows, getVersion, currentVersion, bumpVersion, resetCache, ensureCache,
  _cache: CACHE
};