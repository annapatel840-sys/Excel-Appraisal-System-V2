// import { LayoutDashboard, Table2, Users, BookOpen } from "lucide-react";

// import { cn } from "@/lib/utils";

// export function AppShell({ children, headerActions }) {
//   const pathname = window.location.pathname;

//   const nav = [
//     { to: "/", label: "Dashboard", icon: LayoutDashboard },
//     { to: "/sheet", label: "Appraisal Sheet", icon: Table2 },
//     { to: "/employee-master", label: "HR Operations", icon: Users },
//     { to: "/detail-screen", label: "Detailed Screen", icon: BookOpen },
//   ];

//   const navigate = (event, to) => {
//     event.preventDefault();
//     window.history.pushState({}, "", to);
//     window.dispatchEvent(new PopStateEvent("popstate"));
//   };

//   return (
//     <div className="min-h-screen bg-background">
//       <header className="sticky top-0 z-50 border-b border-border bg-[#173b63] backdrop-blur">
//         <div className="mx-auto flex h-12 max-w-[1600px] items-center gap-3 px-3">
//           <div className="flex shrink-0 items-center gap-2">
//             <span className="flex size-7 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-primary-foreground">
//               EA
//             </span>

//             <div className="hidden xl:block">
//               <h1 className="text-xs font-semibold leading-tight text-white">
//                 Employee Appraisal Management
//               </h1>

//               <p className="text-[9px] text-white/70">
//                 FY 2025-26 · Compensation Review
//               </p>
//             </div>
//           </div>

//           <nav className="flex items-center gap-0.5">
//             {nav.map((item) => {
//               const Icon = item.icon;

//               return (
//                 <a
//                   key={item.to}
//                   href={item.to}
//                   onClick={(event) => navigate(event, item.to)}
//                   className={cn(
//                     "flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors",
//                     pathname === item.to
//                       ? "bg-white/15 text-white"
//                       : "text-white/75 hover:bg-white/10 hover:text-white",
//                   )}
//                 >
//                   <Icon className="size-3.5" />
//                   {item.label}
//                 </a>
//               );
//             })}
//           </nav>

//           {headerActions && (
//             <div className="ml-auto flex min-w-0 items-center gap-1.5">
//               {headerActions}
//             </div>
//           )}
//         </div>
//       </header>

//       <main className="mx-auto max-w-[1600px] px-3 py-3">{children}</main>
//     </div>
//   );
// }

import { LayoutDashboard, Table2, Users, BookOpen, LogOut } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth-store";

export function AppShell({ children, headerActions }) {
  const pathname = window.location.pathname;
  const { user, permissions, logout } = useAuth();

  const allNav = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/sheet", label: "Appraisal Sheet", icon: Table2 },
    { to: "/employee-master", label: "HR Operations", icon: Users },
    { to: "/detail-screen", label: "Detailed Screen", icon: BookOpen },
  ];

  // only show the pages this role may open
  const nav = allNav.filter((item) => permissions?.pages?.includes(item.to));

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

          {/* logged-in user + logout */}
          <div
            className={cn(
              "flex shrink-0 items-center gap-2",
              headerActions ? "" : "ml-auto",
            )}
          >
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-[11px] font-medium text-white">{user?.name}</p>

              <p className="text-[9px] text-white/70">{user?.role}</p>
            </div>

            <button
              type="button"
              onClick={logout}
              title="Log out"
              className="flex h-7 items-center gap-1 rounded-md px-2 text-[11px] font-medium text-white/80 hover:bg-white/10 hover:text-white"
            >
              <LogOut className="size-3.5" />
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1600px] px-3 py-3">{children}</main>
    </div>
  );
}
