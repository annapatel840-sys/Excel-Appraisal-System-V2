import { Component, useEffect, useState } from "react";

import { AppraisalProvider } from "@/lib/appraisal-store";
import { BudgetProvider } from "@/lib/budget-store";
import { Dashboard } from "@/routes/index";
import { SheetPage } from "@/routes/sheet";
import { EmployeeMaster } from "@/pages/EmployeeMaster";
import { DetailScreenPage } from "@/components/appraisal/DetailScreenPage";
import { TechEdBudgetAllocationPage } from "@/components/employee-master/TechEdBudgetAllocationPage";
import { BudgetDistributionPage } from "@/components/employee-master/BudgetDistributionPage";
import { AppShell } from "./components/appraisal/AppShell";
import { CatalystAuthGate, useCatalystUser } from "@/lib/catalyst-auth";

const TECH_ED_PATHS = [
  "/",
  "/employee-master",
  "/detail-screen",
  "/budget-allocation",
];

const HR_ONLY_PATHS = ["/budget-distribution"];
const BUDGET_DISTRIBUTION_PATH = "/budget-distribution";

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
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md rounded-lg border border-red-200 bg-white p-5 text-sm shadow-sm">
          <p className="font-semibold text-red-700">
            This screen failed to load.
          </p>
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
            <a
              href="/"
              className="rounded-md border px-3 py-1.5 text-xs font-medium"
            >
              Go to Dashboard
            </a>
          </div>
        </div>
      </div>
    );
  }
}

function AppRoutes() {
  const [path, setPath] = useState(window.location.pathname);
  const user = useCatalystUser();
  const role = String(user?.role || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const isTechEd = role.includes("teched");
  const isHR = role === "hr" || role === "humanresources" || role === "hroperation";
  const effectivePath =
    isTechEd && !TECH_ED_PATHS.includes(path)
      ? "/employee-master"
      : HR_ONLY_PATHS.includes(path) && !isHR
        ? "/"
        : path;

  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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
  } else if (effectivePath === "/budget-allocation" && isTechEd) {
    page = (
      <AppShell>
        <TechEdBudgetAllocationPage />
      </AppShell>
    );
  } else if (effectivePath === BUDGET_DISTRIBUTION_PATH && isHR) {
    page = (
      <AppShell>
        <BudgetDistributionPage />
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
