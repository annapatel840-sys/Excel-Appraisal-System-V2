import {
  LayoutDashboard,
  Table2,
  Users,
  BookOpen,
  LogOut,
  ChevronDown,
  WalletCards,
  Settings,
} from "lucide-react";

import { useCatalystSignOut, useCatalystUser } from "@/lib/catalyst-auth";
import { useSettings } from "@/lib/settings-store";
import { cn } from "@/lib/utils";

const TECH_ED_PATHS = [
  "/",
  "/employee-master",
  "/sheet",
  "/detail-screen",
  "/budget-allocation",
];

export function AppShell({ children, headerActions }) {
  const pathname = window.location.pathname;
  const signOut = useCatalystSignOut();
  const user = useCatalystUser();
  const { settings } = useSettings();

  const role = String(user?.role || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const isTechEd = role.includes("teched");
  const isHR =
    role === "hr" || role === "humanresources" || role === "hroperation" || role === "hroperations";

  const isVertical = settings.menuPosition === "left";
  const isCollapsed = isVertical && settings.menuCollapsed;

  const allNav = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/sheet", label: "Appraisal Sheet", icon: Table2 },
    ...(isTechEd
      ? [
          {
            to: "/budget-allocation",
            label: "Budget Allocation",
            icon: WalletCards,
          },
        ]
      : [
          {
            to: "/employee-master",
            label: "HR Operations",
            icon: Users,
            dropdown: isHR,
          },
        ]),
    { to: "/detail-screen", label: "Detailed Screen", icon: BookOpen },
  ];

  const nav = isTechEd
    ? allNav.filter((item) => TECH_ED_PATHS.includes(item.to))
    : allNav;

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
    <div className={cn("flex shrink-0 items-center gap-2", isVertical && "px-1")}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
        R2C
      </span>
      {!isCollapsed && (
        <div className={cn(!isVertical && "hidden xl:block")}>
          <h1 className="text-xs font-semibold leading-tight text-white">
            Employee Appraisal Management
          </h1>
          <p className="text-[9px] text-white/70">
            FY 2025-26 · Compensation Review
          </p>
        </div>
      )}
    </div>
  );

  const settingsButton = (
    <a
      href="/settings"
      onClick={(event) => navigate(event, "/settings")}
      className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white"
      title={isCollapsed ? "Settings" : undefined}
      aria-label="Settings"
    >
      <Settings className="size-3.5" />
      {!isCollapsed && <span>Settings</span>}
    </a>
  );

  return (
    <div className={cn("min-h-screen bg-background", isVertical && "lg:pl-56", isCollapsed && "lg:pl-[72px]")}>
      <header
        className={cn(
          "z-50 border-border bg-[var(--app-brand)]",
          isVertical
            ? "fixed inset-y-0 left-0 hidden w-56 border-r lg:flex"
            : "sticky top-0 border-b",
          isCollapsed && "lg:w-[72px]",
        )}
      >
        <div
          className={cn(
            "mx-auto flex max-w-[1600px]",
            isVertical
              ? "h-full w-full flex-col items-stretch gap-3 px-3 py-3"
              : "h-12 w-full items-center gap-3 px-3",
          )}
        >
          {projectHeading}

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
                  className={cn(
                    "relative",
                    isHrMenu && "group",
                  )}
                >
                  <a
                    href={item.to}
                    onClick={(event) => navigate(event, item.to)}
                    className={cn(
                      "flex rounded-md font-medium transition-colors",
                      isVertical
                        ? "min-h-9 items-center gap-2 px-2.5 text-xs"
                        : "h-7 items-center gap-1.5 px-2 text-[11px]",
                      isCollapsed && "justify-center px-0",
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
                    <Icon className={cn(isVertical ? "size-4" : "size-3.5", "shrink-0")} />
                    {!isCollapsed && <span>{item.label}</span>}
                    {isHrMenu && !isCollapsed && <ChevronDown className="size-3" />}
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
                        {[
                          ["Employee Master", "roster", "/employee-master?tab=roster"],
                          ["Eligibility List", "eligibility", "/employee-master?tab=eligibility"],
                          ["Appraisal Cycle Master", "appraisal-cycle", "/employee-master?tab=appraisal-cycle"],
                          ["Payroll Data", "payroll-data", "/employee-master?tab=payroll-data"],
                          ["Payroll Upload", "payroll-upload", "/employee-master?tab=payroll-upload"],
                          ["Team Changes", "team-changes", "/employee-master?tab=team-changes"],
                          ["Budget Allocation", "budget-allocation", "/employee-master?tab=budget-allocation"],
                          ["Budget Distribution", "budget-distribution", "/employee-master?tab=budget-distribution"],
                          ["Delegation", "delegation", "/employee-master?tab=delegation"],
                        ].map(([label, tab, to]) => (
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
              isVertical
                ? "mt-auto flex-col"
                : "ml-auto min-w-0 items-center",
              isCollapsed && "items-center",
            )}
          >
            {!isVertical && headerActions}
            {isVertical && headerActions}
            {settingsButton}
            <button
              type="button"
              onClick={signOut}
              className={cn(
                "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white",
                isCollapsed && "justify-center px-0",
              )}
              aria-label="Sign out"
              title={isCollapsed ? "Sign out" : undefined}
            >
              <LogOut className="size-3.5" />
              {!isCollapsed && <span>Sign out</span>}
            </button>
          </div>

          {!isVertical && headerActions && (
            <div className="hidden" aria-hidden="true" />
          )}
        </div>
      </header>

      <main
        className={cn(
          "mx-auto max-w-[1600px] px-3 py-3",
          isVertical && "lg:mx-0 lg:max-w-none",
        )}
      >
        {children}
      </main>
    </div>
  );
}
