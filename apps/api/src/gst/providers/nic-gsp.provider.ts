import type { EinvoicePayload, EwayPayload, EwbCancelReason, GspConfig, IrnCancelReason } from '@erp/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { openSecret } from '../../integrations/integration-rules';
import {
  EWB_ALREADY_MADE,
  IRP_INVALID_TOKEN,
  duplicateIrnProblem,
  gstErrorCodes,
  readEwbAnswer,
  readEwbByDoc,
  readEwbCancel,
  readEwbExtend,
  readGspConfig,
  readGspCredential,
  readIrnAnswer,
  readIrnCancel,
  readIrnDetails,
} from '../einvoice-rules';
import type { EwbExtendInput, EwbMade, GstCallContext, GstProvider, ProviderResult } from './gst-provider';

/** One request to the GSP, all its calls together (sign in, the call, a second sign-in, the details): it gives up after this. */
const CALL_MS = 30_000;
/** NIC's tokens last six hours; one is used for at most five. */
const TOKEN_MS = 5 * 3600_000;

interface Gsp {
  connectionId: string;
  /** The token cache's key: the connection as last saved, so a changed password or user signs in afresh */
  tokenKey: string;
  config: GspConfig;
  clientSecret: string;
  password: string;
}

/** The GSP gave no answer to read: the call threw, timed out, or came back 5xx or not as JSON. */
class NoAnswer extends Error {}

/**
 * GST_PROVIDER=gsp: NIC's e-invoice (IRP) and e-way bill APIs in plain JSON through the company's GST Suvidha Provider,
 * signed in with the GSP's client id and secret and the API user the company made for it on the portal. The settings
 * are the company's GST_GSP connection (Admin › Connections), its secret sealed under INTEGRATION_KEY.
 *
 * Untested against the live IRP: written to NIC's published API (e-invoice v1.03/v1.04, e-way bill v1.03) as GSPs pass
 * it through. A GSP that wraps the calls differently (its own sign-in, encrypted bodies) needs its own adapter, and an
 * e-way bill made without an IRN signs in as the IRP does here, which is to be confirmed on the GSP's sandbox (DEPLOY.md).
 *
 * Three outcomes: made, refused, or no answer. No answer leaves the document as it was being made, so it is never taken
 * as refused while the IRP may hold it.
 */
export class NicGspProvider implements GstProvider {
  readonly name = 'GSP';
  readonly answerWithinMs = CALL_MS;
  private tokens = new Map<string, { token: string; until: number }>();

  constructor(
    private prisma: PrismaService,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  private async gsp(organizationId: string): Promise<{ gsp: Gsp | null; problem: string | null }> {
    const c = await this.prisma.integrationConnection.findFirst({ where: { organizationId, kind: 'GST_GSP', isActive: true }, orderBy: { createdAt: 'desc' } });
    if (!c) return { gsp: null, problem: "Connect the company's GST provider (GSP) on Admin › Connections first" };
    const key = process.env.INTEGRATION_KEY;
    const credential = c.secretEnc && key ? openSecret(c.secretEnc, key) : null;
    if (c.secretEnc && !key) return { gsp: null, problem: "The GSP's secret cannot be opened until INTEGRATION_KEY is set on the server" };
    const { config, problem } = readGspConfig(c.config, !!credential);
    if (!config) return { gsp: null, problem: `The GST provider connection: ${problem}` };
    const parts = readGspCredential(credential!);
    if (!parts) return { gsp: null, problem: "The GST provider connection's client secret and API password could not be read; type them again" };
    return { gsp: { connectionId: c.id, tokenKey: `${c.id}:${c.updatedAt.getTime()}`, config, ...parts }, problem: null };
  }

  async ready(organizationId: string) {
    return (await this.gsp(organizationId)).problem;
  }

  private async health(connectionId: string, ok: boolean, error?: string) {
    const now = new Date();
    await this.prisma.integrationConnection.update({ where: { id: connectionId }, data: ok ? { lastEventAt: now, lastSuccessAt: now } : { lastEventAt: now, lastErrorAt: now, lastError: error?.slice(0, 500) ?? null } });
  }

  /** One HTTP call, never following a redirect. Throws NoAnswer for a 5xx or an answer that is not JSON. */
  private async call(url: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
    const res = await this.fetchImpl(url, { ...init, redirect: 'error', signal });
    const body = await res.text();
    if (res.status >= 500) throw new NoAnswer(`the GSP answered ${res.status}`);
    try {
      return JSON.parse(body);
    } catch {
      throw new NoAnswer(`the GSP answered ${res.status} with something that is not JSON`);
    }
  }

  private baseHeaders(g: Gsp): Record<string, string> {
    return { 'content-type': 'application/json', client_id: g.config.clientId, client_secret: g.clientSecret, gstin: g.config.gstin };
  }

  private async irpHeaders(g: Gsp, signal: AbortSignal): Promise<Record<string, string> | string> {
    const kept = this.tokens.get(g.tokenKey);
    if (kept && kept.until > Date.now()) return { ...this.baseHeaders(g), user_name: g.config.userName, AuthToken: kept.token };
    const raw = (await this.call(
      `${g.config.url.replace(/\/$/, '')}/eivital/v1.04/auth`,
      { method: 'POST', headers: this.baseHeaders(g), body: JSON.stringify({ UserName: g.config.userName, Password: g.password, ForceRefreshAccessToken: false }) },
      signal,
    )) as { Status?: unknown; Data?: { AuthToken?: string } | string };
    let data: { AuthToken?: string } | undefined;
    try {
      data = typeof raw.Data === 'string' ? (JSON.parse(raw.Data) as { AuthToken?: string }) : raw.Data;
    } catch {
      data = undefined;
    }
    if (String(raw.Status) !== '1' || !data?.AuthToken) return 'The GSP did not sign in to the IRP: check the user name, password, client id and secret';
    this.tokens.set(g.tokenKey, { token: data.AuthToken, until: Date.now() + TOKEN_MS });
    return { ...this.baseHeaders(g), user_name: g.config.userName, AuthToken: data.AuthToken };
  }

  /**
   * A call that needs the IRP's token. When NIC says the token is not valid (1005: it expired early, or was taken by
   * another sign-in), the kept one is dropped and the call made once more with a new one.
   */
  private async signed(g: Gsp, signal: AbortSignal, url: string, init: RequestInit): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      const headers = await this.irpHeaders(g, signal);
      if (typeof headers === 'string') return { Status: 0, message: headers };
      const raw = await this.call(url, { ...init, headers }, signal);
      if (attempt === 0 && gstErrorCodes(raw).includes(IRP_INVALID_TOKEN)) {
        this.tokens.delete(g.tokenKey);
        continue;
      }
      return raw;
    }
  }

  private async run<T>(organizationId: string, step: (g: Gsp, signal: AbortSignal) => Promise<ProviderResult<T>>): Promise<ProviderResult<T>> {
    const { gsp, problem } = await this.gsp(organizationId);
    if (!gsp) return { ok: false, error: problem!, raw: null };
    try {
      const r = await step(gsp, AbortSignal.timeout(CALL_MS));
      await this.health(gsp.connectionId, r.ok, r.ok ? undefined : r.error);
      return r;
    } catch (e) {
      const error = `The GSP gave no answer: ${(e as Error).message}`;
      await this.health(gsp.connectionId, false, error);
      return { ok: false, error, unanswered: true, raw: null };
    }
  }

  private irpUrl = (g: Gsp, path: string) => `${g.config.url.replace(/\/$/, '')}${path}`;
  private ewbUrl = (g: Gsp, path: string) => `${(g.config.ewbUrl ?? g.config.url).replace(/\/$/, '')}${path}`;

  async generateIrn(ctx: GstCallContext, payload: EinvoicePayload) {
    return this.run(ctx.organizationId, async (g, signal) => {
      const raw = await this.signed(g, signal, this.irpUrl(g, '/eicore/v1.03/Invoice'), { method: 'POST', body: JSON.stringify(payload) });
      const a = readIrnAnswer(raw);
      if (a.ok && a.value.duplicate) {
        // 2150: the IRP holds an IRN for this number. It is ours only if it holds it for these figures; ask for its details.
        const details = readIrnDetails(await this.signed(g, signal, this.irpUrl(g, `/eicore/v1.03/Invoice/irn/${encodeURIComponent(a.value.irn)}`), { method: 'GET' }));
        const problem = duplicateIrnProblem(payload, a.value.irn, details.figures);
        if (problem) return { ok: false as const, error: problem, raw };
        return { ...a, value: { ...a.value, signedQr: details.signedQr }, raw };
      }
      return { ...a, raw };
    });
  }

  async cancelIrn(ctx: GstCallContext, irn: string, reason: IrnCancelReason, remark: string) {
    return this.run(ctx.organizationId, async (g, signal) => {
      const raw = await this.signed(g, signal, this.irpUrl(g, '/eicore/v1.03/Invoice/Cancel'), { method: 'POST', body: JSON.stringify({ Irn: irn, CnlRsn: reason, CnlRem: remark.slice(0, 100) }) });
      return { ...readIrnCancel(raw), raw };
    });
  }

  private ewb(g: Gsp, signal: AbortSignal, action: string, body: unknown) {
    return this.signed(g, signal, this.ewbUrl(g, `/ewaybillapi/v1.03/ewayapi?action=${action}`), { method: 'POST', body: JSON.stringify(body) });
  }

  private async byDoc(g: Gsp, signal: AbortSignal, docType: string, docNo: string): Promise<ProviderResult<EwbMade | null>> {
    const q = new URLSearchParams({ docType, docNo });
    const raw = await this.signed(g, signal, this.ewbUrl(g, `/ewaybillapi/v1.03/ewayapi/GetEwayBillGeneratedByConsigner?${q}`), { method: 'GET' });
    return { ...readEwbByDoc(raw), raw };
  }

  async findEwb(ctx: GstCallContext, docType: string, docNo: string) {
    return this.run(ctx.organizationId, (g, signal) => this.byDoc(g, signal, docType, docNo));
  }

  async generateEwb(ctx: GstCallContext, payload: EwayPayload) {
    return this.run(ctx.organizationId, async (g, signal): Promise<ProviderResult<EwbMade>> => {
      const raw = await this.ewb(g, signal, 'GENEWAYBILL', payload);
      const a = readEwbAnswer(raw);
      if (!a.ok && gstErrorCodes(raw).includes(EWB_ALREADY_MADE)) {
        // 604: one was made on this challan already (an earlier try whose answer was lost): take that one.
        const found = await this.byDoc(g, signal, payload.docType, payload.docNo);
        if (found.ok && found.value) return { ok: true, value: found.value, raw: found.raw };
      }
      return { ...a, raw };
    });
  }

  async extendEwb(ctx: GstCallContext, ewbNo: string, i: EwbExtendInput) {
    return this.run(ctx.organizationId, async (g, signal) => {
      const raw = await this.ewb(g, signal, 'EXTENDVALIDITY', {
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
    return this.run(ctx.organizationId, async (g, signal) => {
      const raw = await this.ewb(g, signal, 'CANEWB', { ewbNo: Number(ewbNo), cancelRsnCode: Number(reason), cancelRmrk: remark.slice(0, 50) });
      return { ...readEwbCancel(raw), raw };
    });
  }
}
