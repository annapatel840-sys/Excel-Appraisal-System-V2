import { useRef, useState } from "react";
import "./hr-ops-nav.css";

/*
 * HR Operations layout:
 *   left pane  : main headings  (HR Dashboard · Master · Operation · Access)
 *   top tabs   : the sub headings of the selected main heading
 *   body       : the screen (children)
 * Only the tabs the user may open (isTabVisible) are listed.
 */
const svg = (d) => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
);
const ICONS = {
  dash: svg(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>),
  master: svg(<><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></>),
  operation: svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5h0a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>),
  access: svg(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
};

const MENU = [
  { id: "dash", label: "HR Dashboard", items: [["hr-dashboard", "HR Dashboard"]] },
  {
    id: "master",
    label: "Master",
    items: [
      ["roster", "Employee Master"],
      ["appraisal-cycle", "Appraisal Cycle Master"],
      ["location-master", "Location Master"],
      ["budget-master", "Budget Master"],
      ["payroll-data", "Payroll Master"],
      ["feedback-rating", "Feedback & Rating Master"],
      ["designation-master", "Designation Master"],
    ],
  },
  {
    id: "operation",
    label: "Operation",
    items: [
      ["eligibility", "Eligibility List"],
      ["payroll-upload", "Upload"],
      ["historical-import", "Historical Import"],
      ["team-changes", "Team Changes"],
      ["budget-distribution", "Budget Distribution"],
      ["delegation", "Delegation"],
      ["letters", "Letters"],
    ],
  },
  { id: "access", label: "Access", items: [["access", "Access"]] },
];

// Screens opened from another screen: shown under the tab they belong to.
const TAB_ALIAS = { "change-mismatch": "team-changes" };

export function HrOperationsNav({
  activeTab,
  isTabVisible,
  onSelect,
  bare = false,
  children,
}) {
  const lastTab = useRef({}); // last tab opened in each main heading
  const [folded, setFolded] = useState(() => {
    try {
      return localStorage.getItem("hrp-nav-folded") === "1";
    } catch {
      return false;
    }
  });
  const toggleFold = () =>
    setFolded((value) => {
      try {
        localStorage.setItem("hrp-nav-folded", value ? "0" : "1");
      } catch {
        /* ignore */
      }
      return !value;
    });

  if (bare) return children;

  const shownTab = TAB_ALIAS[activeTab] || activeTab;

  const groups = MENU.map((group) => ({
    ...group,
    items: group.items.filter(([tab]) => isTabVisible(tab)),
  })).filter((group) => group.items.length > 0);

  const active =
    groups.find((group) => group.items.some(([tab]) => tab === shownTab)) ||
    groups[0];

  if (active && shownTab) lastTab.current[active.id] = shownTab;

  const openGroup = (group) => {
    const remembered = lastTab.current[group.id];
    const target = group.items.some(([tab]) => tab === remembered)
      ? remembered
      : group.items[0][0];
    onSelect(target);
  };

  return (
    <div className="hrp">
      <nav className={`hrp-nav${folded ? " fold" : ""}`} aria-label="HR Operations">
        <button
          type="button"
          className="hrp-fold"
          onClick={toggleFold}
          aria-expanded={!folded}
          title={folded ? "Unfold Menu" : "Fold Menu"}
        >
          {folded ? "»" : "« Fold"}
        </button>
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            className={`hrp-ni${active?.id === group.id ? " on" : ""}`}
            aria-current={active?.id === group.id ? "page" : undefined}
            onClick={() => openGroup(group)}
            title={group.label}
          >
            <span className="hrp-ic">{ICONS[group.id]}</span>
            <span className="hrp-lb">{group.label}</span>
            {!folded && group.items.length > 1 && (
              <span className="hrp-ct">{group.items.length}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="hrp-main">
        {active && (
          <div className="hrp-tabs" role="tablist">
            {active.items.map(([tab, label]) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={tab === shownTab}
                className={`hrp-pt${tab === shownTab ? " on" : ""}`}
                onClick={() => onSelect(tab)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="hrp-body">{children}</div>
      </div>
    </div>
  );
}