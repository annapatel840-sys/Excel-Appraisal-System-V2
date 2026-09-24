// import { useEffect, useState } from "react";

// import { AppraisalProvider } from "@/lib/appraisal-store";
// import { Dashboard } from "@/routes/index";
// import { SheetPage } from "@/routes/sheet";
// import { EmployeeMaster } from "@/pages/EmployeeMaster";

// //this might be remove later (detailscreen)
// import { DetailScreenPage } from "@/components/appraisal/DetailScreenPage";
// import { AppShell } from "./components/appraisal/AppShell";

// export default function App() {
//   const [path, setPath] = useState(window.location.pathname);

//   useEffect(() => {
//     const onPopState = () => {
//       setPath(window.location.pathname);
//     };

//     window.addEventListener("popstate", onPopState);

//     return () => {
//       window.removeEventListener("popstate", onPopState);
//     };
//   }, []);

//   let page;

//   if (path === "/sheet") {
//     page = <SheetPage />;
//   } else if (path === "/employee-master") {
//     page = <EmployeeMaster />;
//   } else if (path === "/detail-screen") {
//     page = (
//       <AppShell>
//         <DetailScreenPage />
//       </AppShell>
//     );
//   } else {
//     page = <Dashboard />;
//   }

//   return <AppraisalProvider>{page}</AppraisalProvider>;
// }

import { useEffect, useState } from "react";

import { AppraisalProvider } from "@/lib/appraisal-store";
import { AuthProvider, AuthGate, useAuth } from "@/lib/auth-store";
import { Dashboard } from "@/routes/index";
import { SheetPage } from "@/routes/sheet";
import { EmployeeMaster } from "@/pages/EmployeeMaster";

//this might be remove later (detailscreen)
import { DetailScreenPage } from "@/components/appraisal/DetailScreenPage";
import { AppShell } from "./components/appraisal/AppShell";

const KNOWN_PATHS = ["/", "/sheet", "/employee-master", "/detail-screen"];

function PageRouter({ path }) {
  const { permissions } = useAuth();

  // unknown URLs fall back to the dashboard (same as before)
  const currentPath = KNOWN_PATHS.includes(path) ? path : "/";

  if (!permissions?.pages?.includes(currentPath)) {
    return (
      <AppShell>
        <div className="rounded-md border bg-white p-6 text-sm">
          Your role does not have access to this page.
        </div>
      </AppShell>
    );
  }

  if (currentPath === "/sheet") {
    return <SheetPage />;
  }

  if (currentPath === "/employee-master") {
    return <EmployeeMaster />;
  }

  if (currentPath === "/detail-screen") {
    return (
      <AppShell>
        <DetailScreenPage />
      </AppShell>
    );
  }

  return <Dashboard />;
}

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

  return (
    <AuthProvider>
      <AuthGate>
        {/* AppraisalProvider loads data, so it mounts only AFTER login */}
        <AppraisalProvider>
          <PageRouter path={path} />
        </AppraisalProvider>
      </AuthGate>
    </AuthProvider>
  );
}
