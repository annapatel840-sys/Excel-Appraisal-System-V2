import "./hr-dashboard.css";

/*
 * HR Operations -> HR Dashboard.
 * DUMMY SCREEN for now: every number below is static sample data, taken from
 * the HR Operations v1 prototype. No fetch / backend calls. The real data
 * will be wired in later.
 */

const fmt = (n) => Number(n).toLocaleString("en-IN");
const pf = (n) => Number(n).toFixed(2);

const CHANGES = [
  ["New employees", 4, 0, 9],
  ["Changed employees", 6, 1, 14],
  ["Payroll mismatch", 2, 0, 5],
  ["Eligibility changes", 0, 0, 3],
];

const REQUESTS = [
  { id: 1, from: "Arun Kumar", type: "Delegation", text: "Appraiser for 3 employees → Meera Nair", age: 1 },
  { id: 2, from: "Meera Nair", type: "Budget", text: "Budget % 10.00 → 11.00", age: 2 },
  { id: 3, from: "Sanjay Rao", type: "Delegation", text: "Comp Manager for 1 employee", age: 2 },
  { id: 4, from: "Priya Menon", type: "Correction", text: "Compensation correction, 1 employee", age: 4 },
  { id: 5, from: "Vikram Shah", type: "Eligibility", text: "Make 1 employee eligible", age: 5 },
  { id: 7, from: "Neha Iyer", type: "Correction", text: "PB correction, 1 employee", age: 3 },
];

const BUDGET = [
  { n: "Arun Kumar", b: 416800, u: 72.61, t: 86.67 },
  { n: "Meera Nair", b: 554000, u: 64.2, t: 78.4 },
  { n: "Sanjay Rao", b: 345600, u: 81.35, t: 90.12 },
  { n: "Priya Menon", b: 388000, u: 55.1, t: 70.0 },
  { n: "Vikram Shah", b: 490000, u: 93.1, t: 101.2 },
];

const TYPE_CLASS = {
  Delegation: "p-b",
  Budget: "p-a",
  Correction: "p-v",
  Eligibility: "p-g",
};

function Tile({ label, value, sub, tone }) {
  return (
    <div className={`hrd-k ${tone || ""}`}>
      <small>{label}</small>
      <b>{value}</b>
      <em>{sub}</em>
    </div>
  );
}

export function HrDashboardPage() {
  const open = CHANGES.reduce((sum, row) => sum + row[1], 0);
  const totalBudget = BUDGET.reduce((sum, x) => sum + x.b, 0);
  const used = BUDGET.reduce((sum, x) => sum + x.b * x.u, 0) / totalBudget;
  const usedT = BUDGET.reduce((sum, x) => sum + x.b * x.t, 0) / totalBudget;

  const byType = {};
  REQUESTS.forEach((r) => {
    byType[r.type] = (byType[r.type] || 0) + 1;
  });
  const parts = ["Delegation", "Budget", "Correction", "Eligibility"]
    .filter((k) => byType[k])
    .map((k) => `${byType[k]} ${k.toLowerCase()}`);

  return (
    <div className="hrd">
      <div className="hrd-note">
        Sample data — this dashboard is a preview and is not connected yet.
      </div>

      <div className="hrd-kp">
        <Tile
          label="Change list & mismatch"
          value={open}
          sub={`${CHANGES[0][1]} new · ${CHANGES[1][1]} changed · ${CHANGES[2][1]} payroll`}
          tone={open ? "am" : "ok"}
        />
        <Tile
          label="Requests waiting"
          value={REQUESTS.length}
          sub={parts.join(" · ") || "none"}
          tone={REQUESTS.length ? "am" : "ok"}
        />
        <Tile
          label="Cycle"
          value="Annual 2026 · Active"
          sub="Appraisal in progress"
          tone="ok"
        />
        <Tile
          label="Budget used"
          value={`${pf(used)}%`}
          sub={`incl. Target PB ${pf(usedT)}%`}
        />
      </div>

      <div className="hrd-two">
        <div className="hrd-sec">
          <span className="hrd-chip">Change list &amp; mismatch</span>
          <table className="hrd-t">
            <thead>
              <tr>
                <th>Type</th>
                <th className="n">Open</th>
                <th className="n">Ignored</th>
                <th className="n">Done</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {CHANGES.map((c) => (
                <tr key={c[0]}>
                  <td>{c[0]}</td>
                  <td className="n">{c[1]}</td>
                  <td className="n">{c[2]}</td>
                  <td className="n">{c[3]}</td>
                  <td>
                    <button type="button" className={`hrd-sm${c[1] ? " go" : ""}`}>
                      Open ›
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="hrd-sec">
          <span className="hrd-chip">Requests from managers</span>
          <table className="hrd-t">
            <thead>
              <tr>
                <th>From</th>
                <th>Type</th>
                <th>Request</th>
                <th className="n">Age</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {REQUESTS.map((r) => (
                <tr key={r.id}>
                  <td>{r.from}</td>
                  <td>
                    <span className={`hrd-pill ${TYPE_CLASS[r.type]}`}>{r.type}</span>
                  </td>
                  <td>{r.text}</td>
                  <td className="n">{r.age} d</td>
                  <td>
                    <button type="button" className="hrd-sm go">
                      Review ›
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="hrd-two hrd-two-b">
        <div className="hrd-sec">
          <span className="hrd-chip">Cycle status</span>
          <div className="hrd-line">
            <div>Upcoming</div>
            <div className="on">Active</div>
            <div>Closed</div>
            <div>Archived</div>
          </div>
          <div className="hrd-pend">
            <span>
              Feedback &amp; ratings not in: <b>14</b>
            </span>
            <span>
              Letters to send: <b>0</b>
            </span>
            <span>
              Corrections:{" "}
              <b>{REQUESTS.filter((r) => r.type === "Correction").length}</b>
            </span>
            <span>
              Exceptional cycles: <b>2 · 1 through</b>
            </span>
          </div>
        </div>

        <div className="hrd-sec">
          <span className="hrd-chip">Budget usage</span>
          <table className="hrd-t">
            <thead>
              <tr>
                <th>Tech ED</th>
                <th className="n">Budget</th>
                <th>Used</th>
                <th className="n">Target PB</th>
              </tr>
            </thead>
            <tbody>
              {BUDGET.map((x) => (
                <tr key={x.n}>
                  <td>{x.n}</td>
                  <td className="n">{fmt(x.b)}</td>
                  <td>
                    <span className="hrd-sb">
                      <i
                        className={x.u > 90 ? "w" : ""}
                        style={{ width: `${Math.min(100, x.u)}%` }}
                      />
                    </span>
                    {pf(x.u)}%
                  </td>
                  <td className="n">{pf(x.t)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default HrDashboardPage;