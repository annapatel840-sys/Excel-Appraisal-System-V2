import { LayoutDashboard, Table2, Users, BookOpen, LogOut, ChevronDown } from "lucide-react";

import { useCatalystSignOut, useCatalystUser } from "@/lib/catalyst-auth";
import { cn } from "@/lib/utils";

// Must match the Tech-ED allow-list in src/App.jsx.
const TECH_ED_PATHS = ["/", "/employee-master", "/detail-screen"];

export function AppShell({ children, headerActions }) {
  const pathname = window.location.pathname;
  const signOut = useCatalystSignOut();
  const user = useCatalystUser();
  const role = String(user?.role || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isTechEd = role.includes("teched");
  const isHR = role === "hr" || role === "humanresources" || role === "hroperation";

  const allNav = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/sheet", label: "Appraisal Sheet", icon: Table2 },
    ...(isTechEd
      ? []
      : [{ to: "/employee-master", label: "HR Operations", icon: Users, dropdown: isHR }]),
    { to: "/detail-screen", label: "Detailed Screen", icon: BookOpen },
  ];

  // Tech-ED users are redirected away from every other route (see App.jsx),
  // so only show the links they can actually open.
  const nav = isTechEd
    ? allNav.filter((item) => TECH_ED_PATHS.includes(item.to))
    : allNav;

  const navigate = (event, to) => {
    // Let the browser handle modified / non-left clicks (open in new tab etc.).
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    event.preventDefault();
    window.history.pushState({}, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-[#173b63] backdrop-blur">
        <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-3 px-3">
          <div className="flex shrink-0 items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
              EA
            </span>

            <div className="hidden xl:block">
              <h1 className="text-xs font-semibold leading-tight text-white">
                Employee Appraisal Management
              </h1>

              <p className="text-[9px] text-white/70">
                FY 2025-26 · Compensation Review
              </p>
            </div>
          </div>

          <nav className="flex items-center gap-0.5">
            {nav.map((item) => {
              const Icon = item.icon;
              const isHrMenu = item.dropdown;

              return (
                <div
                  key={item.to}
                  className={cn("relative", isHrMenu && "group")}
                >
                  <a
                    href={item.to}
                    onClick={(event) => navigate(event, item.to)}
                    className={cn(
                      "flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors",
                      pathname.startsWith(item.to)
                        ? "bg-white/15 text-white"
                        : "text-white/75 hover:bg-white/10 hover:text-white",
                    )}
                    aria-haspopup={isHrMenu ? "menu" : undefined}
                  >
                    <Icon className="size-3.5" />
                    {item.label}
                    {isHrMenu && <ChevronDown className="size-3" />}
                  </a>

                  {isHrMenu && (
                    <div
                      className="invisible absolute left-0 top-full z-[100] min-w-[190px] pt-1 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100"
                      role="menu"
                    >
                      <div className="overflow-hidden rounded-md border border-[#d8e0ea] bg-white py-1 shadow-xl">
                        {[
                          ["Employee Master", "roster"],
                          ["Eligibility List", "eligibility"],
                          ["Appraisal Cycle Master", "appraisal-cycle"],
                          ["Payroll Data", "payroll-data"],
                          ["Payroll Upload", "payroll-upload"],
                          ["Team Changes", "team-changes"],
                          ["Budget Allocation", "budget-allocation"],
                        ].map(([label, tab]) => (
                          <a
                            key={tab}
                            href={`/employee-master?tab=${tab}`}
                            onClick={(event) =>
                              navigate(event, `/employee-master?tab=${tab}`)
                            }
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

          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            {headerActions}
            <button
              type="button"
              onClick={signOut}
              className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Sign out"
            >
              <LogOut className="size-3.5" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-3 py-3">{children}</main>
    </div>
  );
}
