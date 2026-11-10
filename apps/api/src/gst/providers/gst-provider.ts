import type { EinvoicePayload, EwayPayload, EwbCancelReason, EwbExtendReason, IrnCancelReason, TransportMode } from '@erp/shared';
import type { Answer, IrnValue } from '../einvoice-rules';

/** What a provider was asked and what came back: the reading, and the answer as it was for the log. */
export type ProviderResult<T> = Answer<T> & { raw: unknown };

/** The company a call is for, and its GSTIN as the record has it. */
export interface GstCallContext {
  organizationId: string;
  gstin: string;
}

export interface EwbExtendInput {
  vehicleNo: string;
  fromPlace: string;
  fromPincode: number;
  fromStateCode: number;
  remainingKm: number;
  mode: TransportMode;
  reason: EwbExtendReason;
  remark: string;
}

/**
 * Where IRNs and e-way bills come from (ARCHITECTURE "E-invoices and e-way bills"): the fake for CI and local work, or
 * NIC's systems through the company's GSP. Picked by GST_PROVIDER.
 */
export interface GstProvider {
  /** FAKE or GSP, kept on each document */
  readonly name: string;
  /** Why the company cannot use it yet, in words, or null */
  ready(organizationId: string): Promise<string | null>;
  generateIrn(ctx: GstCallContext, payload: EinvoicePayload): Promise<ProviderResult<IrnValue>>;
  cancelIrn(ctx: GstCallContext, irn: string, reason: IrnCancelReason, remark: string): Promise<ProviderResult<{ cancelledAt: Date }>>;
  generateEwb(ctx: GstCallContext, payload: EwayPayload): Promise<ProviderResult<{ ewbNo: string; madeAt: Date; validUntil: Date }>>;
  extendEwb(ctx: GstCallContext, ewbNo: string, input: EwbExtendInput): Promise<ProviderResult<{ validUntil: Date }>>;
  cancelEwb(ctx: GstCallContext, ewbNo: string, reason: EwbCancelReason, remark: string): Promise<ProviderResult<{ cancelledAt: Date }>>;
}

export const GST_PROVIDER_NAMES = ['fake', 'gsp'] as const;
