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

export default function App() {
  const [path, setPath] = useState(window.location.pathname);
  const user = useCatalystUser();
  const role = String(user?.role || "").trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  const isTechEd = role.includes("teched");
  const effectivePath = isTechEd && !["/", "/employee-master", "/detail-screen"].includes(path) ? "/employee-master" : path;

  useEffect(() => {
    const onPopState = () => {
      setPath(window.location.pathname);
    };

    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

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
    <CatalystAuthGate>
      <AppraisalProvider>
        <BudgetProvider>{page}</BudgetProvider>
      </AppraisalProvider>
    </CatalystAuthGate>
  );
}
