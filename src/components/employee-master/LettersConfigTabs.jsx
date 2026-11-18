import { useEffect, useRef, useState } from "react";
import { ClientPager, DataGrid, useGridView } from "./DataGrid";
import { LtErrs, letterFontStyle, mergeLetterHtml, useLtGrid, usePaged } from "./letters-ui";
import {
  CAT,
  STATUS_CLASS,
  allTags,
  locationLabel,
  templateGroup,
  bodyToEditorHtml,
  catOf,
  chipifyEditorHtml,
  fieldMessages,
  lettersLocked,
  pick,
  ruleMessages,
  sourceOf,
  tagsIn,
  templateMessages,
  tplOf,
  valuesFor,
} from "@/lib/letters-core";
import { MAX_DOCX_BYTES } from "@/lib/letters-api";
import { payrollCycleRequest } from "@/lib/payroll-cycle-api";
import * as store from "@/lib/letters-store";
import { isAllLocations, useSelectedLocation } from "@/lib/location-store";
import { importDocxDocument, readImageDataUrl } from "@/lib/letters-docx";

/*
 * The HR-only tabs of the Letters screen: Letter Rules, Letter Fields,
 * Templates, plus the Audit Trail. Each edits a draft copy and saves it in one
 * step. Once any letter has been sent, a change needs a reason and is audited.
 */

const YN = ["Any", "Yes", "No"];
const copy = (x) => JSON.parse(JSON.stringify(x));

function LockNote({ S }) {
  if (!lettersLocked(S)) return null;
  return (
    <div className="lt-note lt-in-note">
      Letters have been sent. Changes here need a reason, are audited, and apply only to letters made from now on.
    </div>
  );
}

function Toolbar({ title, hint, children }) {
  return (
    <div className="lt-toolbar">
      <b>{title}</b>
      {hint && <span className="lt-mut">{hint}</span>}
      <span className="lt-sp" />
      {children}
    </div>
  );
}

/* ====================== Letter Rules ====================== */

export function RulesTab({ S, actor, ui, toast }) {
  const [draft, setDraft] = useState(null);
  const [errs, setErrs] = useState([]);
  const [reason, setReason] = useState("");
  const ed = !!draft;
  const rs = ed ? draft : S.rules;
  const ruleFields = S.fields.filter((f) => f.rules);
  const bad = ed ? ruleMessages(S, rs) : {};

  // how many active employees each rule gives a letter to today
  const cnt = {};
  S.sheet.forEach((r) => {
    if (r.status !== "Active") return;
    pick(S, r).forEach((x) => {
      cnt[x.id] = (cnt[x.id] || 0) + 1;
    });
  });
  const none = S.sheet.filter((r) => r.status === "Active" && !pick(S, r).length).map((r) => r.name);

  const setRule = (id, patch) => setDraft((d) => d.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const setCond = (id, fid, v) => setDraft((d) => d.map((r) => (r.id === id ? { ...r, cond: { ...(r.cond || {}), [fid]: v } } : r)));

  const startEdit = () => {
    const go = (why) => {
      setReason(why || "");
      setDraft(copy(S.rules));
      setErrs([]);
    };
    if (lettersLocked(S)) ui.askReason("Why are you changing the rules?", go);
    else go("");
  };
  const cancel = () => {
    setDraft(null);
    setErrs([]);
  };
  const add = () =>
    setDraft((d) => [...d, { id: "R" + (Date.now() % 100000), name: "", family: "", cycle: "Any", org: "Any", cond: {}, type: "", tpl: "", prio: 9, active: false }]);
  const remove = (id) => setDraft((d) => d.filter((r) => r.id !== id));
  const save = () => {
    if (Object.keys(bad).length) {
      toast("Fix the highlighted rules before saving");
      return;
    }
    const n = store.saveRules(draft, reason, actor);
    setDraft(null);
    setErrs([]);
    toast(n ? "Rules saved" : "No changes");
  };
  const toggleActive = (r, checked) => {
    if (checked) {
      const pm = ruleMessages(S, draft)[r.id];
      if (pm) {
        setErrs(["This rule " + pm.join("; ") + " before it can be made Active."]);
        return;
      }
    }
    setErrs([]);
    setRule(r.id, { active: checked });
  };

  const text = (r, key, ph, invalid) =>
    ed ? (
      <input type="text" className={"lt-cell-in" + (invalid ? " bad" : "")} value={r[key]} placeholder={ph} onChange={(e) => setRule(r.id, { [key]: e.target.value })} />
    ) : (
      r[key]
    );
  const select = (r, key, list) =>
    ed ? (
      <select className="lt-cell-in" value={r[key]} onChange={(e) => setRule(r.id, { [key]: e.target.value })}>
        {list.map((x) => (
          <option key={x}>{x}</option>
        ))}
      </select>
    ) : (
      r[key]
    );

  const defs = [
    { key: "prio", label: "Priority", w: 90, get: (r) => String(r.prio), sv: (r) => Number(r.prio), render: (r) => (ed ? <input type="number" className="lt-cell-in" style={{ width: 56 }} value={r.prio} onChange={(e) => setRule(r.id, { prio: Number(e.target.value) })} /> : String(r.prio)) },
    { key: "name", label: "Rule Name", w: 190, get: (r) => r.name, render: (r) => text(r, "name", "Rule Name", !String(r.name || "").trim()) },
    { key: "family", label: "Family", w: 120, get: (r) => r.family, render: (r) => (ed ? <input type="text" list="lt-fam" className={"lt-cell-in" + (!String(r.family || "").trim() ? " bad" : "")} value={r.family} placeholder="Family" onChange={(e) => setRule(r.id, { family: e.target.value })} /> : r.family) },
    { key: "cycle", label: "Cycle Type", w: 120, get: (r) => r.cycle, render: (r) => select(r, "cycle", ["Any", "Annual", "Exceptional"]) },
    { key: "org", label: "Organization", w: 130, get: (r) => r.org, render: (r) => select(r, "org", ["Any", ...S.orgs]) },
    ...ruleFields.map((f) => ({
      key: "c_" + f.id,
      label: f.label,
      w: 110,
      get: (r) => (r.cond && r.cond[f.id]) || "Any",
      render: (r) => {
        const v = (r.cond && r.cond[f.id]) || "Any";
        return ed ? (
          <select className="lt-cell-in" value={v} onChange={(e) => setCond(r.id, f.id, e.target.value)}>
            {YN.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        ) : (
          v
        );
      },
    })),
    { key: "type", label: "Letter Type", w: 160, get: (r) => r.type, render: (r) => text(r, "type", "Letter Type", !String(r.type || "").trim()) },
    {
      key: "tpl",
      label: "Template",
      w: 210,
      get: (r) => (r.tpl && tplOf(S, r.tpl) ? tplOf(S, r.tpl).name : ""),
      render: (r) =>
        ed ? (
          <select className="lt-cell-in" value={r.tpl} onChange={(e) => setRule(r.id, { tpl: e.target.value })}>
            <option value="">Choose Template</option>
            {templateChoices(S, r.tpl).map((t) => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        ) : r.tpl && tplOf(S, r.tpl) ? (
          tplOf(S, r.tpl).name
        ) : (
          ""
        ),
    },
    { key: "active", label: "Active", w: 80, get: (r) => (r.active ? "Yes" : "No"), render: (r) => (ed ? <input type="checkbox" checked={!!r.active} onChange={(e) => toggleActive(r, e.target.checked)} /> : r.active ? "Yes" : "No") },
    { key: "gets", label: "Gets it now", w: 90, get: (r) => String(cnt[r.id] || 0), sv: (r) => cnt[r.id] || 0, render: (r) => <span className="lt-num">{cnt[r.id] || 0}</span> },
    ...(ed ? [{ key: "x", label: "", w: 44, fixed: true, get: () => "", render: (r) => <button type="button" className="lt-ib" title="Remove Rule" onClick={() => remove(r.id)}>✕</button> }] : []),
  ];
  const grid = useLtGrid(defs, null);
  const view = useGridView(rs, defs, grid);

  const badKeys = Object.keys(bad);
  return (
    <>
      <Toolbar title="Letter Rules" hint="One Letter Per Family; The Matching Rule With The Lowest Priority Number Wins.">
        {ed ? (
          <>
            <button type="button" className="lt-btn" onClick={add}>+ Add Rule</button>
            <button type="button" className="lt-btn pri" onClick={save}>Save Rules</button>
            <button type="button" className="lt-btn" onClick={cancel}>Cancel</button>
          </>
        ) : (
          <button type="button" className="lt-btn pri" onClick={startEdit}>Edit Rules</button>
        )}
      </Toolbar>
      {ui.el}
      <div className="lt-content">
        <LockNote S={S} />
        <LtErrs errs={errs} />
        {badKeys.length > 0 && (
          <div className="lt-note warn lt-in-note" style={{ display: "block" }}>
            {badKeys.map((id) => {
              const r = rs.find((x) => x.id === id);
              return (
                <div key={id}>
                  Rule "{r && r.name ? r.name : "(no name)"}" {bad[id].join("; ")}.
                </div>
              );
            })}
          </div>
        )}
        <div className="lt-cfg">
          <DataGrid defs={defs} grid={grid} allRows={rs} rows={view} rowKey={(r) => r.id} emptyText="No Rules." />
        </div>
        <datalist id="lt-fam">
          <option>Revision</option>
          <option>Bonus</option>
          <option>Target PB</option>
        </datalist>
        <div className="lt-foot2">
          <span><b>No Letter Today:</b> {none.length ? none.join(", ") : "none"}</span>
        </div>
      </div>
    </>
  );
}

/* ====================== Letter Fields ====================== */

export function FieldsTab({ S, actor, ui, toast }) {
  const [draft, setDraft] = useState(null);
  const [errs, setErrs] = useState([]);
  const [reason, setReason] = useState("");
  const ed = !!draft;
  const fs = ed ? draft : S.fields;

  const setField = (id, patch) => setDraft((d) => d.map((f) => (f.id === id ? { ...f, ...patch } : f)));
  const startEdit = () => {
    const go = (why) => {
      setReason(why || "");
      setDraft(copy(S.fields));
      setErrs([]);
    };
    if (lettersLocked(S)) ui.askReason("Why are you changing the fields?", go);
    else go("");
  };
  const cancel = () => {
    setDraft(null);
    setErrs([]);
  };
  const add = () => setDraft((d) => [...d, { id: "F" + (Date.now() % 100000), label: "", col: "", rules: false, tag: true, tagName: "", show: false }]);
  const remove = (id) => setDraft((d) => d.filter((f) => f.id !== id));
  const save = () => {
    const er = fieldMessages(S, draft);
    if (er.length) {
      setErrs(er.slice(0, 8));
      return;
    }
    const n = store.saveFields(draft, reason, actor);
    setDraft(null);
    setErrs([]);
    toast(n ? "Fields saved" : "No changes");
  };
  const chooseColumn = (f, col) => {
    const ct = catOf(col);
    const patch = { col };
    if (ct) {
      if (!f.label) patch.label = ct[1];
      if (!f.tagName) patch.tagName = ct[1];
    }
    setField(f.id, patch);
  };

  const check = (f, key) =>
    ed ? <input type="checkbox" checked={!!f[key]} onChange={(e) => setField(f.id, { [key]: e.target.checked })} /> : f[key] ? "Yes" : "No";

  const defs = [
    { key: "label", label: "Name", w: 190, get: (f) => f.label, render: (f) => (ed ? <input type="text" className="lt-cell-in" value={f.label} placeholder="Field Name" onChange={(e) => setField(f.id, { label: e.target.value })} /> : f.label) },
    {
      key: "col",
      label: "Source column",
      w: 260,
      get: (f) => {
        const c = catOf(f.col);
        return c ? `${c[1]} - ${sourceOf(c)}` : "";
      },
      render: (f) =>
        ed ? (
          <select className="lt-cell-in" value={f.col} onChange={(e) => chooseColumn(f, e.target.value)}>
            <option value="">Choose A Column</option>
            {["Appraisal Sheet", "Employee Master"].map((g) => (
              <optgroup key={g} label={g}>
                {CAT.filter((x) => sourceOf(x) === g).map((x) => (
                  <option key={x[0]} value={x[0]}>{x[1]}</option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : catOf(f.col) ? (
          `${catOf(f.col)[1]} - ${sourceOf(catOf(f.col))}`
        ) : (
          ""
        ),
    },
    { key: "rules", label: "Use In Rules", w: 100, get: (f) => (f.rules ? "Yes" : "No"), render: (f) => check(f, "rules") },
    { key: "tag", label: "Use As Tag", w: 100, get: (f) => (f.tag ? "Yes" : "No"), render: (f) => check(f, "tag") },
    { key: "tagName", label: "Tag Name", w: 190, get: (f) => (f.tag ? `{{${f.tagName}}}` : ""), render: (f) => (ed ? <input type="text" className="lt-cell-in" value={f.tagName || ""} placeholder="Tag Name" onChange={(e) => setField(f.id, { tagName: e.target.value })} /> : f.tag ? `{{${f.tagName}}}` : "") },
    { key: "show", label: "Show In Grid (Default)", w: 150, get: (f) => (f.show ? "Yes" : "No"), render: (f) => check(f, "show") },
    ...(ed ? [{ key: "x", label: "", w: 44, fixed: true, get: () => "", render: (f) => <button type="button" className="lt-ib" title="Remove Field" onClick={() => remove(f.id)}>✕</button> }] : []),
  ];
  const grid = useLtGrid(defs, null);
  const view = useGridView(fs, defs, grid);

  return (
    <>
      <Toolbar title="Letter Fields" hint="Each field is one Appraisal Sheet or Employee Master column.">
        {ed ? (
          <>
            <button type="button" className="lt-btn" onClick={add}>+ Add Field</button>
            <button type="button" className="lt-btn pri" onClick={save}>Save Fields</button>
            <button type="button" className="lt-btn" onClick={cancel}>Cancel</button>
          </>
        ) : (
          <button type="button" className="lt-btn pri" onClick={startEdit}>Edit Fields</button>
        )}
      </Toolbar>
      {ui.el}
      <div className="lt-content">
        <LockNote S={S} />
        <LtErrs errs={errs} />
        <div className="lt-cfg">
          <DataGrid defs={defs} grid={grid} allRows={fs} rows={view} rowKey={(f) => f.id} emptyText="No Fields." />
        </div>
        <div className="lt-foot2">Hike, PB, RB And The Rest Are Rows In This List: Rename Or Remove Them. "In Words" Tags Are Created Automatically For Amount Fields.</div>
      </div>
    </>
  );
}

/* ====================== Templates ====================== */

const LETTER_FONTS = ["Calibri", "Arial", "Times New Roman", "Cambria", "Georgia", "Verdana", "Tahoma", "Trebuchet MS", "Courier New", "Inter"];
const LETTER_SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32];
const LETTER_SPACING = ["1", "1.15", "1.5", "2"];
const FAMILY_FIELD_GROUPS = [
  ["Employee", ["Name", "Emp ID", "Designation", "Letter Date"]],
  ["Revision", ["Effective Date", "New Base", "New Base In Words", "New Designation", "Hike Amount", "Hike %", "Current Base", "Promotion"]],
  ["Performance Bonus", ["PB Amount", "PB Amount In Words", "PB Schedule", "PB Pay Month"]],
  ["Retention Bonus", ["RB Amount", "RB Amount In Words", "RB Pay Month", "Acceptance Link"]],
  ["Target PB", ["Target PB", "Target PB In Words", "Financial Year", "Target PB Pay Month"]],
  ["Company and signature", ["Company Name", "Signatory Name", "Signatory Designation", "Signature"]],
];
const FAMILY_FIELD_MAP = {
  revision: ["Employee", "Revision", "Company and signature"],
  bonus: ["Employee", "Performance Bonus", "Retention Bonus", "Company and signature"],
  "target pb": ["Employee", "Target PB", "Company and signature"],
};

function editorHtmlToText(html) {
  const root = document.createElement("div");
  root.innerHTML = String(html || "");
  root.querySelectorAll(".lt-merge-field").forEach((node) => {
    const tag = node.getAttribute("data-letter-tag") || node.textContent || "";
    node.replaceWith(document.createTextNode(`{{${tag}}}`));
  });
  root.querySelectorAll("br").forEach((node) => node.replaceWith(document.createTextNode("\n")));
  const blocks = root.querySelectorAll("p,div,h1,h2,h3,h4,li");
  blocks.forEach((node) => {
    if (node.nextSibling) node.appendChild(document.createTextNode("\n"));
  });
  return (root.textContent || "").replace(/\u00a0/g, " ").replace(/[\u200b\u200c]/g, "").replace(/\n{3,}/g, "\n\n").trim();
}

function makeTemplateDraft(template, S) {
  const sg = { ...(S.sign || {}), ...(template && template.sg ? template.sg : {}) };
  if (!template) sg.name = "<<insert name>>";
  ["company", "name", "title", "sigFile", "logoFile", "letterDate", "from", "cc", "subject", "body"].forEach((key) => {
    if (sg[key] == null) sg[key] = "";
  });
  return {
    name: template ? template.name || "" : "New Template",
    family: template ? template.family || "Revision" : "Revision",
    location: template ? template.location || "" : "",
    locked: !!(template && template.ver && template.fromServer),
    file: template ? template.file || "" : "",
    docx: null,
    body: template ? template.body || "" : "",
    html: template ? (template.html || bodyToEditorHtml(template.body)) : bodyToEditorHtml("{{Letter Date}}\n\nTo,\n{{Name}}\n{{Designation}}\n{{Emp ID}}\n\nDear {{Name}},\n\nWrite the letter here.\n\nSincerely,\nFor {{Company Name}},\n{{Signature}}\n{{Signatory Name}}, {{Signatory Designation}}"),
    font: template ? template.font || "Calibri" : "Calibri",
    fsize: template ? Number(template.fsize || 11) : 11,
    lh: template ? String(template.lh || 1.15) : "1.15",
    sg,
  };
}

function FieldMenu({ S, family, onInsert, onClose }) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const allowed = showAll ? null : FAMILY_FIELD_MAP[String(family || "").toLowerCase()] || null;
  const groups = FAMILY_FIELD_GROUPS.map(([label, names]) => {
    const values = names.filter((name) => allTags(S).includes(name) && (!allowed || allowed.includes(label)) && name.toLowerCase().includes(query.toLowerCase()));
    return [label, values];
  }).filter(([, values]) => values.length);
  const known = FAMILY_FIELD_GROUPS.flatMap(([, names]) => names);
  const extras = allTags(S).filter((name) => !known.includes(name) && name.toLowerCase().includes(query.toLowerCase()));
  if (extras.length) groups.push(["Other Fields", extras]);
  return (
    <div className="lt-field-menu" role="dialog" aria-label="Insert Field">
      <input autoFocus className="lt-field-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search fields" />
      <label className="lt-field-all"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show all fields, not only for this family</label>
      <div className="lt-field-options">
        {groups.map(([label, names]) => (
          <div key={label}>
            <div className="lt-field-group-title">{label}</div>
            {names.map((name) => <button type="button" key={name} onClick={() => { onInsert(name); onClose(); }}>{name}</button>)}
          </div>
        ))}
        {!groups.length && <div className="lt-field-empty">No Matching Fields.</div>}
      </div>
    </div>
  );
}

const AlignIcon = ({ kind }) => {
  const x = (l) => (kind === "l" || kind === "j" ? 0 : kind === "r" ? 14 - l : (14 - l) / 2);
  const rows = kind === "j" ? [[1, 14], [4.5, 14], [8, 14], [11.5, 14]] : [[1, 14], [4.5, 8], [8, 14], [11.5, 8]];
  return (
    <svg width="14" height="12" viewBox="0 0 14 12" aria-hidden="true">
      <g stroke="#374151" strokeWidth="1.5">
        {rows.map(([y, w]) => <line key={y} x1={x(w)} x2={x(w) + w} y1={y} y2={y} />)}
      </g>
    </svg>
  );
};

function EditorToolbar({ editorRef, rangeRef, onDirty, onInsertField, onImport, font, size, lineSpacing, setFont, setSize, setLineSpacing, fieldOpen, setFieldOpen, S, family }) {
  const run = (command, value = null) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (rangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(rangeRef.current);
    }
    if (command === "fontSize") {
      document.execCommand("fontSize", false, "7");
      editor.querySelectorAll('font[size="7"]').forEach((node) => {
        const span = document.createElement("span");
        span.style.fontSize = `${value}pt`;
        while (node.firstChild) span.appendChild(node.firstChild);
        node.replaceWith(span);
      });
    } else {
      document.execCommand("styleWithCSS", false, true);
      document.execCommand(command, false, value);
    }
    onDirty();
  };
  const rememberRange = () => {
    const selection = window.getSelection();
    if (selection && selection.rangeCount && editorRef.current?.contains(selection.anchorNode)) {
      rangeRef.current = selection.getRangeAt(0).cloneRange();
    }
  };
  const button = (command, label, children) => (
    <button type="button" className="lt-format-button" title={label} aria-label={label} onMouseDown={(e) => e.preventDefault()} onClick={() => run(command)}>{children}</button>
  );
  return (
    <div className="lt-editor-toolbar" onMouseUp={rememberRange}>
      <select aria-label="Font" value="" onChange={(e) => e.target.value && run("fontName", e.target.value)}>
        <option value="">Font</option>
        {LETTER_FONTS.map((item) => <option key={item} value={item} style={{ fontFamily: item }}>{item}</option>)}
      </select>
      <select aria-label="Font Size" value="" onChange={(e) => e.target.value && run("fontSize", Number(e.target.value))}>
        <option value="">Size</option>
        {LETTER_SIZES.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <select aria-label="Text Style" value="" onChange={(e) => e.target.value && run("formatBlock", "<" + e.target.value + ">")}>
        <option value="">Style</option><option value="p">Normal</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option>
      </select>
      <span className="lt-format-divider" />
      {button("bold", "Bold", <b>B</b>)}
      {button("italic", "Italic", <i>I</i>)}
      {button("underline", "Underline", <u>U</u>)}
      <label className="lt-format-color" title="Font Colour">A<input type="color" defaultValue="#111827" onChange={(e) => run("foreColor", e.target.value)} /></label>
      <span className="lt-format-divider" />
      {button("justifyLeft", "Align Left", <AlignIcon kind="l" />)}
      {button("justifyCenter", "Align Centre", <AlignIcon kind="c" />)}
      {button("justifyRight", "Align Right", <AlignIcon kind="r" />)}
      {button("justifyFull", "Justify", <AlignIcon kind="j" />)}
      <select aria-label="Line Spacing" value="" onChange={(e) => { if (!e.target.value) return; setLineSpacing(e.target.value); const editor = editorRef.current; if (editor) editor.querySelectorAll("p,li,h1,h2,div").forEach((node) => { node.style.lineHeight = e.target.value; }); onDirty(); }}>
        <option value="">Spacing</option>
        {LETTER_SPACING.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <span className="lt-format-divider" />
      {button("insertUnorderedList", "Bullet List", "• List")}
      {button("insertOrderedList", "Numbered List", "1. List")}
      {button("outdent", "Decrease Indent", "⇤")}
      {button("indent", "Increase Indent", "⇥")}
      <span className="lt-format-divider" />
      {button("undo", "Undo", "↶")}
      {button("redo", "Redo", "↷")}
      <span className="lt-format-divider" />
      <div className="lt-field-picker-wrap">
        <button type="button" className="lt-btn sm2" onMouseDown={(e) => e.preventDefault()} onClick={() => setFieldOpen((value) => !value)}>Insert field ▾</button>
        {fieldOpen && <FieldMenu S={S} family={family} onInsert={onInsertField} onClose={() => setFieldOpen(false)} />}
      </div>
      <span className="lt-sp" />
      <button type="button" className="lt-btn sm2 lt-import-button" onMouseDown={(e) => e.preventDefault()} onClick={onImport}>Import from Word</button>
    </div>
  );
}

function TemplateEditor({ S, draft, setDraft, onSave, onCancel, onPreview, onDirty, errs, saving, locations }) {
  const editorRef = useRef(null);
  const rangeRef = useRef(null);
  const wordRef = useRef(null);
  const logoRef = useRef(null);
  const signatureRef = useRef(null);
  const [fieldOpen, setFieldOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [font, setFont] = useState(draft.font || "Calibri");
  const [size, setSize] = useState(Number(draft.fsize || 11));
  const [lineSpacing, setLineSpacing] = useState(String(draft.lh || "1.15"));

  useEffect(() => {
    if (editorRef.current) editorRef.current.innerHTML = chipifyEditorHtml(draft.html || bodyToEditorHtml(draft.body));
  }, []);

  const update = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const updateSign = (key, value) => setDraft((current) => ({ ...current, sg: { ...current.sg, [key]: value } }));
  const syncEditor = () => {
    const html = editorRef.current ? editorRef.current.innerHTML : draft.html;
    return { ...draft, html, body: editorHtmlToText(html), font, fsize: size, lh: lineSpacing };
  };
  const markDirty = () => {
    if (editorRef.current) update({ html: editorRef.current.innerHTML });
    onDirty();
  };
  const insertField = (tag) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const selection = window.getSelection();
    if (rangeRef.current && selection) {
      selection.removeAllRanges();
      selection.addRange(rangeRef.current);
    }
    const chip = document.createElement("span");
    chip.className = "lt-merge-field";
    chip.setAttribute("data-letter-tag", tag);
    chip.setAttribute("contenteditable", "false");
    chip.textContent = tag;
    const range = selection && selection.rangeCount ? selection.getRangeAt(0) : null;
    if (range && editor.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      range.insertNode(chip);
      const spacer = document.createTextNode(" ");
      chip.after(spacer);
      range.setStartAfter(spacer);
      range.collapse(true);
      selection.removeAllRanges();
      selection.addRange(range);
    } else {
      editor.appendChild(chip);
      editor.appendChild(document.createTextNode(" "));
    }
    markDirty();
  };
  const importWord = async (file) => {
    if (!file) return;
    if (file.size > MAX_DOCX_BYTES) {
      setUploadError("The Word file is larger than 5 MB.");
      if (wordRef.current) wordRef.current.value = "";
      return;
    }
    setImporting(true);
    setUploadError("");
    try {
      const imported = await importDocxDocument(file);
      const html = chipifyEditorHtml(imported.html);
      // `docx` is the original file; it is uploaded to the server when the template is saved.
      update({ file: file.name, docx: file, html, body: imported.text });
      if (editorRef.current) editorRef.current.innerHTML = html;
      if (imported.logo) updateSign("logoData", imported.logo.data), updateSign("logoFile", imported.logo.name);
      if (imported.signature) updateSign("sigData", imported.signature.data), updateSign("sigFile", imported.signature.name);
      onDirty();
    } catch (error) {
      setUploadError(error?.message || "Could Not Import This Word File.");
    } finally {
      setImporting(false);
      if (wordRef.current) wordRef.current.value = "";
    }
  };
  const importImage = async (key, file) => {
    if (!file) return;
    try {
      const image = await readImageDataUrl(file);
      updateSign(key === "logo" ? "logoData" : "sigData", image.data);
      updateSign(key === "logo" ? "logoFile" : "sigFile", image.name);
      onDirty();
    } catch (error) {
      setUploadError(error?.message || "Could Not Read The Image.");
    }
  };
  const fams = [...new Set(["Revision", "Bonus", "Target PB", ...S.tpls.map((item) => item.family).filter(Boolean)])];
  const sg = draft.sg;
  const labelInput = (key, label, type = "text") => (
    <label className="lt-editor-label" key={key}>{label}
      <input type={type} value={sg[key] || ""} onChange={(e) => updateSign(key, e.target.value)} />
    </label>
  );
  const imageUpload = (kind, label, inputRef) => {
    const fileName = kind === "logo" ? sg.logoFile : sg.sigFile;
    const data = kind === "logo" ? sg.logoData : sg.sigData;
    return (
      <div className="lt-editor-upload" key={kind}>
        <span className="lt-editor-label-text">{label}</span>
        <div className="lt-upload-row">
          <button type="button" className="lt-btn sm2 lt-upload-trigger" onClick={() => inputRef.current?.click()}>Upload</button>
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => importImage(kind, e.target.files?.[0])} />
          <span className="lt-upload-name">{fileName || "Nothing uploaded"}</span>
        </div>
        {data && <img className={kind === "logo" ? "lt-logo-thumb" : "lt-signature-thumb"} src={data} alt={kind === "logo" ? "Company Logo Preview" : "Signature Preview"} />}
      </div>
    );
  };
  const handleSave = () => onSave(syncEditor());
  const applyStyle = () => {
    const sheet = editorRef.current?.closest(".lt-editor-sheet");
    if (sheet) {
      sheet.style.fontFamily = font;
      sheet.style.fontSize = `${size}pt`;
      sheet.style.lineHeight = lineSpacing;
    }
  };
  useEffect(() => { applyStyle(); }, [font, size, lineSpacing]);

  return (
    <div className="lt-template-editor-view">
      <div className="lt-editor-header">
        <button type="button" className="lt-btn" onClick={onCancel}>← Templates</button>
        <input className="lt-editor-name" value={draft.name} onChange={(e) => update({ name: e.target.value })} aria-label="Template Name" placeholder="Template Name" />
        <span className="lt-sp" />
        <button type="button" className="lt-btn" onClick={() => onPreview(syncEditor())}>Preview</button>
        <button type="button" className="lt-btn main" disabled={saving} onClick={handleSave}>{saving ? "Saving…" : "Save"}</button>
      </div>
      <LockNote S={S} />
      <LtErrs errs={errs} />
      {uploadError && <div className="lt-note warn lt-editor-upload-error">{uploadError}</div>}
      <div className="lt-editor-layout">
        <section className="lt-editor-main">
          <EditorToolbar
            editorRef={editorRef}
            rangeRef={rangeRef}
            onDirty={markDirty}
            onInsertField={insertField}
            onImport={() => wordRef.current?.click()}
            font={font}
            size={size}
            lineSpacing={lineSpacing}
            setFont={(value) => { setFont(value); update({ font: value }); }}
            setSize={(value) => { setSize(value); update({ fsize: value }); }}
            setLineSpacing={(value) => { setLineSpacing(value); update({ lh: value }); }}
            fieldOpen={fieldOpen}
            setFieldOpen={setFieldOpen}
            S={S}
            family={draft.family}
          />
          <input ref={wordRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => importWord(e.target.files?.[0])} />
          {importing && <div className="lt-importing">Importing Word Document…</div>}
          <div className="lt-editor-sheet-bg">
            <div className="lt-editor-sheet" style={{ fontFamily: font, fontSize: `${size}pt`, lineHeight: lineSpacing }}>
              <div className="lt-editor-logo-area">
                {sg.logoData ? <img src={sg.logoData} alt="Company Logo" /> : <span>Company Logo</span>}
              </div>
              <div
                ref={editorRef}
                className="lt-document-content"
                contentEditable
                suppressContentEditableWarning
                spellCheck
                role="textbox"
                aria-label="Letter Document Editor"
                onInput={markDirty}
                onMouseUp={() => { const selection = window.getSelection(); if (selection?.rangeCount) rangeRef.current = selection.getRangeAt(0).cloneRange(); }}
                onKeyUp={() => { const selection = window.getSelection(); if (selection?.rangeCount) rangeRef.current = selection.getRangeAt(0).cloneRange(); }}
              />
            </div>
          </div>
        </section>
        <aside className="lt-editor-side">
          <section className="lt-editor-card">
            <h4>Details</h4>
            <label className="lt-editor-label">Family
              <input list="lt-template-families" value={draft.family} onChange={(e) => update({ family: e.target.value })} />
              <datalist id="lt-template-families">{fams.map((family) => <option key={family} value={family} />)}</datalist>
            </label>
            <div className="lt-rp-note">The family decides which letters can be issued together (one per family) and which fields Insert field shows first.</div>
            <label className="lt-editor-label">Location
              <select value={draft.location || ""} disabled={!!draft.locked} onChange={(e) => update({ location: e.target.value })}>
                <option value="">Choose a location</option>
                {locations.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <div className="lt-rp-note">{draft.locked ? "A saved template stays with its location. Clone it to make the letter for another location." : "Each location has its own template and its own storage bucket. The same name can be used once per location."}</div>
            <div className="lt-editor-grid2">
              <label className="lt-editor-label">Letter font<select value={font} onChange={(e) => { setFont(e.target.value); update({ font: e.target.value }); }}>{LETTER_FONTS.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="lt-editor-label">Size (pt)<select value={size} onChange={(e) => { setSize(Number(e.target.value)); update({ fsize: Number(e.target.value) }); }}>{LETTER_SIZES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            </div>
            <label className="lt-editor-label">Line spacing<select value={lineSpacing} onChange={(e) => { setLineSpacing(e.target.value); update({ lh: e.target.value }); }}>{LETTER_SPACING.map((item) => <option key={item}>{item}</option>)}</select></label>
          </section>
          <section className="lt-editor-card">
            <h4>Letterhead and signature</h4>
            {labelInput("company", "Company name")}
            {imageUpload("logo", "Company logo (top right of the letter)", logoRef)}
            {labelInput("name", "Signatory name")}
            {labelInput("title", "Signatory designation")}
            {imageUpload("signature", "Signature image", signatureRef)}
            {labelInput("letterDate", "Letter date")}
          </section>
          <section className="lt-editor-card">
            <h4>Cover email</h4>
            {labelInput("from", "Sent from (HR mailbox)", "email")}
            {labelInput("cc", "cc (comma separated)")}
            {labelInput("subject", "Subject")}
            <label className="lt-editor-label">Body<textarea rows={4} value={sg.body || ""} onChange={(e) => updateSign("body", e.target.value)} /></label>
            <div className="lt-email-tags"><span>Insert:</span>{["Name", "Cycle Name", "Company Name"].map((tag) => <button type="button" key={tag} onClick={() => updateSign("body", `${sg.body || ""}{{${tag}}}`)}>{tag}</button>)}</div>
          </section>
          {draft.file && (
            <div className="lt-editor-file-info">
              <b>Word file</b>
              <span>{draft.file}</span>
              <span className="lt-mut">{draft.docx ? "Will be uploaded to the server when you save." : "Stored on the server."}</span>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/* Rules name a template; templates with the same name are the same letter for
   different locations, so the rule list shows each name once. */
function templateChoices(S, current) {
  const seen = {};
  const out = [];
  const cur = tplOf(S, current);
  S.tpls.forEach((t) => {
    const key = String(t.name).trim().toLowerCase();
    const group = templateGroup(S, t.id);
    const live = group.some((x) => x.active !== false);
    if (seen[key] || (!live && !(cur && String(cur.name).trim().toLowerCase() === key))) return;
    seen[key] = true;
    const pickId = cur && String(cur.name).trim().toLowerCase() === key ? cur.id : t.id;
    out.push({ id: pickId, label: t.name + (group.length > 1 ? ` (${group.length} locations)` : "") });
  });
  return out;
}
const rulesUsing = (S, t) => S.rules.filter((r) => templateGroup(S, r.tpl).some((x) => x.id === t.id));

// Active Location Master names (same source as the Appraisal Cycle screen), plus any
// location already on the Appraisal Sheet so the list is never empty.
function useLocationNames(S) {
  const [names, setNames] = useState([]);
  useEffect(() => {
    let alive = true;
    payrollCycleRequest("locations")
      .then((rows) => {
        if (!alive) return;
        setNames(
          (Array.isArray(rows) ? rows : [])
            .filter((row) => String(row.status || "Active").toLowerCase() !== "inactive")
            .map((row) => String(row.location_name || "").trim())
            .filter(Boolean),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  const out = [...names];
  S.sheet.forEach((r) => {
    const l = String((r.v && r.v.emLocation) || "").trim();
    if (l && !out.some((x) => x.toLowerCase() === l.toLowerCase())) out.push(l);
  });
  S.tpls.forEach((t) => {
    if (t.location && !out.some((x) => x.toLowerCase() === t.location.toLowerCase())) out.push(t.location);
  });
  return out.sort((a, b) => a.localeCompare(b));
}

/* Preview of a template (saved or a draft) filled with one employee's data. */
function TemplatePreview({ S, src, version, onClose, onTest }) {
  const inLoc = (r) => !src.location || String(r.v.emLocation || "").toLowerCase() === String(src.location).toLowerCase();
  const emps = S.sheet.filter((r) => r.status === "Active" && inLoc(r));
  const [empId, setEmpId] = useState(emps[0] ? emps[0].id : "");
  const row = emps.find((r) => r.id === empId) || emps[0];
  const values = row ? valuesFor(S, row, src.sg, row.cycle, "TEST") : {};
  const html = src.html || bodyToEditorHtml(src.body);
  const mg = mergeLetterHtml(chipifyEditorHtml(html), values, src.sg);
  return (
    <div className="lt-preview-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lt-preview-modal" role="dialog" aria-modal="true" aria-label="Template preview">
        <div className="lt-preview-head">
          <div>
            <b>{src.name}</b>
            <div className="ds">{version} &middot; {locationLabel(src.location)} &middot; shown with the data of</div>
          </div>
          <select className="lt-txt" style={{ marginLeft: 10 }} aria-label="Employee" value={row ? row.id : ""} onChange={(e) => setEmpId(e.target.value)}>
            {emps.map((r) => (
              <option key={r.id} value={r.id}>{r.id} - {r.name}</option>
            ))}
          </select>
          <span className="lt-sp" />
          <button type="button" className="lt-btn" onClick={() => onTest(row, version)}>Send test to HR mailbox</button>
          <button type="button" className="lt-rp-ic" style={{ marginLeft: 8 }} aria-label="Close" onClick={onClose}>&#10005;</button>
        </div>
        <div className="lt-preview-body">
        <div className="lt-preview-page" style={letterFontStyle(src)}>
          {src.sg.logoData ? <img className="lt-preview-logo" src={src.sg.logoData} alt="Company logo" /> : <div className="lt-logo-ph">{src.sg.logoFile || "Company logo"}</div>}
          <div dangerouslySetInnerHTML={{ __html: mg.html }} />
        </div>
        </div>
        <div className="lt-preview-foot">
          {mg.miss.length ? <span className="err">Empty for this employee: {mg.miss.join(", ")}</span> : <span className="lt-mut">Every field has a value for this employee.</span>}
        </div>
      </div>
    </div>
  );
}

const chipOf = (label) => <span className={"lt-chip " + (STATUS_CLASS[label] || "sg")}>{label}</span>;

export function TemplatesTab({ S, actor, ui, toast, selectedId, setSelectedId }) {
  const [mode, setMode] = useState("library");
  const [draft, setDraft] = useState(null);
  const [editId, setEditId] = useState(null); // null = a new template (new or cloned)
  const [errs, setErrs] = useState([]);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState(null); // { src, version }
  const locations = useLocationNames(S);

  const used = (t) => rulesUsing(S, t).map((r) => r.name).join(", ");
  const toggleActive = async (t, on) => {
    try {
      await store.setTemplateActive(t.id, on, actor);
      toast(t.name + (on ? " is Active" : " is Inactive. It makes no new letters."));
    } catch (error) {
      toast(error?.message || "The change could not be saved.");
    }
  };
  const defs = [
    {
      key: "name",
      label: "Template",
      w: 230,
      fixed: true,
      get: (t) => t.name,
      render: (t) => (
        <>
          <button type="button" className="nm" onClick={() => setSelectedId(t.id)}>{t.name}</button>
          <div className="ds">{t.file ? "Imported from " + t.file : ""}</div>
        </>
      ),
    },
    { key: "family", label: "Family", w: 110, get: (t) => t.family },
    { key: "location", label: "Location", w: 130, get: (t) => locationLabel(t.location) },
    { key: "status", label: "Status", w: 100, get: (t) => (t.active === false ? "Inactive" : "Active"), render: (t) => chipOf(t.active === false ? "Inactive" : "Active") },
    {
      key: "active",
      label: "Active",
      w: 90,
      get: (t) => (t.active === false ? "No" : "Yes"),
      render: (t) => (
        <label className="lt-swt" title="Inactive templates are not offered in rules">
          <input type="checkbox" checked={t.active !== false} onChange={(e) => toggleActive(t, e.target.checked)} />
          <i />
        </label>
      ),
    },
    { key: "used", label: "Used by rules", w: 210, get: used },
    { key: "tags", label: "Fields used", w: 110, get: (t) => String(tagsIn(t.body || "").length), sv: (t) => tagsIn(t.body || "").length },
    { key: "by", label: "Last edited by", w: 130, get: (t) => t.by || "" },
    { key: "on", label: "Last edited", w: 130, get: (t) => t.on || "" },
    {
      key: "act",
      label: "Actions",
      w: 200,
      get: () => "Edit",
      render: (t) => (
        <span style={{ whiteSpace: "nowrap" }}>
          <button type="button" className="lt-lnk" onClick={() => startEdit(t)}>Edit</button>
          <span className="lt-sep">|</span>
          <button type="button" className="lt-lnk" onClick={() => { setSelectedId(t.id); setPreview({ src: t, version: "Published v" + t.ver }); }}>Preview</button>
          <span className="lt-sep">|</span>
          <button type="button" className="lt-lnk" onClick={() => clone(t)}>Clone</button>
        </span>
      ),
    },
  ];
  const grid = useLtGrid(defs, null);
  // Only templates stored on the server, and only those of the location chosen in
  // the top bar (each location has its own Stratus bucket).
  const [selectedLocation] = useSelectedLocation();
  const inLocation = (t) => isAllLocations(selectedLocation) || String(t.location || "").toLowerCase() === String(selectedLocation).toLowerCase();
  const filtered = S.tpls
    .filter((t) => !t.builtIn && inLocation(t))
    .filter((t) => !query || `${t.name} ${t.family}`.toLowerCase().includes(query.toLowerCase()));
  const view = useGridView(filtered, defs, grid);

  function open(t, d) {
    setSelectedId(t ? t.id : "");
    setEditId(t ? t.id : null);
    setDraft(d);
    setErrs([]);
    setMode("edit");
  }
  const startEdit = (t) => open(t, makeTemplateDraft(t, S));
  const createNew = () => {
    const d = makeTemplateDraft(null, S);
    if (!isAllLocations(selectedLocation)) d.location = selectedLocation; // saves to this location's bucket
    open(null, d);
  };
  const clone = (t) => {
    const d = makeTemplateDraft(t, S);
    // Same name: a clone is normally the same letter for another location.
    d.location = "";
    d.locked = false;
    d.file = "";
    open(null, d);
  };
  const back = () => {
    setMode("library");
    setDraft(null);
    setErrs([]);
  };
  const save = async (nextDraft) => {
    const body = nextDraft.body || editorHtmlToText(nextDraft.html);
    const finalDraft = { ...nextDraft, body, sg: { ...nextDraft.sg } };
    const messages = templateMessages(S, finalDraft, editId || "", body);
    if (messages.length) {
      setErrs(messages.slice(0, 10));
      return;
    }
    setSaving(true);
    try {
      const t = await store.publishTemplate(editId, finalDraft, "", actor);
      setSelectedId(t.id);
      toast("Saved. Unsent letters made with it are now Out of date.");
      back();
    } catch (error) {
      setErrs([error?.message || "The template could not be saved."]);
    } finally {
      setSaving(false);
    }
  };
  const sendTest = (row, version) => {
    const t = (preview && preview.src) || {};
    const from = (t.sg && t.sg.from) || "";
    if (!/^\S+@\S+\.\S+$/.test(from)) {
      toast("Set a valid HR mailbox in the template first");
      return;
    }
    if (t.id && tplOf(S, t.id)) store.sendTestTemplate(t.id, row.name, version, actor);
    toast("Test sent to " + from + " only");
  };

  if (mode === "edit" && draft) {
    return (
      <>
        {ui.el}
        <TemplateEditor
          S={S}
          draft={draft}
          setDraft={setDraft}
          onSave={save}
          onCancel={back}
          onPreview={(d) => setPreview({ src: { ...d, html: d.html, id: editId }, version: editId && tplOf(S, editId) ? "Draft of v" + (tplOf(S, editId).ver + 1) : "Draft" })}
          onDirty={() => setErrs([])}
          errs={errs}
          saving={saving}
          locations={locations}
        />
        {preview && <TemplatePreview S={S} src={preview.src} version={preview.version} onClose={() => setPreview(null)} onTest={sendTest} />}
      </>
    );
  }

  return (
    <>
      <div className="lt-toolbar">
        <input className="lt-txt search" placeholder="Search template, family" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search templates" />
        <span className="lt-sp" />
        <button type="button" className="lt-btn main" onClick={createNew}>New template</button>
      </div>
      {ui.el}
      <div className="lt-content grid">
        <LockNote S={S} />
        <div className="lt-cfg tpl">
          <DataGrid defs={defs} grid={grid} allRows={filtered} rows={view} rowKey={(t) => t.id} rowClass={(t) => (t.id === selectedId ? "lt-act" : "")} emptyText="No templates yet. Click New template." />
        </div>
        <div className="lt-template-library-footer">
          <span>{view.length} templates</span>
          <span>Imported Word files are stored on the server with every version.</span>
        </div>
      </div>
      {preview && <TemplatePreview S={S} src={preview.src} version={preview.version} onClose={() => setPreview(null)} onTest={sendTest} />}
    </>
  );
}

/* ====================== Audit Trail ====================== */

export const AUDIT_DEFS = [
  { key: "when", label: "When", w: 130, get: (a) => a.when },
  { key: "scope", label: "Area", w: 90, get: (a) => a.scope },
  { key: "ref", label: "Item", w: 120, get: (a) => a.ref },
  { key: "action", label: "Action", w: 160, get: (a) => a.action },
  { key: "by", label: "Done by", w: 130, get: (a) => a.by },
  { key: "reason", label: "Reason", w: 220, get: (a) => a.reason },
  { key: "detail", label: "Detail", w: 300, get: (a) => a.detail },
  { key: "tpl", label: "Template version", w: 120, get: (a) => a.tpl },
];

export function AuditTab({ S, onBack, onExport }) {
  const grid = useLtGrid(AUDIT_DEFS, null);
  const view = useGridView(S.audit, AUDIT_DEFS, grid);
  const paged = usePaged(view);
  return (
    <>
      <div className="lt-toolbar">
        <button type="button" className="lt-btn" onClick={onBack}>← Letters</button>
        <b>Audit Trail</b>
        <span className="lt-sp" />
        <button type="button" className="lt-btn" onClick={() => onExport(view)}>Export to Excel</button>
      </div>
      <div className="lt-content grid">
        <DataGrid defs={AUDIT_DEFS} grid={grid} allRows={S.audit} rows={paged.pageRows} rowKey={(a) => a.id + a.when + a.action} emptyText="No audit entries yet." fillWidth />
        <ClientPager page={paged.page} pages={paged.pages} from={paged.from} to={paged.to} total={view.length} allTotal={S.audit.length} onPage={paged.setPage} grid={grid} />
      </div>
    </>
  );
}