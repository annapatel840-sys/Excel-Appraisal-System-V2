import { LayoutDashboard, Table2, Users } from "lucide-react";

import { cn } from "@/lib/utils";

export function AppShell({ children, headerActions }) {
  const pathname = window.location.pathname;

  const nav = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/sheet", label: "Appraisal Sheet", icon: Table2 },
    { to: "/employee-master", label: "Employee Master", icon: Users },
  ];

  const navigate = (event, to) => {
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

              return (
                <a
                  key={item.to}
                  href={item.to}
                  onClick={(event) => navigate(event, item.to)}
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors",
                    pathname === item.to
                      ? "bg-white/15 text-white"
                      : "text-white/75 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <Icon className="size-3.5" />
                  {item.label}
                </a>
              );
            })}
          </nav>

          {headerActions && (
            <div className="ml-auto flex min-w-0 items-center gap-1.5">
              {headerActions}
            </div>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-3 py-3">{children}</main>
    </div>
  );
}
