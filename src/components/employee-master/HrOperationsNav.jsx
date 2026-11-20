import { useRef } from "react";
import "./hr-ops-nav.css";

/*
 * HR Operations layout:
 *   left pane  : main headings  (HR Dashboard · Master · Operation · Access)
 *   top tabs   : the sub headings of the selected main heading
 *   body       : the screen (children)
 * Only the tabs the user may open (isTabVisible) are listed.
 */
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
      <nav className="hrp-nav" aria-label="HR Operations">
        {groups.map((group) => (
          <button
            key={group.id}
            type="button"
            className={`hrp-ni${active?.id === group.id ? " on" : ""}`}
            aria-current={active?.id === group.id ? "page" : undefined}
            onClick={() => openGroup(group)}
          >
            <span>{group.label}</span>
            {group.items.length > 1 && (
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