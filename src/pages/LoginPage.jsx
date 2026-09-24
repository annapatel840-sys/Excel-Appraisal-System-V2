import { useEffect } from "react";

const LOGIN_ELEMENT_ID = "catalyst-login";

export function LoginPage() {
  useEffect(() => {
    const element = document.getElementById(LOGIN_ELEMENT_ID);

    if (element) {
      element.innerHTML = ""; // avoids a double form in React StrictMode
    }

    try {
      // service_url = where Catalyst sends the user after a successful login
      window.catalyst.auth.signIn(LOGIN_ELEMENT_ID, { service_url: "/" });
    } catch (error) {
      console.error("Catalyst signIn failed:", error);
    }
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#173b63] p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <div className="mb-4 text-center">
          <img
            src="/r2c.png"
            alt="RACE2Cloud"
            className="mx-auto mb-2 h-10 w-auto"
          />

          <h1 className="text-base font-semibold text-[#173b63]">
            Employee Appraisal Management
          </h1>

          <p className="text-xs text-muted-foreground">
            Sign in with your work account
          </p>
        </div>

        <div id={LOGIN_ELEMENT_ID} style={{ minHeight: 320 }} />
      </div>
    </div>
  );
}
