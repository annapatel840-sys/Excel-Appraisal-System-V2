/* GENERATED from the dummy "Bulk Operations" HTML by scripts/generate-bulk-ops.cjs. Do not edit by hand:
   change the dummy and run the script again.

   createBulkOps(root, cfg) runs the dummy's screen inside root (the .bo element, which plays the role of <body>).
   cfg: { apiUrl, cycle:{id,name,location}, canApply, applyNote, getSheetEmp(), getHdr(), onBudget(b,info), onApplied(batch), loadXLSX() }
   returns { reload(), dirty(), refresh(), setCycle(c), destroy() } */
/* eslint-disable */
export function createBulkOps(root, cfg) {
  cfg = cfg || {};
  var __docL = [], __winL = [];
  function onDoc(t, f, o) { document.addEventListener(t, f, o); __docL.push([t, f, o]); }
  function offDoc(t, f, o) { document.removeEventListener(t, f, o); }
  function onWin(t, f, o) { window.addEventListener(t, f, o); __winL.push([t, f, o]); }
  var XLSX = null;

/* ---------------- settings (same pattern as the Appraisal Sheet) ----------------
   Empty appraisalApiUrl = demo data in this file. With a URL the screen reads rows and budget from the
   server and Apply saves through POST /cells (source "bulk"). */
var APPRAISAL_API_URL = cfg.apiUrl || "";
var ACTIVE_CYCLE = cfg.cycle || { id: "", name: "Appraisal", location: "" };
function apiMode(){return !!APPRAISAL_API_URL}
function apiCall(method,path,body){
  return fetch(APPRAISAL_API_URL.replace(/\/+$/,"")+path,{method:method,credentials:"include",headers:{"Content-Type":"application/json"},body:body?JSON.stringify(body):undefined})
    .then(function(r){return r.json().catch(function(){return {}}).then(function(j){
      if(!r.ok||j.ok===false)throw new Error(j.error||("Server error "+r.status));return j})});
}
var ME=null,FA=null,SB=null,SB0=null;   // session, field access, server budget, budget-at-load sums
/* ---------------- demo data (stand-in for GET /rows) ---------------- */
/* Hike basis: the amount a typed Hike % is worked on. Fixed to Base pay. Every screen and the server use this one rule;
   stored as hikeBasis = "basePay" in AppSettings, so a global HR Config setting can be added later with no screen change. */
function hikeBasis(e){return e.basePay}
var BAND_OF={"Analyst":"B1","Senior Analyst":"B2","Consultant":"B2","Associate":"B3","Senior Associate":"B4","Lead":"B4","Manager":"B5","Senior Manager":"B6","Principal":"B6","Director":"B7"};
var BENCH={B1:[6,8,11],B2:[6,8,10.5],B3:[5.5,7.5,10],B4:[5,7,9.5],B5:[4.5,6.5,9],B6:[4,6,8.5],B7:[3.5,5.5,8]};
var BASE_RANGE={B1:[600000,900000],B2:[900000,1400000],B3:[1400000,2000000],B4:[2000000,2800000],B5:[2800000,4000000],B6:[4000000,6000000],B7:[6000000,9000000]};
var DESIGS=["Analyst","Senior Analyst","Consultant","Associate","Senior Associate","Lead","Manager","Senior Manager","Principal","Director"];
var FN=["Rohan","Anita","Vikram","Priya","Arjun","Neha","Karthik","Divya","Suresh","Meera","Rahul","Kavya","Imran","Sneha","Aditya","Pooja","Manoj","Lakshmi","Nikhil","Swati","Harish","Deepa","Varun","Ritu","Sanjay","Isha","Gautam","Tanvi","Prakash","Anjali","Mohan","Shreya","Ashok","Nandini","Yash","Bhavna"];
var LN=["Kapoor","Rao","Nair","Iyer","Menon","Shah","Gupta","Reddy","Pillai","Joshi","Bhat","Verma"];
var CMS=["Anita Sharma","Dev Malhotra","Sunil Varghese","Rekha Pandey"];
var TES=["Raj Mehta","Farah Khan"];
var SRC=["Campus","Lateral","Referral","Internal move"];   // demo values for the Appraisal Sheet "Source" field (to confirm)
var seed=7;function rnd(){seed=(seed*1103515245+12345)&0x7fffffff;return seed/0x7fffffff}
var EMP=[];
var PROMO_TO={};
(function(){
  var noRating={11:1,26:1},promoYes={5:1,12:1,19:1,30:1},hand={3:1,9:1,14:1,21:1,28:1};
  var NN=36;try{var _n=parseInt(new URLSearchParams(location.search).get("n"));if(_n>36)NN=_n}catch(x){}
  if(NN>36)TES=["Raj Mehta","Farah Khan","Arun Nambiar","Leena Thomas","Vivek Rao","Sita Menon","Omar Sheikh","Gita Das"];
  function pick(i){return DESIGS[(i*3+Math.floor(i/4))%DESIGS.length]}
  for(var i=0;i<NN;i++){
    var d=pick(i),b=BAND_OF[d],r=BASE_RANGE[b];
    var base=Math.round((r[0]+rnd()*(r[1]-r[0]))/10000)*10000;
    var rating=noRating[i%36]?null:Math.round((2.5+rnd()*2.4)*10)/10;
    var pbPaid=Math.round(base*(0.05+rnd()*0.05)/1000)*1000;
    var rbPaid=(i%3===0)?Math.round(base*0.04/1000)*1000:0;
    var e={empId:"EMP"+String(100+i*7).padStart(5,"0"),name:FN[i]+" "+LN[(i*5+3)%LN.length],designation:d,band:b,
      skillType:(i%5===1||i%5===3)?"Niche":"General",costCenter:"CC"+(10+(i%3)*10),yoe:Math.round((1+(i*7)%16)*10)/10,compManager:CMS[i%4],superManager:NN>36?TES[(i*3+(i>>3))%TES.length]:TES[(i%4)<2?0:1],source:SRC[(i*5+(i>>1))%4],rating:rating,basePay:base,pbPaid:pbPaid,rbPaid:rbPaid,
      hikeAmt:0,newPB:pbPaid,newRB:rbPaid,newPBInst:"1",tpbNext:Math.round(base*0.10/1000)*1000,
      remarks:"",promo:promoYes[i%36]?"Yes":"No",newTitle:promoYes[i%36]?(PROMO_TO[d]||"Senior "+d):"",clientRating:noRating[i%36]?null:Math.round((2.5+rnd()*2.4)*10)/10,hand:false,bulk:false,bBase0:base+pbPaid,rrPct:noRating[i%36]?null:58+((i*17)%50),grossMargin:18+((i*13)%40)};
    e.ratingLY=rating==null?null:Math.max(1,Math.min(5,Math.round((rating+((i%3)-1)*0.4)*10)/10));e.hikeLY=Math.round(base*(0.05+((i*7)%5)*0.01)/100)*100;e.hikeLY2=Math.round(base*(0.045+((i*3)%5)*0.01)/100)*100;e.hikeLY3=Math.round(base*(0.04+((i*11)%5)*0.01)/100)*100;   // demo last-year hike (Hike ₹); real data comes from the history table
    if(hand[i%36]){e.hikeAmt=Math.round(base*(0.065+rnd()*0.03));e.remarks="Set by manager";e.hand=true}
    EMP.push(e);
  }
})();

/* ---------------- state ---------------- */
var uidN=0;
var S={ov:{},role:"HR",user:"",locked:false,filt:{},active:[],fold:false,skipHand:true,off:{},page:1,sort:{key:null,dir:1},
  incTpb:false,colF:{},pv:null,batches:[],scenarios:[],rules:[],flash:"",err:"",busy:false,loading:false,lockReason:""};
var PAGE=20;
var FIELDS={
  hikePct:{label:"Hike %",key:"hikeAmt",kind:"pct"},
  hikeAmt:{label:"Hike Amount",key:"hikeAmt",kind:"amt"},
  newPB:{label:"Performance Bonus (PB)",key:"newPB",kind:"amt",floor:"pbPaid",floorLbl:"PB",unitPick:true},
  newRB:{label:"Retention Bonus (RB)",key:"newRB",kind:"amt",floor:"rbPaid",floorLbl:"RB",unitPick:true},
  tpbNext:{label:"Target PB for Next Year",key:"tpbNext",kind:"amt",unitPick:true}
};
var FORDER=["hikePct","newPB","newRB","tpbNext"];
/* "What to change": only these fields can be picked for now. The others stay in the list, greyed out.
   To switch the rest back on, add them here (e.g. ["hikePct","newPB","newRB","tpbNext"]). */
var ENABLED_FIELDS=["hikePct"];
function fieldOn(f){return ENABLED_FIELDS.indexOf(f)>=0}   // Hike is one entry: "Value is" picks % of Base pay (hikePct) or Amount (hikeAmt)
function isHike(f){return f==="hikePct"||f==="hikeAmt"}
var KEYS=["hikeAmt","newPB","newRB","tpbNext"];

function tedList(){var m={};EMP.forEach(function(e){if(e.superManager)m[e.superManager]=1});return Object.keys(m).sort()}
function newRule(field,first){
  return {uid:++uidN,field:field,method:"same",unit:field==="hikePct"?"pct":"amt",value:first?"0":"",inst:"1",text:"",textMode:"replace",
    distSrc:"amount",distAmt:"",distBy:"equal",adjDir:"add",adjAmt:"",tedVals:{}};
}
S.rules=[newRule("hikePct",true)];

/* ---------------- helpers ---------------- */
function $(id){return root.querySelector("#"+id)}
function esc(s){return String(s==null?"":s).replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]})}
function inr(n){return Number(n).toLocaleString("en-IN",{maximumFractionDigits:2})}
function pct(n){return Number(n).toFixed(2)+"%"}
function big(n){return Math.round(Number(n)||0).toLocaleString("en-IN")}   /* full amount, no symbol */
function bucket(e){return e.rating==null?null:Math.min(5,Math.max(1,Math.round(e.rating)))}
function nowT(){var d=new Date();return ("0"+d.getHours()).slice(-2)+":"+("0"+d.getMinutes()).slice(-2)}
function lvl(p){return p>100?"danger":p>90?"warn":""}
function ruleBy(uid){return S.rules.filter(function(r){return r.uid===uid})[0]}
function canEdit(key){return !apiMode()||!FA||!Object.keys(FA).length||!FA[key]||FA[key].access==="edit"}
function usedKeys(except){var u={};S.rules.forEach(function(r){if(r.uid!==except)u[FIELDS[r.field].key]=1});return u}

var SC_VER=0,_sc={emp:null,sh:null,ver:-1,out:[]};
function mergeRow(sh,srv){var o=Object.assign({},sh);Object.keys(srv).forEach(function(k){var v=srv[k];if((v==null||v==="")&&o[k]!=null&&o[k]!=="")return;o[k]=v});return o}
function sheetScope(){
  var sh=cfg.getSheetEmp?cfg.getSheetEmp():null;
  if(!sh||!sh.length)return EMP;
  if(_sc.emp===EMP&&_sc.sh===sh&&_sc.ver===SC_VER)return _sc.out;
  var by={};EMP.forEach(function(x){by[x.empId]=x});
  _sc={emp:EMP,sh:sh,ver:SC_VER,out:sh.map(function(x){var r=by[x.empId]?mergeRow(x,by[x.empId]):x;if(!r.band&&DESIG_BAND[r.designation])r=Object.assign({},r,{band:DESIG_BAND[r.designation]});return r})};
  return _sc.out;
}
function scope(){
  if(apiMode())return sheetScope();   // the rows are already limited to this login
  return EMP.filter(function(e){
    if(S.role==="HR")return true;
    if(S.role==="TE")return e.superManager===S.user;
    return e.compManager===S.user;
  });
}
function isHrView(){
  if(!apiMode())return S.role==="HR";
  var r=String(S.as||(ME&&(ME.activeRole||ME.role))||"").toLowerCase();
  return !r||/hr/.test(r)||!/tech|comp/.test(r);
}
/* ---------------- "For whom" filters: the list comes from HR Config, nothing is fixed here ----------------
   Each entry: {id, label, type, field, on, ranges}. type: search | select (values found in the data) | range (HR-defined buckets,
   e.g. 0-2, 2-5, 5+) | rating | edited. Order = order on screen. HR Config › Bulk Operations saves the list (POST /settings,
   key bulkFilters); in the demo it is shared through the browser. If nothing is configured, this default list is used. */
var FILTER_DEFAULT=[
  {id:"q",label:"Search",type:"search"},
  {id:"designation",label:"Designation",type:"select",field:"designation"},
  {id:"techEd",label:"Tech ED",type:"select",field:"superManager"},
  {id:"compManager",label:"Comp Manager",type:"select",field:"compManager"},
  {id:"source",label:"Source",type:"select",field:"source"},
  {id:"rating",label:"Manager Rating",type:"num",field:"rating"},
  {id:"clientRating",label:"Client Rating",type:"num",field:"clientRating"},
  {id:"promo",label:"Promotion",type:"select",field:"promo"},
  {id:"rrPct",label:"RR %",type:"range",field:"rrPct",ranges:[[0,60],[60,75],[75,90],[90,100],[100,null]]},
  {id:"grossMargin",label:"Gross Margin %",type:"range",field:"grossMargin",ranges:[[0,20],[20,30],[30,40],[40,50],[50,null]]},
  {id:"newTitle",label:"Promotion Designation",type:"select",field:"newTitle"},
  {id:"yoe",label:"YOE",type:"range",field:"yoe",ranges:[[0,2],[2,5],[5,10],[10,null]]}];
var FDEFS=FILTER_DEFAULT.slice();
var CFG_KEY="bulkForWhomCfg_v1";
function normFilters(list){
  return (list||[]).filter(function(d){return d&&d.on!==false&&d.field!=="band"&&d.id!=="band"&&d.type!=="edited"&&d.type!=="rating"&&(d.type==="search"||d.type==="rating"||d.type==="edited"||d.field)})
    .map(function(d){var id=d.id||d.field||d.type;return {id:id,label:d.label||id,type:d.type||"select",field:d.field,ranges:d.ranges||[]}});
}
function applyFilterCfg(list){
  var n=normFilters(list);if(!n.length)return;
  FDEFS=n;pruneActive();
}
function loadLocalFilterCfg(){try{var v=localStorage.getItem(CFG_KEY);if(v)applyFilterCfg(JSON.parse(v))}catch(x){}}
function rangeLabel(r){return r[1]==null?r[0]+"+":r[0]+"–"+r[1]}
function customR(x){var m=/^c:([^:]*):([^:]*)$/.exec(String(x));return m?[Number(m[1]),m[2]===""?null:Number(m[2])]:null}
function rangeOf(d,x){return customR(x)||d.ranges[Number(x)]}
function rangeHit(v,r){var n=Number(v);if(v===""||v==null||isNaN(n))return false;return n>=r[0]&&(r[1]==null||n<r[1])}
/* The user picks which of the filters HR allows to use: "+ Filter" adds one as a chip, the chip picks the values.
   Search is a box in the bar. Chosen filters (not their values) are remembered per browser. */
var MY_KEY="bulkMyFilters_v1";
function fdef(id){return FDEFS.filter(function(d){return d.id===id})[0]}
function pruneActive(){
  S.active=S.active.filter(function(id){var d=fdef(id);return d&&d.type!=="search"});
  Object.keys(S.filt).forEach(function(id){if(id!=="q"&&S.active.indexOf(id)<0)delete S.filt[id]});
  if(!fdef("q"))delete S.filt.q;
}
function saveMine(){try{localStorage.setItem(MY_KEY,JSON.stringify(S.active))}catch(x){}}
function loadMine(){try{var v=JSON.parse(localStorage.getItem(MY_KEY)||"null");if(Array.isArray(v)){S.active=v;pruneActive()}}catch(x){}}
var EDITED_LBL={hand:"Edited Manually",bulk:"Edited in Bulk",none:"Not Edited"};
function optionsFor(d){
  var sc=scope();
  if(d.type==="rating")return [5,4,3,2,1].map(function(n){return {v:String(n),label:String(n),n:sc.filter(function(e){return bucket(e)===n}).length}}).concat([{v:"none",label:"No Rating",n:sc.filter(function(e){return bucket(e)===null}).length}]);
  if(d.type==="edited")return ["hand","bulk","none"].map(function(k){return {v:k,label:EDITED_LBL[k],n:sc.filter(function(e){return k==="hand"?e.hand:k==="bulk"?e.bulk:(!e.hand&&!e.bulk)}).length}});
  if(d.type==="range"){
    var ro=d.ranges.map(function(r,i){return {v:String(i),label:rangeLabel(r),n:sc.filter(function(e){return rangeHit(e[d.field],r)}).length}});
    (S.filt[d.id]||[]).forEach(function(x){var c=customR(x);if(c)ro.push({v:x,label:rangeLabel(c)+" (custom)",n:sc.filter(function(e){return rangeHit(e[d.field],c)}).length})});
    return ro}
  if(d.field==="compManager"&&S.filt.techEd&&S.filt.techEd.length)sc=sc.filter(function(e){return S.filt.techEd.indexOf(e.superManager)>=0});
  var m={};sc.forEach(function(e){var x=e[d.field];if(x!==""&&x!=null)m[x]=(m[x]||0)+1});
  return Object.keys(m).sort(function(a,b){return a.localeCompare(b,undefined,{numeric:true})}).map(function(k){return {v:k,label:k,n:m[k]}});
}
var NUM_OPS={gt:">",lt:"<",eq:"="};
function numLabel(v){return (NUM_OPS[v[0]]||"=")+" "+v[1]}
function numPass(x,v){var n=Number(v[1]);if(x==null||x===""||isNaN(Number(x))||isNaN(n))return false;x=Number(x);
  return v[0]==="gt"?x>n:v[0]==="lt"?x<n:Math.abs(x-n)<0.05}
function valLabel(d,v){
  if(d.type==="range")return rangeLabel(rangeOf(d,v));
  if(d.type==="edited")return EDITED_LBL[v]||v;
  return v==="none"?"No Rating":v;
}
function passFilters(e){
  for(var i=0;i<FDEFS.length;i++){
    var d=FDEFS[i],v=S.filt[d.id];if(!v||!v.length)continue;
    if(d.type==="search"){if((e.name+" "+e.empId+" "+e.designation).toLowerCase().indexOf(String(v).toLowerCase())<0)return false;continue}
    if(d.type==="num"){if(!numPass(e[d.field],v))return false;continue}
    var hit=v.some(function(x){
      if(d.type==="select")return String(e[d.field]==null?"":e[d.field])===x;
      if(d.type==="range")return rangeHit(e[d.field],rangeOf(d,x));
      if(d.type==="rating"){var b=bucket(e);return x==="none"?b===null:String(b)===x}
      if(d.type==="edited")return x==="hand"?!!e.hand:x==="bulk"?!!e.bulk:(!e.hand&&!e.bulk);
      return true;
    });
    if(!hit)return false;
  }
  return true;
}
function roleIs(rx){return apiMode()?!!(ME&&rx.test(String(ME.role||"")))&&true:false}
function hiddenForRole(d){
  if(d.field==="compManager")return S.role==="CM"||(ME&&/comp/i.test(String(ME.role||"")));
  if(d.field==="superManager")return apiMode()?!!(ME&&/tech|comp/i.test(String(ME.role||""))):S.role!=="HR";   // Tech ED filter is for the HR view only
  return false;
}
/* Comp Manager list follows the chosen Tech ED(s) */
function cascadeCM(){
  var te=S.filt.techEd,cm=S.filt.compManager;
  if(!te||!te.length||!cm||!cm.length)return;
  var ok={};scope().forEach(function(e){if(te.indexOf(e.superManager)>=0)ok[e.compManager]=1});
  S.filt.compManager=cm.filter(function(x){return ok[x]});
}
function updateRem(){var b=budgetOf(scope(),null),rem=Math.max(0,b.left);root.querySelectorAll(".remLbl").forEach(function(el){el.textContent=big(rem)})}
function renderFilters(){
  var q=fdef("q");
  if(!q)$("fbSearch").innerHTML="";
  else if(!$("flt_q"))$("fbSearch").innerHTML='<input type="text" id="flt_q" placeholder="Search Name / ID / Designation" value="'+esc(S.filt.q||"")+'">';
  renderChips();
}
function renderChips(){
  var h="";cascadeCM();
  S.active=S.active.filter(function(id){var d=fdef(id);return !(d&&hiddenForRole(d))||(delete S.filt[id],false)});
  S.active.forEach(function(id){
    var d=fdef(id);if(!d||hiddenForRole(d))return;
    var v=S.filt[id]||[],txt=v.length?(d.type==="num"?numLabel(v):v.map(function(x){return valLabel(d,x)}).join(", ")):"All";
    h+='<span class="fchip'+(v.length?' has':'')+'"><button class="fc-b" type="button" data-open="'+id+'"><b>'+esc(d.label)+'</b> '+esc(txt)+'</button><button class="fc-x" type="button" data-rm="'+id+'" title="Remove this filter">✕</button></span>';
  });
  $("fbChips").innerHTML=h;
  var avail=FDEFS.filter(function(d){return d.type!=="search"&&S.active.indexOf(d.id)<0&&!hiddenForRole(d)});
  $("bAddF").disabled=!avail.length;
  var any=S.active.some(function(id){return S.filt[id]&&S.filt[id].length})||!!S.filt.q;
  $("bClearF").classList.toggle("hide",!any);
  var tot=scope().length,n=viewRows().length;
  $("fbCount").innerHTML='<span class="big">'+n+'</span><small>of '+tot+' employee'+(tot===1?'':'s')+'</small>';$("fbMeter").style.width=(tot?Math.round(n/tot*100):0)+"%";
}
/* popovers */
function closePop(){S.pop=null;$("pop").classList.add("hide")}
function placePop(btn){
  var p=$("pop"),r=btn.getBoundingClientRect();p.classList.remove("hide");var dd=S.pop&&S.pop.id?fdef(S.pop.id):null;p.classList.toggle("wide",!!dd&&(dd.type==="num"||dd.type==="range"));
  var w=p.offsetWidth,x=Math.min(r.left,window.innerWidth-w-10);
  p.style.left=Math.max(8,x)+"px";p.style.top=(r.bottom+6)+"px";
}
function openAdd(btn){
  S.pop={kind:"add"};
  var avail=FDEFS.filter(function(d){return d.type!=="search"&&S.active.indexOf(d.id)<0&&!hiddenForRole(d)});
  $("pop").innerHTML='<h4>Filter by</h4><div class="lst">'+avail.map(function(d){return '<button class="it" type="button" data-add="'+d.id+'">'+esc(d.label)+'</button>'}).join("")+'</div>';
  placePop(btn);
}
function openVals(id,btn){
  var d=fdef(id);if(!d)return;S.pop={kind:"vals",id:id};
  var cur=S.filt[id]||[];
  if(d.type==="num"){
    $("pop").innerHTML='<h4>'+esc(d.label)+'</h4><div style="display:flex;gap:6px;padding:2px 4px 4px"><select id="numOp" style="width:140px;flex:none">'
      +[["gt","Greater than"],["lt","Less than"],["eq","Equal to"]].map(function(o){return '<option value="'+o[0]+'"'+(cur[0]===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join("")
      +'</select><input type="number" id="numVal" step="0.1" min="0" max="5" placeholder="e.g. 4" value="'+esc(cur[1]==null?"":cur[1])+'" style="margin:0;width:100%;min-width:0"></div>'
      +'<div class="ft"><button class="btn lnk" type="button" data-clear="'+id+'">Clear</button><button class="btn sm" type="button" data-numapply="'+id+'">Apply</button></div>';
    placePop(btn);var nv=$("numVal");if(nv)nv.focus();return;
  }
  var o=optionsFor(d);
  $("pop").innerHTML='<h4>'+esc(d.label)+'</h4><div class="lst">'+(o.length?o.map(function(x){
      return '<label><input type="checkbox" data-val="'+esc(x.v)+'"'+(cur.indexOf(x.v)>=0?' checked':'')+'> '+esc(x.label)+'<span class="n">'+x.n+'</span></label>'}).join(""):'<div class="mini" style="padding:6px">No values found.</div>')
    +'</div>'+(d.type==="range"?'<div style="display:flex;gap:6px;align-items:center;padding:6px 4px 2px"><span class="mini">Custom</span><input type="number" id="rgFrom" step="any" placeholder="from" style="width:70px;margin:0"><span class="mini">to</span><input type="number" id="rgTo" step="any" placeholder="to" style="width:70px;margin:0"><button class="btn sm" type="button" data-rngadd="'+id+'">Add</button></div>':'')
    +'<div class="ft"><button class="btn lnk" type="button" data-clear="'+id+'">Clear</button><button class="btn sm" type="button" data-done="1">Done</button></div>';
  placePop(btn);
}
function viewRows(){
  var rows=scope().filter(passFilters);
  var k=S.sort.key;
  if(k){rows=rows.slice().sort(function(a,b){var x=sortVal(a,k),y=sortVal(b,k);return (x<y?-1:x>y?1:0)*S.sort.dir})}
  return rows;
}
/* v33: no row-by-row preview, so the grid always shows the current values; the preview is a summary only */
function afterOf(e){var p=S.pv&&S.pv.res[e.empId];return p&&p.st==="chg"?p.after:e}
function fieldNum(r,e,v){
  var F=FIELDS[r.field];
  if(F.kind==="pct")return v.hikeAmt/e.basePay*100;
  if(F.kind==="amt")return Number(v[F.key])||0;
  return 0;
}
function sortVal(e,k){
  var af=afterOf(e),m=/^(cur|prop|chg)(\d+)$/.exec(k);
  if(m){var r=S.rules[Number(m[2])];if(!r)return 0;
    var c=fieldNum(r,e,e),p=fieldNum(r,e,af);return m[1]==="cur"?c:m[1]==="prop"?p:p-c}
  switch(k){
    case "name":return e.name;case "empId":return e.empId;case "band":return e.band;
    case "rating":return e.rating==null?-1:e.rating;case "basePay":return e.basePay;
    case "hikePct":return af.hikeAmt/e.basePay;case "newBase":return e.basePay+af.hikeAmt;case "ctc":return e.basePay+af.hikeAmt+af.newPB+af.newRB;
  }return 0;
}

/* ---------------- rule rows ---------------- */
function renderRules(){
  var h="";
  S.rules.forEach(function(r,idx){
    var F=FIELDS[r.field],txt=F.kind==="txt",dist=r.method==="dist"&&F.kind==="amt",adj=r.method==="adj"&&F.kind==="amt",ted=r.method==="ted"&&F.kind!=="txt",taken=usedKeys(r.uid);
    h+='<div class="rrow" data-uid="'+r.uid+'">';
    h+='<div class="f"><label>Field</label><select data-k="field">'+FORDER.map(function(f){
      var off=!fieldOn(f)&&!(f==="hikePct"&&isHike(r.field)),dis=off||(taken[FIELDS[f].key]&&f!==r.field)||(!canEdit(FIELDS[f].key)&&f!==r.field);
      var cur=(f===r.field)||(f==="hikePct"&&isHike(r.field));return '<option value="'+f+'"'+(cur?' selected':'')+(dis&&!cur?' disabled':'')+'>'+esc((f==="hikePct"?"Hike":FIELDS[f].label)+(dis&&!cur?(off?" (coming soon)":taken[FIELDS[f].key]?" (already used)":" (no access)"):""))+'</option>';
    }).join("")+'</select></div>';
    h+='<div class="f"><label>How</label><select data-k="method"'+(txt?' disabled':'')+'><option value="same"'+(r.method==="same"||txt?' selected':'')+'>Same Value for All</option>'+(F.kind!=="txt"&&isHrView()?'<option value="ted"'+(ted?' selected':'')+'>By Tech ED</option>':'')+(F.kind==="amt"?'<option value="adj"'+(adj?' selected':'')+'>Add or Reduce</option><option value="dist"'+(dist?' selected':'')+'>Distribute a Total</option>':'')+'</select></div>';
    if(isHike(r.field)&&!dist&&!adj)h+='<div class="f"><label>Value Is</label><select data-k="hikeUnit"><option value="pct"'+(r.field==="hikePct"?' selected':'')+'>% of Base Pay</option><option value="amt"'+(r.field==="hikeAmt"?' selected':'')+'>Amount</option></select></div>';
    else if(F.unitPick&&!dist&&!adj)h+='<div class="f"><label>Value Is</label><select data-k="unit"><option value="amt"'+(r.unit==="amt"?' selected':'')+'>Amount</option><option value="pct"'+(r.unit==="pct"?' selected':'')+'>% of Base Pay</option></select></div>';
    else if(!txt&&!dist&&!adj)h+='<div class="f"><label>Value Is</label><span class="unit">Amount</span></div>';
    if(r.field==="remarks"){
      h+='<div class="f"><label>Remark</label><input type="text" data-k="text" style="width:260px" placeholder="Text to Apply" value="'+esc(r.text)+'"></div>';
      h+='<div class="f"><label>Existing Remark</label><select data-k="textMode"><option value="replace"'+(r.textMode==="replace"?' selected':'')+'>Replace</option><option value="append"'+(r.textMode==="append"?' selected':'')+'>Add to End</option></select></div>';
    }else if(adj){
      h+='<div class="f"><label>Change</label><select data-k="adjDir"><option value="add"'+(r.adjDir==="add"?' selected':'')+'>Add</option><option value="sub"'+(r.adjDir==="sub"?' selected':'')+'>Reduce</option></select></div>';
      h+='<div class="f"><label>By Amount</label><input type="number" data-k="adjAmt" step="any" min="0" value="'+esc(r.adjAmt)+'" style="width:130px;text-align:right"></div>';
      h+='<div class="mini" style="width:100%">Added to or taken off each row\'s current value. It never goes below 0 or below the amount to be paid.</div>';
    }else if(dist){
      h+='<div class="f"><label>Total from</label><select data-k="distSrc"><option value="amount"'+(r.distSrc==="amount"?' selected':'')+'>An Amount I Enter</option><option value="remaining"'+(r.distSrc==="remaining"?' selected':'')+'>Remaining Budget</option></select></div>';
      if(r.distSrc==="amount")h+='<div class="f"><label>Total Amount</label><input type="number" data-k="distAmt" step="any" min="0" value="'+esc(r.distAmt)+'" style="width:130px;text-align:right"></div>';
      else h+='<div class="f"><label>Remaining Budget</label><span class="unit"><b class="remLbl"></b></span></div>';
      h+='<div class="f"><label>Split</label><select data-k="distBy"><option value="equal"'+(r.distBy==="equal"?' selected':'')+'>Equally</option><option value="base"'+(r.distBy==="base"?' selected':'')+'>In Proportion to Base Pay</option></select></div>';
      h+='<div class="mini" style="width:100%">Goes to the rows selected below. Each row\'s share is added to its current value, and the shares add up to the total.</div>';
    }else if(ted){
      var tl=tedList(),pu=(r.field==="hikePct"||r.unit==="pct")?" %":"";
      tl.forEach(function(t){h+='<div class="f"><label>'+esc(t)+'</label><input type="number" data-k="ted" data-te="'+esc(t)+'" step="any" min="0" placeholder="'+(pu?"%":"Amount")+'" value="'+esc(r.tedVals[t]==null?"":r.tedVals[t])+'" style="width:84px;text-align:right"></div>'});
      h+='<div class="mini" style="width:100%">One value per Tech ED. A Tech ED left blank is not changed.</div>';
    }else{
      h+='<div class="f"><label>'+(r.field==="hikePct"?"Hike %":"Value")+'</label><input type="number" data-k="value" step="any" min="0" value="'+esc(r.value)+'" style="width:110px;text-align:right"></div>';
    }
    h+='<button class="btn xbtn" type="button" data-rm="'+r.uid+'" title="Remove this field"'+(S.rules.length===1?' disabled':'')+'>✕</button>';
    h+='</div>';
  });
  $("ruleRows").innerHTML=h;
  var free=FORDER.some(function(f){return fieldOn(f)&&!usedKeys(0)[FIELDS[f].key]&&canEdit(FIELDS[f].key)});
  focusValue();
  $("bAddField").disabled=!free;
}
/* the Value box is selected as soon as the rules are drawn, so typing replaces the 0 */
var _fvT=0;
function focusValue(){
  clearTimeout(_fvT);
  _fvT=setTimeout(function(){
    var el=root.querySelector('#ruleRows [data-k="value"]');
    var ae=document.activeElement,free=!ae||ae===document.body||!!(ae.closest&&ae.closest("#ruleRows"));
    if(el&&!el.disabled&&free){el.focus();try{el.select()}catch(x){}}
  },0);
}
function validate(){
  var ok=true;
  root.querySelectorAll("#ruleRows .err").forEach(function(el){el.classList.remove("err");el.title=""});
  function mark(uid,sel,msg){var el=root.querySelector('#ruleRows [data-uid="'+uid+'"] '+sel);if(el){el.classList.add("err");el.title=msg}ok=false}
  S.rules.forEach(function(r){
    var F=FIELDS[r.field];
    function chk(v,sel){
      var n=Number(v);
      if(v===""||isNaN(n)){mark(r.uid,sel,"Enter a number");return}
      if(n<0){mark(r.uid,sel,"Cannot be negative");return}
      var pl=(r.field==="hikePct")||(F.unitPick&&r.unit==="pct");
      if(pl&&n>=100)mark(r.uid,sel,"Must be less than 100%");
    }
    if(F.kind!=="txt"){
      if(r.method==="same")chk(r.value,'[data-k="value"]');
      else if(r.method==="ted"){var any=false;Object.keys(r.tedVals).forEach(function(t){var v=r.tedVals[t];if(v==="")return;any=true;var n=Number(v),pl=(r.field==="hikePct")||(F.unitPick&&r.unit==="pct");if(isNaN(n)||n<0||(pl&&n>=100))mark(r.uid,'[data-te="'+t.replace(/"/g,"")+'"]',"Enter a valid number")});if(!any)mark(r.uid,'[data-k="method"]',"Enter a value for at least one Tech ED")}
      else if(r.method==="adj")chk(r.adjAmt,'[data-k="adjAmt"]');
      else if(r.method==="dist"){
        if(r.distSrc==="remaining"){var bb=budgetOf(scope(),null);if(bb.left<1)mark(r.uid,'[data-k="distSrc"]',"No budget is left to distribute")}
        else{chk(r.distAmt,'[data-k="distAmt"]');if(Number(r.distAmt)<=0&&r.distAmt!=="")mark(r.uid,'[data-k="distAmt"]',"Enter an amount above 0")}
      }
    }
    if(r.field==="remarks"&&!r.text.trim())mark(r.uid,'[data-k="text"]',"Enter the remark text");
  });
  return ok;
}
function ruleText1(r){
  var F=FIELDS[r.field],t=F.label+" ";
  if(r.field==="remarks")return t+(r.textMode==="append"?"+ “":"“")+r.text+"”";
  var u=(r.field==="hikePct"||r.unit==="pct")?"%":"";
  if(r.method==="ted"){var tv=r.tedVals||{};return t+"by Tech ED ("+Object.keys(tv).filter(function(k){return tv[k]!==""}).map(function(k){return k.split(" ")[0]+" "+tv[k]+u}).join(", ")+")"}
  if(r.method==="adj")return t+(r.adjDir==="sub"?"reduce by ":"add ")+inr(r.adjAmt);
  if(r.method==="dist")return t+"distribute "+(r.distSrc==="remaining"?"the remaining budget":inr(r.distAmt))+(r.distBy==="base"?" in proportion to Base pay":" equally");
  return t+r.value+u;
}
function ruleText(rules){return rules.map(ruleText1).join(" · ")}

/* ---------------- preview (browser only — the server re-checks every rule on Apply) ---------------- */
function colSum(a,cols){return cols.reduce(function(s,k){return s+(Number(a[k])||0)},0)}
/* The budget base is fixed (loaded values): a Preview or an Apply on Hike / PB / RB never moves the budget itself, only what is consumed from it.
   Consumed = Hike + PB + RB (Target PB is shown separately, "incl. Target PB"). With a server, usedColumns / baseColumns come from Budget Config. */
function sums(list,over){
  var base=0,used=0,tpb=0,bc=(SB&&SB.baseColumns)||["basePay","newPB"],uc=(SB&&SB.usedColumns)||["hikeAmt","newPB","newRB"];
  list.forEach(function(e){var a=over&&over[e.empId]?Object.assign({},e,over[e.empId]):e;
    base+=(!SB&&e.bBase0!=null)?e.bBase0:colSum(e,bc);used+=colSum(a,uc);tpb+=Number(a.tpbNext)||0});
  return {base:base,used:used,tpb:tpb};
}
function budgetOf(list,over){
  var s=sums(list,over),bud,used,tpb,H=cfg.getHdr?cfg.getHdr():null;
  if(H){   // same numbers as the Appraisal Sheet; nothing from this screen's own /budget call
    var z=over?sums(list,null):s;
    bud=H.allocated||0;used=H.used+(s.used-z.used);tpb=H.tpb+(s.tpb-z.tpb);
  }else if(SB){   // server figures (worked out from every field) plus the change made here
    var ratio=SB.base?SB.updated/SB.base:0;
    bud=SB.updated+(s.base-SB0.base)*ratio;used=SB.used+(s.used-SB0.used);tpb=SB.tpb+(s.tpb-SB0.tpb);
  }else{   // demo: budget = 35% of (Base pay + PB at load)
    bud=0.35*s.base;used=s.used;tpb=s.tpb;
  }
  return {budget:bud,used:used,util:bud?used/bud*100:0,utilT:bud?(used+tpb)/bud*100:0,tpb:tpb,left:bud-used-(S.incTpb?tpb:0)};
}
/* Distribute a total: the shares are worked out once per preview over the rows that will be processed
   (selected, not skipped). Whole rupees; any rounding left over goes one rupee at a time to the first rows. */
var SH={};
function distTotal(r){
  if(r.distSrc==="remaining"){var b=budgetOf(scope(),null);return Math.max(0,Math.floor(b.left))}
  return Math.max(0,Math.round(Number(r.distAmt)||0));
}
function computeShares(rows){
  var out={},elig=rows.filter(function(e){return !S.off[e.empId]&&!(S.skipHand&&e.hand)});
  S.rules.forEach(function(r){
    if(r.method!=="dist"||FIELDS[r.field].kind!=="amt")return;
    var total=distTotal(r),m={};out[r.uid]=m;
    if(!elig.length||total<=0)return;
    var w=elig.map(function(e){return r.distBy==="base"?e.basePay:1}),sw=w.reduce(function(a,b){return a+b},0),sum=0;
    var sh=elig.map(function(e,i){var v=Math.floor(total*w[i]/sw);sum+=v;return v});
    for(var i=0,rest=total-sum;rest>0&&i<sh.length;i++,rest--)sh[i]++;
    elig.forEach(function(e,i){m[e.empId]=sh[i]});
  });
  return out;
}
function computeRule(e,r,after,notes){
  var F=FIELDS[r.field],val;
  if(F.kind==="txt"){
    {var t=r.text.trim();after.remarks=r.textMode==="append"&&e.remarks?(e.remarks+" · "+t):t}
    return;
  }
  if(r.method==="adj"){
    var a=Number(r.adjAmt)||0,v=(Number(e[F.key])||0)+(r.adjDir==="sub"?-a:a);
    if(v<0){v=0;notes.push({t:"warn",k:"adj",m:F.label+" limited to 0"})}
    if(F.floor&&v<e[F.floor]){v=e[F.floor];notes.push({t:"warn",k:"adj",m:F.floorLbl+" raised to the to-be-paid amount ("+inr(e[F.floor])+")"})}
    after[F.key]=v;return;
  }
  if(r.method==="dist"){after[F.key]=(Number(e[F.key])||0)+((SH[r.uid]&&SH[r.uid][e.empId])||0);return}
  if(r.method==="ted"){var tv0=(r.tedVals||{})[e.superManager];if(tv0==null||tv0===""||isNaN(Number(tv0))){notes.push({t:"info",k:"noted",m:"No value set for this Tech ED"});return}val=Number(tv0)}
  else val=Number(r.value);
  var amt;
  if(r.field==="hikePct")amt=hikeBasis(e)*val/100;
  else if(r.field==="hikeAmt")amt=val;
  else amt=r.unit==="pct"?hikeBasis(e)*val/100:val;
  if(F.floor&&amt<e[F.floor]){amt=e[F.floor];notes.push({t:"warn",k:"adj",m:F.floorLbl+" raised to the to-be-paid amount ("+inr(e[F.floor])+")"})}
  after[F.key]=amt;
}
function computeRow(e){
  var after={hikeAmt:e.hikeAmt,newPB:e.newPB,newRB:e.newRB,newPBInst:e.newPBInst,tpbNext:e.tpbNext,remarks:e.remarks},notes=[];
  S.rules.forEach(function(r){computeRule(e,r,after,notes)});
  var same=true;KEYS.forEach(function(k){if(String(after[k])!==String(e[k]))same=false});
  var hasNR=notes.some(function(x){return x.k==="norating"});
  var out={after:after,notes:notes,st:same?(hasNR?"norating":"same"):"chg"};
  if(out.st==="chg"&&(FIELDS.hikePct&&S.rules.some(function(r){return FIELDS[r.field].key==="hikeAmt"}))){
    var hp=after.hikeAmt/e.basePay*100,bm=BENCH[e.band];
    if(bm){if(hp>bm[2])notes.push({t:"warn",k:"range",m:"Above Band "+e.band+" P75 ("+bm[2]+"%)"});else if(hp<bm[0])notes.push({t:"warn",k:"range",m:"Below Band "+e.band+" P25 ("+bm[0]+"%)"})}
  }
  return out;
}
function buildPreview(){
  var rows=viewRows();SH=computeShares(rows);var res={},n={chg:0,skip:0,same:0,off:0,norating:0,adj:0,range:0},over={};
  rows.forEach(function(e){
    if(S.off[e.empId]){res[e.empId]={st:"off",notes:[]};n.off++;return}
    if(S.skipHand&&e.hand){res[e.empId]={st:"skip",notes:[]};n.skip++;return}
    var o=computeRow(e);res[e.empId]=o;
    var ovp=S.ov[e.empId];
    if(ovp!=null){   // a hike % set from the Pivot wins over the rule for that person
      o.after.hikeAmt=Math.round(e.basePay*ovp/100);o.ov=true;
      var sm=true;KEYS.forEach(function(k){if(String(o.after[k])!==String(e[k]))sm=false});o.st=sm?"same":"chg";
    }
    if(o.st==="chg"){n.chg++;over[e.empId]=o.after}
    else if(o.st==="same")n.same++;
    o.notes.forEach(function(x){if(x.k==="norating"){n.norating++}else if(o.st==="chg"){if(x.k==="adj")n.adj++;else if(x.k==="range")n.range++}});
    if(o.st==="norating")n.same+=0;
  });
  var sc=scope(),h0=0,h1=0;
  sc.forEach(function(e){h0+=Number(e.hikeAmt)||0;h1+=Number(over[e.empId]?over[e.empId].hikeAmt:e.hikeAmt)||0});
  return {res:res,n:n,hike:{before:h0,after:h1},before:budgetOf(sc,null),after:budgetOf(sc,over),
    rules:JSON.parse(JSON.stringify(S.rules)),text:ruleText(S.rules)};
}
function refreshPreview(){
  if(!S.pv)return;
  if(!validate()){S.pv=null;render();return}
  S.pv=buildPreview();render();
}

/* ---------------- render ---------------- */
function render(){renderHeaderBudget();renderStrip();renderButtons();ignoreScroll=true;renderGrid();setTimeout(function(){ignoreScroll=false},60);renderScn();renderChips();renderFold();updateRem()}
function renderHeaderBudget(){
  var b0=budgetOf(scope(),null),b1=S.pv?S.pv.after:null;
  $("kBud").textContent=big(b1?b1.budget:b0.budget);
  function kp(id,v0,v1){
    var el=$(id);
    if(b1&&Math.abs(v1-v0)>0.005){el.innerHTML=v0.toFixed(1)+"% <small>→</small> "+v1.toFixed(1)+"%";el.className=lvl(v1)}
    else{el.textContent=v0.toFixed(1)+"%";el.className=lvl(v0)}
  }
  kp("kUtil",b0.util,b1?b1.util:b0.util);
}
/* loading screen while Apply / Restore saves (logo, percentage bar, wait message) */
var busyEl=null;
function updateBusy(){
  var on=!!(S.busy&&S.prog);
  if(!on){if(busyEl){busyEl.style.display="none"}return}
  if(!busyEl){busyEl=document.createElement("div");busyEl.className="bo-busy";busyEl.setAttribute("role","alertdialog");busyEl.setAttribute("aria-busy","true");
    busyEl.innerHTML=(cfg.logoUrl?'<img src="'+esc(cfg.logoUrl)+'" alt="Wissen">':'')+'<div class="bb-bar"><i></i></div><div class="bb-pct"></div><div class="bb-msg">Please wait while this is under process</div>';
    root.appendChild(busyEl)}
  var tot=S.prog.total||0,pc=tot?Math.min(100,Math.round(S.prog.done/tot*100)):0;
  busyEl.style.display="flex";busyEl.querySelector(".bb-bar i").style.width=pc+"%";busyEl.querySelector(".bb-pct").textContent=pc+"%";
}
function renderStrip(){updateBusy();
  var h="";
  if(S.locked){
    h='<div class="strip warn"><b>Cycle Locked</b><span>'+esc(S.lockReason||"Edits are allowed only while the cycle is Active, Start Appraisal is done and Finalisation is not.")+' Bulk changes are switched off.</span></div>';
  }else if(S.loading){
    h='<div class="strip info"><span>Loading employees from the server…</span></div>';
  }else if(S.err){
    h='<div class="strip warn"><b>Not Saved</b><span>'+esc(S.err)+'</span></div>';
  }else if(S.busy&&S.prog){
    var pr=S.prog,pc=pr.total?Math.round(pr.done/pr.total*100):0;
    h='<div class="strip info"><span><b>'+esc(pr.label)+'</b></span><span class="prog"><i style="width:'+pc+'%"></i></span><span><b>'+inr(pr.done)+' of '+inr(pr.total)+' done</b></span></div>';
  }else if(S.flash){
    h='<div class="strip ok"><b>'+esc(S.flash)+'</b></div>';
  }else if(S.pv){
    var n=S.pv.n,p=S.pv;
    h='<div class="strip info">';
    if(n.same)h+='<span>'+n.same+' already at these values</span>';
    if(n.norating)h+='<span>'+n.norating+' rating-based value'+(n.norating===1?"":"s")+' skipped (no rating)</span>';
    if(n.adj)h+='<span>'+n.adj+' adjusted by the PB / RB rule</span>';
    if(n.range)h+='<span>'+n.range+' outside the band range</span>';
    var nov=Object.keys(S.ov).filter(function(k){return S.pv.res[k]}).length;if(nov)h+='<span>'+nov+' with a hike set in the Pivot</span>';
    h+='</div>';if(h==='<div class="strip info"></div>')h='';
  }else{
    h='';
  }
  $("strip").innerHTML=h;
}
function renderButtons(){
  var okPv=!!cfg.canApply&&S.pv&&S.pv.n.chg>0&&!S.locked&&!S.busy;
  $("bPreview").disabled=S.locked||S.busy||S.loading;
  $("bApply").disabled=!okPv;
  var why=S.busy?"Saving…":!S.pv?"Click Preview first. Nothing is saved until Apply.":S.pv.n.chg===0?"Nothing would change — the values already match ("+S.pv.n.skip+" skipped, "+S.pv.n.same+" unchanged)."
    :S.locked?"This cycle is locked.":S.confirmAt?"Click Apply once more to save "+S.pv.n.chg+" row"+(S.pv.n.chg===1?"":"s")+". Esc cancels.":"Preview ready for "+S.pv.n.chg+" row"+(S.pv.n.chg===1?"":"s")+". Click Apply, then confirm.";
  var why2=cfg.canApply?why:(cfg.applyNote||"Apply is not enabled yet — preview only.");$("ruleNote").textContent=S.pv&&!cfg.canApply?why2+" Nothing is saved.":why2;$("bApply").title=okPv?"":why2;
  $("bApply").textContent=applyLabel();$("bApply").classList.toggle("confirm",!!S.confirmAt);
  $("bDiscard").disabled=!S.pv;
  $("bScnSave").disabled=!S.pv||S.locked;
  $("bReset").disabled=S.busy;
}
function dispVal(r,e,v){
  var F=FIELDS[r.field];
  if(F.kind==="pct")return pct(v.hikeAmt/e.basePay*100);
  if(F.kind==="amt")return inr(v[F.key]);
  var t=String(v[F.key]==null?"":v[F.key]);return t.length>26?esc(t.slice(0,26))+"…":esc(t);
}
function showHp(){return !S.rules.some(function(r){return r.field==="hikePct"})}   // v34: the Hike % rule column already shows it
function cols(){
  var c=[{k:"name",t:"Employee",c:"c1"},{k:"band",t:"Band"},{k:"rating",t:"Manager Rating",r:1},{k:"basePay",t:"Base Pay",r:1}];
  S.rules.forEach(function(r,i){var L=FIELDS[r.field].label;
    c.push({k:"cur"+i,t:"Current · "+L,r:1},{k:"prop"+i,t:"Proposed · "+L,r:1},{k:"chg"+i,t:"Change · "+L,r:1});});
  if(showHp())c.push({k:"hikePct",t:"Hike% (After)",r:1});
  c.push({k:"newBase",t:"New Base Salary (After)",r:1},{k:"ctc",t:"Total CTC with Rewards (After)",r:1},{k:"note",t:"Note",ns:1});
  return c;
}

/* Apply asks once: the first click turns the button into "Confirm · n rows · before → after" for 6 seconds; the second click saves. */
S.confirmAt=0;S.checkF="";var confirmT=null;
function applyLabel(){
  var n=S.pv&&S.pv.n.chg;
  if(S.busy)return "Saving…";
  if(!n)return "Apply";
  if(S.confirmAt)return "Confirm · "+n+" row"+(n===1?"":"s")+" · "+S.pv.before.util.toFixed(1)+"% → "+S.pv.after.util.toFixed(1)+"%";
  return "Apply to "+n+" row"+(n===1?"":"s");
}
function askApply(){
  if(!cfg.canApply)return;
  if(S.confirmAt&&Date.now()-S.confirmAt<10000){S.confirmAt=0;clearTimeout(confirmT);renderButtons();doApply();return}
  S.confirmAt=Date.now();renderButtons();renderFold();
  clearTimeout(confirmT);confirmT=setTimeout(function(){S.confirmAt=0;renderButtons();renderFold()},10000);
}
onDoc("keydown",function(ev){if(ev.key==="Escape"&&S.confirmAt){S.confirmAt=0;clearTimeout(confirmT);renderButtons();renderFold()}});
/* Checks: click a number to see only those rows in the grid (grid only, the preview itself is not changed) */
var CK_LBL={chg:"Rows That Will Change",skip:"Skipped · Edited Manually",off:"Left Out · Unticked",same:"No Change",range:"Out of Band Range",norating:"Without a Manager Rating"};
function ckPass(e){var r=S.pv.res[e.empId];
  switch(S.checkF){case"chg":return !!r&&r.st==="chg";case"skip":return !!r&&r.st==="skip";case"off":return !!r&&r.st==="off";case"same":return !!r&&r.st==="same";
    case"range":return !!r&&r.st==="chg"&&r.notes.some(function(x){return x.k==="range"});case"norating":return e.rating==null}
  return true}
/* Column filters: Excel-style menu from the ▾ button on each header, same model as the Appraisal Sheet.
   S.colF[key] = Set of picked values, or {op,value,value2}. Values are listed from every row in scope. */
var NUM_COLS={rating:1,basePay:1,hikePct:1,newBase:1,ctc:1};
function isNumCol(k){return !!NUM_COLS[k]||/^(cur|prop|chg)\d+$/.test(k)}
/* Excel-style column menu: same design and options as the Appraisal Sheet / Delegation column filter.
   S.colF[key] = Set of ticked values, or a condition {kind,op,value,op2,value3,join} (Equals, Begins with, Between, Top 10, Above / Below average, Custom). */
var NUMBER_MENU=[["eq","Equals…"],["neq","Does Not Equal…"],"-",["gt","Greater Than…"],["gte","Greater Than Or Equal To…"],["lt","Less Than…"],["lte","Less Than Or Equal To…"],["between","Between…"],"-",["top","Top 10…"],["above","Above Average"],["below","Below Average"],"-",["custom","Custom Filter…"]];
var TEXT_MENU=[["eq","Equals…"],["neq","Does Not Equal…"],"-",["startswith","Begins With…"],["endswith","Ends With…"],"-",["contains","Contains…"],["notcontains","Does Not Contain…"],"-",["custom","Custom Filter…"]];
var NUMBER_OP_LABELS={eq:"equals",neq:"does not equal",gt:"is greater than",gte:"is greater than or equal to",lt:"is less than",lte:"is less than or equal to"};
var TEXT_OP_LABELS={eq:"equals",neq:"does not equal",startswith:"begins with",endswith:"ends with",contains:"contains",notcontains:"does not contain"};
function colVal(e,k){
  if(isNumCol(k)){if(k==="rating")return e.rating==null?null:e.rating;var v=sortVal(e,k);return /^chg/.test(k)||k==="hikePct"?Math.round(v*10000)/10000:v}
  if(k==="name")return e.empId+" - "+e.name+" - "+e.designation;
  return k==="band"?e.band:""}
function colTxt(e,k){var v=colVal(e,k);return v==null?"":String(v)}
function oneCond(v,op,val,num){
  if(num){if(v==null)return false;var n=Number(val);if(isNaN(n))return false;
    switch(op){case"eq":return Math.abs(v-n)<1e-9;case"neq":return Math.abs(v-n)>=1e-9;case"gt":return v>n;case"gte":return v>=n;case"lt":return v<n;case"lte":return v<=n}return true}
  var t=String(v==null?"":v).toLowerCase(),q=String(val==null?"":val).toLowerCase();
  switch(op){case"eq":return t===q;case"neq":return t!==q;case"startswith":return t.indexOf(q)===0;case"endswith":return q===""||t.slice(-q.length)===q;case"contains":return t.indexOf(q)>=0;case"notcontains":return t.indexOf(q)<0}return true}
function condPass(v,f,num){
  if(f.op==="between"){return oneCond(v,"gte",f.value,num)&&oneCond(v,"lte",f.value2,num)}   // older saved filter
  var a=oneCond(v,f.op,f.value,num);
  if(f.op2&&f.value3!=null&&String(f.value3)!=="")return f.join==="or"?(a||oneCond(v,f.op2,f.value3,num)):(a&&oneCond(v,f.op2,f.value3,num));
  return a}
function colPass(e,k,f){
  if(f instanceof Set)return f.has(colTxt(e,k));
  return condPass(colVal(e,k),f,isNumCol(k))}
function gridRows(){var r=viewRows();if(S.checkF&&S.pv)r=r.filter(ckPass);
  Object.keys(S.colF).forEach(function(k){var f=S.colF[k];if(f)r=r.filter(function(e){return colPass(e,k,f)})});return r}
function closeFilterPop(){var o=root.querySelector("#filterPop");if(o)o.remove();root.querySelectorAll(".filter-btn.active").forEach(function(b){b.classList.remove("active")})}
function colLabel(k){var c=cols().filter(function(x){return x.k===k})[0];return c?c.t:k}
function closeXfDlg(){var d=root.querySelector("#xfDlg");if(d)d.remove()}
function openFilterPop(k,btn){
  closeFilterPop();closeXfDlg();btn.classList.add("active");
  var num=isNumCol(k),label=colLabel(k),menu=num?NUMBER_MENU:TEXT_MENU,opL=num?NUMBER_OP_LABELS:TEXT_OP_LABELS,cur=S.colF[k],active=!!cur;
  var vals={};scope().filter(passFilters).forEach(function(e){var t=colTxt(e,k);vals[t]=colVal(e,k)});
  var keys=Object.keys(vals).sort(function(a,b){return num?(vals[a]==null?-1:vals[a])-(vals[b]==null?-1:vals[b]):(a<b?-1:a>b?1:0)});
  function numbers(){return scope().filter(passFilters).map(function(e){return colVal(e,k)}).filter(function(v){return v!=null&&!isNaN(v)})}
  var picked=cur instanceof Set?new Set(cur):new Set(keys),before=null;
  var pop=document.createElement("div");pop.id="filterPop";pop.className="filter-pop xfm";
  function mi(cls,icon,txt,extra){return '<div class="xm-i '+cls+'"'+(extra||"")+'>'+(icon?'<span class="xm-ic">'+icon+'</span>':'')+txt+'</div>'}
  pop.innerHTML=
    mi('xm-sa'+(S.sort.key===k&&S.sort.dir===1?' on':''),num?'1↓<br>9':'A↓<br>Z',num?'Sort Smallest to Largest':'Sort A to Z')
   +mi('xm-sd'+(S.sort.key===k&&S.sort.dir===-1?' on':''),num?'9↓<br>1':'Z↓<br>A',num?'Sort Largest to Smallest':'Sort Z to A')
   +'<hr>'
   +'<label class="xm-i xm-wrap"><input type="checkbox" class="fwrap"'+(S.wrapC[k]?' checked':'')+'> Wrap text in this column</label>'
   +'<hr>'
   +mi('xm-clr'+(active?'':' dis'),'','Clear Filter From "'+esc(label)+'"')
   +'<hr><div class="xm-sub"><div class="xm-i xm-subh">'+(num?'Number Filters':'Text Filters')+'<span class="xm-arr">▸</span></div><div class="xm-menu hide">'
   +menu.map(function(it){return it==="-"?'<hr>':'<div class="xm-i xm-f" data-f="'+it[0]+'">'+it[1]+'</div>'}).join("")+'</div></div>'
   +'<hr><div class="xm-search"><input type="text" class="fsearch" placeholder="Search"></div>'
   +'<div class="xm-list"><label class="xm-v"><input type="checkbox" class="fall"> <span>(Select All)</span></label><div class="filter-values"></div></div>'
   +'<div class="xm-btns"><button type="button" class="xm-ok">OK</button><button type="button" class="xm-cx">Cancel</button></div>';
  root.appendChild(pop);
  var r=btn.getBoundingClientRect(),w=262,L=Math.min(Math.max(8,r.left),window.innerWidth-w-8);
  pop.style.left=L+"px";pop.style.top=(r.bottom+4)+"px";
  var list=pop.querySelector(".filter-values"),all=pop.querySelector(".fall"),q=pop.querySelector(".fsearch"),sub=pop.querySelector(".xm-menu");
  function visK(){var t=q.value.toLowerCase();return keys.filter(function(x){return x.toLowerCase().indexOf(t)>=0})}
  function drawList(){var vis=visK();
    list.innerHTML=vis.length?vis.slice(0,400).map(function(x){return '<label class="xm-v"><input type="checkbox" data-v="'+esc(x)+'"'+(picked.has(x)?' checked':'')+'> <span>'+(x===""?"(Blanks)":esc(x))+'</span></label>'}).join(""):'<div class="none">No values match this search.</div>';
    all.checked=vis.length>0&&vis.every(function(x){return picked.has(x)});pop.querySelector(".xm-ok").disabled=picked.size===0}
  drawList();
  (function fit(){var h=pop.offsetHeight,room=window.innerHeight-8;
    if(h>room-8){var ex=h-(room-8),vl=pop.querySelector(".xm-list");vl.style.maxHeight=Math.max(60,vl.offsetHeight-ex)+"px";h=pop.offsetHeight}
    pop.style.top=Math.max(8,Math.min(r.bottom+4,window.innerHeight-h-8))+"px"})();
  function done(){S.page=1;closeFilterPop();closeXfDlg();renderGrid()}
  function setF(f){if(f)S.colF[k]=f;else delete S.colF[k];done()}
  // search ticks exactly the matching values (Excel); clearing it puts the earlier ticks back
  q.addEventListener("input",function(){
    if(q.value){if(before===null)before=new Set(picked);picked=new Set(visK())}
    else if(before!==null){picked=before;before=null}
    drawList()});
  q.addEventListener("keydown",function(ev){if(ev.key==="Enter")applyPicked()});
  all.addEventListener("change",function(){visK().forEach(function(x){if(all.checked)picked.add(x);else picked.delete(x)});drawList()});
  list.addEventListener("change",function(ev){var x=ev.target.getAttribute("data-v");if(x==null)return;if(ev.target.checked)picked.add(x);else picked.delete(x);var vis=visK();all.checked=vis.length>0&&vis.every(function(y){return picked.has(y)});pop.querySelector(".xm-ok").disabled=picked.size===0});
  function applyPicked(){if(!picked.size)return;if(keys.every(function(x){return picked.has(x)}))setF(null);else setF(new Set(picked))}
  pop.querySelector(".xm-ok").addEventListener("click",applyPicked);
  pop.querySelector(".xm-cx").addEventListener("click",function(){closeFilterPop()});
  pop.querySelector(".xm-sa").addEventListener("click",function(){S.sort.key=k;S.sort.dir=1;closeFilterPop();renderGrid()});
  pop.querySelector(".xm-sd").addEventListener("click",function(){S.sort.key=k;S.sort.dir=-1;closeFilterPop();renderGrid()});
  pop.querySelector(".xm-clr").addEventListener("click",function(){if(active)setF(null)});
  pop.querySelector(".fwrap").addEventListener("change",function(ev){if(ev.target.checked)S.wrapC[k]=1;else delete S.wrapC[k];try{localStorage.setItem(WRAPC_KEY,JSON.stringify(S.wrapC))}catch(x){}applyWrap()});
  // Text / Number Filters submenu
  var sh=pop.querySelector(".xm-subh");
  function showSub(){sub.classList.remove("hide");sub.classList.toggle("left",pop.getBoundingClientRect().right+210>window.innerWidth)}
  sh.addEventListener("mouseenter",showSub);sh.addEventListener("click",showSub);
  pop.querySelectorAll(".xm-i:not(.xm-subh):not(.xm-f)").forEach(function(x){x.addEventListener("mouseenter",function(){sub.classList.add("hide")})});
  [".xm-search",".xm-list"].forEach(function(c){pop.querySelector(c).addEventListener("mouseenter",function(){sub.classList.add("hide")})});
  sub.addEventListener("click",function(ev){
    var it=ev.target.closest("[data-f]");if(!it)return;ev.stopPropagation();var key=it.getAttribute("data-f");
    if(key==="above"||key==="below"){var ns=numbers(),avg=ns.reduce(function(a,b){return a+b},0)/(ns.length||1);setF({kind:"number",op:key==="above"?"gt":"lt",value:String(Math.round(avg*100)/100)});return}
    if(key==="top"){openDlg({mode:"top",dir:"top",count:"10"});return}
    var kind=num?"number":"text",c=cur&&!(cur instanceof Set)&&cur.kind===kind?cur:null;
    var op1=num?"eq":"contains",v1="",op2=num?"eq":"contains",v2="",join="and";
    if(c){if(c.op==="between"){op1="gte";v1=c.value;op2="lte";v2=c.value2}else{op1=c.op;v1=c.value;op2=c.op2||op2;v2=c.value3||"";join=c.join||"and"}}
    if(key==="between"){op1="gte";op2="lte";join="and";if(!c){v1="";v2=""}}
    else if(key!=="custom"){op1=key;if(!c)op2=key==="gt"?"lt":(num?"eq":"contains")}
    openDlg({mode:"custom",kind:kind,op1:op1,v1:v1,op2:op2,v2:v2,join:join});
  });
  function openDlg(d){
    closeFilterPop();var dl=document.createElement("div");dl.id="xfDlg";dl.className="xf-ov";
    var opts=function(sel){return Object.keys(opL).map(function(o){return '<option value="'+o+'"'+(sel===o?' selected':'')+'>'+opL[o]+'</option>'}).join("")};
    if(d.mode==="top"){
      dl.innerHTML='<div class="xf-dlg"><h3>Top 10 AutoFilter</h3><p>Show in <b>'+esc(label)+'</b>:</p><div class="xf-row"><select id="xdDir"><option value="top">Top</option><option value="bottom"'+(d.dir==="bottom"?' selected':'')+'>Bottom</option></select><input type="text" id="xdCnt" inputmode="numeric" value="'+esc(d.count)+'" style="width:70px"><span>items</span></div><div class="xf-b"><button class="ok" type="button">OK</button><button class="cx" type="button">Cancel</button></div></div>';
    }else{
      dl.innerHTML='<div class="xf-dlg"><h3>Custom AutoFilter</h3><p>Show rows where <b>'+esc(label)+'</b>:</p><div class="xf-row"><select id="xdO1" style="width:160px">'+opts(d.op1)+'</select><input type="text" id="xdV1" value="'+esc(d.v1)+'"></div>'
        +'<div class="xf-row"><label><input type="radio" name="xdJ" value="and"'+(d.join!=="or"?' checked':'')+'> And</label><label><input type="radio" name="xdJ" value="or"'+(d.join==="or"?' checked':'')+'> Or</label></div>'
        +'<div class="xf-row"><select id="xdO2" style="width:160px">'+opts(d.op2)+'</select><input type="text" id="xdV2" value="'+esc(d.v2)+'"></div><div class="xf-b"><button class="ok" type="button">OK</button><button class="cx" type="button">Cancel</button></div></div>';
    }
    root.appendChild(dl);var f=dl.querySelector("input[type=text]");if(f){f.focus();f.select()}
    function submit(){
      if(d.mode==="top"){
        var n=Math.max(1,parseInt(dl.querySelector("#xdCnt").value,10)||10),top=dl.querySelector("#xdDir").value==="top";
        var ns=numbers().sort(function(a,b){return top?b-a:a-b});if(!ns.length){closeXfDlg();return}
        setF({kind:"number",op:top?"gte":"lte",value:String(ns[Math.min(n,ns.length)-1])});return}
      var clean=function(t){t=String(t==null?"":t);return d.kind==="number"?t.replace(/,/g,"").trim():t};
      var a=clean(dl.querySelector("#xdV1").value),b=clean(dl.querySelector("#xdV2").value),o1=dl.querySelector("#xdO1").value,o2=dl.querySelector("#xdO2").value,j=dl.querySelector("input[name=xdJ]:checked").value,nx;
      if(a.trim()===""&&b.trim()==="")nx=null;
      else if(a.trim()==="")nx={kind:d.kind,op:o2,value:b};
      else{nx={kind:d.kind,op:o1,value:a};if(b.trim()!==""){nx.op2=o2;nx.value3=b;nx.join=j}}
      setF(nx);
    }
    dl.querySelector(".ok").addEventListener("click",submit);dl.querySelector(".cx").addEventListener("click",closeXfDlg);
    dl.addEventListener("keydown",function(ev){if(ev.key==="Enter"){ev.preventDefault();submit()}else if(ev.key==="Escape")closeXfDlg()});
  }
}
onDoc("mousedown",function(ev){var pp=root.querySelector("#filterPop");if(pp&&!pp.contains(ev.target)&&!ev.target.closest(".filter-btn"))closeFilterPop()});
onDoc("keydown",function(ev){if(ev.key==="Escape")closeFilterPop()});
var WRAPC_KEY="bulkWrapCols_v2";S.wrapC={name:1};try{var _w=localStorage.getItem(WRAPC_KEY);if(_w)S.wrapC=JSON.parse(_w)||{}}catch(x){}
function applyWrap(){var C=cols();root.querySelectorAll("#tbl tr").forEach(function(tr){C.forEach(function(c,i){var cell=tr.children[i];if(cell&&!cell.hasAttribute("colspan"))cell.classList.toggle("wrap",!!S.wrapC[c.k])})})}
var COLW_KEY="bulkColW_v2";S.colW={};try{S.colW=JSON.parse(localStorage.getItem(COLW_KEY)||"{}")||{}}catch(x){}
function colW(c){if(S.colW[c.k])return S.colW[c.k];return c.k==="name"?300:c.k==="band"?80:c.k==="note"?260:c.k==="rating"?100:/^(cur|prop|chg)/.test(c.k)?120:c.k==="newBase"?130:c.k==="ctc"?150:110}
function applyColW(){var C=cols(),tot=0,cg='';C.forEach(function(c){var w=colW(c);tot+=w;cg+='<col data-k="'+c.k+'" style="width:'+w+'px">'});
  var t=$("tbl"),o=t.querySelector("colgroup");if(o)o.remove();t.insertAdjacentHTML("afterbegin","<colgroup>"+cg+"</colgroup>");t.style.width=tot+"px"}
function renderGrid(){
  var C=cols(),h="";
  C.forEach(function(c){
    var cls=(c.c||"")+(c.r?" r":"")+(c.ns?" nosort":" sort");
    if(S.sort.key===c.k)cls+=S.sort.dir>0?" asc":" desc";
    var fb=c.ns?'':'<button type="button" class="filter-btn'+(S.colF[c.k]?' filtered':'')+'" data-fk="'+c.k+'" title="Filter">▾</button>';
    h+='<th class="'+cls+'" data-k="'+c.k+'"><div class="th-inner"><span>'+esc(c.t)+'</span>'+fb+'</div>'+'<div class="col-rs"></div></th>';
  });
  $("hdr").innerHTML=h;applyColW();
  var rows=gridRows(),total=rows.length,pages=Math.max(1,Math.ceil(total/PAGE));
  if(S.page>pages)S.page=pages;
  var from=(S.page-1)*PAGE,slice=rows.slice(from,from+PAGE),b="";
  slice.forEach(function(e){
    var p=S.pv&&S.pv.res[e.empId],chg=p&&p.st==="chg",af=chg?p.after:e;
    var cells="";
    S.rules.forEach(function(r){
      var F=FIELDS[r.field],cur=dispVal(r,e,e),prop="—",ct="";
      if(S.pv){
        prop=dispVal(r,e,chg?af:e);
        if(chg){
          if(F.kind==="txt"){if(String(af[F.key])!==String(e[F.key]))ct='<span class="up">changed</span>'}
          else{var d=fieldNum(r,e,af)-fieldNum(r,e,e);
            if(Math.abs(d)>1e-9)ct='<span class="'+(d>0?"up":"dn")+'">'+(d>0?"+":"▼ ")+(F.kind==="pct"?Math.abs(d).toFixed(2)+" pp":inr(Math.abs(d)))+'</span>'}
        }
      }
      var changed=chg&&String(af[F.key])!==String(e[F.key]);
      cells+='<td class="r">'+cur+'</td><td class="r pc'+(changed?'':' same')+'">'+prop+'</td><td class="r">'+ct+'</td>';
    });
    var notes="";
    if(p){
      if(p.st==="skip")notes+='<span class="tag t-grey">Skipped · Edited Manually</span>';
      else if(p.st==="off")notes+='<span class="tag t-grey">Not Selected</span>';
      else if(p.st==="same"||p.st==="norating"){if(p.st==="same")notes+='<span class="tag t-grey">No Change</span>';p.notes.forEach(function(x){notes+='<span class="tag t-'+x.t+'">'+esc(x.m)+'</span>'})}
      else if(chg)p.notes.forEach(function(x){notes+='<span class="tag t-'+x.t+'">'+esc(x.m)+'</span>'});
    }
    if(!S.pv||!p||p.st!=="chg"){if(e.bulk)notes+='<span class="tag t-ok">Bulk Applied</span>';else if(e.hand&&!(p&&p.st==="skip"))notes+='<span class="tag t-info">Edited Manually</span>'}
    var hp=af.hikeAmt/e.basePay*100;
    b+='<tr><td class="c1" title="'+esc(e.empId+" - "+e.name+" - "+e.designation)+'"><div class="emp"><span class="eb'+(e.hand||e.bulk?'':' none')+'"></span><input type="checkbox" data-id="'+e.empId+'"'+(S.off[e.empId]?'':' checked')+'><div class="et"><span class="en">'+esc(e.empId)+' - '+esc(e.name)+'</span><span class="dsg">'+esc(e.designation)+'</span></div></div></td>'
      +'<td>'+e.band+'</td><td class="r">'+(e.rating==null?'—':e.rating.toFixed(1))+'</td><td class="r">'+inr(e.basePay)+'</td>'
      +cells
      +(showHp()?'<td class="r">'+pct(hp)+'</td>':'')+'<td class="r">'+inr(e.basePay+af.hikeAmt)+'</td><td class="r">'+inr(e.basePay+af.hikeAmt+af.newPB+af.newRB)+'</td><td>'+notes+'</td></tr>';
  });
  if(!slice.length)b='<tr><td colspan="'+C.length+'" class="empty">No employees match the filters.</td></tr>';
  $("tb").innerHTML=b;
  var sBase=0,sNew=0,sCtc=0,sc=S.rules.map(function(){return {c:0,p:0}});
  rows.forEach(function(e){
    var af=afterOf(e);
    sBase+=e.basePay;sNew+=e.basePay+af.hikeAmt;sCtc+=e.basePay+af.hikeAmt+af.newPB+af.newRB;
    S.rules.forEach(function(r,i){sc[i].c+=fieldNum(r,e,e);sc[i].p+=fieldNum(r,e,af)});
  });
  var f='<td class="c1">Total · '+total+' employee'+(total===1?'':'s')+'</td><td></td><td></td><td class="r">'+inr(sBase)+'</td>';
  S.rules.forEach(function(r,i){
    var amt=FIELDS[r.field].kind==="amt";
    f+='<td class="r">'+(amt?inr(sc[i].c):'')+'</td><td class="r">'+(amt&&S.pv?inr(sc[i].p):'')+'</td><td class="r">'+(amt&&S.pv?inr(sc[i].p-sc[i].c):'')+'</td>';
  });
  f+=(showHp()?'<td></td>':'')+'<td class="r">'+inr(sNew)+'</td><td class="r">'+inr(sCtc)+'</td><td></td>';
  $("ft").innerHTML=f;applyWrap();
  var selN=rows.filter(function(e){return !S.off[e.empId]}).length;
  $("pager").innerHTML='<span>Showing '+(total?from+1:0)+'–'+Math.min(total,from+PAGE)+' of '+total+'</span><span>·</span><span>'+selN+' selected</span>'+((S.checkF&&S.pv)?'<span class="tag t-info" style="margin-left:6px">Showing: '+esc(CK_LBL[S.checkF])+' <button class="btn lnk" id="bCkClr" type="button">✕ Clear</button></span>':'')
    +'<button class="btn" id="bAll" type="button">Select All in View</button><button class="btn" id="bNone" type="button">Clear Selection</button><span class="sp"></span>'
    +'<button class="btn" id="bPrev" type="button"'+(S.page<=1?' disabled':'')+'>‹ Prev</button><span>Page '+S.page+' of '+pages+'</span><button class="btn" id="bNext" type="button"'+(S.page>=pages?' disabled':'')+'>Next ›</button>';
}
function renderScn(){
  var h="";
  if(!S.scenarios.length)h='<div class="mini">No scenarios yet. Preview a rule and use “Save as Scenario”.</div>';
  else{
    h='<table><thead><tr><th>Name</th><th>Rule</th><th class="r">Rows to Change</th><th class="r">Utilisation After</th><th></th></tr></thead><tbody>';
    S.scenarios.forEach(function(s,i){
      h+='<tr><td><b>'+esc(s.name)+'</b></td><td>'+esc(s.text)+'</td><td class="r">'+s.rows+'</td><td class="r">'+s.util.toFixed(1)+'%</td>'
        +'<td><button class="btn" data-load="'+i+'" type="button">Load</button> <button class="btn" data-del="'+i+'" type="button">Delete</button></td></tr>';
    });
    h+='</tbody></table>';
  }
  $("scnList").innerHTML=h;
  var b="";
  if(!S.batches.length)b='<div class="mini">Nothing applied in this session.</div>';
  else{
    b='<table><thead><tr><th>Time</th><th>Rule</th><th class="r">Rows</th><th>Source</th></tr></thead><tbody>';
    S.batches.slice().reverse().forEach(function(x){b+='<tr><td>'+x.time+'</td><td>'+esc(x.text)+'</td><td class="r">'+x.rows.length+'</td><td>bulk · '+esc(x.id)+'</td></tr>'});
    b+='</tbody></table>';
  }
  $("batchList").innerHTML=b;
}

/* ---------------- actions ---------------- */
function doPreview(){
  S.flash="";
  if(!validate()){S.pv=null;render();return}
  S.pv=buildPreview();pvAuto();S.page=1;S.view="wi";S.wiEx="";S.wiDr="";render();
}
/* what goes to the server: only the fields that actually change, row by row */
function changesFromPreview(){
  var out=[],old={},nw={},ids=[];
  viewRows().forEach(function(e){
    var p=S.pv.res[e.empId];if(!p||p.st!=="chg")return;
    var o={},o2={},any=false;
    S.rules.forEach(function(r){
      var k=FIELDS[r.field].key;
      if(String(p.after[k])===String(e[k]))return;
      var v=p.after[k];
      var ovr=S.ov[e.empId]!=null;
      if(r.field==="hikePct"&&!ovr)v=(r.method==="ted"?Number((r.tedVals||{})[e.superManager]):Number(r.value));   // the server turns Hike % into Hike Amount
      out.push({empId:e.empId,field:(r.field==="hikePct"&&!ovr)?"hikePct":k,value:v});
      o[k]=e[k];o2[k]=p.after[k];any=true;
    });
    if(S.ov[e.empId]!=null&&!usedKeys().hikeAmt&&String(p.after.hikeAmt)!==String(e.hikeAmt)){
      out.push({empId:e.empId,field:"hikeAmt",value:p.after.hikeAmt});o.hikeAmt=e.hikeAmt;o2.hikeAmt=p.after.hikeAmt;any=true}
    if(any){old[e.empId]=o;nw[e.empId]=o2;ids.push(e.empId)}
  });
  return {changes:out,old:old,nw:nw,ids:ids};
}
function byId(id){return EMP.filter(function(m){return m.empId===id})[0]||scope().filter(function(m){return m.empId===id})[0]}
function mergeRows(rows){
  (rows||[]).forEach(function(r){
    var m=mapRow(r),e=byId(m.empId);
    if(e&&EMP.indexOf(e)>=0){m.hand=e.hand;m.bulk=e.bulk;EMP[EMP.indexOf(e)]=m;SC_VER++}
  });
}
/* one call per 500 changes, never splitting one employee's changes (each call is all-or-nothing on the server).
   The screen only shows "n of N done" (in rows); the chunking stays behind the scenes. Demo mode uses small chunks and a short pause so the bar can be seen. */
var DEMO_CHUNK=12,DEMO_DELAY=450;
function chunkByRow(changes,max){var out=[],cur=[],seen={},rows=0;changes.forEach(function(c){if(!seen[c.empId]){if(rows>=max){out.push(cur);cur=[];seen={};rows=0}seen[c.empId]=1;rows++}cur.push(c)});if(cur.length)out.push(cur);return out}   /* max = rows per batch (500), one row is never split */
function rowsIn(list){var m={},n=0;list.forEach(function(c){if(!m[c.empId]){m[c.empId]=1;n++}});return n}
function postChanges(changes,source,meta){
  var chunks=chunkByRow(changes,apiMode()?500:DEMO_CHUNK);
  var saved=0,notes=[],lastRows=null,done=0;
  S.prog={done:0,total:rowsIn(changes),label:(meta&&meta.label)||"Saving"};renderStrip();renderFold();
  function next(){
    if(!chunks.length)return Promise.resolve({saved:saved,notes:notes,rows:lastRows,done:done,total:changes.length});
    var ch=chunks.shift();
    var call=cfg.saveChanges?Promise.resolve().then(function(){return cfg.saveChanges(ch,source,meta)}):apiMode()?apiCall("POST","/cells",{cycle_id:ACTIVE_CYCLE.id,as_role:S.as||undefined,changes:ch,source:source,batch_id:meta&&meta.id,batch_text:meta&&meta.text}):new Promise(function(ok){setTimeout(function(){ok(demoSave(ch))},DEMO_DELAY)});
    return call.then(function(res){
      saved+=Number(res.saved)||ch.length;done+=ch.length;S.prog.done+=rowsIn(ch);renderStrip();renderFold();
      (res.notes||[]).forEach(function(n){notes.push(typeof n==="string"?n:(n.message||n.m||n.note||JSON.stringify(n)))});
      if(res.rows)lastRows=res.rows;
      return new Promise(function(r){setTimeout(r,30)}).then(next);
    },function(err){err.done=done;err.total=changes.length;throw err});
  }
  return next();
}
function demoSave(ch){
  ch.forEach(function(c){
    var e=byId(c.empId);if(!e)return;
    if(c.field==="hikePct")e.hikeAmt=Math.round(hikeBasis(e)*Number(c.value)/100);
    else if(FIELDS[c.field]&&FIELDS[c.field].kind==="amt"||c.field==="hikeAmt")e[c.field]=Number(c.value);
    else e[c.field]=c.value;
  });
  return {saved:ch.length};
}
function afterSave(){return (apiMode()&&!cfg.saveChanges)?loadBudget():Promise.resolve()}
/* Apply / Restore keep the "Saving…" state on screen for at least this long, even when the save is instant */
var MIN_BUSY_MS=1000;
function doApply(){
  if(!cfg.canApply||!S.pv||S.locked||S.busy||!S.pv.n.chg)return;
  var x=changesFromPreview();if(!x.changes.length)return;
  var text=S.pv.text;
  S.busy=true;S.err="";S.flash="";render();
  var t0=Date.now();
  var bid="BO-"+Date.now().toString(36)+Math.random().toString(36).slice(2,5);
  postChanges(x.changes,"bulk",{id:bid,text:text,label:"Applying"}).then(function(res){
    if(res.rows)mergeRows(res.rows);
    var batch={id:bid,at:Date.now(),time:nowT(),by:(ME&&ME.name)||"You",text:text,rows:[],restored:false};
    x.ids.forEach(function(id){var e=byId(id);batch.rows.push({id:id,old:x.old[id],nw:x.nw[id],bulk:e.bulk});e.bulk=true});
    S.batches.push(batch);S.pv=null;S.ov={};if(cfg.onApplied){try{cfg.onApplied(batch)}catch(x){}}
    return afterSave().then(function(){syncBatches(false)}).then(function(){
      S.flash="Saved "+res.saved+" change"+(res.saved===1?"":"s")+" on "+x.ids.length+" rows · "+batch.time+" · source “bulk” in the audit trail"+(res.notes.length?" · Server notes: "+res.notes.join("; "):"");
    });
  }).catch(function(err){
    S.err=err.message+(err.done?" ("+err.done+" of "+err.total+" changes had already been saved; the screen is being refreshed)":" Nothing was changed.");
    if(err.done&&apiMode()&&!cfg.saveChanges)return loadAll();
  }).then(function(){var w=Math.max(0,MIN_BUSY_MS-(Date.now()-t0));return w?new Promise(function(r){setTimeout(r,w)}):0}).then(function(){S.busy=false;S.prog=null;render()});
}
function doReset(){   // back to the starting point: one Hike % rule at 0, everyone, nothing previewed
  if(S.busy)return;
  var f=FORDER.filter(function(x){return fieldOn(x)&&canEdit(FIELDS[x].key)})[0]||"hikePct";
  S.rules=[newRule(f,f==="hikePct")];S.filt={};S.off={};S.pv=null;S.ov={};S.page=1;S.flash="";S.err="";S.skipHand=true;
  $("skipHand").checked=true;var q=$("flt_q");if(q)q.value="";
  closePop();renderRules();render();
}
function discard(){S.pv=null;S.ov={};S.flash="";S.confirmAt=0;S.checkF="";render()}
function saveScn(){
  var nm=$("scnName").value.trim();if(!nm||!S.pv)return;
  var bs=0;scope().forEach(function(e){bs+=e.basePay});
  S.scenarios.push({name:nm,text:S.pv.text,rows:S.pv.n.chg,util:S.pv.after.util,utilT:S.pv.after.utilT,hike:S.pv.hike.after,avg:bs?S.pv.hike.after/bs*100:0,rules:S.pv.rules,skip:S.skipHand});
  persist();$("scnForm").classList.add("hide");$("scnName").value="";
  $("scnCard").classList.remove("hide");S.flash="Saved scenario “"+nm+"”";render();
}
function loadScn(i){
  var s=S.scenarios[i];
  S.rules=JSON.parse(JSON.stringify(s.rules)).filter(function(r){return FIELDS[r.field]&&fieldOn(isHike(r.field)?"hikePct":r.field)}).map(function(r){r.uid=++uidN;return r});
  if(!S.rules.length)S.rules=[newRule("hikePct",true)];
  $("skipHand").checked=s.skip;S.skipHand=s.skip;renderRules();doPreview();
}
function persist(){try{localStorage.setItem("bulkScenarios_v3",JSON.stringify(S.scenarios))}catch(x){}}
function restore(){try{var v=localStorage.getItem("bulkScenarios_v3");if(v)S.scenarios=JSON.parse(v)||[]}catch(x){}}

/* ---------------- Excel export (same library, loaded only when used, as on the Appraisal Sheet) ---------------- */
function withXLSX(fn){
  if(XLSX){fn();return}
  Promise.resolve(cfg.loadXLSX?cfg.loadXLSX():null).then(function(m){if(!m)throw new Error("none");XLSX=m;fn()}).catch(function(){S.flash="Excel export could not load.";render()});
}
function exportXlsx(){
  var head=["Emp ID","Employee Name","Designation","Band","Manager Rating","Base Pay"];
  S.rules.forEach(function(r){var L=FIELDS[r.field].label;head.push("Current · "+L,"Proposed · "+L,"Change · "+L)});
  head.push("Hike% (After)","New Base Salary (After)","Total CTC with Rewards (After)","Note");
  var aoa=[head];
  viewRows().forEach(function(e){
    var p=S.pv&&S.pv.res[e.empId],chg=p&&p.st==="chg",af=chg?p.after:e;
    var row=[e.empId,e.name,e.designation,e.band,e.rating==null?"":e.rating,e.basePay];
    S.rules.forEach(function(r){
      var F=FIELDS[r.field];
      if(F.kind==="txt"){row.push(e[F.key],S.pv?af[F.key]:"",chg&&String(af[F.key])!==String(e[F.key])?"changed":"");return}
      var c=fieldNum(r,e,e),pr=fieldNum(r,e,af);
      row.push(Number(c.toFixed(2)),S.pv?Number(pr.toFixed(2)):"",S.pv?Number((pr-c).toFixed(2)):"");
    });
    var note="";
    if(p){if(p.st==="skip")note="Skipped · Edited Manually";else if(p.st==="off")note="Not Selected";else if(p.st==="same")note="No Change";
      (p.notes||[]).forEach(function(x){note+=(note?"; ":"")+x.m})}
    row.push(Number((af.hikeAmt/e.basePay*100).toFixed(2)),e.basePay+af.hikeAmt,e.basePay+af.hikeAmt+af.newPB+af.newRB,note);
    aoa.push(row);
  });
  var ws=XLSX.utils.aoa_to_sheet(aoa);ws["!cols"]=head.map(function(){return {wch:18}});
  var wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Bulk Preview");
  XLSX.writeFile(wb,"bulk_operations_"+new Date().toISOString().slice(0,10)+".xlsx");
}

/* ---------------- wiring ---------------- */
function fillSelects(){renderFilters()}
function setRole(){
  if(apiMode()){S.as=$("roleSel").value;S.off={};S.page=1;S.pv=null;loadAll();return}
  S.role=$("roleSel").value;
  var us=$("userSel");
  if(S.role==="HR"){us.classList.add("hide");S.user=""}
  else{var list=S.role==="TE"?TES:CMS;us.innerHTML=list.map(function(x){return '<option>'+esc(x)+'</option>'}).join("");us.classList.remove("hide");S.user=us.value}
  $("roleBadge").textContent=S.role==="HR"?"HR":S.role==="TE"?"Tech ED":"Comp Manager";
  renderFilters();
  S.off={};S.page=1;S.pv=null;S.ov={};S.flash="";render();
}
function onFilter(){
  S.skipHand=$("skipHand").checked;S.page=1;S.flash="";
  if(S.pv)refreshPreview();else render();
}
function setFilt(id,vals){if(vals&&vals.length)S.filt[id]=vals;else delete S.filt[id];onFilter()}
onDoc("input",function(ev){var el=ev.target;if(el.id==="flt_q"){S.filt.q=el.value;if(!el.value)delete S.filt.q;onFilter()}});
$("skipHand").addEventListener("change",onFilter);
$("bAddF").addEventListener("click",function(ev){ev.stopPropagation();if(S.pop&&S.pop.kind==="add"){closePop();return}openAdd(ev.currentTarget)});
$("bClearF").addEventListener("click",function(){S.filt={};if(!$("flt_q"))S.filt={};var q=$("flt_q");if(q)q.value="";S.page=1;onFilter()});
$("fbChips").addEventListener("click",function(ev){
  var b=ev.target.closest("button");if(!b)return;ev.stopPropagation();
  var o=b.getAttribute("data-open"),r=b.getAttribute("data-rm");
  if(o){if(S.pop&&S.pop.kind==="vals"&&S.pop.id===o){closePop();return}openVals(o,b)}
  if(r){S.active=S.active.filter(function(x){return x!==r});delete S.filt[r];saveMine();closePop();onFilter()}
});
$("pop").addEventListener("click",function(ev){
  ev.stopPropagation();var t=ev.target.closest("[data-add],[data-clear],[data-done],[data-numapply],[data-rngadd]");if(!t)return;
  if(t.getAttribute("data-rngadd")){var rid=t.getAttribute("data-rngadd"),f1=$("rgFrom").value,f2=$("rgTo").value;
    if(f1===""&&f2==="")return;if(f1===""){f1="0"}
    var cur2=(S.filt[rid]||[]).concat(["c:"+f1+":"+f2]);setFilt(rid,cur2);openVals(rid,$("fbChips").querySelector('[data-open="'+rid+'"]')||$("bAddF"));return}
  if(t.getAttribute("data-numapply")){var nid=t.getAttribute("data-numapply"),nvl=$("numVal").value;setFilt(nid,nvl===""?[]:[$("numOp").value,nvl]);closePop();return}
  if(t.getAttribute("data-add")){var id=t.getAttribute("data-add");S.active.push(id);saveMine();renderChips();
    var chip=$("fbChips").querySelector('[data-open="'+id+'"]');if(chip)openVals(id,chip);else closePop()}
  else if(t.getAttribute("data-clear")){setFilt(t.getAttribute("data-clear"),[]);openVals(t.getAttribute("data-clear"),$("fbChips").querySelector('[data-open="'+t.getAttribute("data-clear")+'"]')||$("bAddF"))}
  else closePop();
});
$("pop").addEventListener("change",function(ev){
  var c=ev.target;if(c.getAttribute("data-val")==null||!S.pop)return;
  var id=S.pop.id,vals=[];$("pop").querySelectorAll("[data-val]").forEach(function(x){if(x.checked)vals.push(x.getAttribute("data-val"))});
  setFilt(id,vals);
});
onDoc("click",function(){if(S.pop)closePop()});
onDoc("keydown",function(ev){if(ev.key==="Escape"&&S.pop)closePop()});
onWin("resize",function(){if(S.pop)closePop()});

/* fold: the top section folds when the grid is scrolled, and opens again at the top of the grid or with Expand */
var ignoreScroll=false,lastTop=0;
function setFold(v){return;   // v40: the top section no longer folds
  S.fold=v;root.classList.toggle("folded",v);$("foldBar").classList.toggle("hide",!v);
  if(v)renderFold();closePop();
  ignoreScroll=true;setTimeout(function(){ignoreScroll=false},350);
}
$("gw").addEventListener("scroll",function(){
  var t=$("gw").scrollTop;
  if(!ignoreScroll){
    if(!S.fold&&t>30&&t>lastTop)setFold(true);
  }
  lastTop=t;
});
$("gw").addEventListener("wheel",function(ev){if(S.fold&&ev.deltaY<0&&$("gw").scrollTop<=0)setFold(false)},{passive:true});

$("bMore").addEventListener("click",function(ev){$("moreM").classList.toggle("on");ev.stopPropagation()});
onDoc("click",function(){$("moreM").classList.remove("on")});
$("bFold").addEventListener("click",function(){setFold(true)});
$("gw").addEventListener("wheel",function(ev){if(!S.fold&&ev.deltaY>0)setFold(true)},{passive:true});
/* the whole left column also folds the top section: wheel down anywhere in it, or any scroll of the column itself */
$("mainCol").addEventListener("wheel",function(ev){
  if(!S.fold&&ev.deltaY>0)setFold(true);
  else if(S.fold&&ev.deltaY<0&&$("gw").scrollTop<=0&&$("mainCol").scrollTop<=0)setFold(false);
},{passive:true});
$("mainCol").addEventListener("scroll",function(){if(!ignoreScroll&&!S.fold&&$("mainCol").scrollTop>30)setFold(true)});
$("foldBar").addEventListener("click",function(ev){
  var id=ev.target.id;
  if(id==="bExpand")setFold(false);
  if(id==="bPreview2")doPreview();
  if(id==="bApply2")askApply();
});
function filterSummary(){
  var parts=[];
  if(S.filt.q)parts.push('“'+esc(S.filt.q)+'”');
  S.active.forEach(function(id){var d=fdef(id),v=S.filt[id];if(d&&v&&v.length)parts.push(esc(d.label)+' <b>'+(d.type==="num"?esc(numLabel(v)):v.map(function(x){return esc(valLabel(d,x))}).join(", "))+'</b>')});
  return parts.length?parts.join(" · "):"Everyone";
}
function renderFold(){
  if(!S.fold)return;
  var sc=scope(),b=S.pv?S.pv.after:budgetOf(sc,null),b0=S.pv?S.pv.before:b;
  var n=S.pv?S.pv.n.chg:0,okPv=!!cfg.canApply&&S.pv&&n>0&&!S.locked&&!S.busy;
  $("foldBar").innerHTML='<span class="t">For <b>'+filterSummary()+'</b> · <b>'+viewRows().length+'</b> of '+sc.length+'</span>'
    +'<span class="t">Change <b>'+esc(ruleText(S.rules))+'</b></span>'
    +'<span class="bud">Budget '+b.util.toFixed(1)+'%'+(S.pv&&Math.abs(b.util-b0.util)>0.005?' <small>from '+b0.util.toFixed(1)+'%</small>':'')+'</span>'
    +(S.busy&&S.prog?'<span class="t"><b>'+inr(S.prog.done)+' of '+inr(S.prog.total)+' done</b></span>':'')
    +'<span class="sp"></span>'
    +'<button class="btn pri sm" id="bPreview2" type="button"'+(S.locked||S.busy||S.loading?' disabled':'')+'>Preview</button>'
    +'<button class="btn main sm" id="bApply2" type="button"'+(okPv?'':' disabled title="'+esc($("ruleNote").textContent)+'"')+'>'+applyLabel()+'</button>'
    +'<button class="btn sm" id="bExpand" type="button">Expand ▾</button>';
}
$("ruleRows").addEventListener("input",function(ev){
  var el=ev.target,row=el.closest(".rrow");if(!row)return;
  var r=ruleBy(Number(row.getAttribute("data-uid")));if(!r)return;
  var k=el.getAttribute("data-k"),rn=el.getAttribute("data-r");
  if(k==="value")r.value=el.value;else if(k==="text")r.text=el.value;else if(k==="distAmt")r.distAmt=el.value;else if(k==="adjAmt")r.adjAmt=el.value;else if(k==="ted"){r.tedVals[el.getAttribute("data-te")]=el.value}else return;
  S.flash="";if(S.pv)refreshPreview();
});
$("ruleRows").addEventListener("change",function(ev){
  var el=ev.target,row=el.closest(".rrow");if(!row)return;
  var r=ruleBy(Number(row.getAttribute("data-uid")));if(!r)return;
  var k=el.getAttribute("data-k");if(!k)return;
  S.flash="";
  if(k==="field"){if(el.value==="hikePct"&&isHike(r.field)){return}var keep=r.uid;var n=newRule(el.value,false);n.uid=keep;S.rules[S.rules.indexOf(r)]=n;renderRules()}
  else if(k==="hikeUnit"){var keep2=r.uid,n2=newRule(el.value==="pct"?"hikePct":"hikeAmt",false);n2.uid=keep2;n2.value=r.value;S.rules[S.rules.indexOf(r)]=n2;renderRules()}
  else if(k==="method"){r.method=el.value;if(r.method==="dist"||r.method==="adj")r.unit="amt";renderRules()}
  else if(k==="distSrc"){r.distSrc=el.value;renderRules()}
  else if(k==="distBy")r.distBy=el.value;
  else if(k==="adjDir")r.adjDir=el.value;
  else if(k==="unit"){r.unit=el.value;renderRules()}
  else if(k==="inst")r.inst=el.value;
  else if(k==="textMode")r.textMode=el.value;
  else return;
  if(S.pv)refreshPreview();else render();
});
$("ruleRows").addEventListener("click",function(ev){
  var b=ev.target.closest("[data-rm]");if(!b||S.rules.length===1)return;
  var uid=Number(b.getAttribute("data-rm"));S.rules=S.rules.filter(function(r){return r.uid!==uid});
  S.flash="";renderRules();if(S.pv)refreshPreview();else render();
});
$("bAddField").addEventListener("click",function(){
  var taken=usedKeys(0),f=FORDER.filter(function(x){return fieldOn(x)&&!taken[FIELDS[x].key]&&canEdit(FIELDS[x].key)})[0];
  if(!f)return;S.rules.push(newRule(f,false));S.flash="";renderRules();render();
});

$("roleSel").addEventListener("change",setRole);
$("userSel").addEventListener("change",function(){S.user=$("userSel").value;S.off={};S.page=1;S.pv=null;S.ov={};render()});
$("bPreview").addEventListener("click",doPreview);
$("bApply").addEventListener("click",askApply);
$("bDiscard").addEventListener("click",discard);
$("bReset").addEventListener("click",doReset);
$("bExport").addEventListener("click",function(){withXLSX(exportXlsx)});
$("bScnSave").addEventListener("click",function(){
  $("scnForm").classList.remove("hide");
  var r0=S.rules[0],nm=FIELDS[r0.field].label+" "+(r0.value+(r0.field==="hikePct"?"%":""));
  if(S.rules.length>1)nm+=" + "+(S.rules.length-1)+" more";
  $("scnName").value=nm;$("scnName").focus();
});
$("bScnOk").addEventListener("click",saveScn);
$("bScnCancel").addEventListener("click",function(){$("scnForm").classList.add("hide")});
$("scnName").addEventListener("keydown",function(ev){if(ev.key==="Enter")saveScn();if(ev.key==="Escape")$("scnForm").classList.add("hide")});
/* Restore last apply: the newest batch not yet restored. Same two-step confirm and same doRestore as the History tab. */
function lastBatch(){for(var i=S.batches.length-1;i>=0;i--)if(!S.batches[i].restored)return S.batches[i];return null}
function renderRestoreLast(){
  var b=lastBatch(),el=$("bRestoreLast");if(!el)return;
  var armed=b&&restoreAt.id===b.id&&Date.now()-restoreAt.t<6000;
  el.disabled=!b||S.busy||S.locked||!cfg.canApply;
  el.textContent=!b?"Restore Last Apply":(armed?"Confirm Restore · ":"Restore Last Apply · ")+b.rows.length+" row"+(b.rows.length===1?"":"s");
}
$("bRestoreLast").addEventListener("click",function(ev){
  var b=lastBatch();if(!b)return;
  if(restoreAt.id===b.id&&Date.now()-restoreAt.t<6000){restoreAt={id:"",t:0};$("moreM").classList.remove("on");doRestore(b.id);return}
  ev.stopPropagation();restoreAt={id:b.id,t:Date.now()};renderRestoreLast();renderImpact();
  setTimeout(function(){if(restoreAt.id===b.id&&Date.now()-restoreAt.t>=6000){restoreAt={id:"",t:0};renderRestoreLast();renderImpact()}},6100);
});
$("bScnOpen").addEventListener("click",function(){$("scnCard").classList.toggle("hide")});
$("scnCard").addEventListener("click",function(ev){
  var t=ev.target;
  if(t.getAttribute("data-load")!=null)loadScn(Number(t.getAttribute("data-load")));
  if(t.getAttribute("data-del")!=null){S.scenarios.splice(Number(t.getAttribute("data-del")),1);persist();renderScn()}
});
$("hdr").addEventListener("mousedown",function(ev){
  var h=ev.target.closest(".col-rs");if(!h)return;ev.preventDefault();ev.stopPropagation();
  var th=h.parentNode,k=th.getAttribute("data-k"),col=$("tbl").querySelector('col[data-k="'+k+'"]'),x0=ev.clientX,w0=th.getBoundingClientRect().width;h.classList.add("on");
  function mv(e){S.colW[k]=Math.max(k==="name"?180:60,Math.round(w0+e.clientX-x0));col.style.width=S.colW[k]+"px";var t=0;cols().forEach(function(c){t+=colW(c)});$("tbl").style.width=t+"px"}
  function up(){h.classList.remove("on");offDoc("mousemove",mv);offDoc("mouseup",up);try{localStorage.setItem(COLW_KEY,JSON.stringify(S.colW))}catch(x){}}
  onDoc("mousemove",mv);onDoc("mouseup",up)});
$("hdr").addEventListener("click",function(ev){
  if(ev.target.closest(".col-rs"))return;
  var fbn=ev.target.closest(".filter-btn");
  if(fbn){ev.stopPropagation();var fk=fbn.getAttribute("data-fk");if(root.querySelector("#filterPop")&&fbn.classList.contains("active"))closeFilterPop();else openFilterPop(fk,fbn);return}
  var th=ev.target.closest("th");if(!th||th.classList.contains("nosort"))return;
  var k=th.getAttribute("data-k");
  if(S.sort.key===k)S.sort.dir=-S.sort.dir;else{S.sort.key=k;S.sort.dir=1}
  renderGrid();
});
$("tb").addEventListener("change",function(ev){
  var id=ev.target.getAttribute("data-id");if(!id)return;
  if(ev.target.checked)delete S.off[id];else S.off[id]=1;
  S.flash="";if(S.pv)refreshPreview();else render();
});
$("pager").addEventListener("click",function(ev){
  var id=ev.target.id;
  if(id==="bCkClr"){S.checkF="";S.page=1;render();return}
  if(id==="bPrev"){S.page--;renderGrid()}
  if(id==="bNext"){S.page++;renderGrid()}
  if(id==="bAll"){S.off={};S.flash="";if(S.pv)refreshPreview();else render()}
  if(id==="bNone"){viewRows().forEach(function(e){S.off[e.empId]=1});S.flash="";if(S.pv)refreshPreview();else render()}
});
onWin("beforeunload",function(ev){if(S.pv){ev.preventDefault();ev.returnValue=""}});


/* ---------------- metric cards ----------------
   Each card is one function that returns card(...). To add a card: write the function, add it to CARDS.
   ctx = {pv, rows (rows that will change), scope (everyone in view of this login), before, after (budget figures)} */
function card(cls,tag,bigHtml,sub){
  return '<div class="ic'+(cls?' '+cls:'')+'"><div class="tg">'+tag+'</div><div class="bn">'+bigHtml+'</div>'+sub+'</div>';
}
function cardBudget(c){
  var b0=c.before,b1=c.after,u0=b0.util,u1=b1.util,left=b1.left,add=b1.used-b0.used,moved=!!c.pv&&Math.abs(u1-u0)>0.005;
  var h=card(u1>100?"red":"",'Budget Utilised',u1.toFixed(1)+'%<small>'+(moved?'from '+u0.toFixed(1)+'%':'now')+'</small>',
    '<div class="bar"><i class="af" style="width:'+Math.min(100,u1)+'%"></i>'+(moved?'<i class="bf" style="width:'+Math.min(100,u0)+'%"></i>':'')+'</div>'
    +'<div class="sb"><b>'+big(Math.abs(left))+'</b> '+(left>=0?'left':'over budget')+' of '+big(b1.budget)+' · incl. Target PB <b>'+b1.utilT.toFixed(1)+'%</b>'
    +(c.pv?'<br>This change adds <b>'+big(add)+'</b> to the amount used':'')+'</div>');
  return h;
}
function cardByRating(c){
  var by={5:[],4:[],3:[],2:[],1:[]};
  c.rows.forEach(function(e){var b=bucket(e);if(b)by[b].push(c.pv.res[e.empId].after.hikeAmt/e.basePay*100)});
  var h='';
  [5,4,3,2,1].forEach(function(k){
    var a=by[k],v=a.length?a.reduce(function(x,y){return x+y},0)/a.length:0;
    h+='<div class="rb"><span>'+k+'</span><span class="t"><i style="width:'+Math.min(100,v/12*100)+'%"></i></span><b>'+(a.length?v.toFixed(1)+'%':'—')+'</b></div>';
  });
  if(!c.pv)h='<div class="sb">Click Preview to see the average hike % for each Manager Rating.</div>';
  return card("green",'Average Hike % by Rating','',h);
}
/* share of the budget taken by one group of fields (Hike, or PB + RB), before and after the preview */
function shareCard(tag,cls,cols,c){
  var sc=c.scope,v0=0,v1=0;
  sc.forEach(function(e){var a=c.pv&&c.pv.res[e.empId]&&c.pv.res[e.empId].st==="chg"?c.pv.res[e.empId].after:e;
    cols.forEach(function(k){v0+=Number(e[k])||0;v1+=Number(a[k])||0})});
  var p0=c.before.budget?v0/c.before.budget*100:0,p1=c.after.budget?v1/c.after.budget*100:0,moved=!!c.pv&&Math.abs(p1-p0)>0.005;
  return card(cls,tag,p1.toFixed(1)+'%<small>'+(moved?'from '+p0.toFixed(1)+'%':'now')+'</small>',
    '<div class="bar"><i class="af" style="width:'+Math.min(100,p1)+'%"></i>'+(moved?'<i class="bf" style="width:'+Math.min(100,p0)+'%"></i>':'')+'</div>'
    +'<div class="sb"><b>'+big(v1)+'</b> of '+big(c.after.budget)+(moved?' · adds <b>'+big(v1-v0)+'</b>':'')+'</div>');
}
function cardHikeShare(c){return shareCard("Hike as Budget Consumed","amber",["hikeAmt"],c)}
function cardBonusShare(c){return shareCard("Bonus as Budget Consumed","violet",["newPB","newRB"],c)}
/* Placeholders: empty cards that hold a place for a metric to be added later.
   To build one, replace its entry in CARDS with a real card function (see cardBudget / cardByRating). */
function placeholder(tag){return function(){return '<div class="ic ph"><div class="tg">'+tag+'</div><div class="bn">—</div><div class="sb">Placeholder · Coming Soon</div></div>'}}
var CARDS=[cardBudget,cardHikeShare,cardBonusShare,cardByRating];   // to add a card: write its function and add it here
/* Target PB in the budget left: counted or not (screen option, remembered per browser) */
var TPB_KEY="bulkIncTpb_v1";S.incTpb=false;   // v40: Target PB is outside the budget, always
function tpbOpt(){return '<div class="tpbopt"><span>Budget Left</span><select id="tpbSel"><option value="0"'+(S.incTpb?'':' selected')+'>Without Target PB</option><option value="1"'+(S.incTpb?' selected':'')+'>With Target PB</option></select></div>'}
/* Batch history: every Apply is one batch. "Restore previous values" puts back the values the batch replaced.
   A row edited by anyone after the batch is left alone and counted. Server (assumed, verify with the developer):
   POST /cells carries batch_id + batch_text; GET /batches?cycle_id= lists them; POST /batches/{id}/restore {cycle_id}
   returns {restored, skipped, rows} and writes source "bulk_restore" to the audit trail. */
var restoreAt={id:"",t:0};
function sameVal(a,b){return String(a)===String(b)||(Number(a)===Number(b)&&!isNaN(Number(a)))}
function historyTab(){
  if(!S.batches.length)return '<div class="mini" style="padding:6px 2px">Nothing applied yet in this cycle.</div>';
  var h='<div class="bh">';
  S.batches.slice().reverse().forEach(function(x){
    var armed=restoreAt.id===x.id&&Date.now()-restoreAt.t<6000;
    h+='<div class="bhr"><div class="bht"><b>'+esc(x.time)+'</b> · '+esc(x.by||"")+' · '+x.rows.length+' row'+(x.rows.length===1?'':'s')+(x.restored?' <span class="tag t-grey">Restored</span>':'')+'</div>'
      +'<div class="mini">'+esc(x.text)+'</div>'
      +(x.restored?'':'<button class="btn" type="button" data-restore="'+esc(x.id)+'">'+(armed?'Confirm Restore · '+x.rows.length+' row'+(x.rows.length===1?'':'s'):'Restore Previous Values')+'</button>')+'</div>';
  });
  return h+'</div>';
}
function doRestore(id){
  if(!cfg.canApply)return;
  var b=S.batches.filter(function(x){return x.id===id})[0];if(!b||b.restored||S.busy||S.locked)return;
  var ch=[],skipped=0,ids=[];
  b.rows.forEach(function(r){
    var e=byId(r.id);if(!e)return;
    var clash=Object.keys(r.old).some(function(k){return !sameVal(e[k],r.nw[k])});
    if(clash){skipped++;return}
    Object.keys(r.old).forEach(function(k){ch.push({empId:r.id,field:k,value:r.old[k]})});ids.push(r.id);
  });
  if(!ch.length){S.flash="Nothing restored: every row in this batch was changed again afterwards.";render();return}
  var t0=Date.now();S.busy=true;S.err="";render();
  postChanges(ch,"bulk_restore",{id:b.id,text:"Restore of "+b.id,label:"Restoring"}).then(function(res){
    if(res.rows)mergeRows(res.rows);
    b.rows.forEach(function(r){if(ids.indexOf(r.id)>=0){var e=byId(r.id);if(e)e.bulk=r.bulk}});
    b.restored=true;S.pv=null;
    return afterSave().then(function(){syncBatches(false)}).then(function(){S.flash="Restored previous values on "+ids.length+" row"+(ids.length===1?"":"s")+(skipped?" · "+skipped+" skipped (changed again since)":"")+" · "+nowT()+" · source “bulk_restore” in the audit trail"});
  }).catch(function(err){S.err=err.message+" Nothing was restored."}).then(function(){var w=Math.max(0,MIN_BUSY_MS-(Date.now()-t0));return w?new Promise(function(r){setTimeout(r,w)}):0}).then(function(){S.busy=false;S.prog=null;render()});
}
function pvOK(){   // Pivot is for HR and Tech ED; a Comp Manager does not get it
  if(apiMode()){var r=String((S.as||(ME&&(ME.activeRole||ME.role))||"")).toLowerCase();return !r||!/comp/.test(r)||/hr|tech/.test(r)}
  return S.role!=="CM";
}
function renderImpact(){
  if(PT==="pivot"&&!pvOK())PT="summary";
  var pb=root.querySelector('#mpTabs [data-t="pivot"]');if(pb)pb.style.display=pvOK()?"":"none";
  root.setAttribute("data-pt",PT);var lt=$("lyTog");if(lt)lt.innerHTML=""
  root.classList.toggle("pvOn",PT==="pivot");
  var p=S.pv,sc=scope();
  if(S.loading||!sc.length){$("imp").innerHTML="";return}
  var rows=p?viewRows().filter(function(e){var r=p.res[e.empId];return r&&r.st==="chg"}):[];
  var ctx={pv:p,rows:rows,scope:sc,before:p?p.before:budgetOf(sc,null),after:p?p.after:budgetOf(sc,null)};
  $("imp").innerHTML=(PT==="exc"?excTab(ctx):PT==="summary"?sumTab(ctx):PT==="pivot"?pivotTab(ctx):PT==="charts"?chartsTab(ctx):PT==="checks"?checksTab(ctx):PT==="history"?historyTab():budgetTab(ctx));
}

/* ---------------- right panel: Spread and Checks ----------------
   Group by lists Manager Rating plus every select-type field HR allows in HR Config (Band, Skill ... as they are added). */
var PT_KEY="bulkPanelTab_v1",GB_KEY="bulkGroupBy_v1",PT="budget",GB="rating";
try{PT=localStorage.getItem(PT_KEY)||"budget";if(PT==="spread")PT="budget";GB=localStorage.getItem(GB_KEY)||"rating"}catch(x){}
PT="summary";
function groupOpts(){
  var o=[{id:"rating",label:"Manager Rating"}],seen={};
  FDEFS.forEach(function(d){if(d.type==="select"&&d.field&&!seen[d.field]){seen[d.field]=1;o.push({id:d.field,label:d.label})}});
  if(!seen.band)o.splice(1,0,{id:"band",label:"Band"});
  return o;
}
function groupKey(e,g){if(g==="rating"){var b=bucket(e);return b==null?"No Rating":String(b)}var v=e[g];return v==null||v===""?"—":String(v)}
function spreadTab(c){
  var opts=groupOpts();if(!opts.some(function(o){return o.id===GB}))GB="rating";
  var h='<div class="gb"><label for="gbSel">Group by</label><select id="gbSel">'+opts.map(function(o){return '<option value="'+esc(o.id)+'"'+(o.id===GB?' selected':'')+'>'+esc(o.label)+'</option>'}).join("")+'</select></div>';
  if(!c.pv)return h+'<div class="empty">Click Preview to see the average hike % for each group.</div>';
  var g={};
  c.rows.forEach(function(e){var k=groupKey(e,GB);(g[k]=g[k]||[]).push(c.pv.res[e.empId].after.hikeAmt/e.basePay*100)});
  var keys=Object.keys(g);
  keys.sort(function(a,b){if(GB==="rating"){var x=a==="No Rating"?-1:+a,y=b==="No Rating"?-1:+b;return y-x}return a<b?-1:a>b?1:0});
  if(!keys.length)return h+'<div class="empty">No rows change in this preview.</div>';
  var avg=keys.map(function(k){var a=g[k];return a.reduce(function(x,y){return x+y},0)/a.length}),mx=Math.max.apply(null,avg.concat([0.01]));
  h+='<div class="gl">'+keys.map(function(k,i){return '<div class="gr"><span class="gk">'+esc(k)+'</span><span class="t"><i style="width:'+Math.round(avg[i]/mx*100)+'%"></i></span><b>'+avg[i].toFixed(1)+'%</b><span class="gn">'+g[k].length+'</span></div>'}).join("")+'</div>'
    +'<div class="note2">Average hike % of the rows that change · last column is the number of rows.</div>';
  return h;
}
function kv(k,v,x){return '<div class="kv"><span>'+k+'</span><b>'+v+'</b>'+(x||'')+'</div>'}
function budgetTabOld(c){
  var b0=c.before,b1=c.after,pv=!!c.pv,moved=pv&&Math.abs(b1.util-b0.util)>0.005,add=b1.used-b0.used,left=b1.left;
  var dl=!pv||Math.abs(add)<0.5?'':(add>0?'<span class="up">▲ '+big(add)+'</span>':'<span class="dn">▼ '+big(-add)+'</span>');
  var h='<div class="ic'+(b1.util>100?' red':'')+'"><div class="tg">Budget Utilised</div>'
    +'<div class="bn">'+b1.util.toFixed(1)+'%<small>'+(moved?'from '+b0.util.toFixed(1)+'%':'now')+'</small></div>'
    +'<div class="bar"><i class="af" style="width:'+Math.min(100,b1.util)+'%"></i>'+(moved?'<i class="bf" style="width:'+Math.min(100,b0.util)+'%"></i>':'')+'</div>'
    +'<div class="sb">incl. Target PB <b>'+b1.utilT.toFixed(1)+'%</b>'+(moved?' <small>from '+b0.utilT.toFixed(1)+'%</small>':'')+'</div></div>';
  h+='<div class="kvs">'+kv('Budget',big(b1.budget))
    +kv('Consumed Now',big(b0.used))
    +kv('Consumed After',pv?big(b1.used):'—',dl)
    +kv(left>=0?'Left':'Over Budget',big(Math.abs(left)))+'</div>';
  if(pv){
    var hn=0;c.scope.forEach(function(e){hn+=Number(e.hikeAmt)||0});
    h+='<div class="kvs">'+kv('People Affected',c.pv.n.chg)+kv('Skipped · Edited Manually',c.pv.n.skip)+kv('Left Out · Unticked',c.pv.n.off)
      +kv('Total Hike Before',big(c.pv.hike.before))+kv('Total Hike After',big(c.pv.hike.after),c.pv.hike.after>c.pv.hike.before?'<span class="up">▲ '+big(c.pv.hike.after-c.pv.hike.before)+'</span>':'')+'</div>';
    if(left<0)h+='<div class="callout warn"><b>Over Budget</b><br>This change takes the budget '+big(-left)+' over. Warning only — you can still apply.</div>';
  }
  if(!pv)h+='<div class="note2" style="margin-top:0">Consumed = Hike + PB + RB. Click Preview to see the effect of this change.</div>';
  else h+='<div class="note2" style="margin-top:0">Consumed = Hike + PB + RB. Nothing is saved until Apply.</div>';
  h+=shareCard("Hike as Budget Consumed","amber",["hikeAmt"],c)+shareCard("Bonus as Budget Consumed","violet",["newPB","newRB"],c);
  h+='<div class="grad"></div><div class="chip-sec">Spread</div>'+spreadTab(c);
  return h;
}
/* ---------------- Charts tab: Budget fit, Performance differentiation, Position in band, Scenario comparison ----------------
   Inline SVG / CSS only (no library, no outside call). Every chart is a summary; clicking a rating bar opens the drill-down of that group on the What-if tab. */
var CCOL={before:"#9DBDEB",after:"#27548A",warn:"#D99A2B",alloc:"#C9D8EC"};
function lgd(a){return '<div class="lg">'+a.map(function(i){return '<span><i style="background:'+i[1]+'"></i>'+i[0]+'</span>'}).join("")+'</div>'}
function niceMax(m){var p=Math.pow(10,Math.floor(Math.log10(m))),f=m/p,n=f<=1?1:f<=2?2:f<=5?5:10;return n*p}
function svgBars(cats,series,fmt,click){
  var W=420,H=176,L=34,R=6,T=16,B=30,iw=W-L-R,ih=H-T-B,mx=0;
  series.forEach(function(s){s.vals.forEach(function(v){if(v>mx)mx=v})});
  var top=niceMax(mx||1),gw=iw/cats.length,bw=Math.min(26,gw*0.7/series.length),o='<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img">';
  for(var i=0;i<=4;i++){var y=T+ih-ih*i/4;o+='<line x1="'+L+'" x2="'+(W-R)+'" y1="'+y+'" y2="'+y+'" stroke="#E5E7EB"/><text x="'+(L-5)+'" y="'+(y+3)+'" font-size="9" fill="#6B7280" text-anchor="end">'+fmt(top*i/4)+'</text>'}
  cats.forEach(function(c,ci){
    var gx=L+gw*ci,tw=bw*series.length,x0=gx+(gw-tw)/2;
    if(click)o+='<rect class="hit" data-cg="'+esc(c.k)+'" x="'+gx+'" y="'+T+'" width="'+gw+'" height="'+ih+'" fill="transparent"/>';
    series.forEach(function(s,si){var v=s.vals[ci],h=v/top*ih,x=x0+si*bw;
      o+='<rect x="'+x+'" y="'+(T+ih-h)+'" width="'+(bw-2)+'" height="'+h+'" rx="3" fill="'+s.color+'"'+(click?' data-cg="'+esc(c.k)+'"':'')+'/><text x="'+(x+(bw-2)/2)+'" y="'+(T+ih-h-3)+'" font-size="9" fill="#102A43" text-anchor="middle" font-weight="700">'+fmt(v)+'</text>'});
    o+='<text x="'+(gx+gw/2)+'" y="'+(H-12)+'" font-size="10" fill="#4B5563" text-anchor="middle">'+esc(c.l)+'</text>'});
  return o+'</svg>';
}
function chartsTab(c){
  if(!c.pv)return '<div class="wi wp"><div class="wm">Click <b>Preview</b> to see the charts: budget fit, performance differentiation, position in band and scenario comparison.</div></div>';
  var p=c.pv,b0=c.before,b1=c.after,alloc=b1.budget,vr=viewRows().filter(function(e){var r=p.res[e.empId];return r&&r.st!=="off"&&r.st!=="skip"});
  var K0=ruleKeys(p)[0];function hn(e){return Number(e[K0])||0}function ha(e){var r=p.res[e.empId];return r&&r.st==="chg"?(Number(r.after[K0])||0):(Number(e[K0])||0)}
  var h='<div class="wi wp">';
  /* 1 Budget fit */
  var mx=Math.max(alloc,b0.used,b1.used)*1.04||1;
  function hb(l,v,col){return '<div class="hb"><span class="l">'+l+'</span><span class="t"><i style="width:'+(v/mx*100)+'%;background:'+col+'"></i></span><b>'+big(v)+' · '+(alloc?(v/alloc*100).toFixed(1):0)+'%</b></div>'}
  h+='<div class="wchrow"><span class="wch">1 · Budget Fit</span>'+cmpSelHtml("cmpSelChart")+'</div><div class="wm q">Can we afford this?</div>'+hb("Allocated",alloc,CCOL.alloc)+hb("Used Now",b0.used,CCOL.before)+hb("Used After",b1.used,b1.used>alloc?CCOL.warn:CCOL.after)
    +(b1.used>alloc?'<div class="wm" style="color:#B7791F">Over the allocation by '+big(b1.used-alloc)+' · warning only</div>':'<div class="wm">'+big(alloc-b1.used)+' left after this change.</div>');
  /* 2 Performance differentiation */
  var g={};vr.forEach(function(e){var k=groupKey(e,"rating"),o=g[k]||(g[k]={n:0,b:0,a:0,l:0});o.n++;o.l+=(cmpAmt(e))/e.basePay*100;o.b+=hn(e)/e.basePay*100;o.a+=ha(e)/e.basePay*100});
  var keys=Object.keys(g).sort(function(a,b){var x=a==="No Rating"?-1:+a,y=b==="No Rating"?-1:+b;return y-x});
  var avg=function(k,f){return g[k].n?g[k][f]/g[k].n:0},chLY=!!S.ly&&K0==="hikeAmt"&&EMP.some(function(e){return e.hikeLY!=null});
  h+='<div class="wg"></div><span class="wch">2 · Performance Differentiation</span><div class="wm q">Do top performers get meaningfully more? Click a bar to drill down.</div>'+lgd([["Before",CCOL.before],["After",CCOL.after]].concat(chLY?[[cmpLbl(),"#C4C9D1"]]:[]))
    +svgBars(keys.map(function(k){return {k:k,l:k==="No Rating"?"None":"Rating "+k}}),[{color:CCOL.before,vals:keys.map(function(k){return avg(k,"b")})},{color:CCOL.after,vals:keys.map(function(k){return avg(k,"a")})}].concat(chLY?[{color:"#C4C9D1",vals:keys.map(function(k){return avg(k,"l")})}]:[]),function(v){return v.toFixed(1)+"%"},true);
  if(g["5"]&&g["3"])h+='<div class="wm">Top rating gets <b>'+(avg("5","a")-avg("3","a")).toFixed(1)+' pp</b> more than rating 3 after this change (now '+(avg("5","b")-avg("3","b")).toFixed(1)+' pp). A flat gap means pay is not tied to performance.</div>';
  /* 4 Position in band */
  var bsum={},bn={};c.scope.forEach(function(e){bsum[e.band]=(bsum[e.band]||0)+e.basePay+e.hikeAmt;bn[e.band]=(bn[e.band]||0)+1});
  var edges=[0.85,0.95,1.05,1.15],lab=["< 0.85","0.85–0.95","0.95–1.05","1.05–1.15","> 1.15"],c0=[0,0,0,0,0],c1=[0,0,0,0,0];
  function bin(v){var i=0;while(i<edges.length&&v>=edges[i])i++;return i}
  vr.forEach(function(e){var m=bsum[e.band]/bn[e.band];if(!m)return;c0[bin((e.basePay+hn(e))/m)]++;c1[bin((e.basePay+ha(e))/m)]++});
  h+='<div class="wg"></div><span class="wch">3 · Position in Band</span><div class="wm q">Where do people sit against their band midpoint, before and after? (Demo uses the band average; Band Master midpoint when connected.)</div>'+lgd([["Before",CCOL.before],["After",CCOL.after]])
    +svgBars(lab.map(function(l){return {k:l,l:l}}),[{color:CCOL.before,vals:c0},{color:CCOL.after,vals:c1}],function(v){return String(Math.round(v))},false)
    +'<div class="wm">Above 1.15 of the band midpoint: <b>'+c0[4]+'</b> → <b>'+c1[4]+'</b> people · below 0.85: <b>'+c0[0]+'</b> → <b>'+c1[0]+'</b>.</div>';
  /* 5 Target PB vs PB paid (outside the budget) */
  var pbp=0;c.scope.forEach(function(e){pbp+=Number(e.pbPaid)||0});
  var mt=Math.max(b0.tpb,b1.tpb,pbp)*1.04||1;
  function hb2(l,v,col){return '<div class="hb"><span class="l" style="width:110px">'+l+'</span><span class="t"><i style="width:'+(v/mt*100)+'%;background:'+col+'"></i></span><b>'+big(v)+'</b></div>'}
  h+='<div class="wg"></div><span class="wch">4 · Target PB vs PB Paid</span><div class="wm q">Outside the budget: how far is the Target PB from what has been paid?</div>'+hb2("PB Paid",pbp,CCOL.alloc)+hb2("Target PB Now",b0.tpb,CCOL.before)+hb2("Target PB After",b1.tpb,CCOL.after)
    +'<div class="wm">Gap (Target PB Less PB Paid): <b>'+big(b0.tpb-pbp)+'</b> → <b>'+big(b1.tpb-pbp)+'</b></div>';
  /* 8 Scenario comparison */
  var rows=[{n:"This Preview",u:b1.util,avg:(function(){var bs=0;c.scope.forEach(function(e){bs+=e.basePay});return bs?p.hike.after/bs*100:null})(),r:p.n.chg,cur:1}].concat(S.scenarios.map(function(x){return {n:x.name,u:x.util,avg:x.avg==null?null:x.avg,r:x.rows}}));
  var mu=Math.max.apply(null,rows.map(function(x){return x.u}).concat([100]))*1.04;
  h+='<div class="wg"></div><span class="wch">5 · Scenario Comparison</span><div class="wm q">Budget utilised and average hike % for this preview against your saved scenarios.</div>'
    +rows.map(function(x){return '<div class="hb"><span class="l" title="'+esc(x.n)+'" style="width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">'+esc(x.n)+'</span><span class="t"><i style="width:'+(x.u/mu*100)+'%;background:'+(x.cur?CCOL.after:CCOL.before)+'"></i></span><b>'+x.u.toFixed(1)+'% · avg hike '+(x.avg==null?'—':x.avg.toFixed(1)+'%')+' · '+x.r+' rows</b></div>'}).join("")
    +(S.scenarios.length?'':'<div class="wm">No saved scenarios yet. Use the settings icon › Save as Scenario to keep this one and compare options here.</div>');
  return h+'</div>';
}
function setPT(t){PT=t;try{localStorage.setItem(PT_KEY,t)}catch(x){}[].forEach.call($("mpTabs").children,function(b){b.classList.toggle("on",b.getAttribute("data-t")===t)});renderImpact()}
$("imp").addEventListener("click",function(ev){var g=ev.target.closest&&ev.target.closest("[data-cg]");if(!g)return;GB="rating";S.wiDr=g.getAttribute("data-cg");setPT("budget")});
function downloadList(){
  if(!S.pv)return;
  var head=["Emp ID","Employee Name","Designation","Band","Manager Rating","Base Pay","Status"];
  S.rules.forEach(function(r){var L=FIELDS[r.field].label;head.push("Current · "+L,"Proposed · "+L)});
  head.push("Note");
  var aoa=[head],ST={chg:"Will Change",skip:"Skipped · Edited Manually",off:"Left Out · Unticked",same:"No Change",norating:"No Change"};
  viewRows().forEach(function(e){
    var p=S.pv.res[e.empId],chg=p&&p.st==="chg",af=chg?p.after:e;
    var row=[e.empId,e.name,e.designation,e.band,e.rating==null?"":e.rating,e.basePay,p?ST[p.st]:""];
    S.rules.forEach(function(r){var F=FIELDS[r.field];
      if(F.kind==="txt")row.push(e[F.key],chg?af[F.key]:"");
      else row.push(Number(fieldNum(r,e,e).toFixed(2)),chg?Number(fieldNum(r,e,af).toFixed(2)):"")});
    var note="";if(p)(p.notes||[]).forEach(function(x){note+=(note?"; ":"")+x.m});
    row.push(note);aoa.push(row);
  });
  function q(v){v=v==null?"":String(v);return /[",\r\n]/.test(v)?'"'+v.replace(/"/g,'""')+'"':v}
  var csv="\ufeff"+aoa.map(function(r){return r.map(q).join(",")}).join("\r\n");
  var a=document.createElement("a");a.href=URL.createObjectURL(new Blob([csv],{type:"text/csv;charset=utf-8"}));
  a.download="bulk_list_"+new Date().toISOString().slice(0,10)+".csv";document.body.appendChild(a);a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500);
}
/* ---------------- What-if page: replaces the grid after Preview (summary only, no row-by-row) ---------------- */
S.view="wi";S.wiEx="";S.wiDr="";   // drill-downs are closed until the user asks
function wiDelta(d,fmt){if(Math.abs(d)<0.005)return '';return d>0?'<span class="up">▲ '+fmt(d)+'</span>':'<span class="dn">▼ '+fmt(-d)+'</span>'}
function pp(x){return x.toFixed(1)+' pp'}
var KLBL={hikeAmt:"Hike",newPB:"PB",newRB:"RB",tpbNext:"Target PB"};
function ruleKeys(p){var o=[];(p.rules||[]).forEach(function(r){var k=FIELDS[r.field]&&FIELDS[r.field].key;if(k&&o.indexOf(k)<0)o.push(k)});return o.length?o:["hikeAmt"]}
function wiHtml(){
  if(!S.pv){var b0=budgetOf(scope(),null);
    return '<div class="wi wp"><div class="wm" style="margin:0 0 10px">Click <b>Preview</b> to see Before and After here: total Hike, budget, the split by group and the people who need attention. Nothing is saved until Apply.</div>'
      +'<div class="wchrow"><span class="wch">Now</span>'+cmpSelHtml("cmpSelWi")+'</div><table class="wt"><tbody><tr><td>Budget Utilised</td><td>'+b0.util.toFixed(1)+'%</td></tr><tr><td>Budget Used</td><td>'+big(b0.used)+'</td></tr><tr><td>Budget</td><td>'+big(b0.budget)+'</td></tr></tbody></table></div>'}
  var p=S.pv,n=p.n,b0=p.before,b1=p.after,sc=scope(),left=b1.left,base=0,vr=viewRows();
  sc.forEach(function(e){base+=e.basePay});
  var pbp=0;sc.forEach(function(e){pbp+=Number(e.pbPaid)||0});
  var RK=ruleKeys(p),K0=RK[0],L0=KLBL[K0]||K0;
  var LYON=!!S.ly&&EMP.some(function(e){return e.hikeLY!=null}),lyT=0;sc.forEach(function(e){lyT+=cmpAmt(e)});var lyA=base?lyT/base*100:0;
  function wth(){return '<thead><tr><th></th><th>Before</th><th>After</th><th>Change</th>'+(LYON?'<th>'+cmpLbl()+'</th>':'')+'</tr></thead>'}
  function row(l,x,y,d,ly){return '<tr><td>'+l+'</td><td>'+x+'</td><td>'+y+'</td><td>'+(d||'')+'</td>'+(LYON?'<td>'+(ly==null?'—':ly)+'</td>':'')+'</tr>'}
  var t='<div class="wc"><div><div class="wchrow"><span class="wch">Before vs After</span>'+cmpSelHtml("cmpSelWi")+'</div><table class="wt'+'">'+wth()+'<tbody>'
    +row('People Affected','—',n.chg,'<span style="color:#6B7280">of '+vr.length+' in view</span>')
    +RK.map(function(k){var t0=0,t1=0;sc.forEach(function(e){var r=p.res[e.empId],x=Number(e[k])||0;t0+=x;t1+=r&&r.st==="chg"?(Number(r.after[k])||0):x});
      var q0=base?t0/base*100:0,q1=base?t1/base*100:0,L=KLBL[k]||k,h=k==="hikeAmt";
      return row('Total '+L,big(t0),big(t1),wiDelta(t1-t0,big),h?big(lyT):null)+row('Average '+L+' % of base pay',q0.toFixed(1)+'%',q1.toFixed(1)+'%',wiDelta(q1-q0,pp),h?lyA.toFixed(1)+'%':null)}).join("")
    +row('Budget Used',big(b0.used),big(b1.used),wiDelta(b1.used-b0.used,big))
    +row('Budget Utilised',b0.util.toFixed(1)+'%',b1.util.toFixed(1)+'%',wiDelta(b1.util-b0.util,pp))
    +row('Budget '+(b0.left>=0?'left':'over'),big(Math.abs(b0.left)),(left>=0?'':'over ')+big(Math.abs(left)),'')
    +'</tbody></table>'
    +'<div style="height:12px"></div><span class="wch">Outside the Budget · Target PB vs PB Paid</span><table class="wt">'+wth()+'<tbody>'
    +row('Target PB',big(b0.tpb),big(b1.tpb),wiDelta(b1.tpb-b0.tpb,big))
    +row('PB Paid',big(pbp),big(pbp),'')
    +'</tbody></table>'
    +'<div class="wm">'+n.skip+' skipped (edited manually) · '+n.off+' left out (unticked) · '+n.same+' already at these values</div>'
    +(left>=0?'<div class="callout ok"><b>Within Budget</b><br>'+big(left)+' left of '+big(b1.budget)+' after this change.</div>'
      :'<div class="callout warn"><b>Over Budget</b><br>This change takes the budget '+big(-left)+' over. Warning only — you can still apply.</div>')
    +'</div>';
  /* by group */
  var opts=groupOpts();if(!opts.some(function(o){return o.id===GB}))GB="rating";
  var g={};
  vr.forEach(function(e){var r=p.res[e.empId];if(!r||r.st!=="chg")return;var k=groupKey(e,GB),o=g[k]||(g[k]={n:0,h0:0,h1:0,b:0,ly:0});o.n++;o.ly+=cmpAmt(e);o.h0+=Number(e[K0])||0;o.h1+=Number(r.after[K0])||0;o.b+=e.basePay});
  var keys=Object.keys(g);
  keys.sort(function(a,b){if(GB==="rating"){var x=a==="No Rating"?-1:+a,y=b==="No Rating"?-1:+b;return y-x}return a<b?-1:a>b?1:0});
  t+='<div><span class="wch">By Group</span><div class="wgb"><label for="wiGb">Group by</label><select id="wiGb">'+opts.map(function(o){return '<option value="'+esc(o.id)+'"'+(o.id===GB?' selected':'')+'>'+esc(o.label)+'</option>'}).join("")+'</select></div>'
    +(keys.length?'<table class="wt"><thead><tr><th>Group</th><th>People</th><th>'+L0+' before</th><th>'+L0+' after</th><th>Avg '+L0+' %</th>'+(LYON&&K0==='hikeAmt'?'<th>'+cmpLbl()+' %</th>':'')+'</tr></thead><tbody>'
      +keys.map(function(k){var o=g[k];return '<tr class="gdr'+(S.wiDr===k?' on':'')+'" data-g="'+esc(k)+'" title="Click to see the people in this group"><td>'+esc(k)+'</td><td>'+o.n+'</td><td>'+big(o.h0)+'</td><td>'+big(o.h1)+'</td><td>'+(o.b?(o.h1/o.b*100).toFixed(1):'0.0')+'%</td>'+(LYON&&K0==='hikeAmt'?'<td>'+(o.b?(o.ly/o.b*100).toFixed(1):'0.0')+'%</td>':'')+'</tr>'}).join("")+'</tbody></table>'
      :'<div class="wm">No rows change in this preview.</div>')
    +'<div class="wm">Only the rows that change are counted. Click a group to see its people.</div>'
    +(S.wiDr&&g[S.wiDr]?(function(){
      var rows=vr.filter(function(e){var r=p.res[e.empId];return r&&r.st==="chg"&&groupKey(e,GB)===S.wiDr}),cap=rows.slice(0,50);
      return '<div style="margin-top:12px"><span class="wch">'+esc(S.wiDr)+' · '+rows.length+' people</span> <button class="btn lnk" type="button" data-gx="1">Close</button>'
        +cap.map(function(e){var r=p.res[e.empId],b=e[K0]/e.basePay*100,a=r.after[K0]/e.basePay*100;
          return '<div class="ex"><div class="n"><b>'+esc(e.empId)+' - '+esc(e.name)+'</b><i>'+esc(e.designation)+' · '+esc(e.band)+'</i></div><div>'+b.toFixed(2)+'% → <b>'+a.toFixed(2)+'%</b></div><span class="tag t-info">▲ '+big(r.after[K0]-e[K0])+'</span></div>'}).join("")
        +(rows.length>cap.length?'<div class="wm">Showing '+cap.length+' of '+rows.length+' · the rest is in the list below.</div>':'')+'</div>'})():'')
    +'</div></div>';
  t+='<div class="wg"></div><div class="wm">Before and after for every employee: <button class="btn lnk" id="bDlList2" type="button">Download List</button></div>';
  return '<div class="wi wp">'+t+'</div>';
}
function budgetTab(c){return wiHtml()}
$("imp").addEventListener("click",function(ev){
  if(ev.target.closest("#bDlList2")){downloadList();return}
  var b=ev.target.closest("[data-ex]");if(b){var k2=b.getAttribute("data-ex");S.wiEx=S.wiEx===k2?"":k2;renderImpact();return}
  if(ev.target.closest("[data-gx]")){S.wiDr="";renderImpact();return}
  var gr=ev.target.closest("tr[data-g]");if(gr){var gk=gr.getAttribute("data-g");S.wiDr=S.wiDr===gk?"":gk;renderImpact()}
});
$("imp").addEventListener("change",function(ev){if(ev.target.id==="wiGb"){GB=ev.target.value;S.wiDr="";try{localStorage.setItem(GB_KEY,GB)}catch(x){}renderImpact()}});
function checksTab(c){
  if(!c.pv)return '<div class="empty">Click Preview to run the checks.</div>';
  var n=c.pv.n,noR=viewRows().filter(function(e){return e.rating==null}).length,b1=c.after,left=b1.left;
  function row(key,cls,t,v){return '<div class="ck"><span class="tag t-'+cls+'">'+v+'</span><span>'+t+'</span></div>'}
  var h='<div class="cks">'+row("chg","info","Rows Will Change",n.chg)
    +row("skip","grey","Skipped · Edited Manually",n.skip)
    +row("off","grey","Left Out · Unticked",n.off)
    +row("same","grey","No Change",n.same)
    +row("range",n.range?"warn":"ok","Out of Band Range",n.range)
    +row("norating",noR?"warn":"ok","Without a Manager Rating",noR)+'</div>';
  h+=left>=0?'<div class="callout ok"><b>Within Budget</b><br>'+big(left)+' left after this change.</div>'
            :'<div class="callout warn"><b>Over Budget</b><br>This change takes the budget '+big(-left)+' over. Warning only — you can still apply.</div>';
  h+='<div style="margin-top:12px"><button class="btn lnk" id="bDlList" type="button">Download List</button> <span class="mini">Every employee with status, current and proposed values, and notes (CSV).</span></div>';
  return h;
}
$("mpTabs").addEventListener("click",function(ev){var t=ev.target.getAttribute&&ev.target.getAttribute("data-t");if(!t)return;PT=t;try{localStorage.setItem(PT_KEY,t)}catch(x){}
  [].forEach.call($("mpTabs").children,function(b){b.classList.toggle("on",b.getAttribute("data-t")===t)});renderImpact()});
$("imp").addEventListener("click",function(ev){
  if(ev.target.closest&&ev.target.closest("#bDlList")){downloadList();return}
  var rb=ev.target.closest&&ev.target.closest("[data-restore]");
  if(rb){var id=rb.getAttribute("data-restore");
    if(restoreAt.id===id&&Date.now()-restoreAt.t<6000){restoreAt={id:"",t:0};doRestore(id)}
    else{restoreAt={id:id,t:Date.now()};renderImpact();setTimeout(function(){if(restoreAt.id===id&&Date.now()-restoreAt.t>=6000){restoreAt={id:"",t:0};renderImpact()}},6100)}
    return}
var r=ev.target.closest&&ev.target.closest(".ck[data-ck]");if(!r)return;var k=r.getAttribute("data-ck");S.checkF=S.checkF===k?"":k;S.page=1;renderGrid();renderImpact()});
$("imp").addEventListener("change",function(ev){if(ev.target.id==="tpbSel"){S.incTpb=ev.target.value==="1";try{localStorage.setItem(TPB_KEY,S.incTpb?"1":"0")}catch(x){}if(S.pv)refreshPreview();else render();return}
  if(ev.target.id==="gbSel"){GB=ev.target.value;S.wiDr="";try{localStorage.setItem(GB_KEY,GB)}catch(x){}renderImpact()}});
[].forEach.call($("mpTabs").children,function(b){b.classList.toggle("on",b.getAttribute("data-t")===PT)});

/* ---------------- Pivot (v41): slice by any field, before / after / change, hike % and amount, Excel-style statistics ----------------
   Rows = any field HR allows (two levels). Values = one measure. Statistics = Count, Sum, Average, Median, Min, Max, Std dev, Variance,
   P10/P25/P75/P90, % of total. "Set hike %" on any row writes a hike % for that group; it goes through Preview, Apply, progress and Restore. */
var PV_R={yoe:[[0,2],[2,5],[5,10],[10,null]],rrPct:[[0,60],[60,75],[75,90],[90,100],[100,null]],grossMargin:[[0,20],[20,30],[30,40],[40,50],[50,null]]};
var PV_F=[{id:"rating",label:"Manager Rating"},{id:"clientRating",label:"Client Rating"},{id:"band",label:"Band"},{id:"designation",label:"Designation"},
  {id:"skillType",label:"Skill Type"},{id:"costCenter",label:"Cost Centre"},{id:"superManager",label:"Tech ED",hr:1},{id:"compManager",label:"Comp Manager"},
  {id:"source",label:"Source"},{id:"promo",label:"Promotion"},{id:"yoe",label:"YOE"},{id:"rrPct",label:"RR %"},{id:"grossMargin",label:"Gross Margin %"}];
var PV_M=[{id:"hike",label:"Hike (% and Amount)"},{id:"newBase",label:"New Base Pay"},{id:"newPB",label:"Performance Bonus (PB)"},{id:"newRB",label:"Retention Bonus (RB)"},
  {id:"tpbNext",label:"Target PB for Next Year"},{id:"total",label:"Total Reward (Hike + PB + RB)"},{id:"basePay",label:"Base Pay"}];
var PV_S=[{id:"count",label:"Count"},{id:"sum",label:"Sum"},{id:"avg",label:"Average"},{id:"median",label:"Median"},{id:"min",label:"Min"},{id:"max",label:"Max"},
  {id:"sd",label:"Std Dev"},{id:"p25",label:"P25"},{id:"p75",label:"P75"}];
var PV_PRESETS={
  rating:{label:"Rating",r1:"rating",r2:"",m:"hike",st:["count","avg","median","sd","p25","p75"]},
  contribution:{label:"Contribution",r1:"rrPct",r2:"grossMargin",m:"hike",st:["count","avg","median","sd"]},
  experience:{label:"Experience",r1:"yoe",r2:"",m:"hike",st:["count","avg","median","min","max"]},
  reward:{label:"Reward",r1:"rating",r2:"",m:"total",st:["count","sum","avg"]}};
var PVT_KEY="bulkPivot_v1",LY_KEY="bulkCompareLY_v2";S.ly=false;S.cm="ly";try{var _c=localStorage.getItem(LY_KEY);if(_c&&_c!=="off"){S.ly=true;S.cm=_c}}catch(x){}
var CMP_OPT=[["off","Off"],["ly","Last Year"],["y2","2 years ago"],["y3","3 years ago"],["avg2","Average of Last 2 Years"],["avg3","Average of Last 3 Years"]];
function cmpAmt(e,nl){var a=e.hikeLY,b=e.hikeLY2,c=e.hikeLY3,v;
  switch(S.cm){case "y2":v=b;break;case "y3":v=c;break;case "avg2":v=(a==null||b==null)?null:(a+b)/2;break;case "avg3":v=(a==null||b==null||c==null)?null:(a+b+c)/3;break;default:v=a}
  return v==null?(nl?null:0):Number(v)}
function cmpLbl(){return {ly:"Last Year",y2:"2 years ago",y3:"3 years ago",avg2:"Avg of Last 2 Yrs",avg3:"Avg of Last 3 Yrs"}[S.cm]||"Last Year"}
function cmpLow(){return cmpLbl().toLowerCase().replace("avg","average")}
function cmpShort(){return {ly:"last yr",y2:"2 yrs ago",y3:"3 yrs ago",avg2:"avg 2 yrs",avg3:"avg 3 yrs"}[S.cm]||"last yr"}
function cmpSelHtml(id){return '<label class="cmpw">Compare to <select id="'+id+'" class="cmpsel">'+CMP_OPT.map(function(o){return '<option value="'+o[0]+'"'+((S.ly?S.cm:"off")===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join("")+'</select></label>'}
onDoc("change",function(ev){var t=ev.target;if(!t||!t.classList||!t.classList.contains("cmpsel"))return;
  var v=t.value;S.ly=v!=="off";if(S.ly)S.cm=v;try{localStorage.setItem(LY_KEY,v)}catch(x){}renderImpact()});
var PVT={open:0,r1:"rating",r2:"",m:"hike",st:["count","avg","median","sd"],show:{b:1,a:1,c:1,l:0,d:0},disp:"both",sort:"order",preset:"rating"};
try{var _pv=JSON.parse(localStorage.getItem(PVT_KEY)||"null");if(_pv&&_pv.r1)PVT=Object.assign(PVT,_pv)}catch(x){}
function pvSave(){try{localStorage.setItem(PVT_KEY,JSON.stringify(PVT))}catch(x){}}
var PVR=[];
function pvFieldList(){return PV_F.filter(function(f){var d=FDEFS.filter(function(x){return x.field===f.id})[0];return !(f.id==="superManager"&&hiddenForRole({field:"superManager"}))&&!(f.id==="compManager"&&hiddenForRole({field:"compManager"}))})}
var PV_MOF={hikeAmt:"hike",newPB:"newPB",newRB:"newRB",tpbNext:"tpbNext"};
function pvAuto(){if(!S.pv)return;var m=PV_MOF[ruleKeys(S.pv)[0]]||"hike";if(PVT.m!==m){PVT.m=m;PVT.preset="";pvSave()}}
function pvKey(e,f){
  if(f==="rating"){var b=bucket(e);return b==null?["No Rating",1e9]:[String(b),-b]}
  if(f==="clientRating"){var c=e.clientRating==null?null:Math.min(5,Math.max(1,Math.round(e.clientRating)));return c==null?["No Rating",1e9]:[String(c),-c]}
  if(PV_R[f]){var v=e[f];if(v==null||v==="")return["No Data",1e9];var rs=PV_R[f];for(var i=0;i<rs.length;i++)if(rangeHit(v,rs[i]))return[rangeLabel(rs[i]),i];return["No Data",1e9]}
  var x=e[f];return x==null||x===""?["—","￿"]:[String(x),String(x)];
}
function pvCmp(a,b){return typeof a==="number"&&typeof b==="number"?a-b:String(a).localeCompare(String(b),undefined,{numeric:true})}
function pvSeries(e,af,m){
  var bs=e.basePay;
  switch(m){
    case "hike":var ly=cmpAmt(e,1);return [{u:"pct",b:e.hikeAmt/bs*100,a:af.hikeAmt/bs*100,l:ly==null?null:ly/bs*100},{u:"amt",b:e.hikeAmt,a:af.hikeAmt,l:ly}];
    case "newBase":return [{u:"amt",b:bs+e.hikeAmt,a:bs+af.hikeAmt}];
    case "newPB":return [{u:"amt",b:e.newPB,a:af.newPB}];
    case "newRB":return [{u:"amt",b:e.newRB,a:af.newRB}];
    case "tpbNext":return [{u:"amt",b:e.tpbNext,a:af.tpbNext}];
    case "total":return [{u:"amt",b:e.hikeAmt+e.newPB+e.newRB,a:af.hikeAmt+af.newPB+af.newRB}];
    default:return [{u:"amt",b:bs,a:bs}];
  }
}
function pctile(a,p){if(!a.length)return null;var s=a.slice().sort(function(x,y){return x-y}),k=(s.length-1)*p,f=Math.floor(k),c=Math.ceil(k);return s[f]+(s[c]-s[f])*(k-f)}
function statOf(id,a,tot){
  var n=a.length;if(id==="count")return n;if(!n)return null;
  if((id==="p25"||id==="p75")&&n<5)return null;   // too few people for a percentile to mean anything
  var sum=0,i;for(i=0;i<n;i++)sum+=a[i];var mean=sum/n;
  switch(id){
    case "sum":return sum;case "avg":return mean;case "median":return pctile(a,.5);
    case "min":return Math.min.apply(null,a);case "max":return Math.max.apply(null,a);
    case "sd":case "var":{if(n<2)return 0;var q=0;for(i=0;i<n;i++)q+=(a[i]-mean)*(a[i]-mean);q/=(n-1);return id==="sd"?Math.sqrt(q):q}
    case "p10":return pctile(a,.1);case "p25":return pctile(a,.25);case "p75":return pctile(a,.75);case "p90":return pctile(a,.9);
    case "share":return tot?sum/tot*100:null;
  }return null;
}
function pvCmpAmt(v){return inr(Math.round(v))}
function pvFmt(u,st,v){
  if(v==null||isNaN(v))return "—";
  if(st==="count")return inr(v);if(st==="share")return v.toFixed(1)+"%";
  if(st==="var")return u==="pct"?v.toFixed(2):v.toExponential(2);
  return u==="pct"?v.toFixed(2)+"%":pvCmpAmt(v);
}
function pvFmtD(u,st,d){
  if(d==null||isNaN(d))return "—";
  if(st==="count")return "";
  var z=Math.abs(d)<(u==="pct"||st==="share"?0.005:0.5),sg=z?"":d>0?"+":"−",a=Math.abs(d);
  if(st==="share")return sg+a.toFixed(1)+" pp";
  if(st==="var")return sg+(u==="pct"?a.toFixed(2):a.toExponential(2));
  return u==="pct"?sg+a.toFixed(2)+" pp":sg+pvCmpAmt(a);
}
function pvNewG(label,ord,ns){var g={label:label,ord:ord,ids:[],b:[],a:[],l:[],kids:{}};for(var i=0;i<ns;i++){g.b.push([]);g.a.push([]);g.l.push([])}return g}
function pvAdd(g,e,ser){g.ids.push(e.empId);ser.forEach(function(s,i){g.b[i].push(s.b);g.a[i].push(s.a);if(s.l!=null)g.l[i].push(s.l)})}
function pvMerge(list,label){
  var ns=list[0].b.length,g=pvNewG(label,1e9,ns);
  list.forEach(function(x){x.ids.forEach(function(id){g.ids.push(id)});for(var i=0;i<ns;i++){x.b[i].forEach(function(v){g.b[i].push(v)});x.a[i].forEach(function(v){g.a[i].push(v)});x.l[i].forEach(function(v){g.l[i].push(v)})}});
  return g;
}
var PV_CELLS=300;
function pvBuild(){
  var rows=viewRows(),m=PVT.m,units=null,all,l1={};
  var grand=null;
  rows.forEach(function(e){
    var ser=pvSeries(e,afterOf(e),m);if(!units){units=ser.map(function(s){return s.u});grand=pvNewG("Grand Total",0,ser.length)}
    pvAdd(grand,e,ser);
    var k1=pvKey(e,PVT.r1),g1=l1[k1[0]]||(l1[k1[0]]=pvNewG(k1[0],k1[1],ser.length));pvAdd(g1,e,ser);
    if(PVT.r2&&PVT.r2!==PVT.r1){var k2=pvKey(e,PVT.r2),g2=g1.kids[k2[0]]||(g1.kids[k2[0]]=pvNewG(k2[0],k2[1],ser.length));pvAdd(g2,e,ser)}
  });
  if(!grand)return {units:[],rows:[],grand:null};
  function srt(list){
    var f=PVT.sort;
    return list.sort(function(x,y){
      if(f==="count")return y.ids.length-x.ids.length;
      var ax=statOf("avg",x.a[0],0)||0,ay=statOf("avg",y.a[0],0)||0,bx=statOf("avg",x.b[0],0)||0,by=statOf("avg",y.b[0],0)||0;
      if(f==="avg")return ay-ax;if(f==="chg")return (ay-by)-(ax-bx);
      return pvCmp(x.ord,y.ord)});
  }
  var out=[],capped=false,R=Math.max(8,Math.floor(PV_CELLS/Math.max(1,pvCols().length)));
  var L1=srt(Object.keys(l1).map(function(k){return l1[k]}));
  if(L1.length>R){capped=true;var oth=pvMerge(L1.slice(R-1),"Others ("+(L1.length-R+1)+" more)");L1=L1.slice(0,R-1).concat([oth])}
  var kc=Math.max(6,Math.floor((R-L1.length)/Math.max(1,L1.length)));
  L1.forEach(function(g){
    out.push({lvl:1,g:g});
    var K=srt(Object.keys(g.kids).map(function(k){return g.kids[k]}));
    if(K.length>kc){capped=true;var o2=pvMerge(K.slice(kc-1),"Others ("+(K.length-kc+1)+" more)");K=K.slice(0,kc-1).concat([o2])}
    K.forEach(function(c){out.push({lvl:2,g:c})});
  });
  out.push({lvl:0,g:grand});
  return {units:units,rows:out,grand:grand,capped:capped};
}
function pvOvOf(g){var v=null,mixed=false;g.ids.forEach(function(id){var o=S.ov[id];if(v===null)v=o==null?"":o;else if((o==null?"":o)!==v)mixed=true});return mixed?"mixed":(v==null?"":v)}
function pvLY(){return PVT.m==="hike"&&EMP.some(function(e){return e.hikeLY!=null})}
function pvCols(){
  var cols=[];
  PV_S.forEach(function(st){
    if(PVT.st.indexOf(st.id)<0)return;
    if(st.id==="count"){cols.push({st:st.id,w:"n"});return}
    if(PVT.show.b)cols.push({st:st.id,w:"b"});if(PVT.show.a)cols.push({st:st.id,w:"a"});if(PVT.show.c)cols.push({st:st.id,w:"c"});
    if(pvLY()&&S.ly){cols.push({st:st.id,w:"l"});cols.push({st:st.id,w:"d"})}
  });
  return cols;
}
function pvCell(P,g,col){
  var out=[],st=col.st;
  P.units.forEach(function(u,i){
    if(P.units.length>1&&PVT.disp!=="both"&&PVT.disp!==u)return;
    if((st==="count"||false)&&i>0)return;
    var tb=P.grand.b[i],ta=P.grand.a[i],sum=function(a){var t=0;a.forEach(function(x){t+=x});return t};
    var vb=statOf(st,g.b[i],sum(tb)),va=statOf(st,g.a[i],sum(ta)),vl=g.l[i].length?statOf(st,g.l[i],sum(P.grand.l[i])):null,t;
    if(col.w==="l")t=pvFmt(u,st,vl);else if(col.w==="d")t=pvFmtD(u,st,(va==null||vl==null)?null:va-vl);else if(col.w==="n")t=pvFmt(u,st,va);else if(col.w==="b")t=pvFmt(u,st,vb);else if(col.w==="a")t=pvFmt(u,st,va);else t=pvFmtD(u,st,(va==null||vb==null)?null:va-vb);
    var cd=col.w==="c"||col.w==="d",cls=cd&&t&&t.charAt(0)==="−"?' class="pvn"':cd&&t&&t.charAt(0)==="+"?' class="pvp"':'';
    out.push(out.length?'<small'+cls+'>'+t+'</small>':'<span'+cls+'>'+t+'</span>');
  });
  return out.join("");
}
function pvTable(P){
  var cols=pvCols(),h='<div class="pvw"><table class="wt pvtb"><thead>';
  var ml=(PV_F.filter(function(f){return f.id===PVT.r1})[0]||{}).label;
  var gh=[],cur=null;
  cols.forEach(function(c){if(cur&&cur.st===c.st)cur.n++;else{cur={st:c.st,n:1};gh.push(cur)}});
  h+='<tr><th rowspan="2" class="pvf">'+esc(ml||"")+(PVT.r2?' › '+esc((PV_F.filter(function(f){return f.id===PVT.r2})[0]||{}).label||""):'')+'</th>'
    +gh.map(function(c){return '<th colspan="'+c.n+'" class="pvg">'+esc(PV_S.filter(function(x){return x.id===c.st})[0].label)+'</th>'}).join("")+'</tr><tr>'
    +cols.map(function(c){return '<th>'+(c.w==="n"?'&nbsp;':c.w==="b"?'Before':c.w==="a"?'After':c.w==="l"?cmpLbl():c.w==="d"?'vs '+cmpShort():'Change')+'</th>'}).join("")+'</tr></thead><tbody>';
  PVR=[];var gav=statOf("avg",P.grand.a[0],0),thr=P.units[0]==="pct"?1.5:Math.abs(gav)*0.25,nfl=0;
  P.rows.forEach(function(r){
    var i=PVR.push(r)-1,dot='';
    if(r.lvl&&r.g.ids.length>=2){var dv=statOf("avg",r.g.a[0],0)-gav;if(Math.abs(dv)>=thr){nfl++;dot=' <b class="pvdot" title="Average after is '+(P.units[0]==="pct"?Math.abs(dv).toFixed(2)+' pp':pvCmpAmt(Math.abs(dv)))+(dv>0?' above':' below')+' the overall average">●</b>'}}
    h+='<tr class="pvr'+r.lvl+'"><td>'+(r.lvl===2?'<span class="pvi"></span>':'')+esc(r.g.label)+'<i>'+r.g.ids.length+'</i>'+dot+'</td>'
      +cols.map(function(c){return '<td>'+pvCell(P,r.g,c)+'</td>'}).join("")
      +'</tr>';
  });
  return h+'</tbody></table></div>'+(P.capped?'<div class="wm">Showing the biggest groups; the rest are in <b>Others</b>. Narrow the people in <b>For Whom</b> to see them.</div>':'')+(P.capped?'':'')+(nfl?'<div class="wm"><b class="pvdot">●</b> '+nfl+' row'+(nfl===1?'':'s')+' where the average after is '+(P.units[0]==="pct"?'1.5 pp':'25%')+' or more away from the overall average. Hover the dot.</div>':'');
}
function pivotTab(c){
  var fl=pvFieldList();
  if(!fl.some(function(f){return f.id===PVT.r1}))PVT.r1=fl[0].id;
  if(PVT.r2&&!fl.some(function(f){return f.id===PVT.r2}))PVT.r2="";
  var P=pvBuild();
  function sel(id,list,cur,none){return '<select id="'+id+'">'+(none?'<option value="">— none —</option>':'')+list.map(function(f){return '<option value="'+f.id+'"'+(f.id===cur?' selected':'')+'>'+esc(f.label)+'</option>'}).join("")+'</select>'}
  var h='<div class="wi wp pvt"><div class="pvpre"><span>Start from</span>'+Object.keys(PV_PRESETS).map(function(k){return '<button type="button" data-pvpre="'+k+'" class="'+(PVT.preset===k?'on':'')+'">'+PV_PRESETS[k].label+'</button>'}).join("")
    +'<span class="pvmid">'+cmpSelHtml("cmpSelPv")+'</span><span class="pvsp"></span><button type="button" class="pvq" id="pvFld">Statistics '+(PVT.open?'▴':'▾')+'</button></div>'
    +'<div class="pvfl"><label>Rows'+sel("pvR1",fl,PVT.r1)+'</label><label>Then by'+sel("pvR2",fl.filter(function(f){return f.id!==PVT.r1}),PVT.r2,1)+'</label>'
    +'<label>Values'+sel("pvM",PV_M,PVT.m)+'</label>'
    +'<label>Sort'+'<select id="pvSort">'+[["order","Group Order"],["count","Count"],["avg","Average After"],["chg","Change in Average"]].map(function(o){return '<option value="'+o[0]+'"'+(PVT.sort===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join("")+'</select></label></div>'
    +(PVT.open?'<div class="pvdr"><div class="pvst"><span>Statistics</span>'+PV_S.map(function(s){return '<button type="button" data-pvst="'+s.id+'" class="'+(PVT.st.indexOf(s.id)>=0?'on':'')+'">'+s.label+'</button>'}).join("")+'</div>'
    +'<div class="pvst"><span>Show</span>'+[["b","Before"],["a","After"],["c","Change"]].map(function(o){return '<button type="button" data-pvsh="'+o[0]+'" class="'+(PVT.show[o[0]]?'on':'')+'">'+o[1]+'</button>'}).join("")
    +(PVT.m==="hike"?'<span class="pvsp"></span><span>Cell</span>'+[["both","% and amount"],["pct","% only"],["amt","Amount Only"]].map(function(o){return '<button type="button" data-pvdi="'+o[0]+'" class="'+(PVT.disp===o[0]?'on':'')+'">'+o[1]+'</button>'}).join(""):'')
+'</div></div>':'')+'';
  h+=P.grand?pvTable(P):'<div class="empty">No employees in view.</div>';
  h+='<div class="wm">'+(c.pv?'Before = current values, After = this preview. ':'Click Preview to see After. ')+'Filters in <b>For Whom</b> decide who is in the pivot. Percentiles show a dash for fewer than 5 people.</div></div>';
  return h;
}
function pvSetOv(i,val){
  var r=PVR[i];if(!r)return;
  r.g.ids.forEach(function(id){if(val==="")delete S.ov[id];else S.ov[id]=val});
  if(S.pv)refreshPreview();else doPreview();
  renderImpact();
}
function pvAoa(){
  var P=pvBuild(),cols=pvCols(),head=[(PV_F.filter(function(f){return f.id===PVT.r1})[0]||{}).label||"Row","Level","People"],aoa=[head];
  cols.forEach(function(c){P.units.forEach(function(u,i){
    if(P.units.length>1&&PVT.disp!=="both"&&PVT.disp!==u)return;
    head.push(PV_S.filter(function(x){return x.id===c.st})[0].label+(c.w==="n"?"":c.w==="b"?" · Before":c.w==="a"?" · After":c.w==="l"?" · "+cmpLbl():c.w==="d"?" · vs "+cmpLow():" · Change")+(P.units.length>1?(u==="pct"?" (%)":" (amount)"):""))})});
  P.rows.forEach(function(r){
    var row=[r.g.label,r.lvl===2?"Then by":r.lvl===0?"Total":"Rows",r.g.ids.length];
    cols.forEach(function(c){P.units.forEach(function(u,i){
      if(P.units.length>1&&PVT.disp!=="both"&&PVT.disp!==u)return;
      var sm=function(a){var t=0;a.forEach(function(x){t+=x});return t},vb=statOf(c.st,r.g.b[i],sm(P.grand.b[i])),va=statOf(c.st,r.g.a[i],sm(P.grand.a[i]));
      var vl=r.g.l[i].length?statOf(c.st,r.g.l[i],sm(P.grand.l[i])):null;row.push(c.w==="b"?vb:c.w==="c"?(va==null||vb==null?"":va-vb):c.w==="l"?vl:c.w==="d"?(va==null||vl==null?"":va-vl):va)})});
    aoa.push(row)});
  return aoa;
}
function pvCsvText(sep){return pvAoa().map(function(r){return r.map(function(x){var t=x==null?"":(typeof x==="number"?String(Math.round(x*10000)/10000):String(x));return sep===","&&/[",\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t}).join(sep)}).join("\n")}
$("mpTabs").addEventListener("click",function(ev){
  if(!ev.target.closest("#pvCsv"))return;
  var bl=new Blob(["\ufeff"+pvCsvText(",")],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(bl);a.download="Bulk_pivot.csv";document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500);
});
$("imp").addEventListener("click",function(ev){
  var t=ev.target.closest&&ev.target.closest("[data-pvpre],[data-pvst],[data-pvsh],[data-pvdi],#pvFld");if(!t)return;
  if(t.id==="pvFld"){PVT.open=PVT.open?0:1;pvSave();renderImpact();return}
  if(false){var bl=new Blob(["﻿"+pvCsvText(",")],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(bl);a.download="Bulk_pivot.csv";document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500);return}
  var k;
  if((k=t.getAttribute("data-pvpre"))){var pr=PV_PRESETS[k];PVT.preset=k;PVT.r1=pr.r1;PVT.r2=pr.r2;PVT.m=pr.m;PVT.st=pr.st.slice();PVT.show={b:1,a:1,c:1,l:0,d:0}}
  else if((k=t.getAttribute("data-pvst"))){var ix=PVT.st.indexOf(k);if(ix>=0){if(PVT.st.length>1)PVT.st.splice(ix,1)}else PVT.st.push(k);PVT.preset=""}
  else if((k=t.getAttribute("data-pvsh"))){PVT.show[k]=PVT.show[k]?0:1;if(!PVT.show.b&&!PVT.show.a&&!PVT.show.c&&!PVT.show.l&&!PVT.show.d)PVT.show[k]=1}
  else if((k=t.getAttribute("data-pvdi"))){PVT.disp=k}
  pvSave();renderImpact();
});
$("imp").addEventListener("change",function(ev){
  var t=ev.target,id=t.id;
  if(id==="pvR1"){PVT.r1=t.value;if(PVT.r2===PVT.r1)PVT.r2=""}else if(id==="pvR2")PVT.r2=t.value;else if(id==="pvM")PVT.m=t.value;else if(id==="pvSort")PVT.sort=t.value;else return;
  PVT.preset="";pvSave();renderImpact();
});


/* ---------------- Summary (v46): the answer first ---------------- */
var SM_COL={"5":"#2E7D5B","4":"#27548A","3":"#D99A2B","2":"#B42318","1":"#7C3AED"};
function smLinks(){return '<div class="sm-links">'+cmpSelHtml("cmpSelSum")+'</div>'}
function smYears(vr,p,K0){
  var yrs=["3 years ago","2 years ago","Last Year","This Year (Proposed)"],m=/([A-Za-z]{3})-(\d\d)/.exec(ACTIVE_CYCLE&&ACTIVE_CYCLE.name||"");
  if(m){var yy=Number(m[2]);yrs=[m[1]+"-"+(yy-3),m[1]+"-"+(yy-2),m[1]+"-"+(yy-1),m[1]+"-"+yy+" (proposed)"]}
  function pts(f){var n=0,a=[0,0,0,0];vr.forEach(function(e){if(!f(e))return;n++;var r=p.res[e.empId],af=r&&r.st==="chg"?r.after.hikeAmt:e.hikeAmt;
      a[0]+=(Number(e.hikeLY3)||0)/e.basePay*100;a[1]+=(Number(e.hikeLY2)||0)/e.basePay*100;a[2]+=(Number(e.hikeLY)||0)/e.basePay*100;a[3]+=af/e.basePay*100});
    return n?a.map(function(x){return x/n}):null}
  var lines=[{k:"all",l:"All",c:"#102A43",w:3,v:pts(function(){return true})}];
  ["5","4","3","2","1"].forEach(function(k){var v=pts(function(e){return groupKey(e,"rating")===k});if(v)lines.push({k:k,l:"Rating "+k,c:SM_COL[k],w:1.8,v:v})});
  var mx=0,mn=1e9;lines.forEach(function(L){L.v.forEach(function(x){if(x>mx)mx=x;if(x<mn)mn=x})});var lo=Math.max(0,Math.floor(mn-1)),top=Math.ceil(mx+1);if(top<=lo)top=lo+1;
  var W=560,H=196,L0=36,R0=18,T0=14,B0=30,iw=W-L0-R0,ih=H-T0-B0;
  function X(i){return L0+iw*i/3}function Y(v){return T0+ih-ih*(v-lo)/(top-lo)}
  var o='<svg viewBox="0 0 '+W+' '+H+'" width="100%" role="img" aria-label="Average hike over the years">';
  for(var i=0;i<=4;i++){var y=T0+ih-ih*i/4;o+='<line x1="'+L0+'" x2="'+(W-R0)+'" y1="'+y+'" y2="'+y+'" stroke="#E5E7EB"/><text x="'+(L0-6)+'" y="'+(y+3)+'" font-size="9" fill="#6B7280" text-anchor="end">'+(lo+(top-lo)*i/4).toFixed(1)+'%</text>'}
  yrs.forEach(function(t,i){o+='<text x="'+X(i)+'" y="'+(H-10)+'" font-size="10" fill="#4B5563" text-anchor="'+(i===3?'end':i===0?'start':'middle')+'">'+esc(t)+'</text>'});
  lines.forEach(function(Ln){
    var d1="M"+X(0)+" "+Y(Ln.v[0])+" L"+X(1)+" "+Y(Ln.v[1])+" L"+X(2)+" "+Y(Ln.v[2]);
    o+='<path d="'+d1+'" fill="none" stroke="'+Ln.c+'" stroke-width="'+Ln.w+'" stroke-linecap="round" stroke-linejoin="round"/>'
      +'<path d="M'+X(2)+' '+Y(Ln.v[2])+' L'+X(3)+' '+Y(Ln.v[3])+'" fill="none" stroke="'+Ln.c+'" stroke-width="'+Ln.w+'" stroke-dasharray="5 4" stroke-linecap="round"/>';
    Ln.v.forEach(function(v,i){o+='<circle cx="'+X(i)+'" cy="'+Y(v)+'" r="'+(i===3?4.5:2.6)+'" fill="'+(i===3?'#fff':Ln.c)+'" stroke="'+Ln.c+'" stroke-width="'+(i===3?2.2:1)+'"/>';
      if(Ln.k==="all")o+='<text x="'+X(i)+'" y="'+(Y(v)-9)+'" font-size="10" font-weight="800" fill="#102A43" text-anchor="'+(i===3?'end':'middle')+'">'+v.toFixed(1)+'%</text>'})});
  o+='</svg>';
  var lg='<div class="lg">'+lines.map(function(Ln){return '<span><i style="background:'+Ln.c+'"></i>'+Ln.l+'</span>'}).join("")+'</div>';
  return '<div class="sm-h">Average Hike % Over the Years</div><div class="wm" style="margin:0 0 4px">Dashed = this proposal. Demo history; the real figures come from the history table.</div>'+lg+o;
}
function tedTable(sc,p){
  if(SB)return [];   // with the server, each Tech ED budget comes from Budget Config
  var m={};sc.forEach(function(e){var k=e.superManager||"(none)";(m[k]=m[k]||[]).push(e)});
  return Object.keys(m).sort().map(function(k){var a=m[k],ov={},chg=0,skip=0;
    a.forEach(function(e){var r=p.res[e.empId];if(!r)return;if(r.st==="chg"){ov[e.empId]=r.after;chg++}else if(r.st==="skip"||r.st==="off")skip++});
    return {name:k,n:a.length,chg:chg,skip:skip,b0:budgetOf(a,null),b:budgetOf(a,ov)}});
}
function sumTab(c){
  var p=c.pv;
  if(!p){var b=budgetOf(scope(),null);
    return '<div class="sm"><div class="sm-empty"><b>What Happens If You Apply</b><span>Choose what to change and for whom, then click <b>Preview</b>. The people affected, the cost, the average and the budget show here. Nothing is saved until Apply.</span></div>'
      +'<div class="sm-h">Budget Now</div><div class="smbar"><i style="width:'+Math.min(100,b.util)+'%"></i></div><div class="wm">'+b.util.toFixed(1)+'% of '+big(b.budget)+' used · '+big(Math.max(0,b.left))+' left</div>'+smLinks()+'</div>'}
  var RK=ruleKeys(p),K0=RK[0],L0=KLBL[K0]||K0,b0=p.before,b1=p.after,n=p.n,vr=viewRows().filter(function(e){var r=p.res[e.empId];return r&&r.st!=="off"}),sc=c.scope,left=b1.left,over=left<0;
  var base=0,t0=0,t1=0,lyT=0;sc.forEach(function(e){var r=p.res[e.empId];base+=e.basePay;t0+=Number(e[K0])||0;t1+=r&&r.st==="chg"?(Number(r.after[K0])||0):(Number(e[K0])||0);lyT+=cmpAmt(e)});
  var a0=base?t0/base*100:0,a1=base?t1/base*100:0,lyA=base?lyT/base*100:0,LYK=!!S.ly&&K0==="hikeAmt"&&EMP.some(function(e){return e.hikeLY!=null});
  var added=b1.used-b0.used;
  var h='<div class="sm">'+heroHtml(vr,p);
  if(LYK)h+=smYears(vr,p,K0);
  else if(S.ly&&K0!=="hikeAmt")h+='<div class="wm">Last-year history is only in the demo for Hike.</div>';
  /* by Tech ED (HR / top management): budget, used after, skipped */
  var TT=tedTable(sc,p);
  if(TT.length>1){
    h+='<div class="sm-h">Budget by Tech ED</div><div class="tedt"><div class="tedr th"><b>Tech ED</b><span>People</span><span>Budget</span><span>Used Now</span><span>Used After</span><span>Skipped</span><span>Status</span></div>';
    TT.forEach(function(t){h+='<div class="tedr"><b>'+esc(t.name)+'</b><span>'+t.n+'</span><span>'+big(t.b.budget)+'</span><span>'+t.b0.util.toFixed(0)+'%</span><span>'+t.b.util.toFixed(0)+'%</span><span>'+t.skip+'</span><span class="'+(t.b.left<0?'ov':'wi2')+'">'+(t.b.left<0?'Over by '+big(-t.b.left):'Within')+'</span></div>'});
    h+='</div><div class="wm">Skipped = already finalised or edited by a manager. Apply is saved as one batch; every row keeps its Tech ED in the history.</div>';
  }
  return h+'</div>';
}
$("imp").addEventListener("click",function(ev){
  var t=ev.target.closest&&ev.target.closest("[data-t],[data-sg],[data-sm],[data-fx]");if(!t||!$("imp").contains(t))return;
  if(t.getAttribute("data-t")){setPT(t.getAttribute("data-t"));return}
  if(t.getAttribute("data-sg")){GB="rating";S.wiDr=t.getAttribute("data-sg");setPT("budget");return}
  if(t.getAttribute("data-fx")){S.flOpen=t.getAttribute("data-fx");setPT("exc")}
});


/* ---------------- Exceptions (v47): flags with limits the user sets ---------------- */
var FL_KEY="bulkFlagLimits_v1";
var FLAGS=[
 {id:"band",label:"Outside Band Range",desc:"The hike takes someone below the band's P25 or above its P75.",sev:"warn",pm:[]},
 {id:"inv",label:"Rating Inversion",desc:"Someone gets a lower hike % than a person in the same band who is rated lower.",sev:"warn",pm:[{k:"gap",l:"Rating Gap at Least",u:"",d:1,step:0.5}]},
 {id:"big",label:"Unusually Large Hike",desc:"Hike % is far above the average of everyone in view.",sev:"warn",pm:[{k:"sd",l:"Above Average by",u:"× std dev",d:1.5,step:0.1}]},
 {id:"comp",label:"Compression",desc:"A person with fewer years of experience ends up paid more than a more experienced person in the same band.",sev:"warn",pm:[{k:"yrs",l:"Experience Gap at Least",u:"yrs",d:2,step:1}]},
 {id:"promo",label:"Promotion Plus a High Hike",desc:"Promoted and also given a hike above the limit.",sev:"info",pm:[{k:"pct",l:"Hike Above",u:"%",d:8,step:0.5}]},
 {id:"rep",label:"Repeat Top Hike",desc:"In the top group for hike % in each of the last years and again now.",sev:"info",pm:[{k:"top",l:"Top",u:"%",d:25,step:5},{k:"yrs",l:"Years in a Row",u:"yrs",d:2,step:1,max:3}]},
 {id:"low",label:"Less than Before",desc:"Hike % is lower than last year's, although the rating is the same or better.",sev:"warn",pm:[{k:"pp",l:"Lower by More than",u:"pp",d:1,step:0.5}]},
 {id:"mgr",label:"Manager Pattern",desc:"A Comp Manager's average hike is far from the average of all.",sev:"info",pm:[{k:"pp",l:"Differs by More than",u:"pp",d:1,step:0.5}]},
 {id:"data",label:"No Manager Rating",desc:"Rating is missing, so rating-based rules skip these people.",sev:"info",pm:[]}];
var FLS={on:{},v:{}};try{var _f=JSON.parse(localStorage.getItem(FL_KEY)||"null");if(_f)FLS=Object.assign(FLS,_f)}catch(x){}
function flSave(){try{localStorage.setItem(FL_KEY,JSON.stringify(FLS))}catch(x){}}
function flOn(id){if(id==="band"&&!EMP.some(function(e){return e.band}))return false;return FLS.on[id]!==false}
function flv(id,k){var f=FLAGS.filter(function(x){return x.id===id})[0],pm=f.pm.filter(function(q){return q.k===k})[0],v=FLS.v[id+"."+k];return v==null||isNaN(v)?pm.d:Number(v)}
function flCompute(p){
  var vr=viewRows().filter(function(e){var r=p&&p.res[e.empId];return !r||r.st!=="off"}),out={};FLAGS.forEach(function(f){out[f.id]=[]});
  function af(e){var r=p&&p.res[e.empId];return r&&r.st==="chg"?r.after.hikeAmt:e.hikeAmt}
  function hp(e){return af(e)/e.basePay*100}
  function nb(e){return e.basePay+af(e)}
  if(!vr.length)return out;
  vr.forEach(function(e){var r=p&&p.res[e.empId];if(r&&r.notes)r.notes.forEach(function(x){if(x.k==="range")out.band.push({e:e,why:x.m})})});
  var bands={};vr.forEach(function(e){if(e.rating!=null)(bands[e.band]=bands[e.band]||[]).push(e)});
  var gap=flv("inv","gap");
  Object.keys(bands).forEach(function(b){var a=bands[b].slice().sort(function(x,y){return x.rating-y.rating}),j=0,mxh=-1,mxe=null;
    a.forEach(function(e){while(j<a.length&&a[j].rating<=e.rating-gap){if(hp(a[j])>mxh){mxh=hp(a[j]);mxe=a[j]}j++}
      if(mxe&&hp(e)<mxh-0.05)out.inv.push({e:e,why:"Rated "+e.rating.toFixed(1)+" gets "+hp(e).toFixed(1)+"%; "+mxe.name+" (rated "+mxe.rating.toFixed(1)+") gets "+mxh.toFixed(1)+"%"})})});
  var hs=vr.map(hp),mean=hs.reduce(function(a,b){return a+b},0)/hs.length,sd=Math.sqrt(hs.reduce(function(a,b){return a+(b-mean)*(b-mean)},0)/Math.max(1,hs.length-1)),thr=mean+flv("big","sd")*sd;
  if(sd>0)vr.forEach(function(e){if(hp(e)>thr)out.big.push({e:e,why:hp(e).toFixed(1)+"% vs average "+mean.toFixed(1)+"%"})});
  var yg=flv("comp","yrs"),bb={};vr.forEach(function(e){if(e.yoe!=null)(bb[e.band]=bb[e.band]||[]).push(e)});
  Object.keys(bb).forEach(function(b){var a=bb[b].slice().sort(function(x,y){return x.yoe-y.yoe}),n=a.length,sm=new Array(n+1),si=new Array(n+1);sm[n]=Infinity;
    for(var i=n-1;i>=0;i--){var v=nb(a[i]);if(v<sm[i+1]){sm[i]=v;si[i]=i}else{sm[i]=sm[i+1];si[i]=si[i+1]}}
    var k=0;a.forEach(function(e,i){while(k<n&&a[k].yoe<e.yoe+yg)k++;if(k<n&&nb(e)>sm[k]*1.01){var o=a[si[k]];out.comp.push({e:e,why:e.yoe+" yrs paid "+inr(nb(e))+" · "+o.name+" ("+o.yoe+" yrs) "+inr(nb(o))})}})});
  var pt=flv("promo","pct");vr.forEach(function(e){if(e.promo==="Yes"&&hp(e)>=pt)out.promo.push({e:e,why:"Promoted · hike "+hp(e).toFixed(1)+"%"})});
  var ny=Math.min(3,Math.max(1,Math.round(flv("rep","yrs")))),tp=Math.min(50,Math.max(5,flv("rep","top"))),ks=["hikeLY","hikeLY2","hikeLY3"];
  function pc(arr,q){return pctile(arr,q)}
  var tNow=pc(vr.map(hp),1-tp/100),tH=ks.slice(0,ny).map(function(k){return pc(vr.filter(function(e){return e[k]!=null}).map(function(e){return e[k]/e.basePay*100}),1-tp/100)});
  vr.forEach(function(e){if(hp(e)<tNow)return;for(var i=0;i<ny;i++){if(e[ks[i]]==null||tH[i]==null||e[ks[i]]/e.basePay*100<tH[i])return}out.rep.push({e:e,why:"Top "+tp+"% now and in each of the last "+ny+" year"+(ny===1?"":"s")})});
  var pp=flv("low","pp");vr.forEach(function(e){if(e.ratingLY==null||e.rating==null||e.hikeLY==null)return;var l=e.hikeLY/e.basePay*100;if(e.rating>=e.ratingLY&&hp(e)<l-pp)out.low.push({e:e,why:hp(e).toFixed(1)+"% vs "+l.toFixed(1)+"% last year · rating "+e.ratingLY.toFixed(1)+" → "+e.rating.toFixed(1)})});
  var mg={};vr.forEach(function(e){(mg[e.compManager]=mg[e.compManager]||[]).push(e)});var mp=flv("mgr","pp");
  Object.keys(mg).forEach(function(m){var a=mg[m];if(a.length<3)return;var av=a.reduce(function(x,e){return x+hp(e)},0)/a.length;if(Math.abs(av-mean)>mp)a.forEach(function(e){out.mgr.push({e:e,why:m+" averages "+av.toFixed(1)+"% vs "+mean.toFixed(1)+"% overall"})})});
  vr.forEach(function(e){if(e.rating==null)out.data.push({e:e,why:"No Manager Rating"})});
  return out;
}
function flCsv(p,FC){
  var rows=[["Emp ID","Name","Designation","Band","Rating","Hike % Now","Hike % After","Flag","Why"]];
  FLAGS.forEach(function(f){if(!flOn(f.id))return;FC[f.id].forEach(function(x){var e=x.e,r=p&&p.res[e.empId],a=r&&r.st==="chg"?r.after.hikeAmt:e.hikeAmt;rows.push([e.empId,e.name,e.designation,e.band,e.rating==null?"":e.rating,(e.hikeAmt/e.basePay*100).toFixed(2),(a/e.basePay*100).toFixed(2),f.label,x.why])})});
  return rows.map(function(r){return r.map(function(x){var t=String(x==null?"":x);return /[",\n]/.test(t)?'"'+t.replace(/"/g,'""')+'"':t}).join(",")}).join("\n");
}
function excTab(c){
  var p=c.pv,FC=flCompute(p),uniq={},tot=0;
  FLAGS.forEach(function(f){if(!flOn(f.id))return;FC[f.id].forEach(function(x){uniq[x.e.empId]=1});tot+=FC[f.id].length});
  var h='<div class="wi wp ex-t"><div class="exh"><div><b>'+Object.keys(uniq).length+'</b> people flagged · '+tot+' flag'+(tot===1?'':'s')+'</div>'
    +'<div class="exa"><button type="button" class="pvq" id="flReset">Reset Limits</button><button type="button" class="pvq" id="flCsv">⬇ Download Flagged</button></div></div>'
    +'<div class="wm" style="margin:0 0 8px">'+(p?'Flags use the limits below and the values after your preview.':'Showing current values. Click Preview to include your change.')+' Change a limit and the counts update at once.</div>';
  FLAGS.forEach(function(f){
    var on=flOn(f.id),L=FC[f.id],n=L.length,open=S.flOpen===f.id&&on;
    h+='<div class="fl'+(on?'':' off')+(open?' open':'')+'"><div class="flr"><label class="flsw" title="Switch This Flag on or Off"><input type="checkbox" data-flon="'+f.id+'"'+(on?' checked':'')+'><span></span></label>'
      +'<div class="fln"><b>'+esc(f.label)+'</b><i>'+esc(f.desc)+'</i></div>'
      +'<div class="fllim">'+f.pm.map(function(q){return '<label>'+esc(q.l)+'<span><input type="number" data-flp="'+f.id+'.'+q.k+'" step="'+q.step+'" min="0"'+(q.max?' max="'+q.max+'"':'')+' value="'+flv(f.id,q.k)+'"'+(on?'':' disabled')+'>'+(q.u?'<em>'+esc(q.u)+'</em>':'')+'</span></label>'}).join("")+'</div>'
      +'<button type="button" class="flc'+(on&&n?' has '+f.sev:'')+'" data-flopen="'+f.id+'"'+(on&&n?'':' disabled')+'>'+(on?n:'–')+'<span>'+(open?'▴':'▾')+'</span></button></div>';
    if(open){h+='<div class="flp">'+L.slice(0,10).map(function(x){var e=x.e,r=p&&p.res[e.empId],a=r&&r.st==="chg"?r.after.hikeAmt:e.hikeAmt;
      return '<div class="ex"><div class="n"><b>'+esc(e.empId)+' - '+esc(e.name)+'</b><i>'+esc(e.designation)+' · '+esc(e.band)+'</i></div><div>'+(e.hikeAmt/e.basePay*100).toFixed(2)+'% → <b>'+(a/e.basePay*100).toFixed(2)+'%</b></div></div><div class="exwhy">'+esc(x.why)+'</div>'}).join("")
      +'<div class="wm">Showing '+Math.min(10,n)+' of '+n+(n>10?' · the full list is in Download flagged.':'')+'</div></div>'}
    h+='</div>'});
  return h+'</div>';
}
$("imp").addEventListener("click",function(ev){
  var t=ev.target.closest&&ev.target.closest("[data-flopen],#flReset,#flCsv");if(!t)return;
  if(t.id==="flReset"){FLS={on:{},v:{}};flSave();renderImpact();return}
  if(t.id==="flCsv"){var bl=new Blob(["﻿"+flCsv(S.pv,flCompute(S.pv))],{type:"text/csv;charset=utf-8"}),a=document.createElement("a");a.href=URL.createObjectURL(bl);a.download="Bulk_flagged_people.csv";document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},500);return}
  var id=t.getAttribute("data-flopen");S.flOpen=S.flOpen===id?"":id;renderImpact();
});
$("imp").addEventListener("change",function(ev){var t=ev.target;
  if(t.getAttribute&&t.getAttribute("data-flon")){FLS.on[t.getAttribute("data-flon")]=t.checked;flSave();renderImpact();return}
  if(t.getAttribute&&t.getAttribute("data-flp")){var v=parseFloat(t.value);if(!isNaN(v))FLS.v[t.getAttribute("data-flp")]=v;flSave();renderImpact()}
});

var _render=render;render=function(){_render();renderImpact()};


/* thin metrics panel: one line always, the four cards open under it; the choice is remembered per browser */
var IMP_KEY="bulkImpOpen_v1";
function setImp(v){root.classList.toggle("impOpen",v);try{localStorage.setItem(IMP_KEY,v?"1":"0")}catch(x){}renderImpactBar()}
function sharePct(cols,c){var v=0;c.scope.forEach(function(e){var a=c.pv&&c.pv.res[e.empId]&&c.pv.res[e.empId].st==="chg"?c.pv.res[e.empId].after:e;cols.forEach(function(k){v+=Number(a[k])||0})});return c.after.budget?v/c.after.budget*100:0}
function renderImpactBar(){
  var c=$("metCtx");if(c)c.textContent=ACTIVE_CYCLE.name+" · "+filterSummary();
  var sc=scope(),open=root.classList.contains("impOpen");
  if(S.loading||!sc.length){$("impBar").innerHTML="";return}
  var p=S.pv,ctx={pv:p,scope:sc,before:p?p.before:budgetOf(sc,null),after:p?p.after:budgetOf(sc,null)},b0=ctx.before,b1=ctx.after,moved=!!p&&Math.abs(b1.util-b0.util)>0.005,left=b1.left;
  $("impBar").innerHTML='<span class="tg2">Impact</span>'
    +'<span class="k">Budget Utilised <b>'+b1.util.toFixed(1)+'%</b>'+(moved?' <small>from '+b0.util.toFixed(1)+'%</small>':'')+'</span>'
    +(p?'<span class="k">People Affected <b>'+p.n.chg+'</b></span>'
       +'<span class="k">Skipped <b>'+p.n.skip+'</b> · Left out <b>'+p.n.off+'</b></span>'
       +'<span class="k">Total Hike <b>'+big(p.hike.before)+'</b> → <b>'+big(p.hike.after)+'</b></span>'
       +'<span class="k">Budget Used <b>'+big(b1.used)+'</b> of <b>'+big(b1.budget)+'</b></span>'
       +(left<0?'<span class="k wn">⚠ Over Budget by <b>'+big(-left)+'</b> · warning only</span>':'')
     :'<span class="k">Hike <b>'+sharePct(["hikeAmt"],ctx).toFixed(1)+'%</b></span>'
       +'<span class="k">Bonus <b>'+sharePct(["newPB","newRB"],ctx).toFixed(1)+'%</b></span>'
       +'<span class="k"><b>'+big(Math.abs(left))+'</b> '+(left>=0?'left':'over budget')+(S.incTpb?' <small>incl. Target PB</small>':'')+'</span>')
    +'<span style="flex:1"></span><span class="k">'+(open?'Hide Details ›':'‹ Details')+'</span>';
}
$("impBar").addEventListener("click",function(){setImp(!root.classList.contains("impOpen"))});
$("impBar").addEventListener("keydown",function(ev){if(ev.key==="Enter"||ev.key===" "){ev.preventDefault();setImp(!root.classList.contains("impOpen"))}});
$("metX").addEventListener("click",function(){setImp(false)});
$("metTab").addEventListener("click",function(){setImp(true)});
var impOpen=true;try{if(localStorage.getItem(IMP_KEY)==="0")impOpen=false}catch(x){}
root.classList.add("impOpen");   // v36: the Preview is the right half of the screen, always shown
var _render2=render;render=function(){_render2();renderImpactBar();renderRestoreLast()};

/* thin metrics strip (replaces the four tall cards): same four metrics, one row */
function mBlock(cls,tag,val,from,pctNow,pctBefore,sub){
  var moved=from!=null;
  return '<div class="mt '+cls+'"><div class="tg">'+tag+'</div><div class="v">'+val+(moved?'<small>from '+from+'</small>':'')+'</div>'
    +'<div class="bar"><i class="af" style="width:'+Math.min(100,pctNow)+'%"></i></div><div class="sb">'+sub+'</div></div>';
}
function metricStrip(c){
  var b0=c.before,b1=c.after,moved=!!c.pv&&Math.abs(b1.util-b0.util)>0.005,left=b1.left,add=b1.used-b0.used;
  function sh(cols,after){var v=0;c.scope.forEach(function(e){var a=after&&c.pv&&c.pv.res[e.empId]&&c.pv.res[e.empId].st==="chg"?c.pv.res[e.empId].after:e;cols.forEach(function(k){v+=Number(a[k])||0})});return {v:v,p:b1.budget?v/b1.budget*100:0}}
  var h0=sh(["hikeAmt"],true),h1=sh(["hikeAmt"],false),k0=sh(["newPB","newRB"],true),k1=sh(["newPB","newRB"],false);
  var hm=!!c.pv&&Math.abs(h0.p-h1.p)>0.005,km=!!c.pv&&Math.abs(k0.p-k1.p)>0.005;
  var by={5:[],4:[],3:[],2:[],1:[]};
  if(c.pv)c.rows.forEach(function(e){var b=bucket(e);if(b)by[b].push(c.pv.res[e.empId].after.hikeAmt/e.basePay*100)});
  var rt=[5,4,3,2,1].map(function(k){var a=by[k],v=a.length?a.reduce(function(x,y){return x+y},0)/a.length:null;return '<span><i>'+k+'</i><b>'+(v==null?'—':v.toFixed(1)+'%')+'</b></span>'}).join("");
  return mBlock(b1.util>100?"red":"","Budget Utilised",b1.util.toFixed(1)+'%',moved?b0.util.toFixed(1)+'%':null,b1.util,0,'<b>'+big(Math.abs(left))+'</b> '+(left>=0?'left':'over')+(c.pv?' · adds <b>'+big(add)+'</b>':''))
   +mBlock("amber","Hike as Budget Consumed",h0.p.toFixed(1)+'%',hm?h1.p.toFixed(1)+'%':null,h0.p,0,'<b>'+big(h0.v)+'</b> of '+big(b1.budget))
   +mBlock("violet","Bonus as Budget Consumed",k0.p.toFixed(1)+'%',km?k1.p.toFixed(1)+'%':null,k0.p,0,'<b>'+big(k0.v)+'</b> of '+big(b1.budget))
   +'<div class="mt green"><div class="tg">Average Hike % by Rating</div><div class="rts">'+rt+'</div><div class="sb">'+(c.pv?'rows in this preview':'Click Preview to see it')+'</div></div>';
}
/* ---------------- loading from the server ---------------- */
var NUMF=["basePay","pbPaid","rbPaid","hikeAmt","newPB","newRB","tpbNext"];
var DESIG_BAND={};
function mapRow(r){
  var e=Object.assign({},r,{empId:String(r.empId),name:r.name||"",designation:r.designation||"",band:r.band||DESIG_BAND[r.designation]||"",
    compManager:r.compManager||"",superManager:r.superManager||"",
    rating:(r.rating===""||r.rating==null||r.rating==="•••")?null:Number(r.rating),
    clientRating:(r.clientRating===""||r.clientRating==null)?null:Number(r.clientRating),rrPct:(r.rrPct===""||r.rrPct==null)?null:Number(r.rrPct),grossMargin:(r.grossMargin===""||r.grossMargin==null)?null:Number(r.grossMargin),newTitle:r.newTitle||r.promoDesig||"",
    newPBInst:String(r.newPBInst||"1"),remarks:r.remarks||"",promo:r.promo||"No",hand:false,bulk:false});
  NUMF.forEach(function(k){e[k]=Number(r[k])||0});
  return e;
}
function loadBudget(){
  return apiCall("GET","/budget?cycle_id="+encodeURIComponent(ACTIVE_CYCLE.id)+asQ()).then(function(b){
    SB=b;SB0=sums(scope(),null);
  }).catch(function(){SB=null;SB0=null});
}
function asQ(){return S.as?"&as="+encodeURIComponent(S.as):""}
function loadAudit(){   // who changed what: rows last touched by hand vs in bulk
  return apiCall("GET","/audit?cycle_id="+encodeURIComponent(ACTIVE_CYCLE.id)+asQ()).then(function(res){
    var list=res.audit||res.entries||res.rows||[];if(!Array.isArray(list))return;
    list.forEach(function(x){
      var e=byId(String(x.empId||x.emp_id||""));if(!e)return;
      var s=String(x.source||"");
      if(/^bulk/.test(s))e.bulk=true;else if(s&&s!=="upload")e.hand=true;
    });
  }).catch(function(){});
}
/* History = the audit trail of this cycle (cfg.loadBatches), so it survives a refresh and a new login.
   Batches only this screen knows about (just applied, audit not echoed yet) are kept. */
function syncBatches(force){
  if(!cfg.loadBatches)return Promise.resolve();
  return Promise.resolve(cfg.loadBatches(!!force)).then(function(list){
    if(!Array.isArray(list))return;
    var by={};list.forEach(function(b){by[b.id]=b});
    var mine=S.batches.filter(function(b){return !by[b.id]});
    mine.forEach(function(b){by[b.id]=b});
    S.batches.forEach(function(b){if(b.restored&&by[b.id])by[b.id].restored=true});
    S.batches=Object.keys(by).map(function(k){return by[k]}).sort(function(a,b){return(a.at||0)-(b.at||0)});
    try{renderImpact()}catch(x){}
  }).catch(function(){});
}
function loadBatches(){
  if(cfg.loadBatches)return syncBatches(true);
  return apiCall("GET","/batches?cycle_id="+encodeURIComponent(ACTIVE_CYCLE.id)+asQ()).then(function(r){S.batches=(r.batches||[]).map(function(b){return {id:b.id,time:b.time||b.at||"",by:b.by||"",text:b.text||"",rows:(b.rows||[]).map(function(x){return {id:x.id||x.empId,old:x.old||{},nw:x.nw||x.new||{},bulk:x.bulk}}),restored:!!b.restored}})}).catch(function(){S.batches=[]});
}
function loadAll(){
  var cl=$("cycLbl");if(cl)cl.textContent=cycTxt();
  S.loading=true;S.err="";S.flash="";S.pv=null;render();
  // the rows come first: they say which roles this login has, and the other calls need that
  return apiCall("GET","/rows?cycle_id="+encodeURIComponent(ACTIVE_CYCLE.id)+asQ()).then(function(res){
    ME=res.me||null;FA=res.fields||{};S.locked=!!res.locked;S.lockReason=res.lockReason||"";
    (res.designations||[]).forEach(function(d){if(d&&d.designation&&d.band)DESIG_BAND[d.designation]=d.band});
    EMP=(res.rows||[]).map(mapRow);SC_VER++;
    var rl=ME&&Array.isArray(ME.roles)?ME.roles:[];
    S.as=rl.length>1?(S.as||ME.activeRole||rl[0].key):"";
    return Promise.all([loadAudit(),loadBudget(),loadBatches()]);
  }).then(function(){
    SC_VER++;S.loading=false;fillSelects();
    var r0=S.rules[0];if(r0&&!canEdit(FIELDS[r0.field].key)){var f=FORDER.filter(function(x){return fieldOn(x)&&canEdit(FIELDS[x].key)})[0];if(f)S.rules[0]=newRule(f,false)}
    renderRules();render();
  }).catch(function(err){S.loading=false;EMP=[];SC_VER++;S.err="Could not load from the server: "+err.message;render()});
}
function cycTxt(){return ACTIVE_CYCLE.name+" cycle"+(ACTIVE_CYCLE.location?" · "+ACTIVE_CYCLE.location:"")}
var PUBLIC_API={setCycle:function(c){ACTIVE_CYCLE=c;if(apiMode())return loadAll();$("cycLbl")&&($("cycLbl").textContent=cycTxt()+" · demo data")},
  reload:function(){return apiMode()?loadAll():null},dirty:function(){return !!S.pv}};
if(apiMode()){
  EMP=[];
}
   // right-click blocked (standing rule)
loadMine();fillSelects();restore();renderRules();render();
if(apiMode())loadAll();
if(cfg.loadBatches)syncBatches(true);

/* ===== v51: Summary main chart: the user picks the statistic, the measure and the grouping ===== */
var HC_KEY="bulkHero_v1",HS={stat:"avg",meas:"hikePct"};
try{var _hs=JSON.parse(localStorage.getItem(HC_KEY)||"null");if(_hs)HS=Object.assign(HS,_hs)}catch(x){}
var HSTAT=[["avg","Average"],["med","Median"],["sd","Std Deviation"],["min","Minimum"],["max","Maximum"],["p25","25th percentile"],["p75","75th percentile"],["sum","Total"]];
function hav(e,a,k){return a&&a[k]!=null?Number(a[k])||0:Number(e[k])||0}
var HMEAS={hikePct:{l:"Hike %",pct:true,f:function(e,a){return hav(e,a,"hikeAmt")/e.basePay*100}},
  hikeAmt:{l:"Hike Amount",f:function(e,a){return hav(e,a,"hikeAmt")}},
  newBase:{l:"New Base Pay",f:function(e,a){return e.basePay+hav(e,a,"hikeAmt")}},
  pb:{l:"Performance Bonus",f:function(e,a){return hav(e,a,"newPB")}},
  rb:{l:"Retention Bonus",f:function(e,a){return hav(e,a,"newRB")}}};
function hStat(arr,s){
  var n=arr.length;if(!n)return null;var sum=arr.reduce(function(x,y){return x+y},0);
  if(s==="avg")return sum/n;if(s==="sum")return sum;
  if(s==="min")return Math.min.apply(null,arr);if(s==="max")return Math.max.apply(null,arr);
  if(s==="med")return pctile(arr,.5);
  if(s==="p25"||s==="p75")return n<5?null:pctile(arr,s==="p25"?.25:.75);
  if(s==="sd"){if(n<2)return 0;var m=sum/n;return Math.sqrt(arr.reduce(function(x,y){return x+(y-m)*(y-m)},0)/(n-1))}
  return null;
}
function niceStep(x){var p=Math.pow(10,Math.floor(Math.log10(x))),m=x/p;return(m<=1?1:m<=2?2:m<=2.5?2.5:m<=5?5:10)*p}
function hFmt(v,pct,axis){if(v==null)return "–";if(pct)return v.toFixed(axis?1:1)+"%";
  return Math.round(v).toLocaleString("en-IN")}
function heroHtml(vr,p){
  var opts=groupOpts();if(!opts.some(function(o){return o.id===GB}))GB="rating";
  var M=HMEAS[HS.meas]||HMEAS.hikePct;if(!HMEAS[HS.meas])HS.meas="hikePct";
  if(HS.stat==="sum"&&M.pct)HS.stat="avg";
  var g={};vr.forEach(function(e){var k=groupKey(e,GB),r=p.res[e.empId],a=r&&r.st==="chg"?r.after:null,o=g[k]=g[k]||{n:0,b:[],a:[]};o.n++;o.b.push(M.f(e,null));o.a.push(M.f(e,a))});
  var keys;if(GB==="rating")keys=["5","4","3","2","1","No Rating"];
  else{keys=Object.keys(g).sort(function(x,y){return g[y].n-g[x].n}).slice(0,12).sort(function(x,y){return x<y?-1:x>y?1:0})}
  var rows=keys.map(function(k){var o=g[k]||{n:0,b:[],a:[]};return {k:k,n:o.n,b:hStat(o.b,HS.stat),a:hStat(o.a,HS.stat)}});
  var mx=0;rows.forEach(function(r){if(r.b!=null)mx=Math.max(mx,r.b);if(r.a!=null)mx=Math.max(mx,r.a)});if(mx<=0)mx=1;
  var st=niceStep(mx*1.08/4),top=st*4;
  var H=240,L0=6,R0=50,T0=10,B0=38,W=Math.max(640,L0+R0+rows.length*90),iw=W-L0-R0,ih=H-T0-B0,gw=iw/rows.length,bw=Math.min(9,gw/4.5),gap=2;
  var s='<svg viewBox="0 0 '+W+' '+H+'"'+(W>640?' style="width:'+W+'px;height:'+H+'px;max-height:none"':'')+' role="img" aria-label="'+esc(HS.stat)+' of '+esc(M.l)+'">';
  for(var i=0;i<=4;i++){var y=T0+ih-ih*i/4;s+='<line x1="'+L0+'" x2="'+(W-R0)+'" y1="'+y+'" y2="'+y+'" stroke="'+(i?'#E5E7EB':'#9CA3AF')+'"'+(i?' stroke-dasharray="3 4"':'')+'/><text x="'+(W-R0+8)+'" y="'+(y+3)+'" font-size="9" fill="#6B7280">'+hFmt(st*i,M.pct,true)+'</text>'}
  var lbl=GB==="rating"?function(k){return k==="No Rating"?k:"Rating "+k}:function(k){return k.length>13?k.slice(0,12)+"…":k};
  rows.forEach(function(r,i){var cx=L0+gw*i+gw/2,hb=r.b==null?0:ih*r.b/top,ha=r.a==null?0:ih*r.a/top,d=(r.a!=null&&r.b!=null)?r.a-r.b:null;
    var tip='<b>'+esc(lbl(r.k))+'</b> · '+r.n+' people<br>'+(r.n?'Now '+hFmt(r.b,M.pct)+' → After <b>'+hFmt(r.a,M.pct)+'</b>'+(d==null?'':' <span class="'+(d>0?'g':d<0?'r':'')+'">'+(d>0?'+':'')+(M.pct?d.toFixed(1)+' pp':hFmt(d,false))+'</span>'):'Nobody in this group');
    s+='<g class="hg" data-hgk="'+esc(r.k)+'" data-tip="'+esc(tip)+'"><rect class="hv" x="'+(cx-gw/2+3)+'" y="'+T0+'" width="'+(gw-6)+'" height="'+(ih+B0-6)+'" fill="transparent"/>';
    if(r.b!=null)s+='<rect x="'+(cx-bw-gap/2)+'" y="'+(T0+ih-hb)+'" width="'+bw+'" height="'+hb+'" rx="1.5" fill="#9DBDEB"/>';
    if(r.a!=null){s+='<rect x="'+(cx+gap/2)+'" y="'+(T0+ih-ha)+'" width="'+bw+'" height="'+ha+'" rx="1.5" fill="#27548A"/>';
      if(gw>44)s+='<text x="'+(cx+gap/2+bw/2)+'" y="'+(T0+ih-ha-4)+'" font-size="9" font-weight="700" text-anchor="middle" fill="#102A43">'+hFmt(r.a,M.pct)+'</text>'}
    s+='<text x="'+cx+'" y="'+(H-22)+'" font-size="10" font-weight="600" text-anchor="middle" fill="#374151">'+esc(lbl(r.k))+'</text><text x="'+cx+'" y="'+(H-9)+'" font-size="9" text-anchor="middle" fill="#9CA3AF">'+r.n+' people</text></g>'});
  s+='</svg>';
  var sel=function(id,o,cur){return '<select id="'+id+'">'+o.map(function(x){return '<option value="'+x[0]+'"'+(x[0]===cur?' selected':'')+'>'+esc(x[1])+'</option>'}).join("")+'</select>'};
  return '<div class="hc"><div class="hbar">'+sel("hcStat",HSTAT.filter(function(x){return x[0]!=="sum"||!M.pct}),HS.stat)+'<span>of</span>'
    +sel("hcMeas",Object.keys(HMEAS).map(function(k){return [k,HMEAS[k].l]}),HS.meas)+'<span>by</span>'+sel("hcGb",opts.map(function(o){return [o.id,o.label||o.l||o.id]}),GB)+cmpSelHtml("cmpSelSum")+'</div>'
    +'<div class="hlg"><span><i style="background:#9DBDEB"></i>Now</span><span><i style="background:#27548A"></i>After This Change</span></div>'+'<div class="hscroll">'+s+'</div></div>';
}
var hTip=document.createElement("div");hTip.className="htip";root.appendChild(hTip);
$("imp").addEventListener("mousemove",function(ev){var g=ev.target.closest&&ev.target.closest(".hg");if(!g){hTip.style.display="none";return}
  hTip.innerHTML=g.getAttribute("data-tip");hTip.style.display="block";var x=ev.clientX+14,y=ev.clientY+14;if(x+hTip.offsetWidth>window.innerWidth-8)x=ev.clientX-hTip.offsetWidth-14;hTip.style.left=x+"px";hTip.style.top=y+"px"});
$("imp").addEventListener("mouseleave",function(){hTip.style.display="none"});
$("imp").addEventListener("change",function(ev){var id=ev.target.id;
  if(id==="hcStat"||id==="hcMeas"){HS[id==="hcStat"?"stat":"meas"]=ev.target.value;try{localStorage.setItem(HC_KEY,JSON.stringify(HS))}catch(x){}renderImpact()}
  else if(id==="hcGb"){GB=ev.target.value;S.wiDr="";try{localStorage.setItem(GB_KEY,GB)}catch(x){}renderImpact()}});
$("imp").addEventListener("click",function(ev){var g=ev.target.closest&&ev.target.closest("[data-hgk]");if(!g)return;S.wiDr=g.getAttribute("data-hgk");hTip.style.display="none";setPT("budget")});

/* ===== v51: Exceptions in four tabs + a Config tab where each user switches flags on/off, sets limits and adds own flags ===== */
var GRP=["Pay","Rating","Promotion","History"];
(function(){var m={band:"Pay",big:"Pay",comp:"Pay",inv:"Rating",data:"Rating",mgr:"Rating",promo:"Promotion",rep:"History",low:"History"};FLAGS.forEach(function(f){f.grp=m[f.id]||"Pay"})})();
FLAGS.push(
 {id:"lowgood",label:"Low Hike for a Good Performer",desc:"Rated high, but the hike % is below the minimum.",sev:"warn",grp:"Pay",pm:[{k:"r",l:"Rating at Least",u:"",d:4,step:0.5},{k:"pct",l:"Hike Below",u:"%",d:4,step:0.5}]},
 {id:"lowrate",label:"Hike for a Low Rating",desc:"Rated low, yet given a hike above the limit.",sev:"warn",grp:"Rating",pm:[{k:"r",l:"Rating at Most",u:"",d:2,step:0.5},{k:"pct",l:"Hike Above",u:"%",d:0,step:0.5}]},
 {id:"promolow",label:"Promotion with a Small Hike",desc:"Promoted, but the hike % is below the minimum.",sev:"info",grp:"Promotion",pm:[{k:"pct",l:"Hike Below",u:"%",d:5,step:0.5}]},
 {id:"nohike",label:"No Hike for Several Cycles",desc:"No hike now and none in the earlier cycles.",sev:"info",grp:"History",pm:[{k:"yrs",l:"Cycles in a Row",u:"",d:2,step:1,max:3}]},
 {id:"jump",label:"Jump Above the 3-Year Average",desc:"Hike % is far above this person's own average of past years.",sev:"info",grp:"History",pm:[{k:"pp",l:"Above Average by",u:"pp",d:3,step:0.5}]});
if(!FLS.custom)FLS.custom=[];
var CF_FIELDS=[["hp","Hike % (After)"],["ha","Hike Amount (After)"],["rt","Manager Rating"],["cr","Client Rating"],["yoe","Years of Experience"],["rr","RR %"],["gm","Gross Margin %"],["bp","Base Pay"],["nb","New Base Pay"]],
    CF_OPS=[["gt","is above"],["lt","is below"],["eq","equals"],["bt","is between"]];
function cfName(k){return CF_FIELDS.filter(function(x){return x[0]===k})[0][1]}
function cDesc(c){var o=CF_OPS.filter(function(x){return x[0]===c.op})[0][1];return cfName(c.field)+" "+o+" "+c.a+(c.op==="bt"?" and "+c.b:"")}
function addCustom(c){if(FLAGS.some(function(f){return f.id===c.id}))return;FLAGS.push({id:c.id,label:c.label,desc:"Your Own Flag",sev:"info",grp:c.grp,pm:[],custom:true})}
FLS.custom.forEach(addCustom);
function flSync(){if(!FLS.custom)FLS.custom=[];FLAGS=FLAGS.filter(function(f){return !f.custom||FLS.custom.some(function(c){return c.id===f.id})})}
var _flc=flCompute;
flCompute=function(p){
  flSync();var out=_flc(p);FLAGS.forEach(function(f){if(!out[f.id])out[f.id]=[]});
  var vr=viewRows().filter(function(e){var r=p&&p.res[e.empId];return !r||r.st!=="off"});
  function af(e){var r=p&&p.res[e.empId];return r&&r.st==="chg"?r.after.hikeAmt:e.hikeAmt}
  function hp(e){return af(e)/e.basePay*100}
  function ok(id){return flOn(id)}
  if(ok("lowgood")){var r0=flv("lowgood","r"),pc0=flv("lowgood","pct");vr.forEach(function(e){if(e.rating!=null&&e.rating>=r0&&hp(e)<pc0)out.lowgood.push({e:e,why:"Rated "+e.rating.toFixed(1)+" · hike "+hp(e).toFixed(1)+"%"})})}
  if(ok("lowrate")){var r1=flv("lowrate","r"),pc1=flv("lowrate","pct");vr.forEach(function(e){if(e.rating!=null&&e.rating<=r1&&hp(e)>pc1)out.lowrate.push({e:e,why:"Rated "+e.rating.toFixed(1)+" · hike "+hp(e).toFixed(1)+"%"})})}
  if(ok("promolow")){var pc2=flv("promolow","pct");vr.forEach(function(e){if(e.promo==="Yes"&&hp(e)<pc2)out.promolow.push({e:e,why:"Promoted · hike only "+hp(e).toFixed(1)+"%"})})}
  if(ok("nohike")){var ny=Math.min(3,Math.max(2,Math.round(flv("nohike","yrs"))));vr.forEach(function(e){if(hp(e)>0||e.hikeLY==null||e.hikeLY>0)return;if(ny>=3&&(e.hikeLY2==null||e.hikeLY2>0))return;out.nohike.push({e:e,why:"No hike now and in the last "+(ny-1)+" cycle"+(ny===2?"":"s")})})}
  if(ok("jump")){var pj=flv("jump","pp");vr.forEach(function(e){var h=[e.hikeLY,e.hikeLY2,e.hikeLY3].filter(function(x){return x!=null}).map(function(x){return x/e.basePay*100});if(!h.length)return;var av=h.reduce(function(a,b){return a+b},0)/h.length;if(hp(e)>av+pj)out.jump.push({e:e,why:hp(e).toFixed(1)+"% vs own average "+av.toFixed(1)+"% over "+h.length+" past year"+(h.length===1?"":"s")})})}
  function cv(e,k){return k==="hp"?hp(e):k==="ha"?af(e):k==="rt"?e.rating:k==="cr"?e.clientRating:k==="yoe"?e.yoe:k==="rr"?e.rrPct:k==="gm"?e.grossMargin:k==="bp"?e.basePay:k==="nb"?e.basePay+af(e):null}
  FLS.custom.forEach(function(c){if(!ok(c.id))return;vr.forEach(function(e){var v=cv(e,c.field);if(v==null||v==="")return;v=Number(v);if(isNaN(v))return;
    var hit=c.op==="gt"?v>c.a:c.op==="lt"?v<c.a:c.op==="eq"?Math.abs(v-c.a)<1e-9:(v>=Math.min(c.a,c.b)&&v<=Math.max(c.a,c.b));
    if(hit)(out[c.id]=out[c.id]||[]).push({e:e,why:cfName(c.field)+" = "+(Math.round(v*100)/100)})})});
  return out;
};
function xLim(f){return f.custom?cDesc(FLS.custom.filter(function(c){return c.id===f.id})[0]):f.pm.length?f.pm.map(function(q){return q.l+" "+flv(f.id,q.k)+(q.u?" "+q.u:"")}).join(" · "):""}
function xDrill(f,L,p){return '<div class="flp">'+L.slice(0,10).map(function(x){var e=x.e,r=p&&p.res[e.empId],a=r&&r.st==="chg"?r.after.hikeAmt:e.hikeAmt;
  return '<div class="ex"><div class="n"><b>'+esc(e.empId)+' - '+esc(e.name)+'</b><i>'+esc(e.designation)+' · '+esc(e.band)+'</i></div><div>'+(e.hikeAmt/e.basePay*100).toFixed(2)+'% → <b>'+(a/e.basePay*100).toFixed(2)+'%</b></div></div><div class="exwhy">'+esc(x.why)+'</div>'}).join("")
  +'<div class="wm">Showing '+Math.min(10,L.length)+' of '+L.length+(L.length>10?' · the full list is in Download flagged.':'')+'</div></div>'}
function xRow(f,FC,p,cfg){
  var on=flOn(f.id),L=FC[f.id]||[],n=L.length,open=S.flOpen===f.id&&on,cnt='<button type="button" class="flc'+(on&&n?' has '+f.sev:'')+'" data-flopen="'+f.id+'"'+(on&&n?'':' disabled')+'>'+(on?n:'–')+'<span>'+(open?'▴':'▾')+'</span></button>';
  if(!cfg)return '<div class="fl nocfg'+(open?' open':'')+'"><div class="flr"><div class="fln"><b>'+esc(f.label)+'</b><i>'+esc(f.desc)+'</i>'+(xLim(f)?'<div class="xlim">'+esc(xLim(f))+'</div>':'')+'</div>'+cnt+'</div>'+(open?xDrill(f,L,p):'')+'</div>';
  return '<div class="fl'+(on?'':' off')+(open?' open':'')+'"><div class="flr"><label class="flsw" title="Switch This Flag on or Off"><input type="checkbox" data-flon="'+f.id+'"'+(on?' checked':'')+'><span></span></label>'
    +'<div class="fln"><b>'+esc(f.label)+'</b><i>'+esc(f.desc)+'</i>'+(f.custom?'<button type="button" class="nfdel" data-nfdel="'+f.id+'">Delete this flag</button>':'')+'</div>'
    +'<div class="fllim">'+f.pm.map(function(q){return '<label>'+esc(q.l)+'<span><input type="number" data-flp="'+f.id+'.'+q.k+'" step="'+q.step+'" min="0"'+(q.max?' max="'+q.max+'"':'')+' value="'+flv(f.id,q.k)+'"'+(on?'':' disabled')+'>'+(q.u?'<em>'+esc(q.u)+'</em>':'')+'</span></label>'}).join("")+'</div>'+cnt+'</div>'+(open?xDrill(f,L,p):'')+'</div>';
}
excTab=function(c){
  flSync();var p=c.pv,FC=flCompute(p),uniq={},tot=0,gc={};
  GRP.forEach(function(g){gc[g]=0});
  FLAGS.forEach(function(f){if(!flOn(f.id))return;(FC[f.id]||[]).forEach(function(x){uniq[x.e.empId]=1});tot+=(FC[f.id]||[]).length;gc[f.grp]=(gc[f.grp]||0)+(FC[f.id]||[]).length});
  var tab=S.exTab||"Pay";if(tab!=="cfg"&&GRP.indexOf(tab)<0)tab="Pay";
  var h='<div class="wi wp ex-t"><div class="exh"><div><b>'+Object.keys(uniq).length+'</b> people flagged · '+tot+' flag'+(tot===1?'':'s')+'</div>'
    +'<div class="exa"><button type="button" class="pvq" id="flCsv">⬇ Download Flagged</button></div></div>'
    +'<div class="xtabs">'+GRP.map(function(g){return '<button type="button" data-xt="'+g+'" class="'+(tab===g?'on':'')+'">'+g+'<i>'+gc[g]+'</i></button>'}).join("")+'<button type="button" data-xt="cfg" class="xcfg'+(tab==="cfg"?' on':'')+'">Config</button></div>';
  if(tab==="cfg"){
    h+='<div class="nf"><b>+ New Flag</b><select id="nfField">'+CF_FIELDS.map(function(x){return '<option value="'+x[0]+'">'+x[1]+'</option>'}).join("")+'</select>'
      +'<select id="nfOp">'+CF_OPS.map(function(x){return '<option value="'+x[0]+'">'+x[1]+'</option>'}).join("")+'</select>'
      +'<input type="number" id="nfA" step="any" placeholder="limit"><input type="number" id="nfB" step="any" placeholder="to" style="display:none">'
      +'<input type="text" id="nfName" placeholder="Name"><select id="nfGrp">'+GRP.map(function(g){return '<option>'+g+'</option>'}).join("")+'</select><button type="button" class="btn pri" id="nfSave">Save</button></div>'
      +'<div class="wm" style="margin:0 0 6px">Switch flags on or off and set their limits. These settings are yours; they do not change anything for other users.<button type="button" class="pvq" id="flReset" style="margin-left:8px">Reset Limits</button></div>';
    GRP.forEach(function(g){var fs=FLAGS.filter(function(f){return f.grp===g});if(fs.length)h+='<div class="xgh">'+g+'</div>'+fs.map(function(f){return xRow(f,FC,p,true)}).join("")});
  }else{
    var fs=FLAGS.filter(function(f){return f.grp===tab&&flOn(f.id)});
    h+=fs.length?fs.map(function(f){return xRow(f,FC,p,false)}).join(""):'<div class="wm">No flags are on in this group. Switch some on in Config.</div>';
    h+='<div class="wm" style="margin-top:8px">'+(p?'Counts use your limits and the values after your preview.':'Showing current values. Click Preview to include your change.')+' Change limits in Config.</div>';
  }
  return h+'</div>';
};
$("imp").addEventListener("click",function(ev){
  if(ev.target.id==="flReset"){ev.stopImmediatePropagation();FLS.on={};FLS.v={};flSave();renderImpact()}
},true);
$("imp").addEventListener("click",function(ev){
  var t=ev.target.closest&&ev.target.closest("[data-xt],#nfSave,[data-nfdel]");if(!t)return;
  if(t.getAttribute("data-xt")){S.exTab=t.getAttribute("data-xt");renderImpact();return}
  if(t.getAttribute("data-nfdel")){var id=t.getAttribute("data-nfdel");FLS.custom=FLS.custom.filter(function(c){return c.id!==id});delete FLS.on[id];flSave();renderImpact();return}
  if(t.id==="nfSave"){
    var nm=$("nfName").value.trim(),a=parseFloat($("nfA").value),op=$("nfOp").value,b=parseFloat($("nfB").value);
    $("nfName").classList.toggle("err",!nm);$("nfA").classList.toggle("err",isNaN(a));$("nfB").classList.toggle("err",op==="bt"&&isNaN(b));
    if(!nm||isNaN(a)||(op==="bt"&&isNaN(b)))return;
    var c={id:"c"+Date.now(),label:nm,grp:$("nfGrp").value,field:$("nfField").value,op:op,a:a,b:op==="bt"?b:null};
    FLS.custom.push(c);addCustom(c);FLS.on[c.id]=true;flSave();S.exTab="cfg";renderImpact()}
});
$("imp").addEventListener("change",function(ev){if(ev.target.id==="nfOp"){var b=$("nfB");if(b)b.style.display=ev.target.value==="bt"?"":"none"}});

/* ===== v50: workspace. Same elements and handlers as v48, moved into panes; nothing else changed ===== */
(function(){
  var K="bulkWs_v52",st={lw:440,rw:290,lc:false,rc:false,lt:"rules",hid:[]},ct="emp";
  try{var s=JSON.parse(localStorage.getItem(K)||"null");if(s)for(var k in s)st[k]=s[k]}catch(x){}
  function save(){try{localStorage.setItem(K,JSON.stringify(st))}catch(x){}}
  function mk(tag,id,cls,html){var e=document.createElement(tag);if(id)e.id=id;if(cls)e.className=cls;if(html!=null)e.innerHTML=html;return e}
  var rc=$("ruleCard"),head=rc.querySelector(".card-h"),two=rc.querySelector(".two"),colL=two.querySelector(".colL"),colR=two.querySelector(".colR");
  var actRow=$("actRow"),scnForm=$("scnForm"),metPanel=$("metPanel"),scnCard=$("scnCard"),mpTabs=$("mpTabs"),lyTog=$("lyTog"),gridCard=root.querySelector(".grid-card");
  var ws=mk("div","ws");
  head.classList.add("wshead");ws.appendChild(head);
  /* left: inputs */
  var pl=mk("section","pL","pane"),lt=mk("div","lTabs","ptabs",'<button type="button" data-p="rules">What to Change</button><button type="button" data-p="who">For Whom</button><span class="sp"></span><button type="button" class="pfold" id="lFold" title="Fold This Pane">‹</button>'),lb=mk("div","lBody","pbody"),lf=mk("div","lFoot","pfoot");
  if(scnForm)lb.appendChild(scnForm);
  lb.appendChild(two);
  lf.appendChild(colR.querySelector("label.opt"));lf.appendChild(actRow);
  pl.appendChild(lt);pl.appendChild(lb);pl.appendChild(lf);
  pl.appendChild(mk("button",null,"pexp","Inputs ›")).onclick=function(){st.lc=false;apply()};
  pl.appendChild(mk("div",null,"pgrip"));
  /* centre: results + Employees + Scenarios as tabs */
  var pc=mk("section","pC","pane");metPanel.appendChild(gridCard);metPanel.appendChild(scnCard);pc.appendChild(metPanel);
  /* right: Before / After list */
  var pr=mk("aside","pR","pane"),rt=mk("div",null,"ptabs",'<span class="ptitle">Before / After</span><span class="sp"></span><button type="button" class="pfold" id="rFold" title="Fold This Pane">›</button>'),rb=mk("div","watch","pbody");rb.style.padding="0";
  pr.appendChild(rt);pr.appendChild(rb);
  pr.appendChild(mk("button",null,"pexp","‹ Before / After")).onclick=function(){st.rc=false;apply()};
  pr.appendChild(mk("div",null,"pgrip"));
  ws.appendChild(pl);ws.appendChild(pc);ws.appendChild(pr);
  $("mainCol").appendChild(ws);
  /* state -> screen */
  function apply(){
    ws.style.setProperty("--lw",(st.lc?40:320)+"px");ws.style.setProperty("--rw",(st.rc?40:290)+"px");
    ws.classList.toggle("lc",st.lc);ws.classList.toggle("rc",st.rc);pl.classList.toggle("fold",st.lc);pr.classList.toggle("fold",st.rc);
    colL.classList.toggle("pgoff",st.lt!=="rules");colR.classList.toggle("pgoff",st.lt!=="who");
    [].forEach.call(lt.querySelectorAll("[data-p]"),function(b){b.classList.toggle("on",b.getAttribute("data-p")===st.lt)});
    root.setAttribute("data-ct",ct);
    [].forEach.call(mpTabs.querySelectorAll("[data-x]"),function(b){b.classList.toggle("on",b.getAttribute("data-x")===ct)});
    if(ct!=="res")[].forEach.call(mpTabs.querySelectorAll("[data-t]"),function(b){b.classList.remove("on")});
    else[].forEach.call(mpTabs.querySelectorAll("[data-t]"),function(b){b.classList.toggle("on",b.getAttribute("data-t")===PT)});
    if(ct==="scn")scnCard.classList.remove("hide");
    [].forEach.call(mpTabs.querySelectorAll("[data-t],[data-x]"),function(b){var t=b.getAttribute("data-t")||b.getAttribute("data-x");b.classList.toggle("tabhid",st.hid.indexOf(t)>=0)});
    save();
  }
  lt.addEventListener("click",function(ev){var p=ev.target.getAttribute&&ev.target.getAttribute("data-p");if(p){st.lt=p;apply()}});
  $("lFold").onclick=function(){st.lc=true;apply()};$("rFold").onclick=function(){st.rc=true;apply()};
  /* centre tabs: Employees and Scenarios sit with the result tabs */
  var tEmp=mk("button",null,null,"Employees"),tScn=mk("button",null,null,"Scenarios");
  tEmp.type="button";tEmp.setAttribute("data-x","emp");tScn.type="button";tScn.setAttribute("data-x","scn");
  mpTabs.insertBefore(tEmp,mpTabs.firstChild);mpTabs.insertBefore(tScn,lyTog);
  /* "+" chooses which tabs show */
  var plus=mk("button","tabPlus","tplus","＋");plus.type="button";plus.title="Choose the tabs shown in this pane";
  mpTabs.insertBefore(plus,lyTog);
  mpTabs.addEventListener("click",function(ev){
    var x=ev.target.getAttribute&&ev.target.getAttribute("data-x"),t=ev.target.getAttribute&&ev.target.getAttribute("data-t");
    if(x){ct=x;apply()}else if(t&&ct!=="res"){ct="res";apply()}});
  var _sp=setPT;setPT=function(t){_sp(t);if(ct!=="res"){ct="res";apply()}};
  $("bScnOpen").addEventListener("click",function(){ct="scn";apply()});
  new MutationObserver(function(){if(!scnCard.classList.contains("hide")&&ct==="res"){ct="scn";apply()}}).observe(scnCard,{attributes:true,attributeFilter:["class"]});
  var menu=mk("div","tabMenu","tmenu");pc.appendChild(menu);
  function menuFill(){
    var h='<div class="th">Tabs in This Pane</div>';
    [].forEach.call(mpTabs.querySelectorAll("[data-t],[data-x]"),function(b){var t=b.getAttribute("data-t")||b.getAttribute("data-x"),lock=t==="summary";
      h+='<label><input type="checkbox" data-tt="'+t+'"'+(st.hid.indexOf(t)<0?" checked":"")+(lock?" disabled":"")+'>'+b.textContent.replace("‹ ","")+'</label>'});
    menu.innerHTML=h}
  plus.addEventListener("click",function(ev){ev.stopPropagation();menuFill();var r=plus.getBoundingClientRect(),p=pc.getBoundingClientRect();menu.style.left=Math.max(4,r.left-p.left-120)+"px";menu.style.top=(r.bottom-p.top+4)+"px";menu.classList.toggle("on")});
  menu.addEventListener("click",function(ev){ev.stopPropagation();var t=ev.target.getAttribute&&ev.target.getAttribute("data-tt");if(!t)return;
    var i=st.hid.indexOf(t);if(ev.target.checked){if(i>=0)st.hid.splice(i,1)}else if(i<0)st.hid.push(t);
    if(st.hid.indexOf(PT)>=0)setPT("summary");if(st.hid.indexOf(ct)>=0)ct="res";apply()});
  onDoc("click",function(){menu.classList.remove("on")});
  /* drag the pane edges */
  function grip(g,get,set){g.addEventListener("mousedown",function(ev){ev.preventDefault();var x0=ev.clientX,v0=get();g.classList.add("drag");
    function mv(e){set(v0,e.clientX-x0);apply()}
    function up(){g.classList.remove("drag");offDoc("mousemove",mv);offDoc("mouseup",up)}
    onDoc("mousemove",mv);onDoc("mouseup",up)})}
  grip(pl.querySelector(".pgrip"),function(){return st.lw},function(v,d){st.lw=Math.max(300,Math.min(760,v+d))});
  grip(pr.querySelector(".pgrip"),function(){return st.rw},function(v,d){st.rw=Math.max(240,Math.min(460,v-d))});
  /* right pane: before / after, like a watchlist */
  function pc1(a,b){return a.toFixed(1)+"%"}
  function dl(a,b,pp){var d=b-a;if(Math.abs(d)<0.005)return '<small class="nu">0.0'+(pp?' pp':'%')+'</small>';
    var t=pp?(d>0?"+":"")+d.toFixed(1)+" pp":(a?(d>0?"+":"")+(d/a*100).toFixed(1)+"%":"");
    return '<small class="'+(d>0?"up":"dn")+'">'+t+'</small>'}
  function row(l,sub,bv,av,delta){return '<div class="wr"><span class="wl">'+l+(sub?'<small>'+sub+'</small>':'')+'</span><span class="wb">'+bv+'</span><span class="wa">'+av+(delta||"")+'</span></div>'}
  function renderWatch(){
    var w=$("watch");if(!w)return;
    var sc=scope();
    if(S.loading||!sc.length){w.innerHTML='<div class="wempty">No rows in view.</div>';return}
    var p=S.pv,b0=p?p.before:budgetOf(sc,null),b1=p?p.after:budgetOf(sc,null),h='<div class="wh"><span>Metric</span><span>Before</span><span>After</span></div>';
    h+=row("Budget Utilised","of "+big(b1.budget),pc1(b0.util),pc1(b1.util),dl(b0.util,b1.util,true));
    var vv=viewRows().filter(function(e){var r=p&&p.res[e.empId];return !r||r.st!=="off"}),sn=0,s0=0,s1=0;
    vv.forEach(function(e){var r=p&&p.res[e.empId],a=r&&r.st==="chg"?r.after.hikeAmt:e.hikeAmt;sn++;s0+=e.hikeAmt/e.basePay*100;s1+=a/e.basePay*100});
    if(sn)h+=row("Average Hike","per person",pc1(s0/sn),pc1(s1/sn),dl(s0/sn,s1/sn,true));
    h+=row("Budget Used","",big(b0.used),big(b1.used),dl(b0.used,b1.used,false));
    h+=row("Budget Left","",big(b0.left),big(b1.left),dl(b0.left,b1.left,false));
    if(p){
      h+=row("Total Hike","",big(p.hike.before),big(p.hike.after),dl(p.hike.before,p.hike.after,false));
      h+=row("People Affected","of "+sc.length+" in view","—",String(p.n.chg),"");
      h+=row("Skipped","edited manually","—",String(p.n.skip),"");
      h+=row("Left Out","not in filter","—",String(p.n.off),"");
    }else h+='<div class="wempty">Choose a rule and click Preview to see the change.</div>';
    if(b1.left<0)h+='<div class="wnote">Over Budget by '+big(-b1.left)+' · warning only</div>';
    w.innerHTML=h;
  }
  var _rib=renderImpactBar;renderImpactBar=function(){_rib();renderWatch()};
  apply();renderWatch();
})();


var _renderHost=render;
render=function(){_renderHost();updateBusy();if(cfg.onBudget){try{cfg.onBudget(budgetOf(scope(),null),{loading:S.loading})}catch(x){}}};
PUBLIC_API.refresh=function(){SC_VER++;syncBatches(false);if(S.pv)refreshPreview();else render();renderFilters()};
PUBLIC_API.destroy=function(){
  if(busyEl&&busyEl.parentNode)busyEl.parentNode.removeChild(busyEl);
  clearTimeout(confirmT);
  __docL.forEach(function(a){document.removeEventListener(a[0],a[1],a[2])});
  __winL.forEach(function(a){window.removeEventListener(a[0],a[1],a[2])});
  __docL.length=0;__winL.length=0;
  var t=root.querySelector(".htip");if(t&&t.parentNode)t.parentNode.removeChild(t);
  cfg={};
};
render();
return PUBLIC_API;

}