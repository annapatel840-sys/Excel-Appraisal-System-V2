import { createContext, useContext, useEffect, useState } from "react";

import { payrollCycleRequest } from "./payroll-cycle-api";

const CatalystAuthContext = createContext(null);
const SIGNED_OUT_STORAGE_KEY = "catalyst-app-signed-out";

export function useCatalystUser() {
  return useContext(CatalystAuthContext)?.user ?? null;
}

export function useCatalystSignOut() {
  return useContext(CatalystAuthContext)?.signOut;
}

export function CatalystAuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("");
  const [loginReady, setLoginReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      const deadline = Date.now() + 5000;
      while (!window.catalyst?.auth?.isUserAuthenticated && Date.now() < deadline) {
        await new Promise((resolve) => window.setTimeout(resolve, 100));
      }

      if (!mounted) return;
      const auth = window.catalyst?.auth;
      if (!auth?.isUserAuthenticated || !auth?.signIn) {
        setMessage("Catalyst authentication did not initialize. Reload the Slate app or run it with catalyst serve.");
        setState("error");
        return;
      }

      setLoginReady(true);
      if (window.sessionStorage.getItem(SIGNED_OUT_STORAGE_KEY) === "true") {
        setState("signed-out");
        return;
      }

      try {
        await auth.isUserAuthenticated();
      } catch (error) {
        if (!mounted) return;
        if (
          error?.status === 401 ||
          error?.statusCode === 401 ||
          error?.response?.status === 401 ||
          error?.code === 700
        ) {
          setState("signed-out");
          return;
        }
        setMessage(
          error?.message ||
            "Unable to verify your Catalyst session. Check your connection and retry.",
        );
        setState("error");
        return;
      }

      try {
        const session = await payrollCycleRequest("session");
        if (mounted) {
          setUser(session);
          setState("authenticated");
        }
      } catch (error) {
        if (!mounted) return;
        setMessage(error.message);
        setState("error");
      }
    };

    checkSession();

    return () => {
      mounted = false;
    };
  }, []);

  const signIn = () => {
    if (!window.catalyst?.auth?.signIn) {
      setMessage(
        "Catalyst authentication is unavailable. Open this app through Catalyst or run it with catalyst serve.",
      );
      setState("error");
      return;
    }

    window.sessionStorage.removeItem(SIGNED_OUT_STORAGE_KEY);
    setMessage("");
    window.catalyst.auth.signIn("catalyst-login-container", {
      redirect_url: "/",
    });
  };

  const signOut = async () => {
    const auth = window.catalyst?.auth;
    if (!auth?.signOut) {
      setMessage("Catalyst sign out is unavailable. Reload the Slate app and try again.");
      setState("error");
      return;
    }

    window.sessionStorage.setItem(SIGNED_OUT_STORAGE_KEY, "true");
    try {
      await auth.signOut(window.location.origin);
      setUser(null);
      setMessage(
        "You are signed out of this app. The Catalyst backend session may remain active because Slate and the API use separate origins.",
      );
      setState("signed-out");
    } catch (error) {
      window.sessionStorage.removeItem(SIGNED_OUT_STORAGE_KEY);
      setMessage(error?.message || "Unable to sign out of Catalyst.");
      setState("error");
    }
  };

  if (state === "authenticated") {
    return (
      <CatalystAuthContext.Provider value={{ user, signOut }}>
        {children}
      </CatalystAuthContext.Provider>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-xl border bg-white p-6 shadow-sm">
        <h1 className="text-lg font-semibold text-slate-900">
          Employee Appraisal Management
        </h1>
        {state === "loading" ? (
          <p className="mt-3 text-sm text-slate-600">Checking your session…</p>
        ) : state === "signed-out" ? (
          <>
            <p className="mt-3 text-sm text-slate-600">
              Sign in with your Catalyst account to continue.
            </p>
            {message && <p className="mt-3 text-sm text-amber-800">{message}</p>}
            <button
              className="mt-4 rounded-md bg-blue-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              disabled={!loginReady}
              onClick={signIn}
              type="button"
            >
              Sign in
            </button>
            <div id="catalyst-login-container" className="mt-4" />
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-red-700">{message}</p>
            <button
              className="mt-4 rounded-md border px-4 py-2 text-sm font-medium text-slate-700"
              onClick={() => window.location.reload()}
              type="button"
            >
              Retry
            </button>
          </>
        )}
      </section>
    </main>
  );
}
