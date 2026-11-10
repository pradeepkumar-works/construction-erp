/**
 * Single sign-on rules: what an ID token must say (another directory, an unverified or outside Google account, a wrong
 * issuer or nonce refused), who it signs in (linked once, by email only the first time, a new person only when the
 * company adds them), domains, who a company that requires SSO still lets use a password (platform admins and supplier
 * logins), which sessions a sister company takes, and the PKCE and settings checks.
 *
 *   node dist/scripts/sso-test.js
 */
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { SignJWT, createLocalJWKSet, exportJWK, jwtVerify } from 'jose';
import { SSO_PROBLEMS, domainAllowed, isSsoProblem, normaliseDomain, ssoSettingsProblem } from '@erp/shared';
import {
  REAL_BASES,
  authorizeUrl,
  claimsProblem,
  cookieOf,
  discoveryUrl,
  flowSecrets,
  identityOf,
  matchLogin,
  proofAccepted,
  sameSignIn,
  ssoEnforced,
  ssoRequiredMessage,
  type Claims,
  type MatchFacts,
  type SsoSetup,
} from '../auth/sso-rules';

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const TID = '11111111-2222-3333-4444-555555555555';
const entra: SsoSetup = { provider: 'ENTRA', tenantId: TID, clientId: 'app-1', allowedDomains: ['acme.in'], enforce: false, addNewPeople: false, newPersonRole: null };
const google: SsoSetup = { provider: 'GOOGLE', tenantId: null, clientId: 'g-1', allowedDomains: ['acme.in'], enforce: false, addNewPeople: false, newPersonRole: null };
const bases = REAL_BASES;
const nonce = 'n-123';
const entraClaims = (o: Claims = {}): Claims => ({ iss: `https://login.microsoftonline.com/${TID}/v2.0`, tid: TID, oid: 'oid-9', sub: 'pairwise', email: 'Ravi@Acme.in', name: 'Ravi K', nonce, ...o });
const googleClaims = (o: Claims = {}): Claims => ({ iss: 'https://accounts.google.com', sub: '1077', email: 'ravi@acme.in', email_verified: true, hd: 'acme.in', nonce, ...o });

test('an Entra token from the company directory passes and is the person by tid and oid', () => {
  assert.equal(claimsProblem(entra, entraClaims(), { nonce, bases }), null);
  assert.deepEqual(identityOf(entra, entraClaims()), { issuer: `entra:${TID}`, subject: 'oid-9', email: 'ravi@acme.in', name: 'Ravi K' });
});

test('a token for another tenant is refused as TENANT, even when its issuer names that tenant', () => {
  const other = '99999999-2222-3333-4444-555555555555';
  assert.equal(claimsProblem(entra, entraClaims({ tid: other, iss: `https://login.microsoftonline.com/${other}/v2.0` }), { nonce, bases }), 'TENANT');
  assert.equal(claimsProblem(entra, entraClaims({ tid: undefined }), { nonce, bases }), 'TENANT');
});

test('a wrong issuer or nonce is refused', () => {
  assert.equal(claimsProblem(entra, entraClaims({ iss: 'https://evil.example/v2.0' }), { nonce, bases }), 'TOKEN');
  assert.equal(claimsProblem(entra, entraClaims({ nonce: 'replayed' }), { nonce, bases }), 'TOKEN');
  assert.equal(claimsProblem(google, googleClaims({ nonce: undefined }), { nonce, bases }), 'TOKEN');
});

test('an Entra token without oid is refused; its email falls back to preferred_username', () => {
  assert.equal(claimsProblem(entra, entraClaims({ oid: undefined }), { nonce, bases }), 'TOKEN');
  assert.equal(identityOf(entra, entraClaims({ email: undefined, preferred_username: 'ravi@acme.in' })).email, 'ravi@acme.in');
  assert.equal(identityOf(entra, entraClaims({ email: undefined, preferred_username: 'RAVI' })).email, null);
});

test('Google: an unverified email is refused', () => {
  assert.equal(claimsProblem(google, googleClaims({ email_verified: false }), { nonce, bases }), 'UNVERIFIED');
  assert.equal(claimsProblem(google, googleClaims({ email_verified: 'true' }), { nonce, bases }), 'UNVERIFIED', 'only the boolean true counts');
});

test('Google: hd must be one of the domains; a personal account has none', () => {
  assert.equal(claimsProblem(google, googleClaims({ hd: 'other.in' }), { nonce, bases }), 'DOMAIN');
  assert.equal(claimsProblem(google, googleClaims({ hd: undefined, email: 'ravi@gmail.com' }), { nonce, bases }), 'DOMAIN');
  assert.equal(claimsProblem(google, googleClaims({ iss: 'accounts.google.com' }), { nonce, bases }), null, 'Google names itself either way');
  assert.deepEqual(identityOf(google, googleClaims()), { issuer: 'google', subject: '1077', email: 'ravi@acme.in', name: null });
});

test('a stand-in provider is reached only through the bases', () => {
  const stand = { entraAuthority: 'http://localhost:4950/entra', googleIssuer: 'http://localhost:4950/google' };
  assert.equal(discoveryUrl(entra, stand), `http://localhost:4950/entra/${TID}/v2.0/.well-known/openid-configuration`);
  assert.equal(discoveryUrl(google, bases), 'https://accounts.google.com/.well-known/openid-configuration');
  assert.equal(claimsProblem(google, googleClaims({ iss: 'accounts.google.com' }), { nonce, bases: stand }), 'TOKEN', 'the bare name is the real Google only');
});

const facts = (o: Partial<MatchFacts>): MatchFacts => ({ setup: entra, identity: { issuer: `entra:${TID}`, subject: 'oid-9', email: 'ravi@acme.in', name: null }, linked: null, byEmail: null, ...o });

test('a linked identity signs in by its link, whatever its email now says', () => {
  assert.deepEqual(matchLogin(facts({ linked: { place: 'ACTIVE' }, identity: { issuer: 'x', subject: 'y', email: 'someone@else.com', name: null } })), { kind: 'LINKED' });
  assert.deepEqual(matchLogin(facts({ linked: { place: 'OFF' } })), { kind: 'REFUSE', problem: 'SWITCHED_OFF' });
  assert.deepEqual(matchLogin(facts({ linked: { place: 'NONE' } })), { kind: 'REFUSE', problem: 'NO_PLACE' });
});

test('a first sign-in links by email in an allowed domain, once', () => {
  assert.deepEqual(matchLogin(facts({ byEmail: { place: 'ACTIVE', issuerLinked: false } })), { kind: 'LINK' });
  assert.deepEqual(matchLogin(facts({ byEmail: { place: 'ACTIVE', issuerLinked: true } })), { kind: 'REFUSE', problem: 'LINKED_ELSEWHERE' }, 'never by email after linking');
  assert.deepEqual(matchLogin(facts({ byEmail: { place: 'NONE', issuerLinked: false } })), { kind: 'REFUSE', problem: 'NO_PLACE' }, "another company's person is not taken over");
  assert.deepEqual(matchLogin(facts({ byEmail: { place: 'OFF', issuerLinked: false } })), { kind: 'REFUSE', problem: 'SWITCHED_OFF' });
  assert.deepEqual(matchLogin(facts({ identity: { issuer: 'x', subject: 'y', email: 'ravi@other.in', name: null }, byEmail: { place: 'ACTIVE', issuerLinked: false } })), { kind: 'REFUSE', problem: 'DOMAIN' });
  assert.deepEqual(matchLogin(facts({ identity: { issuer: 'x', subject: 'y', email: null, name: null } })), { kind: 'REFUSE', problem: 'DOMAIN' });
});

test('someone new is added only when the company adds new people, in its role', () => {
  assert.deepEqual(matchLogin(facts({})), { kind: 'REFUSE', problem: 'NO_PLACE' });
  assert.deepEqual(matchLogin(facts({ setup: { ...entra, addNewPeople: true, newPersonRole: 'SITE_ENGINEER' } })), { kind: 'ADD' });
  assert.deepEqual(matchLogin(facts({ setup: { ...entra, addNewPeople: true, newPersonRole: null } })), { kind: 'REFUSE', problem: 'NO_PLACE' });
});

test('domains: exact, lower case, a subdomain is its own', () => {
  assert.equal(domainAllowed('A@ACME.IN', ['acme.in']), true);
  assert.equal(domainAllowed('a@site.acme.in', ['acme.in']), false);
  assert.equal(domainAllowed('a@acme.in.evil.com', ['acme.in']), false);
  assert.equal(domainAllowed('acme.in', ['acme.in']), false);
  assert.equal(normaliseDomain(' @Acme.IN '), 'acme.in');
  assert.equal(normaliseDomain('acme'), null);
  assert.equal(normaliseDomain('https://acme.in'), null);
});

test('requiring SSO refuses passwords, platform admins and supplier logins aside', () => {
  const on = { enforce: true };
  assert.equal(ssoEnforced(on, { platformAdmin: false, roleKey: 'SITE_ENGINEER' }), true);
  assert.equal(ssoEnforced(on, { platformAdmin: false, roleKey: 'ADMIN' }), true);
  assert.equal(ssoEnforced(on, { platformAdmin: true, roleKey: 'ADMIN' }), false);
  assert.equal(ssoEnforced(on, { platformAdmin: false, roleKey: 'SUPPLIER' }), false);
  assert.equal(ssoEnforced({ enforce: false }, { platformAdmin: false, roleKey: 'SITE_ENGINEER' }), false);
  assert.equal(ssoEnforced(null, { platformAdmin: false, roleKey: 'SITE_ENGINEER' }), false);
});

test('a company that requires SSO takes its own sign-in, or a sister on the same directory', () => {
  const person = { platformAdmin: false, roleKey: 'PROJECT_MANAGER' };
  const a = { organizationId: 'A', setup: { ...entra, enforce: true } };
  assert.equal(proofAccepted(a, person, { kind: 'PASSWORD' }, null), false);
  assert.equal(proofAccepted(a, person, { kind: 'SSO', organizationId: 'A' }, null), true);
  assert.equal(proofAccepted(a, person, { kind: 'SSO', organizationId: 'B' }, { ...entra, clientId: 'app-2' }), true, 'same tenant');
  assert.equal(proofAccepted(a, person, { kind: 'SSO', organizationId: 'B' }, { ...entra, tenantId: 'other' }), false);
  assert.equal(proofAccepted(a, person, { kind: 'SSO', organizationId: 'B' }, google), false);
  assert.equal(proofAccepted({ organizationId: 'C', setup: google }, person, { kind: 'PASSWORD' }, null), true, 'not required: passwords stand');
  assert.equal(proofAccepted(a, { platformAdmin: true, roleKey: 'ADMIN' }, { kind: 'PASSWORD' }, null), true);
});

test('Google sisters: the proving company’s domains must all be the other’s', () => {
  assert.equal(sameSignIn({ ...google, allowedDomains: ['acme.in'] }, { ...google, allowedDomains: ['acme.in', 'acme.com'] }), true);
  assert.equal(sameSignIn({ ...google, allowedDomains: ['acme.in', 'other.in'] }, { ...google, allowedDomains: ['acme.in'] }), false);
});

test('the refusal says how to sign in instead', () => {
  assert.equal(ssoRequiredMessage({ name: 'Acme Infra', code: 'ACME' }, 'ENTRA'), 'Acme Infra signs in with Microsoft. Choose "Use single sign-on" and enter the company code ACME.');
});

test('PKCE: verifier and nonce come from the state and the key, the challenge is S256', () => {
  const a = flowSecrets('state-1', 'key');
  assert.equal(a.verifier.length, 43);
  assert.equal(a.challenge, createHash('sha256').update(a.verifier).digest('base64url'));
  assert.notEqual(a.nonce, a.verifier);
  assert.deepEqual(flowSecrets('state-1', 'key'), a);
  assert.notEqual(flowSecrets('state-1', 'other key').verifier, a.verifier, 'the state alone gives nothing away');
  assert.notEqual(flowSecrets('state-2', 'key').verifier, a.verifier);
});

test('the authorize link asks for a code with PKCE', () => {
  const u = new URL(authorizeUrl('https://login.example/authorize?x=1', { ...google, allowedDomains: ['acme.in'] }, { redirectUri: 'https://api/cb', state: 's', nonce: 'n', challenge: 'c' }));
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('code_challenge'), 'c');
  assert.equal(u.searchParams.get('scope'), 'openid email profile');
  assert.equal(u.searchParams.get('hd'), 'acme.in');
  assert.equal(u.searchParams.get('x'), '1');
  assert.equal(new URL(authorizeUrl('https://l/a', entra, { redirectUri: 'r', state: 's', nonce: 'n', challenge: 'c' })).searchParams.get('hd'), null);
});

test('settings: tenant GUID, client, secret once, domains, a staff role for new people', () => {
  const ok = { provider: 'ENTRA' as const, tenantId: TID, clientId: 'c', clientSecret: 's', allowedDomains: ['acme.in'], enforce: false, addNewPeople: false };
  assert.equal(ssoSettingsProblem(ok, false), null);
  assert.match(ssoSettingsProblem({ ...ok, tenantId: 'acme' }, false)!, /tenant/);
  assert.match(ssoSettingsProblem({ ...ok, clientSecret: '' }, false)!, /secret/);
  assert.equal(ssoSettingsProblem({ ...ok, clientSecret: '' }, true), null, 'a saved secret stays');
  assert.match(ssoSettingsProblem({ ...ok, allowedDomains: [] }, false)!, /domain/);
  assert.match(ssoSettingsProblem({ ...ok, allowedDomains: ['acme'] }, false)!, /not a domain/);
  assert.match(ssoSettingsProblem({ ...ok, addNewPeople: true, newPersonRole: 'ADMIN' }, false)!, /role/);
  assert.equal(ssoSettingsProblem({ ...ok, addNewPeople: true, newPersonRole: 'SITE_ENGINEER' }, false), null);
  assert.equal(ssoSettingsProblem({ ...ok, provider: 'GOOGLE', tenantId: null }, false), null);
});

test('problem keys are read only when they are the list’s own', () => {
  assert.equal(isSsoProblem('TENANT'), true);
  assert.equal(isSsoProblem('toString'), false);
  assert.equal(isSsoProblem('__proto__'), false);
  for (const words of Object.values(SSO_PROBLEMS)) assert.match(words, /\.$/);
});

test('the state cookie is read by its name only', () => {
  assert.equal(cookieOf('a=1; nirmaan_sso=abc%3D; b=2', 'nirmaan_sso'), 'abc=');
  assert.equal(cookieOf('xnirmaan_sso=1', 'nirmaan_sso'), null);
  assert.equal(cookieOf(undefined, 'nirmaan_sso'), null);
});

test('jose: a token signed by the provider key verifies; another key or audience does not', async () => {
  const mk = () => generateKeyPairSync('rsa', { modulusLength: 2048 });
  const good = mk();
  const bad = mk();
  const jwk = { ...(await exportJWK(good.publicKey)), kid: 'k1', alg: 'RS256' };
  const keys = createLocalJWKSet({ keys: [jwk] });
  const sign = (key: typeof good.privateKey, aud: string) =>
    new SignJWT(googleClaims()).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setAudience(aud).setIssuedAt().setExpirationTime('5m').sign(key);
  const { payload } = await jwtVerify(await sign(good.privateKey, 'g-1'), keys, { audience: 'g-1', algorithms: ['RS256'] });
  assert.equal(claimsProblem(google, payload as Claims, { nonce, bases }), null);
  await assert.rejects(jwtVerify(await sign(bad.privateKey, 'g-1'), keys, { audience: 'g-1', algorithms: ['RS256'] }));
  await assert.rejects(jwtVerify(await sign(good.privateKey, 'someone-else'), keys, { audience: 'g-1', algorithms: ['RS256'] }));
  const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${Buffer.from(JSON.stringify(googleClaims({ aud: 'g-1' }))).toString('base64url')}.`;
  await assert.rejects(jwtVerify(none, keys, { audience: 'g-1', algorithms: ['RS256'] }), Error, 'an unsigned token never passes');
});

void (async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`ok   ${name}`);
    } catch (e) {
      failed++;
      console.error(`FAIL ${name}\n     ${(e as Error).message}`);
    }
  }
  console.log(`\n${tests.length - failed} of ${tests.length} passed`);
  if (failed) process.exit(1);
})();
