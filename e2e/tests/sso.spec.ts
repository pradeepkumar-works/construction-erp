import fs from 'node:fs';
import path from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';
import { SSO_PROBLEMS } from '../../packages/shared/src/sso';
import { API_URL, PASSWORD, api, apiToken, axeViolations, formPanel, homeHeading, measureTargets, pageOverflow, setAppearance, settle, signIn } from './helpers';

/**
 * Single sign-on (item 195, ARCHITECTURE "Single sign-on") against the stand-in provider (e2e/oidc/standin.mjs at
 * E2E_OIDC_URL, the API's SSO_ENTRA_AUTHORITY and SSO_GOOGLE_ISSUER pointing at it). Every company here is this
 * spec's own, signed up for the run; nothing of the demo companies changes. The platform admin's company is the one row
 * kept between runs (its email is on PLATFORM_ADMIN_EMAILS), and it only ever requires SSO.
 */
const OIDC = process.env.E2E_OIDC_URL ?? 'http://localhost:4011';
const SHOTS = process.env.SSO_SHOTS ?? path.resolve(__dirname, '../test-results/sso');
const PLATFORM_EMAIL = 'sso-staff@nirmaan-e2e.in';
const TID = '7a1c0e52-3b4d-4e6f-8a9b-0c1d2e3f4a5b';
const OTHER_TID = '0f9e8d7c-6b5a-4c3d-9e2f-1a0b9c8d7e6f';
const tag = Date.now().toString(36);
const domain = `sso-${tag}.in`;
const admin = { email: `admin@${domain}`, name: 'Meera Sso' };

fs.mkdirSync(SHOTS, { recursive: true });
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(SHOTS, name), fullPage: true });

interface Company {
  code: string;
  clientId: string;
  secret: string;
}

/** A company of this spec's own, its admin signed in by password. */
async function signUp(name: string, email: string, fullName: string): Promise<string> {
  const res = await fetch(`${API_URL}/auth/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationName: name, fullName, email, password: PASSWORD }) });
  if (res.status === 409) return apiToken(email);
  expect(res.ok, `sign up ${name}: ${res.status}`).toBe(true);
  return ((await res.json()) as { accessToken: string }).accessToken;
}

/** Who the stand-in signs in through a client, from now on. */
async function standIn(c: Company, claims: Record<string, unknown>) {
  const res = await fetch(`${OIDC}/__client`, { method: 'POST', body: JSON.stringify({ clientId: c.clientId, clientSecret: c.secret, claims }) });
  expect(res.ok, 'the stand-in provider answers').toBe(true);
}

/** The sign-in page's single sign-on, in a browser of its own, up to the provider's answer. */
async function ssoSignIn(browser: Browser, code: string, provider: 'Microsoft' | 'Google') {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByRole('button', { name: 'Use single sign-on' }).click();
  await page.getByLabel('Company code').fill(code);
  await page.getByRole('button', { name: 'Continue' }).click();
  const callback = page.waitForRequest((r) => r.url().includes('/auth/sso/callback'));
  await page.getByRole('link', { name: `Sign in with ${provider}` }).click();
  return { page, context, callbackUrl: (await callback).url() };
}

const tokenOf = (page: Page) => page.evaluate(() => window.localStorage.getItem('erp_token')!);

/** The one refusal of a password on the sign-in page (`PASSWORD_REFUSED` in apps/api/src/auth/sso-rules.ts). */
const PASSWORD_REFUSED = 'Invalid email or password. If your company uses single sign-on, choose Use single sign-on on the Nirmaan website.';

test.describe.serial('single sign-on', () => {
  let adminToken = '';
  let entra: Company;
  let google: Company;
  let ssoAdminToken = '';

  test.beforeAll(async () => {
    adminToken = await signUp(`Sso Infra ${tag}`, admin.email, admin.name);
    entra = { code: (await api<{ companyCode: string }>(adminToken, '/sso-settings')).companyCode, clientId: `entra-${tag}`, secret: `entra-secret-${tag}-9Xq2` };
    const gToken = await signUp(`Sso Google ${tag}`, `admin@g-${domain}`, 'Ravi Gsso');
    google = { code: (await api<{ companyCode: string }>(gToken, '/sso-settings')).companyCode, clientId: `google-${tag}`, secret: `google-secret-${tag}` };
    await api(gToken, '/sso-settings', { method: 'PUT', body: { provider: 'GOOGLE', clientId: google.clientId, clientSecret: google.secret, allowedDomains: [`g-${domain}`], enforce: false, addNewPeople: false } });
  });

  test('lane 1: a company without single sign-on still signs in with a password', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, admin.email);
    await expect(homeHeading(page)).toContainText('Meera');
    await shot(page, 'sso-password.png');
  });

  test('lane 2: an admin sets up single sign-on and the secret stays hidden', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, admin.email);
    await settle(page, '/company-settings?tab=signin');
    await expect(page.getByText('People sign in with their email and password.')).toBeVisible();
    await page.getByRole('button', { name: 'Set up single sign-on' }).click();
    const dialog = formPanel(page, 'Set up single sign-on');
    await dialog.getByLabel('Directory (tenant) ID').fill(TID);
    await dialog.getByLabel('Client ID').fill(entra.clientId);
    await dialog.getByLabel('Client secret').fill(entra.secret);
    await dialog.getByLabel('Email domains').fill(domain);
    await dialog.getByLabel('Email domains').press('Enter');
    await expect(dialog.getByRole('switch', { name: 'Require single sign-on' })).toBeDisabled();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText(`Saved, ending ${entra.secret.slice(-4)}`)).toBeVisible();
    await expect(page.getByText('Microsoft Entra ID')).toBeVisible();
    expect(await page.content(), 'the secret never reaches the page').not.toContain(entra.secret);
    const dto = await api<Record<string, unknown>>(adminToken, '/sso-settings');
    expect(JSON.stringify(dto), 'nor the API answer').not.toContain(entra.secret);
    await shot(page, 'sso-setup.png');
  });

  test('lane 3: signing in through the provider lands on Home as themselves', async ({ browser }) => {
    await standIn(entra, { email: admin.email, oid: `oid-admin-${tag}`, name: admin.name });
    const { page, context } = await ssoSignIn(browser, entra.code, 'Microsoft');
    await expect(homeHeading(page)).toContainText('Meera');
    ssoAdminToken = await tokenOf(page);
    const me = await api<{ email: string; roleKey: string }>(ssoAdminToken, '/auth/me');
    expect(me).toMatchObject({ email: admin.email, roleKey: 'ADMIN' });
    await shot(page, 'sso-login.png');
    await context.close();
  });

  test('lane 4: a token for another tenant is refused in plain words', async ({ browser }) => {
    await standIn(entra, { email: admin.email, oid: `oid-admin-${tag}`, tid: OTHER_TID });
    const { page, context } = await ssoSignIn(browser, entra.code, 'Microsoft');
    await expect(page.getByRole('heading', { name: 'Single sign-on did not finish' })).toBeVisible();
    await expect(page.getByText(SSO_PROBLEMS.TENANT)).toBeVisible();
    expect(page.url(), 'no code or token left in the address').not.toMatch(/#|code=|token/);
    await shot(page, 'sso-tenant.png');
    await context.close();
  });

  test('lane 5: an unverified Google email is refused', async ({ browser }) => {
    await standIn(google, { email: `admin@g-${domain}`, sub: `g-${tag}`, hd: `g-${domain}`, email_verified: false });
    const { page, context } = await ssoSignIn(browser, google.code, 'Google');
    await expect(page.getByText(SSO_PROBLEMS.UNVERIFIED)).toBeVisible();
    await shot(page, 'sso-unverified.png');
    await context.close();
  });

  test('lane 6: with single sign-on required, a website password is refused in the same words as a wrong one', async ({ browser, page }) => {
    await standIn(entra, { email: admin.email, oid: `oid-admin-${tag}`, name: admin.name });
    const sso = await ssoSignIn(browser, entra.code, 'Microsoft');
    await expect(homeHeading(sso.page)).toBeVisible();
    await settle(sso.page, '/company-settings?tab=signin');
    await sso.page.getByRole('button', { name: 'Change single sign-on' }).click();
    const dialog = formPanel(sso.page, 'Change single sign-on');
    await dialog.getByRole('switch', { name: 'Require single sign-on' }).click();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
    await expect(sso.page.getByText('Yes, website passwords are refused')).toBeVisible();
    ssoAdminToken = await tokenOf(sso.page);
    await sso.context.close();

    // The password session opened before it was required has ended (F4).
    const before = await fetch(`${API_URL}/auth/me`, { headers: { authorization: `Bearer ${adminToken}` } });
    expect(before.status, 'a website password session ends once SSO is required').toBe(401);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/login');
    await page.getByLabel('Email').fill(admin.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    // The same words as a wrong password: nothing about the company or its code (F7).
    await expect(page.locator('.ant-alert-error')).toHaveText(PASSWORD_REFUSED);
    const wrong = await fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: admin.email, password: 'not-the-password' }) });
    const right = await fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: admin.email, password: PASSWORD }) });
    expect([wrong.status, right.status]).toEqual([401, 401]);
    expect(((await right.json()) as { message: string }).message).toBe(((await wrong.json()) as { message: string }).message);
    await expect(page).toHaveURL(/\/login/);
    await shot(page, 'sso-enforced.png');

    // The phone app keeps the password (PHONE): its session is marked so, stands under the requirement, and the
    // website will not take it.
    const phone = await fetch(`${API_URL}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: admin.email, password: PASSWORD, client: 'phone' }) });
    expect(phone.ok, 'the phone still signs in with a password').toBe(true);
    const phoneToken = ((await phone.json()) as { accessToken: string }).accessToken;
    expect(JSON.parse(Buffer.from(phoneToken.split('.')[1], 'base64url').toString())).toMatchObject({ ph: 1 });
    expect((await fetch(`${API_URL}/auth/me`, { headers: { authorization: `Bearer ${phoneToken}` } })).status).toBe(200);
    await page.evaluate((t) => {
      window.localStorage.setItem('erp_token', t);
      document.cookie = `erp_token=${encodeURIComponent(t)}; path=/; max-age=600; SameSite=Lax`;
    }, phoneToken);
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
    expect(await page.evaluate(() => window.localStorage.getItem('erp_token')), 'the website dropped the phone session').toBeNull();
  });

  test('lane 7: a platform admin keeps their password under a company that requires it', async ({ page }) => {
    const staffToken = await signUp(`Sso Staff ${tag}`, PLATFORM_EMAIL, 'Nirmaan Staff');
    const me = await api<{ platformAdmin?: boolean }>(staffToken, '/auth/me');
    expect(me.platformAdmin, `${PLATFORM_EMAIL} is on PLATFORM_ADMIN_EMAILS`).toBe(true);
    // Kept between runs, so last run's requirement comes off before this run's client goes in (a new provider under it is refused).
    const staffSso = { provider: 'ENTRA', tenantId: TID, clientId: `staff-${tag}`, clientSecret: 'staff-secret', allowedDomains: ['nirmaan-e2e.in'], addNewPeople: false };
    const current = await api<{ settings: { clientId: string } | null }>(staffToken, '/sso-settings');
    if (current.settings) await api(staffToken, '/sso-settings', { method: 'PUT', body: { ...staffSso, clientId: current.settings.clientId, clientSecret: undefined, enforce: false } });
    await api(staffToken, '/sso-settings', { method: 'PUT', body: { ...staffSso, enforce: false } });
    await api(staffToken, '/sso-settings', { method: 'PUT', body: { ...staffSso, clientSecret: undefined, enforce: true } });
    await page.setViewportSize({ width: 1440, height: 900 });
    await signIn(page, PLATFORM_EMAIL);
    await expect(homeHeading(page)).toContainText('Nirmaan');
    await shot(page, 'sso-admin.png');
  });

  test('lane 8: someone new from an allowed domain gets the role the company chose', async ({ browser }) => {
    await api(ssoAdminToken, '/sso-settings', { method: 'PUT', body: { provider: 'ENTRA', tenantId: TID, clientId: entra.clientId, allowedDomains: [domain], enforce: true, addNewPeople: true, newPersonRole: 'SITE_ENGINEER' } });
    const email = `kiran@${domain}`;
    await standIn(entra, { email, oid: `oid-kiran-${tag}`, name: 'Kiran Newhire' });
    const { page, context } = await ssoSignIn(browser, entra.code, 'Microsoft');
    await expect(homeHeading(page)).toContainText('Kiran');
    const me = await api<{ email: string; roleKey: string; organizationName: string }>(await tokenOf(page), '/auth/me');
    expect(me).toMatchObject({ email, roleKey: 'SITE_ENGINEER', organizationName: `Sso Infra ${tag}` });
    await shot(page, 'sso-new.png');
    await context.close();
    // Someone outside the domains is not added, whatever the provider says.
    await standIn(entra, { email: `kiran@elsewhere-${tag}.in`, oid: `oid-out-${tag}` });
    const out = await ssoSignIn(browser, entra.code, 'Microsoft');
    await expect(out.page.getByText(SSO_PROBLEMS.DOMAIN)).toBeVisible();

    // Where SSO is required, an invite opens the company's sign-in with its code filled in: no password to set (B4).
    const invited = await api<{ invite: { link: string; sso?: boolean; expiresAt: string | null } }>(ssoAdminToken, '/users', {
      method: 'POST',
      body: { email: `asha@${domain}`, fullName: 'Asha Invite', roleKey: 'SITE_ENGINEER' },
    });
    expect(invited.invite).toMatchObject({ sso: true, expiresAt: null });
    expect(invited.invite.link).toMatch(new RegExp(`/login\\?sso=1&code=${entra.code}$`));
    await out.page.goto(new URL(invited.invite.link).pathname + new URL(invited.invite.link).search);
    await expect(out.page.getByRole('link', { name: 'Sign in with Microsoft' })).toBeVisible();
    await out.context.close();
  });

  test('lane 9: a callback and a one-time code are each used once', async ({ browser }) => {
    await standIn(entra, { email: admin.email, oid: `oid-admin-${tag}`, name: admin.name });
    const { page, context, callbackUrl } = await ssoSignIn(browser, entra.code, 'Microsoft');
    const exchanged = page.waitForRequest((r) => r.url().endsWith('/auth/sso/exchange'));
    await expect(homeHeading(page)).toBeVisible();
    const { code, b } = (await exchanged).postDataJSON() as { code: string; b: string };
    const again = await fetch(`${API_URL}/auth/sso/exchange`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code, b }) });
    expect(again.status, 'the one-time code does not work twice').toBe(400);
    await page.goto(callbackUrl);
    await expect(page.getByText(SSO_PROBLEMS.EXPIRED)).toBeVisible();
    await shot(page, 'sso-replay.png');
    await context.close();
  });

  test('lane 9b: a one-time code made in one browser does not sign in another', async ({ browser }) => {
    await standIn(entra, { email: admin.email, oid: `oid-admin-${tag}`, name: admin.name });
    const maker = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await maker.newPage();
    await page.goto('/login');
    await page.getByRole('button', { name: 'Use single sign-on' }).click();
    await page.getByLabel('Company code').fill(entra.code);
    await page.getByRole('button', { name: 'Continue' }).click();
    // The code the API sends back is the one an attacker would hand someone: keep it unused (the exchange held back)
    // and note the value this tab sent with it.
    let b = '';
    await page.route('**/auth/sso/exchange', async (route) => {
      b = (route.request().postDataJSON() as { b: string }).b;
      await route.abort();
    });
    const answered = page.waitForResponse((r) => r.url().includes('/auth/sso/callback'));
    const started = page.waitForResponse((r) => r.url().includes('/start?b='));
    await page.getByRole('link', { name: 'Sign in with Microsoft' }).click();
    expect(await (await started).headerValue('set-cookie'), 'the state cookie goes only to the SSO routes').toMatch(/nirmaan_sso=[^;]+; Path=\/api\/auth\/sso;.*HttpOnly; SameSite=Lax/);
    const location = (await answered).headers().location ?? '';
    expect(location).toMatch(/\/login\/sso#code=/);
    await expect.poll(() => b, { message: 'the starting tab sent its value' }).not.toBe('');

    const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const victim = await other.newPage();
    const exchanges: string[] = [];
    victim.on('request', (r) => void (r.url().endsWith('/auth/sso/exchange') && exchanges.push(r.url())));
    await victim.goto(location);
    await expect(victim.getByText(SSO_PROBLEMS.BROWSER)).toBeVisible();
    expect(exchanges, 'a tab that started no sign-in exchanges nothing').toEqual([]);
    expect(await victim.evaluate(() => window.localStorage.getItem('erp_token'))).toBeNull();

    // Nor does the API take the code with any other value; the starting tab's still works, once.
    const code = /#code=([^&]+)/.exec(location)![1];
    const post = (body: unknown) => fetch(`${API_URL}/auth/sso/exchange`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post({ code, b: 'A'.repeat(43) })).status, 'another value').toBe(400);
    expect((await post({ code })).status, 'no value').toBe(400);
    expect((await post({ code, b })).status, 'the starting tab’s value').toBe(200);
    // A start the sign-in page did not make (no value) goes no further.
    const bare = await fetch(`${API_URL}/auth/sso/${entra.code}/start`, { redirect: 'manual' });
    expect(bare.headers.get('location')).toMatch(/\/login\/sso#error=BROWSER$/);
    await other.close();
    await maker.close();
  });

  test('lane 10: the sign-in pages and Company settings › Sign-in pass the walk at 1440 and 390 in both themes', async ({ browser }) => {
    test.setTimeout(240_000);
    const views = [
      { name: '1440', viewport: { width: 1440, height: 900 }, touch: false },
      { name: '390', viewport: { width: 390, height: 844 }, touch: true },
    ];
    const found: string[] = [];
    for (const view of views)
      for (const mode of ['light', 'dark'] as const) {
        const context = await browser.newContext({ viewport: view.viewport, hasTouch: view.touch, reducedMotion: 'reduce' });
        await setAppearance(context, mode);
        const signedOut = await context.newPage();
        const pages: [string, Page, () => Promise<void>][] = [
          ['/login?sso=1', signedOut, async () => void (await expect(signedOut.getByLabel('Company code')).toBeVisible())],
          ['/login/sso#error=TENANT', signedOut, async () => void (await expect(signedOut.getByText(SSO_PROBLEMS.TENANT)).toBeVisible())],
        ];
        for (const [url, page, ready] of pages) {
          await page.goto(url);
          await ready();
          await settle(page);
          found.push(...(await walkFindings(page, `${url} ${view.name} ${mode}`, view.touch ? 44 : 24, view.touch)));
        }
        await context.addCookies([{ name: 'erp_token', value: ssoAdminToken, url: process.env.E2E_WEB_URL ?? 'http://localhost:3000' }]);
        await context.addInitScript((t) => window.localStorage.setItem('erp_token', t), ssoAdminToken);
        const settings = await context.newPage();
        await settle(settings, '/company-settings?tab=signin');
        await expect(settings.getByText('Yes, website passwords are refused')).toBeVisible();
        found.push(...(await walkFindings(settings, `Sign-in tab ${view.name} ${mode}`, view.touch ? 44 : 24, view.touch)));
        if (view.name === '390' && mode === 'dark') await shot(settings, 'sso-walk-390-dark.png');
        await context.close();
      }
    expect(found, found.join('\n')).toEqual([]);
  });
});

/** The route walk's checks (route-walk.spec.ts) on one page: axe, one h1, its own tab title, target and text sizes, no sideways scroll. */
async function walkFindings(page: Page, at: string, min: number, phone: boolean): Promise<string[]> {
  const found: string[] = [];
  const h1 = await page.locator('h1').count();
  if (h1 !== 1) found.push(`${at}: ${h1} <h1>`);
  if (!/·/.test(await page.title())) found.push(`${at}: tab title "${await page.title()}"`);
  found.push(...(await axeViolations(page)).map((v) => `${at}: axe ${v}`));
  const { targets, text } = await page.evaluate(measureTargets, min);
  found.push(...targets.map((t) => `${at}: target ${t.what} ${t.size}`), ...text.map((t) => `${at}: text ${t.what} ${t.size}`));
  if (phone && (await pageOverflow(page)) > 0) found.push(`${at}: scrolls sideways`);
  return found;
}
