import { createContext, useContext, useEffect, useState } from "react";

import { getCurrentUser, redirectToLogin } from "@/lib/catalyst-auth";

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthGate({ children }) {
  const [state, setState] = useState({ status: "loading", user: null, error: null });

  useEffect(() => {
    let cancelled = false;

    getCurrentUser()
      .then((user) => {
        if (cancelled) return;

        if (user) {
          setState({ status: "authenticated", user, error: null });
        } else {
          redirectToLogin();
        }
      })
      .catch((error) => {
        if (!cancelled) setState({ status: "error", user: null, error });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (state.status === "authenticated") {
    return <AuthContext.Provider value={state.user}>{children}</AuthContext.Provider>;
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <p className="text-sm text-muted-foreground">
        {state.status === "error" ? state.error.message : "Checking your session…"}
      </p>
    </div>
  );
}
