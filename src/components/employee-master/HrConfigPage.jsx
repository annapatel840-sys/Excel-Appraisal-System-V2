import { useMemo, useState } from "react";

/* ============================================================
   HR Config screen (outer part of the reference HTML).
   Tabs: Cycle setup (default process + the Appraisal Cycle screen),
   Uploads & mismatches, Columns, Agent.
   Edits are pending until "Review and apply"; applied values are stored in
   this browser (localStorage) because no config API exists yet.
   Only the default process per cycle type is passed on to the cycle screen.
   ============================================================ */

const STORE = "hr_config_v1";
const PROC_OPTS = [
  ["Annual", "Annual process"],
  ["Exceptional", "Exceptional process"],
  ["None", "No process"],
];
const CT = [
  ["ct_a", "Annual", "Annual default process", "Used for comparison"],
  ["ct_m", "Mid-Year", "Mid-Year default process", ""],
  ["ct_e", "Exceptional", "Exceptional default process", ""],
  ["ct_n", "New Joiner", "New Joiner default process", ""],
];
const MISM = [
  {
    id: "m1",
    name: "Employee Master changes",
    src: "Employee Master upload or sync, against the current data",
    sel: true,
  },
  {
    id: "m2",
    name: "Eligibility mismatch",
    src: "Eligibility List, against the Employee Master",
    sel: true,
  },
  {
    id: "m3",
    name: "Payroll mismatch",
    fixed: true,
    src: "Employees with no payroll data, against the Employee Master. HR goes to Payroll Upload, or removes the employee. Nothing is uploaded from the mismatch screen.",
  },
  {
    id: "m4",
    name: "Delegation change",
    src: "Tech ED or Comp Manager change, against the Delegation. HR must resolve it.",
    sel: false,
  },
];
const UPS = [
  ["u1", "Employee Master", "Stamped with the cycle"],
  ["u2", "Payroll", "Stamped with the cycle"],
  ["u3", "Feedback and Rating", "Replaces the cycle's data"],
  ["u4", "Appraisal Sheet", "Current Annual cycle only"],
  ["u5", "History", "Past cycles"],
];
const ROLES = ["HR", "Tech ED", "Manager"];
const QBASE = [
  ["hr1", "HR", "Show employees with no payroll data", "Main row"],
  ["hr2", "HR", "Compare hike with last cycle", "Main row"],
  ["hr3", "HR", "Who is above band P75", "Under More"],
  ["te1", "Tech ED", "My team hike vs budget", "Main row"],
  ["te2", "Tech ED", "Employees with no rating", "Main row"],
  ["te3", "Tech ED", "Similar experience", "Under More"],
  ["mg1", "Manager", "Show my team summary", "Main row"],
  ["mg2", "Manager", "Who has no proposal yet", "Main row"],
];

function buildInitial() {
  const v = {
    ct_a: "Annual",
    ct_m: "Annual",
    ct_e: "Exceptional",
    ct_n: "None",
  };
  ["m1", "m2"].forEach((m) => {
    v[`${m}a`] = true;
    v[`${m}i`] = true;
    v[`${m}g`] = false;
    v[`${m}r`] = true;
    v[`${m}s`] = "To be set";
  });
  v.m4a = false;
  v.m4i = false;
  v.m4g = true;
  v.m4r = false;
  UPS.forEach(([k]) => (v[k] = true));
  v.c1 = true;
  v.c2 = true;
  v.ag = true;
  v.mgrwi = false;
  v.gp = "Designation";
  v.mp = 5;
  v.xs = true;
  v.bt = 20;
  v.ret = 3;
  QBASE.forEach(([id, , label, place]) => {
    v[`q_${id}_l`] = label;
    v[`q_${id}_p`] = place;
    v[`q_${id}_s`] = true;
  });
  return v;
}
const INIT = buildInitial();

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || "null");
    if (raw && raw.vals)
      return { vals: { ...INIT, ...raw.vals }, extra: raw.extra || [] };
  } catch {
    /* ignore */
  }
  return { vals: INIT, extra: [] };
}

const LAB = (() => {
  const l = {};
  CT.forEach(([k, , lab]) => (l[k] = lab));
  MISM.filter((m) => !m.fixed).forEach((m) => {
    l[`${m.id}a`] = `${m.name}: Accept`;
    l[`${m.id}i`] = `${m.name}: Ignore`;
    l[`${m.id}g`] = `${m.name}: Go to screen`;
    l[`${m.id}r`] = `${m.name}: Ignore needs remark`;
    l[`${m.id}s`] = `${m.name}: Showstopper`;
  });
  UPS.forEach(([k, n]) => (l[k] = `Upload screen: ${n}`));
  Object.assign(l, {
    c1: "Column: Band active",
    c2: "Column: Skill Type active",
    ag: "Agent released",
    mgrwi: "Managers may run what-ifs",
    gp: "Group peers by",
    mp: "Minimum peers",
    xs: "Exclude self by default",
    bt: "Bulk confirmation threshold (rows)",
    ret: "Question log retention (years)",
  });
  QBASE.forEach(([id, role, ,]) => {
    l[`q_${id}_l`] = `${role} button label`;
    l[`q_${id}_p`] = `${role} button placement`;
    l[`q_${id}_s`] = `${role} button shown`;
  });
  return l;
})();

const show = (v) => (v === true ? "On" : v === false ? "Off" : String(v));
const nowT = () =>
  new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

export function HrConfigPage({ renderCycleScreen, canEdit = true }) {
  const saved = useMemo(load, []);
  const [applied, setApplied] = useState(saved.vals);
  const [vals, setVals] = useState(saved.vals);
  const [extra, setExtra] = useState(saved.extra); // added categories, columns and buttons
  const [log, setLog] = useState([]);
  const [tab, setTab] = useState("cyc");
  const [loc, setLoc] = useState("Dubai|AED");
  const [ptab, setPtab] = useState("q");
  const [fold, setFold] = useState(false);
  const [role, setRole] = useState("HR");
  const [toast, setToast] = useState("");
  const [nc, setNc] = useState(null); // new category form
  const [ncol, setNcol] = useState(null); // new column form

  const say = (m) => {
    setToast(m);
    setTimeout(() => setToast(""), 2400);
  };
  const ed = (k) => vals[k] !== applied[k];
  const set = (k, v) => setVals((p) => ({ ...p, [k]: v }));
  const labelOf = (k) => LAB[k] || extra.find((x) => x.key === k)?.label || k;

  const pend = useMemo(() => {
    const p = [];
    Object.keys(vals).forEach((k) => {
      if (vals[k] !== applied[k])
        p.push({ l: labelOf(k), o: applied[k], n: vals[k] });
    });
    extra
      .filter((x) => !x.done)
      .forEach((x) => p.push({ l: x.desc, o: "—", n: "added" }));
    return p;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vals, applied, extra]);

  const discard = () => {
    setVals(applied);
    setExtra((e) => e.filter((x) => x.done));
    say("Changes discarded");
  };

  const apply = () => {
    const t = nowT();
    const ex = extra.map((x) => ({ ...x, done: true }));
    setLog((l) => [...pend.map((p) => ({ ...p, t })), ...l]);
    setApplied(vals);
    setExtra(ex);
    try {
      localStorage.setItem(STORE, JSON.stringify({ vals, extra: ex }));
    } catch {
      /* ignore */
    }
    say(
      `Applied ${pend.length} change${pend.length > 1 ? "s" : ""} · future cycles only`,
    );
  };

  const addExtra = (item, key, initial) => {
    setExtra((e) => [...e, { ...item, key, done: false }]);
    if (key) {
      setApplied((p) => ({ ...p, [key]: initial }));
      setVals((p) => ({ ...p, [key]: initial }));
    }
  };

  // controls
  const sw = (k, locked) => (
    <label className={`sw${ed(k) ? " edited" : ""}${locked ? " locked" : ""}`}>
      <input
        type="checkbox"
        checked={!!vals[k]}
        disabled={locked || !canEdit}
        onChange={(e) => set(k, e.target.checked)}
      />
      <i />
    </label>
  );
  const sel = (k, opts) => (
    <select
      className={ed(k) ? "edited" : ""}
      value={vals[k]}
      disabled={!canEdit}
      onChange={(e) => set(k, e.target.value)}
    >
      {opts.map((o) =>
        Array.isArray(o) ? (
          <option key={o[0]} value={o[0]}>
            {o[1]}
          </option>
        ) : (
          <option key={o}>{o}</option>
        ),
      )}
    </select>
  );
  const num = (k) => (
    <input
      type="number"
      min="1"
      style={{ width: 80 }}
      className={ed(k) ? "edited" : ""}
      value={vals[k]}
      disabled={!canEdit}
      onChange={(e) => set(k, Number(e.target.value))}
    />
  );

  const defaultProcess = useMemo(
    () => ({
      Annual: applied.ct_a,
      "Mid-Year": applied.ct_m,
      Exceptional: applied.ct_e,
      "New Joiner": applied.ct_n,
    }),
    [applied.ct_a, applied.ct_m, applied.ct_e, applied.ct_n],
  );

  const qs = [
    ...QBASE.map(([id, r]) => ({ id, role: r })),
    ...extra
      .filter((x) => x.kind === "q")
      .map((x) => ({ id: x.id, role: x.role })),
  ].filter((q) => q.role === role);
  const cats = extra.filter((x) => x.kind === "cat");
  const cols = extra.filter((x) => x.kind === "col");

  let seq = extra.length + 1;
  const nextId = () => `n${Date.now()}${seq++}`;

  /* ---------------- tabs ---------------- */

  const tabCycle = (
    <div>
      <div className="lbl">Default process per cycle type</div>
      <table className="ct">
        <thead>
          <tr>
            <th>Cycle type</th>
            <th>Default process</th>
            <th>Note</th>
          </tr>
        </thead>
        <tbody>
          {CT.map(([k, name, , note]) => (
            <tr key={k}>
              <td className="first">{name}</td>
              <td>{sel(k, PROC_OPTS)}</td>
              <td>{note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="note">
        HR can change the process when a cycle is set up; it locks at Activate.
        Comparison is not a cycle type. Changes apply to future cycles only.
      </p>
      <div className="sep" />
      <div className="lbl">
        Appraisal Cycle screen (as in Appraisal_Cycle_v15)
      </div>
      <p className="note">
        The cycle grid, set up, status line, steps and checks are the Appraisal
        Cycle screen as built. They are fixed in the screen, not configured
        here.
      </p>
      {renderCycleScreen ? renderCycleScreen(defaultProcess) : null}
      <p className="note">
        Not set here: budget formula (always Hike Amount + PB + RB + Joining
        Bonus), rating scale (comes from the feedback upload) and rating
        rounding (none). Business rules such as the PB and RB preload stay in
        the tool.
      </p>
    </div>
  );

  const tabUploads = (
    <div>
      <div className="lbl">Mismatch categories</div>
      <p className="note">
        All mismatches and the Change list show in one HR Operations screen,
        split by category. A new upload can add its own category without a
        redesign. A showstopper blocks Activate.
      </p>
      <table className="ct">
        <thead>
          <tr>
            <th>Category</th>
            <th>Source and what it compares</th>
            <th>Accept</th>
            <th>Ignore</th>
            <th>Go to screen</th>
            <th>Ignore needs remark</th>
            <th>Showstopper</th>
          </tr>
        </thead>
        <tbody>
          {MISM.map((m) =>
            m.fixed ? (
              <tr key={m.id}>
                <td className="first">{m.name}</td>
                <td>{m.src}</td>
                <td>
                  <label className="sw locked">
                    <input type="checkbox" disabled />
                    <i />
                  </label>
                </td>
                <td>
                  <label className="sw locked">
                    <input type="checkbox" disabled />
                    <i />
                  </label>
                </td>
                <td>
                  <label className="sw locked">
                    <input type="checkbox" checked disabled readOnly />
                    <i />
                  </label>
                </td>
                <td>
                  <span className="tag">n/a</span>
                </td>
                <td>
                  <span className="tag warn">Yes</span>
                </td>
              </tr>
            ) : (
              <tr key={m.id}>
                <td className="first">{m.name}</td>
                <td>{m.src}</td>
                <td>{sw(`${m.id}a`)}</td>
                <td>{sw(`${m.id}i`)}</td>
                <td>{sw(`${m.id}g`)}</td>
                <td>{sw(`${m.id}r`)}</td>
                <td>
                  {m.sel ? (
                    sel(`${m.id}s`, ["To be set", "Yes", "No"])
                  ) : (
                    <span className="tag">No</span>
                  )}
                </td>
              </tr>
            ),
          )}
          {cats.map((c) => (
            <tr key={c.id}>
              <td className="first">
                {c.name} <span className="tag info">new</span>
              </td>
              <td>{c.src || "—"}</td>
              <td colSpan={5}>
                <span className="note">
                  Behaviour is set when the category is built in the code.
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit && (
        <div className="row">
          <button
            type="button"
            className="btn add"
            onClick={() => setNc({ name: "", src: "" })}
          >
            + Add category
          </button>
        </div>
      )}
      {nc && (
        <div className="newbox">
          <div className="row">
            <label className="t">Category name</label>
            <input
              type="text"
              placeholder="e.g. Feedback mismatch"
              value={nc.name}
              onChange={(e) => setNc({ ...nc, name: e.target.value })}
            />
          </div>
          <div className="row">
            <label className="t">Source and what it compares</label>
            <input
              type="text"
              style={{ width: 320 }}
              value={nc.src}
              onChange={(e) => setNc({ ...nc, src: e.target.value })}
            />
          </div>
          <div className="row">
            <button
              type="button"
              className="btn p"
              onClick={() => {
                if (!nc.name.trim()) return say("Enter a category name");
                addExtra(
                  {
                    id: nextId(),
                    kind: "cat",
                    name: nc.name.trim(),
                    src: nc.src.trim(),
                    desc: `New mismatch category: ${nc.name.trim()}`,
                  },
                  null,
                );
                setNc(null);
              }}
            >
              Add to list
            </button>
            <button type="button" className="btn" onClick={() => setNc(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="sep" />
      <div className="lbl">Upload screens</div>
      <p className="note">
        Which uploads the Upload module offers. A new upload screen is built in
        the code first.
      </p>
      <table className="ct">
        <thead>
          <tr>
            <th>Upload screen</th>
            <th>Cycle scope</th>
            <th>Offered in Upload module</th>
          </tr>
        </thead>
        <tbody>
          {UPS.map(([k, name, scope]) => (
            <tr key={k}>
              <td className="first">{name}</td>
              <td>{scope}</td>
              <td>{sw(k)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  const tabColumns = (
    <div>
      <div className="lbl">Extra Employee Master columns</div>
      <p className="note">
        Band, Skill Type and any later attribute are simply extra columns on the
        Employee Master. None is built in; the two rows below are examples.
        Values come with the Employee Master upload. A list column is checked
        against its allowed values. The Employee Master is stamped with the
        cycle every cycle, so each cycle keeps its own values.
      </p>
      <table className="ct">
        <thead>
          <tr>
            <th>Column</th>
            <th>Type</th>
            <th>Allowed values</th>
            <th>Active</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="first">
              Band <span className="tag">example</span>
            </td>
            <td>List of allowed values</td>
            <td>Band 1, Band 2, Band 3</td>
            <td>{sw("c1")}</td>
          </tr>
          <tr>
            <td className="first">
              Skill Type <span className="tag">example</span>
            </td>
            <td>List of allowed values</td>
            <td>Core, Specialist</td>
            <td>{sw("c2")}</td>
          </tr>
          {cols.map((c) => (
            <tr key={c.id}>
              <td className="first">{c.name}</td>
              <td>{c.type}</td>
              <td>{c.values}</td>
              <td>{sw(c.key)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {canEdit && (
        <div className="row">
          <button
            type="button"
            className="btn add"
            onClick={() => setNcol({ name: "", type: "Free text", values: "" })}
          >
            + Add column
          </button>
        </div>
      )}
      {ncol && (
        <div className="newbox">
          <div className="row">
            <label className="t">Name</label>
            <input
              type="text"
              placeholder="e.g. Grade, Cost centre"
              value={ncol.name}
              onChange={(e) => setNcol({ ...ncol, name: e.target.value })}
            />
          </div>
          <div className="row">
            <label className="t">Type</label>
            <select
              value={ncol.type}
              onChange={(e) => setNcol({ ...ncol, type: e.target.value })}
            >
              <option>Free text</option>
              <option>List of allowed values</option>
            </select>
          </div>
          {ncol.type !== "Free text" && (
            <div className="row">
              <label className="t">Allowed values</label>
              <input
                type="text"
                style={{ width: 320 }}
                placeholder="comma separated"
                value={ncol.values}
                onChange={(e) => setNcol({ ...ncol, values: e.target.value })}
              />
            </div>
          )}
          <div className="row">
            <button
              type="button"
              className="btn p"
              onClick={() => {
                if (!ncol.name.trim()) return say("Enter a column name");
                const id = nextId();
                const key = `x_${id}`;
                addExtra(
                  {
                    id,
                    kind: "col",
                    name: ncol.name.trim(),
                    type: ncol.type,
                    values:
                      ncol.type === "Free text"
                        ? "Free text"
                        : ncol.values || "—",
                    desc: `New Employee Master column: ${ncol.name.trim()}`,
                    label: `Column: ${ncol.name.trim()} active`,
                  },
                  key,
                  true,
                );
                setNcol(null);
              }}
            >
              Add column
            </button>
            <button type="button" className="btn" onClick={() => setNcol(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
      <div className="sep" />
      <div className="box">
        Who sees or edits a column is set in Access. Band ranges and
        compa-ratio, if needed later, belong to the Band Master under Masters,
        not here.
      </div>
    </div>
  );

  const tabAgent = (
    <div>
      <div className="lbl">Agent</div>
      <div className="row">
        <label className="t">Agent released</label>
        {sw("ag")}
        <span className="note">
          The agent panel stays hidden until this switch is on.
        </span>
      </div>
      <div className="sep" />
      <div className="lbl">Quick-question buttons, per role</div>
      <div className="chips">
        {ROLES.map((r) => (
          <span
            key={r}
            className={`chip${role === r ? " on" : ""}`}
            onClick={() => setRole(r)}
          >
            {r}
          </span>
        ))}
        <span className="note" style={{ marginLeft: 8 }}>
          Preview as role
        </span>
      </div>
      <table className="ct">
        <thead>
          <tr>
            <th>#</th>
            <th>Button label</th>
            <th>Placement</th>
            <th>Show</th>
            <th>Order</th>
          </tr>
        </thead>
        <tbody>
          {qs.map((q, i) => (
            <tr key={q.id}>
              <td>{i + 1}</td>
              <td>
                <input
                  type="text"
                  style={{ width: 260 }}
                  className={ed(`q_${q.id}_l`) ? "edited" : ""}
                  value={vals[`q_${q.id}_l`] ?? ""}
                  disabled={!canEdit}
                  onChange={(e) => set(`q_${q.id}_l`, e.target.value)}
                />
              </td>
              <td>{sel(`q_${q.id}_p`, ["Main row", "Under More"])}</td>
              <td>{sw(`q_${q.id}_s`)}</td>
              <td>{i + 1}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        {canEdit && (
          <button
            type="button"
            className="btn add"
            onClick={() => {
              const id = nextId();
              ["l", "p", "s"].forEach((f) => {
                const k = `q_${id}_${f}`;
                const v =
                  f === "l" ? "New question" : f === "p" ? "Under More" : true;
                setApplied((p) => ({ ...p, [k]: v }));
                setVals((p) => ({ ...p, [k]: v }));
              });
              setExtra((e) => [
                ...e,
                {
                  id,
                  kind: "q",
                  role,
                  done: false,
                  desc: `${role}: button added`,
                },
              ]);
            }}
          >
            + Add button
          </button>
        )}
        <label className="t" style={{ minWidth: 0 }}>
          Managers may run what-ifs
        </label>
        {sw("mgrwi")}
      </div>
      <div className="sep" />
      <div className="lbl">What-ifs set by HR</div>
      <table className="ct">
        <thead>
          <tr>
            <th>Group</th>
            <th>Items</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="first">What-if list</td>
            <td>
              Match team, designation, band or skill median hike % · Max hike
              within team budget · Similar experience
            </td>
          </tr>
          <tr>
            <td className="first">Actions</td>
            <td>
              Increase or decrease by % or points · Set to value · Cap or floor
              hike %
            </td>
          </tr>
        </tbody>
      </table>
      <div className="row">
        <label className="t">Group peers by</label>
        {sel("gp", ["Designation", "Band", "Skill Type", "Team"])}
      </div>
      <div className="row">
        <label className="t">Minimum peers</label>
        {num("mp")}
      </div>
      <div className="row">
        <label className="t">Exclude self by default</label>
        {sw("xs")}
      </div>
      <div className="row">
        <label className="t">Bulk confirmation threshold</label>
        {num("bt")}
        <span className="note">Rows above this ask for confirmation.</span>
      </div>
      <div className="sep" />
      <div className="lbl">Guardrails and log</div>
      <div className="row">
        <label className="t">No predictions or advice</label>
        <span className="tag ok">Fixed</span>
        <label className="t" style={{ minWidth: 0 }}>
          No other teams
        </label>
        <span className="tag ok">Fixed</span>
      </div>
      <div className="row">
        <label className="t">Question log retention (years)</label>
        {num("ret")}
      </div>
      <div className="row">
        <button
          type="button"
          className="btn"
          onClick={() =>
            say("Import configuration: file picker is not connected yet")
          }
        >
          Import configuration
        </button>
        <button
          type="button"
          className="btn"
          onClick={() =>
            say("Reset configuration: asks for confirmation once connected")
          }
        >
          Reset configuration
        </button>
      </div>
    </div>
  );

  /* ---------------- side panel ---------------- */

  const n = pend.length;
  const panel = (
    <div className="card panel">
      <div className="head">
        <span>Side panel</span>
        <button type="button" onClick={() => setFold(true)} title="Fold panel">
          ⇥
        </button>
      </div>
      <div className="ptabs">
        <a className={ptab === "q" ? "on" : ""} onClick={() => setPtab("q")}>
          Quick check
        </a>
        <a className={ptab === "c" ? "on" : ""} onClick={() => setPtab("c")}>
          Changes{n ? ` ${n}` : ""}
        </a>
      </div>
      <div className="pbody">
        {ptab === "q" ? (
          <>
            <div className="co">
              <b>Quick check</b>
              <div className="m">
                Facts only, for the location and cycle chosen above.
              </div>
            </div>
            <div className="cc">
              <b>Impact before Apply</b>
              <div className="m">
                {n
                  ? `${n} pending change${n > 1 ? "s" : ""}. Past cycles keep the settings they ran with; the next cycle set up will use these.`
                  : "Nothing pending."}
              </div>
            </div>
            <div className="cc">
              <b>Compare with last cycle</b>
              <div className="m">
                Annual default process:{" "}
                {applied.ct_a === "None" ? "No process" : applied.ct_a} now.
              </div>
            </div>
            <div className="cc">
              <b>Where a setting is used</b>
              <div className="m">
                Default process: Appraisal Cycle screen, when a cycle is set up.
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="co">
              <b>Changes</b>
              <div className="m">
                {n ? "Review before you apply." : "Nothing pending."}
              </div>
            </div>
            {pend.map((p, i) => (
              <div key={i} className="li">
                <b>{p.l}</b>
                <div className="m">
                  {show(p.o)} → {show(p.n)}
                </div>
              </div>
            ))}
            {n > 0 && canEdit && (
              <div style={{ marginTop: 12 }}>
                <button type="button" className="btn main" onClick={apply}>
                  Apply {n} change{n > 1 ? "s" : ""}
                </button>
              </div>
            )}
            {log.length > 0 && (
              <>
                <div className="lbl" style={{ marginTop: 16 }}>
                  Applied this session
                </div>
                {log.slice(0, 8).map((p, i) => (
                  <div key={i} className="li">
                    <b>{p.l}</b>
                    <div className="m">
                      {show(p.o)} → {show(p.n)} · {p.t}
                    </div>
                  </div>
                ))}
              </>
            )}
          </>
        )}
      </div>
      <div className="foot">
        Information only. Nothing here changes a setting.
      </div>
    </div>
  );

  const TABS = [
    ["cyc", "Cycle setup"],
    ["upl", "Uploads & mismatches"],
    ["col", "Columns"],
    ["agt", "Agent"],
  ];
  const [curCode, curName] = ["", loc.split("|")[1]];

  return (
    <div className="hrc">
      <style>{CSS}</style>
      <div className={`wrap${fold ? " fold" : ""}`}>
        <div className="card">
          <div className="ch">
            <span>HR configuration</span>
            <small>HR Admin only</small>
          </div>
          <div className="locbar">
            <label>Location</label>
            <select
              value={loc}
              onChange={(e) => {
                setLoc(e.target.value);
                say(
                  `Location: ${e.target.value.split("|")[0]}. Cycle dates and currency follow the location.`,
                );
              }}
            >
              <option value="Dubai|AED">Dubai</option>
              <option value="India|INR">India</option>
            </select>
            <span className="tag info">
              {curName}
              {curCode}
            </span>
            <span className="note">
              Config opens for the location chosen at login. Each location has
              its own cycle and currency; the settings below are the same for
              every location.
            </span>
          </div>
          <div className="tabs">
            {TABS.map(([k, l]) => (
              <a
                key={k}
                className={tab === k ? "on" : ""}
                onClick={() => setTab(k)}
              >
                {l}
              </a>
            ))}
          </div>
          <div className="body">
            {/* keep the cycle screen mounted so its state survives tab switches */}
            <div style={{ display: tab === "cyc" ? "block" : "none" }}>
              {tabCycle}
            </div>
            {tab === "upl" && tabUploads}
            {tab === "col" && tabColumns}
            {tab === "agt" && tabAgent}
          </div>
          <div className="bar">
            <div className={`chg${n ? " has" : ""}`}>
              {n
                ? `${n} pending change${n > 1 ? "s" : ""}. They apply to future cycles only.`
                : "No pending changes."}
            </div>
            <button
              type="button"
              className="btn"
              disabled={!n}
              onClick={discard}
            >
              Discard
            </button>
            <button
              type="button"
              className="btn main"
              disabled={!n || !canEdit}
              onClick={() => {
                setPtab("c");
                setFold(false);
              }}
            >
              Review and apply
            </button>
          </div>
        </div>
        {fold ? (
          <div className="foldtab" onClick={() => setFold(false)}>
            Side panel ›
          </div>
        ) : (
          panel
        )}
      </div>
      {toast && <div className="toast show">{toast}</div>}
    </div>
  );
}

export default HrConfigPage;

const CSS = `
.hrc{--ink:#111827;--muted:#6B7280;--navy:#102A43;--link:#1559A6;--line:#E5E7EB;--gutter:#D5DFEB;--info-strip:#DCEBFF;--info-border:#B9D3F5;
--th-bg:#E6EEF8;--th-line:#C9D8EC;--row-odd:#FBFCFE;--row-even:#F2F5F9;--row-hover:#EAF2FF;--input-border:#9CA3AF;--readonly:#F3F4F6;--edited:#FFE066;--edited-border:#C9A400;
--btn-main:#2F6FED;--switch-on:#22A06B;--switch-off:#D1D5DB;--ok:#15803D;--ok-bg:#ECFDF3;--warn:#B7791F;--warn-bg:#FEF6E7;--info:#1D4FA8;--info-bg:#DCEBFF;--grey:#6B7280;--grey-bg:#F3F4F6;
font-family:Manrope,"Segoe UI",Arial,sans-serif;font-size:12.5px;color:var(--ink);width:100%}
.hrc *{box-sizing:border-box}
.hrc .wrap{display:grid;grid-template-columns:1fr 340px;gap:16px;align-items:start}
.hrc .wrap.fold{grid-template-columns:1fr}
.hrc .card{background:#fff;border:1px solid var(--line);border-radius:12px;overflow:hidden;min-width:0}
.hrc .ch{background:var(--navy);color:#fff;padding:14px 18px;display:flex;justify-content:space-between;align-items:center;font-weight:800;font-size:16px}
.hrc .ch small{font-weight:600;opacity:.8;font-size:12px}
.hrc .locbar{display:flex;gap:12px;align-items:center;padding:10px 18px;background:#F7FAFE;border-bottom:1px solid var(--line);flex-wrap:wrap}
.hrc .locbar label{font-weight:800;color:var(--navy)}
.hrc .tabs{display:flex;gap:24px;padding:12px 18px 0;border-bottom:1px solid var(--line)}
.hrc .tabs a{padding-bottom:10px;color:var(--muted);cursor:pointer;font-weight:600}
.hrc .tabs a.on{color:var(--ink);font-weight:800;border-bottom:2px solid var(--navy)}
.hrc .body{padding:16px 18px;min-height:480px}
.hrc .lbl{display:inline-block;background:var(--gutter);color:var(--navy);font-size:10.5px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;padding:5px 10px;border-radius:5px;margin:2px 0 10px}
.hrc .sep{height:5px;border-radius:4px;background:linear-gradient(90deg,#BFD7F2,#D9CCF0 55%,#F3D9C9);margin:20px 0 14px;opacity:.85}
.hrc table.ct{width:100%;border-collapse:collapse}
.hrc table.ct th{background:var(--th-bg);color:var(--navy);text-align:left;font-size:10.5px;font-weight:700;padding:8px 10px;border-bottom:1px solid var(--th-line)}
.hrc table.ct td{padding:7px 10px;border-bottom:1px solid #EDF1F6;vertical-align:middle}
.hrc table.ct tbody tr:nth-child(odd){background:var(--row-odd)}.hrc table.ct tbody tr:nth-child(even){background:var(--row-even)}
.hrc table.ct tbody tr:hover{background:var(--row-hover)}
.hrc td.first{font-weight:700;color:var(--navy);background:#EEF3FA}
.hrc input[type=text],.hrc input[type=number],.hrc select{font:inherit;border:1px solid var(--input-border);border-radius:6px;padding:5px 8px;background:#fff;max-width:100%;color:var(--ink)}
.hrc input:disabled,.hrc select:disabled{background:var(--readonly);border-color:transparent;color:var(--muted)}
.hrc input.edited,.hrc select.edited{background:var(--edited)!important;border-color:var(--edited-border)!important}
.hrc .sw{position:relative;width:38px;height:22px;display:inline-block;vertical-align:middle}
.hrc .sw input{display:none}
.hrc .sw i{position:absolute;inset:0;background:var(--switch-off);border-radius:20px;transition:.15s}
.hrc .sw i:after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:.15s}
.hrc .sw input:checked+i{background:var(--switch-on)}.hrc .sw input:checked+i:after{left:19px}
.hrc .sw.edited i{outline:2px solid var(--edited-border);outline-offset:1px}.hrc .sw.locked{opacity:.55}
.hrc .tag{font-size:10.5px;font-weight:700;border-radius:14px;padding:2px 9px;background:var(--grey-bg);color:var(--grey);display:inline-block}
.hrc .tag.ok{background:var(--ok-bg);color:var(--ok)}.hrc .tag.warn{background:var(--warn-bg);color:var(--warn)}.hrc .tag.info{background:var(--info-bg);color:var(--info)}
.hrc .btn{border:1px solid #D1D5DB;background:#fff;color:var(--navy);border-radius:8px;padding:7px 14px;font:inherit;font-weight:700;cursor:pointer}
.hrc .btn.p{background:var(--navy);border-color:var(--navy);color:#fff}
.hrc .btn.main{background:var(--btn-main);border-color:var(--btn-main);color:#fff;text-transform:uppercase;font-weight:800;letter-spacing:.03em}
.hrc .btn.add{border:1px dashed #CBD2DA;color:var(--muted);font-weight:600}
.hrc .btn:disabled{opacity:.45;cursor:default}
.hrc .note{color:var(--muted);font-size:12px;margin:6px 0 10px}
.hrc .row{display:flex;gap:12px;align-items:center;margin:9px 0;flex-wrap:wrap}
.hrc .row>label.t{min-width:220px;font-weight:700}.hrc .row .note{margin:0}
.hrc .chips{display:flex;gap:6px;flex-wrap:wrap;margin:4px 0 10px;align-items:center}
.hrc .chip{border:1px solid #D1D5DB;background:#fff;border-radius:14px;padding:3px 12px;font-weight:600;cursor:pointer;font-size:12px}
.hrc .chip.on{background:#27548A;color:#fff;border-color:#27548A}
.hrc .box{border:1px solid var(--line);border-radius:8px;padding:10px 12px;background:#FBFCFE}
.hrc .newbox{border:1px solid var(--line);border-radius:8px;padding:12px;margin:10px 0;background:#fff}
.hrc .bar{display:flex;gap:10px;align-items:center;padding:12px 18px;border-top:1px solid var(--line);background:#fff}
.hrc .bar .chg{flex:1;background:var(--info-strip);border:1px solid var(--info-border);border-radius:8px;padding:8px 12px;color:var(--navy)}
.hrc .bar .chg.has{background:#FFF6CC;border-color:var(--edited-border)}
.hrc .panel .head{display:flex;justify-content:space-between;align-items:center;padding:10px 16px;background:var(--navy);color:#fff;font-weight:800}
.hrc .panel .head button{background:none;border:0;color:#fff;font-size:16px;cursor:pointer}
.hrc .panel .ptabs{display:flex;gap:20px;padding:12px 16px 0;border-bottom:1px solid var(--line)}
.hrc .panel .ptabs a{padding-bottom:9px;color:var(--muted);cursor:pointer;font-weight:600}
.hrc .panel .ptabs a.on{color:var(--ink);font-weight:800;border-bottom:2px solid var(--navy)}
.hrc .pbody{padding:14px 16px;min-height:420px}
.hrc .co{border:1px solid var(--info-border);background:var(--info-strip);border-radius:8px;padding:10px 12px;margin-bottom:10px;color:var(--navy)}
.hrc .cc{border:1px solid var(--line);border-radius:8px;padding:10px 12px;margin-bottom:10px;background:#fff}
.hrc .cc b{display:block;margin-bottom:3px;color:var(--navy)}.hrc .m{color:var(--muted);font-size:12px}
.hrc .li{padding:8px 0;border-bottom:1px solid #EDF1F6}
.hrc .foot{padding:10px 16px;border-top:1px solid var(--line);color:var(--muted);font-size:11.5px}
.hrc .foldtab{position:fixed;right:0;top:50%;transform:translateY(-50%);background:var(--navy);color:#fff;border-radius:8px 0 0 8px;padding:10px 6px;writing-mode:vertical-rl;font-weight:800;cursor:pointer;z-index:20}
.hrc .toast{position:fixed;top:16px;right:16px;background:var(--ok);color:#fff;padding:10px 16px;border-radius:8px;z-index:1100;font-weight:700}
@media(max-width:1100px){.hrc .wrap{grid-template-columns:1fr}}
`;
