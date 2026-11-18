"use strict";
const crypto = require("crypto");
const catalyst = require("zcatalyst-sdk-node");
const access = require("./accessCore");
const TABLES = {
  employees:"74008000000035727", cycles:"74008000000034190", payroll:"74008000000035326",
  feedback:"74008000000022041", eligibility:"74008000000057046", sheet:"74008000000039094",
  budgetMaster:"74008000000034565", distribution:"74008000000033809",
  distributionComp:"74008000000023149", audit:"74008000000034940"
};
const PAGE=200, WRITE=100, AUDIT_LIMIT=8500;
const SOURCE={undo:"data_reconciliation_undo",summary:"data_reconciliation_summary",undone:"data_reconciliation_undone"};
class ApiError extends Error { constructor(message,status=400){super(message);this.status=status;} }
const norm=v=>String(v??"").trim().toLowerCase();
const rid=r=>String(r?.ROWID??r?.rowid??"").trim();
const ref=v=>v&&typeof v==="object"?String(v.ROWID??v.rowid??v.id??v.value??"").trim():String(v??"").trim();
const blank=v=>v===null||v===undefined||String(v).trim()==="";
const num=v=>{if(typeof v==="number")return Number.isFinite(v)?v:0;const n=Number(String(v??"").replace(/[,₹\s]/g,""));return Number.isFinite(n)?n:0;};
const cycleDate=r=>String(r.effective_date||r.end_date||r.start_date||"").slice(0,10);
const closed=c=>norm(c.status)==="closed"||c.archived===true||["true","1","yes"].includes(norm(c.archived));
const active=c=>norm(c.status)==="active";
const newJoiner=c=>/new\s*joiner/i.test(String(c.cycle_type||c.cycle_name||""));
const business=r=>Object.fromEntries(Object.entries(r||{}).filter(([k])=>!["ROWID","CREATORID","CREATEDTIME","MODIFIEDTIME"].includes(k)));
const same=(a,b)=>JSON.stringify(a??null)===JSON.stringify(b??null);
function send(res,status,data){res.writeHead(status,{"Content-Type":"application/json"});res.end(JSON.stringify(data));}
function query(req){const u=new URL(req.url||"/","http://localhost");return {...Object.fromEntries(u.searchParams.entries()),...(req.queryParams||{})};}
function bodyOf(req){
 if(req.body&&typeof req.body==="object")return Promise.resolve(req.body);
 if(typeof req.body==="string"){try{return Promise.resolve(JSON.parse(req.body));}catch{return Promise.reject(new ApiError("Invalid JSON body."));}}
 return new Promise((resolve,reject)=>{let raw="";req.on("data",p=>{raw+=p.toString();if(raw.length>2000000)reject(new ApiError("Request too large.",413));});req.on("end",()=>{try{resolve(raw.trim()?JSON.parse(raw):{});}catch{reject(new ApiError("Invalid JSON body."));}});req.on("error",reject);});
}
async function all(t){const rows=[];let token,more=true;while(more){const o={maxRows:PAGE};if(token)o.nextToken=token;const p=await t.getPagedRows(o);rows.push(...(p.data||[]));token=p.next_token||null;more=p.more_records===true&&!!token;}return rows;}
async function requireHR(req){
 const userApp=catalyst.initialize(req), user=await userApp.userManagement().getCurrentUser().catch(()=>null);
 if(!user?.user_id)throw new ApiError("Sign in to continue.",401);
 const actor=user.display_name||[user.first_name,user.last_name].filter(Boolean).join(" ")||user.email_id||"HR";
 if(access.isEnforced()){const a=await access.check(userApp,catalyst.initialize(req,{scope:"admin"}));if(a?.role!=="hr")throw new ApiError("Data correction is available to HR Admin only.",403);}
 else {const role=norm(user.role_details?.role_name||user.role_name).replace(/[^a-z0-9]/g,"");if(!["hr","appadministrator"].includes(role))throw new ApiError("Data correction is available to HR Admin only.",403);}
 return actor;
}
function auditRow(actor,source,batchId,details){return {emp_id:"RECON",employee_name:"Data reconciliation",field_name:"Reconcile",old_value:"",new_value:"",changed_by:String(actor||"").slice(0,50),changed_at:new Date().toISOString().slice(0,19).replace("T"," "),source,batch_id:batchId,appraisal_year:"All cycles",details:JSON.stringify(details)};}
function packUndo(ops){const out=[];let p={updates:[],inserts:[]};const flush=()=>{if(p.updates.length||p.inserts.length)out.push(p);p={updates:[],inserts:[]};};for(const op of ops){const k=op.kind==="update"?"updates":"inserts";p[k].push(op.undo);if(JSON.stringify(p).length>AUDIT_LIMIT){p[k].pop();flush();p[k].push(op.undo);}}flush();return out;}
const hash=ops=>crypto.createHash("sha256").update(JSON.stringify(ops)).digest("hex");
function issue(issues,type,table,row,message,safe=false){issues.push({type,table,rowId:rid(row),empId:String(row?.emp_id||""),cycleId:ref(row?.cycle_id||row?.appraisal_cycle_name||row?.appraisal_cycle_id),message,safe});}
function validFeedback(r){return ["manager_feedback","manager_rating","client_feedback","client_rating","revenue_released","gross_margin","interview_count","at_risk","new_title","eligible_for_promotion"].some(k=>!blank(r?.[k]));}
async function buildPlan(t){
 const keys=Object.keys(TABLES).filter(k=>k!=="audit");
 const data=Object.fromEntries(await Promise.all(keys.map(async k=>[k,await all(t[k])])));
 const issues=[],ops=[],stats={scanned:{},safeUpdates:0,safeInserts:0,unresolved:0,duplicates:0};
 keys.forEach(k=>stats.scanned[k]=data[k].length);
 const byId=new Map(),byRow=new Map(),byName=new Map(),nameCount=new Map();
 data.employees.forEach(e=>{const id=norm(e.emp_id),row=rid(e),name=norm(e.emp_name);if(id){if(!byId.has(id))byId.set(id,[]);byId.get(id).push(e);}if(row)byRow.set(row,e);if(name){byName.set(name,e);nameCount.set(name,(nameCount.get(name)||0)+1);}});
 const cyclesById=new Map(data.cycles.map(c=>[rid(c),c])),cyclesByName=new Map();
 data.cycles.forEach(c=>{const n=norm(c.cycle_name);if(n){if(!cyclesByName.has(n))cyclesByName.set(n,[]);cyclesByName.get(n).push(c);}});
 const employeeFor=v=>{const raw=ref(v);if(byRow.has(raw))return {person:byRow.get(raw),amb:false};const a=byId.get(norm(raw))||[];return {person:a.length===1?a[0]:null,amb:a.length>1};};
 const cycleFor=v=>{const raw=ref(v);if(cyclesById.has(raw))return cyclesById.get(raw);const a=cyclesByName.get(norm(raw))||[];return a.length===1?a[0]:null;};
 const employeeCycleMatch=(row,empCol,cycleCol,employeeRowId,cycleRowId)=>{
  const employee=employeeFor(row?.[empCol]).person,cycle=cycleFor(row?.[cycleCol]);
  return !!employee&&rid(employee)===employeeRowId&&!!cycle&&rid(cycle)===cycleRowId;
 };
 const update=(key,row,patch,reason)=>{if(!Object.keys(patch).some(k=>!same(ref(row[k]),ref(patch[k]))))return;ops.push({kind:"update",table:key,rowId:rid(row),patch,reason,undo:{table:key,rowId:rid(row),before:business(row),after:{...business(row),...patch}}});stats.safeUpdates++;};
 const fixEmployee=(key,col)=>data[key].forEach(r=>{if(blank(r[col]))return;let found=employeeFor(r[col]);if(!found.person&&!found.amb&&!blank(r.emp_id)){const a=byId.get(norm(r.emp_id))||[];if(a.length===1)found={person:a[0],amb:false};}if(found.person&&ref(r[col])!==rid(found.person))update(key,r,{[col]:rid(found.person)},"Resolve exact Employee_Master reference");else if(!found.person)issue(issues,found.amb?"ambiguous_employee_reference":"orphan_employee_reference",key,r,"Cannot resolve "+col+" to exactly one Employee_Master row.");});
 const fixCycle=(key,col)=>data[key].forEach(r=>{if(blank(r[col]))return;const c=cycleFor(r[col]);if(c&&ref(r[col])!==rid(c))update(key,r,{[col]:rid(c)},"Resolve exact appraisal cycle reference");else if(!c)issue(issues,"unresolved_cycle_reference",key,r,"Cannot resolve "+col+" to exactly one cycle.");});
 fixEmployee("payroll","emp_id");fixEmployee("feedback","emp_ID");fixEmployee("feedback","emp_name");
 data.feedback.forEach(r=>{const primary=employeeFor(r.emp_ID),secondary=employeeFor(r.emp_name);if(primary.person&&secondary.person&&rid(primary.person)!==rid(secondary.person))update("feedback",r,{emp_name:rid(primary.person)},"Keep both Feedback employee lookups on the same Employee_Master row");});
 const fixEmployeePair=(key,lookupCol,idCol)=>data[key].forEach(r=>{
  const id=norm(r[idCol]);if(!id)return;const matches=byId.get(id)||[];
  if(matches.length===1){const target=rid(matches[0]);if(ref(r[lookupCol])!==target)update(key,r,{[lookupCol]:target},"Align Employee_Master lookup with exact employee ID");}
  else issue(issues,matches.length?"ambiguous_employee_id":"missing_employee_master",key,r,"Employee ID "+String(r[idCol])+" does not resolve to exactly one Employee_Master row.");
 });
 fixEmployeePair("eligibility","employee_master_id","emp_id");fixEmployeePair("sheet","emp_master_row_id","emp_id");
 fixCycle("payroll","appraisal_cycle_name");fixCycle("feedback","appraisal_cycle_name");fixCycle("eligibility","appraisal_cycle_id");fixCycle("sheet","cycle_id");fixCycle("budgetMaster","appraisal_cycle_id");fixCycle("distribution","appraisal_cycle_id");fixCycle("distributionComp","appraisal_cycle_id");
 const dup=(key,empCol,cycleCol)=>{const seen=new Map();data[key].forEach(r=>{
  let employee=null;
  if((key==="sheet"||key==="eligibility")&&!blank(r.emp_id)){
   const matches=byId.get(norm(r.emp_id))||[];
   if(matches.length===1)employee=matches[0];
  }else{
   const found=employeeFor(r[empCol]);
   if(found.person)employee=found.person;
  }
  // Do not infer duplicate identity from an unresolved/stale lookup value.
  if(!employee)return;
  const cycle=cycleFor(r[cycleCol]);if(!cycle)return;
  const k=rid(employee)+"|"+rid(cycle);
  if(seen.has(k)){stats.duplicates++;issue(issues,"duplicate_employee_cycle",key,r,"Duplicate employee/cycle row for "+String(employee.emp_id||rid(employee))+"; existing row "+rid(seen.get(k))+".");}
  else seen.set(k,r);
 });};
 dup("payroll","emp_id","appraisal_cycle_name");dup("feedback","emp_ID","appraisal_cycle_name");dup("eligibility","employee_master_id","appraisal_cycle_id");dup("sheet","emp_master_row_id","cycle_id");
 const closedCycles=[...data.cycles].filter(closed).sort((a,b)=>cycleDate(b).localeCompare(cycleDate(a)));
 for(const cycle of data.cycles.filter(c=>active(c)&&!newJoiner(c))){
  const cid=rid(cycle),rows=data.sheet.filter(r=>{const c=cycleFor(r.cycle_id);return c&&rid(c)===cid;}),ids=[...new Set(rows.map(r=>norm(r.emp_id)).filter(Boolean))];
  for(const empId of ids){
   const matches=byId.get(empId)||[];
   if(matches.length!==1){issue(issues,matches.length?"ambiguous_employee_id":"missing_employee_master","sheet",rows.find(r=>norm(r.emp_id)===empId),"Active Appraisal Sheet employee ID does not resolve to one Employee_Master row.");continue;}
   const employee=matches[0],eid=rid(employee);
   const pNow=data.payroll.filter(r=>employeeCycleMatch(r,"emp_id","appraisal_cycle_name",eid,cid));
   if(!pNow.length){
    const sourceGroup=closedCycles.map(c=>({cycle:c,rows:data.payroll.filter(r=>employeeCycleMatch(r,"emp_id","appraisal_cycle_name",eid,rid(c)))})).find(x=>x.rows.length);
    if(sourceGroup&&sourceGroup.rows.length===1){const source=sourceGroup.rows[0],values={...business(source),emp_id:eid,emp_name:employee.emp_name||source.emp_name,appraisal_cycle_name:cid};ops.push({kind:"insert",table:"payroll",values,reason:"Copy latest unique Closed-cycle Payroll into Active generated cycle",undo:{table:"payroll",rowId:"",values}});stats.safeInserts++;}
    else if(sourceGroup)issue(issues,"ambiguous_payroll_source","payroll",{emp_id:empId,cycle_id:cid},"Latest Closed cycle has multiple Payroll rows for this employee; no source row was selected.");
    else issue(issues,"missing_payroll_source","payroll",{emp_id:empId,cycle_id:cid},"No Closed-cycle Payroll source exists; no values were fabricated.");
   }else if(pNow.length>1)issue(issues,"duplicate_active_payroll","payroll",pNow[1],"Multiple Payroll rows exist in the Active cycle.");
   const fNow=data.feedback.filter(r=>employeeCycleMatch(r,"emp_ID","appraisal_cycle_name",eid,cid));
   if(!fNow.length){
    const sourceGroup=closedCycles.map(c=>({cycle:c,rows:data.feedback.filter(r=>employeeCycleMatch(r,"emp_ID","appraisal_cycle_name",eid,rid(c))&&validFeedback(r))})).find(x=>x.rows.length);
    if(sourceGroup&&sourceGroup.rows.length===1){const source=sourceGroup.rows[0],values={...business(source),emp_ID:eid,emp_name:eid,appraisal_cycle_name:cid,Effective_Date:cycle.effective_date||cycle.start_date||source.Effective_Date};ops.push({kind:"insert",table:"feedback",values,reason:"Copy latest unique valid Closed-cycle Feedback into Active generated cycle"});stats.safeInserts++;}
    else if(sourceGroup)issue(issues,"ambiguous_feedback_source","feedback",{emp_id:empId,cycle_id:cid},"Latest Closed cycle has multiple valid Feedback rows for this employee; no source row was selected.");
    else issue(issues,"missing_feedback_source","feedback",{emp_id:empId,cycle_id:cid},"No valid Closed-cycle Feedback source exists; no rating or comment was invented.");
   }else if(fNow.length>1)issue(issues,"duplicate_active_feedback","feedback",fNow[1],"Multiple Feedback rows exist in the Active cycle.");
  }
 }
 const budgetCycles=new Map();data.budgetMaster.forEach(r=>{const cid=ref(r.appraisal_cycle_id);if(cid){if(!budgetCycles.has(cid))budgetCycles.set(cid,[]);budgetCycles.get(cid).push(r);}});
 for(const budget of data.budgetMaster){const budgetCycle=cycleFor(budget.appraisal_cycle_id),cid=budgetCycle?rid(budgetCycle):"";if(!cid)continue;if((budgetCycles.get(cid)||[]).length>1){issue(issues,"duplicate_budget_master_cycle","budgetMaster",budget,"Multiple Budget_Master rows exist for this cycle; org_budget_base was not changed.");continue;}const sheet=data.sheet.filter(r=>{const c=cycleFor(r.cycle_id);return c&&rid(c)===cid;});if(!sheet.length){issue(issues,"budget_base_no_sheet","budgetMaster",budget,"No Appraisal Sheet rows for this cycle; org_budget_base not changed.");continue;}const ids=sheet.map(r=>norm(r.emp_id)).filter(Boolean);if(new Set(ids).size!==ids.length){issue(issues,"budget_base_duplicate_sheet","budgetMaster",budget,"Duplicate employee IDs in Appraisal Sheet; org_budget_base not changed.");continue;}const total=sheet.reduce((s,r)=>s+num(r.previous_year_CTC_with_rewards),0);if(Math.abs(num(budget.org_budget_base)-total)>0.005){update("budgetMaster",budget,{org_budget_base:total},"Sum previous rewards from current generated Appraisal Sheet");issue(issues,"budget_base_mismatch","budgetMaster",budget,"org_budget_base "+num(budget.org_budget_base)+" differs from Appraisal Sheet total "+total+".",true);}}
 const distKeys=new Map();data.distribution.forEach(r=>{const k=ref(r.appraisal_cycle_id)+"|"+norm(r.appraiser_tech_ed_id);if(k!=="|"){if(!distKeys.has(k))distKeys.set(k,[]);distKeys.get(k).push(r);}});
 data.distribution.forEach(r=>{const k=ref(r.appraisal_cycle_id)+"|"+norm(r.appraiser_tech_ed_id);if((distKeys.get(k)||[]).length>1)issue(issues,"duplicate_teched_budget","distribution",r,"Duplicate Tech-Ed budget rows exist for this cycle and appraiser.");});
 const compKeys=new Map();data.distributionComp.forEach(r=>{const k=ref(r.budget_distribution_id)+"|"+ref(r.appraisal_cycle_id)+"|"+norm(r.comp_manager);if(k!=="||"){if(!compKeys.has(k))compKeys.set(k,[]);compKeys.get(k).push(r);}});
 data.distributionComp.forEach(r=>{const k=ref(r.budget_distribution_id)+"|"+ref(r.appraisal_cycle_id)+"|"+norm(r.comp_manager);if((compKeys.get(k)||[]).length>1)issue(issues,"duplicate_comp_budget","distributionComp",r,"Duplicate Comp Manager budget rows exist for this parent, cycle and manager.");});
 data.distributionComp.forEach(child=>{const parent=data.distribution.find(p=>rid(p)===ref(child.budget_distribution_id));if(!parent)issue(issues,"orphan_comp_budget","distributionComp",child,"Comp Manager budget has no matching Tech-Ed parent.");else {const pc=cycleFor(parent.appraisal_cycle_id),cc=cycleFor(child.appraisal_cycle_id);if(!pc||!cc||rid(pc)!==rid(cc))issue(issues,"budget_parent_cycle_mismatch","distributionComp",child,"Comp Manager and parent Tech-Ed budget belong to different cycles.");}});
 stats.unresolved=issues.filter(x=>!x.safe).length;
 return {ops,issues,stats};
}
function view(p){return {planToken:hash({ops:p.ops,issues:p.issues,stats:p.stats}),summary:{...p.stats,issueCount:p.issues.length,issueTypes:p.issues.reduce((o,x)=>(o[x.type]=(o[x.type]||0)+1,o),{})},issues:p.issues.slice(0,2000),issuesTruncated:p.issues.length>2000,operations:p.ops.map(o=>({action:o.kind,table:o.table,rowId:o.rowId||"",reason:o.reason}))};}
async function auditWrite(t,rows){for(let i=0;i<rows.length;i+=WRITE)await t.audit.insertRows(rows.slice(i,i+WRITE));}
async function apply(t,p,actor){
 const batchId=crypto.randomUUID().replace(/-/g,"").slice(0,24);
 await auditWrite(t,[auditRow(actor,SOURCE.summary,batchId,{kind:"data-reconciliation",action:"Applying",updates:p.stats.safeUpdates,inserts:p.stats.safeInserts})]);
 try{
  for(const key of Object.keys(TABLES).filter(k=>k!=="audit")){
   const ops=p.ops.filter(o=>o.table===key);
   const updates=ops.filter(o=>o.kind==="update"),inserts=ops.filter(o=>o.kind==="insert");
   for(let i=0;i<updates.length;i+=WRITE){
    const part=updates.slice(i,i+WRITE),packs=packUndo(part.map(o=>({kind:"update",undo:o.undo})));
    await auditWrite(t,packs.map(d=>auditRow(actor,SOURCE.undo,batchId,d)));
    await t[key].updateRows(part.map(o=>({ROWID:o.rowId,...o.patch})));
   }
   for(let i=0;i<inserts.length;i+=WRITE){
    const part=inserts.slice(i,i+WRITE),created=await t[key].insertRows(part.map(o=>o.values));
    const inserted=part.map((o,j)=>{const id=rid(created?.[j]);if(!id)throw new Error("Inserted "+key+" row did not return ROWID.");return {kind:"insert",undo:{table:key,rowId:id,values:o.values}};});
    const packs=packUndo(inserted);await auditWrite(t,packs.map(d=>auditRow(actor,SOURCE.undo,batchId,d)));
   }
  }
  await auditWrite(t,[auditRow(actor,SOURCE.summary,batchId,{kind:"data-reconciliation",action:"Applied",updates:p.stats.safeUpdates,inserts:p.stats.safeInserts})]);
  return {batchId,updates:p.stats.safeUpdates,inserts:p.stats.safeInserts};
 }catch(error){
  try{await revert(t,batchId,actor);throw new ApiError("Apply failed; all recorded changes were rolled back. "+error.message,500);}
  catch(rollbackError){if(rollbackError instanceof ApiError&&rollbackError.message.startsWith("Apply failed;"))throw rollbackError;throw new ApiError("Apply failed and automatic rollback was incomplete. Batch "+batchId+". Original error: "+error.message+"; rollback error: "+rollbackError.message,500);}
 }
}
async function revert(t,batchId,actor){
 if(!/^[a-f0-9]{24}$/.test(batchId))throw new ApiError("Invalid reconciliation batch ID.");
 const logs=await all(t.audit);
 if(!logs.some(r=>r.source===SOURCE.summary&&r.batch_id===batchId))throw new ApiError("Reconciliation batch not found.",404);
 if(logs.some(r=>r.source===SOURCE.undone&&r.batch_id===batchId))throw new ApiError("Batch already reverted.",409);
 const packs=logs.filter(r=>r.source===SOURCE.undo&&r.batch_id===batchId).map(r=>{try{return JSON.parse(r.details||"{}");}catch{return {};}}),updates=packs.flatMap(p=>p.updates||[]),inserts=packs.flatMap(p=>p.inserts||[]);
 const toRestore=[];
 for(const item of updates){const row=(await all(t[item.table])).find(r=>rid(r)===item.rowId);if(!row)throw new ApiError("Cannot revert: updated row no longer exists.",409);const beforeState=Object.entries(item.before||{}).every(([k,v])=>same(ref(row[k]),ref(v)));if(beforeState)continue;for(const [k,v] of Object.entries(item.after||{}))if(!same(ref(row[k]),ref(v)))throw new ApiError("Cannot revert: "+item.table+" row "+item.rowId+" changed after Apply ("+k+").",409);toRestore.push(item);}
 for(const item of inserts){const row=(await all(t[item.table])).find(r=>rid(r)===item.rowId);if(row)for(const [k,v] of Object.entries(item.values||{}))if(!same(ref(row[k]),ref(v)))throw new ApiError("Cannot revert: inserted row was changed after Apply.",409);}
 for(const item of toRestore)await t[item.table].updateRows([{ROWID:item.rowId,...item.before}]);
 const grouped={};inserts.forEach(x=>((grouped[x.table]||=[]).push(x.rowId)));for(const [key,ids] of Object.entries(grouped))for(let i=0;i<ids.length;i+=WRITE)await t[key].deleteRows(ids.slice(i,i+WRITE));
 await auditWrite(t,[auditRow(actor,SOURCE.undone,batchId,{kind:"data-reconciliation",action:"Reverted",restored:toRestore.length,deleted:inserts.length})]);
 return {restored:toRestore.length,deleted:inserts.length};
}
module.exports=async function(req,res){
 if(req.method==="OPTIONS"){res.writeHead(204);return res.end();}
 try{
  const actor=await requireHR(req),resource=String(query(req).resource||""),ds=catalyst.initialize(req,{scope:"admin"}).datastore();
  const t=Object.fromEntries(Object.entries(TABLES).map(([k,id])=>[k,ds.table(id)]));
  if(resource==="preview"&&req.method==="GET"){const p=await buildPlan(t);return send(res,200,{success:true,data:view(p)});}
  if(resource==="apply"&&req.method==="POST"){const b=await bodyOf(req),p=await buildPlan(t);if(!b.planToken||b.planToken!==hash({ops:p.ops,issues:p.issues,stats:p.stats}))throw new ApiError("Data changed after Preview. Run Preview again.",409);const result=await apply(t,p,actor);const after=await buildPlan(t);return send(res,200,{success:true,data:{...result,after:view(after).summary}});}
  if(resource==="revert"&&req.method==="POST"){const b=await bodyOf(req);return send(res,200,{success:true,data:await revert(t,String(b.batchId||""),actor)});}
  return send(res,404,{success:false,message:"Operation not found."});
 }catch(e){if(e instanceof access.HttpError)return send(res,e.status||403,{success:false,message:e.message});const status=e instanceof ApiError?e.status:500;if(status>=500)console.error(JSON.stringify({function:"datareconciliationapi",error:e.message,stack:e.stack}));return send(res,status,{success:false,message:e.message||"Data reconciliation failed."});}
};
module.exports._internals={buildPlan,view,hash,packUndo,validFeedback,apply,revert,TABLES,SOURCE};
