"use strict";
const assert=require("assert");
const Module=require("module");
const path=require("path");
const T={
 employees:"74008000000035727",cycles:"74008000000034190",payroll:"74008000000035326",
 feedback:"74008000000022041",eligibility:"74008000000057046",sheet:"74008000000039094",
 budgetMaster:"74008000000034565",distribution:"74008000000033809",
 distributionComp:"74008000000023149",audit:"74008000000034940"
};
let DB,seq,user,accessEnforced=false,failUpdateTable="";
function makeTable(id) {
  const rows = DB[id] || (DB[id] = []);
  const add = (row) => {
    const saved = { ...row, ROWID: String(++seq) };
    rows.push(saved);
    return { ...saved };
  };
  return {
    getPagedRows: async () => ({ data: rows.map((row) => ({ ...row })), more_records: false }),
    insertRows: async (batch) => batch.map(add),
    updateRows: async (batch) => {
      if (failUpdateTable === id) throw new Error("simulated update failure");
      return batch.map((patch) => {
        const row = rows.find((item) => item.ROWID === String(patch.ROWID));
        if (!row) throw new Error("missing row " + patch.ROWID);
        Object.assign(row, patch);
        return { ...row };
      });
    },
    deleteRows: async (ids) => {
      ids.forEach((rowId) => {
        const index = rows.findIndex((row) => row.ROWID === String(rowId));
        if (index >= 0) rows.splice(index, 1);
      });
      return true;
    },
  };
}
function load(){
 const dir=path.resolve(__dirname,"..");
 Object.keys(require.cache).forEach(k=>{if(k.startsWith(dir)&&!k.includes("node_modules"))delete require.cache[k];});
 const accessStub={HttpError:class HttpError extends Error{constructor(status,message){super(message);this.status=status;}},isEnforced:()=>accessEnforced,check:async()=>({role:user?.role||"hr"})};
 const catalystStub={initialize:()=>({datastore:()=>({table:makeTable}),userManagement:()=>({getCurrentUser:async()=>user})})};
 const orig=Module._load;Module._load=function(req,...rest){if(req==="zcatalyst-sdk-node")return catalystStub;if(req==="./accessCore")return accessStub;return orig.call(this,req,...rest);};
 try{return require("../index.js");}finally{Module._load=orig;}
}
function reset(){
 DB={};seq=100;failUpdateTable="";user={user_id:"1",email_id:"hr@test",role:"hr"};
 DB[T.employees]=[{ROWID:"E1",emp_id:"LT00001",emp_name:"Employee One",emp_status:"Active"}];
 DB[T.cycles]=[
  {ROWID:"C1",cycle_name:"Annual 2025",status:"Closed",effective_date:"2025-04-01"},
  {ROWID:"C2",cycle_name:"Annual 2026",status:"Active",effective_date:"2026-04-01",location:"India"}
 ];
 DB[T.payroll]=[{ROWID:"P1",emp_id:"E1",emp_name:"Employee One",appraisal_cycle_name:"C1",fy_year:"2025",current_annual_base_pay:100000}];
 DB[T.feedback]=[{ROWID:"F1",emp_ID:"E1",emp_name:"E1",appraisal_cycle_name:"C1",manager_feedback:"Good",manager_rating:4,Effective_Date:"2025-04-01"}];
 DB[T.sheet]=[{ROWID:"S1",emp_id:"LT00001",emp_master_row_id:"E1",cycle_id:"C2",previous_year_CTC_with_rewards:150000}];
 DB[T.budgetMaster]=[{ROWID:"B1",appraisal_cycle_id:"C2",org_budget_base:90000,original_headcount:1}];
 DB[T.distribution]=[{ROWID:"D1",appraisal_cycle_id:"C2",appraiser_tech_ed_id:"TE001",original_headcount:1,claculated_budget:100}];
 DB[T.distributionComp]=[{ROWID:"DC1",budget_distribution_id:"D1",appraisal_cycle_id:"C2",comp_manager:"CM001",original_headcount:1,calculated_budget:100}];
 DB[T.eligibility]=[];DB[T.audit]=[];
}
function call(api,method,resource,body){return new Promise((resolve,reject)=>{const req={method,url:"/?resource="+resource,body,on(){}};const res={status:0,writeHead(s){this.status=s;},end(raw){resolve({status:this.status,json:JSON.parse(raw||"{}")});}};api(req,res).catch(reject);});}
let passed=0,failed=0;
async function test(name,fn){try{reset();await fn();passed++;console.log("PASS",name);}catch(e){failed++;console.error("FAIL",name,e.stack||e);}}
(async()=>{
 await test("Preview is read-only and proposes only LT historical copies; budget aggregates remain untouched",async()=>{
  const api=load(),before=JSON.stringify(DB),p=await api._internals.buildPlan(Object.fromEntries(Object.entries(T).map(([k,id])=>[k,makeTable(id)])));
  assert.strictEqual(JSON.stringify(DB),before);
  assert.strictEqual(p.stats.safeInserts,2);
  assert.strictEqual(p.stats.safeUpdates,0);
  assert(p.ops.some(o=>o.table==="feedback"&&o.values.Effective_Date==="2026-04-01"));
  assert(!p.ops.some(o=>["budgetMaster","distribution","distributionComp"].includes(o.table)));
 });
 await test("Apply writes proposed changes and Revert restores the exact before-state",async()=>{
  const api=load(),tables=Object.fromEntries(Object.entries(T).map(([k,id])=>[k,makeTable(id)]));
  const p=await api._internals.buildPlan(tables),applied=await api._internals.apply(tables,p,"HR");
  assert.strictEqual(DB[T.payroll].filter(r=>r.appraisal_cycle_name==="C2").length,1);
  assert.strictEqual(DB[T.feedback].find(r=>r.appraisal_cycle_name==="C2").Effective_Date,"2026-04-01");
  assert.strictEqual(DB[T.budgetMaster][0].org_budget_base,90000);
  const reverted=await api._internals.revert(tables,applied.batchId,"HR");
  assert.strictEqual(reverted.restored,0);assert.strictEqual(reverted.deleted,2);
  assert.strictEqual(DB[T.payroll].length,1);assert.strictEqual(DB[T.feedback].length,1);
  assert.strictEqual(DB[T.budgetMaster][0].org_budget_base,90000);
 });
 await test("A failed partial Apply automatically rolls back earlier inserts",async()=>{
  const api=load(),tables=Object.fromEntries(Object.entries(T).map(([k,id])=>[k,makeTable(id)]));
  DB[T.sheet][0].emp_master_row_id="WRONG";
  const p=await api._internals.buildPlan(tables);failUpdateTable=T.sheet;
  await assert.rejects(()=>api._internals.apply(tables,p,"HR"),/all recorded changes were rolled back/);
  assert.strictEqual(DB[T.payroll].length,1);
  assert.strictEqual(DB[T.feedback].length,1);
  assert.strictEqual(DB[T.budgetMaster][0].org_budget_base,90000);
  assert(DB[T.audit].some(r=>r.source==="data_reconciliation_undone"));
 });
 await test("Revert refuses to overwrite a row changed after Apply",async()=>{
  const api=load(),tables=Object.fromEntries(Object.entries(T).map(([k,id])=>[k,makeTable(id)]));
  DB[T.sheet][0].emp_master_row_id="WRONG";
  const p=await api._internals.buildPlan(tables),applied=await api._internals.apply(tables,p,"HR");
  DB[T.sheet][0].emp_master_row_id="CHANGED_AFTER_APPLY";
  await assert.rejects(()=>api._internals.revert(tables,applied.batchId,"HR"),/changed after Apply/);
 });
 await test("Orphan references are reported and never deleted or guessed",async()=>{
  DB[T.payroll].push({ROWID:"PX",emp_id:"LT99999",appraisal_cycle_name:"C1"});
  const api=load(),p=await api._internals.buildPlan(Object.fromEntries(Object.entries(T).map(([k,id])=>[k,makeTable(id)])));
  assert(p.issues.some(x=>x.type==="orphan_employee_reference"&&x.rowId==="PX"));
  assert(!p.ops.some(x=>x.rowId==="PX"));
  assert(DB[T.payroll].some(x=>x.ROWID==="PX"));
 });
 await test("Duplicate employee-cycle rows are reported, not auto-deleted",async()=>{
  DB[T.payroll].push({ROWID:"P2",emp_id:"E1",appraisal_cycle_name:"C1"});
  const api=load(),p=await api._internals.buildPlan(Object.fromEntries(Object.entries(T).map(([k,id])=>[k,makeTable(id)])));
  assert(p.issues.some(x=>x.type==="duplicate_employee_cycle"&&x.rowId==="P2"));
  assert(!p.ops.some(x=>x.rowId==="P2"));
 });
 await test("Feedback emp_ID and emp_name lookups must reference the same employee",async()=>{
  DB[T.employees].push({ROWID:"E2",emp_id:"LT00002",emp_name:"Employee Two",emp_status:"Active"});
  DB[T.feedback][0].emp_name="E2";
  const api=load(),p=await api._internals.buildPlan(Object.fromEntries(Object.entries(T).map(([k,id])=>[k,makeTable(id)])));
  assert(p.ops.some(o=>o.table==="feedback"&&o.rowId==="F1"&&o.patch.emp_name==="E1"));
 });
 await test("Mismatched Appraisal Sheet employee lookup is aligned only by exact emp_id",async()=>{
  DB[T.employees].push({ROWID:"E2",emp_id:"LT00002",emp_name:"Employee Two",emp_status:"Active"});
  DB[T.sheet][0].emp_master_row_id="E2";
  const api=load(),p=await api._internals.buildPlan(Object.fromEntries(Object.entries(T).map(([k,id])=>[k,makeTable(id)])));
  assert(p.ops.some(o=>o.table==="sheet"&&o.rowId==="S1"&&o.patch.emp_master_row_id==="E1"));
 });
 await test("Budget aggregate tables are excluded from LT-only cleanup",async()=>{
  DB[T.budgetMaster].push({ROWID:"B2",appraisal_cycle_id:"C2",org_budget_base:1});
  const api=load(),p=await api._internals.buildPlan(Object.fromEntries(Object.entries(T).map(([k,id])=>[k,makeTable(id)])));
  assert(!p.issues.some(x=>x.table==="budgetMaster"));
  assert(!p.ops.some(o=>o.table==="budgetMaster"));
 });
 await test("Tech-ED role is refused by the API",async()=>{
  user={user_id:"2",email_id:"te@test",role:"techEd"};
  const r=await call(load(),"GET","preview");
  assert.strictEqual(r.status,403);
 });
 await test("Duplicate latest Closed-cycle sources are not copied arbitrarily",async()=>{
  DB[T.payroll].push({ROWID:"P2",emp_id:"E1",appraisal_cycle_name:"C1",current_annual_base_pay:120000});
  DB[T.feedback].push({ROWID:"F2",emp_ID:"E1",emp_name:"E1",appraisal_cycle_name:"C1",manager_feedback:"Other",manager_rating:3});
  const api=load(),p=await api._internals.buildPlan(Object.fromEntries(Object.entries(T).map(([k,id])=>[k,makeTable(id)])));
  assert(p.issues.some(x=>x.type==="ambiguous_payroll_source"));
  assert(p.issues.some(x=>x.type==="ambiguous_feedback_source"));
  assert.strictEqual(p.ops.filter(x=>x.kind==="insert").length,0);
 });
 await test("Missing historical payroll or feedback sources are reported without fabricated inserts",async()=>{
  DB[T.payroll]=[];DB[T.feedback]=[];
  const api=load(),p=await api._internals.buildPlan(Object.fromEntries(Object.entries(T).map(([k,id])=>[k,makeTable(id)])));
  assert(p.issues.some(x=>x.type==="missing_payroll_source"));
  assert(p.issues.some(x=>x.type==="missing_feedback_source"));
  assert.strictEqual(p.ops.filter(x=>x.kind==="insert").length,0);
 });
 await test("Canonical employee and cycle matching prevents false missing Payroll inserts",async()=>{
  DB[T.payroll].push({ROWID:"P2",emp_id:"LT00001",emp_name:"Employee One",appraisal_cycle_name:"Annual 2026",fy_year:"2026",current_annual_base_pay:110000});
  const api=load(),p=await api._internals.buildPlan(Object.fromEntries(Object.entries(T).map(([k,id])=>[k,makeTable(id)])));
  assert.strictEqual(p.ops.filter(o=>o.table==="payroll"&&o.kind==="insert").length,0);
  assert(!p.issues.some(x=>x.type==="missing_payroll_source"));
 });
 await test("Appraisal Sheet duplicate detection uses exact emp_id rather than stale lookup IDs",async()=>{
  DB[T.employees].push({ROWID:"E2",emp_id:"LT00002",emp_name:"Employee Two",emp_status:"Active"});
  DB[T.sheet].push({ROWID:"S2",emp_id:"LT00002",emp_master_row_id:"E1",cycle_id:"Annual 2026",previous_year_CTC_with_rewards:200000});
  const api=load(),p=await api._internals.buildPlan(Object.fromEntries(Object.entries(T).map(([k,id])=>[k,makeTable(id)])));
  assert(!p.issues.some(x=>x.type==="duplicate_employee_cycle"&&x.table==="sheet"));
  assert(p.ops.some(o=>o.table==="sheet"&&o.rowId==="S2"&&o.patch.emp_master_row_id==="E2"));
 });
 await test("Non-LT employees and their Payroll, Feedback, Eligibility and Sheet rows are never changed",async()=>{
  DB[T.employees].push({ROWID:"E2",emp_id:"EMP002",emp_name:"Real Employee",emp_status:"Active"});
  DB[T.payroll].push({ROWID:"P_REAL",emp_id:"E2",emp_name:"Real Employee",appraisal_cycle_name:"C1"});
  DB[T.feedback].push({ROWID:"F_REAL",emp_ID:"E2",emp_name:"E2",appraisal_cycle_name:"C1",manager_feedback:"Real"});
  DB[T.sheet].push({ROWID:"S_REAL",emp_id:"EMP002",emp_master_row_id:"WRONG",cycle_id:"C2",previous_year_CTC_with_rewards:999});
  DB[T.eligibility].push({ROWID:"EL_REAL",emp_id:"EMP002",employee_master_id:"WRONG",appraisal_cycle_id:"C2"});
  const before=JSON.stringify({p:DB[T.payroll].find(x=>x.ROWID==="P_REAL"),f:DB[T.feedback].find(x=>x.ROWID==="F_REAL"),s:DB[T.sheet].find(x=>x.ROWID==="S_REAL"),e:DB[T.eligibility].find(x=>x.ROWID==="EL_REAL")});
  const api=load(),p=await api._internals.buildPlan(Object.fromEntries(Object.entries(T).map(([k,id])=>[k,makeTable(id)])));
  assert(!p.ops.some(o=>["P_REAL","F_REAL","S_REAL","EL_REAL"].includes(o.rowId)));
  assert(!p.issues.some(x=>["P_REAL","F_REAL","S_REAL","EL_REAL"].includes(x.rowId)));
  assert.strictEqual(JSON.stringify({p:DB[T.payroll].find(x=>x.ROWID==="P_REAL"),f:DB[T.feedback].find(x=>x.ROWID==="F_REAL"),s:DB[T.sheet].find(x=>x.ROWID==="S_REAL"),e:DB[T.eligibility].find(x=>x.ROWID==="EL_REAL")}),before);
 });
 await test("Only LT Appraisal Sheet rows participate in duplicate detection",async()=>{
  DB[T.employees].push({ROWID:"E2",emp_id:"EMP002",emp_name:"Real Employee",emp_status:"Active"});
  DB[T.sheet].push({ROWID:"S_REAL",emp_id:"EMP002",emp_master_row_id:"E2",cycle_id:"C2",previous_year_CTC_with_rewards:999});
  const api=load(),p=await api._internals.buildPlan(Object.fromEntries(Object.entries(T).map(([k,id])=>[k,makeTable(id)])));
  assert(!p.issues.some(x=>x.type==="duplicate_employee_cycle"&&x.table==="sheet"&&x.rowId==="S_REAL"));
 });
 await test("Budget aggregates are never updated by LT-only reconciliation",async()=>{
  const api=load(),p=await api._internals.buildPlan(Object.fromEntries(Object.entries(T).map(([k,id])=>[k,makeTable(id)])));
  assert(!p.ops.some(o=>["budgetMaster","distribution","distributionComp"].includes(o.table)));
  assert(!p.issues.some(x=>x.table==="budgetMaster"||x.table==="distribution"||x.table==="distributionComp"));
 });
 console.log("RESULT",passed,"passed,",failed,"failed");
 if(failed)process.exitCode=1;
})();