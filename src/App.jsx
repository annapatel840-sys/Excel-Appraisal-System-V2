import { useEffect, useState } from "react";

import { AppraisalProvider } from "@/lib/appraisal-store";
import { BudgetProvider } from "@/lib/budget-store";
import { Dashboard } from "@/routes/index";
import { SheetPage } from "@/routes/sheet";
import { EmployeeMaster } from "@/pages/EmployeeMaster";

//this might be remove later (detailscreen)
import { DetailScreenPage } from "@/components/appraisal/DetailScreenPage";
import { AppShell } from "./components/appraisal/AppShell";
import { CatalystAuthGate, useCatalystUser } from "@/lib/catalyst-auth";

const TECH_ED_PATHS = ["/", "/employee-master", "/detail-screen"];

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
  } else {
    page = <Dashboard />;
  }

  return (
    <AppraisalProvider>
      <BudgetProvider>{page}</BudgetProvider>
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
