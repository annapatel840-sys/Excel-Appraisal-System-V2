import { useEffect, useMemo, useRef, useState } from "react";
import { ClientPager, DataGrid, useGridView } from "./DataGrid";
import { AUDIT_DEFS, AuditTab, FieldsTab, RulesTab, TemplatesTab } from "./LettersConfigTabs";
import { exportRows, letterFontStyle, mergeLetterHtml, useLtBar, useLtGrid, usePaged, useToast } from "./letters-ui";
import {
  OPEN_STATUSES,
  SENT_STATUSES,
  STATUSES,
  STATUS_CLASS,
  catOf,
  cyOf,
  empOf,
  fmtVal,
  inr,
  lettersStats,
  needLetters,
  num,
  pick,
  sendProblem,
  tagValues,
  templateGroup,
  tplOf,
} from "@/lib/letters-core";
import * as store from "@/lib/letters-store";
import { isAllLocations, useSelectedLocation } from "@/lib/location-store";
import { useCatalystUser } from "@/lib/catalyst-auth";
import "./employee-master-ui.css";
import "./letters-page.css";

/*
 * HR Operations -> Operation -> Letters.
 *
 * Ported from the "Letters v2" prototype. This screen does not make letters:
 * Annual letters are generated automatically when the Appraisal Sheet is
 * generated for a location (Appraisal Cycle Master), Exceptional letters from
 * the Exceptional grid. Here HR reviews,
 * sends, resends, voids and replaces them, and (HR only) maintains the
 * Letter Rules, Letter Fields and Templates.
 *
 * Props
 *   canEdit     false = View access: grid, preview and export only
 *   onNavigate  (tabKey) => void, used for the link back to the Appraisal Cycle Master
 */

const VIS_KEY = "letters_vis_v2";
const RPW_KEY = "letters_rpw";
const NOTES_KEY = "letters_notes";
const SECTIONS = ["Annual", "Exceptional"];
const CONFIG_TABS = [
  ["rules", "Letter Rules"],
  ["fields", "Letter Fields"],
  ["tpl", "Templates"],
];

const readText = (key) => {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
};
const writeText = (key, value) => {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* ignore */
  }
};

/* close a small pop-up when the user clicks outside it or presses Escape */
function useDismiss(open, onClose, ref) {
  useEffect(() => {
    if (!open) return undefined;
    const down = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose();
    };
    const key = (e) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [open, onClose, ref]);
}

/* the editable Remarks cell: saved (and audited) when the user leaves it */
function RemarkInput({ letter, actor }) {
  const [val, setVal] = useState(letter.remarks || "");
  useEffect(() => setVal(letter.remarks || ""), [letter.remarks]);
  const commit = () => {
    if (val !== (letter.remarks || "")) store.saveRemark(letter.id, val, actor);
  };
  return (
    <input
      className={"rem" + (val ? " dirty" : "")}
      value={val}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      aria-label="Remarks"
    />
  );
}

/* ============================================================ */

export function LettersPage({ canEdit = true, onNavigate }) {
  const user = useCatalystUser();
  const actor = user?.name || "HR";
  const { S, version, sync } = store.useLetters();
  const ui = useLtBar();
  const { toast, el: toastEl } = useToast();

  const [tab, setTab] = useState("letters"); // letters | audit | rules | fields | tpl
  const [sec, setSec] = useState("Annual");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const [pv, setPv] = useState(null); // id of the letter open in Preview
  const [pvErr, setPvErr] = useState("");
  const [tplSel, setTplSel] = useState("");
  const [ptab, setPtab] = useState("stats");
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelW, setPanelW] = useState(() => Math.max(320, Math.min(760, parseInt(readText(RPW_KEY), 10) || 360)));
  const [moreOpen, setMoreOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [notes, setNotes] = useState(() => readText(NOTES_KEY));

  const moreRef = useRef(null);
  const menuRef = useRef(null);
  const notesRef = useRef(null);
  const asideRef = useRef(null);
  useDismiss(moreOpen, () => setMoreOpen(false), moreRef);
  useDismiss(menuOpen, () => setMenuOpen(false), menuRef);
  useDismiss(notesOpen, () => setNotesOpen(false), notesRef);

  // Templates live on the server: load them when the screen opens.
  // The templates shown are the ones of the location chosen in the top bar.
  const [selectedLocation] = useSelectedLocation();
  useEffect(() => {
    store.syncTemplates({ location: selectedLocation });
    // Letters generated on any computer are kept on the server: load them.
    store.syncLettersForLocation(selectedLocation);
  }, [selectedLocation]);

  // Escape closes the letter preview.
  useEffect(() => {
    if (!pv) return undefined;
    const key = (e) => e.key === "Escape" && setPv(null);
    document.addEventListener("keydown", key);
    return () => document.removeEventListener("keydown", key);
  }, [pv]);

  // A user without Edit access never sees the HR-only tabs.
  const visibleTab = !canEdit && tab !== "letters" ? "letters" : tab;

  /* ---------------- rows ---------------- */

  const secRows = useMemo(
    () =>
      S.letters.filter((l) => {
        if ((cyOf(S, l.cycle) || {}).type !== sec) return false;
        if (isAllLocations(selectedLocation)) return true;
        // location-wise: only the employees of the location chosen in the top bar
        const r = empOf(S, l);
        return !!r && String((r.v && r.v.emLocation) || "").toLowerCase() === String(selectedLocation).toLowerCase();
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [S, version, sec, selectedLocation],
  );
  const selected = useMemo(
    () => S.letters.filter((l) => sel.has(l.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [S, version, sel],
  );

  /* Preview opens the letter as it will be sent. For HR, opening a Ready
     letter counts as reviewing it. */
  const openPreview = (id) => {
    const l = S.letters.find((x) => x.id === id);
    if (canEdit && l && l.status === "Ready") store.previewLetter(id, actor);
    setPvErr("");
    setPv(id);
  };
  const rowSend = (id) => {
    const l = S.letters.find((x) => x.id === id);
    const why = l ? sendProblem(S, l) : "status is unknown";
    if (why) {
      toast("Cannot send: " + why);
      return;
    }
    const res = store.sendLetters([id], actor);
    const after = S.letters.find((x) => x.id === id);
    if (res.sent && after) toast(after.status === "Failed" ? "Send failed; use Send again" : "Sent to " + after.sentTo);
  };
  const sendFromPreview = () => {
    const l = S.letters.find((x) => x.id === pv);
    const why = l ? sendProblem(S, l) : "status is unknown";
    if (why) {
      setPvErr("Cannot send: " + why + ".");
      return;
    }
    store.sendLetters([pv], actor);
    const after = S.letters.find((x) => x.id === pv);
    setSel((cur) => {
      const n = new Set(cur);
      n.delete(pv);
      return n;
    });
    setPv(null);
    toast(after && after.status === "Failed" ? "Send failed; retry from Preview or Send" : "Sent to " + (after ? after.sentTo : ""));
  };

  /* ---------------- grid columns ---------------- */

  const defs = [
    {
      key: "emp",
      label: "Employee",
      w: 190,
      fixed: true,
      get: (l) => `${empOf(S, l).id} - ${empOf(S, l).name}`,
      render: (l) => (
        <>
          <div className="nm">
            {empOf(S, l).id} - {empOf(S, l).name}
          </div>
          <div className="ds">{empOf(S, l).v.designation}</div>
        </>
      ),
    },
    {
      key: "pv",
      label: "Actions",
      w: 150,
      get: () => "Preview",
      render: (l) => (
        <span style={{ whiteSpace: "nowrap" }}>
          <button type="button" className="lt-lnk" onClick={() => openPreview(l.id)}>Preview</button>
          {canEdit && (l.status === "Reviewed" || l.status === "Failed") && (
            <>
              <span className="lt-sep">|</span>
              <button type="button" className="lt-lnk" onClick={() => rowSend(l.id)}>Send</button>
            </>
          )}
        </span>
      ),
    },
    {
      key: "status",
      label: "Status",
      w: 112,
      get: (l) => l.status,
      render: (l) => <span className={"lt-chip " + STATUS_CLASS[l.status]}>{l.status}</span>,
    },
    {
      key: "alert",
      label: "Alert",
      w: 170,
      get: (l) => l.tag || "",
      render: (l) => (l.tag ? <span className="lt-chip sw" title={l.alert}>{l.tag}</span> : null),
    },
    { key: "tech", label: "Tech ED", w: 100, get: (l) => empOf(S, l).tech },
    { key: "cycle", label: "Appraisal Cycle", w: 150, vis: false, get: (l) => (cyOf(S, l.cycle) || {}).name || "" },
    { key: "ctype", label: "Cycle Type", w: 100, vis: false, get: (l) => (cyOf(S, l.cycle) || {}).type || "" },
    { key: "promo", label: "Promotion", w: 100, get: (l) => empOf(S, l).v.promo },
    { key: "type", label: "Letter Type", w: 170, get: (l) => `${l.family} - ${l.type}` },
    { key: "tpl", label: "Template", w: 190, get: (l) => `${tplOf(S, l.tpl).name} v${l.ver}` },
    ...S.fields
      .filter((f) => f.col !== "promo")
      .map((f) => {
        const ct = catOf(f.col);
        const amount = !!ct && ct[2] === "amount";
        const numeric = amount || (!!ct && ct[2] === "pct");
        return {
          key: "f_" + f.id,
          label: f.label,
          w: amount ? 118 : 130,
          vis: !!f.show,
          sum: amount,
          raw: (l) => num(empOf(S, l).v[f.col]),
          get: (l) => fmtVal(empOf(S, l), f.col),
          sv: numeric ? (l) => num(empOf(S, l).v[f.col]) : undefined,
          render: numeric ? (l) => <span className="lt-num">{fmtVal(empOf(S, l), f.col)}</span> : undefined,
        };
      }),
    { key: "sentOn", label: "Sent On", w: 100, get: (l) => l.sentOn },
    { key: "sentBy", label: "Sent By", w: 100, vis: false, get: (l) => l.sentBy },
    { key: "sentTo", label: "Sent To", w: 150, get: (l) => l.sentTo },
    { key: "resends", label: "Resend Count", w: 100, vis: false, get: (l) => String(l.resends), sv: (l) => l.resends, render: (l) => <span className="lt-num">{l.resends}</span> },
    { key: "lastResent", label: "Last Resent On", w: 130, vis: false, get: (l) => l.lastResent },
    {
      key: "remarks",
      label: "Remarks",
      w: 180,
      get: (l) => l.remarks,
      render: (l) => (canEdit ? <RemarkInput letter={l} actor={actor} /> : l.remarks),
    },
  ];
  const grid = useLtGrid(defs, VIS_KEY);
  const term = q.trim().toLowerCase();
  const pre = term
    ? (l) => `${empOf(S, l).name} ${empOf(S, l).id}`.toLowerCase().includes(term)
    : null;
  const view = useGridView(secRows, defs, grid, pre);
  const paged = usePaged(view);

  const visKeys = new Set(grid.cols.filter((c) => c.vis).map((c) => c.key));
  const sums = defs.filter((d) => d.sum && visKeys.has(d.key)).map((d) => [d.label, view.reduce((a, l) => a + d.raw(l), 0)]);

  /* ---------------- selection ---------------- */

  const allSelected = view.length > 0 && view.every((l) => sel.has(l.id));
  const someSelected = view.some((l) => sel.has(l.id));
  const toggleRow = (id) => {
    setSel((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    setSel((cur) => {
      const n = new Set(cur);
      if (allSelected) view.forEach((l) => n.delete(l.id));
      else view.forEach((l) => n.add(l.id));
      return n;
    });
  };

  /* ---------------- actions ---------------- */

  const hasAll = (list) => selected.length > 0 && selected.every((l) => list.includes(l.status));
  const enabled = {
    test: selected.length > 0,
    resend: hasAll([...SENT_STATUSES, "Failed"]),
    void: hasAll([...OPEN_STATUSES, ...SENT_STATUSES]),
    replace: selected.length === 1 && hasAll(SENT_STATUSES),
  };

  const changeSection = (s2) => {
    setSec(s2);
    setSel(new Set());
  };
  const changeTab = (t) => {
    setTab(t);
    ui.close();
    setMenuOpen(false);
  };

  const more = (a) => {
    setMoreOpen(false);
    const ids = selected.map((l) => l.id);
    if (a === "test") {
      const from = store.sendTestLetter(ids[0], actor);
      toast(`Test sent to ${from} only; nothing is stamped on the letter`);
      return;
    }
    const title = { resend: "Why are you resending?", void: "Why is the letter being voided?", replace: "Why is the letter being replaced?" }[a];
    ui.askReason(title, (reason) => {
      store.moreOnLetters(a, ids, reason, actor);
      setSel(new Set());
      toast("Done");
    });
  };

  const exportGrid = async (defsToUse, rows, file, sheet) => {
    try {
      await exportRows(defsToUse, rows, file, sheet);
      toast(`Exported ${rows.length} rows`);
    } catch {
      toast("Export not available here");
    }
  };
  const exportLetters = () =>
    exportGrid(
      defs.filter((d) => visKeys.has(d.key)),
      view,
      "Letters",
      "Letters",
    );

  const openCycleMaster = () => onNavigate && onNavigate("appraisal-cycle");

  /* ---------------- right panel ---------------- */

  const startResize = (e) => {
    e.preventDefault();
    let w = panelW;
    const move = (ev) => {
      w = Math.max(320, Math.min(760, window.innerWidth - 24 - ev.clientX));
      setPanelW(w);
    };
    const up = () => {
      document.removeEventListener("mousemove", move);
      document.removeEventListener("mouseup", up);
      writeText(RPW_KEY, String(w));
    };
    document.addEventListener("mousemove", move);
    document.addEventListener("mouseup", up);
  };
  const expandPanel = () => {
    const w = panelW < 500 ? 640 : 360;
    setPanelW(w);
    writeText(RPW_KEY, String(w));
  };

  const renderStatsTab = () => {
    const sc = S.letters;
    const techs = [];
    sc.forEach((x) => {
      const t = empOf(S, x).tech;
      if (!techs.includes(t)) techs.push(t);
    });
    const tot = [0, 0, 0, 0, 0];
    const rowsHtml = techs.map((t) => {
      const a = sc.filter((x) => empOf(S, x).tech === t);
      const v = [a.length, a.filter((x) => x.sentOn).length, a.filter((x) => x.status === "Delivered").length, a.filter((x) => x.status === "Failed").length, a.filter((x) => x.resends > 0).length];
      v.forEach((n, i) => {
        tot[i] += n;
      });
      return (
        <tr key={t}>
          <td>{t}</td>
          {v.map((n, i) => (
            <td className="n" key={i}>{n}</td>
          ))}
        </tr>
      );
    });

    // Only cycles whose letters were generated can "need" letters.
    const genCycles = new Set(S.cycles.filter((c) => lettersStats(S, c.id).gen).map((c) => c.id));
    const need = needLetters(S, (r) => genCycles.has(r.cycle));
    const nl = [];
    S.sheet.forEach((r) => {
      if (!genCycles.has(r.cycle)) return;
      if (r.status !== "Active") nl.push([r.name, r.status]);
      else if (!pick(S, r).length) nl.push([r.name, "No matching rule"]);
    });

    return (
      <>
        <div className="lt-rp-card">
          <h4>Per Tech ED</h4>
          <table className="mt">
            <thead>
              <tr>
                <th>Tech ED</th>
                <th className="n">Made</th>
                <th className="n">Sent</th>
                <th className="n">Delivered</th>
                <th className="n">Failed</th>
                <th className="n">Resent</th>
              </tr>
            </thead>
            <tbody>
              {rowsHtml}
              <tr className="tt">
                <td>Total</td>
                {tot.map((n, i) => (
                  <td className="n" key={i}>{n}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <div className="lt-rp-card">
          <h4>Needs a new letter</h4>
          {need.length ? (
            <div className="lt-rp-note">
              Letters are generated automatically with the Appraisal Sheet; check the Appraisal Cycle Master.{" "}
              {onNavigate && (
                <button type="button" className="lt-btn sm" onClick={openCycleMaster}>Open ›</button>
              )}
            </div>
          ) : (
            <div className="lt-mut">None.</div>
          )}
        </div>
        {need.map((n, i) => (
          <div className="lt-call am" key={"n" + i}>
            <span className="tg">Needs letter</span>
            <div className="ln"><b>{n[0]}</b><span>{n[1]}</span></div>
          </div>
        ))}
        <div className="lt-rp-card">
          <h4>Not Getting A Letter</h4>
          {!nl.length && <div className="lt-mut">Everyone gets a letter.</div>}
        </div>
        {nl.map((n, i) => (
          <div className="lt-call" key={"x" + i}>
            <span className="tg">{n[1]}</span>
            <div className="ln"><b>{n[0]}</b></div>
          </div>
        ))}
      </>
    );
  };

  const renderViewTab = () => (
    <div className="lt-rp-card">
      <h4>Columns in the grid</h4>
      {defs.map((d) => {
        const c = grid.cols.find((x) => x.key === d.key);
        return d.fixed ? (
          <div className="lt-rp-row" key={d.key}>
            <span>{d.label}</span>
            <b className="lt-mut">always</b>
          </div>
        ) : (
          <label className="lt-rp-row ck" key={d.key}>
            <span>{d.label}</span>
            <input type="checkbox" checked={!!(c && c.vis)} onChange={(e) => grid.patchCol(d.key, { vis: e.target.checked })} />
          </label>
        );
      })}
      <div className="lt-rp-note">
        Saved in this browser. HR sets the default list in Letter Fields (Show in grid). Any Appraisal Sheet column can be added there.
      </div>
    </div>
  );

  /* Templates tab: what the selected template is used by */
  const renderTplPanel = () => {
    const t = tplSel ? tplOf(S, tplSel) : null;
    if (!t) return <div className="lt-rp-info">Select a template.</div>;
    const rl = S.rules.filter((r) => templateGroup(S, r.tpl).some((x) => x.id === t.id));
    const ls = S.letters.filter((l) => l.tpl === t.id);
    const cnt = {};
    ls.forEach((l) => {
      cnt[l.status] = (cnt[l.status] || 0) + 1;
    });
    const unsent = ls.filter((l) => ["Ready", "Reviewed", "Failed"].includes(l.status)).length;
    return (
      <>
        <div className="lt-rp-card">
          <h4>Rules using this template</h4>
          {rl.length ? (
            rl.map((r) => (
              <div className="lt-rp-row" key={r.id}>
                <span>{r.name}</span>
                <b>{r.active ? "Active" : "Inactive"}</b>
              </div>
            ))
          ) : (
            <div className="lt-mut">None.</div>
          )}
        </div>
        <div className="lt-rp-card">
          <h4>Letters made with it</h4>
          {ls.length ? (
            STATUSES.filter((x) => cnt[x]).map((x) => (
              <div className="lt-rp-row" key={x}>
                <span>{x}</span>
                <b>{cnt[x]}</b>
              </div>
            ))
          ) : (
            <div className="lt-mut">None yet.</div>
          )}
        </div>
        {unsent > 0 && (
          <div className="lt-call am">
            <span className="tg">On save</span>
            <div className="ln"><b>{unsent} unsent letter{unsent > 1 ? "s" : ""}</b></div>
            <div className="sub">are marked Out of date and must be generated again.</div>
          </div>
        )}
      </>
    );
  };

  const tplPanel = visibleTab === "tpl";
  const selTpl = tplSel ? tplOf(S, tplSel) : null;
  const renderPanel = () => (
    <aside className="lt-rp" ref={asideRef} style={{ width: panelW }} aria-label="Letters Panel">
      <div className="lt-rp-grip" title="Drag to resize" onMouseDown={startResize} />
      <div className="lt-rp-head">
        <div className="lt-rp-who">
          {tplPanel ? (
            <>
              <b>Templates</b>
              {selTpl ? <> &middot; {selTpl.name}</> : null}
            </>
          ) : (
            <>
              <b>Letters</b> &middot; {sec}
            </>
          )}
        </div>
        <button type="button" className="lt-rp-ic" title="Expand" onClick={expandPanel}>&#10530;</button>
        <button type="button" className="lt-rp-ic" title="Close" aria-label="Close panel" onClick={() => setPanelOpen(false)}>&#10005;</button>
      </div>
      <div className="lt-rp-tabs" role="tablist">
        {(tplPanel ? [["use", "Used by"]] : [["stats", "Stats"], ["view", "My view"]]).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tplPanel ? true : ptab === k} onClick={() => !tplPanel && setPtab(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="lt-rp-body">{tplPanel ? renderTplPanel() : ptab === "stats" ? renderStatsTab() : renderViewTab()}</div>
      <div className="lt-rp-foot">
        <form onSubmit={(e) => e.preventDefault()}>
          <input placeholder="Ask about this screen..." autoComplete="off" />
          <button type="submit" className="lt-ag-send">Send</button>
        </form>
        <div className="lt-rp-note">Facts only &middot; no predictions &middot; every question logged</div>
      </div>
    </aside>
  );

  /* ---------------- letter preview ---------------- */

  const renderPreview = () => {
    const l = pv ? S.letters.find((x) => x.id === pv) : null;
    if (!l) return null;
    const r = empOf(S, l);
    const t = tplOf(S, l.tpl);
    const mg = mergeLetterHtml(t.html, tagValues(S, l), t.sg);
    const sendable = canEdit && (l.status === "Reviewed" || l.status === "Failed");
    const why = sendable ? sendProblem(S, l) : "";
    const note = pvErr || (why ? `Cannot send: ${why}.` : l.alert || "");
    return (
      <div className="lt-preview-backdrop" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setPv(null)}>
        <div className="lt-preview-modal" role="dialog" aria-modal="true" aria-label="Letter preview">
          <div className="lt-preview-head">
            <div>
              <b>{r.id} - {r.name}</b>
              <div className="ds">{l.family} - {l.type} &middot; {t.name} v{l.ver} &middot; To {r.email || "no email"}</div>
            </div>
            <span className="lt-sp" />
            <span className={"lt-chip " + STATUS_CLASS[l.status]} style={{ marginRight: 10 }}>{l.status}</span>
            <button type="button" className="lt-rp-ic" aria-label="Close" onClick={() => setPv(null)}>&#10005;</button>
          </div>
          <div className="lt-preview-body">
          <div className="lt-preview-page" style={letterFontStyle(t)}>
            {t.sg.logoData ? <img className="lt-preview-logo" src={t.sg.logoData} alt="Company logo" /> : <div className="lt-logo-ph">{t.sg.logoFile || "Company logo"}</div>}
            <div dangerouslySetInnerHTML={{ __html: mg.html }} />
          </div>
          </div>
          <div className="lt-preview-foot">
            <span className="err">{note}</span>
            <span className="lt-sp" />
            {sendable && <button type="button" className="lt-btn main" disabled={!!why} onClick={sendFromPreview}>Send</button>}
            <button type="button" className="lt-btn" onClick={() => setPv(null)}>Close</button>
          </div>
        </div>
      </div>
    );
  };

  /* ---------------- main pane ---------------- */

  const lettersPane = (
    <>
      <div className="lt-toolbar">
        <input className="lt-txt search" placeholder="Search name, ID" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search letters" />
        <span className="lt-seg">
          {SECTIONS.map((s) => (
            <button key={s} type="button" className={sec === s ? "on" : ""} onClick={() => changeSection(s)}>
              {s}
            </button>
          ))}
        </span>
        <span className="lt-sp" />
        {canEdit && (
          <span className="lt-pw" ref={moreRef}>
            <button type="button" className="lt-btn" onClick={() => setMoreOpen((o) => !o)}>More ▾</button>
            {moreOpen && (
              <div className="lt-pop" role="menu">
                {[
                  ["test", "Send test to me"],
                  ["resend", "Resend"],
                  ["void", "Void"],
                  ["replace", "Replace (correction)"],
                ].map(([k, label]) => (
                  <button key={k} type="button" role="menuitem" className="item" disabled={!enabled[k]} style={enabled[k] ? undefined : { opacity: 0.4, cursor: "not-allowed" }} onClick={() => enabled[k] && more(k)}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </span>
        )}
      </div>
      {ui.el}
      <div className="lt-content grid">
        <DataGrid
          defs={defs}
          grid={grid}
          allRows={secRows}
          rows={paged.pageRows}
          rowKey={(l) => l.id}
          selectable={canEdit}
          selected={sel}
          onToggleRow={toggleRow}
          onToggleAll={toggleAll}
          allSelected={allSelected}
          someSelected={someSelected}
          emptyText={
            secRows.length
              ? "No Letters Match The Current Filters."
              : sec === "Annual"
                ? "No letters yet. Annual letters are generated automatically when the Appraisal Sheet is generated for the location."
                : "No letters yet. Exceptional letters are generated from the Exceptional grid."
          }
        />
        <ClientPager page={paged.page} pages={paged.pages} from={paged.from} to={paged.to} total={view.length} allTotal={secRows.length} onPage={paged.setPage} grid={grid} />
      </div>
    </>
  );

  return (
    <div className="lt">
      <div className="lt-tabrow">
        <button type="button" className={"lt-tab" + (visibleTab === "letters" ? " on" : "")} onClick={() => changeTab("letters")}>Letters</button>
        {canEdit &&
          CONFIG_TABS.map(([k, label]) => (
            <button key={k} type="button" className={"lt-tab" + (visibleTab === k ? " on" : "")} onClick={() => changeTab(k)}>
              {label}
            </button>
          ))}
        <div className="lt-tr-right">
          <span className="lt-pw" ref={notesRef}>
            <button type="button" className="lt-btn" onClick={() => setNotesOpen((o) => !o)}>My notes</button>
            {notesOpen && (
              <div className="lt-pop notes">
                <h4>My notes</h4>
                <textarea
                  placeholder="Write your notes here"
                  value={notes}
                  onChange={(e) => {
                    setNotes(e.target.value);
                    writeText(NOTES_KEY, e.target.value);
                  }}
                />
                <small>Saved in this browser</small>
              </div>
            )}
          </span>
          <span className="lt-pw" ref={menuRef}>
            <button type="button" className="lt-btn pri" onClick={() => setMenuOpen((o) => !o)}>Menu ▾</button>
            {menuOpen && (
              <div className="lt-pop" role="menu">
                {canEdit && (
                  <button type="button" className="item" role="menuitem" onClick={() => { setMenuOpen(false); changeTab("audit"); }}>Audit Trail</button>
                )}
                <button
                  type="button"
                  className="item"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    if (visibleTab === "audit") exportGrid(AUDIT_DEFS, S.audit, "Letters_Audit_Trail", "Audit");
                    else exportLetters();
                  }}
                >
                  Export to Excel
                </button>
                {store.LETTERS_DEMO && (
                  <>
                    <button type="button" className="item" role="menuitem" disabled={S.letters.length > 0} style={S.letters.length > 0 ? { opacity: 0.4, cursor: "not-allowed" } : undefined} onClick={() => { setMenuOpen(false); store.loadSampleLetters(actor); toast("Sample letters loaded"); }}>Load sample history</button>
                    <button type="button" className="item" role="menuitem" onClick={() => { setMenuOpen(false); store.resetSampleData(); setSel(new Set()); toast("Sample data reset"); }}>Reset sample data</button>
                  </>
                )}
              </div>
            )}
          </span>
        </div>
      </div>

      {sync.status === "error" && visibleTab === "tpl" && (
        <div className="lt-note warn">
          <span>Templates could not be loaded from the server: {sync.message} The built-in samples are shown.</span>
          <span className="sp">
            <button type="button" className="lt-btn sm" onClick={() => store.syncTemplates({ force: true, location: selectedLocation })}>Retry</button>
          </span>
        </div>
      )}
      <div className="lt-body">
        <div className="lt-pane">
          {visibleTab === "letters" && lettersPane}
          {visibleTab === "audit" && canEdit && (
            <AuditTab S={S} onBack={() => changeTab("letters")} onExport={(rows) => exportGrid(AUDIT_DEFS, rows, "Letters_Audit_Trail", "Audit")} />
          )}
          {visibleTab === "rules" && canEdit && <RulesTab S={S} actor={actor} ui={ui} toast={toast} />}
          {visibleTab === "fields" && canEdit && <FieldsTab S={S} actor={actor} ui={ui} toast={toast} />}
          {visibleTab === "tpl" && canEdit && <TemplatesTab S={S} actor={actor} ui={ui} toast={toast} sync={sync} selectedId={tplSel} setSelectedId={setTplSel} />}
        </div>
        {panelOpen ? renderPanel() : <button type="button" className="lt-flap" aria-label="Open panel" onClick={() => setPanelOpen(true)}>Panel ›</button>}
      </div>
      {renderPreview()}
      {toastEl}
    </div>
  );
}

export default LettersPage;
