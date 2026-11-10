import { useEffect, useMemo, useRef, useState } from "react";
import { ClientPager, DataGrid, useGridView } from "./DataGrid";
import { AUDIT_DEFS, AuditTab, FieldsTab, RulesTab, TemplatesTab } from "./LettersConfigTabs";
import { LtPreview, exportRows, useLtBar, useLtGrid, usePaged, useToast } from "./letters-ui";
import {
  OPEN_STATUSES,
  SENT_STATUSES,
  STATUS_CLASS,
  catOf,
  cyOf,
  empOf,
  fmtVal,
  inr,
  lOf,
  lettersStats,
  merge,
  needLetters,
  num,
  pct,
  pick,
  sendProblem,
  tplOf,
} from "@/lib/letters-core";
import * as store from "@/lib/letters-store";
import { useCatalystUser } from "@/lib/catalyst-auth";
import "./employee-master-ui.css";
import "./letters-page.css";

/*
 * HR Operations -> Operation -> Letters.
 *
 * Ported from the "Letters v2" prototype. This screen does not make letters:
 * Annual letters are generated from the Letters step of the Appraisal Cycle
 * Master, Exceptional letters from the Exceptional grid. Here HR reviews,
 * sends, resends, withdraws and replaces them, and (HR only) maintains the
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

const fmtSnap = (col, v) => {
  const c = catOf(col);
  if (v == null) return "";
  if (c && c[2] === "amount") return inr(v);
  if (c && c[2] === "pct") return pct(v);
  return String(v);
};

/* ============================================================ */

export function LettersPage({ canEdit = true, onNavigate }) {
  const user = useCatalystUser();
  const actor = user?.name || "HR";
  const { S, version } = store.useLetters();
  const ui = useLtBar();
  const { toast, el: toastEl } = useToast();

  const [tab, setTab] = useState("letters"); // letters | audit | rules | fields | tpl
  const [sec, setSec] = useState("Annual");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState(() => new Set());
  const [active, setActive] = useState(null);
  const [ptab, setPtab] = useState("letter");
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelW, setPanelW] = useState(() => Math.max(320, Math.min(760, parseInt(readText(RPW_KEY), 10) || 360)));
  const [confirmN, setConfirmN] = useState(null);
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

  // "Send" asks for a second click; the confirmation lapses after 6 seconds.
  useEffect(() => {
    if (confirmN == null) return undefined;
    const t = window.setTimeout(() => setConfirmN(null), 6000);
    return () => window.clearTimeout(t);
  }, [confirmN]);

  // A user without Edit access never sees the HR-only tabs.
  const visibleTab = !canEdit && tab !== "letters" ? "letters" : tab;

  /* ---------------- rows ---------------- */

  const secRows = useMemo(
    () => S.letters.filter((l) => (cyOf(S, l.cycle) || {}).type === sec),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [S, version, sec],
  );
  const selected = useMemo(
    () => S.letters.filter((l) => sel.has(l.id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [S, version, sel],
  );

  const openLetter = (id) => {
    setActive(id);
    setPtab("letter");
    setPanelOpen(true);
  };

  /* ---------------- grid columns ---------------- */

  const defs = [
    {
      key: "emp",
      label: "Employee",
      w: 210,
      fixed: true,
      get: (l) => `${empOf(S, l).id} - ${empOf(S, l).name}`,
      render: (l) => (
        <>
          <button type="button" className="nm" onClick={() => openLetter(l.id)}>
            {empOf(S, l).id} - {empOf(S, l).name}
          </button>
          <div className="ds">{empOf(S, l).v.designation}</div>
        </>
      ),
    },
    { key: "tech", label: "Tech ED", w: 120, get: (l) => empOf(S, l).tech },
    { key: "cycle", label: "Appraisal Cycle", w: 150, get: (l) => (cyOf(S, l.cycle) || {}).name || "" },
    { key: "ctype", label: "Cycle Type", w: 100, get: (l) => (cyOf(S, l.cycle) || {}).type || "" },
    { key: "promo", label: "Promotion", w: 112, get: (l) => empOf(S, l).v.promo },
    { key: "type", label: "Letter Type", w: 170, get: (l) => `${l.family} - ${l.type}` },
    { key: "tpl", label: "Template", w: 190, get: (l) => `${tplOf(S, l.tpl).name} v${l.ver}` },
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
      w: 230,
      get: (l) => l.alert || "",
      render: (l) =>
        l.alert ? (
          <>
            <span className="lt-chip sw">{l.flag ? "Changed after sending" : l.status === "Dropped" ? "Dropped" : "Out of date"}</span>
            <div className="ds">{l.alert}</div>
          </>
        ) : null,
    },
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
    { key: "sentOn", label: "Sent On", w: 130, get: (l) => l.sentOn },
    { key: "sentBy", label: "Sent By", w: 100, get: (l) => l.sentBy },
    { key: "sentTo", label: "Sent To", w: 200, get: (l) => l.sentTo },
    { key: "resends", label: "Resend Count", w: 100, get: (l) => String(l.resends), sv: (l) => l.resends, render: (l) => <span className="lt-num">{l.resends}</span> },
    { key: "lastResent", label: "Last Resent On", w: 130, get: (l) => l.lastResent },
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
    setConfirmN(null);
    setSel((cur) => {
      const n = new Set(cur);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };
  const toggleAll = () => {
    setConfirmN(null);
    setSel((cur) => {
      const n = new Set(cur);
      if (allSelected) view.forEach((l) => n.delete(l.id));
      else view.forEach((l) => n.add(l.id));
      return n;
    });
  };

  /* ---------------- actions ---------------- */

  const hasAll = (list) => selected.length > 0 && selected.every((l) => list.includes(l.status));
  const canReview = selected.some((l) => l.status === "Ready");
  const canSend = selected.some((l) => ["Reviewed", "Failed"].includes(l.status));
  const enabled = {
    test: selected.length > 0,
    resend: hasAll(SENT_STATUSES),
    withdraw: hasAll([...OPEN_STATUSES, ...SENT_STATUSES]),
    replace: selected.length === 1 && hasAll(SENT_STATUSES),
  };

  const changeSection = (s) => {
    setSec(s);
    setSel(new Set());
    setActive(null);
    setConfirmN(null);
  };
  const changeTab = (t) => {
    setTab(t);
    ui.close();
    setConfirmN(null);
    setMenuOpen(false);
  };

  const preview = () => {
    const id = selected[0] ? selected[0].id : active;
    if (id) openLetter(id);
  };

  const review = () => {
    const n = store.reviewLetters(
      selected.map((l) => l.id),
      actor,
    );
    ui.close();
    toast(`${n} letter(s) marked Reviewed`);
  };

  const send = () => {
    const ready = selected.filter((l) => ["Reviewed", "Failed"].includes(l.status));
    if (confirmN == null) {
      setConfirmN(ready.length);
      return;
    }
    const blockedIds = new Set(ready.filter((l) => sendProblem(S, l)).map((l) => l.id));
    const res = store.sendLetters(
      ready.map((l) => l.id),
      actor,
    );
    setConfirmN(null);
    setSel(blockedIds); // sent ones leave the selection; blocked ones stay so HR can fix them
    ui.say(
      `${res.sent} sent${res.failed ? ` (${res.failed} failed, retry with Send)` : ""}${res.blocked.length ? `. Not sent: ${res.blocked.join("; ")}` : "."}`,
      res.blocked.length > 0 || res.failed > 0,
    );
  };

  const more = (a) => {
    setMoreOpen(false);
    const ids = selected.map((l) => l.id);
    if (a === "test") {
      const from = store.sendTestLetter(ids[0], actor);
      toast(`Test sent to ${from} only; nothing is stamped on the letter`);
      return;
    }
    const title = { resend: "Why are you resending?", withdraw: "Why are you withdrawing?", replace: "Why is the letter being replaced?" }[a];
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
    const right = asideRef.current ? asideRef.current.getBoundingClientRect().right : window.innerWidth;
    let w = panelW;
    const move = (ev) => {
      w = Math.max(320, Math.min(760, right - ev.clientX));
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

  const activeLetter = active ? lOf(S, active) : null;

  const renderLetterTab = () => {
    const l = activeLetter;
    if (!l) return <div className="lt-rp-info">Click a row to see the letter and the Appraisal Sheet values it was made from.</div>;
    const r = empOf(S, l);
    const mg = merge(S, l);
    const hist = S.audit.filter((a) => a.scope === "Letter" && a.ref === l.id);
    const call = (tag, head, sub) => (
      <div className="lt-call am">
        <span className="tg">{tag}</span>
        <div className="ln"><b>{head}</b></div>
        <div className="sub">{sub}</div>
      </div>
    );
    return (
      <>
        {l.status === "Out of date" && call("Out of date", l.alert, "It cannot be sent. Regenerate it from the Letters step of the Appraisal Cycle Master.")}
        {l.status === "Dropped" && call("Dropped", l.alert, "Never sent; kept for history.")}
        {l.flag && call("Changed after sending", l.alert, "The sent letter is unchanged. Use More: Replace or Withdraw, with a reason.")}
        {!r.email && call("No email", "No email on the Employee Master", "This letter cannot be sent until it is added.")}
        {mg.miss.length > 0 && call("Empty tag", mg.miss.map((k) => `{{${k}}}`).join(", "), "The letter is blocked from sending.")}
        <div className="lt-rp-card">
          <h4>Letter</h4>
          {[
            ["Type", `${l.family} - ${l.type}`],
            ["Rule", l.ruleName],
            ["Template", `${tplOf(S, l.tpl).name} v${l.ver}`],
            ["Status", l.status],
            ["Sent on", l.sentOn || "-"],
            ["Sent by", l.sentBy || "-"],
            ["Sent to", l.sentTo || "-"],
            ["Resends", String(l.resends)],
          ].map((x) => (
            <div className="lt-rp-row" key={x[0]}>
              <span>{x[0]}</span>
              <b>{x[1]}</b>
            </div>
          ))}
        </div>
        <div className="lt-rp-card">
          <h4>Appraisal Sheet values</h4>
          {S.fields.map((f) => {
            const now = fmtVal(r, f.col);
            const was = fmtSnap(f.col, l.snap[f.col]);
            const ch = was !== now;
            return (
              <div className="lt-rp-row" key={f.id}>
                <span>{f.label}</span>
                <b className={ch ? "chg" : ""}>
                  {now}
                  {ch && <em>was {was}</em>}
                </b>
              </div>
            );
          })}
        </div>
        <div className="lt-rp-card">
          <h4>Preview</h4>
          <LtPreview text={mg.text} />
        </div>
        <div className="lt-rp-card">
          <h4>History</h4>
          {hist.length ? (
            hist.map((a) => (
              <div className="lt-tl" key={a.id + a.when + a.action}>
                <i />
                <div>
                  <b>{a.action}</b> &middot; {a.when}
                  <div className="lt-mut">
                    {a.by}
                    {a.reason ? ` · ${a.reason}` : ""}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="lt-mut">No history.</div>
          )}
        </div>
      </>
    );
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
              Generate from the Letters step of the Appraisal Cycle Master.{" "}
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
          <h4>Not getting a letter</h4>
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

  const renderPanel = () => (
    <aside className="lt-rp" ref={asideRef} style={{ width: panelW }} aria-label="Letters panel">
      <div className="lt-rp-grip" title="Drag to resize" onMouseDown={startResize} />
      <div className="lt-rp-head">
        <div className="lt-rp-who">
          {activeLetter ? (
            <>
              <b>{empOf(S, activeLetter).name}</b> &middot; {empOf(S, activeLetter).id} &middot; {empOf(S, activeLetter).v.designation} &middot; {empOf(S, activeLetter).tech}
            </>
          ) : (
            <>
              <b>Letters</b> &middot; {sec} &middot; select a row
            </>
          )}
        </div>
        <button type="button" className="lt-rp-ic" title="Expand" onClick={expandPanel}>&#10530;</button>
        <button type="button" className="lt-rp-ic" title="Close" aria-label="Close panel" onClick={() => setPanelOpen(false)}>&#10005;</button>
      </div>
      <div className="lt-rp-tabs" role="tablist">
        {[
          ["letter", "Letter"],
          ["stats", "Stats"],
          ["view", "My view"],
        ].map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={ptab === k} onClick={() => setPtab(k)}>
            {label}
          </button>
        ))}
      </div>
      <div className="lt-rp-body">{ptab === "letter" ? renderLetterTab() : ptab === "stats" ? renderStatsTab() : renderViewTab()}</div>
    </aside>
  );

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
        {onNavigate && (
          <button type="button" className="lt-btn" onClick={openCycleMaster} title="Annual letters are generated on the Letters step of the Appraisal Cycle Master">
            Appraisal Cycle ›
          </button>
        )}
        <button type="button" className="lt-btn" disabled={!(active || selected.length)} onClick={preview}>Preview</button>
        {canEdit && (
          <>
            <button type="button" className="lt-btn" disabled={!canReview} onClick={review}>Mark reviewed</button>
            <button type="button" className="lt-btn main" disabled={!canSend} onClick={send}>
              {confirmN != null ? `Confirm · ${confirmN} letters` : "Send"}
            </button>
            <span className="lt-pw" ref={moreRef}>
              <button type="button" className="lt-btn" onClick={() => setMoreOpen((o) => !o)}>More ▾</button>
              {moreOpen && (
                <div className="lt-pop" role="menu">
                  {[
                    ["test", "Send test to me"],
                    ["resend", "Resend"],
                    ["withdraw", "Withdraw"],
                    ["replace", "Replace (correction)"],
                  ].map(([k, label]) => (
                    <button key={k} type="button" role="menuitem" className="item" disabled={!enabled[k]} style={enabled[k] ? undefined : { opacity: 0.4, cursor: "not-allowed" }} onClick={() => enabled[k] && more(k)}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </span>
          </>
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
          rowClass={(l) => (l.id === active ? "lt-act" : "")}
          emptyText={
            secRows.length
              ? "No letters match the current filters."
              : sec === "Annual"
                ? "No letters yet. Annual letters are generated from the Letters step of the Appraisal Cycle Master."
                : "No letters yet. Exceptional letters are generated from the Exceptional grid."
          }
        />
        <ClientPager page={paged.page} pages={paged.pages} from={paged.from} to={paged.to} total={view.length} allTotal={secRows.length} onPage={paged.setPage} grid={grid} />
      </div>
      <div className="lt-foot2">
        <span><b>{view.length}</b> letters</span>
        {sel.size > 0 && <span><b>{sel.size}</b> selected</span>}
        {sums.map(([label, total]) => (
          <span key={label}>{label}: <b>{inr(total)}</b></span>
        ))}
      </div>
    </>
  );

  return (
    <div className="lt">
      {store.LETTERS_DEMO && (
        <div className="lt-note">
          <span>Sample data — letters are saved in this browser only; nothing is emailed.</span>
          <span className="sp">
            <button type="button" className="lt-btn sm" disabled={S.letters.length > 0} onClick={() => { store.loadSampleLetters(actor); toast("Sample letters loaded"); }}>
              Load sample history
            </button>
            <button type="button" className="lt-btn sm" onClick={() => { store.resetSampleData(); setSel(new Set()); setActive(null); toast("Sample data reset"); }}>
              Reset sample data
            </button>
          </span>
        </div>
      )}

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
          <button type="button" className="lt-btn" onClick={() => setPanelOpen((o) => !o)}>{panelOpen ? "Panel ‹" : "Panel ›"}</button>
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
              </div>
            )}
          </span>
        </div>
      </div>

      <div className="lt-body">
        <div className="lt-pane">
          {visibleTab === "letters" && lettersPane}
          {visibleTab === "audit" && canEdit && (
            <AuditTab S={S} onBack={() => changeTab("letters")} onExport={(rows) => exportGrid(AUDIT_DEFS, rows, "Letters_Audit_Trail", "Audit")} />
          )}
          {visibleTab === "rules" && canEdit && <RulesTab S={S} actor={actor} ui={ui} toast={toast} />}
          {visibleTab === "fields" && canEdit && <FieldsTab S={S} actor={actor} ui={ui} toast={toast} />}
          {visibleTab === "tpl" && canEdit && <TemplatesTab S={S} actor={actor} ui={ui} toast={toast} />}
        </div>
        {panelOpen && renderPanel()}
      </div>
      {toastEl}
    </div>
  );
}

export default LettersPage;
