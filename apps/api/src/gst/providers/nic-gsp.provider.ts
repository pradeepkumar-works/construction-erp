import type { EinvoicePayload, EwayPayload, EwbCancelReason, GspConfig, IrnCancelReason } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { openSecret } from '../../integrations/integration-rules';
import { readEwbAnswer, readEwbCancel, readEwbExtend, readGspConfig, readGspCredential, readIrnAnswer, readIrnCancel, readIrnDetails } from '../einvoice-rules';
import type { EwbExtendInput, GstCallContext, GstProvider, ProviderResult } from './gst-provider';

const TIMEOUT_MS = 20_000;
/** NIC's tokens last six hours; one is used for at most five. */
const TOKEN_MS = 5 * 3600_000;

interface Gsp {
  connectionId: string;
  config: GspConfig;
  clientSecret: string;
  password: string;
}

/**
 * GST_PROVIDER=gsp: NIC's e-invoice (IRP) and e-way bill APIs in plain JSON through the company's GST Suvidha Provider,
 * signed in with the GSP's client id and secret and the API user the company made for it on the portal. The settings
 * are the company's GST_GSP connection (Administration › Connections), its secret sealed under INTEGRATION_KEY.
 *
 * Untested against the live IRP: written to NIC's published API (e-invoice v1.03/v1.04, e-way bill v1.03) as GSPs pass
 * it through. A GSP that wraps the calls differently (its own sign-in, encrypted bodies) needs its own adapter.
 */
export class NicGspProvider implements GstProvider {
  readonly name = 'GSP';
  private tokens = new Map<string, { token: string; until: number }>();

  constructor(
    private prisma: PrismaService,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async gsp(organizationId: string): Promise<{ gsp: Gsp | null; problem: string | null }> {
    const c = await this.prisma.integrationConnection.findFirst({ where: { organizationId, kind: 'GST_GSP', isActive: true }, orderBy: { createdAt: 'desc' } });
    if (!c) return { gsp: null, problem: "Connect the company's GST provider (GSP) on Administration › Connections first" };
    const key = process.env.INTEGRATION_KEY;
    const credential = c.secretEnc && key ? openSecret(c.secretEnc, key) : null;
    if (c.secretEnc && !key) return { gsp: null, problem: "The GSP's secret cannot be opened until INTEGRATION_KEY is set on the server" };
    const { config, problem } = readGspConfig(c.config, !!credential);
    if (!config) return { gsp: null, problem: `The GST provider connection: ${problem}` };
    const parts = readGspCredential(credential!);
    if (!parts) return { gsp: null, problem: "The GST provider connection's key is not client secret:password; type it again" };
    return { gsp: { connectionId: c.id, config, ...parts }, problem: null };
  }

  async ready(organizationId: string) {
    return (await this.gsp(organizationId)).problem;
  }

  private async health(connectionId: string, ok: boolean, error?: string) {
    const now = new Date();
    await this.prisma.integrationConnection.update({ where: { id: connectionId }, data: ok ? { lastEventAt: now, lastSuccessAt: now } : { lastEventAt: now, lastErrorAt: now, lastError: error?.slice(0, 500) ?? null } });
  }

  private async call(url: string, init: RequestInit): Promise<unknown> {
    const res = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    const body = await res.text();
    try {
      return JSON.parse(body);
    } catch {
      return { Status: 0, message: `The GSP answered ${res.status} with something that is not JSON` };
    }
  }

  private baseHeaders(g: Gsp): Record<string, string> {
    return { 'content-type': 'application/json', client_id: g.config.clientId, client_secret: g.clientSecret, gstin: g.config.gstin };
  }

  private async irpHeaders(g: Gsp): Promise<Record<string, string> | string> {
    const kept = this.tokens.get(g.connectionId);
    if (kept && kept.until > Date.now()) return { ...this.baseHeaders(g), user_name: g.config.userName, AuthToken: kept.token };
    const raw = (await this.call(`${g.config.url.replace(/\/$/, '')}/eivital/v1.04/auth`, {
      method: 'POST',
      headers: this.baseHeaders(g),
      body: JSON.stringify({ UserName: g.config.userName, Password: g.password, ForceRefreshAccessToken: false }),
    })) as { Status?: unknown; Data?: { AuthToken?: string } | string };
    const data = typeof raw.Data === 'string' ? (JSON.parse(raw.Data) as { AuthToken?: string }) : raw.Data;
    if (String(raw.Status) !== '1' || !data?.AuthToken) return 'The GSP did not sign in to the IRP: check the user name, password, client id and secret';
    this.tokens.set(g.connectionId, { token: data.AuthToken, until: Date.now() + TOKEN_MS });
    return { ...this.baseHeaders(g), user_name: g.config.userName, AuthToken: data.AuthToken };
  }

  private async run<T>(organizationId: string, step: (g: Gsp) => Promise<ProviderResult<T>>): Promise<ProviderResult<T>> {
    const { gsp, problem } = await this.gsp(organizationId);
    if (!gsp) return { ok: false, error: problem!, raw: null };
    try {
      const r = await step(gsp);
      await this.health(gsp.connectionId, r.ok, r.ok ? undefined : r.error);
      return r;
    } catch (e) {
      const error = `The GSP could not be reached: ${(e as Error).message}`;
      await this.health(gsp.connectionId, false, error);
      return { ok: false, error, raw: null };
    }
  }

  async generateIrn(ctx: GstCallContext, payload: EinvoicePayload) {
    return this.run(ctx.organizationId, async (g) => {
      const headers = await this.irpHeaders(g);
      if (typeof headers === 'string') return { ok: false as const, error: headers, raw: null };
      const base = g.config.url.replace(/\/$/, '');
      const raw = await this.call(`${base}/eicore/v1.03/Invoice`, { method: 'POST', headers, body: JSON.stringify(payload) });
      const a = readIrnAnswer(raw);
      if (a.ok && a.value.duplicate) {
        // The IRP's duplicate answer names the IRN but not its QR: ask for the IRN's details.
        const details = await this.call(`${base}/eicore/v1.03/Invoice/irn/${encodeURIComponent(a.value.irn)}`, { method: 'GET', headers });
        return { ...a, value: { ...a.value, signedQr: readIrnDetails(details) }, raw };
      }
      return { ...a, raw };
    });
  }

  async cancelIrn(ctx: GstCallContext, irn: string, reason: IrnCancelReason, remark: string) {
    return this.run(ctx.organizationId, async (g) => {
      const headers = await this.irpHeaders(g);
      if (typeof headers === 'string') return { ok: false as const, error: headers, raw: null };
      const raw = await this.call(`${g.config.url.replace(/\/$/, '')}/eicore/v1.03/Invoice/Cancel`, { method: 'POST', headers, body: JSON.stringify({ Irn: irn, CnlRsn: reason, CnlRem: remark.slice(0, 100) }) });
      return { ...readIrnCancel(raw), raw };
    });
  }

  private async ewb(g: Gsp, action: string, body: unknown) {
    const base = (g.config.ewbUrl ?? g.config.url).replace(/\/$/, '');
    const headers = await this.irpHeaders(g);
    if (typeof headers === 'string') return { Status: 0, message: headers };
    return this.call(`${base}/ewaybillapi/v1.03/ewayapi?action=${action}`, { method: 'POST', headers, body: JSON.stringify(body) });
  }

  async generateEwb(ctx: GstCallContext, payload: EwayPayload) {
    return this.run(ctx.organizationId, async (g) => {
      const raw = await this.ewb(g, 'GENEWAYBILL', payload);
      return { ...readEwbAnswer(raw), raw };
    });
  }

  async extendEwb(ctx: GstCallContext, ewbNo: string, i: EwbExtendInput) {
    return this.run(ctx.organizationId, async (g) => {
      const raw = await this.ewb(g, 'EXTENDVALIDITY', {
        ewbNo: Number(ewbNo),
        vehicleNo: i.vehicleNo,
        fromPlace: i.fromPlace,
        fromState: i.fromStateCode,
        fromPincode: i.fromPincode,
        remainingDistance: i.remainingKm,
        transMode: i.mode,
        consignmentStatus: 'M',
        extnRsnCode: Number(i.reason),
        extnRemarks: i.remark.slice(0, 50),
      });
      return { ...readEwbExtend(raw), raw };
    });
  }

  async cancelEwb(ctx: GstCallContext, ewbNo: string, reason: EwbCancelReason, remark: string) {
    return this.run(ctx.organizationId, async (g) => {
      const raw = await this.ewb(g, 'CANEWB', { ewbNo: Number(ewbNo), cancelRsnCode: Number(reason), cancelRmrk: remark.slice(0, 50) });
      return { ...readEwbCancel(raw), raw };
    });
  }
}
