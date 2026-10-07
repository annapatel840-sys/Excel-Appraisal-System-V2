/* =====================================================================
   ssoapi — Microsoft Entra ID (Azure AD) SAML single sign-on for the app.

   This function is the SAML Service Provider (SP). Entra signs the user in,
   posts a signed SAML response to /saml/acs, and this function:
     1. checks the signature (Entra certificate), issuer, audience, times;
     2. accepts only an Active employee in Employee_Master (email_id);
     3. creates a Catalyst custom token (Third-party authentication) and
        hands it to the app through a one-time code (never in the URL).
   The app then calls catalyst.auth.signinWithJwt() with that token.

   Endpoints (/server/ssoapi/...):
     GET  /status          { enabled } — the sign-in page shows the Microsoft button
     GET  /saml/metadata   SP metadata XML (upload to Entra, or copy its values)
     GET  /saml/login      start sign-in (SP-initiated); ?next=/path
     POST /saml/acs        Assertion Consumer Service — Entra posts here
     POST /token           { code } -> { client_id, scopes, jwt_token }, once

   Settings (environment variables, catalyst-config.json or console):
     SAML_IDP_SSO_URL     Entra "Login URL"  https://login.microsoftonline.com/<tenant>/saml2
     SAML_IDP_ISSUER      Entra "Microsoft Entra Identifier"  https://sts.windows.net/<tenant>/
     SAML_IDP_CERT        Entra "Certificate (Base64)" — PEM text or just the base64 body
     SAML_SP_ENTITY_ID    this app's Identifier (Entity ID); same value in Entra
     SAML_ACS_URL         https://<project-domain>/server/ssoapi/saml/acs ; same in Entra "Reply URL"
     APP_URL              the Slate app, e.g. https://xxxx.onslate.in
     SSO_NEW_USER_ROLE    Catalyst role for users signing in the first time (default "App User")
   ===================================================================== */
'use strict';

const crypto = require('crypto');
const express = require('express');
const catalyst = require('zcatalyst-sdk-node');
const { SAML, generateServiceProviderMetadata } = require('@node-saml/node-saml');

const app = express();
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(express.json({ limit: '16kb' }));

const CODE_TTL_MS = 2 * 60 * 1000;          // the app must redeem the code within 2 minutes
const CLOCK_SKEW_MS = 3 * 60 * 1000;        // tolerated clock difference with Entra
const MAX_ASSERTION_AGE_MS = 10 * 60 * 1000;

const EMAIL_CLAIMS = [
  'email',
  'mail',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name',
  'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/upn',
];
const FIRST_NAME_CLAIM = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname';
const LAST_NAME_CLAIM = 'http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname';

function env(name) {
  return String(process.env[name] || '').trim();
}

function settings() {
  return {
    idpSsoUrl: env('SAML_IDP_SSO_URL'),
    idpIssuer: env('SAML_IDP_ISSUER'),
    idpCert: env('SAML_IDP_CERT'),
    spEntityId: env('SAML_SP_ENTITY_ID'),
    acsUrl: env('SAML_ACS_URL'),
    appUrl: env('APP_URL').replace(/\/+$/, ''),
    newUserRole: env('SSO_NEW_USER_ROLE') || 'App User',
  };
}

function missingSettings(s) {
  const need = {
    SAML_IDP_SSO_URL: s.idpSsoUrl,
    SAML_IDP_ISSUER: s.idpIssuer,
    SAML_IDP_CERT: s.idpCert,
    SAML_SP_ENTITY_ID: s.spEntityId,
    SAML_ACS_URL: s.acsUrl,
    APP_URL: s.appUrl,
  };
  return Object.keys(need).filter((k) => !need[k]);
}

// Entra's certificate as a single base64 body (node-saml accepts PEM or body).
function certBody(cert) {
  return cert.replace(/-----(BEGIN|END) CERTIFICATE-----/g, '').replace(/\s+/g, '');
}

function samlFor(s) {
  return new SAML({
    entryPoint: s.idpSsoUrl,
    idpIssuer: s.idpIssuer,
    idpCert: certBody(s.idpCert),
    issuer: s.spEntityId,
    audience: s.spEntityId,
    callbackUrl: s.acsUrl,
    wantAssertionsSigned: true,          // Entra signs the assertion by default
    wantAuthnResponseSigned: false,
    acceptedClockSkewMs: CLOCK_SKEW_MS,
    maxAssertionAgeMs: MAX_ASSERTION_AGE_MS,
    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    disableRequestedAuthnContext: true,  // let Entra use MFA / passwordless as configured
  });
}

// Only same-app relative paths: "/sheet", not "https://evil" or "//evil".
function safePath(value) {
  const p = String(value || '').trim();
  return /^\/(?!\/)[\w\-./?=&%#]*$/.test(p) && !p.includes('\\') ? p : '/';
}

function emailOf(profile) {
  const candidates = EMAIL_CLAIMS.map((k) => profile[k]).concat(profile.nameID);
  const found = candidates.map((v) => (Array.isArray(v) ? v[0] : v)).find((v) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v || '').trim()));
  return found ? String(found).trim().toLowerCase() : '';
}

function claim(profile, key) {
  const v = profile[key];
  return String((Array.isArray(v) ? v[0] : v) || '').trim();
}

function q(v) {
  return String(v).replace(/'/g, "''");
}

async function activeEmployee(adminApp, email) {
  const rows = await adminApp
    .zcql()
    .executeZCQLQuery(
      "SELECT emp_id, emp_name, email_id, emp_status FROM Employee_Master WHERE email_id = '" + q(email) + "'",
    );
  const list = (rows || []).map((r) => r.Employee_Master || r);
  return list.find((r) => String(r.emp_status || '').trim().toLowerCase() === 'active') || null;
}

function redirectToApp(res, s, fragment) {
  // Fragment (#...) never reaches a server or its logs.
  res.redirect(303, (s.appUrl || '/') + '/#' + fragment);
}

function cacheSegment(adminApp) {
  return adminApp.cache().segment();
}

/* ---------------------------------------------------------------------- */

app.get('/status', (req, res) => {
  res.json({ enabled: missingSettings(settings()).length === 0 });
});

app.get('/saml/metadata', (req, res) => {
  const s = settings();
  if (!s.spEntityId || !s.acsUrl) {
    return res.status(503).json({ error: 'Set SAML_SP_ENTITY_ID and SAML_ACS_URL first.' });
  }
  const xml = generateServiceProviderMetadata({
    issuer: s.spEntityId,
    callbackUrl: s.acsUrl,
    identifierFormat: 'urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress',
    wantAssertionsSigned: true,
  });
  res.type('application/xml').send(xml);
});

app.get('/saml/login', async (req, res) => {
  const s = settings();
  const missing = missingSettings(s);
  if (missing.length) {
    return res.status(503).json({ error: 'Single sign-on is not configured: ' + missing.join(', ') });
  }
  try {
    const url = await samlFor(s).getAuthorizeUrlAsync(safePath(req.query.next), undefined, {});
    res.redirect(302, url);
  } catch (e) {
    console.error('SSO login redirect failed', e);
    res.status(500).json({ error: 'Could not start Microsoft sign-in.' });
  }
});

app.post('/saml/acs', async (req, res) => {
  const s = settings();
  if (missingSettings(s).length) return res.status(503).send('Single sign-on is not configured.');

  const samlResponse = String((req.body && req.body.SAMLResponse) || '');
  const next = safePath(req.body && req.body.RelayState);
  if (!samlResponse) return redirectToApp(res, s, 'sso_error=missing_response');

  let profile;
  try {
    ({ profile } = await samlFor(s).validatePostResponseAsync({ SAMLResponse: samlResponse }));
  } catch (e) {
    console.error('SSO: SAML response rejected:', e && e.message);
    return redirectToApp(res, s, 'sso_error=invalid_response');
  }
  if (!profile) return redirectToApp(res, s, 'sso_error=invalid_response');
  // node-saml does not enforce idpIssuer on responses: check the tenant here.
  if (String(profile.issuer || '').trim() !== s.idpIssuer) {
    console.error('SSO: issuer mismatch:', profile.issuer);
    return redirectToApp(res, s, 'sso_error=invalid_response');
  }

  const email = emailOf(profile);
  if (!email) {
    console.error('SSO: no email claim in assertion for', profile.nameID);
    return redirectToApp(res, s, 'sso_error=no_email');
  }

  const adminApp = catalyst.initialize(req, { scope: 'admin' });
  const segment = cacheSegment(adminApp);

  // A SAML response is accepted once (replay protection).
  const replayKey = 'sso_resp_' + crypto.createHash('sha256').update(samlResponse).digest('hex').slice(0, 40);
  try {
    if (await segment.getValue(replayKey)) return redirectToApp(res, s, 'sso_error=replayed');
    await segment.put(replayKey, '1', 1);
  } catch (e) {
    console.error('SSO: cache unavailable', e && e.message);
    return redirectToApp(res, s, 'sso_error=server');
  }

  let employee;
  try {
    employee = await activeEmployee(adminApp, email);
  } catch (e) {
    console.error('SSO: Employee_Master lookup failed', e && e.message);
    return redirectToApp(res, s, 'sso_error=server');
  }
  if (!employee) {
    console.warn('SSO: refused (not an active employee):', email);
    return redirectToApp(res, s, 'sso_error=not_employee');
  }

  const parts = String(employee.emp_name || '').trim().split(/\s+/);
  const firstName = claim(profile, FIRST_NAME_CLAIM) || parts[0] || email.split('@')[0];
  const lastName = claim(profile, LAST_NAME_CLAIM) || parts.slice(1).join(' ') || '-';

  let token;
  try {
    token = await adminApp.userManagement().generateCustomToken({
      type: 'web',
      user_details: { email_id: email, first_name: firstName, last_name: lastName, role_name: s.newUserRole },
    });
  } catch (e) {
    console.error('SSO: generateCustomToken failed', e && e.message);
    return redirectToApp(res, s, 'sso_error=token');
  }

  const code = crypto.randomBytes(24).toString('base64url');
  try {
    await segment.put(
      'sso_code_' + code,
      JSON.stringify({
        exp: Date.now() + CODE_TTL_MS,
        client_id: token.client_id,
        scopes: Array.isArray(token.scopes) ? token.scopes.join(',') : String(token.scopes || ''),
        jwt_token: token.jwt_token,
      }),
      1,
    );
  } catch (e) {
    console.error('SSO: could not store sign-in code', e && e.message);
    return redirectToApp(res, s, 'sso_error=server');
  }

  console.log('SSO: signed in', email, '(' + employee.emp_id + ')');
  redirectToApp(res, s, 'sso_code=' + encodeURIComponent(code) + '&next=' + encodeURIComponent(next));
});

app.post('/token', async (req, res) => {
  const code = String((req.body && req.body.code) || '');
  if (!/^[\w-]{20,64}$/.test(code)) return res.status(400).json({ error: 'Invalid sign-in code.' });

  const segment = cacheSegment(catalyst.initialize(req, { scope: 'admin' }));
  const key = 'sso_code_' + code;
  let stored = null;
  try {
    const raw = await segment.getValue(key);
    if (raw) {
      await segment.delete(key);   // one use only
      stored = JSON.parse(raw);
    }
  } catch (e) {
    console.error('SSO: token exchange failed', e && e.message);
    return res.status(500).json({ error: 'Sign-in failed. Try again.' });
  }
  if (!stored || !(stored.exp > Date.now())) {
    return res.status(400).json({ error: 'This sign-in link has expired. Sign in again.' });
  }
  res.set('Cache-Control', 'no-store');
  res.json({ client_id: stored.client_id, scopes: stored.scopes, jwt_token: stored.jwt_token });
});

module.exports = app;
module.exports._test = { safePath, emailOf, certBody, missingSettings, settings };
