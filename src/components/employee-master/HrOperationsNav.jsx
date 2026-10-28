import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import "./hr-ops-nav.css";

/*
 * White sub-navigation for the HR Operations screen:
 *   HR Dashboard  |  Master ▾  |  Operation ▾  |  Access
 * The active entry reads "Group · Item" (e.g. "Master · Budget Master").
 * Only the tabs the user may open (isTabVisible) are listed.
 */
const GROUPS = [
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
    ],
  },
];

export function HrOperationsNav({ activeTab, isTabVisible, onSelect }) {
  const [openId, setOpenId] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!openId) return undefined;
    const onDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpenId(null);
    };
    const onKey = (event) => {
      if (event.key === "Escape") setOpenId(null);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openId]);

  const groups = GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(([tab]) => isTabVisible(tab)),
  })).filter((group) => group.items.length > 0);

  return (
    <nav className="hrn" ref={rootRef} aria-label="HR Operations">
      {isTabVisible("hr-dashboard") && (
        <button
          type="button"
          className={`hrn-trigger${activeTab === "hr-dashboard" ? " active" : ""}`}
          onClick={() => {
            setOpenId(null);
            onSelect("hr-dashboard");
          }}
        >
          HR Dashboard
        </button>
      )}

      {groups.map((group) => {
        const activeItem = group.items.find(([tab]) => tab === activeTab);
        const open = openId === group.id;

        return (
          <div className="hrn-group" key={group.id}>
            <button
              type="button"
              className={`hrn-trigger${activeItem ? " active" : ""}`}
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpenId(open ? null : group.id)}
            >
              <span>
                {activeItem ? `${group.label} · ${activeItem[1]}` : group.label}
              </span>
              <ChevronDown size={13} className={open ? "flip" : ""} />
            </button>

            {open && (
              <div className="hrn-menu" role="menu">
                {group.items.map(([tab, label]) => (
                  <button
                    key={tab}
                    type="button"
                    role="menuitem"
                    className={tab === activeTab ? "current" : ""}
                    onClick={() => {
                      setOpenId(null);
                      onSelect(tab);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {isTabVisible("access") && (
        <button
          type="button"
          className={`hrn-trigger${activeTab === "access" ? " active" : ""}`}
          onClick={() => {
            setOpenId(null);
            onSelect("access");
          }}
        >
          Access
        </button>
      )}
    </nav>
  );
}