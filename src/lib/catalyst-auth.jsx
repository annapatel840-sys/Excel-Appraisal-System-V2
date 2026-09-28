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
    const auth = window.catalyst?.auth;
    if (!auth?.signIn) {
      setMessage(
        "Catalyst authentication is unavailable. Open this app through Catalyst or run it with catalyst serve.",
      );
      setState("error");
      return;
    }

    window.sessionStorage.removeItem(SIGNED_OUT_STORAGE_KEY);
    setMessage("");

    window.requestAnimationFrame(() => {
      auth.signIn("catalyst-login-container", {
        service_url: window.location.origin + "/",
      });
    });
  };

  useEffect(() => {
    if (state !== "signed-out") return;
    const timer = window.setTimeout(signIn, 0);
    return () => window.clearTimeout(timer);
  }, [state]);

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
    <main className="min-h-screen bg-slate-950 px-4 py-8 sm:px-6">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center justify-center">
        <section className="grid w-full overflow-hidden rounded-3xl bg-white shadow-2xl lg:grid-cols-[0.9fr_1.1fr]">
          <div className="hidden bg-slate-900 p-10 text-white lg:flex lg:flex-col lg:justify-between">
            <div>
              <div className="mb-8 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-600 text-xl font-bold">
                EA
              </div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-blue-300">
                R2C Technologies
              </p>
              <h1 className="mt-4 text-4xl font-semibold leading-tight">
                Employee Appraisal Management
              </h1>
              <p className="mt-5 max-w-sm text-sm leading-6 text-slate-300">
                Secure access to appraisal, employee and compensation management.
              </p>
            </div>
            <p className="text-xs text-slate-400">
              Authorized users only • Secure Catalyst authentication
            </p>
          </div>

          <div className="p-6 sm:p-10">
            <div className="mx-auto w-full max-w-md">
              <div className="lg:hidden mb-6 flex h-11 w-11 items-center justify-center rounded-xl bg-blue-600 text-sm font-bold text-white">
                EA
              </div>

              {state === "loading" ? (
                <>
                  <div className="h-7 w-40 animate-pulse rounded bg-slate-200" />
                  <div className="mt-3 h-4 w-64 animate-pulse rounded bg-slate-100" />
                  <div className="mt-8 space-y-4">
                    <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
                    <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
                    <div className="h-11 animate-pulse rounded-xl bg-slate-100" />
                  </div>
                </>
              ) : state === "signed-out" ? (
                <>
                  <h2 className="text-2xl font-semibold tracking-tight text-slate-900">
                    Welcome back
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-slate-500">
                    Sign in with your Catalyst account to continue.
                  </p>

                  {message && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                      {message}
                    </div>
                  )}

                  <div
                    id="catalyst-login-container"
                    aria-label="Catalyst sign in"
                    className="mt-6 min-h-[250px] w-full"
                  />

                  <p className="mt-5 text-center text-xs leading-5 text-slate-400">
                    Your account is authenticated through Zoho Catalyst.
                  </p>
                </>
              ) : (
                <>
                  <h2 className="text-2xl font-semibold text-slate-900">
                    Authentication error
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-red-700">{message}</p>
                  <button
                    className="mt-5 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
                    onClick={() => window.location.reload()}
                    type="button"
                  >
                    Retry
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
