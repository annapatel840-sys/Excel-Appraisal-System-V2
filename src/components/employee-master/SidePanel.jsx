export function SidePanel({
  open,
  title,
  tab,
  onTab,
  onClose,
  defs,
  grid,
  stats, // { summary: [[label, n]], sections: [{ title, rows: [[label, n]] }] }  (optional)
  audit, // [{ title, meta, detail }]  (optional)
  auditHint,
  onFullAudit, // opens your existing audit history (optional)
}) {
  if (!open) return null;

  const current = tab === "stats" && !stats ? "view" : tab;
  const tabs = [
    ["view", "My view"],
    stats ? ["stats", "Statistics"] : null,
    ["aud", "Audit"],
  ].filter(Boolean);

  return (
    <aside className="emx-panel">
      <div className="emx-ph">
        <b>{title}</b>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fold the panel"
          title="Fold the panel"
        >
          ✕
        </button>
      </div>

      <div className="emx-ptabs">
        {tabs.map(([key, label]) => (
          <button
            key={key}
            type="button"
            className={current === key ? "on" : ""}
            onClick={() => onTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="emx-pbody">
        {current === "view" && (
          <>
            <h5>Show / hide columns</h5>
            {defs.map((d, index) => {
              const c = grid.cols.find((x) => x.key === d.key);
              return (
                <label key={d.key}>
                  <input
                    type="checkbox"
                    checked={!!c?.vis}
                    disabled={index === 0}
                    onChange={(e) =>
                      grid.patchCol(d.key, { vis: e.target.checked })
                    }
                  />
                  {d.label}
                </label>
              );
            })}

            <h5>Row density</h5>
            {[
              ["comfortable", "Comfortable"],
              ["compact", "Compact"],
            ].map(([k, l]) => (
              <label key={k}>
                <input
                  type="radio"
                  name="emx-density"
                  checked={grid.dens === k}
                  onChange={() => grid.setDens(k)}
                />
                {l}
              </label>
            ))}
            <div className="emx-note">
              Column widths, wrap, filters and sort set on the grid apply here
              as well.
            </div>
          </>
        )}

        {current === "stats" && stats && (
          <>
            <h5>Eligibility numbers</h5>
            <table className="emx-st">
              <tbody>
                {stats.summary.map(([label, n]) => (
                  <tr key={label}>
                    <td>{label}</td>
                    <td className="n">{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {stats.sections.map((s) => (
              <div key={s.title}>
                <h5>{s.title}</h5>
                <table className="emx-st">
                  <tbody>
                    {s.rows.length ? (
                      s.rows.map(([label, n]) => (
                        <tr key={label}>
                          <td>{label}</td>
                          <td className="n">{n}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={2} style={{ color: "#6B7280" }}>
                          None
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ))}
          </>
        )}

        {current === "aud" && (
          <>
            <div className="emx-callout">{auditHint}</div>
            {audit && audit.length > 0 ? (
              audit.map((a, i) => (
                <div className="emx-aud" key={i}>
                  <div className="a1">{a.title}</div>
                  {a.meta && <div className="a2">{a.meta}</div>}
                  {a.detail && <div className="a2">{a.detail}</div>}
                </div>
              ))
            ) : (
              <div className="emx-note">No entries to show here.</div>
            )}
            {onFullAudit && (
              <button
                type="button"
                className="emx-mini p"
                style={{ marginTop: 6 }}
                onClick={onFullAudit}
              >
                Open full audit history
              </button>
            )}
          </>
        )}
      </div>

      <div className="emx-pfoot">
        Read-only panel. My view is kept while you stay on this screen.
      </div>
    </aside>
  );
}

/* Dark vertical tab shown beside the table while the panel is folded.
   It replaces the old "Panel ›" button in the toolbar. */
export function PanelTab({ open, onOpen }) {
  if (open) return null;
  return (
    <button
      type="button"
      className="emx-panel-tab"
      onClick={onOpen}
      title="Open the panel"
      aria-label="Open the panel"
    >
      Panel ›
    </button>
  );
}