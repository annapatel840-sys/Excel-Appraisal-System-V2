import { useEffect, useState } from "react";

import { AppraisalProvider } from "@/lib/appraisal-store";
import { AuthGate } from "@/lib/auth-context";
import { Dashboard } from "@/routes/index";
import { SheetPage } from "@/routes/sheet";
import { EmployeeMaster } from "@/pages/EmployeeMaster";

//this might be remove later (detailscreen)
import { DetailScreenPage } from "@/components/appraisal/DetailScreenPage";
import { AppShell } from "./components/appraisal/AppShell";

export default function App() {
  const [path, setPath] = useState(window.location.pathname);

  useEffect(() => {
    const onPopState = () => {
      setPath(window.location.pathname);
    };

    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
    };
  }, []);

  // The Catalyst SDK can redirect to the legacy Web Client path /app/ after login;
  // Slate serves from root, so send those back to the dashboard.
  useEffect(() => {
    if (path === "/app" || path.startsWith("/app/")) {
      window.history.replaceState({}, "", "/");
      setPath("/");
    }
  }, [path]);

  let page;

  if (path === "/sheet") {
    page = <SheetPage />;
  } else if (path === "/employee-master") {
    page = <EmployeeMaster />;
  } else if (path === "/detail-screen") {
    page = (
      <AppShell>
        <DetailScreenPage />
      </AppShell>
    );
  } else {
    page = <Dashboard />;
  }

  return (
    <AuthGate>
      <AppraisalProvider>{page}</AppraisalProvider>
    </AuthGate>
  );
}
