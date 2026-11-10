import { ewayValidUntil, type EinvoicePayload, type EwayPayload, type VehicleType } from '@erp/shared';
import { fakeAckNo, fakeEwbNo, fakeSignedQr, gstAnswerTime, irnOf, payloadHash } from '../einvoice-rules';
import type { EwbExtendInput, GstProvider } from './gst-provider';

/**
 * GST_PROVIDER=fake, for CI and local work: answers at once with stand-in numbers and calls nothing. The IRN is worked
 * out as the IRP works it out, so the same invoice gets the same IRN; the ack and e-way bill numbers come from the same
 * hashes, and the QR carries the claims NIC would sign, unsigned.
 */
export class FakeGstProvider implements GstProvider {
  readonly name = 'FAKE';
  constructor(private now: () => Date = () => new Date()) {}

  async ready() {
    return null;
  }

  async generateIrn(_ctx: unknown, payload: EinvoicePayload) {
    const irn = irnOf(payload);
    const ackAt = gstAnswerTime(this.now());
    const raw = { Status: 1, Data: { AckNo: fakeAckNo(irn), AckDt: '(stand-in)', Irn: irn, Status: 'ACT' } };
    return { ok: true as const, value: { irn, ackNo: fakeAckNo(irn), ackAt, signedQr: fakeSignedQr(payload, irn, ackAt), duplicate: false }, raw };
  }

  async cancelIrn(_ctx: unknown, irn: string) {
    return { ok: true as const, value: { cancelledAt: gstAnswerTime(this.now()) }, raw: { Status: 1, Data: { Irn: irn } } };
  }

  async generateEwb(_ctx: unknown, payload: EwayPayload) {
    const madeAt = gstAnswerTime(this.now());
    const ewbNo = fakeEwbNo(payloadHash(payload));
    const validUntil = ewayValidUntil(madeAt, Number(payload.transDistance), payload.vehicleType as VehicleType);
    return { ok: true as const, value: { ewbNo, madeAt, validUntil }, raw: { status: '1', data: { ewayBillNo: ewbNo } } };
  }

  async extendEwb(_ctx: unknown, ewbNo: string, input: EwbExtendInput) {
    const validUntil = ewayValidUntil(gstAnswerTime(this.now()), input.remainingKm, 'R');
    return { ok: true as const, value: { validUntil }, raw: { status: '1', data: { ewayBillNo: ewbNo } } };
  }

  async cancelEwb(_ctx: unknown, ewbNo: string) {
    return { ok: true as const, value: { cancelledAt: gstAnswerTime(this.now()) }, raw: { status: '1', data: { ewayBillNo: ewbNo } } };
  }
}
