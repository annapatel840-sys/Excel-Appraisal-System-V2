import { useRef, useState } from "react";
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
    { key: "name", label: "Rule name", w: 190, get: (r) => r.name, render: (r) => text(r, "name", "Rule name", !String(r.name || "").trim()) },
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
    { key: "type", label: "Letter Type", w: 160, get: (r) => r.type, render: (r) => text(r, "type", "Letter type", !String(r.type || "").trim()) },
    {
      key: "tpl",
      label: "Template",
      w: 210,
      get: (r) => (r.tpl && tplOf(S, r.tpl) ? tplOf(S, r.tpl).name : ""),
      render: (r) =>
        ed ? (
          <select className="lt-cell-in" value={r.tpl} onChange={(e) => setRule(r.id, { tpl: e.target.value })}>
            <option value="">Choose template</option>
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
    ...(ed ? [{ key: "x", label: "", w: 44, fixed: true, get: () => "", render: (r) => <button type="button" className="lt-ib" title="Remove rule" onClick={() => remove(r.id)}>✕</button> }] : []),
  ];
  const grid = useLtGrid(defs, null);
  const view = useGridView(rs, defs, grid);

  const badKeys = Object.keys(bad);
  return (
    <>
      <Toolbar title="Letter Rules" hint="One letter per family; the matching rule with the lowest priority number wins.">
        {ed ? (
          <>
            <button type="button" className="lt-btn" onClick={add}>+ Add rule</button>
            <button type="button" className="lt-btn pri" onClick={save}>Save rules</button>
            <button type="button" className="lt-btn" onClick={cancel}>Cancel</button>
          </>
        ) : (
          <button type="button" className="lt-btn pri" onClick={startEdit}>Edit rules</button>
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
          <DataGrid defs={defs} grid={grid} allRows={rs} rows={view} rowKey={(r) => r.id} emptyText="No rules." />
        </div>
        <datalist id="lt-fam">
          <option>Revision</option>
          <option>Bonus</option>
          <option>Target PB</option>
        </datalist>
        <div className="lt-foot2">
          <span><b>No letter today:</b> {none.length ? none.join(", ") : "none"}</span>
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
    { key: "label", label: "Name", w: 190, get: (f) => f.label, render: (f) => (ed ? <input type="text" className="lt-cell-in" value={f.label} placeholder="Field name" onChange={(e) => setField(f.id, { label: e.target.value })} /> : f.label) },
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
            <option value="">Choose a column</option>
            {CAT.map((x) => (
              <option key={x[0]} value={x[0]}>{`${x[1]} (${x[0]})`}</option>
            ))}
          </select>
        ) : (
          `${(catOf(f.col) || ["", ""])[1]} (${f.col})`
        ),
    },
    { key: "rules", label: "Use in rules", w: 100, get: (f) => (f.rules ? "Yes" : "No"), render: (f) => check(f, "rules") },
    { key: "tag", label: "Use as tag", w: 100, get: (f) => (f.tag ? "Yes" : "No"), render: (f) => check(f, "tag") },
    { key: "tagName", label: "Tag name", w: 190, get: (f) => (f.tag ? `{{${f.tagName}}}` : ""), render: (f) => (ed ? <input type="text" className="lt-cell-in" value={f.tagName || ""} placeholder="Tag name" onChange={(e) => setField(f.id, { tagName: e.target.value })} /> : f.tag ? `{{${f.tagName}}}` : "") },
    { key: "show", label: "Show in grid (default)", w: 150, get: (f) => (f.show ? "Yes" : "No"), render: (f) => check(f, "show") },
    ...(ed ? [{ key: "x", label: "", w: 44, fixed: true, get: () => "", render: (f) => <button type="button" className="lt-ib" title="Remove field" onClick={() => remove(f.id)}>✕</button> }] : []),
  ];
  const grid = useLtGrid(defs, null);
  const view = useGridView(fs, defs, grid);

  return (
    <>
      <Toolbar title="Letter Fields" hint="Each field is one Appraisal Sheet column.">
        {ed ? (
          <>
            <button type="button" className="lt-btn" onClick={add}>+ Add field</button>
            <button type="button" className="lt-btn pri" onClick={save}>Save fields</button>
            <button type="button" className="lt-btn" onClick={cancel}>Cancel</button>
          </>
        ) : (
          <button type="button" className="lt-btn pri" onClick={startEdit}>Edit fields</button>
        )}
      </Toolbar>
      {ui.el}
      <div className="lt-content">
        <LockNote S={S} />
        <LtErrs errs={errs} />
        <div className="lt-cfg">
          <DataGrid defs={defs} grid={grid} allRows={fs} rows={view} rowKey={(f) => f.id} emptyText="No fields." />
        </div>
        <div className="lt-foot2">Hike, PB, RB and the rest are just rows in this list: rename or remove them. "In Words" tags are made automatically for amount fields.</div>
      </div>
    </>
  );
}

/* ====================== Templates ====================== */

function Signatory({ x, ed, onField }) {
  const d = x.sg || {};
  const textField = (key, label, type = "text") => (
    <label className="lt-l" key={key}>
      <span>{label}</span>
      {ed ? (
        <input
          type={type}
          className="lt-txt"
          value={d[key] || ""}
          onChange={(e) => onField(key, e.target.value)}
        />
      ) : <div className="ro">{d[key] || "—"}</div>}
    </label>
  );
  const imageField = (key, label, fileKey, dataKey) => (
    <div className="lt-l" key={key}>
      <span>{label}</span>
      {ed ? (
        <div className="lt-upload-row">
          <label className="lt-upload-btn">
            Choose File
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onField(key, { file, fileKey, dataKey });
                e.target.value = "";
              }}
            />
          </label>
          <span className="lt-file-name">{d[fileKey] || "No File Chosen"}</span>
        </div>
      ) : (
        <div className="ro">{d[fileKey] || "—"}</div>
      )}
      {d[dataKey] && <img className="lt-image-preview" src={d[dataKey]} alt={label} />}
    </div>
  );

  return (
    <div className="lt-template-section">
      <div className="lt-section-heading">Letterhead And Signature</div>
      <div className="lt-grid2">
        {textField("company", "Company Name")}
        {textField("name", "Signatory Name")}
        {textField("title", "Signatory Designation")}
        {imageField("logo", "Company Logo", "logoFile", "logoData")}
        {imageField("sig", "Signature Image", "sigFile", "sigData")}
        {textField("letterDate", "Letter Date")}
      </div>
      <div className="lt-section-heading lt-section-heading-spaced">Cover Email</div>
      <div className="lt-grid2">
        {textField("from", "Sent From (HR Mailbox)", "email")}
        {textField("cc", "CC (Comma Separated)")}
        {textField("subject", "Cover Email Subject")}
      </div>
      <label className="lt-l lt-cover-body">
        <span>Cover Email Body</span>
        {ed ? (
          <textarea className="lt-tbody" value={d.body || ""} onChange={(e) => onField("body", e.target.value)} />
        ) : <div className="ro pre">{d.body || "—"}</div>}
      </label>
    </div>
  );
}

export function TemplatesTab({ S, actor, ui, toast }) {
  const [tsel, setTsel] = useState(S.tpls[0] ? S.tpls[0].id : "");
  const [draft, setDraft] = useState(null);
  const [errs, setErrs] = useState([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const docxRef = useRef(null);
  const taRef = useRef(null);
  const ed = !!draft;
  const t = tplOf(S, tsel);

  const used = (x) => S.rules.filter((r) => r.tpl === x.id).map((r) => r.name).join(", ");
  const defs = [
    { key: "name", label: "Template", w: 230, get: (x) => x.name, render: (x) => <button type="button" className="nm" onClick={() => !ed && setTsel(x.id)}>{x.name}</button> },
    { key: "family", label: "Family", w: 110, get: (x) => x.family },
    { key: "ver", label: "Version", w: 80, get: (x) => String(x.ver), sv: (x) => x.ver },
    { key: "file", label: "Word File", w: 260, get: (x) => x.file },
    { key: "tags", label: "Tags Used", w: 90, get: (x) => String(tagsIn(x.body).length), sv: (x) => tagsIn(x.body).length },
    { key: "used", label: "Used By Rules", w: 240, get: used },
  ];
  const grid = useLtGrid(defs, null);
  const view = useGridView(S.tpls, defs, grid);

  const startEdit = () => {
    const go = (why) => {
      setReason(why || "");
      setDraft({ name: t.name || "", family: t.family || "", file: t.file || "", body: t.body || "", sg: copy(t.sg || {}) });
      setErrs([]);
      setPreview(false);
    };
    if (lettersLocked(S)) ui.askReason("Why Are You Changing This Template?", go);
    else go("");
  };
  const cancel = () => {
    setDraft(null);
    setErrs([]);
    setPreview(false);
  };
  const save = () => {
    const tm = templateMessages(S, draft, draft.body);
    if (tm.length) {
      setErrs(tm);
      return;
    }
    const ver = store.saveTemplate(tsel, draft, reason, actor);
    setDraft(null);
    setErrs([]);
    setPreview(false);
    toast(`Saved As Version ${ver}; Unsent Letters Are Now Out Of Date`);
  };
  const updateSignatory = async (key, value) => {
    if (key === "logo" || key === "sig") {
      try {
        const { readImageDataUrl } = await import("@/lib/letters-docx");
        const result = await readImageDataUrl(value.file);
        setDraft((current) => current ? ({
          ...current,
          sg: { ...current.sg, [value.fileKey]: result.name, [value.dataKey]: result.data },
        }) : current);
      } catch (error) {
        setErrs([error.message || "The selected image could not be read."]);
      }
      return;
    }
    setDraft((current) => current ? ({ ...current, sg: { ...current.sg, [key]: value } }) : current);
  };
  const importWord = async (file) => {
    if (!file) return;
    setBusy(true);
    setErrs([]);
    try {
      const { importDocxTemplate } = await import("@/lib/letters-docx");
      const imported = await importDocxTemplate(file);
      setDraft((current) => current ? ({
        ...current,
        file: file.name,
        body: imported.body,
        sg: {
          ...current.sg,
          ...(imported.logo ? { logoFile: imported.logo.name, logoData: imported.logo.data } : {}),
          ...(imported.signature ? { sigFile: imported.signature.name, sigData: imported.signature.data } : {}),
        },
      }) : current);
      toast(`Imported ${file.name}. Review The Content, Logo And Signature Before Saving.`);
    } catch (error) {
      setErrs([error.message || "Could Not Read This Word File."]);
    } finally {
      setBusy(false);
      if (docxRef.current) docxRef.current.value = "";
    }
  };
  const insertTag = (tag) => {
    const el = taRef.current;
    if (!el || !draft) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const token = `{{${tag}}}`;
    const body = draft.body.slice(0, start) + token + draft.body.slice(end);
    setDraft({ ...draft, body });
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <>
      <Toolbar title="Templates" hint="Each Template Carries Its Own Signatory, Signature And Cover Email. A New Version Marks Unsent Letters Out Of Date." />
      {ui.el}
      <div className="lt-content">
        <LockNote S={S} />
        <div className="lt-cfg tpl">
          <DataGrid defs={defs} grid={grid} allRows={S.tpls} rows={view} rowKey={(x) => x.id} rowClass={(x) => (x.id === tsel ? "lt-act" : "")} emptyText="No Templates." />
        </div>
        {t && (
          <>
            <LtErrs errs={errs} />
            <section className="lt-template-editor">
              <header className="lt-template-editor-head">
                <div>
                  <b>{t.name}</b>
                  <span className="lt-mut">Version {t.ver}{ed ? ` → ${t.ver + 1}` : ""}</span>
                </div>
                <div className="lt-template-actions">
                  {ed ? <>
                    <button type="button" className="lt-btn" onClick={() => setPreview((v) => !v)}>{preview ? "Edit Content" : "Preview"}</button>
                    <button type="button" className="lt-btn pri" onClick={save} disabled={busy}>Save New Version</button>
                    <button type="button" className="lt-btn" onClick={cancel}>Cancel</button>
                  </> : <button type="button" className="lt-btn pri" onClick={startEdit}>Edit Template</button>}
                </div>
              </header>

              {ed && <div className="lt-template-meta">
                <label className="lt-l"><span>Template Name</span><input className="lt-txt" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
                <label className="lt-l"><span>Family</span><input className="lt-txt" value={draft.family} onChange={(e) => setDraft({ ...draft, family: e.target.value })} /></label>
                <div className="lt-l"><span>Word File</span><div className="lt-upload-row">
                  <label className="lt-upload-btn">Choose File<input ref={docxRef} type="file" accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(e) => importWord(e.target.files?.[0])} /></label>
                  <span className="lt-file-name">{busy ? "Importing Word File…" : draft.file || "No File Chosen"}</span>
                </div></div>
              </div>}

              <div className="lt-template-workspace">
                <div className="lt-template-main">
                  <div className="lt-template-section">
                    <div className="lt-section-heading">Letter Content</div>
                    {ed && <div className="lt-tags lt-template-tags">
                      <span className="lt-mut">Insert Field:</span>
                      {allTags(S).map((tag) => <button key={tag} type="button" className="lt-tg" onClick={() => insertTag(tag)}>{`{{${tag}}}`}</button>)}
                    </div>}
                    {preview ? <div className="lt-template-preview">{draft.body || "No Letter Content Yet."}</div> : (
                      <textarea ref={taRef} className="lt-tbody lt-template-body" readOnly={!ed} value={ed ? draft.body : t.body || ""} onChange={(e) => ed && setDraft({ ...draft, body: e.target.value })} placeholder="Upload A Word File Or Enter Letter Content Here…" />
                    )}
                    <p className="lt-help">Use Field Tags Such As {"{{Name}}"} And {"{{Designation}}"}. These Are Replaced With Employee Data When The Letter Is Generated.</p>
                  </div>
                </div>
                <aside className="lt-template-side">
                  <Signatory x={draft || t} ed={ed} onField={updateSignatory} />
                </aside>
              </div>
            </section>
          </>
        )}
      </div>
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
