import { createContext, useContext, useEffect, useState } from "react";

import { payrollCycleRequest } from "./payroll-cycle-api";

const CatalystAuthContext = createContext(null);

export function useCatalystUser() {
  return useContext(CatalystAuthContext);
}

export function CatalystAuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [state, setState] = useState("loading");
  const [message, setMessage] = useState("");
  const [loginReady, setLoginReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    payrollCycleRequest("session")
      .then((session) => {
        if (mounted) {
          setUser(session);
          setState("authenticated");
        }
      })
      .catch((error) => {
        if (!mounted) return;
        setMessage(error.message);
        setState(error.status === 401 ? "signed-out" : "error");
      });

    const timer = window.setInterval(() => {
      if (window.catalyst?.auth?.signIn) {
        setLoginReady(true);
        window.clearInterval(timer);
      }
    }, 100);

    const timeout = window.setTimeout(() => {
      window.clearInterval(timer);
      setLoginReady(Boolean(window.catalyst?.auth?.signIn));
    }, 5000);

    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.clearTimeout(timeout);
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

    window.catalyst.auth.signIn("catalyst-login-container", {
      redirect_url: `${window.location.origin}${window.location.pathname}`,
    });
  };

  if (state === "authenticated") {
    return (
      <CatalystAuthContext.Provider value={user}>
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
