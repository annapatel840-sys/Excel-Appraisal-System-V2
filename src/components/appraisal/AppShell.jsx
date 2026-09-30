// import { LayoutDashboard, Table2, Users, BookOpen, LogOut, ChevronDown, WalletCards } from "lucide-react";

// import { useCatalystSignOut, useCatalystUser } from "@/lib/catalyst-auth";
// import { cn } from "@/lib/utils";

// const TECH_ED_PATHS = ["/", "/employee-master", "/detail-screen", "/budget-allocation"];

// export function AppShell({ children, headerActions }) {
//   const pathname = window.location.pathname;
//   const signOut = useCatalystSignOut();
//   const user = useCatalystUser();
//   const role = String(user?.role || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
//   const isTechEd = role.includes("teched");
//   const isHR = role === "hr" || role === "humanresources" || role === "hroperation";

//   const allNav = [
//     { to: "/", label: "Dashboard", icon: LayoutDashboard },
//     { to: "/sheet", label: "Appraisal Sheet", icon: Table2 },
//     ...(isTechEd
//       ? [{ to: "/budget-allocation", label: "Budget Allocation", icon: WalletCards }]
//       : [{ to: "/employee-master", label: "HR Operations", icon: Users, dropdown: isHR }]),
//     { to: "/detail-screen", label: "Detailed Screen", icon: BookOpen },
//   ];

//   const nav = isTechEd
//     ? allNav.filter((item) => TECH_ED_PATHS.includes(item.to))
//     : allNav;

//   const navigate = (event, to) => {
//     if (
//       event.defaultPrevented ||
//       event.button !== 0 ||
//       event.metaKey ||
//       event.ctrlKey ||
//       event.shiftKey ||
//       event.altKey
//     ) return;

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
//               const isHrMenu = item.dropdown;

//               return (
//                 <div key={item.to} className={cn("relative", isHrMenu && "group")}>
//                   <a
//                     href={item.to}
//                     onClick={(event) => navigate(event, item.to)}
//                     className={cn(
//                       "flex h-7 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium transition-colors",
//                       (item.to === "/" ? pathname === "/" : pathname.startsWith(item.to))
//                         ? "bg-white/15 text-white"
//                         : "text-white/75 hover:bg-white/10 hover:text-white",
//                     )}
//                     aria-haspopup={isHrMenu ? "menu" : undefined}
//                   >
//                     <Icon className="size-3.5" />
//                     {item.label}
//                     {isHrMenu && <ChevronDown className="size-3" />}
//                   </a>

//                   {isHrMenu && (
//                     <div className="invisible absolute left-0 top-full z-[100] min-w-[190px] pt-1 opacity-0 transition-opacity group-hover:visible group-hover:opacity-100" role="menu">
//                       <div className="overflow-hidden rounded-md border border-[#d8e0ea] bg-white py-1 shadow-xl">
//                         {[
//                           ["Employee Master", "roster"],
//                           ["Eligibility List", "eligibility"],
//                           ["Appraisal Cycle Master", "appraisal-cycle"],
//                           ["Payroll Data", "payroll-data"],
//                           ["Payroll Upload", "payroll-upload"],
//                           ["Team Changes", "team-changes"],
//                           ["Budget Allocation", "budget-allocation"],
//                         ].map(([label, tab]) => (
//                           <a
//                             key={tab}
//                             href={`/employee-master?tab=${tab}`}
//                             onClick={(event) => navigate(event, `/employee-master?tab=${tab}`)}
//                             className="block whitespace-nowrap px-3 py-2 text-[11px] font-medium text-[#334155] hover:bg-[#eef5f5] hover:text-[#0B6A66]"
//                             role="menuitem"
//                           >
//                             {label}
//                           </a>
//                         ))}
//                       </div>
//                     </div>
//                   )}
//                 </div>
//               );
//             })}
//           </nav>

//           <div className="ml-auto flex min-w-0 items-center gap-1.5">
//             {headerActions}
//             <button
//               type="button"
//               onClick={signOut}
//               className="flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white"
//               aria-label="Sign out"
//             >
//               <LogOut className="size-3.5" />
//               Sign out
//             </button>
//           </div>
//         </div>
//       </header>

//       <main className="mx-auto max-w-[1600px] px-3 py-3">{children}</main>
//     </div>
//   );
// }

import { Component, useEffect, useState } from "react";

import { AppraisalProvider } from "@/lib/appraisal-store";
import { BudgetProvider } from "@/lib/budget-store";
import { Dashboard } from "@/routes/index";
import { SheetPage } from "@/routes/sheet";
import { EmployeeMaster } from "@/pages/EmployeeMaster";

//this might be remove later (detailscreen)
import { DetailScreenPage } from "@/components/appraisal/DetailScreenPage";
import { AppShell } from "./components/appraisal/AppShell";
import { BudgetAllocationPage } from "@/components/employee-master/BudgetAllocationPage";
import { CatalystAuthGate, useCatalystUser } from "@/lib/catalyst-auth";

const TECH_ED_PATHS = ["/", "/employee-master", "/detail-screen", "/budget-allocation" ];

// A crash in one screen shows a message instead of blanking the whole app.
// It is keyed by path, so navigating to another screen clears the error.
class ScreenErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error("Screen crashed:", error, info?.componentStack);
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-lg border border-red-200 bg-white p-5 text-sm shadow-sm">
          <p className="font-semibold text-red-700">This screen failed to load.</p>
          <p className="mt-2 break-words text-muted-foreground">
            {String(this.state.error?.message || this.state.error)}
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-[#173b63] px-3 py-1.5 text-xs font-medium text-white"
            >
              Reload
            </button>
            <a href="/" className="rounded-md border px-3 py-1.5 text-xs font-medium">
              Go to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}

// Rendered inside <CatalystAuthGate> so useCatalystUser() sees the signed-in user.
function AppRoutes() {
  const [path, setPath] = useState(window.location.pathname);
  const user = useCatalystUser();
  const role = String(user?.role || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isTechEd = role.includes("teched");
  const effectivePath = isTechEd && !TECH_ED_PATHS.includes(path) ? "/employee-master" : path;

  useEffect(() => {
    const onPopState = () => {
      setPath(window.location.pathname);
    };

    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  // Keep the URL (and nav highlighting) in sync when a Tech-ED is redirected.
  useEffect(() => {
    if (effectivePath !== path) {
      window.history.replaceState({}, "", effectivePath);
      setPath(effectivePath);
    }
  }, [effectivePath, path]);

  let page;

  if (effectivePath === "/sheet") {
    page = <SheetPage />;
  } else if (effectivePath === "/employee-master") {
    page = <EmployeeMaster />;
  } else if (effectivePath === "/detail-screen") {
  page = (
    <AppShell>
      <DetailScreenPage />
    </AppShell>
  );
} else if (effectivePath === "/budget-allocation") {
  page = (
    <AppShell>
      <BudgetAllocationPage />
    </AppShell>
  );
} else {
  page = <Dashboard />;
}



  return (
    <AppraisalProvider>
      <BudgetProvider>
        <ScreenErrorBoundary key={effectivePath}>{page}</ScreenErrorBoundary>
      </BudgetProvider>
    </AppraisalProvider>
  );
}

export default function App() {
  return (
    <CatalystAuthGate>
      <AppRoutes />
    </CatalystAuthGate>
  );
}