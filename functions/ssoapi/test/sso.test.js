/* ssoapi end-to-end test: a SAML response signed like Entra's goes through
   /saml/acs and /token with an in-memory Catalyst stub.
   Needs openssl on PATH (creates a throw-away test certificate).
   Run: node test/sso.test.js */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { execFileSync } = require('child_process');
const Module = require('module');
const { SignedXml } = require('xml-crypto');

/* ---------- throw-away IdP certificate ---------- */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssotest-'));
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=Test Entra',
  '-keyout', path.join(dir, 'key.pem'), '-out', path.join(dir, 'cert.pem')], { stdio: 'ignore' });
const KEY = fs.readFileSync(path.join(dir, 'key.pem'), 'utf8');
const CERT = fs.readFileSync(path.join(dir, 'cert.pem'), 'utf8');
execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=Attacker',
  '-keyout', path.join(dir, 'key2.pem'), '-out', path.join(dir, 'cert2.pem')], { stdio: 'ignore' });
const OTHER_KEY = fs.readFileSync(path.join(dir, 'key2.pem'), 'utf8');

const TENANT = 'https://sts.windows.net/11111111-2222-3333-4444-555555555555/';
const SP = 'https://appraisal.example/sso';
const ACS = 'https://proj.development.catalystserverless.in/server/ssoapi/saml/acs';
const APP = 'https://excel-appraisal.onslate.in';
Object.assign(process.env, {
  SAML_IDP_SSO_URL: 'https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/saml2',
  SAML_IDP_ISSUER: TENANT,
  SAML_IDP_CERT: CERT,
  SAML_SP_ENTITY_ID: SP,
  SAML_ACS_URL: ACS,
  APP_URL: APP,
});

/* ---------- Catalyst stub ---------- */
const cache = new Map();
const tokens = [];
const EMPLOYEES = [
  { emp_id: 'EMP0051', emp_name: 'Ashok Kumar', email_id: 'ashok@contoso.com', emp_status: 'Active' },
  { emp_id: 'EMP0099', emp_name: 'Old Leaver', email_id: 'leaver@contoso.com', emp_status: 'Inactive' },
];
const stub = {
  initialize: () => ({
    cache: () => ({ segment: () => ({
      put: async (k, v) => { cache.set(k, v); return {}; },
      getValue: async (k) => cache.get(k) || null,
      delete: async (k) => cache.delete(k),
    }) }),
    zcql: () => ({ executeZCQLQuery: async (sql) => {
      const m = sql.match(/email_id = '([^']*)'/);
      return EMPLOYEES.filter((e) => m && e.email_id === m[1].replace(/''/g, "'")).map((e) => ({ Employee_Master: e }));
    } }),
    userManagement: () => ({ generateCustomToken: async (d) => { tokens.push(d); return { jwt_token: 'JWT-' + d.user_details.email_id, client_id: 'CID', scopes: ['ZOHOCATALYST.tables.rows.ALL'] }; } }),
  }),
};
const origLoad = Module._load;
Module._load = function (req, ...rest) { return req === 'zcatalyst-sdk-node' ? stub : origLoad.call(this, req, ...rest); };
const app = require('../index.js');

/* ---------- SAML response like Entra's (signed assertion) ---------- */
let seq = 0;
function samlResponse({ email = 'ashok@contoso.com', audience = SP, issuer = TENANT, recipient = ACS, minutes = 5, key = KEY, tamper = false } = {}) {
  const now = new Date();
  const later = new Date(now.getTime() + minutes * 60000);
  const aid = '_a' + Date.now() + (seq++);
  let assertion =
    '<Assertion xmlns="urn:oasis:names:tc:SAML:2.0:assertion" ID="' + aid + '" IssueInstant="' + now.toISOString() + '" Version="2.0">' +
    '<Issuer>' + issuer + '</Issuer>' +
    '<Subject><NameID Format="urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress">' + email + '</NameID>' +
    '<SubjectConfirmation Method="urn:oasis:names:tc:SAML:2.0:cm:bearer"><SubjectConfirmationData NotOnOrAfter="' + later.toISOString() + '" Recipient="' + recipient + '"/></SubjectConfirmation></Subject>' +
    '<Conditions NotBefore="' + new Date(now.getTime() - 60000).toISOString() + '" NotOnOrAfter="' + later.toISOString() + '"><AudienceRestriction><Audience>' + audience + '</Audience></AudienceRestriction></Conditions>' +
    '<AttributeStatement>' +
    '<Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/givenname"><AttributeValue>Ashok</AttributeValue></Attribute>' +
    '<Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/surname"><AttributeValue>Kumar</AttributeValue></Attribute>' +
    '<Attribute Name="http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"><AttributeValue>' + email + '</AttributeValue></Attribute>' +
    '</AttributeStatement>' +
    '<AuthnStatement AuthnInstant="' + now.toISOString() + '"><AuthnContext><AuthnContextClassRef>urn:oasis:names:tc:SAML:2.0:ac:classes:Password</AuthnContextClassRef></AuthnContext></AuthnStatement>' +
    '</Assertion>';
  const sig = new SignedXml({ privateKey: key, signatureAlgorithm: 'http://www.w3.org/2001/04/xmldsig-more#rsa-sha256', canonicalizationAlgorithm: 'http://www.w3.org/2001/10/xml-exc-c14n#' });
  sig.addReference({ xpath: "//*[local-name(.)='Assertion']", digestAlgorithm: 'http://www.w3.org/2001/04/xmlenc#sha256',
    transforms: ['http://www.w3.org/2000/09/xmldsig#enveloped-signature', 'http://www.w3.org/2001/10/xml-exc-c14n#'] });
  sig.computeSignature(assertion, { location: { reference: "//*[local-name(.)='Issuer']", action: 'after' } });
  let signed = sig.getSignedXml();
  if (tamper) signed = signed.replace('ashok@contoso.com</NameID>', 'boss@contoso.com</NameID>');
  const xml = '<samlp:Response xmlns:samlp="urn:oasis:names:tc:SAML:2.0:protocol" ID="_r' + aid + '" Version="2.0" IssueInstant="' + now.toISOString() + '" Destination="' + recipient + '">' +
    '<Issuer xmlns="urn:oasis:names:tc:SAML:2.0:assertion">' + issuer + '</Issuer>' +
    '<samlp:Status><samlp:StatusCode Value="urn:oasis:names:tc:SAML:2.0:status:Success"/></samlp:Status>' + signed + '</samlp:Response>';
  return Buffer.from(xml).toString('base64');
}

/* ---------- HTTP helpers ---------- */
let base;
function request(method, p, body, type) {
  return new Promise((resolve, reject) => {
    const data = body == null ? '' : type === 'json' ? JSON.stringify(body) : new URLSearchParams(body).toString();
    const r = http.request(base + p, { method, headers: { 'Content-Type': type === 'json' ? 'application/json' : 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(data) } }, (res) => {
      let out = ''; res.on('data', (c) => (out += c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: out }));
    });
    r.on('error', reject); r.end(data);
  });
}
const fragment = (res) => new URLSearchParams(String(res.headers.location || '').split('#')[1] || '');

let pass = 0, fail = 0;
async function t(name, fn) {
  try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '\n   ', e.message); }
}

(async () => {
  const server = app.listen(0);
  base = 'http://127.0.0.1:' + server.address().port;

  await t('status: enabled when every setting is present', async () => {
    const r = await request('GET', '/status');
    assert.deepStrictEqual(JSON.parse(r.body), { enabled: true });
  });

  await t('metadata: Entity ID and ACS URL', async () => {
    const r = await request('GET', '/saml/metadata');
    assert.strictEqual(r.status, 200);
    assert.ok(r.body.includes('entityID="' + SP + '"'), r.body);
    assert.ok(r.body.includes('Location="' + ACS + '"'), r.body);
  });

  await t('login: redirects to Entra with SAMLRequest and safe RelayState', async () => {
    const r = await request('GET', '/saml/login?next=' + encodeURIComponent('https://evil.example/x'));
    assert.strictEqual(r.status, 302);
    const u = new URL(r.headers.location);
    assert.strictEqual(u.origin + u.pathname, process.env.SAML_IDP_SSO_URL);
    assert.ok(u.searchParams.get('SAMLRequest'));
    assert.strictEqual(u.searchParams.get('RelayState'), '/');
  });

  let code;
  await t('acs: valid response for an active employee -> one-time code, role App User', async () => {
    const r = await request('POST', '/saml/acs', { SAMLResponse: samlResponse(), RelayState: '/sheet' });
    assert.strictEqual(r.status, 303);
    assert.ok(r.headers.location.startsWith(APP + '/#'), r.headers.location);
    const f = fragment(r);
    assert.strictEqual(f.get('sso_error'), null, 'error: ' + f.get('sso_error'));
    code = f.get('sso_code');
    assert.ok(code && code.length >= 20);
    assert.strictEqual(f.get('next'), '/sheet');
    assert.ok(!r.headers.location.includes('JWT-'), 'token must not be in the URL');
    const d = tokens[tokens.length - 1];
    assert.deepStrictEqual(d, { type: 'web', user_details: { email_id: 'ashok@contoso.com', first_name: 'Ashok', last_name: 'Kumar', role_name: 'App User' } });
  });

  await t('token: code gives the JWT once', async () => {
    const r1 = await request('POST', '/token', { code }, 'json');
    assert.strictEqual(r1.status, 200);
    assert.deepStrictEqual(JSON.parse(r1.body), { client_id: 'CID', scopes: 'ZOHOCATALYST.tables.rows.ALL', jwt_token: 'JWT-ashok@contoso.com' });
    const r2 = await request('POST', '/token', { code }, 'json');
    assert.strictEqual(r2.status, 400);
  });

  const reject = async (name, opts, expected) => t(name, async () => {
    const before = tokens.length;
    const r = await request('POST', '/saml/acs', { SAMLResponse: samlResponse(opts) });
    assert.strictEqual(fragment(r).get('sso_error'), expected, r.headers.location);
    assert.strictEqual(tokens.length, before, 'no token may be issued');
  });
  await reject('acs: tampered assertion is rejected', { tamper: true }, 'invalid_response');
  await reject('acs: signed with another key is rejected', { key: OTHER_KEY }, 'invalid_response');
  await reject('acs: wrong audience is rejected', { audience: 'https://other-app' }, 'invalid_response');
  await reject('acs: wrong issuer (other tenant) is rejected', { issuer: 'https://sts.windows.net/other/' }, 'invalid_response');
  await reject('acs: expired assertion is rejected', { minutes: -10 }, 'invalid_response');
  await reject('acs: person not in Employee_Master is refused', { email: 'stranger@contoso.com' }, 'not_employee');
  await reject('acs: inactive employee is refused', { email: 'leaver@contoso.com' }, 'not_employee');

  await t('acs: the same response cannot be replayed', async () => {
    const resp = samlResponse();
    const r1 = await request('POST', '/saml/acs', { SAMLResponse: resp });
    assert.ok(fragment(r1).get('sso_code'));
    const r2 = await request('POST', '/saml/acs', { SAMLResponse: resp });
    assert.strictEqual(fragment(r2).get('sso_error'), 'replayed');
  });

  await t('token: expired code is refused', async () => {
    cache.set('sso_code_' + 'x'.repeat(30), JSON.stringify({ exp: Date.now() - 1, jwt_token: 'J' }));
    const r = await request('POST', '/token', { code: 'x'.repeat(30) }, 'json');
    assert.strictEqual(r.status, 400);
  });

  await t('safePath keeps only same-app paths', async () => {
    const { safePath } = app._test;
    assert.strictEqual(safePath('/sheet?x=1'), '/sheet?x=1');
    for (const bad of ['//evil.com', 'https://evil.com', '/\\evil', 'javascript:alert(1)', '']) assert.strictEqual(safePath(bad), '/');
  });

  server.close();
  fs.rmSync(dir, { recursive: true, force: true });
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})();
