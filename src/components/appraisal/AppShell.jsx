import {
  LayoutDashboard,
  Table2,
  Users,
  BookOpen,
  ChevronDown,
  WalletCards,
  SlidersHorizontal,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";

import { HR_TAB_SCREENS, useAccess } from "@/lib/access-store";
import { useCatalystUser } from "@/lib/catalyst-auth";
import { useSettings } from "@/lib/settings-store";
import { cn } from "@/lib/utils";
import { useCurrentCycleName } from "@/lib/current-cycle";
import { useViewAs } from "@/lib/view-as-store";
import { ProfileMenu } from "./ProfileMenu";
import { ViewAsSwitcher } from "./ViewAsSwitcher";

const TECH_ED_PATHS = [
  "/",
  "/sheet",
  "/detail-screen",
  "/budget-distribution",
  "/settings",
];

// HR Operations is a plain link now; it opens on the Access tab.
const HR_OPERATIONS_HOME = "/employee-master?tab=access";

const HR_MENU_ITEMS = [
  ["Employee Master", "roster", "/employee-master?tab=roster"],
  ["Eligibility List", "eligibility", "/employee-master?tab=eligibility"],
  [
    "Appraisal Cycle Master",
    "appraisal-cycle",
    "/employee-master?tab=appraisal-cycle",
  ],
  ["Payroll Master", "payroll-data", "/employee-master?tab=payroll-data"],
  ["Upload", "payroll-upload", "/employee-master?tab=payroll-upload"],
  ["Team Changes", "team-changes", "/employee-master?tab=team-changes"],
  ["Budget Master", "budget-master", "/employee-master?tab=budget-master"],
  [
    "Budget Distribution",
    "budget-distribution",
    "/employee-master?tab=budget-distribution",
  ],
  ["Delegation", "delegation", "/employee-master?tab=delegation"],
  ["Access", "access", "/employee-master?tab=access"],
];

export function AppShell({ children, headerActions }) {
  const pathname = window.location.pathname;
  const user = useCatalystUser();
  const access = useAccess();
  const { settings, saveSettings } = useSettings();
  const { effectiveId, preview } = useViewAs();
  const cycleName = useCurrentCycleName();

  const role = preview
    ? effectiveId
    : String(user?.role || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
  const isTechEd = role.includes("teched");
  // Comp Managers get Budget Distribution in the top menu instead of
  // HR Operations.
  const isCompManager = role.includes("compmanager");
  const isHR =
    role === "hr" ||
    role === "humanresources" ||
    role === "hroperation" ||
    role === "hroperations";

  const isVertical = settings.menuPosition === "left";
  // FIX: vertical navigation auto-collapses by default; pinning keeps it open.
  const isPinned = isVertical && Boolean(settings.menuPinned);
  const isCollapsed = isVertical && !isPinned;

  const allNav = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/sheet", label: "Appraisal Sheet", icon: Table2 },
    { to: "/detail-screen", label: "Detailed Screen", icon: BookOpen },
    ...(!isTechEd ? [{ to: "/bulk-edit", label: "Bulk Edit", icon: SlidersHorizontal }] : []),
    ...(!isTechEd && !isCompManager
      ? [
          {
            to: "/employee-master",
            label: "HR Operations",
            icon: Users,
            go: HR_OPERATIONS_HOME,
          },
        ]
      : []),
    ...(isCompManager
      ? [
          {
            to: "/budget-distribution",
            label: "Budget Distribution",
            icon: WalletCards,
          },
        ]
      : []),
  ];

  const fallbackNav = isTechEd
    ? allNav.filter((item) => TECH_ED_PATHS.includes(item.to))
    : allNav;

  // With access rules (/me ok) the menu follows the user's screens; otherwise
  // the role-based menu above is used unchanged.
  const useAccessRules = access.ok && !preview;
  const hrMenuItems = HR_MENU_ITEMS.filter(([, tab]) =>
    useAccessRules
      ? access.canScreen(HR_TAB_SCREENS[tab])
      : tab !== "access" || isHR,
  );
  // "View as": HR previewing another role sees that role's menu.
  const previewNav = isTechEd
    ? [
        ...fallbackNav,
        {
          to: "/budget-distribution",
          label: "Budget Distribution",
          icon: WalletCards,
        },
      ]
    : fallbackNav;
  const nav = preview
    ? previewNav
    : access.ok
    ? [
        access.canScreen("dashboard") && {
          to: "/",
          label: "Dashboard",
          icon: LayoutDashboard,
        },
        access.canScreen("appraisalSheet") && {
          to: "/sheet",
          label: "Appraisal Sheet",
          icon: Table2,
        },
        access.canScreen("detailScreen") && {
          to: "/detail-screen",
          label: "Detailed Screen",
          icon: BookOpen,
        },
        access.canAction("bulkEdit") && {
          to: "/bulk-edit",
          label: "Bulk Edit",
          icon: SlidersHorizontal,
        },
        (isTechEd ||
          (isCompManager && access.canScreen("budgetDistribution"))) && {
          to: "/budget-distribution",
          label: "Budget Distribution",
          icon: WalletCards,
        },
        !isTechEd && !isCompManager && hrMenuItems.length > 0 && {
          to: "/employee-master",
          label: "HR Operations",
          icon: Users,
          go: HR_OPERATIONS_HOME,
        },
      ].filter(Boolean)
    : fallbackNav;

  const navigate = (event, to) => {
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    )
      return;

    event.preventDefault();
    window.history.pushState({}, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  const projectHeading = (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center gap-2 text-center",
        isVertical && "px-1",
        isCollapsed && "group-hover/nav:justify-start",
      )}
    >
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
        Wissen
      </span>
      <div
        className={cn(
          !isVertical && "hidden xl:block",
          isCollapsed && "hidden group-hover/nav:block",
        )}
      >
        <h1 className="text-xs font-semibold leading-tight text-white">
          Compensation Tool
        </h1>
        {cycleName && (
          <p className="text-[9px] text-white/70">{cycleName}</p>
        )}
      </div>
    </div>
  );

  return (
    <div
      className={cn(
        "app-shell-layout min-h-screen bg-background",
        isVertical && !isPinned && "app-shell-layout--auto-collapse",
        isVertical && (isPinned ? "lg:pl-56" : "lg:pl-14"),
      )}
    >
      <style>{`
        /* FIX: budget KPI strip must not overflow beside the collapsed rail.
           It reappears on sidebar hover; pinned navigation keeps it visible. */
        @media (min-width: 1024px) {
          .app-shell-layout--auto-collapse:has(> .app-shell-sidebar:not(:hover))
            .bd-root .summary,
          .app-shell-layout--auto-collapse:has(> .app-shell-sidebar:not(:hover))
            .tbd-root .bsum,
          .app-shell-layout--auto-collapse:has(> .app-shell-sidebar:not(:hover))
            .te-root .bsum {
            display: none !important;
          }
        }
      `}</style>
      <header
        className={cn(
          "app-shell-sidebar z-50 border-border bg-[var(--app-brand)]",
          isVertical
            ? "group/nav fixed inset-y-0 left-0 hidden border-r lg:flex lg:transition-[width] lg:duration-200"
            : "sticky top-0 border-b",
          isVertical && (isPinned ? "lg:w-56" : "lg:w-14 lg:hover:w-56"),
        )}
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-[1600px] min-w-0",
            isVertical
              ? "h-full w-full flex-col items-stretch gap-3 px-3 py-3"
              : "h-12 w-full items-center gap-3 px-3",
          )}
        >
          {projectHeading}

          {isVertical && (
            <button
              type="button"
              onClick={() =>
                saveSettings({ ...settings, menuPinned: !isPinned })
              }
              aria-pressed={isPinned}
              aria-label={isPinned ? "Collapse sidebar to icons" : "Keep sidebar expanded"}
              title={isPinned ? "Collapse sidebar to icons" : "Keep sidebar expanded"}
              className={cn(
                "flex size-8 shrink-0 items-center justify-center rounded-md text-white/80 transition-colors hover:bg-white/10",
                isCollapsed && "mx-auto group-hover/nav:mx-0",
              )}
            >
              {isPinned
                ? <PanelLeftClose className="size-4" />
                : <PanelLeftOpen className="size-4" />}
            </button>
          )}

          <nav
            className={cn(
              "flex",
              isVertical
                ? "flex-col items-stretch gap-1"
                : "items-center gap-0.5",
            )}
          >
            {nav.map((item) => {
              const Icon = item.icon;
              const isHrMenu = item.dropdown;

              return (
                <div
                  key={item.to}
                  className={cn("relative", isHrMenu && "group")}
                >
                  <a
                    href={item.go || item.to}
                    onClick={(event) => navigate(event, item.go || item.to)}
                    className={cn(
                      "flex rounded-md font-medium transition-colors",
                      isVertical
                        ? "min-h-9 items-center gap-2 px-2.5 text-xs"
                        : "h-7 items-center gap-1.5 px-2 text-[11px]",
                      isCollapsed && "justify-center px-0 group-hover/nav:justify-start group-hover/nav:px-2.5",
                      (
                        item.to === "/"
                          ? pathname === "/"
                          : pathname.startsWith(item.to)
                      )
                        ? "bg-white/15 text-white"
                        : "text-white/75 hover:bg-white/10 hover:text-white",
                    )}
                    aria-haspopup={isHrMenu ? "menu" : undefined}
                    title={isCollapsed ? item.label : undefined}
                  >
                    <Icon
                      className={cn(
                        isVertical ? "size-4" : "size-3.5",
                        "shrink-0",
                      )}
                    />
                    <span className={cn(isCollapsed && "hidden group-hover/nav:inline")}>
                      {item.label}
                    </span>
                    {isHrMenu && !isCollapsed && (
                      <ChevronDown className="size-3" />
                    )}
                  </a>

                  {isHrMenu && (
                    <div
                      className={cn(
                        "invisible absolute z-[100] opacity-0 transition-opacity group-hover:visible group-hover:opacity-100",
                        isVertical
                          ? "left-full top-0 pl-1"
                          : "left-0 top-full pt-1",
                      )}
                      role="menu"
                    >
                      <div className="overflow-hidden rounded-md border border-[#d8e0ea] bg-white py-1 shadow-xl">
                        {hrMenuItems.map(([label, tab, to]) => (
                          <a
                            key={tab}
                            href={to}
                            onClick={(event) => navigate(event, to)}
                            className="block whitespace-nowrap px-3 py-2 text-[11px] font-medium text-[#334155] hover:bg-[#eef5f5] hover:text-[#0B6A66]"
                            role="menuitem"
                          >
                            {label}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </nav>

          <div
            className={cn(
              "flex gap-1.5",
              isVertical ? "mt-auto flex-col" : "ml-auto min-w-0 items-center",
              isCollapsed && "items-center",
            )}
          >
            {!isVertical && headerActions}
            {isVertical && headerActions}
            <div className={cn(isCollapsed && "hidden group-hover/nav:block")}>
              <ViewAsSwitcher isVertical={isVertical} />
            </div>
            <ProfileMenu
              isVertical={isVertical}
              isCollapsed={isCollapsed}
              showSettings={isTechEd || access.canScreen("settings")}
            />
          </div>

          {!isVertical && headerActions && (
            <div className="hidden" aria-hidden="true" />
          )}
        </div>
      </header>

      <main
        className={cn(
          "mx-auto w-full max-w-[1600px] min-w-0 px-3 py-3",
          isVertical && "lg:mx-0 lg:max-w-none lg:px-4",
        )}
      >
        {children}
      </main>
    </div>
  );
}