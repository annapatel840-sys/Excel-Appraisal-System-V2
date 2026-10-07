# Microsoft (Entra ID) single sign-on — setup

The `ssoapi` function is the SAML Service Provider for this app. Microsoft Entra ID
signs the user in; `ssoapi` checks the signed response, allows only **Active employees in
Employee_Master** (matched on `email_id`), and starts a Catalyst session through
Catalyst Third-party authentication. The sign-in page then shows **Sign in with Microsoft**.

Below, `<project-domain>` is the Catalyst project domain
(e.g. `excelappraisalmanagement-60090194508.development.catalystserverless.in`) and
`<slate-url>` is the Slate app URL (e.g. `https://xxxx.onslate.in`).

## 1. Values this app gives you (Service Provider)

| Field (Entra / your SAML form) | Value |
|---|---|
| Identifier (Entity ID) / **Issuer** of this app | `https://<slate-url>/sso` (any unique URL; must match `SAML_SP_ENTITY_ID`) |
| Reply URL / **Assertion Consumer Service URL** | `https://<project-domain>/server/ssoapi/saml/acs` |
| Sign on URL (optional) | `https://<project-domain>/server/ssoapi/saml/login` |
| Relay State (optional) | `/` (the page to open after sign-in, a path in the app) |
| Metadata (optional upload) | `https://<project-domain>/server/ssoapi/saml/metadata` |

## 2. Values Microsoft Entra gives you (Identity Provider)

Entra → Enterprise applications → (your app) → Single sign-on → SAML:

| Entra value | Put in |
|---|---|
| Login URL `https://login.microsoftonline.com/<tenant-id>/saml2` | `SAML_IDP_SSO_URL` |
| Microsoft Entra Identifier `https://sts.windows.net/<tenant-id>/` | `SAML_IDP_ISSUER` (keep the trailing `/`) |
| Certificate (Base64) — download, open in Notepad, copy all | `SAML_IDP_CERT` |

In **Attributes & Claims**, keep `emailaddress` (user.mail) and the Unique User Identifier
(user.userprincipalname or user.mail). The email must equal `Employee_Master.email_id`.
Assign the users/groups who may sign in under **Users and groups**.

## 3. Catalyst console

1. **Authentication → Third-party authentication**: enable it (Catalyst requires public
   signup for third-party auth; `ssoapi` still refuses anyone who is not an active employee).
2. Fill the variables in `functions/ssoapi/catalyst-config.json` **before deploying**
   (a deploy replaces the function's environment variables with the file's values):
   `SAML_IDP_SSO_URL`, `SAML_IDP_ISSUER`, `SAML_IDP_CERT`, `SAML_SP_ENTITY_ID`,
   `SAML_ACS_URL`, `APP_URL` (= `https://<slate-url>`), `SSO_NEW_USER_ROLE` (default `App User`).
3. `catalyst deploy --only functions:ssoapi`
4. If API Gateway is enabled, add the route `/server/ssoapi/{path1:(.*)}` → `ssoapi` with
   **no** gateway authentication (Microsoft posts to the ACS URL without a Catalyst session).
5. Authorized Domains must include the Slate URL (CORS) — already needed for the app.
6. Cache: `ssoapi` uses the project's default Cache segment for one-time codes.

## 4. How it works

1. **Sign in with Microsoft** → `/server/ssoapi/saml/login` → Microsoft sign-in page.
2. Microsoft posts the signed response to `/server/ssoapi/saml/acs`. `ssoapi` checks the
   signature (Entra certificate), tenant (issuer), audience, validity times, and that the
   response is not replayed; then the employee check.
3. `ssoapi` creates the Catalyst token and redirects to `<slate-url>/#sso_code=<one-time code>`
   (the token itself is never in a URL; the code works once, for 2 minutes).
4. The app posts the code to `/server/ssoapi/token`, calls `catalyst.auth.signinWithJwt`,
   and continues as a normal signed-in user. Roles/access work as before (HR role, Delegation).

Errors come back as `#sso_error=<reason>` and are shown on the sign-in page
(`not_employee`, `invalid_response`, `replayed`, `no_email`, `token`, `server`).

## 5. Test

`cd functions/ssoapi && npm install && npm test` — signs SAML responses with a throw-away
certificate (needs `openssl`) and checks valid sign-in, tampering, wrong key / tenant /
audience, expiry, replay, non-employees and the one-time code.
