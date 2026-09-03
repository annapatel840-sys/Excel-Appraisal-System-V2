import { LayoutDashboard, Table2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function AppShell({ children, headerActions }) {
  const pathname = window.location.pathname;

  const nav = [
    {
      to: "/",
      label: "Dashboard",
      icon: LayoutDashboard,
    },
    {
      to: "/sheet",
      label: "Appraisal Sheet",
      icon: Table2,
    },
  ];

  const navigate = (event, to) => {
    event.preventDefault();

    window.history.pushState({}, "", to);
    window.dispatchEvent(new PopStateEvent("popstate"));
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-3 px-3">
          {/* Brand */}
          <div className="flex shrink-0 items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
              EA
            </span>

            <div className="hidden xl:block">
              <h1 className="text-xs font-semibold leading-tight">
                Employee Appraisal Management
              </h1>

              <p className="text-[9px] text-muted-foreground">
                FY 2025-26 · Compensation Review
              </p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex items-center gap-0.5">
            {nav.map((n) => (
              <a
                key={n.to}
                href={n.to}
                onClick={(e) => navigate(e, n.to)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors",
                  pathname === n.to
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <n.icon className="size-3.5" />
                {n.label}
              </a>
            ))}
          </nav>

          {/* Header actions */}
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
