#!/usr/bin/env node
/**
 * A stand-in OpenID Connect provider for the SSO tests (e2e/tests/sso.spec.ts, the perf probe): Microsoft Entra ID
 * under /entra/<tenant>/v2.0 and Google under /google, with no dependencies. It signs RS256 ID tokens with a key made
 * at start and publishes it at /keys. Its sign-in page asks nothing: it answers for whoever a test registered.
 *
 *   OIDC_PORT=4011 node e2e/oidc/standin.mjs
 *
 * A test registers a client and who signs in through it, by client id:
 *   POST /__client { clientId, clientSecret, claims: { email, oid | sub, tid?, email_verified?, hd?, name? } }
 * `tid` in the claims is the directory the token names (and its issuer), so a token for another tenant is one line.
 * It checks what a real provider checks: the client secret, the redirect URI and the PKCE verifier (S256), and a code
 * is used once.
 */
import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { createServer } from 'node:http';

const PORT = Number(process.env.OIDC_PORT || 4011);
const BASE = process.env.OIDC_BASE || `http://localhost:${PORT}`;
const KID = randomBytes(8).toString('hex');
const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const JWK = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };

/** clientId -> { clientSecret, claims } */
const clients = new Map();
/** code -> what the authorize request asked for */
const codes = new Map();

const b64 = (v) => Buffer.from(typeof v === 'string' ? v : JSON.stringify(v)).toString('base64url');
function jwt(claims) {
  const head = b64({ alg: 'RS256', typ: 'JWT', kid: KID });
  const body = b64(claims);
  return `${head}.${body}.${sign('sha256', Buffer.from(`${head}.${body}`), privateKey).toString('base64url')}`;
}

/** Which provider a path is under: Entra's tenant from the path, or Google. */
function providerOf(path) {
  const m = /^\/entra\/([^/]+)\/(?:v2\.0|oauth2\/v2\.0)/.exec(path);
  if (m) return { kind: 'entra', tenant: m[1], issuer: `${BASE}/entra/${m[1]}/v2.0`, root: `${BASE}/entra/${m[1]}/oauth2/v2.0` };
  if (path.startsWith('/google')) return { kind: 'google', issuer: `${BASE}/google`, root: `${BASE}/google` };
  return null;
}

const send = (res, status, body, headers = {}) => {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => (data += c));
    req.on('end', () => resolve(data));
  });

createServer(async (req, res) => {
  const url = new URL(req.url, BASE);
  const path = url.pathname;
  try {
    if (path === '/__health') return send(res, 200, { ok: true });
    if (path === '/__client' && req.method === 'POST') {
      const { clientId, clientSecret, claims } = JSON.parse(await readBody(req));
      clients.set(clientId, { clientSecret, claims });
      return send(res, 200, { ok: true });
    }
    if (path === '/keys') return send(res, 200, { keys: [JWK] });
    const p = providerOf(path);
    if (!p) return send(res, 404, { error: 'not_found' });

    if (path.endsWith('/.well-known/openid-configuration'))
      return send(res, 200, {
        issuer: p.issuer,
        authorization_endpoint: `${p.root}/authorize`,
        token_endpoint: `${p.root}/token`,
        jwks_uri: `${BASE}/keys`,
        response_types_supported: ['code'],
        id_token_signing_alg_values_supported: ['RS256'],
        code_challenge_methods_supported: ['S256'],
      });

    if (path.endsWith('/authorize')) {
      const q = Object.fromEntries(url.searchParams);
      const back = new URL(q.redirect_uri);
      const client = clients.get(q.client_id);
      if (!client || q.response_type !== 'code' || q.code_challenge_method !== 'S256' || !q.code_challenge) {
        back.searchParams.set('error', 'invalid_request');
        back.searchParams.set('state', q.state ?? '');
      } else {
        const code = randomBytes(24).toString('base64url');
        codes.set(code, { ...q, provider: p, at: Date.now() });
        back.searchParams.set('code', code);
        back.searchParams.set('state', q.state);
      }
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }

    if (path.endsWith('/token') && req.method === 'POST') {
      const f = Object.fromEntries(new URLSearchParams(await readBody(req)));
      const asked = codes.get(f.code);
      codes.delete(f.code);
      const client = asked && clients.get(asked.client_id);
      if (!asked || Date.now() - asked.at > 60_000) return send(res, 400, { error: 'invalid_grant' });
      if (f.client_id !== asked.client_id || f.client_secret !== client?.clientSecret) return send(res, 401, { error: 'invalid_client' });
      if (f.redirect_uri !== asked.redirect_uri) return send(res, 400, { error: 'invalid_grant', error_description: 'redirect_uri' });
      if (createHash('sha256').update(f.code_verifier ?? '').digest('base64url') !== asked.code_challenge)
        return send(res, 400, { error: 'invalid_grant', error_description: 'code_verifier' });
      const now = Math.floor(Date.now() / 1000);
      const who = client.claims;
      const common = { aud: asked.client_id, iat: now, nbf: now, exp: now + 600, nonce: asked.nonce, name: who.name };
      const claims =
        asked.provider.kind === 'entra'
          ? (() => {
              const tid = who.tid ?? asked.provider.tenant;
              return { ...common, iss: `${BASE}/entra/${tid}/v2.0`, tid, oid: who.oid, sub: `pw-${who.oid}`, email: who.email, preferred_username: who.email };
            })()
          : { ...common, iss: `${BASE}/google`, sub: who.sub, email: who.email, email_verified: who.email_verified ?? true, ...(who.hd ? { hd: who.hd } : {}) };
      return send(res, 200, { token_type: 'Bearer', access_token: randomBytes(16).toString('hex'), expires_in: 600, id_token: jwt(claims) });
    }
    return send(res, 404, { error: 'not_found' });
  } catch (e) {
    return send(res, 500, { error: String(e) });
  }
}).listen(PORT, () => console.log(`stand-in OIDC provider on ${BASE}`));
