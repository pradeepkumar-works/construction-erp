/**
 * Single sign-on rules: what an ID token must say (another directory, an unverified or outside Google account, a wrong
 * issuer, nonce or authorized party refused), who it signs in (linked once, by a verified email only the first time,
 * never a directory guest or a platform admin, a new person only when the company adds them), domains, who a company
 * that requires SSO still lets use a password (platform admins, guests, the phone app), which sessions stand and which a
 * sister company takes, the browser binding, the provider addresses, the settings and the PKCE checks.
 *
 *   node dist/scripts/sso-test.js
 */
import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { SignJWT, createLocalJWKSet, errors as joseErrors, exportJWK, jwtVerify } from 'jose';
import { SSO_PROBLEMS, domainAllowed, isSsoProblem, normaliseDomain, ssoSettingsProblem } from '@erp/shared';
import {
  BINDING,
  PASSWORD_REFUSED,
  REAL_BASES,
  authorizeUrl,
  bindingHash,
  claimsProblem,
  cookieOf,
  discoveryUrl,
  endpointAllowed,
  flowKey,
  flowSecrets,
  identityOf,
  matchLogin,
  ownSignInMessage,
  passwordRefused,
  phoneMayUsePassword,
  proofAccepted,
  proofClaims,
  proofOfClaims,
  providerBasesFrom,
  sameSignIn,
  sessionStands,
  ssoEnforced,
  ssoRequiredMessage,
  ssoSaveProblem,
  verifyOptions,
  type Claims,
  type MatchFacts,
  type ProvedIdentity,
  type SsoSetup,
} from '../auth/sso-rules';

const tests: [string, () => void | Promise<void>][] = [];
const test = (name: string, fn: () => void | Promise<void>) => tests.push([name, fn]);

const TID = '11111111-2222-3333-4444-555555555555';
const entra: SsoSetup = { provider: 'ENTRA', tenantId: TID, clientId: 'app-1', allowedDomains: ['acme.in'], enforce: false, addNewPeople: false, newPersonRole: null };
const google: SsoSetup = { provider: 'GOOGLE', tenantId: null, clientId: 'g-1', allowedDomains: ['acme.in'], enforce: false, addNewPeople: false, newPersonRole: null };
const bases = REAL_BASES;
const nonce = 'n-123';
// As a directory sends it once its app asks for the optional claims xms_edov and acct (DEPLOY.md).
const entraClaims = (o: Claims = {}): Claims => ({ iss: `https://login.microsoftonline.com/${TID}/v2.0`, tid: TID, oid: 'oid-9', sub: 'pairwise', email: 'Ravi@Acme.in', xms_edov: true, acct: 0, preferred_username: 'ravi@acme.in', name: 'Ravi K', nonce, ...o });
const googleClaims = (o: Claims = {}): Claims => ({ iss: 'https://accounts.google.com', sub: '1077', email: 'ravi@acme.in', email_verified: true, hd: 'acme.in', nonce, ...o });

test('an Entra token from the company directory passes and is the person by tid and oid', () => {
  assert.equal(claimsProblem(entra, entraClaims(), { nonce, bases }), null);
  assert.deepEqual(identityOf(entra, entraClaims()), { issuer: `entra:${TID}`, subject: 'oid-9', email: 'ravi@acme.in', name: 'Ravi K', linkProblem: null });
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

test('an Entra token without oid is refused', () => {
  assert.equal(claimsProblem(entra, entraClaims({ oid: undefined }), { nonce, bases }), 'TOKEN');
});

test('Entra, first link: only an email the directory verified, or a member’s sign-in name; never a guest', () => {
  const id = (o: Claims) => identityOf(entra, entraClaims(o));
  // xms_edov true: the email claim is the directory's verified one.
  assert.deepEqual([id({ preferred_username: 'other@acme.in', acct: undefined }).email, id({ acct: undefined }).linkProblem], ['ravi@acme.in', null]);
  // No xms_edov: a member's preferred_username (its domain is the directory's own), never the typed email.
  assert.deepEqual([id({ xms_edov: undefined, email: 'boss@acme.in' }).email, id({ xms_edov: undefined }).linkProblem], ['ravi@acme.in', null]);
  assert.deepEqual([id({ xms_edov: false }).email, id({ xms_edov: 'true', acct: undefined }).linkProblem], ['ravi@acme.in', 'UNVERIFIED'], 'only the boolean true');
  // Neither: nothing to match by.
  const none = id({ xms_edov: undefined, acct: undefined });
  assert.deepEqual([none.email, none.linkProblem], [null, 'UNVERIFIED']);
  assert.equal(id({ xms_edov: undefined, preferred_username: 'RAVI' }).linkProblem, 'UNVERIFIED');
  // Guests: acct 1, or a #EXT# sign-in name, even with a verified email.
  assert.deepEqual([id({ acct: 1 }).email, id({ acct: 1 }).linkProblem], [null, 'GUEST']);
  assert.equal(id({ acct: undefined, preferred_username: 'ravi_acme.in#EXT#@contoso.onmicrosoft.com' }).linkProblem, 'GUEST');
  // A later sign-in goes by tid:oid whatever the email says.
  assert.deepEqual(matchLogin(facts({ linked: { place: 'ACTIVE' }, identity: none })), { kind: 'LINKED' });
  assert.deepEqual(matchLogin(facts({ identity: none, byEmail: null })), { kind: 'REFUSE', problem: 'UNVERIFIED' });
  assert.deepEqual(matchLogin(facts({ identity: id({ acct: 1 }), byEmail: { place: 'ACTIVE', issuerLinked: false } })), { kind: 'REFUSE', problem: 'GUEST' });
});

test('Google: an unverified email is refused', () => {
  assert.equal(claimsProblem(google, googleClaims({ email_verified: false }), { nonce, bases }), 'UNVERIFIED');
  assert.equal(claimsProblem(google, googleClaims({ email_verified: 'true' }), { nonce, bases }), 'UNVERIFIED', 'only the boolean true counts');
});

test('Google: hd must be one of the domains; a personal account has none', () => {
  assert.equal(claimsProblem(google, googleClaims({ hd: 'other.in' }), { nonce, bases }), 'DOMAIN');
  assert.equal(claimsProblem(google, googleClaims({ hd: undefined, email: 'ravi@gmail.com' }), { nonce, bases }), 'DOMAIN');
  assert.equal(claimsProblem(google, googleClaims({ iss: 'accounts.google.com' }), { nonce, bases }), null, 'Google names itself either way');
  assert.deepEqual(identityOf(google, googleClaims()), { issuer: 'google', subject: '1077', email: 'ravi@acme.in', name: null, linkProblem: null });
});

test('a stand-in provider is reached only through the bases', () => {
  const stand = { entraAuthority: 'http://localhost:4950/entra', googleIssuer: 'http://localhost:4950/google' };
  assert.equal(discoveryUrl(entra, stand), `http://localhost:4950/entra/${TID}/v2.0/.well-known/openid-configuration`);
  assert.equal(discoveryUrl(google, bases), 'https://accounts.google.com/.well-known/openid-configuration');
  assert.equal(claimsProblem(google, googleClaims({ iss: 'accounts.google.com' }), { nonce, bases: stand }), 'TOKEN', 'the bare name is the real Google only');
});

const who = (email: string | null, o: Partial<ProvedIdentity> = {}): ProvedIdentity => ({ issuer: `entra:${TID}`, subject: 'oid-9', email, name: null, linkProblem: null, ...o });
const facts = (o: Partial<MatchFacts>): MatchFacts => ({ setup: entra, identity: who('ravi@acme.in'), platformEmail: false, linked: null, byEmail: null, ...o });

test('a linked identity signs in by its link, whatever its email now says', () => {
  assert.deepEqual(matchLogin(facts({ linked: { place: 'ACTIVE' }, identity: who('someone@else.com') })), { kind: 'LINKED' });
  assert.deepEqual(matchLogin(facts({ linked: { place: 'OFF' } })), { kind: 'REFUSE', problem: 'SWITCHED_OFF' });
  assert.deepEqual(matchLogin(facts({ linked: { place: 'NONE' } })), { kind: 'REFUSE', problem: 'NO_PLACE' });
});

test('a first sign-in links by email in an allowed domain, once', () => {
  assert.deepEqual(matchLogin(facts({ byEmail: { place: 'ACTIVE', issuerLinked: false } })), { kind: 'LINK' });
  assert.deepEqual(matchLogin(facts({ byEmail: { place: 'ACTIVE', issuerLinked: true } })), { kind: 'REFUSE', problem: 'LINKED_ELSEWHERE' }, 'never by email after linking');
  assert.deepEqual(matchLogin(facts({ byEmail: { place: 'NONE', issuerLinked: false } })), { kind: 'REFUSE', problem: 'NO_PLACE' }, "another company's person is not taken over");
  assert.deepEqual(matchLogin(facts({ byEmail: { place: 'OFF', issuerLinked: false } })), { kind: 'REFUSE', problem: 'SWITCHED_OFF' });
  assert.deepEqual(matchLogin(facts({ identity: who('ravi@other.in'), byEmail: { place: 'ACTIVE', issuerLinked: false } })), { kind: 'REFUSE', problem: 'DOMAIN' });
  assert.deepEqual(matchLogin(facts({ identity: who(null) })), { kind: 'REFUSE', problem: 'DOMAIN' });
});

test('a platform admin’s email is never linked or added by a company’s directory', () => {
  assert.deepEqual(matchLogin(facts({ platformEmail: true, byEmail: { place: 'ACTIVE', issuerLinked: false } })), { kind: 'REFUSE', problem: 'PLATFORM' });
  assert.deepEqual(matchLogin(facts({ platformEmail: true, setup: { ...entra, addNewPeople: true, newPersonRole: 'SITE_ENGINEER' } })), { kind: 'REFUSE', problem: 'PLATFORM' });
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

test('requiring SSO refuses passwords, platform admins, client guests and supplier logins aside', () => {
  const on = { enforce: true };
  assert.equal(ssoEnforced(on, { platformAdmin: false, roleKey: 'SITE_ENGINEER' }), true);
  assert.equal(ssoEnforced(on, { platformAdmin: false, roleKey: 'ADMIN' }), true);
  assert.equal(ssoEnforced(on, { platformAdmin: true, roleKey: 'ADMIN' }), false);
  assert.equal(ssoEnforced(on, { platformAdmin: false, roleKey: 'SUPPLIER' }), false);
  assert.equal(ssoEnforced(on, { platformAdmin: false, roleKey: 'CLIENT_ENGINEER' }), false, "the client's engineer is not in the directory");
  assert.equal(ssoEnforced(on, { platformAdmin: false, roleKey: 'CONSULTANT' }), false);
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

test('a sister’s single sign-on never stands for a company that is not the same sign-in, required or not', () => {
  const person = { platformAdmin: false, roleKey: 'PROJECT_MANAGER' };
  const sisterOwnDirectory = { ...entra, tenantId: '99999999-2222-3333-4444-555555555555' };
  // The sister's admin runs its directory, so a person linked there is no proof here.
  assert.equal(proofAccepted({ organizationId: 'B', setup: null }, person, { kind: 'SSO', organizationId: 'A' }, sisterOwnDirectory), false, 'B has no SSO: its own password');
  assert.equal(proofAccepted({ organizationId: 'B', setup: entra }, person, { kind: 'SSO', organizationId: 'A' }, sisterOwnDirectory), false, 'B does not require it, yet another directory is still no proof');
  assert.equal(proofAccepted({ organizationId: 'B', setup: entra }, person, { kind: 'SSO', organizationId: 'A' }, null), false, 'A has stopped SSO');
  assert.equal(proofAccepted({ organizationId: 'B', setup: entra }, person, { kind: 'SSO', organizationId: 'A' }, { ...entra, clientId: 'app-2' }), true, 'the same directory');
  assert.equal(ownSignInMessage({ name: 'Acme Roads', code: 'ROADS' }, null), 'Acme Roads takes its own sign-in. Sign out, then sign in with your email and password.');
  assert.match(ownSignInMessage({ name: 'Acme Roads', code: 'ROADS' }, 'ENTRA'), /company code ROADS\.$/);
});

test('the phone keeps passwords under Require SSO (one rule); a website password session ends', () => {
  const person = { platformAdmin: false, roleKey: 'SITE_ENGINEER' };
  const on = { ...entra, enforce: true };
  assert.equal(phoneMayUsePassword, true, 'PHONE in the design note: refusing on the phone too is this one line');
  assert.equal(passwordRefused(on, person, 'web'), true);
  assert.equal(passwordRefused(on, person, 'phone'), !phoneMayUsePassword);
  assert.equal(proofAccepted({ organizationId: 'A', setup: on }, person, { kind: 'PHONE' }, null), true);
  // Each request: a password session opened before the company required SSO no longer stands on the website.
  assert.equal(sessionStands(on, person, { kind: 'PASSWORD' }), false);
  assert.equal(sessionStands(on, person, { kind: 'PHONE' }), true);
  assert.equal(sessionStands(on, person, { kind: 'SSO', organizationId: 'A' }), true);
  assert.equal(sessionStands(on, { platformAdmin: true, roleKey: 'ADMIN' }, { kind: 'PASSWORD' }), true);
  assert.equal(sessionStands(on, { platformAdmin: false, roleKey: 'CLIENT_ENGINEER' }, { kind: 'PASSWORD' }), true);
  assert.equal(sessionStands({ ...on, enforce: false }, person, { kind: 'PASSWORD' }), true);
  // The token says which: sso, ph or nothing, and reads back the same.
  for (const p of [{ kind: 'PASSWORD' as const }, { kind: 'PHONE' as const }, { kind: 'SSO' as const, organizationId: 'A' }]) assert.deepEqual(proofOfClaims(proofClaims(p)), p);
  assert.deepEqual(proofClaims({ kind: 'PASSWORD' }), {});
  assert.deepEqual(proofOfClaims({ ph: true }), { kind: 'PASSWORD' }, 'only the 1 the server signs');
});

test('the one code is exchanged only in the tab that started the sign-in', () => {
  const b = 'k3V9x1-ZqPaLw_8Rr2Tt5Yy7Uu0Ii4Oo6Pp9Ss1Dd3';
  assert.equal(BINDING.test(b), true);
  for (const bad of ['', 'short', `${b}!`, 'x'.repeat(129)]) assert.equal(BINDING.test(bad), false, bad);
  assert.equal(bindingHash(b), bindingHash(b));
  assert.notEqual(bindingHash(b), bindingHash(`${b}x`));
  assert.equal(bindingHash(b).length, 64);
});

test('the sign-in page’s refusal of a password names no company and no account', () => {
  assert.doesNotMatch(PASSWORD_REFUSED, /company code|signs in with/);
  assert.match(PASSWORD_REFUSED, /^Invalid email or password\. If your company uses single sign-on, choose Use single sign-on/);
});

test('a stand-in is honoured only on this machine and never on a deployed API; endpoints are https', () => {
  const stand = { entra: 'http://localhost:4950/entra', google: 'http://127.0.0.1:4950/google/' };
  assert.deepEqual(providerBasesFrom(stand, false), { entraAuthority: 'http://localhost:4950/entra', googleIssuer: 'http://127.0.0.1:4950/google' });
  assert.deepEqual(providerBasesFrom(stand, true), REAL_BASES, 'deployed: the real providers, whatever is set');
  assert.deepEqual(providerBasesFrom({ entra: 'https://evil.example/entra', google: 'http://10.0.0.5/google' }, false), REAL_BASES, 'only localhost or 127.0.0.1');
  assert.deepEqual(providerBasesFrom({ entra: 'file://localhost/x', google: 'not a url' }, false), REAL_BASES);
  assert.equal(endpointAllowed('https://login.microsoftonline.com/x/oauth2/v2.0/token', REAL_BASES), true);
  assert.equal(endpointAllowed('http://login.microsoftonline.com/x/token', REAL_BASES), false, 'the real providers: https only');
  assert.equal(endpointAllowed('http://localhost:4950/keys', REAL_BASES), false);
  assert.equal(endpointAllowed('http://localhost:4950/keys', providerBasesFrom(stand, false)), true);
  assert.equal(endpointAllowed('http://evil.example/keys', providerBasesFrom(stand, false)), false);
  assert.equal(endpointAllowed(42, REAL_BASES), false);
});

test('changing the provider under Require SSO, or requiring it unproved, is refused', () => {
  const on = { ...entra, enforce: true };
  const may = { newSecret: false, mayRequire: true };
  assert.equal(ssoSaveProblem(on, on, may), null, 'already on and unchanged: no check');
  assert.equal(ssoSaveProblem(on, on, { newSecret: false, mayRequire: false }), null, 'nor for a password session');
  assert.equal(ssoSaveProblem(on, { ...on, allowedDomains: ['acme.com'] } as typeof on, may), null, 'domains are not the provider');
  for (const after of [{ ...on, clientId: 'app-2' }, { ...on, tenantId: '99999999-2222-3333-4444-555555555555' }, { ...on, provider: 'GOOGLE' as const, tenantId: null }])
    assert.match(ssoSaveProblem(on, after, may)!, /^Turn off Require single sign-on, change the settings, sign in through it again, then require it\.$/);
  assert.match(ssoSaveProblem(on, on, { newSecret: true, mayRequire: true })!, /^Turn off Require/, 'a new secret too');
  assert.equal(ssoSaveProblem(on, { ...on, clientId: 'app-2', enforce: false }, may), null, 'turning it off first is fine');
  assert.match(ssoSaveProblem(entra, on, { newSecret: false, mayRequire: false })!, /^Use single sign-on once/);
  assert.equal(ssoSaveProblem(entra, on, may), null);
  assert.match(ssoSaveProblem(entra, { ...on, clientId: 'app-2' }, may)!, /^Save the new settings first/);
  assert.equal(ssoSaveProblem(null, on, may), null, 'a platform admin setting up a required company');
});

test('Google sisters: the proving company’s domains must all be the other’s', () => {
  assert.equal(sameSignIn({ ...google, allowedDomains: ['acme.in'] }, { ...google, allowedDomains: ['acme.in', 'acme.com'] }), true);
  assert.equal(sameSignIn({ ...google, allowedDomains: ['acme.in', 'other.in'] }, { ...google, allowedDomains: ['acme.in'] }), false);
});

test('the refusal says how to sign in instead', () => {
  assert.equal(ssoRequiredMessage({ name: 'Acme Infra', code: 'ACME' }, 'ENTRA'), 'Acme Infra signs in with Microsoft. Choose "Use single sign-on" and enter the company code ACME.');
});

test('the flow key is HKDF of the server key for single sign-on, not the signing key itself', () => {
  assert.equal(flowKey('secret').length, 32);
  assert.notDeepEqual(flowKey('secret'), Buffer.from('secret'));
  assert.deepEqual(flowKey('secret'), flowKey('secret'));
  assert.notDeepEqual(flowKey('secret'), flowKey('secret2'));
  assert.notEqual(flowSecrets('s', flowKey('secret')).verifier, flowSecrets('s', 'secret').verifier);
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

  // The service's own options: issuer, and exp, iat and nonce required.
  const opts = verifyOptions(google, bases);
  const signed = (claims: Claims, withIat = true) => {
    const t = new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setAudience('g-1').setExpirationTime('5m');
    return (withIat ? t.setIssuedAt() : t).sign(good.privateKey);
  };
  await jwtVerify(await signed(googleClaims()), keys, opts);
  await assert.rejects(jwtVerify(await signed(googleClaims({ nonce: undefined })), keys, opts), Error, 'no nonce');
  await assert.rejects(jwtVerify(await signed(googleClaims(), false), keys, opts), Error, 'no iat');
  await assert.rejects(jwtVerify(await signed(googleClaims({ iss: 'https://evil.example' })), keys, opts), Error, 'another issuer');

  // A signed token of another Entra directory fails jose on its issuer; the service reads why from the error's payload,
  // which claimsProblem refuses whatever (the two check the same issuers).
  const other = '99999999-2222-3333-4444-555555555555';
  const t = await new SignJWT(entraClaims({ tid: other, iss: `https://login.microsoftonline.com/${other}/v2.0` }))
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' }).setAudience('app-1').setIssuedAt().setExpirationTime('5m').sign(good.privateKey);
  const failed = await jwtVerify(t, keys, verifyOptions(entra, bases)).then(() => null, (e: unknown) => e);
  assert.ok(failed instanceof joseErrors.JWTClaimValidationFailed && failed.claim === 'iss');
  assert.equal(claimsProblem(entra, failed.payload as Claims, { nonce, bases }), 'TENANT');
  assert.deepEqual(verifyOptions(entra, bases).issuer, [`https://login.microsoftonline.com/${TID}/v2.0`]);
});

test('a token for several audiences must name this app as its authorized party', () => {
  assert.equal(claimsProblem(google, googleClaims({ aud: ['g-1', 'other'] }), { nonce, bases }), 'TOKEN');
  assert.equal(claimsProblem(google, googleClaims({ aud: ['g-1', 'other'], azp: 'g-1' }), { nonce, bases }), null);
  assert.equal(claimsProblem(google, googleClaims({ aud: 'g-1', azp: 'other' }), { nonce, bases }), 'TOKEN', 'an azp that is not this app');
  assert.equal(claimsProblem(google, googleClaims({ aud: 'g-1' }), { nonce, bases }), null);
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
