/**
 * BulkOperations.jsx — React port of "Bulk Operations v27" (Compensation Management).
 *
 * USAGE
 *   import BulkOperations from "./BulkOperations";
 *   <BulkOperations apiUrl="/server/appraisalapi" cycle={{ id: "CYC_1", name: "Apr-26", location: "Pune" }} />
 *
 * PROPS
 *   apiUrl   string  ""  -> demo data (36 fake employees, runs standalone).
 *                    "/server/appraisalapi" -> reads GET /rows /budget /audit /settings /batches and
 *                    saves with POST /cells (source "bulk" / "bulk_restore"), same contract as the HTML file.
 *   cycle    {id,name,location}  the active cycle. Change it and the screen reloads.
 *   height   CSS height of the screen (default "100vh"; use "100%" inside a sized parent).
 *   onApplied(batch)  optional, called after a successful Apply.
 *   ref      exposes { reload(), dirty() }  (dirty = a preview is open).
 *
 * NOTES
 *   - Styles are injected by the component, scoped under .bo using native CSS nesting
 *     (Chrome 120+, Safari 17.2+, Firefox 117+). The embedded Manrope font file from the HTML is NOT included:
 *     add Manrope to your app (Google Fonts / @fontsource) or it falls back to Segoe UI / Arial.
 *   - Excel export loads SheetJS from cdnjs on first use (same as the HTML). Swap for `import * as XLSX from "xlsx"` if you prefer.
 */
import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useLayoutEffect,
  forwardRef,
  useImperativeHandle,
} from "react";

/* ============================== styles ============================== */
const CSS = `
.bo{
  --font:"Manrope","Segoe UI",Arial,sans-serif;
  --ink:#111827;--muted:#6B7280;--navy:#102A43;--link:#1559A6;
  --page:#F3F4F6;--gutter:#D5DFEB;--card:#fff;--line:#E5E7EB;
  --info-strip:#DCEBFF;--info-border:#B9D3F5;
  --th-bg:#E6EEF8;--th-ink:#102A43;--th-line:#C9D8EC;
  --row-odd:#FBFCFE;--row-even:#F2F5F9;--row-hover:#EAF2FF;
  --rowlabel-bg:#EEF3FA;--totals-bg:#E6EEF8;
  --input-border:#D1D5DB;--edited-border:#4FA38F;--error:#C0392B;
  --btn-main:#2F6FED;--btn-add:#CBD2DA;
  --ok:#15803D;--ok-bg:#ECFDF3;--warn:#B7791F;--warn-bg:#FEF6E7;--info:#1D4FA8;--info-bg:#DCEBFF;--grey:#6B7280;--grey-bg:#F3F4F6;
  box-sizing:border-box;margin:0;font-family:var(--font);font-size:12.5px;color:var(--ink);background:var(--page);
  display:flex;flex-direction:column;height:var(--bo-h,100vh);overflow:hidden;position:relative;

  & *{box-sizing:border-box}
  .topbar{height:52px;flex:0 0 auto;background:var(--navy);color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 18px}
  .tb-l{display:flex;align-items:center}
  .title{font-size:17px;font-weight:800}
  .cycle{font-size:12px;color:#AAB4C0;margin-left:14px;padding-left:14px;border-left:1px solid rgba(255,255,255,.25)}
  .tb-r{display:flex;align-items:center;gap:20px}
  .tk{text-align:right;border-left:1px solid rgba(255,255,255,.25);padding-left:18px}
  .tk span{display:block;font-size:10.5px;color:#AAB4C0}
  .tk strong{font-size:15px;font-weight:800}
  .tk strong.warn{color:#FFCF70}.tk strong.danger{color:#FF9A8A}
  .tk small{font-size:10.5px;color:#AAB4C0;font-weight:600}
  .sp{flex:1}
  .badge{font-size:10.5px;font-weight:800;border-radius:10px;padding:2px 9px;background:var(--ok-bg);color:var(--ok)}
  select,input[type=text],input[type=number]{font-family:inherit;font-size:12.5px;border:1px solid var(--input-border);border-radius:6px;background:#fff;color:var(--ink);padding:6px 8px;height:30px}
  select:focus,input:focus{outline:2px solid #9DBDEB;outline-offset:0}
  select:disabled{background:#F3F4F6;color:var(--muted)}
  .err{border-color:var(--error)!important}
  .work{flex:1;overflow:hidden;background:var(--gutter);border-radius:14px;margin:10px;padding:10px;display:flex;flex-direction:row;gap:10px;min-height:0;position:relative}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px}
  .card-h{display:flex;align-items:center;gap:10px;padding:12px 16px 10px;border-bottom:1px solid var(--line)}
  .card-h h2{margin:0;font-size:16px;font-weight:800;color:var(--navy)}
  .card-h .note{font-size:11.5px;color:var(--muted)}
  .card-b{padding:12px 16px 14px}
  .chip-sec{display:inline-block;background:var(--navy);color:#fff;border:1px solid var(--navy);border-radius:12px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;padding:3px 11px;margin-bottom:8px}
  .grad{height:9px;border-radius:5px;margin:12px 0;background:linear-gradient(90deg,#A8E6C3,#86D3D6,#9DBDEB,#BFAEE2)}
  .f{display:flex;flex-direction:column;gap:3px}
  .f>label{font-size:9.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted);white-space:nowrap}
  .f .unit{font-size:11.5px;color:var(--muted);padding:7px 0}
  .btn{font-family:inherit;font-size:12.5px;font-weight:700;border-radius:6px;height:32px;padding:0 14px;cursor:pointer;border:1px solid var(--input-border);background:#fff;color:var(--ink)}
  .btn:hover:not(:disabled){background:#F3F4F6}
  .btn.pri{background:var(--navy);color:#fff;border-color:var(--navy)}
  .btn.pri:hover:not(:disabled){background:#1B3B5C}
  .btn.main{background:var(--btn-main);border-color:var(--btn-main);color:#fff;text-transform:uppercase;font-weight:800;letter-spacing:.03em}
  .btn.main:hover:not(:disabled){background:#2560D6}
  .btn.add{border:1px dashed var(--btn-add);color:var(--muted);margin-top:0}
  .btn:disabled{opacity:.45;cursor:not-allowed}
  .btn.main.confirm{background:#B7791F;border-color:#B7791F;text-transform:none;letter-spacing:0}
  .btn.lnk{border:0;background:none;color:var(--link);height:28px;padding:0 4px}
  .btn.lnk:hover:not(:disabled){background:none;text-decoration:underline}
  .strip{border-radius:10px;padding:6px 12px;font-size:12px;display:flex;gap:14px;align-items:center;flex-wrap:wrap}
  .strip.info{background:var(--info-strip);border:1px solid var(--info-border);color:var(--navy)}
  .strip.warn{background:var(--warn-bg);border:1px solid #F0DDB0;color:var(--warn)}
  .strip.ok{background:var(--ok-bg);border:1px solid #BFE5CB;color:var(--ok)}
  .strip b{font-weight:800}
  .tag{display:inline-block;font-size:10.5px;font-weight:700;border-radius:5px;padding:2px 7px;margin-right:4px;white-space:nowrap}
  .t-ok{background:var(--ok-bg);color:var(--ok)}.t-warn{background:var(--warn-bg);color:var(--warn)}.t-info{background:var(--info-bg);color:var(--info)}.t-grey{background:var(--grey-bg);color:var(--grey)}
  .grid-card{display:flex;flex-direction:column;min-height:220px;flex:1}
  .gw{overflow:auto;flex:1;min-height:0;border-radius:12px 12px 0 0}
  table{border-collapse:separate;border-spacing:0;table-layout:fixed}
  td,th{overflow:hidden}
  td:not(.wrap){text-overflow:ellipsis}
  td.wrap{overflow-wrap:break-word;word-break:normal;white-space:normal}
  td.r.wrap{white-space:nowrap}
  th{position:sticky;top:0;z-index:3;background:var(--th-bg);color:var(--th-ink);border-bottom:1px solid var(--th-line);border-right:1px solid var(--th-line);font-size:11px;font-weight:700;text-align:left;padding:7px 8px;vertical-align:bottom;white-space:normal;line-height:1.25;cursor:pointer;user-select:none}
  th.nosort{cursor:default}
  th .th-inner{display:flex;justify-content:space-between;align-items:flex-end;gap:4px}
  .filter-btn{border:0;background:transparent;color:#5b6b82;font-size:11px;padding:2px 4px;border-radius:3px;cursor:pointer;line-height:1;flex:none}
  .filter-btn:hover{background:#d3ddea}.filter-btn.active{background:#c7d6ea;color:#17365d}
  .filter-btn.filtered{color:#17365d}.filter-btn.filtered::after{content:"";display:inline-block;width:5px;height:5px;border-radius:50%;background:#c9a400;margin-left:2px;vertical-align:top}
  .filter-pop{position:fixed;z-index:60;background:#fff;border:1px solid #c7d0dc;border-radius:6px;box-shadow:0 6px 18px rgba(20,30,50,.18);width:270px;font-size:11.5px;color:#111827;text-align:left;font-weight:400}
  .filter-sort-row{display:flex;gap:2px;padding:4px;border-bottom:1px solid #edf0f4}
  .filter-sort-row button{flex:1;border:0;background:transparent;padding:4px;border-radius:4px;cursor:pointer;font:inherit;color:#374151}.filter-sort-row button:hover{background:#eef2f7}
  .filter-cond-row{display:flex;gap:4px;padding:6px 8px;align-items:center;flex-wrap:wrap}
  .filter-cond-row select,.filter-cond-row input,.filter-search-row input{height:26px;border:1px solid #9CA3AF;border-radius:5px;padding:0 6px;font:inherit;font-size:11.5px;background:#fff}
  .filter-cond-row select{width:96px}.filter-cond-row input{width:60px}.filter-cond-row .cond-and{font-size:10px;color:#6B7280}
  .filter-cond-row button{height:26px;border:1px solid #17365d;background:#17365d;color:#fff;border-radius:5px;padding:0 7px;font:inherit;font-size:11px;white-space:nowrap;cursor:pointer}
  .filter-divider{text-align:center;font-size:9.5px;color:#9aa5b3;text-transform:uppercase;padding:4px 8px 2px;border-top:1px solid #edf0f4}
  .filter-search-row{padding:5px 8px;border-bottom:1px solid #edf0f4}.filter-search-row input{width:100%}
  .filter-pop label{display:flex;gap:7px;align-items:center;padding:2px 6px;line-height:16px;cursor:pointer;white-space:nowrap}
  .filter-pop input[type=checkbox]{height:13px;width:13px;margin:0;padding:0}
  .filter-wrap-row{padding:3px 6px;border-bottom:1px solid #edf0f4}
  .filter-select-all{padding:3px 6px;border-bottom:1px solid #edf0f4;font-weight:600}
  .filter-values{max-height:150px;overflow:auto;padding:2px}.filter-values .none{padding:6px 8px;color:#9aa5b3}
  .filter-actions{display:flex;gap:6px;padding:5px 8px;border-top:1px solid #edf0f4}
  .filter-actions button{flex:1;height:26px;border-radius:5px;border:1px solid #cbd3df;background:#fff;font:inherit;cursor:pointer}
  .filter-actions .fa-ap{background:#17365d;color:#fff;border-color:#17365d}.filter-actions .fa-cl{color:#a5432f;border-color:#e7c9c3}
  th.r,td.r{text-align:right}
  td{padding:6px 8px;vertical-align:middle;border-bottom:1px solid #F0F1F3;white-space:nowrap;font-variant-numeric:tabular-nums}
  tbody tr:nth-child(odd) td{background:var(--row-odd)}
  tbody tr:nth-child(even) td{background:var(--row-even)}
  tbody tr:hover td{background:var(--row-hover)}
  th.c1,td.c1{position:sticky;left:0;z-index:2;box-sizing:border-box;border-right:1px solid var(--th-line)}
  td.c1 .dsg{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}td.c1.wrap .dsg{white-space:normal}
  .col-rs{position:absolute;top:0;right:0;bottom:0;width:6px;cursor:col-resize;z-index:6}.col-rs:hover,.col-rs.on{background:rgba(23,54,93,.28)}
  th.c1{z-index:5;background:#DFE8F3}
  td.c1{background:var(--rowlabel-bg)!important;color:var(--navy);font-weight:700}
  td.c1 .emp{display:flex;align-items:flex-start;gap:6px}td.c1 .emp input{flex:none;margin:2px 0 0}td.c1 .emp .eb{flex:none;margin:0;align-self:center}
  td.c1 .et{min-width:0;flex:1;display:block}td.c1 .en{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}td.c1.wrap .en{white-space:normal;overflow-wrap:break-word}
  td.c1 .dsg{display:block;font-weight:600;color:var(--muted)}
  td.c1 .eb{display:inline-block;width:4px;height:14px;background:var(--edited-border);border-radius:2px;margin-right:6px;vertical-align:-2px}
  td.c1 .eb.none{background:transparent}
  tbody tr:hover td.c1{background:var(--row-hover)!important}
  td.pc{background:var(--info-bg)!important;color:var(--info);font-weight:800}
  td.pc.same{background:inherit!important;color:var(--muted);font-weight:600}
  .up{color:var(--ok);font-weight:700}.dn{color:var(--error);font-weight:700}
  tfoot td{position:sticky;bottom:0;z-index:3;background:var(--totals-bg)!important;color:var(--navy);font-weight:800;border-top:1px solid var(--th-line)}
  tfoot td.c1{z-index:5}
  .pager{display:flex;align-items:center;gap:10px;padding:8px 14px;border-top:1px solid var(--line);font-size:12px;color:var(--muted)}
  .pager .btn{height:28px;padding:0 10px}
  .sort::after{content:" ↕";color:#8DA2BC;font-weight:400}
  .sort.asc::after{content:" ▲";color:var(--navy);font-size:9px}
  .sort.desc::after{content:" ▼";color:var(--navy);font-size:9px}
  .scn table{width:100%}
  .scn th{position:static;cursor:default}
  .scn td{white-space:normal}
  .scn h3{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--muted);margin:0 0 6px;background:#FAFAFB;padding:6px 10px;border-radius:6px}
  .two{display:grid;grid-template-columns:minmax(0,1.7fr) minmax(0,1fr);gap:0 14px}
  .colR{background:none;border:0;border-left:1px solid var(--line);border-radius:0;padding:0 0 0 14px}
  .colL .btn.add{margin-top:0}
  .rrow{background:#FAFAFB;border:1px solid var(--line);border-left:4px solid #27548A;border-radius:8px;display:flex;flex-wrap:wrap;position:relative;align-items:flex-end;gap:6px 8px;padding:6px 40px 6px 8px;margin-bottom:5px}
  .rrow .f{flex:0 0 auto;gap:2px}
  .rrow .mini{display:none}
  .rrow select[data-k="field"]{width:172px}.rrow select[data-k="method"]{width:128px}
  .rrow select[data-k="hikeUnit"],.rrow select[data-k="unit"]{width:112px}
  .rrow input[data-k]{width:80px!important}
  .rrow .f .unit{padding:5px 0;white-space:nowrap;font-size:11.5px}
  .rrow .xbtn{height:26px;width:26px;padding:0;font-size:14px;color:var(--muted);position:absolute;right:8px;top:50%;margin-top:2px;transform:translateY(-50%)}
  .rnote{font-size:10.5px;color:var(--muted);margin:5px 0 0;line-height:1.35}
  .mini{font-size:11px;color:var(--muted)}
  #topWrap{display:flex;flex-direction:column;gap:12px;flex:0 0 auto;max-height:72vh;overflow:auto;transition:max-height .25s ease,opacity .2s ease}
  #cardsWrap{display:flex;flex-direction:column;gap:12px;flex:0 0 auto;overflow:hidden;transition:max-height .25s ease,opacity .2s ease}
  &.folded #topWrap,&.folded #cardsWrap{max-height:0;opacity:0;overflow:hidden;margin-bottom:-12px}
  #ruleCard .card-h{padding:7px 12px}#ruleCard .card-h h2{font-size:14px}
  #ruleCard .card-b{padding:8px 12px 10px}
  #ruleCard .btn{height:26px;padding:0 10px;font-size:11.5px}
  #ruleCard select,#ruleCard input[type=text],#ruleCard input[type=number]{height:26px;font-size:11.5px;padding:3px 6px}
  #ruleCard .sec{margin-bottom:6px;gap:6px}#ruleCard .sec .n{width:17px;height:17px;font-size:10px}#ruleCard .sec b{font-size:10px}
  .sec{display:flex;align-items:center;gap:8px;margin-bottom:10px}
  .sec .n{width:20px;height:20px;border-radius:50%;background:var(--navy);color:#fff;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center}
  .sec b{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.07em;color:var(--navy)}
  .sec .hint{font-size:11.5px;color:var(--muted);margin-left:auto}
  #fbSearch{display:block;position:relative}
  #fbSearch::before{content:"⌕";position:absolute;left:10px;top:3px;color:var(--muted);font-size:14px}
  #fbSearch input{width:100%;padding-left:30px}
  .chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px;align-items:center}
  .fchip{display:inline-flex;align-items:center;background:var(--th-bg);border:1px solid var(--th-line);border-radius:16px;height:24px;color:var(--navy);font-size:11.5px}
  .fchip button{font-family:inherit;border:0;background:none;cursor:pointer;color:inherit;height:22px}
  .fchip .fc-b{padding:0 6px 0 12px;font-weight:600;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:inline-flex;gap:4px}
  .fchip .fc-b b{font-weight:800}
  .fchip .fc-x{padding:0 10px 0 4px;color:var(--muted)}
  .fchip .fc-x:hover{color:var(--error)}
  .fchip.has{background:#fff;border-color:var(--btn-main)}
  .addf{display:inline-flex;align-items:center;gap:4px;height:24px;border:1px dashed #CBD2DA;border-radius:16px;padding:0 12px;font-family:inherit;font-size:11.5px;font-weight:700;color:var(--link);background:#fff;cursor:pointer}
  .addf:disabled{opacity:.45;cursor:not-allowed}
  .res{margin-top:8px;display:flex;align-items:center;gap:12px;background:#FAFAFB;border:1px solid var(--line);border-radius:10px;padding:4px 10px}
  .res .cnt{display:flex;align-items:baseline;gap:4px;white-space:nowrap}
  .res .big{font-size:17px;font-weight:800;color:var(--navy);line-height:1}
  .res small{font-size:12px;font-weight:600;color:var(--muted)}
  .res .meter{flex:1;height:6px;border-radius:5px;background:#E5E7EB;overflow:hidden}
  .res .meter i{display:block;height:100%;width:0;background:#2F6FED;border-radius:5px;transition:width .2s}
  .opt{display:flex;align-items:center;gap:8px;margin-top:8px;font-size:11.5px;font-weight:600;cursor:pointer}
  .opt input{position:absolute;opacity:0;width:0;height:0}
  .opt .sw{width:30px;height:17px;border-radius:9px;background:#D1D5DB;position:relative;flex:0 0 auto;transition:background .15s}
  .opt .sw::after{content:"";position:absolute;left:2px;top:2px;width:13px;height:13px;border-radius:50%;background:#fff;transition:left .15s}
  .opt input:checked+.sw{background:var(--navy)}
  .opt input:checked+.sw::after{left:15px}
  .opt input:focus-visible+.sw{outline:2px solid #9DBDEB}
  .more{position:relative}
  .menu{position:absolute;right:0;top:36px;background:#fff;border:1px solid var(--th-line);border-radius:10px;box-shadow:0 8px 24px rgba(16,42,67,.18);padding:6px;min-width:200px;z-index:30;display:none}
  .menu.on{display:block}
  .menu button{display:block;width:100%;text-align:left;font-family:inherit;font-size:12.5px;font-weight:600;padding:7px 10px;border:0;background:none;border-radius:6px;cursor:pointer;color:var(--ink)}
  .menu button:hover:not(:disabled){background:var(--row-hover)}
  .menu button:disabled{opacity:.45;cursor:not-allowed}
  .menu hr{border:0;border-top:1px solid var(--line);margin:4px 0}
  .pop{position:fixed;z-index:50;background:#fff;border:1px solid var(--th-line);border-radius:10px;box-shadow:0 8px 24px rgba(16,42,67,.18);padding:8px;min-width:220px;max-width:300px}
  .pop h4{margin:2px 4px 6px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
  .pop .lst{max-height:240px;overflow:auto}
  .pop label,.pop .it{display:flex;align-items:center;gap:8px;padding:5px 6px;border-radius:6px;font-size:12.5px;cursor:pointer;width:100%;border:0;background:none;font-family:inherit;text-align:left;color:var(--ink)}
  .pop label:hover,.pop .it:hover{background:var(--row-hover)}
  .pop .n{margin-left:auto;color:var(--muted);font-size:11px}
  .pop .ft{display:flex;gap:6px;justify-content:space-between;margin-top:6px;border-top:1px solid var(--line);padding-top:6px}
  .fold{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--line);border-left:5px solid #2F6FED;border-radius:12px;padding:7px 12px;flex:0 0 auto;font-size:12px;flex-wrap:wrap}
  .fold .t{color:var(--muted)}.fold .t b{color:var(--navy)}
  .fold .bud{font-weight:800;color:var(--navy)}
  .fold .bud small{font-weight:600;color:var(--muted)}
  .hide{display:none!important}
  .ic{background:#fff;border:1px solid var(--line);border-left:5px solid #2F6FED;border-radius:12px;padding:11px 14px 12px;min-width:0}
  .ic.red{border-left-color:#C0392B}.ic.red .tg{color:#C0392B}.ic.green{border-left-color:#22A06B}.ic.amber{border-left-color:#B7791F}.ic.violet{border-left-color:#5B3FB0}
  .ic .tg{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--info)}
  .ic.green .tg{color:var(--ok)}.ic.amber .tg{color:var(--warn)}.ic.violet .tg{color:#5B3FB0}
  .ic .bn{font-size:20px;font-weight:800;color:var(--navy);margin:3px 0 1px;white-space:nowrap}
  .ic .bn small{font-size:11.5px;font-weight:600;color:var(--muted);margin-left:4px}
  .ic .sb{font-size:11.5px;color:var(--muted);line-height:1.4}
  .ic .sb b{color:var(--navy)}
  .bar{position:relative;height:9px;border-radius:5px;background:#E5E7EB;margin:8px 0 6px;overflow:hidden}
  .bar i{position:absolute;left:0;top:0;bottom:0;border-radius:5px}
  .bar .af{background:#27548A}.bar .bf{background:#9DBDEB;z-index:2}
  .impbar{display:flex;align-items:center;gap:16px;background:#fff;border:1px solid var(--line);border-left:5px solid #2F6FED;border-radius:12px;padding:0 12px;height:30px;font-size:12px;flex:0 0 auto;white-space:nowrap;overflow:hidden;cursor:pointer}
  .impbar:hover{background:#FAFBFD}
  .impbar .k{color:var(--muted)}.impbar .k b{color:var(--navy);font-weight:800;font-size:12.5px}.impbar .k small{font-weight:600}
  .impbar .tg2{font-size:10px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--info)}
  &:not(.impOpen) #imp{display:none}
  &.impOpen #impBar{display:none}
  &.impOpen #cardsWrap:not(:has(#scnCard:not(.hide))){display:none}
  #mainCol{flex:1;min-width:0;display:flex;flex-direction:column;gap:10px;overflow:auto}
  #metPanel{flex:0 0 340px;width:340px;background:#fff;border:1px solid var(--line);border-radius:12px;display:flex;flex-direction:column;min-height:0}
  &:not(.impOpen) #metPanel{display:none}
  .mp-h{display:flex;align-items:center;gap:8px;padding:12px 14px 8px}
  .mp-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
  .mp-t b{font-size:16px;font-weight:800;color:var(--navy)}
  .mp-t span{font-size:11.5px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  #metX{border:0;background:none;color:var(--muted);font-size:14px;width:28px;height:28px;border-radius:6px;cursor:pointer}
  #metX:hover{background:var(--grey-bg)}
  .mp-tabs{display:flex;background:#FAFAFB;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:0 14px}
  .mp-tabs button{font-family:inherit;font-size:12.5px;font-weight:600;color:var(--muted);background:none;border:0;border-bottom:2px solid transparent;padding:8px 12px 8px 0;margin-right:10px;margin-bottom:-1px;cursor:pointer}
  .mp-tabs button.on{font-weight:800;color:var(--ink);border-bottom-color:var(--navy)}
  .mp-b{flex:1;overflow:auto;padding:12px 14px}
  #metPanel .imp{display:flex;flex-direction:column;gap:10px}
  #metTab{display:none;position:absolute;right:0;top:50%;transform:translateY(-50%);z-index:20;writing-mode:vertical-rl;background:var(--navy);color:#fff;border:0;border-radius:8px 0 0 8px;padding:14px 7px;font-family:inherit;font-size:12px;font-weight:700;cursor:pointer}
  &:not(.impOpen) #metTab{display:block}
  .gb{display:flex;align-items:center;gap:8px;margin-bottom:12px}.gb label{font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}.gb select{flex:1}
  .empty{font-size:12.5px;color:var(--muted);padding:6px 2px;line-height:1.5}
  td.empty{padding:26px;text-align:center}
  .gl{display:flex;flex-direction:column;gap:7px}
  .gr{display:flex;align-items:center;gap:8px;font-size:12px}
  .gr .gk{width:64px;font-weight:700;color:var(--navy);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .gr .t{flex:1;height:8px;background:#E5E7EB;border-radius:5px;overflow:hidden}.gr .t i{display:block;height:100%;background:#22A06B;border-radius:5px}
  .gr b{width:46px;text-align:right;color:var(--navy)}.gr .gn{width:26px;text-align:right;color:var(--muted);font-size:11px}
  .note2{font-size:11px;color:var(--muted);margin-top:12px}
  .kvs{display:flex;flex-direction:column;border-top:1px solid var(--line)}
  .kv{display:flex;align-items:baseline;gap:8px;padding:6px 2px;border-bottom:1px solid #F0F1F3;font-size:12.5px;color:var(--muted)}
  .kv span{flex:1}.kv b{color:var(--navy);font-weight:800}
  #metPanel .grad{margin:4px 0}
  .cks{display:flex;flex-direction:column;gap:2px}
  .ck{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid #F0F1F3;font-size:12.5px}
  .ck .tag{min-width:34px;text-align:center;margin:0}
  .ck.go{cursor:pointer}.ck.go:hover{background:var(--row-hover)}
  .ck.on{background:var(--info-bg);box-shadow:inset 3px 0 0 var(--btn-main)}
  .callout{margin-top:14px;border-radius:8px;padding:10px 12px;font-size:12.5px;border-left:5px solid}
  .callout.ok{background:var(--ok-bg);border-color:#22A06B;color:var(--ok)}.callout.warn{background:var(--warn-bg);border-color:#D99A2B;color:var(--warn)}
  .tpbopt{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase}.tpbopt select{height:30px;padding:0 6px;font-size:12px;text-transform:none;font-weight:600}
  .bh{display:flex;flex-direction:column;gap:8px}.bhr{border:1px solid var(--line);border-left:4px solid #27548A;border-radius:8px;padding:8px 10px;background:#FAFAFB}.bht{font-size:12px;margin-bottom:2px}.bhr .btn{height:28px;margin-top:6px;font-size:12px}
}
`;

/* ============================== constants ============================== */
const DEFAULT_CYCLE = {
  id: "CYCLE_ID_FROM_MASTER",
  name: "Apr-26",
  location: "",
};
const BAND_OF = {
  Analyst: "B1",
  "Senior Analyst": "B2",
  Consultant: "B2",
  Associate: "B3",
  "Senior Associate": "B4",
  Lead: "B4",
  Manager: "B5",
  "Senior Manager": "B6",
  Principal: "B6",
  Director: "B7",
};
const BENCH = {
  B1: [6, 8, 11],
  B2: [6, 8, 10.5],
  B3: [5.5, 7.5, 10],
  B4: [5, 7, 9.5],
  B5: [4.5, 6.5, 9],
  B6: [4, 6, 8.5],
  B7: [3.5, 5.5, 8],
};
const BASE_RANGE = {
  B1: [600000, 900000],
  B2: [900000, 1400000],
  B3: [1400000, 2000000],
  B4: [2000000, 2800000],
  B5: [2800000, 4000000],
  B6: [4000000, 6000000],
  B7: [6000000, 9000000],
};
const DESIGS = [
  "Analyst",
  "Senior Analyst",
  "Consultant",
  "Associate",
  "Senior Associate",
  "Lead",
  "Manager",
  "Senior Manager",
  "Principal",
  "Director",
];
const FN = [
  "Rohan",
  "Anita",
  "Vikram",
  "Priya",
  "Arjun",
  "Neha",
  "Karthik",
  "Divya",
  "Suresh",
  "Meera",
  "Rahul",
  "Kavya",
  "Imran",
  "Sneha",
  "Aditya",
  "Pooja",
  "Manoj",
  "Lakshmi",
  "Nikhil",
  "Swati",
  "Harish",
  "Deepa",
  "Varun",
  "Ritu",
  "Sanjay",
  "Isha",
  "Gautam",
  "Tanvi",
  "Prakash",
  "Anjali",
  "Mohan",
  "Shreya",
  "Ashok",
  "Nandini",
  "Yash",
  "Bhavna",
];
const LN = [
  "Kapoor",
  "Rao",
  "Nair",
  "Iyer",
  "Menon",
  "Shah",
  "Gupta",
  "Reddy",
  "Pillai",
  "Joshi",
  "Bhat",
  "Verma",
];
const CMS = ["Anita Sharma", "Dev Malhotra", "Sunil Varghese", "Rekha Pandey"];
const TES = ["Raj Mehta", "Farah Khan"];

const FIELDS = {
  hikePct: { label: "Hike %", key: "hikeAmt", kind: "pct" },
  hikeAmt: { label: "Hike Amount", key: "hikeAmt", kind: "amt" },
  newPB: {
    label: "Performance Bonus (PB)",
    key: "newPB",
    kind: "amt",
    floor: "pbPaid",
    floorLbl: "PB",
    unitPick: true,
  },
  newRB: {
    label: "Retention Bonus (RB)",
    key: "newRB",
    kind: "amt",
    floor: "rbPaid",
    floorLbl: "RB",
    unitPick: true,
  },
  tpbNext: {
    label: "Target PB for Next Year",
    key: "tpbNext",
    kind: "amt",
    unitPick: true,
  },
};
const FORDER = ["hikePct", "newPB", "newRB", "tpbNext"];
const KEYS = ["hikeAmt", "newPB", "newRB", "tpbNext"];
const NUMF = [
  "basePay",
  "pbPaid",
  "rbPaid",
  "hikeAmt",
  "newPB",
  "newRB",
  "tpbNext",
];
const PAGE = 20;

const FILTER_DEFAULT = [
  { id: "q", label: "Search", type: "search" },
  { id: "band", label: "Band", type: "select", field: "band" },
  {
    id: "designation",
    label: "Designation",
    type: "select",
    field: "designation",
  },
  {
    id: "compManager",
    label: "Comp. Manager",
    type: "select",
    field: "compManager",
  },
  {
    id: "promo",
    label: "Eligible for Promotion",
    type: "select",
    field: "promo",
  },
];
const CFG_KEY = "bulkForWhomCfg_v1",
  MY_KEY = "bulkMyFilters_v1",
  TPB_KEY = "bulkIncTpb_v1",
  IMP_KEY = "bulkImpOpen_v1",
  PT_KEY = "bulkPanelTab_v1",
  GB_KEY = "bulkGroupBy_v1",
  WRAPC_KEY = "bulkWrapCols_v2",
  COLW_KEY = "bulkColW_v2",
  SCN_KEY = "bulkScenarios_v3";
const EDITED_LBL = {
  hand: "Edited by hand",
  bulk: "Edited in bulk",
  none: "Not edited",
};
const CK_LBL = {
  chg: "Rows that will change",
  skip: "Skipped · edited by hand",
  off: "Left out · unticked",
  same: "No change",
  range: "Out of band range",
  norating: "Without a Manager Rating",
};
const NUMBER_OPS = [
  ["gt", "Greater than"],
  ["gte", "Greater than or equal to"],
  ["lt", "Less than"],
  ["lte", "Less than or equal to"],
  ["eq", "Equals"],
  ["neq", "Not equal to"],
  ["between", "Between"],
];
const TEXT_OPS = [
  ["contains", "Contains"],
  ["notcontains", "Does not contain"],
  ["eq", "Equals"],
  ["startswith", "Begins with"],
  ["endswith", "Ends with"],
  ["blank", "Is blank"],
  ["notblank", "Is not blank"],
];
const NUM_COLS = { rating: 1, basePay: 1, hikePct: 1, newBase: 1, ctc: 1 };

/* ============================== pure helpers ============================== */
const lsGet = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : v;
  } catch (x) {
    return d;
  }
};
const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, v);
  } catch (x) {
    /* ignore */
  }
};
const inr = (n) =>
  Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
const pct = (n) => Number(n).toFixed(2) + "%";
const big = (n) =>
  n >= 10000000
    ? "₹ " + (n / 10000000).toFixed(2) + " Cr"
    : "₹ " + (n / 100000).toFixed(2) + " L";
const bucket = (e) =>
  e.rating == null ? null : Math.min(5, Math.max(1, Math.round(e.rating)));
const nowT = () => {
  const d = new Date();
  return (
    ("0" + d.getHours()).slice(-2) + ":" + ("0" + d.getMinutes()).slice(-2)
  );
};
const lvl = (p) => (p > 100 ? "danger" : p > 90 ? "warn" : "");
const isHike = (f) => f === "hikePct" || f === "hikeAmt";
const hikeBasis = (e) => e.basePay; /* Hike % is always worked on Base pay */
const isNumCol = (k) => !!NUM_COLS[k] || /^(cur|prop|chg)\d+$/.test(k);
const colSum = (a, cols) => cols.reduce((s, k) => s + (Number(a[k]) || 0), 0);
const sameVal = (a, b) =>
  String(a) === String(b) || (Number(a) === Number(b) && !isNaN(Number(a)));
const rangeLabel = (r) => (r[1] == null ? r[0] + "+" : r[0] + "–" + r[1]);
const rangeHit = (v, r) => {
  const n = Number(v);
  if (v === "" || v == null || isNaN(n)) return false;
  return n >= r[0] && (r[1] == null || n < r[1]);
};
const dp = (e, v) => (v.hikeAmt / e.basePay) * 100;

function normFilters(list) {
  return (list || [])
    .filter(
      (d) =>
        d &&
        d.on !== false &&
        d.type !== "edited" &&
        d.type !== "rating" &&
        (d.type === "search" || d.field),
    )
    .map((d) => {
      const id = d.id || d.field || d.type;
      return {
        id,
        label: d.label || id,
        type: d.type || "select",
        field: d.field,
        ranges: d.ranges || [],
      };
    });
}

function newRule(uid, field, first) {
  return {
    uid,
    field,
    method: "same",
    unit: field === "hikePct" ? "pct" : "amt",
    value: first ? "6" : "",
    inst: "1",
    distSrc: "amount",
    distAmt: "",
    distBy: "equal",
    adjDir: "add",
    adjAmt: "",
  };
}

function ruleText1(r) {
  const F = FIELDS[r.field],
    t = F.label + " ";
  const u = r.field === "hikePct" || r.unit === "pct" ? "%" : "";
  if (r.method === "adj")
    return t + (r.adjDir === "sub" ? "reduce by ₹ " : "add ₹ ") + inr(r.adjAmt);
  if (r.method === "dist")
    return (
      t +
      "distribute " +
      (r.distSrc === "remaining"
        ? "the remaining budget"
        : "₹ " + inr(r.distAmt)) +
      (r.distBy === "base" ? " in proportion to Base pay" : " equally")
    );
  return t + r.value + u;
}
const ruleText = (rules) => rules.map(ruleText1).join(" · ");

function condPass(v, f, num) {
  if (num) {
    if (v == null) return false;
    const a = Number(f.value),
      b = Number(f.value2);
    switch (f.op) {
      case "gt":
        return v > a;
      case "gte":
        return v >= a;
      case "lt":
        return v < a;
      case "lte":
        return v <= a;
      case "eq":
        return v === a;
      case "neq":
        return v !== a;
      case "between":
        return v >= Math.min(a, b) && v <= Math.max(a, b);
      default:
        return true;
    }
  }
  const t = String(v == null ? "" : v).toLowerCase(),
    q = String(f.value || "").toLowerCase();
  switch (f.op) {
    case "contains":
      return t.indexOf(q) >= 0;
    case "notcontains":
      return t.indexOf(q) < 0;
    case "eq":
      return t === q;
    case "startswith":
      return t.indexOf(q) === 0;
    case "endswith":
      return q === "" || t.slice(-q.length) === q;
    case "blank":
      return t === "";
    case "notblank":
      return t !== "";
    default:
      return true;
  }
}

function makeDemoEmp() {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const noRating = { 11: 1, 26: 1 },
    promoYes = { 5: 1, 12: 1, 19: 1, 30: 1 },
    hand = { 3: 1, 9: 1, 14: 1, 21: 1, 28: 1 };
  const out = [];
  for (let i = 0; i < 36; i++) {
    const d = DESIGS[(i * 3 + Math.floor(i / 4)) % DESIGS.length],
      b = BAND_OF[d],
      r = BASE_RANGE[b];
    const base = Math.round((r[0] + rnd() * (r[1] - r[0])) / 10000) * 10000;
    const rating = noRating[i]
      ? null
      : Math.round((2.5 + rnd() * 2.4) * 10) / 10;
    const pbPaid = Math.round((base * (0.05 + rnd() * 0.05)) / 1000) * 1000;
    const rbPaid = i % 3 === 0 ? Math.round((base * 0.04) / 1000) * 1000 : 0;
    const e = {
      empId: "EMP" + String(100 + i * 7).padStart(5, "0"),
      name: FN[i] + " " + LN[(i * 5 + 3) % LN.length],
      designation: d,
      band: b,
      skillType: i % 5 === 1 || i % 5 === 3 ? "Niche" : "General",
      costCenter: "CC" + (10 + (i % 3) * 10),
      yoe: Math.round((1 + ((i * 7) % 16)) * 10) / 10,
      compManager: CMS[i % 4],
      superManager: TES[i % 4 < 2 ? 0 : 1],
      rating,
      basePay: base,
      pbPaid,
      rbPaid,
      hikeAmt: 0,
      newPB: pbPaid,
      newRB: rbPaid,
      newPBInst: "1",
      tpbNext: Math.round((base * 0.1) / 1000) * 1000,
      remarks: "",
      promo: promoYes[i] ? "Yes" : "No",
      hand: false,
      bulk: false,
      bBase0: base + pbPaid,
    };
    if (hand[i]) {
      e.hikeAmt = Math.round(base * (0.065 + rnd() * 0.03));
      e.remarks = "Set by manager";
      e.hand = true;
    }
    out.push(e);
  }
  return out;
}

/* ============================== small components ============================== */
function Card({ cls, tag, big: bigNode, children }) {
  return (
    <div className={"ic" + (cls ? " " + cls : "")}>
      <div className="tg">{tag}</div>
      <div className="bn">{bigNode}</div>
      {children}
    </div>
  );
}

function ColFilterPop({
  num,
  keys,
  vals,
  cur,
  wrapOn,
  pos,
  onSort,
  onWrap,
  onCond,
  onPick,
  onClear,
}) {
  const ops = num ? NUMBER_OPS : TEXT_OPS;
  const cond = cur && !(cur instanceof Set) ? cur : null;
  const [op, setOp] = useState(cond ? cond.op : ops[0][0]);
  const [v1, setV1] = useState(cond ? cond.value || "" : "");
  const [v2, setV2] = useState(cond ? cond.value2 || "" : "");
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState(() =>
    cur instanceof Set ? new Set(cur) : new Set(keys),
  );
  const ref = useRef(null);
  const [top, setTop] = useState(pos.top);
  useLayoutEffect(() => {
    const h = ref.current ? ref.current.offsetHeight : 0;
    setTop(Math.max(8, Math.min(pos.top, window.innerHeight - h - 8)));
  }, [pos.top, q]);
  const t = q.toLowerCase(),
    vis = keys.filter((x) => x.toLowerCase().indexOf(t) >= 0);
  const allOn = vis.length > 0 && vis.every((x) => picked.has(x));
  const blank = op === "blank" || op === "notblank";
  const toggleAll = (on) => {
    const n = new Set(picked);
    vis.forEach((x) => (on ? n.add(x) : n.delete(x)));
    setPicked(n);
  };
  const toggle = (x, on) => {
    const n = new Set(picked);
    on ? n.add(x) : n.delete(x);
    setPicked(n);
  };
  return (
    <div
      className="filter-pop"
      ref={ref}
      style={{ left: pos.left, top }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="filter-sort-row">
        <button type="button" onClick={() => onSort(1)}>
          ↑ Sort
        </button>
        <button type="button" onClick={() => onSort(-1)}>
          ↓ Sort
        </button>
      </div>
      <div className="filter-wrap-row">
        <label>
          <input
            type="checkbox"
            checked={wrapOn}
            onChange={(e) => onWrap(e.target.checked)}
          />{" "}
          Wrap text in this column
        </label>
      </div>
      <div className="filter-cond-row">
        <select value={op} onChange={(e) => setOp(e.target.value)}>
          {ops.map((o) => (
            <option key={o[0]} value={o[0]}>
              {o[1]}
            </option>
          ))}
        </select>
        {!blank && (
          <input
            placeholder="Value"
            value={v1}
            onChange={(e) => setV1(e.target.value)}
          />
        )}
        {op === "between" && (
          <>
            <span className="cond-and">and</span>
            <input
              placeholder="Value"
              value={v2}
              onChange={(e) => setV2(e.target.value)}
            />
          </>
        )}
        <button
          type="button"
          onClick={() => {
            if (!blank && v1.trim() === "") return;
            if (op === "between" && v2.trim() === "") return;
            onCond({ op, value: v1, value2: v2 });
          }}
        >
          Apply filter
        </button>
      </div>
      <div className="filter-divider">or pick values</div>
      <div className="filter-search-row">
        <input
          placeholder="Search values..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <div className="filter-select-all">
        <label>
          <input
            type="checkbox"
            checked={allOn}
            onChange={(e) => toggleAll(e.target.checked)}
          />{" "}
          (Select all)
        </label>
      </div>
      <div className="filter-values">
        {vis.length ? (
          vis.slice(0, 400).map((x) => (
            <label key={x}>
              <input
                type="checkbox"
                checked={picked.has(x)}
                onChange={(e) => toggle(x, e.target.checked)}
              />{" "}
              {x === "" ? "(Blanks)" : x}
            </label>
          ))
        ) : (
          <div className="none">No values</div>
        )}
      </div>
      <div className="filter-actions">
        <button type="button" className="fa-cl" onClick={onClear}>
          Clear
        </button>
        <button
          type="button"
          className="fa-ap"
          onClick={() =>
            onPick(keys.every((x) => picked.has(x)) ? null : new Set(picked))
          }
        >
          Apply
        </button>
      </div>
    </div>
  );
}

/* ============================== main component ============================== */
const BulkOperations = forwardRef(function BulkOperations(
  { apiUrl = "", cycle = DEFAULT_CYCLE, height = "100vh", onApplied },
  ref,
) {
  const apiMode = !!apiUrl;
  const apiBase = apiUrl.replace(/\/+$/, "");
  const cyc = cycle || DEFAULT_CYCLE;
  const cycRef = useRef(cyc);
  cycRef.current = cyc;
  const asRef = useRef("");
  const uidRef = useRef(1);
  const desigBand = useRef({});
  const sbFresh = useRef(false);
  const ignoreUntil = useRef(0);
  const lastTop = useRef(0);
  const gwRef = useRef(null),
    mainRef = useRef(null);

  /* data */
  const [emp, setEmp] = useState(() => (apiUrl ? [] : makeDemoEmp()));
  const [me, setMe] = useState(null),
    [fa, setFa] = useState(null);
  const [sb, setSb] = useState(null),
    [sb0, setSb0] = useState(null);
  const [role] = useState("HR"),
    [user] = useState("");
  const [locked, setLocked] = useState(false),
    [lockReason, setLockReason] = useState("");
  const [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false);
  const [err, setErr] = useState(""),
    [flash, setFlash] = useState("");

  /* rules / preview */
  const [rules, setRules] = useState(() => [newRule(1, "hikePct", true)]);
  const [pvOn, setPvOn] = useState(false),
    [showErr, setShowErr] = useState(false);
  const [skipHand, setSkipHand] = useState(true),
    [off, setOff] = useState({});
  const [confirmAt, setConfirmAt] = useState(0),
    [checkF, setCheckF] = useState("");

  /* filters */
  const [fdefs, setFdefs] = useState(() => {
    try {
      const v = localStorage.getItem(CFG_KEY);
      if (v) {
        const n = normFilters(JSON.parse(v));
        if (n.length) return n;
      }
    } catch (x) {
      /* ignore */
    }
    return FILTER_DEFAULT;
  });
  const [active, setActive] = useState(() => {
    try {
      const v = JSON.parse(localStorage.getItem(MY_KEY) || "null");
      if (Array.isArray(v)) return v;
    } catch (x) {
      /* ignore */
    }
    return [];
  });
  const [filt, setFilt] = useState({});
  const [pop, setPop] = useState(null);
  const [colF, setColF] = useState({}),
    [fpop, setFpop] = useState(null);

  /* grid */
  const [page, setPage] = useState(1),
    [sort, setSort] = useState({ key: null, dir: 1 });
  const [wrapC, setWrapC] = useState(() => {
    try {
      return JSON.parse(lsGet(WRAPC_KEY, "null")) || { name: 1 };
    } catch (x) {
      return { name: 1 };
    }
  });
  const [colW, setColW] = useState(() => {
    try {
      return JSON.parse(lsGet(COLW_KEY, "{}")) || {};
    } catch (x) {
      return {};
    }
  });
  const [drag, setDrag] = useState(false);

  /* panels */
  const [fold, setFoldS] = useState(false);
  const [impOpen, setImpOpenS] = useState(() => lsGet(IMP_KEY, "1") !== "0");
  const [pt, setPt] = useState(() => {
    const v = lsGet(PT_KEY, "budget");
    return v === "spread" ? "budget" : v;
  });
  const [gb, setGb] = useState(() => lsGet(GB_KEY, "rating"));
  const [incTpb, setIncTpb] = useState(() => lsGet(TPB_KEY, "0") === "1");
  const [moreOpen, setMoreOpen] = useState(false);
  const [scnOpen, setScnOpen] = useState(false),
    [scnForm, setScnForm] = useState(null);
  const [scenarios, setScenarios] = useState(() => {
    try {
      return JSON.parse(lsGet(SCN_KEY, "[]")) || [];
    } catch (x) {
      return [];
    }
  });
  const [batches, setBatches] = useState([]);
  const [restoreAt, setRestoreAt] = useState({ id: "", t: 0 });

  /* ---------- scope & filters ---------- */
  const scope = useMemo(() => {
    if (apiMode) return emp;
    return emp.filter((e) =>
      role === "HR"
        ? true
        : role === "TE"
          ? e.superManager === user
          : e.compManager === user,
    );
  }, [emp, apiMode, role, user]);

  const fdef = (id) => fdefs.find((d) => d.id === id);
  const hiddenForRole = (d) =>
    d.field === "compManager" &&
    (role === "CM" || (me && me.role === "Comp Manager"));
  const canEdit = (key) =>
    !apiMode || !fa || (fa[key] && fa[key].access === "edit");
  const usedKeys = (rs, except) => {
    const u = {};
    rs.forEach((r) => {
      if (r.uid !== except) u[FIELDS[r.field].key] = 1;
    });
    return u;
  };

  const passFilters = (e) => {
    for (let i = 0; i < fdefs.length; i++) {
      const d = fdefs[i],
        v = filt[d.id];
      if (!v || !v.length) continue;
      if (d.type === "search") {
        if (
          (e.name + " " + e.empId + " " + e.designation)
            .toLowerCase()
            .indexOf(String(v).toLowerCase()) < 0
        )
          return false;
        continue;
      }
      const hit = v.some((x) => {
        if (d.type === "select")
          return String(e[d.field] == null ? "" : e[d.field]) === x;
        if (d.type === "range")
          return rangeHit(e[d.field], d.ranges[Number(x)]);
        return true;
      });
      if (!hit) return false;
    }
    return true;
  };
  const optionsFor = (d) => {
    if (d.type === "range")
      return d.ranges.map((r, i) => ({
        v: String(i),
        label: rangeLabel(r),
        n: scope.filter((e) => rangeHit(e[d.field], r)).length,
      }));
    const m = {};
    scope.forEach((e) => {
      const x = e[d.field];
      if (x !== "" && x != null) m[x] = (m[x] || 0) + 1;
    });
    return Object.keys(m)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((k) => ({ v: k, label: k, n: m[k] }));
  };
  const valLabel = (d, v) =>
    d.type === "range"
      ? rangeLabel(d.ranges[Number(v)])
      : d.type === "edited"
        ? EDITED_LBL[v] || v
        : v;

  /* ---------- values for sorting / column filters ---------- */
  const afterOf = (e, pv) => {
    const p = pv && pv.res[e.empId];
    return p && p.st === "chg" ? p.after : e;
  };
  const fieldNum = (r, e, v) => {
    const F = FIELDS[r.field];
    if (F.kind === "pct") return (v.hikeAmt / e.basePay) * 100;
    if (F.kind === "amt") return Number(v[F.key]) || 0;
    return 0;
  };
  const sortVal = (e, k, pv) => {
    const af = afterOf(e, pv),
      m = /^(cur|prop|chg)(\d+)$/.exec(k);
    if (m) {
      const r = rules[Number(m[2])];
      if (!r) return 0;
      const c = fieldNum(r, e, e),
        p = fieldNum(r, e, af);
      return m[1] === "cur" ? c : m[1] === "prop" ? p : p - c;
    }
    switch (k) {
      case "name":
        return e.name;
      case "empId":
        return e.empId;
      case "band":
        return e.band;
      case "rating":
        return e.rating == null ? -1 : e.rating;
      case "basePay":
        return e.basePay;
      case "hikePct":
        return af.hikeAmt / e.basePay;
      case "newBase":
        return e.basePay + af.hikeAmt;
      case "ctc":
        return e.basePay + af.hikeAmt + af.newPB + af.newRB;
      default:
        return 0;
    }
  };
  const viewRows = (pv) => {
    const rows = scope.filter(passFilters),
      k = sort.key;
    return k
      ? rows.slice().sort((a, b) => {
          const x = sortVal(a, k, pv),
            y = sortVal(b, k, pv);
          return (x < y ? -1 : x > y ? 1 : 0) * sort.dir;
        })
      : rows;
  };

  /* ---------- budget ---------- */
  const sums = (list, over) => {
    let base = 0,
      used = 0,
      tpb = 0;
    const bc = (sb && sb.baseColumns) || ["basePay", "newPB"],
      uc = (sb && sb.usedColumns) || ["hikeAmt", "newPB", "newRB"];
    list.forEach((e) => {
      const a = over && over[e.empId] ? Object.assign({}, e, over[e.empId]) : e;
      base += !sb && e.bBase0 != null ? e.bBase0 : colSum(e, bc);
      used += colSum(a, uc);
      tpb += Number(a.tpbNext) || 0;
    });
    return { base, used, tpb };
  };
  const budgetOf = (list, over) => {
    const s = sums(list, over);
    let bud, used, tpb;
    if (sb) {
      const z = sb0 || sums(list, null),
        ratio = sb.base ? sb.updated / sb.base : 0;
      bud = sb.updated + (s.base - z.base) * ratio;
      used = sb.used + (s.used - z.used);
      tpb = sb.tpb + (s.tpb - z.tpb);
    } else {
      bud = 0.35 * s.base;
      used = s.used;
      tpb = s.tpb;
    }
    return {
      budget: bud,
      used,
      util: bud ? (used / bud) * 100 : 0,
      utilT: bud ? ((used + tpb) / bud) * 100 : 0,
      tpb,
      left: bud - used - (incTpb ? tpb : 0),
    };
  };

  /* ---------- validate ---------- */
  const validation = (() => {
    const map = {};
    let ok = true;
    const mark = (uid, k, msg) => {
      (map[uid] = map[uid] || {})[k] = msg;
      ok = false;
    };
    rules.forEach((r) => {
      const F = FIELDS[r.field];
      const chk = (v, k) => {
        const n = Number(v);
        if (v === "" || isNaN(n)) {
          mark(r.uid, k, "Enter a number");
          return;
        }
        if (n < 0) {
          mark(r.uid, k, "Cannot be negative");
          return;
        }
        const pl = r.field === "hikePct" || (F.unitPick && r.unit === "pct");
        if (pl && n >= 100) mark(r.uid, k, "Must be less than 100%");
      };
      if (r.method === "same") chk(r.value, "value");
      else if (r.method === "adj") chk(r.adjAmt, "adjAmt");
      else if (r.method === "dist") {
        if (r.distSrc === "remaining") {
          if (budgetOf(scope, null).left < 1)
            mark(r.uid, "distSrc", "No budget is left to distribute");
        } else {
          chk(r.distAmt, "distAmt");
          if (Number(r.distAmt) <= 0 && r.distAmt !== "")
            mark(r.uid, "distAmt", "Enter an amount above 0");
        }
      }
    });
    return { ok, map };
  })();

  /* ---------- preview ---------- */
  const distTotal = (r) =>
    r.distSrc === "remaining"
      ? Math.max(0, Math.floor(budgetOf(scope, null).left))
      : Math.max(0, Math.round(Number(r.distAmt) || 0));
  const computeShares = (rows) => {
    const out = {},
      elig = rows.filter((e) => !off[e.empId] && !(skipHand && e.hand));
    rules.forEach((r) => {
      if (r.method !== "dist" || FIELDS[r.field].kind !== "amt") return;
      const total = distTotal(r),
        m = {};
      out[r.uid] = m;
      if (!elig.length || total <= 0) return;
      const w = elig.map((e) => (r.distBy === "base" ? e.basePay : 1)),
        sw = w.reduce((a, b) => a + b, 0);
      let sum = 0;
      const sh = elig.map((e, i) => {
        const v = Math.floor((total * w[i]) / sw);
        sum += v;
        return v;
      });
      for (
        let i = 0, rest = total - sum;
        rest > 0 && i < sh.length;
        i++, rest--
      )
        sh[i]++;
      elig.forEach((e, i) => {
        m[e.empId] = sh[i];
      });
    });
    return out;
  };
  const computeRule = (e, r, after, notes, SH) => {
    const F = FIELDS[r.field];
    if (r.method === "adj") {
      const a = Number(r.adjAmt) || 0;
      let v = (Number(e[F.key]) || 0) + (r.adjDir === "sub" ? -a : a);
      if (v < 0) {
        v = 0;
        notes.push({ t: "warn", k: "adj", m: F.label + " limited to 0" });
      }
      if (F.floor && v < e[F.floor]) {
        v = e[F.floor];
        notes.push({
          t: "warn",
          k: "adj",
          m:
            F.floorLbl +
            " raised to the to-be-paid amount (₹ " +
            inr(e[F.floor]) +
            ")",
        });
      }
      after[F.key] = v;
      return;
    }
    if (r.method === "dist") {
      after[F.key] =
        (Number(e[F.key]) || 0) + ((SH[r.uid] && SH[r.uid][e.empId]) || 0);
      return;
    }
    const val = Number(r.value);
    let amt;
    if (r.field === "hikePct") amt = (hikeBasis(e) * val) / 100;
    else if (r.field === "hikeAmt") amt = val;
    else amt = r.unit === "pct" ? (hikeBasis(e) * val) / 100 : val;
    if (F.floor && amt < e[F.floor]) {
      amt = e[F.floor];
      notes.push({
        t: "warn",
        k: "adj",
        m:
          F.floorLbl +
          " raised to the to-be-paid amount (₹ " +
          inr(e[F.floor]) +
          ")",
      });
    }
    after[F.key] = amt;
  };
  const computeRow = (e, SH) => {
    const after = {
        hikeAmt: e.hikeAmt,
        newPB: e.newPB,
        newRB: e.newRB,
        newPBInst: e.newPBInst,
        tpbNext: e.tpbNext,
        remarks: e.remarks,
      },
      notes = [];
    rules.forEach((r) => computeRule(e, r, after, notes, SH));
    let same = true;
    KEYS.forEach((k) => {
      if (String(after[k]) !== String(e[k])) same = false;
    });
    const hasNR = notes.some((x) => x.k === "norating");
    const out = {
      after,
      notes,
      st: same ? (hasNR ? "norating" : "same") : "chg",
    };
    if (
      out.st === "chg" &&
      rules.some((r) => FIELDS[r.field].key === "hikeAmt")
    ) {
      const hp = (after.hikeAmt / e.basePay) * 100,
        bm = BENCH[e.band];
      if (bm) {
        if (hp > bm[2])
          notes.push({
            t: "warn",
            k: "range",
            m: "Above band " + e.band + " P75 (" + bm[2] + "%)",
          });
        else if (hp < bm[0])
          notes.push({
            t: "warn",
            k: "range",
            m: "Below band " + e.band + " P25 (" + bm[0] + "%)",
          });
      }
    }
    return out;
  };
  const buildPreview = () => {
    const rows = viewRows(null),
      SH = computeShares(rows),
      res = {},
      n = { chg: 0, skip: 0, same: 0, off: 0, norating: 0, adj: 0, range: 0 },
      over = {};
    rows.forEach((e) => {
      if (off[e.empId]) {
        res[e.empId] = { st: "off", notes: [] };
        n.off++;
        return;
      }
      if (skipHand && e.hand) {
        res[e.empId] = { st: "skip", notes: [] };
        n.skip++;
        return;
      }
      const o = computeRow(e, SH);
      res[e.empId] = o;
      if (o.st === "chg") {
        n.chg++;
        over[e.empId] = o.after;
      } else if (o.st === "same") n.same++;
      o.notes.forEach((x) => {
        if (x.k === "norating") n.norating++;
        else if (o.st === "chg") {
          if (x.k === "adj") n.adj++;
          else if (x.k === "range") n.range++;
        }
      });
    });
    return {
      res,
      n,
      before: budgetOf(scope, null),
      after: budgetOf(scope, over),
      rules: JSON.parse(JSON.stringify(rules)),
      text: ruleText(rules),
    };
  };
  /* eslint-disable react-hooks/exhaustive-deps */
  const pv = useMemo(
    () => (pvOn && validation.ok ? buildPreview() : null),
    [
      pvOn,
      validation.ok,
      rules,
      emp,
      scope,
      filt,
      fdefs,
      off,
      skipHand,
      sb,
      sb0,
      incTpb,
      sort,
    ],
  );
  /* eslint-enable react-hooks/exhaustive-deps */

  const b0 = budgetOf(scope, null),
    bPv = pv ? pv.after : b0;

  /* ---------- grid data ---------- */
  const colVal = (e, k) => {
    if (isNumCol(k)) {
      if (k === "rating") return e.rating == null ? null : e.rating;
      const v = sortVal(e, k, pv);
      return /^chg/.test(k) || k === "hikePct"
        ? Math.round(v * 10000) / 10000
        : v;
    }
    if (k === "name") return e.empId + " - " + e.name + " - " + e.designation;
    return k === "band" ? e.band : "";
  };
  const colTxt = (e, k) => {
    const v = colVal(e, k);
    return v == null ? "" : String(v);
  };
  const ckPass = (e) => {
    const r = pv.res[e.empId];
    switch (checkF) {
      case "chg":
        return !!r && r.st === "chg";
      case "skip":
        return !!r && r.st === "skip";
      case "off":
        return !!r && r.st === "off";
      case "same":
        return !!r && r.st === "same";
      case "range":
        return !!r && r.st === "chg" && r.notes.some((x) => x.k === "range");
      case "norating":
        return e.rating == null;
      default:
        return true;
    }
  };
  const gridRows = () => {
    let r = viewRows(pv);
    if (checkF && pv) r = r.filter(ckPass);
    Object.keys(colF).forEach((k) => {
      const f = colF[k];
      if (f)
        r = r.filter((e) =>
          f instanceof Set
            ? f.has(colTxt(e, k))
            : condPass(colVal(e, k), f, isNumCol(k)),
        );
    });
    return r;
  };
  const cols = () => {
    const c = [
      { k: "name", t: "Employee", c: "c1" },
      { k: "band", t: "Band" },
      { k: "rating", t: "Manager Rating", r: 1 },
      { k: "basePay", t: "Base pay", r: 1 },
    ];
    rules.forEach((r, i) => {
      const L = FIELDS[r.field].label;
      c.push(
        { k: "cur" + i, t: "Current · " + L, r: 1 },
        { k: "prop" + i, t: "Proposed · " + L, r: 1 },
        { k: "chg" + i, t: "Change · " + L, r: 1 },
      );
    });
    c.push(
      { k: "hikePct", t: "Hike% (after)", r: 1 },
      { k: "newBase", t: "New Base Salary (after)", r: 1 },
      { k: "ctc", t: "Total CTC with Rewards (after)", r: 1 },
      { k: "note", t: "Note", ns: 1 },
    );
    return c;
  };
  const widthOf = (c) =>
    colW[c.k] ||
    (c.k === "name"
      ? 300
      : c.k === "band"
        ? 80
        : c.k === "note"
          ? 260
          : c.k === "rating"
            ? 100
            : /^(cur|prop|chg)/.test(c.k)
              ? 120
              : c.k === "newBase"
                ? 130
                : c.k === "ctc"
                  ? 150
                  : 110);
  const dispVal = (r, e, v) => {
    const F = FIELDS[r.field];
    return F.kind === "pct"
      ? pct((v.hikeAmt / e.basePay) * 100)
      : inr(v[F.key]);
  };

  /* ---------- API ---------- */
  const q = () =>
    "?cycle_id=" +
    encodeURIComponent(cycRef.current.id) +
    (asRef.current ? "&as=" + encodeURIComponent(asRef.current) : "");
  const apiCall = (method, path, body) =>
    fetch(apiBase + path, {
      method,
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    }).then((r) =>
      r
        .json()
        .catch(() => ({}))
        .then((j) => {
          if (!r.ok || j.ok === false)
            throw new Error(j.error || "Server error " + r.status);
          return j;
        }),
    );
  const mapRow = (r) => {
    const e = Object.assign({}, r, {
      empId: String(r.empId),
      name: r.name || "",
      designation: r.designation || "",
      band: r.band || desigBand.current[r.designation] || "",
      compManager: r.compManager || "",
      superManager: r.superManager || "",
      rating:
        r.rating === "" || r.rating == null || r.rating === "•••"
          ? null
          : Number(r.rating),
      newPBInst: String(r.newPBInst || "1"),
      remarks: r.remarks || "",
      promo: r.promo || "No",
      hand: false,
      bulk: false,
    });
    NUMF.forEach((k) => {
      e[k] = Number(r[k]) || 0;
    });
    return e;
  };
  const loadBudget = () =>
    apiCall("GET", "/budget" + q())
      .then((b) => {
        sbFresh.current = true;
        setSb(b);
      })
      .catch(() => {
        setSb(null);
        setSb0(null);
      });
  useEffect(() => {
    if (sbFresh.current && sb) {
      sbFresh.current = false;
      setSb0(sums(scope, null));
    }
  }, [sb]); // eslint-disable-line

  const loadAll = async (asOv) => {
    if (asOv !== undefined) {
      asRef.current = asOv;
    }
    setLoading(true);
    setErr("");
    setFlash("");
    setPvOn(false);
    try {
      const res = await apiCall("GET", "/rows" + q());
      setMe(res.me || null);
      const fields = res.fields || {};
      setFa(fields);
      setLocked(!!res.locked);
      setLockReason(res.lockReason || "");
      (res.designations || []).forEach &&
        (res.designations || []).forEach((d) => {
          if (d && d.designation && d.band)
            desigBand.current[d.designation] = d.band;
        });
      const rows = (res.rows || []).map(mapRow);
      const rl = res.me && Array.isArray(res.me.roles) ? res.me.roles : [];
      if (rl.length > 1) {
        const cur = asRef.current || res.me.activeRole || rl[0].key;
        asRef.current = cur;
      } else {
        asRef.current = "";
      }
      try {
        const au = await apiCall("GET", "/audit" + q());
        const list = au.audit || au.entries || au.rows || [];
        if (Array.isArray(list))
          list.forEach((x) => {
            const e = rows.filter(
              (m) => m.empId === String(x.empId || x.emp_id || ""),
            )[0];
            if (!e) return;
            const s = String(x.source || "");
            if (/^bulk/.test(s)) e.bulk = true;
            else if (s && s !== "upload") e.hand = true;
          });
      } catch (x) {
        /* audit is optional */
      }
      try {
        const st = await apiCall("GET", "/settings");
        const c = st && st.settings && st.settings.bulkFilters;
        if (c) {
          const n = normFilters(c);
          if (n.length) setFdefs(n);
        }
      } catch (x) {
        /* optional */
      }
      setEmp(rows);
      await loadBudget();
      try {
        const r = await apiCall("GET", "/batches" + q());
        setBatches(
          (r.batches || []).map((b) => ({
            id: b.id,
            time: b.time || b.at || "",
            by: b.by || "",
            text: b.text || "",
            rows: (b.rows || []).map((x) => ({
              id: x.id || x.empId,
              old: x.old || {},
              nw: x.nw || x.new || {},
              bulk: x.bulk,
            })),
            restored: !!b.restored,
          })),
        );
      } catch (x) {
        /* optional */
      }
      setRules((rs) => {
        const r0 = rs[0];
        const ed = (k) => !fields || (fields[k] && fields[k].access === "edit");
        if (r0 && !ed(FIELDS[r0.field].key)) {
          const f = FORDER.filter((x) => ed(FIELDS[x].key))[0];
          if (f) {
            const c = rs.slice();
            c[0] = newRule(r0.uid, f, false);
            return c;
          }
        }
        return rs;
      });
      setLoading(false);
    } catch (e) {
      setLoading(false);
      setEmp([]);
      setErr("Could not load from the server: " + e.message);
    }
  };
  useEffect(() => {
    if (apiMode) loadAll();
  }, [apiUrl, cyc.id]); // eslint-disable-line
  useImperativeHandle(ref, () => ({
    reload: () => (apiMode ? loadAll() : null),
    dirty: () => !!pv,
  }));

  const demoSave = (ch) => {
    setEmp((prev) =>
      prev.map((e) => {
        const mine = ch.filter((c) => c.empId === e.empId);
        if (!mine.length) return e;
        const n = Object.assign({}, e);
        mine.forEach((c) => {
          if (c.field === "hikePct")
            n.hikeAmt = Math.round((hikeBasis(e) * Number(c.value)) / 100);
          else if (
            (FIELDS[c.field] && FIELDS[c.field].kind === "amt") ||
            c.field === "hikeAmt"
          )
            n[c.field] = Number(c.value);
          else n[c.field] = c.value;
        });
        return n;
      }),
    );
    return { saved: ch.length };
  };
  const postChanges = async (changes, source, meta) => {
    const chunks = [];
    for (let i = 0; i < changes.length; i += 500)
      chunks.push(changes.slice(i, i + 500));
    let saved = 0,
      done = 0,
      lastRows = null;
    const notes = [];
    for (const ch of chunks) {
      try {
        const res = apiMode
          ? await apiCall("POST", "/cells", {
              cycle_id: cycRef.current.id,
              as_role: asRef.current || undefined,
              changes: ch,
              source,
              batch_id: meta && meta.id,
              batch_text: meta && meta.text,
            })
          : demoSave(ch);
        saved += Number(res.saved) || ch.length;
        done += ch.length;
        (res.notes || []).forEach((n) =>
          notes.push(
            typeof n === "string"
              ? n
              : n.message || n.m || n.note || JSON.stringify(n),
          ),
        );
        if (res.rows) lastRows = res.rows;
      } catch (e) {
        e.done = done;
        e.total = changes.length;
        throw e;
      }
    }
    return { saved, notes, rows: lastRows, done, total: changes.length };
  };
  const mergeRows = (rows) => {
    const map = {};
    (rows || []).forEach((r) => {
      map[String(r.empId)] = r;
    });
    setEmp((prev) =>
      prev.map((e) => {
        const r = map[e.empId];
        if (!r) return e;
        const m = mapRow(r);
        m.hand = e.hand;
        m.bulk = e.bulk;
        return m;
      }),
    );
  };
  const afterSave = () => (apiMode ? loadBudget() : Promise.resolve());
  const byId = (id) => emp.filter((m) => m.empId === id)[0];

  /* ---------- actions ---------- */
  const changesFromPreview = () => {
    const out = [],
      old = {},
      nw = {},
      ids = [];
    viewRows(pv).forEach((e) => {
      const p = pv.res[e.empId];
      if (!p || p.st !== "chg") return;
      const o = {},
        o2 = {};
      let any = false;
      rules.forEach((r) => {
        const k = FIELDS[r.field].key;
        if (String(p.after[k]) === String(e[k])) return;
        let v = p.after[k];
        if (r.field === "hikePct")
          v = Number(r.value); /* the server turns Hike % into Hike Amount */
        out.push({
          empId: e.empId,
          field: r.field === "hikePct" ? "hikePct" : k,
          value: v,
        });
        o[k] = e[k];
        o2[k] = p.after[k];
        any = true;
      });
      if (any) {
        old[e.empId] = o;
        nw[e.empId] = o2;
        ids.push(e.empId);
      }
    });
    return { changes: out, old, nw, ids };
  };
  const doApply = async () => {
    if (!pv || locked || busy || !pv.n.chg) return;
    const x = changesFromPreview();
    if (!x.changes.length) return;
    const text = pv.text,
      bid = "B" + Date.now().toString(36);
    setBusy(true);
    setErr("");
    setFlash("");
    try {
      const res = await postChanges(x.changes, "bulk", { id: bid, text });
      if (res.rows) mergeRows(res.rows);
      const batch = {
        id: bid,
        time: nowT(),
        by: (me && me.name) || "You",
        text,
        restored: false,
        rows: x.ids.map((id) => ({
          id,
          old: x.old[id],
          nw: x.nw[id],
          bulk: !!(byId(id) || {}).bulk,
        })),
      };
      setEmp((prev) =>
        prev.map((e) =>
          x.ids.indexOf(e.empId) >= 0
            ? Object.assign({}, e, { bulk: true })
            : e,
        ),
      );
      setBatches((b) => [...b, batch]);
      setPvOn(false);
      await afterSave();
      setFlash(
        "Saved " +
          res.saved +
          " change" +
          (res.saved === 1 ? "" : "s") +
          " on " +
          x.ids.length +
          " rows · " +
          batch.time +
          " · source “bulk” in the audit trail" +
          (res.notes.length ? " · Server notes: " + res.notes.join("; ") : ""),
      );
      if (onApplied) onApplied(batch);
    } catch (e) {
      setErr(
        e.message +
          (e.done
            ? " (" +
              e.done +
              " of " +
              e.total +
              " changes had already been saved; the screen is being refreshed)"
            : " Nothing was changed."),
      );
      if (e.done && apiMode) await loadAll();
    }
    setBusy(false);
  };
  const askApply = () => {
    if (confirmAt && Date.now() - confirmAt < 6000) {
      setConfirmAt(0);
      doApply();
      return;
    }
    setConfirmAt(Date.now());
  };
  const applyLabel = () => {
    const n = pv && pv.n.chg;
    if (busy) return "Saving…";
    if (!n) return "Apply";
    if (confirmAt)
      return (
        "Confirm · " +
        n +
        " row" +
        (n === 1 ? "" : "s") +
        " · " +
        pv.before.util.toFixed(1) +
        "% → " +
        pv.after.util.toFixed(1) +
        "%"
      );
    return "Apply to " + n + " row" + (n === 1 ? "" : "s");
  };
  const doPreview = () => {
    setFlash("");
    setShowErr(true);
    if (!validation.ok) {
      setPvOn(false);
      return;
    }
    setPvOn(true);
    setPage(1);
  };
  const discard = () => {
    setPvOn(false);
    setShowErr(false);
    setFlash("");
    setConfirmAt(0);
    setCheckF("");
  };
  const doReset = () => {
    if (busy) return;
    const f = FORDER.filter((x) => canEdit(FIELDS[x].key))[0] || "hikePct";
    setRules([newRule(++uidRef.current, f, f === "hikePct")]);
    setFilt({});
    setOff({});
    setPvOn(false);
    setShowErr(false);
    setPage(1);
    setFlash("");
    setErr("");
    setSkipHand(true);
    setPop(null);
  };
  const touch = () => setFlash("");

  /* rules editing */
  const updRule = (uid, patch) => {
    touch();
    setRules((rs) =>
      rs.map((r) => (r.uid === uid ? Object.assign({}, r, patch) : r)),
    );
  };
  const replaceRule = (uid, field, keepValue) => {
    touch();
    setRules((rs) =>
      rs.map((r) => {
        if (r.uid !== uid) return r;
        const n = newRule(uid, field, false);
        if (keepValue) n.value = r.value;
        return n;
      }),
    );
  };
  const addField = () => {
    const taken = usedKeys(rules, 0),
      f = FORDER.filter(
        (x) => !taken[FIELDS[x].key] && canEdit(FIELDS[x].key),
      )[0];
    if (!f) return;
    touch();
    setRules((rs) => [...rs, newRule(++uidRef.current, f, false)]);
  };
  const rmRule = (uid) => {
    if (rules.length === 1) return;
    touch();
    setRules((rs) => rs.filter((r) => r.uid !== uid));
  };

  /* filters */
  const setFiltVals = (id, vals) => {
    setFilt((f) => {
      const n = Object.assign({}, f);
      if (vals && vals.length) n[id] = vals;
      else delete n[id];
      return n;
    });
    setPage(1);
    touch();
  };
  const openPop = (kind, id, btn) => {
    const r = btn.getBoundingClientRect();
    setPop({
      kind,
      id,
      left: Math.max(8, Math.min(r.left, window.innerWidth - 300)),
      top: r.bottom + 6,
    });
  };
  const saveMine = (a) => lsSet(MY_KEY, JSON.stringify(a));
  useEffect(() => {
    setActive((a) => {
      const n = a.filter((id) => {
        const d = fdefs.find((x) => x.id === id);
        return d && d.type !== "search";
      });
      return n.length === a.length ? a : n;
    });
    setFilt((f) => {
      let ch = false;
      const o = {};
      Object.keys(f).forEach((id) => {
        const d = fdefs.find((x) => x.id === id);
        if (d) o[id] = f[id];
        else ch = true;
      });
      return ch ? o : f;
    });
  }, [fdefs]);

  /* fold */
  const setFold = (v) => {
    ignoreUntil.current = Date.now() + 350;
    setFoldS(v);
    setPop(null);
  };
  useEffect(() => {
    ignoreUntil.current = Math.max(ignoreUntil.current, Date.now() + 60);
  });
  const onGwScroll = () => {
    const t = gwRef.current.scrollTop;
    if (
      Date.now() > ignoreUntil.current &&
      !fold &&
      t > 30 &&
      t > lastTop.current
    )
      setFold(true);
    lastTop.current = t;
  };
  const onGwWheel = (ev) => {
    if (fold && ev.deltaY < 0 && gwRef.current.scrollTop <= 0) setFold(false);
    else if (!fold && ev.deltaY > 0) setFold(true);
  };
  const onMainWheel = (ev) => {
    if (!fold && ev.deltaY > 0) setFold(true);
    else if (
      fold &&
      ev.deltaY < 0 &&
      gwRef.current.scrollTop <= 0 &&
      mainRef.current.scrollTop <= 0
    )
      setFold(false);
  };
  const onMainScroll = () => {
    if (
      Date.now() > ignoreUntil.current &&
      !fold &&
      mainRef.current.scrollTop > 30
    )
      setFold(true);
  };

  /* misc effects */
  useEffect(() => {
    const onClick = () => {
      setMoreOpen(false);
      setPop(null);
    };
    const onKey = (ev) => {
      if (ev.key === "Escape") {
        setPop(null);
        setFpop(null);
        setConfirmAt(0);
      }
    };
    const onDown = (ev) => {
      if (!ev.target.closest || !ev.target.closest(".filter-pop,.filter-btn"))
        setFpop(null);
    };
    const onResize = () => setPop(null);
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("resize", onResize);
    return () => {
      document.removeEventListener("click", onClick);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("resize", onResize);
    };
  }, []);
  useEffect(() => {
    if (!confirmAt) return;
    const t = setTimeout(
      () => setConfirmAt(0),
      Math.max(0, 6000 - (Date.now() - confirmAt)),
    );
    return () => clearTimeout(t);
  }, [confirmAt]);
  useEffect(() => {
    if (!restoreAt.id) return;
    const t = setTimeout(
      () => setRestoreAt({ id: "", t: 0 }),
      Math.max(0, 6000 - (Date.now() - restoreAt.t)),
    );
    return () => clearTimeout(t);
  }, [restoreAt]);
  useEffect(() => {
    if (!pv) return;
    const h = (ev) => {
      ev.preventDefault();
      ev.returnValue = "";
    };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [pv]);

  /* scenarios */
  const persistScn = (list) => lsSet(SCN_KEY, JSON.stringify(list));
  const saveScn = () => {
    const nm = ((scnForm && scnForm.name) || "").trim();
    if (!nm || !pv) return;
    const list = [
      ...scenarios,
      {
        name: nm,
        text: pv.text,
        rows: pv.n.chg,
        util: pv.after.util,
        utilT: pv.after.utilT,
        rules: pv.rules,
        skip: skipHand,
      },
    ];
    setScenarios(list);
    persistScn(list);
    setScnForm(null);
    setScnOpen(true);
    setFlash("Saved scenario “" + nm + "”");
  };
  const loadScn = (i) => {
    const s = scenarios[i];
    setRules(
      JSON.parse(JSON.stringify(s.rules))
        .filter((r) => FIELDS[r.field])
        .map((r) => {
          r.uid = ++uidRef.current;
          return r;
        }),
    );
    setSkipHand(s.skip);
    setFlash("");
    setShowErr(true);
    setPvOn(true);
    setPage(1);
  };

  /* restore */
  const lastBatch = () => {
    for (let i = batches.length - 1; i >= 0; i--)
      if (!batches[i].restored) return batches[i];
    return null;
  };
  const doRestore = async (id) => {
    const b = batches.filter((x) => x.id === id)[0];
    if (!b || b.restored || busy || locked) return;
    const ch = [],
      ids = [];
    let skipped = 0;
    b.rows.forEach((r) => {
      const e = byId(r.id);
      if (!e) return;
      if (Object.keys(r.old).some((k) => !sameVal(e[k], r.nw[k]))) {
        skipped++;
        return;
      }
      Object.keys(r.old).forEach((k) =>
        ch.push({ empId: r.id, field: k, value: r.old[k] }),
      );
      ids.push(r.id);
    });
    if (!ch.length) {
      setFlash(
        "Nothing restored: every row in this batch was changed again afterwards.",
      );
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const res = await postChanges(ch, "bulk_restore", {
        id: b.id,
        text: "Restore of " + b.id,
      });
      if (res.rows) mergeRows(res.rows);
      setEmp((prev) =>
        prev.map((e) => {
          const r = b.rows.filter((x) => x.id === e.empId)[0];
          return r && ids.indexOf(r.id) >= 0
            ? Object.assign({}, e, { bulk: !!r.bulk })
            : e;
        }),
      );
      setBatches((bs) =>
        bs.map((x) =>
          x.id === id ? Object.assign({}, x, { restored: true }) : x,
        ),
      );
      setPvOn(false);
      await afterSave();
      setFlash(
        "Restored previous values on " +
          ids.length +
          " row" +
          (ids.length === 1 ? "" : "s") +
          (skipped ? " · " + skipped + " skipped (changed again since)" : "") +
          " · " +
          nowT() +
          " · source “bulk_restore” in the audit trail",
      );
    } catch (e) {
      setErr(e.message + " Nothing was restored.");
    }
    setBusy(false);
  };
  const armRestore = (id) => {
    if (restoreAt.id === id && Date.now() - restoreAt.t < 6000) {
      setRestoreAt({ id: "", t: 0 });
      setMoreOpen(false);
      doRestore(id);
    } else setRestoreAt({ id, t: Date.now() });
  };

  /* export */
  const withXLSX = (fn) => {
    if (window.XLSX) {
      fn();
      return;
    }
    const sc = document.createElement("script");
    sc.src =
      "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    sc.onload = fn;
    sc.onerror = () =>
      setFlash("Excel export could not load. Check the internet connection.");
    document.head.appendChild(sc);
  };
  const exportXlsx = () => {
    const XLSX = window.XLSX;
    const head = [
      "Emp ID",
      "Employee Name",
      "Designation",
      "Band",
      "Manager Rating",
      "Base pay",
    ];
    rules.forEach((r) => {
      const L = FIELDS[r.field].label;
      head.push("Current · " + L, "Proposed · " + L, "Change · " + L);
    });
    head.push(
      "Hike% (after)",
      "New Base Salary (after)",
      "Total CTC with Rewards (after)",
      "Note",
    );
    const aoa = [head];
    viewRows(pv).forEach((e) => {
      const p = pv && pv.res[e.empId],
        chg = p && p.st === "chg",
        af = chg ? p.after : e;
      const row = [
        e.empId,
        e.name,
        e.designation,
        e.band,
        e.rating == null ? "" : e.rating,
        e.basePay,
      ];
      rules.forEach((r) => {
        const c = fieldNum(r, e, e),
          pr = fieldNum(r, e, af);
        row.push(
          Number(c.toFixed(2)),
          pv ? Number(pr.toFixed(2)) : "",
          pv ? Number((pr - c).toFixed(2)) : "",
        );
      });
      let note = "";
      if (p) {
        if (p.st === "skip") note = "Skipped · edited by hand";
        else if (p.st === "off") note = "Not selected";
        else if (p.st === "same") note = "No change";
        (p.notes || []).forEach((x) => {
          note += (note ? "; " : "") + x.m;
        });
      }
      row.push(
        Number(((af.hikeAmt / e.basePay) * 100).toFixed(2)),
        e.basePay + af.hikeAmt,
        e.basePay + af.hikeAmt + af.newPB + af.newRB,
        note,
      );
      aoa.push(row);
    });
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = head.map(() => ({ wch: 18 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Bulk preview");
    XLSX.writeFile(
      wb,
      "bulk_operations_" + new Date().toISOString().slice(0, 10) + ".xlsx",
    );
  };

  /* ============================== derived render data ============================== */
  const rows = gridRows(),
    total = rows.length,
    pages = Math.max(1, Math.ceil(total / PAGE));
  const pg = Math.min(page, pages),
    from = (pg - 1) * PAGE,
    slice = rows.slice(from, from + PAGE);
  const C = cols(),
    totalW = C.reduce((s, c) => s + widthOf(c), 0);
  const vRows = viewRows(pv),
    vN = vRows.length;
  const noRows = loading || !scope.length;
  const rem = Math.max(0, budgetOf(scope, null).left);
  const showE = showErr || pvOn;

  const filterParts = () => {
    const parts = [];
    if (filt.q) parts.push({ l: "", v: "“" + filt.q + "”" });
    active.forEach((id) => {
      const d = fdef(id),
        v = filt[id];
      if (d && v && v.length)
        parts.push({ l: d.label, v: v.map((x) => valLabel(d, x)).join(", ") });
    });
    return parts;
  };
  const fp = filterParts(),
    fpText = fp.length
      ? fp.map((p) => (p.l ? p.l + " " : "") + p.v).join(" · ")
      : "Everyone";

  const anyF = active.some((id) => filt[id] && filt[id].length) || !!filt.q;
  const availF = fdefs.filter(
    (d) => d.type !== "search" && active.indexOf(d.id) < 0 && !hiddenForRole(d),
  );

  /* metrics */
  const mctx = {
    pv,
    rows: pv
      ? vRows.filter((e) => {
          const r = pv.res[e.empId];
          return r && r.st === "chg";
        })
      : [],
    scope,
    before: pv ? pv.before : b0,
    after: pv ? pv.after : b0,
  };
  const sumCols = (cols2, after) => {
    let v = 0;
    scope.forEach((e) => {
      const a =
        after && pv && pv.res[e.empId] && pv.res[e.empId].st === "chg"
          ? pv.res[e.empId].after
          : e;
      cols2.forEach((k) => {
        v += Number(a[k]) || 0;
      });
    });
    return v;
  };
  const sharePct = (cols2) =>
    mctx.after.budget ? (sumCols(cols2, true) / mctx.after.budget) * 100 : 0;

  const shareCard = (tag, cls, cols2) => {
    const v0 = sumCols(cols2, false),
      v1 = sumCols(cols2, true);
    const p0 = mctx.before.budget ? (v0 / mctx.before.budget) * 100 : 0,
      p1 = mctx.after.budget ? (v1 / mctx.after.budget) * 100 : 0,
      moved = !!pv && Math.abs(p1 - p0) > 0.005;
    return (
      <Card
        key={tag}
        cls={cls}
        tag={tag}
        big={
          <>
            {p1.toFixed(1)}%
            <small>{moved ? "from " + p0.toFixed(1) + "%" : "now"}</small>
          </>
        }
      >
        <div className="bar">
          <i className="af" style={{ width: Math.min(100, p1) + "%" }} />
          {moved && (
            <i className="bf" style={{ width: Math.min(100, p0) + "%" }} />
          )}
        </div>
        <div className="sb">
          <b>{big(v1)}</b> of {big(mctx.after.budget)}
          {moved && (
            <>
              {" "}
              · adds <b>{big(v1 - v0)}</b>
            </>
          )}
        </div>
      </Card>
    );
  };
  const kv = (k, v, x) => (
    <div className="kv" key={k}>
      <span>{k}</span>
      <b>{v}</b>
      {x}
    </div>
  );

  const groupOpts = () => {
    const o = [{ id: "rating", label: "Manager Rating" }],
      seen = {};
    fdefs.forEach((d) => {
      if (d.type === "select" && d.field && !seen[d.field]) {
        seen[d.field] = 1;
        o.push({ id: d.field, label: d.label });
      }
    });
    if (!seen.band) o.splice(1, 0, { id: "band", label: "Band" });
    return o;
  };
  const groupKey = (e, g) => {
    if (g === "rating") {
      const b = bucket(e);
      return b == null ? "No rating" : String(b);
    }
    const v = e[g];
    return v == null || v === "" ? "—" : String(v);
  };

  const spreadTab = () => {
    const opts = groupOpts(),
      g0 = opts.some((o) => o.id === gb) ? gb : "rating";
    const sel = (
      <div className="gb">
        <label htmlFor="gbSel">Group by</label>
        <select
          id="gbSel"
          value={g0}
          onChange={(e) => {
            setGb(e.target.value);
            lsSet(GB_KEY, e.target.value);
          }}
        >
          {opts.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
    if (!pv)
      return (
        <>
          {sel}
          <div className="empty">
            Click Preview to see the average hike % for each group.
          </div>
        </>
      );
    const g = {};
    mctx.rows.forEach((e) => {
      const k = groupKey(e, g0);
      (g[k] = g[k] || []).push(
        (pv.res[e.empId].after.hikeAmt / e.basePay) * 100,
      );
    });
    const keys = Object.keys(g).sort((a, b) => {
      if (g0 === "rating") {
        const x = a === "No rating" ? -1 : +a,
          y = b === "No rating" ? -1 : +b;
        return y - x;
      }
      return a < b ? -1 : a > b ? 1 : 0;
    });
    if (!keys.length)
      return (
        <>
          {sel}
          <div className="empty">No rows change in this preview.</div>
        </>
      );
    const avg = keys.map((k) => g[k].reduce((x, y) => x + y, 0) / g[k].length),
      mx = Math.max.apply(null, avg.concat([0.01]));
    return (
      <>
        {sel}
        <div className="gl">
          {keys.map((k, i) => (
            <div className="gr" key={k}>
              <span className="gk">{k}</span>
              <span className="t">
                <i style={{ width: Math.round((avg[i] / mx) * 100) + "%" }} />
              </span>
              <b>{avg[i].toFixed(1)}%</b>
              <span className="gn">{g[k].length}</span>
            </div>
          ))}
        </div>
        <div className="note2">
          Average hike % of the rows that change · last column is the number of
          rows.
        </div>
      </>
    );
  };
  const budgetTab = () => {
    const x0 = mctx.before,
      x1 = mctx.after,
      moved = !!pv && Math.abs(x1.util - x0.util) > 0.005,
      add = x1.used - x0.used,
      left = x1.left;
    const dl =
      !pv || Math.abs(add) < 0.5 ? null : add > 0 ? (
        <span className="up">▲ {big(add)}</span>
      ) : (
        <span className="dn">▼ {big(-add)}</span>
      );
    return (
      <>
        <div className={"ic" + (x1.util > 100 ? " red" : "")}>
          <div className="tg">Budget utilised</div>
          <div className="bn">
            {x1.util.toFixed(1)}%
            <small>{moved ? "from " + x0.util.toFixed(1) + "%" : "now"}</small>
          </div>
          <div className="bar">
            <i className="af" style={{ width: Math.min(100, x1.util) + "%" }} />
            {moved && (
              <i
                className="bf"
                style={{ width: Math.min(100, x0.util) + "%" }}
              />
            )}
          </div>
          <div className="sb">
            incl. Target PB <b>{x1.utilT.toFixed(1)}%</b>
            {moved && <small> from {x0.utilT.toFixed(1)}%</small>}
          </div>
        </div>
        <div className="kvs">
          {kv("Budget", big(x1.budget))}
          {kv("Consumed now", big(x0.used))}
          {kv("Consumed after", pv ? big(x1.used) : "—", dl)}
          {kv(left >= 0 ? "Left" : "Over budget", big(Math.abs(left)))}
        </div>
        <div className="note2" style={{ marginTop: 0 }}>
          {pv
            ? "Consumed = Hike + PB + RB. Nothing is saved until Apply."
            : "Consumed = Hike + PB + RB. Click Preview to see the effect of this change."}
        </div>
        {shareCard("Hike as budget consumed", "amber", ["hikeAmt"])}
        {shareCard("Bonus as budget consumed", "violet", ["newPB", "newRB"])}
        <div className="grad" />
        <div className="chip-sec">Spread</div>
        {spreadTab()}
      </>
    );
  };
  const checksTab = () => {
    if (!pv)
      return <div className="empty">Click Preview to run the checks.</div>;
    const n = pv.n,
      noR = vRows.filter((e) => e.rating == null).length,
      left = mctx.after.left;
    const row = (key, cls, t, v) => (
      <div
        key={key}
        className={"ck" + (v ? " go" : "") + (checkF === key ? " on" : "")}
        title={v ? "Click to see these rows in the grid" : undefined}
        onClick={
          v
            ? () => {
                setCheckF(checkF === key ? "" : key);
                setPage(1);
              }
            : undefined
        }
      >
        <span className={"tag t-" + cls}>{v}</span>
        <span>{t}</span>
      </div>
    );
    return (
      <>
        <div className="cks">
          {row("chg", "info", "Rows will change", n.chg)}
          {row("skip", "grey", "Skipped · edited by hand", n.skip)}
          {row("off", "grey", "Left out · unticked", n.off)}
          {row("same", "grey", "No change", n.same)}
          {row("range", n.range ? "warn" : "ok", "Out of band range", n.range)}
          {row(
            "norating",
            noR ? "warn" : "ok",
            "Without a Manager Rating",
            noR,
          )}
        </div>
        {left >= 0 ? (
          <div className="callout ok">
            <b>Within budget</b>
            <br />
            {big(left)} left after this change.
          </div>
        ) : (
          <div className="callout warn">
            <b>Over budget</b>
            <br />
            This change takes the budget {big(-left)} over.
          </div>
        )}
      </>
    );
  };
  const historyTab = () => {
    if (!batches.length)
      return (
        <div className="mini" style={{ padding: "6px 2px" }}>
          Nothing applied yet in this cycle.
        </div>
      );
    return (
      <div className="bh">
        {batches
          .slice()
          .reverse()
          .map((x) => {
            const armed =
              restoreAt.id === x.id && Date.now() - restoreAt.t < 6000;
            return (
              <div className="bhr" key={x.id}>
                <div className="bht">
                  <b>{x.time}</b> · {x.by} · {x.rows.length} row
                  {x.rows.length === 1 ? "" : "s"}
                  {x.restored && (
                    <>
                      {" "}
                      <span className="tag t-grey">Restored</span>
                    </>
                  )}
                </div>
                <div className="mini">{x.text}</div>
                {!x.restored && (
                  <button
                    className="btn"
                    type="button"
                    onClick={() => armRestore(x.id)}
                  >
                    {armed
                      ? "Confirm restore · " +
                        x.rows.length +
                        " row" +
                        (x.rows.length === 1 ? "" : "s")
                      : "Restore previous values"}
                  </button>
                )}
              </div>
            );
          })}
      </div>
    );
  };

  /* header budget */
  const kp = (v0, v1) =>
    pv && Math.abs(v1 - v0) > 0.005 ? (
      <strong className={lvl(v1)}>
        {v0.toFixed(1)}% <small>→</small> {v1.toFixed(1)}%
      </strong>
    ) : (
      <strong className={lvl(v0)}>{v0.toFixed(1)}%</strong>
    );

  const lb = lastBatch(),
    lbArmed = lb && restoreAt.id === lb.id && Date.now() - restoreAt.t < 6000;
  const okPv = !!pv && pv.n.chg > 0 && !locked && !busy;

  /* ============================== render ============================== */
  return (
    <div
      className={"bo" + (fold ? " folded" : "") + (impOpen ? " impOpen" : "")}
      style={{ "--bo-h": height }}
    >
      <style>{CSS}</style>

      <div className="topbar">
        <div className="tb-r">
          <div className="tk">
            <span>Budget Allocated</span>
            <strong>{big(bPv.budget)}</strong>
          </div>
          <div className="tk">
            <span>Utilisation</span>
            {kp(b0.util, bPv.util)}
          </div>
          <div className="tk">
            <span>Incl. Target PB</span>
            {kp(b0.utilT, bPv.utilT)}
          </div>
        </div>
      </div>

      <div className="work">
        <div
          id="mainCol"
          ref={mainRef}
          onWheel={onMainWheel}
          onScroll={onMainScroll}
        >
          <div id="topWrap">
            <div className="card" id="ruleCard">
              <div className="card-h">
                <h2>Bulk operations</h2>
                <span className="sp" />
                <button
                  className="btn pri"
                  type="button"
                  onClick={doPreview}
                  disabled={locked || busy || loading}
                >
                  Preview
                </button>
                <button
                  className={"btn main" + (confirmAt ? " confirm" : "")}
                  type="button"
                  onClick={askApply}
                  disabled={!okPv}
                >
                  {applyLabel()}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={discard}
                  disabled={!pv}
                >
                  Discard preview
                </button>
                <div className="more">
                  <button
                    className="btn"
                    type="button"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      setMoreOpen((o) => !o);
                    }}
                  >
                    ⋯ More
                  </button>
                  <div className={"menu" + (moreOpen ? " on" : "")}>
                    <button
                      type="button"
                      disabled={!pv || locked}
                      onClick={() => {
                        const r0 = rules[0];
                        let nm =
                          FIELDS[r0.field].label +
                          " " +
                          (r0.value + (r0.field === "hikePct" ? "%" : ""));
                        if (rules.length > 1)
                          nm += " + " + (rules.length - 1) + " more";
                        setScnForm({ name: nm });
                      }}
                    >
                      Save as scenario
                    </button>
                    <button type="button" onClick={() => setScnOpen((o) => !o)}>
                      Scenarios &amp; history ›
                    </button>
                    <button
                      type="button"
                      disabled={!lb || busy || locked}
                      onClick={(ev) => {
                        if (!lb) return;
                        if (
                          !(
                            restoreAt.id === lb.id &&
                            Date.now() - restoreAt.t < 6000
                          )
                        )
                          ev.stopPropagation();
                        armRestore(lb.id);
                      }}
                    >
                      {!lb
                        ? "Restore last apply"
                        : (lbArmed
                            ? "Confirm restore · "
                            : "Restore last apply · ") +
                          lb.rows.length +
                          " row" +
                          (lb.rows.length === 1 ? "" : "s")}
                    </button>
                    <hr />
                    <button type="button" onClick={() => withXLSX(exportXlsx)}>
                      Export to Excel
                    </button>
                    <button type="button" disabled={busy} onClick={doReset}>
                      Reset
                    </button>
                  </div>
                </div>
                <button
                  className="btn"
                  type="button"
                  title="Fold this section"
                  onClick={() => setFold(true)}
                >
                  Fold ▴
                </button>
              </div>
              <div className="card-b">
                {scnForm && (
                  <span
                    style={{
                      display: "inline-flex",
                      gap: 6,
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <input
                      type="text"
                      placeholder="Scenario name"
                      style={{ width: 220 }}
                      autoFocus
                      value={scnForm.name}
                      onChange={(e) => setScnForm({ name: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveScn();
                        if (e.key === "Escape") setScnForm(null);
                      }}
                    />
                    <button className="btn pri" type="button" onClick={saveScn}>
                      Save
                    </button>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => setScnForm(null)}
                    >
                      Cancel
                    </button>
                  </span>
                )}
                <div className="two">
                  <div className="colL">
                    <div className="sec">
                      <span className="n">1</span>
                      <b>What to change</b>
                    </div>
                    <div>
                      {rules.map((r) => {
                        const F = FIELDS[r.field],
                          dist = r.method === "dist" && F.kind === "amt",
                          adj = r.method === "adj" && F.kind === "amt",
                          taken = usedKeys(rules, r.uid);
                        const er = showE ? validation.map[r.uid] || {} : {};
                        const ec = (k) => ({
                          className: er[k] ? "err" : undefined,
                          title: er[k] || undefined,
                        });
                        return (
                          <div className="rrow" key={r.uid}>
                            <div className="f">
                              <label>Field</label>
                              <select
                                data-k="field"
                                value={isHike(r.field) ? "hikePct" : r.field}
                                onChange={(e) => {
                                  if (
                                    e.target.value === "hikePct" &&
                                    isHike(r.field)
                                  )
                                    return;
                                  replaceRule(r.uid, e.target.value, false);
                                }}
                              >
                                {FORDER.map((f) => {
                                  const dis =
                                      (taken[FIELDS[f].key] && f !== r.field) ||
                                      (!canEdit(FIELDS[f].key) &&
                                        f !== r.field),
                                    cur =
                                      f === r.field ||
                                      (f === "hikePct" && isHike(r.field));
                                  return (
                                    <option
                                      key={f}
                                      value={f}
                                      disabled={dis && !cur}
                                    >
                                      {f === "hikePct"
                                        ? "Hike"
                                        : FIELDS[f].label}
                                    </option>
                                  );
                                })}
                              </select>
                            </div>
                            <div className="f">
                              <label>How</label>
                              <select
                                data-k="method"
                                value={r.method}
                                onChange={(e) =>
                                  updRule(r.uid, {
                                    method: e.target.value,
                                    unit:
                                      e.target.value === "same"
                                        ? r.unit
                                        : "amt",
                                  })
                                }
                              >
                                <option value="same">Same value for all</option>
                                {F.kind === "amt" && (
                                  <option value="adj">Add or reduce</option>
                                )}
                                {F.kind === "amt" && (
                                  <option value="dist">
                                    Distribute a total
                                  </option>
                                )}
                              </select>
                            </div>
                            {isHike(r.field) && !dist && !adj && (
                              <div className="f">
                                <label>Value is</label>
                                <select
                                  data-k="hikeUnit"
                                  value={r.field === "hikePct" ? "pct" : "amt"}
                                  onChange={(e) =>
                                    replaceRule(
                                      r.uid,
                                      e.target.value === "pct"
                                        ? "hikePct"
                                        : "hikeAmt",
                                      true,
                                    )
                                  }
                                >
                                  <option value="pct">% of Base pay</option>
                                  <option value="amt">Amount</option>
                                </select>
                              </div>
                            )}
                            {!isHike(r.field) &&
                              F.unitPick &&
                              !dist &&
                              !adj && (
                                <div className="f">
                                  <label>Value is</label>
                                  <select
                                    data-k="unit"
                                    value={r.unit}
                                    onChange={(e) =>
                                      updRule(r.uid, { unit: e.target.value })
                                    }
                                  >
                                    <option value="amt">Amount</option>
                                    <option value="pct">% of Base pay</option>
                                  </select>
                                </div>
                              )}
                            {adj && (
                              <>
                                <div className="f">
                                  <label>Change</label>
                                  <select
                                    data-k="adjDir"
                                    value={r.adjDir}
                                    onChange={(e) =>
                                      updRule(r.uid, { adjDir: e.target.value })
                                    }
                                  >
                                    <option value="add">Add</option>
                                    <option value="sub">Reduce</option>
                                  </select>
                                </div>
                                <div className="f">
                                  <label>By amount</label>
                                  <input
                                    type="number"
                                    data-k="adjAmt"
                                    step="any"
                                    min="0"
                                    value={r.adjAmt}
                                    style={{ width: 130, textAlign: "right" }}
                                    onChange={(e) =>
                                      updRule(r.uid, { adjAmt: e.target.value })
                                    }
                                    {...ec("adjAmt")}
                                  />
                                </div>
                              </>
                            )}
                            {dist && (
                              <>
                                <div className="f">
                                  <label>Total from</label>
                                  <select
                                    data-k="distSrc"
                                    value={r.distSrc}
                                    onChange={(e) =>
                                      updRule(r.uid, {
                                        distSrc: e.target.value,
                                      })
                                    }
                                    {...ec("distSrc")}
                                  >
                                    <option value="amount">
                                      An amount I enter
                                    </option>
                                    <option value="remaining">
                                      Remaining budget
                                    </option>
                                  </select>
                                </div>
                                {r.distSrc === "amount" ? (
                                  <div className="f">
                                    <label>Total amount</label>
                                    <input
                                      type="number"
                                      data-k="distAmt"
                                      step="any"
                                      min="0"
                                      value={r.distAmt}
                                      style={{ width: 130, textAlign: "right" }}
                                      onChange={(e) =>
                                        updRule(r.uid, {
                                          distAmt: e.target.value,
                                        })
                                      }
                                      {...ec("distAmt")}
                                    />
                                  </div>
                                ) : (
                                  <div className="f">
                                    <label>Remaining budget</label>
                                    <span className="unit">
                                      <b>{big(rem)}</b>
                                    </span>
                                  </div>
                                )}
                                <div className="f">
                                  <label>Split</label>
                                  <select
                                    data-k="distBy"
                                    value={r.distBy}
                                    onChange={(e) =>
                                      updRule(r.uid, { distBy: e.target.value })
                                    }
                                  >
                                    <option value="equal">Equally</option>
                                    <option value="base">
                                      In proportion to Base pay
                                    </option>
                                  </select>
                                </div>
                              </>
                            )}
                            {!adj && !dist && (
                              <div className="f">
                                <label>
                                  {r.field === "hikePct" ? "Hike %" : "Value"}
                                </label>
                                <input
                                  type="number"
                                  data-k="value"
                                  step="any"
                                  min="0"
                                  value={r.value}
                                  style={{ width: 110, textAlign: "right" }}
                                  onChange={(e) =>
                                    updRule(r.uid, { value: e.target.value })
                                  }
                                  {...ec("value")}
                                />
                              </div>
                            )}
                            <button
                              className="btn xbtn"
                              type="button"
                              title="Remove this field"
                              disabled={rules.length === 1}
                              onClick={() => rmRule(r.uid)}
                            >
                              ✕
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    <button
                      className="btn add"
                      type="button"
                      onClick={addField}
                      disabled={
                        !FORDER.some(
                          (f) =>
                            !usedKeys(rules, 0)[FIELDS[f].key] &&
                            canEdit(FIELDS[f].key),
                        )
                      }
                    >
                      + Add another field
                    </button>
                    <div className="rnote">
                      Add or reduce works on each row's current value and never
                      goes below 0 or the amount to be paid. Distribute splits
                      one total across the selected rows.
                    </div>
                  </div>

                  <div className="colR">
                    <div className="sec">
                      <span className="n">2</span>
                      <b>For whom</b>
                      <span className="hint">leave empty = everyone</span>
                    </div>
                    <span id="fbSearch">
                      {fdef("q") && (
                        <input
                          type="text"
                          placeholder="Search name / ID / designation"
                          value={filt.q || ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setFilt((f) => {
                              const n = Object.assign({}, f);
                              if (v) n.q = v;
                              else delete n.q;
                              return n;
                            });
                            setPage(1);
                            touch();
                          }}
                        />
                      )}
                    </span>
                    <div className="chips">
                      {active.map((id) => {
                        const d = fdef(id);
                        if (!d || hiddenForRole(d)) return null;
                        const v = filt[id] || [],
                          txt = v.length
                            ? v.map((x) => valLabel(d, x)).join(", ")
                            : "All";
                        return (
                          <span
                            key={id}
                            className={"fchip" + (v.length ? " has" : "")}
                          >
                            <button
                              className="fc-b"
                              type="button"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                if (pop && pop.kind === "vals" && pop.id === id)
                                  setPop(null);
                                else openPop("vals", id, ev.currentTarget);
                              }}
                            >
                              <b>{d.label}</b> {txt}
                            </button>
                            <button
                              className="fc-x"
                              type="button"
                              title="Remove this filter"
                              onClick={(ev) => {
                                ev.stopPropagation();
                                const a = active.filter((x) => x !== id);
                                setActive(a);
                                saveMine(a);
                                setFiltVals(id, []);
                                setPop(null);
                              }}
                            >
                              ✕
                            </button>
                          </span>
                        );
                      })}
                      <button
                        className="addf"
                        type="button"
                        disabled={!availF.length}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          if (pop && pop.kind === "add") setPop(null);
                          else openPop("add", null, ev.currentTarget);
                        }}
                      >
                        ＋ Filter ▾
                      </button>
                    </div>
                    <div className="res">
                      <span className="cnt">
                        <span className="big">{vN}</span>
                        <small>
                          of {scope.length} employee
                          {scope.length === 1 ? "" : "s"}
                        </small>
                      </span>
                      <div className="meter">
                        <i
                          style={{
                            width:
                              (scope.length
                                ? Math.round((vN / scope.length) * 100)
                                : 0) + "%",
                          }}
                        />
                      </div>
                      <button
                        className={"btn lnk" + (anyF ? "" : " hide")}
                        type="button"
                        onClick={() => {
                          setFilt({});
                          setPage(1);
                          touch();
                        }}
                      >
                        Clear all
                      </button>
                    </div>
                    <label className="opt">
                      <input
                        type="checkbox"
                        checked={skipHand}
                        onChange={(e) => {
                          setSkipHand(e.target.checked);
                          setPage(1);
                          touch();
                        }}
                      />
                      <span className="sw" />
                      Skip rows already edited by hand
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {fold && (
            <div className="fold">
              <span className="t">
                For{" "}
                <b>
                  {fp.length
                    ? fp.map((p, i) => (
                        <React.Fragment key={i}>
                          {i > 0 && " · "}
                          {p.l && p.l + " "}
                          <b>{p.v}</b>
                        </React.Fragment>
                      ))
                    : "Everyone"}
                </b>{" "}
                · <b>{vN}</b> of {scope.length}
              </span>
              <span className="t">
                Change <b>{ruleText(rules)}</b>
              </span>
              <span className="bud">
                Budget {bPv.util.toFixed(1)}%
                {pv && Math.abs(bPv.util - pv.before.util) > 0.005 && (
                  <small> from {pv.before.util.toFixed(1)}%</small>
                )}
              </span>
              <span className="sp" />
              <button
                className="btn pri"
                type="button"
                disabled={locked || busy || loading}
                onClick={doPreview}
              >
                Preview
              </button>
              <button
                className={"btn main" + (confirmAt ? " confirm" : "")}
                type="button"
                disabled={!okPv}
                onClick={askApply}
              >
                {applyLabel()}
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => setFold(false)}
              >
                Expand ▾
              </button>
            </div>
          )}

          <div id="strip">
            {locked ? (
              <div className="strip warn">
                <b>Cycle locked</b>
                <span>
                  {lockReason ||
                    "Edits are allowed only while the cycle is Active, Start Appraisal is done and Finalisation is not."}{" "}
                  Bulk changes are switched off.
                </span>
              </div>
            ) : loading ? (
              <div className="strip info">
                <span>Loading employees from the server…</span>
              </div>
            ) : err ? (
              <div className="strip warn">
                <b>Not saved</b>
                <span>{err}</span>
              </div>
            ) : flash ? (
              <div className="strip ok">
                <b>{flash}</b>
              </div>
            ) : pv ? (
              <div className="strip info">
                <span>
                  <b>{pv.n.chg}</b> row{pv.n.chg === 1 ? "" : "s"} will change
                  {pv.rules.length > 1
                    ? " (" + pv.rules.length + " fields)"
                    : ""}
                </span>
                {pv.n.skip > 0 && (
                  <span>{pv.n.skip} skipped (edited by hand)</span>
                )}
                {pv.n.off > 0 && <span>{pv.n.off} not selected</span>}
                {pv.n.same > 0 && (
                  <span>{pv.n.same} already at these values</span>
                )}
                {pv.n.norating > 0 && (
                  <span>
                    {pv.n.norating} rating-based value
                    {pv.n.norating === 1 ? "" : "s"} skipped (no rating)
                  </span>
                )}
                {pv.n.adj > 0 && (
                  <span>{pv.n.adj} adjusted by the PB / RB rule</span>
                )}
                {pv.n.range > 0 && (
                  <span>{pv.n.range} outside the band range</span>
                )}
                {pv.n.chg > 500 && (
                  <span>
                    Saves in {Math.ceil(pv.n.chg / 500)} batches of up to 500
                  </span>
                )}
              </div>
            ) : (
              <div className="strip info">
                <span>
                  Choose one or more fields, then click <b>Preview</b>. The grid
                  shows Current, Proposed and Change for every field before
                  anything is saved.
                </span>
              </div>
            )}
          </div>

          <div id="cardsWrap">
            <div
              className="impbar"
              id="impBar"
              role="button"
              tabIndex={0}
              title="Show or hide the metrics panel"
              onClick={() => {
                setImpOpenS(true);
                lsSet(IMP_KEY, "1");
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" || ev.key === " ") {
                  ev.preventDefault();
                  setImpOpenS(true);
                  lsSet(IMP_KEY, "1");
                }
              }}
            >
              {!noRows && (
                <>
                  <span className="tg2">Impact</span>
                  <span className="k">
                    Budget utilised <b>{mctx.after.util.toFixed(1)}%</b>
                    {pv &&
                      Math.abs(mctx.after.util - mctx.before.util) > 0.005 && (
                        <small> from {mctx.before.util.toFixed(1)}%</small>
                      )}
                  </span>
                  <span className="k">
                    Hike <b>{sharePct(["hikeAmt"]).toFixed(1)}%</b>
                  </span>
                  <span className="k">
                    Bonus <b>{sharePct(["newPB", "newRB"]).toFixed(1)}%</b>
                  </span>
                  <span className="k">
                    <b>{big(Math.abs(mctx.after.left))}</b>{" "}
                    {mctx.after.left >= 0 ? "left" : "over budget"}
                    {incTpb && <small> incl. Target PB</small>}
                  </span>
                  <span style={{ flex: 1 }} />
                  <span className="k">‹ Details</span>
                </>
              )}
            </div>
            <div className={"card scn" + (scnOpen ? "" : " hide")} id="scnCard">
              <div className="card-h">
                <h2>Scenarios &amp; history</h2>
                <span className="note">
                  A scenario keeps the whole rule (all fields) and its budget
                  effect, so options can be compared before one is applied.
                </span>
              </div>
              <div className="card-b">
                <h3>Saved scenarios</h3>
                {!scenarios.length ? (
                  <div className="mini">
                    No scenarios yet. Preview a rule and use “Save as scenario”.
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Rule</th>
                        <th className="r">Rows to change</th>
                        <th className="r">Utilisation after</th>
                        <th className="r">Incl. Target PB after</th>
                        <th />
                      </tr>
                    </thead>
                    <tbody>
                      {scenarios.map((s, i) => (
                        <tr key={i}>
                          <td>
                            <b>{s.name}</b>
                          </td>
                          <td>{s.text}</td>
                          <td className="r">{s.rows}</td>
                          <td className="r">{s.util.toFixed(1)}%</td>
                          <td className="r">{s.utilT.toFixed(1)}%</td>
                          <td>
                            <button
                              className="btn"
                              type="button"
                              onClick={() => loadScn(i)}
                            >
                              Load
                            </button>{" "}
                            <button
                              className="btn"
                              type="button"
                              onClick={() => {
                                const l = scenarios.filter((_, j) => j !== i);
                                setScenarios(l);
                                persistScn(l);
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div style={{ height: 12 }} />
                <h3>Applied this session</h3>
                {!batches.length ? (
                  <div className="mini">Nothing applied in this session.</div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Time</th>
                        <th>Rule</th>
                        <th className="r">Rows</th>
                        <th>Source</th>
                      </tr>
                    </thead>
                    <tbody>
                      {batches
                        .slice()
                        .reverse()
                        .map((x) => (
                          <tr key={x.id}>
                            <td>{x.time}</td>
                            <td>{x.text}</td>
                            <td className="r">{x.rows.length}</td>
                            <td>bulk · {x.id}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>

          <div className="card grid-card">
            <div
              className="gw"
              ref={gwRef}
              onScroll={onGwScroll}
              onWheel={onGwWheel}
            >
              <table style={{ width: totalW }}>
                <colgroup>
                  {C.map((c) => (
                    <col key={c.k} style={{ width: widthOf(c) }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {C.map((c) => {
                      let cls =
                        (c.c || "") +
                        (c.r ? " r" : "") +
                        (c.ns ? " nosort" : " sort") +
                        (wrapC[c.k] ? " wrap" : "");
                      if (sort.key === c.k)
                        cls += sort.dir > 0 ? " asc" : " desc";
                      return (
                        <th
                          key={c.k}
                          className={cls.trim()}
                          onClick={(ev) => {
                            if (
                              ev.target.closest(".col-rs") ||
                              ev.target.closest(".filter-btn") ||
                              c.ns
                            )
                              return;
                            setSort((s) =>
                              s.key === c.k
                                ? { key: c.k, dir: -s.dir }
                                : { key: c.k, dir: 1 },
                            );
                          }}
                        >
                          <div className="th-inner">
                            <span>{c.t}</span>
                            {!c.ns && (
                              <button
                                type="button"
                                title="Filter"
                                className={
                                  "filter-btn" +
                                  (colF[c.k] ? " filtered" : "") +
                                  (fpop && fpop.k === c.k ? " active" : "")
                                }
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  if (fpop && fpop.k === c.k) {
                                    setFpop(null);
                                    return;
                                  }
                                  const r =
                                    ev.currentTarget.getBoundingClientRect();
                                  setFpop({
                                    k: c.k,
                                    left: Math.min(
                                      Math.max(8, r.left),
                                      window.innerWidth - 278,
                                    ),
                                    top: r.bottom + 4,
                                  });
                                }}
                              >
                                ▾
                              </button>
                            )}
                          </div>
                          <div
                            className={"col-rs" + (drag ? " on" : "")}
                            onMouseDown={(ev) => {
                              ev.preventDefault();
                              ev.stopPropagation();
                              const th = ev.currentTarget.parentNode,
                                x0 = ev.clientX,
                                w0 = th.getBoundingClientRect().width;
                              setDrag(true);
                              const mv = (e2) =>
                                setColW((w) =>
                                  Object.assign({}, w, {
                                    [c.k]: Math.max(
                                      c.k === "name" ? 180 : 60,
                                      Math.round(w0 + e2.clientX - x0),
                                    ),
                                  }),
                                );
                              const up = () => {
                                setDrag(false);
                                document.removeEventListener("mousemove", mv);
                                document.removeEventListener("mouseup", up);
                                setColW((w) => {
                                  lsSet(COLW_KEY, JSON.stringify(w));
                                  return w;
                                });
                              };
                              document.addEventListener("mousemove", mv);
                              document.addEventListener("mouseup", up);
                            }}
                          />
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {!slice.length ? (
                    <tr>
                      <td colSpan={C.length} className="empty">
                        No employees match the filters.
                      </td>
                    </tr>
                  ) : (
                    slice.map((e) => {
                      const p = pv && pv.res[e.empId],
                        chg = p && p.st === "chg",
                        af = chg ? p.after : e,
                        hp = (af.hikeAmt / e.basePay) * 100;
                      const w = (k) => (wrapC[k] ? " wrap" : "");
                      const cells = [];
                      rules.forEach((r, i) => {
                        const F = FIELDS[r.field],
                          cur = dispVal(r, e, e);
                        let prop = "—",
                          ct = null;
                        if (pv) {
                          prop = dispVal(r, e, chg ? af : e);
                          if (chg) {
                            const d = fieldNum(r, e, af) - fieldNum(r, e, e);
                            if (Math.abs(d) > 1e-9)
                              ct = (
                                <span className={d > 0 ? "up" : "dn"}>
                                  {d > 0 ? "+" : "▼ "}
                                  {F.kind === "pct"
                                    ? Math.abs(d).toFixed(2) + " pp"
                                    : inr(Math.abs(d))}
                                </span>
                              );
                          }
                        }
                        const changed =
                          chg && String(af[F.key]) !== String(e[F.key]);
                        cells.push(
                          <td key={"c" + i} className={"r" + w("cur" + i)}>
                            {cur}
                          </td>,
                          <td
                            key={"p" + i}
                            className={
                              "r pc" + (changed ? "" : " same") + w("prop" + i)
                            }
                          >
                            {prop}
                          </td>,
                          <td key={"h" + i} className={"r" + w("chg" + i)}>
                            {ct}
                          </td>,
                        );
                      });
                      const tg = (t, m, k) => (
                        <span key={k} className={"tag t-" + t}>
                          {m}
                        </span>
                      );
                      const notes = [];
                      if (p) {
                        if (p.st === "skip")
                          notes.push(
                            tg("grey", "Skipped · edited by hand", "s"),
                          );
                        else if (p.st === "off")
                          notes.push(tg("grey", "Not selected", "o"));
                        else if (p.st === "same" || p.st === "norating") {
                          if (p.st === "same")
                            notes.push(tg("grey", "No change", "n"));
                          p.notes.forEach((x, i) =>
                            notes.push(tg(x.t, x.m, "x" + i)),
                          );
                        } else if (chg)
                          p.notes.forEach((x, i) =>
                            notes.push(tg(x.t, x.m, "x" + i)),
                          );
                      }
                      if (!pv || !p || p.st !== "chg") {
                        if (e.bulk) notes.push(tg("ok", "Bulk applied", "b"));
                        else if (e.hand && !(p && p.st === "skip"))
                          notes.push(tg("info", "Edited by hand", "e"));
                      }
                      return (
                        <tr key={e.empId}>
                          <td
                            className={"c1" + w("name")}
                            title={
                              e.empId + " - " + e.name + " - " + e.designation
                            }
                          >
                            <div className="emp">
                              <span
                                className={
                                  "eb" + (e.hand || e.bulk ? "" : " none")
                                }
                              />
                              <input
                                type="checkbox"
                                checked={!off[e.empId]}
                                onChange={(ev) => {
                                  const on = ev.target.checked;
                                  setOff((o) => {
                                    const n = Object.assign({}, o);
                                    if (on) delete n[e.empId];
                                    else n[e.empId] = 1;
                                    return n;
                                  });
                                  touch();
                                }}
                              />
                              <div className="et">
                                <span className="en">
                                  {e.empId} - {e.name}
                                </span>
                                <span className="dsg">{e.designation}</span>
                              </div>
                            </div>
                          </td>
                          <td className={w("band").trim()}>{e.band}</td>
                          <td className={"r" + w("rating")}>
                            {e.rating == null ? "—" : e.rating.toFixed(1)}
                          </td>
                          <td className={"r" + w("basePay")}>
                            {inr(e.basePay)}
                          </td>
                          {cells}
                          <td className={"r" + w("hikePct")}>{pct(hp)}</td>
                          <td className={"r" + w("newBase")}>
                            {inr(e.basePay + af.hikeAmt)}
                          </td>
                          <td className={"r" + w("ctc")}>
                            {inr(e.basePay + af.hikeAmt + af.newPB + af.newRB)}
                          </td>
                          <td className={w("note").trim()}>{notes}</td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    {(() => {
                      let sBase = 0,
                        sNew = 0,
                        sCtc = 0;
                      const sc = rules.map(() => ({ c: 0, p: 0 }));
                      rows.forEach((e) => {
                        const af = afterOf(e, pv);
                        sBase += e.basePay;
                        sNew += e.basePay + af.hikeAmt;
                        sCtc += e.basePay + af.hikeAmt + af.newPB + af.newRB;
                        rules.forEach((r, i) => {
                          sc[i].c += fieldNum(r, e, e);
                          sc[i].p += fieldNum(r, e, af);
                        });
                      });
                      return (
                        <>
                          <td className="c1">
                            Total · {total} employee{total === 1 ? "" : "s"}
                          </td>
                          <td />
                          <td />
                          <td className="r">{inr(sBase)}</td>
                          {rules.map((r, i) => {
                            const amt = FIELDS[r.field].kind === "amt";
                            return (
                              <React.Fragment key={i}>
                                <td className="r">{amt ? inr(sc[i].c) : ""}</td>
                                <td className="r">
                                  {amt && pv ? inr(sc[i].p) : ""}
                                </td>
                                <td className="r">
                                  {amt && pv ? inr(sc[i].p - sc[i].c) : ""}
                                </td>
                              </React.Fragment>
                            );
                          })}
                          <td />
                          <td className="r">{inr(sNew)}</td>
                          <td className="r">{inr(sCtc)}</td>
                          <td />
                        </>
                      );
                    })()}
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="pager">
              <span>
                Showing {total ? from + 1 : 0}–{Math.min(total, from + PAGE)} of{" "}
                {total}
              </span>
              <span>·</span>
              <span>{rows.filter((e) => !off[e.empId]).length} selected</span>
              {checkF && pv && (
                <span className="tag t-info" style={{ marginLeft: 6 }}>
                  Showing: {CK_LBL[checkF]}{" "}
                  <button
                    className="btn lnk"
                    type="button"
                    onClick={() => {
                      setCheckF("");
                      setPage(1);
                    }}
                  >
                    ✕ Clear
                  </button>
                </span>
              )}
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setOff({});
                  touch();
                }}
              >
                Select all in view
              </button>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  const o = {};
                  vRows.forEach((e) => {
                    o[e.empId] = 1;
                  });
                  setOff(o);
                  touch();
                }}
              >
                Clear selection
              </button>
              <span className="sp" />
              <button
                className="btn"
                type="button"
                disabled={pg <= 1}
                onClick={() => setPage(pg - 1)}
              >
                ‹ Prev
              </button>
              <span>
                Page {pg} of {pages}
              </span>
              <button
                className="btn"
                type="button"
                disabled={pg >= pages}
                onClick={() => setPage(pg + 1)}
              >
                Next ›
              </button>
            </div>
          </div>
        </div>

        <aside id="metPanel" aria-label="Metrics">
          <div className="mp-h">
            <div className="mp-t">
              <b>Metrics</b>
              <span>
                {cyc.name} · {fpText}
              </span>
            </div>
            <button
              id="metX"
              type="button"
              title="Close"
              onClick={() => {
                setImpOpenS(false);
                lsSet(IMP_KEY, "0");
              }}
            >
              ✕
            </button>
          </div>
          <div className="mp-tabs">
            {[
              ["budget", "Budget"],
              ["checks", "Checks"],
              ["history", "History"],
            ].map((t) => (
              <button
                key={t[0]}
                type="button"
                className={pt === t[0] ? "on" : ""}
                onClick={() => {
                  setPt(t[0]);
                  lsSet(PT_KEY, t[0]);
                }}
              >
                {t[1]}
              </button>
            ))}
          </div>
          <div className="mp-b">
            <div className="imp" id="imp">
              {!noRows && (
                <>
                  <div className="tpbopt">
                    <span>Budget left</span>
                    <select
                      value={incTpb ? "1" : "0"}
                      onChange={(e) => {
                        const v = e.target.value === "1";
                        setIncTpb(v);
                        lsSet(TPB_KEY, v ? "1" : "0");
                      }}
                    >
                      <option value="0">Without Target PB</option>
                      <option value="1">With Target PB</option>
                    </select>
                  </div>
                  {pt === "checks"
                    ? checksTab()
                    : pt === "history"
                      ? historyTab()
                      : budgetTab()}
                </>
              )}
            </div>
          </div>
        </aside>
        <button
          id="metTab"
          type="button"
          title="Open the metrics panel"
          onClick={() => {
            setImpOpenS(true);
            lsSet(IMP_KEY, "1");
          }}
        >
          Metrics ›
        </button>
      </div>

      {pop && (
        <div
          className="pop"
          style={{ left: pop.left, top: pop.top }}
          onClick={(ev) => ev.stopPropagation()}
        >
          {pop.kind === "add" ? (
            <>
              <h4>Filter by</h4>
              <div className="lst">
                {availF.map((d) => (
                  <button
                    key={d.id}
                    className="it"
                    type="button"
                    onClick={() => {
                      const a = [...active, d.id];
                      setActive(a);
                      saveMine(a);
                      setPop({
                        kind: "vals",
                        id: d.id,
                        left: pop.left,
                        top: pop.top,
                      });
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </>
          ) : (
            (() => {
              const d = fdef(pop.id);
              if (!d) return null;
              const cur = filt[pop.id] || [],
                o = optionsFor(d);
              return (
                <>
                  <h4>{d.label}</h4>
                  <div className="lst">
                    {o.length ? (
                      o.map((x) => (
                        <label key={x.v}>
                          <input
                            type="checkbox"
                            checked={cur.indexOf(x.v) >= 0}
                            onChange={(ev) =>
                              setFiltVals(
                                pop.id,
                                ev.target.checked
                                  ? [...cur, x.v]
                                  : cur.filter((y) => y !== x.v),
                              )
                            }
                          />{" "}
                          {x.label}
                          <span className="n">{x.n}</span>
                        </label>
                      ))
                    ) : (
                      <div className="mini" style={{ padding: 6 }}>
                        No values found.
                      </div>
                    )}
                  </div>
                  <div className="ft">
                    <button
                      className="btn lnk"
                      type="button"
                      onClick={() => setFiltVals(pop.id, [])}
                    >
                      Clear
                    </button>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => setPop(null)}
                    >
                      Done
                    </button>
                  </div>
                </>
              );
            })()
          )}
        </div>
      )}

      {fpop &&
        (() => {
          const k = fpop.k,
            vals = {};
          scope.filter(passFilters).forEach((e) => {
            vals[colTxt(e, k)] = colVal(e, k);
          });
          const num = isNumCol(k);
          const keys = Object.keys(vals).sort((a, b) =>
            num
              ? (vals[a] == null ? -1 : vals[a]) -
                (vals[b] == null ? -1 : vals[b])
              : a < b
                ? -1
                : a > b
                  ? 1
                  : 0,
          );
          const done = (f) => {
            setColF((c) => {
              const n = Object.assign({}, c);
              if (f) n[k] = f;
              else delete n[k];
              return n;
            });
            setPage(1);
            setFpop(null);
          };
          return (
            <ColFilterPop
              key={k}
              num={num}
              keys={keys}
              vals={vals}
              cur={colF[k]}
              wrapOn={!!wrapC[k]}
              pos={fpop}
              onSort={(dir) => {
                setSort({ key: k, dir });
                setFpop(null);
              }}
              onWrap={(on) =>
                setWrapC((w) => {
                  const n = Object.assign({}, w);
                  if (on) n[k] = 1;
                  else delete n[k];
                  lsSet(WRAPC_KEY, JSON.stringify(n));
                  return n;
                })
              }
              onCond={done}
              onPick={done}
              onClear={() => done(null)}
            />
          );
        })()}
    </div>
  );
});

export default BulkOperations;
