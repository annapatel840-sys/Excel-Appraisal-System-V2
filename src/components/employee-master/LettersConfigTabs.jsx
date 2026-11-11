import { useEffect, useRef, useState } from "react";
import { ClientPager, DataGrid, useGridView } from "./DataGrid";
import { LtErrs, useLtGrid, usePaged } from "./letters-ui";
import {
  CAT,
  allTags,
  catOf,
  fieldMessages,
  lettersLocked,
  pick,
  ruleMessages,
  tagsIn,
  templateMessages,
  tplOf,
} from "@/lib/letters-core";
import * as store from "@/lib/letters-store";
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
            {S.tpls.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
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
      label: "Appraisal Sheet column",
      w: 260,
      get: (f) => {
        const c = catOf(f.col);
        return c ? `${c[1]} (${c[0]})` : "";
      },
      render: (f) =>
        ed ? (
          <select className="lt-cell-in" value={f.col} onChange={(e) => chooseColumn(f, e.target.value)}>
            <option value="">Choose A Column</option>
            {CAT.map((x) => (
              <option key={x[0]} value={x[0]}>{`${x[1]} (${x[0]})`}</option>
            ))}
          </select>
        ) : (
          `${(catOf(f.col) || ["", ""])[1]} (${f.col})`
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
      <Toolbar title="Letter Fields" hint="Each Field Is One Appraisal Sheet Column.">
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

const LETTER_FONTS = ["Inter", "Calibri", "Arial", "Times New Roman", "Cambria", "Georgia", "Verdana", "Tahoma", "Trebuchet MS", "Courier New"];
const LETTER_SIZES = [8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32];
const LETTER_SPACING = ["1", "1.15", "1.5", "2"];
const FAMILY_FIELD_GROUPS = [
  ["Employee", ["Name", "Emp ID", "Designation", "Letter Date"]],
  ["Revision", ["Effective Date", "New Base", "New Base In Words", "New Designation", "Hike Amount", "Hike %", "Current Base", "Promotion"]],
  ["Performance Bonus", ["PB Amount", "PB Amount In Words", "PB Schedule", "PB Pay Month"]],
  ["Retention Bonus", ["RB Amount", "RB Amount In Words", "RB Pay Month", "Acceptance Link"]],
  ["Target PB", ["Target PB", "Target PB In Words", "Financial Year", "Target PB Pay Month"]],
  ["Company And Signature", ["Company Name", "Signatory Name", "Signatory Designation", "Signature"]],
];
const FAMILY_FIELD_MAP = {
  revision: ["Employee", "Revision", "Company And Signature"],
  bonus: ["Employee", "Performance Bonus", "Retention Bonus", "Company And Signature"],
  "target pb": ["Employee", "Target PB", "Company And Signature"],
};

function escapeHtml(value) {
  return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
}

function bodyToEditorHtml(body) {
  return String(body || "").split("\n").map((line) => {
    const safe = escapeHtml(line).replace(/\{\{([^{}]+)\}\}/g, (_m, tag) =>
      `<span class="lt-merge-field" data-letter-tag="${escapeHtml(tag.trim())}" contenteditable="false">${escapeHtml(tag.trim())}</span>`
    );
    return `<p>${safe || "<br>"}</p>`;
  }).join("");
}

function chipifyEditorHtml(html) {
  return String(html || "").replace(/\{\{([^{}<>]+)\}\}/g, (_m, tag) =>
    `<span class="lt-merge-field" data-letter-tag="${escapeHtml(tag.trim())}" contenteditable="false">${escapeHtml(tag.trim())}</span>`
  );
}

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
  ["company", "name", "title", "sigFile", "logoFile", "letterDate", "from", "cc", "subject", "body"].forEach((key) => {
    if (sg[key] == null) sg[key] = "";
  });
  return {
    name: template ? template.name || "" : "New Template",
    family: template ? template.family || "Revision" : "Revision",
    file: template ? template.file || "" : "",
    body: template ? template.body || "" : "",
    html: template ? (template.html || bodyToEditorHtml(template.body)) : bodyToEditorHtml("{{Letter Date}}\n\nTo,\n{{Name}}\n{{Designation}}\n{{Emp ID}}\n\nDear {{Name}},\n\nWrite The Letter Here.\n\nSincerely,\nFor {{Company Name}},\n{{Signature}}\n{{Signatory Name}}, {{Signatory Designation}}"),
    font: template ? template.font || "Inter" : "Inter",
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
      <input autoFocus className="lt-field-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search Fields" />
      <label className="lt-field-all"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> Show All Fields, Not Only For This Family</label>
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
      <select aria-label="Font" value={font} onChange={(e) => { setFont(e.target.value); run("fontName", e.target.value); }}>
        {LETTER_FONTS.map((item) => <option key={item}>{item}</option>)}
      </select>
      <select aria-label="Font Size" value={size} onChange={(e) => { setSize(Number(e.target.value)); run("fontSize", Number(e.target.value)); }}>
        {LETTER_SIZES.map((item) => <option key={item} value={item}>{item}</option>)}
      </select>
      <select aria-label="Text Style" defaultValue="p" onChange={(e) => run("formatBlock", e.target.value)}>
        <option value="p">Style</option><option value="p">Normal</option><option value="h1">Heading 1</option><option value="h2">Heading 2</option>
      </select>
      <span className="lt-format-divider" />
      {button("bold", "Bold", <b>B</b>)}
      {button("italic", "Italic", <i>I</i>)}
      {button("underline", "Underline", <u>U</u>)}
      <label className="lt-format-color" title="Font Colour">A<input type="color" defaultValue="#111827" onChange={(e) => run("foreColor", e.target.value)} /></label>
      <span className="lt-format-divider" />
      {button("justifyLeft", "Align Left", "≡")}
      {button("justifyCenter", "Align Centre", "☰")}
      {button("justifyRight", "Align Right", "≣")}
      {button("justifyFull", "Justify", "▤")}
      <select aria-label="Line Spacing" value={lineSpacing} onChange={(e) => { setLineSpacing(e.target.value); const editor = editorRef.current; if (editor) editor.querySelectorAll("p,li,h1,h2,div").forEach((node) => { node.style.lineHeight = e.target.value; }); onDirty(); }}>
        {LETTER_SPACING.map((item) => <option key={item} value={item}>{item === "1.15" ? "Spacing" : item}</option>)}
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
        <button type="button" className="lt-btn" onMouseDown={(e) => e.preventDefault()} onClick={() => setFieldOpen((value) => !value)}>Insert Field ▾</button>
        {fieldOpen && <FieldMenu S={S} family={family} onInsert={onInsertField} onClose={() => setFieldOpen(false)} />}
      </div>
      <span className="lt-sp" />
      <button type="button" className="lt-btn lt-import-button" onMouseDown={(e) => e.preventDefault()} onClick={onImport}>Import From Word</button>
    </div>
  );
}

function TemplateEditor({ S, draft, setDraft, onSave, onCancel, onPreview, onDirty, errs, isNew }) {
  const editorRef = useRef(null);
  const rangeRef = useRef(null);
  const wordRef = useRef(null);
  const logoRef = useRef(null);
  const signatureRef = useRef(null);
  const [fieldOpen, setFieldOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [font, setFont] = useState(draft.font || "Inter");
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
    setImporting(true);
    setUploadError("");
    try {
      const imported = await importDocxDocument(file);
      const html = chipifyEditorHtml(imported.html);
      update({ file: file.name, html, body: imported.text });
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
          <button type="button" className="lt-btn lt-upload-trigger" onClick={() => inputRef.current?.click()}>Upload</button>
          <input ref={inputRef} type="file" accept="image/*" hidden onChange={(e) => importImage(kind, e.target.files?.[0])} />
          <span className="lt-upload-name">{fileName || "No File Chosen"}</span>
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
        <button type="button" className="lt-btn main" onClick={handleSave}>{isNew ? "Save" : "Save New Version"}</button>
      </div>
      <div className="lt-note lt-editor-notice">Letters Have Been Sent. Changes Here Need A Reason, Are Audited, And Apply Only To Letters Made From Now On.</div>
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
            <div className="lt-editor-grid2">
              <label className="lt-editor-label">Letter Font<select value={font} onChange={(e) => { setFont(e.target.value); update({ font: e.target.value }); }}>{LETTER_FONTS.map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className="lt-editor-label">Size (Pt)<select value={size} onChange={(e) => { setSize(Number(e.target.value)); update({ fsize: Number(e.target.value) }); }}>{LETTER_SIZES.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
            </div>
            <label className="lt-editor-label">Line Spacing<select value={lineSpacing} onChange={(e) => { setLineSpacing(e.target.value); update({ lh: e.target.value }); }}>{LETTER_SPACING.map((item) => <option key={item}>{item}</option>)}</select></label>
          </section>
          <section className="lt-editor-card">
            <h4>Letterhead And Signature</h4>
            {labelInput("company", "Company Name")}
            {imageUpload("logo", "Company Logo (Top Right Of The Letter)", logoRef)}
            {labelInput("name", "Signatory Name")}
            {labelInput("title", "Signatory Designation")}
            {imageUpload("signature", "Signature Image", signatureRef)}
            {labelInput("letterDate", "Letter Date")}
          </section>
          <section className="lt-editor-card">
            <h4>Cover Email</h4>
            {labelInput("from", "Sent From (HR Mailbox)", "email")}
            {labelInput("cc", "CC (Comma Separated)")}
            {labelInput("subject", "Subject")}
            <label className="lt-editor-label">Body<textarea rows={4} value={sg.body || ""} onChange={(e) => updateSign("body", e.target.value)} /></label>
            <div className="lt-email-tags"><span>Insert:</span>{["Name", "Cycle Name", "Company Name"].map((tag) => <button type="button" key={tag} onClick={() => updateSign("body", `${sg.body || ""}{{${tag}}}`)}>{tag}</button>)}</div>
          </section>
          {draft.file && <div className="lt-editor-file-info"><b>Word File</b><span>{draft.file}</span></div>}
        </aside>
      </div>
    </div>
  );
}

function TemplatePreview({ draft, onClose }) {
  const html = chipifyEditorHtml(draft.html || bodyToEditorHtml(draft.body)).replace(/<span class="lt-merge-field" data-letter-tag="([^"]+)" contenteditable="false">([^<]*)<\/span>/g, (_m, tag, label) => {
    if (tag === "Signature" && draft.sg.sigData) return `<img class="lt-preview-signature" src="${draft.sg.sigData}" alt="Signature" />`;
    return `<span class="lt-preview-field">${escapeHtml(label || tag)}</span>`;
  });
  return (
    <div className="lt-preview-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lt-preview-modal" role="dialog" aria-modal="true" aria-label="Template Preview">
        <div className="lt-preview-head"><b>Template Preview</b><button type="button" className="lt-btn" onClick={onClose}>Close</button></div>
        <div className="lt-preview-page" style={{ fontFamily: draft.font || "Inter", fontSize: `${draft.fsize || 11}pt`, lineHeight: draft.lh || 1.15 }}>
          {draft.sg.logoData && <img className="lt-preview-logo" src={draft.sg.logoData} alt="Company Logo" />}
          <div dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>
    </div>
  );
}

export function TemplatesTab({ S, actor, ui, toast }) {
  const [selectedId, setSelectedId] = useState(S.tpls[0] ? S.tpls[0].id : "");
  const [mode, setMode] = useState("library");
  const [draft, setDraft] = useState(null);
  const [isNew, setIsNew] = useState(false);
  const [errs, setErrs] = useState([]);
  const [reason, setReason] = useState("");
  const [query, setQuery] = useState("");
  const [previewDraft, setPreviewDraft] = useState(null);

  const used = (template) => S.rules.filter((rule) => rule.tpl === template.id).map((rule) => rule.name).join(", ");
  const defs = [
    { key: "name", label: "Template", w: 250, fixed: true, get: (item) => item.name, render: (item) => <button type="button" className="nm" onClick={() => startEdit(item)}>{item.name}</button> },
    { key: "family", label: "Family", w: 120, get: (item) => item.family },
    { key: "ver", label: "Version", w: 85, get: (item) => String(item.ver), sv: (item) => item.ver },
    { key: "file", label: "Word File", w: 260, get: (item) => item.file },
    { key: "tags", label: "Tags Used", w: 90, get: (item) => String(tagsIn(item.body || "").length), sv: (item) => tagsIn(item.body || "").length },
    { key: "used", label: "Used By Rules", w: 230, get: used },
  ];
  const grid = useLtGrid(defs, null);
  const filtered = S.tpls.filter((item) => !query || `${item.name} ${item.family} ${item.file}`.toLowerCase().includes(query.toLowerCase()));
  const view = useGridView(filtered, defs, grid);

  function beginEdit(template, fresh = false) {
    const go = (why) => {
      setReason(why || "");
      setDraft(makeTemplateDraft(template, S));
      setIsNew(fresh);
      setSelectedId(template?.id || "");
      setErrs([]);
      setMode("edit");
    };
    if (lettersLocked(S)) ui.askReason(fresh ? "Why Are You Creating This Template?" : "Why Are You Changing This Template?", go);
    else go("");
  }
  function startEdit(template) {
    beginEdit(template, false);
  }
  const createNew = () => beginEdit(null, true);
  const cancel = () => {
    setMode("library");
    setDraft(null);
    setPreviewDraft(null);
    setErrs([]);
  };
  const save = (nextDraft) => {
    const finalDraft = { ...nextDraft, body: nextDraft.body || editorHtmlToText(nextDraft.html), sg: { ...nextDraft.sg } };
    const messages = templateMessages(S, finalDraft, finalDraft.body);
    if (messages.length) {
      setErrs(messages.slice(0, 10));
      return;
    }
    try {
      if (isNew) {
        store.createTemplate(finalDraft, reason, actor);
        const created = S.tpls[S.tpls.length - 1];
        setSelectedId(created.id);
        toast(`Template Saved As Version ${created.ver}`);
      } else {
        const version = store.saveTemplate(selectedId, finalDraft, reason, actor);
        toast(`Saved As Version ${version}; Unsent Letters Are Now Out Of Date`);
      }
      setMode("library");
      setDraft(null);
      setPreviewDraft(null);
      setErrs([]);
    } catch (error) {
      setErrs([error?.message || "The Template Could Not Be Saved."]);
    }
  };

  if (mode === "edit" && draft) {
    return (
      <>
        <TemplateEditor
          S={S}
          draft={draft}
          setDraft={setDraft}
          onSave={save}
          onCancel={cancel}
          onPreview={setPreviewDraft}
          onDirty={() => setErrs([])}
          errs={errs}
          isNew={isNew}
        />
        {previewDraft && <TemplatePreview draft={previewDraft} onClose={() => setPreviewDraft(null)} />}
      </>
    );
  }

  return (
    <>
      <Toolbar title="Templates" hint="Each Template Carries Its Own Signatory, Signature And Cover Email. A New Version Marks Unsent Letters Out Of Date.">
        <input className="lt-txt search" placeholder="Search Template, Family" value={query} onChange={(e) => setQuery(e.target.value)} />
        <button type="button" className="lt-btn pri" onClick={createNew}>New Template</button>
      </Toolbar>
      <div className="lt-content grid">
        <LockNote S={S} />
        <div className="lt-cfg tpl">
          <DataGrid defs={defs} grid={grid} allRows={filtered} rows={view} rowKey={(item) => item.id} rowClass={(item) => item.id === selectedId ? "lt-act" : ""} emptyText="No Templates Yet. Click New Template." />
        </div>
        <div className="lt-template-library-footer">
          <span>{view.length} Templates</span>
          <span>Choose A Template Name To Edit Its Content And Letterhead.</span>
        </div>
      </div>
      {previewDraft && <TemplatePreview draft={previewDraft} onClose={() => setPreviewDraft(null)} />}
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
