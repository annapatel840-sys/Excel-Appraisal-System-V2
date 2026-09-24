import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { clearAuthToken } from "@/lib/api-fetch";
import { LoginPage } from "@/pages/LoginPage";

const ME_URL =
  "https://appraisalperformancehike-60088966704.development.catalystserverless.in/server/employeesapi/me";

const AuthContext = createContext(null);

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside <AuthProvider>.");
  }

  return context;
}

/* status: loading | anonymous | authenticated | denied | error */

export function AuthProvider({ children }) {
  const [state, setState] = useState({
    status: "loading",
    user: null,
    permissions: null,
    message: "",
  });

  const load = useCallback(async () => {
    setState({ status: "loading", user: null, permissions: null, message: "" });

    if (!window.catalyst || !window.catalyst.auth) {
      setState({
        status: "error",
        user: null,
        permissions: null,
        message:
          "Catalyst Web SDK did not load. Check the script tags in index.html (and open the deployed app, not plain localhost).",
      });
      return;
    }

    // 1) Is there a Catalyst login session?
    try {
      await window.catalyst.auth.isUserAuthenticated();
    } catch {
      setState({
        status: "anonymous",
        user: null,
        permissions: null,
        message: "",
      });
      return;
    }

    // 2) Ask the backend who this is and what the role may do
    try {
      const response = await fetch(ME_URL, { cache: "no-store" });
      const data = await response.json().catch(() => ({}));

      if (response.status === 401) {
        setState({
          status: "anonymous",
          user: null,
          permissions: null,
          message: "",
        });
        return;
      }

      if (!response.ok || !data.success) {
        setState({
          status: "denied",
          user: null,
          permissions: null,
          message: data.message || "You do not have access to this app.",
        });
        return;
      }

      setState({
        status: "authenticated",
        user: data.user,
        permissions: data.permissions,
        message: "",
      });
    } catch (error) {
      setState({
        status: "error",
        user: null,
        permissions: null,
        message: error?.message || "Could not verify your login.",
      });
    }
  }, []);

  useEffect(() => {
    load();

    const onUnauthorized = () =>
      setState({
        status: "anonymous",
        user: null,
        permissions: null,
        message: "",
      });

    window.addEventListener("auth:unauthorized", onUnauthorized);

    return () =>
      window.removeEventListener("auth:unauthorized", onUnauthorized);
  }, [load]);

  const logout = useCallback(() => {
    clearAuthToken();
    window.catalyst.auth.signOut(window.location.origin + "/");
  }, []);

  const value = useMemo(
    () => ({ ...state, logout, retry: load }),
    [state, logout, load],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* Shows login / errors; renders the app only when logged in */
export function AuthGate({ children }) {
  const { status, message, logout, retry } = useAuth();

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Checking your login...
      </div>
    );
  }

  if (status === "anonymous") {
    return <LoginPage />;
  }

  if (status === "denied" || status === "error") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="max-w-md text-sm text-red-600">{message}</p>

        <div className="flex gap-2">
          <button
            type="button"
            className="rounded-md border px-3 py-1.5 text-sm"
            onClick={retry}
          >
            Try again
          </button>

          <button
            type="button"
            className="rounded-md bg-[#173b63] px-3 py-1.5 text-sm text-white"
            onClick={logout}
          >
            Log out
          </button>
        </div>
      </div>
    );
  }

  return children;
}
