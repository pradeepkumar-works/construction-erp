/** Clients and contract terms shared by the API and the clients (v3 item 17). */

/** 10-character PAN: five letters, four digits, a letter. */
export const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

/** IFSC: four letters, a zero, six letters or digits. */
export const IFSC_PATTERN = /^[A-Z]{4}0[A-Z0-9]{6}$/;

/** Udyam (MSME) registration number, e.g. UDYAM-OD-19-0012345. */
export const UDYAM_PATTERN = /^UDYAM-[A-Z]{2}-[0-9]{2}-[0-9]{7}$/;

/**
 * The PAN inside a GSTIN (finding 17 of the October review: the state filled itself but the PAN was typed again):
 * characters 3 to 12 of a well-formed GSTIN are the holder's PAN. Null when there is no GSTIN to read it from.
 */
export function panFromGstin(gstin: string | null | undefined): string | null {
  const g = gstin?.trim().toUpperCase();
  if (!g || !/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(g)) return null;
  const pan = g.slice(2, 12);
  return PAN_PATTERN.test(pan) ? pan : null;
}

/** GST state code (first two digits of a GSTIN), or null when the GSTIN is missing or malformed. */
export const gstStateCode = (gstin: string | null | undefined): string | null => (gstin && /^[0-9]{2}/.test(gstin) ? gstin.slice(0, 2) : null);

/** Indian states and union territories by GST state code, for the client form and bill headers. */
export const GST_STATES: Record<string, string> = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand', '06': 'Haryana',
  '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim', '12': 'Arunachal Pradesh', '13': 'Nagaland',
  '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura', '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand',
  '21': 'Odisha', '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala', '33': 'Tamil Nadu', '34': 'Puducherry',
  '35': 'Andaman and Nicobar Islands', '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh',
};

/** The bill deductions and GST that are percentages of the work value, in the order a bill shows them. */
export const CONTRACT_PERCENT_FIELDS = ['retentionPct', 'securityDepositPct', 'advanceRecoveryPct', 'tdsPct', 'gstTdsPct', 'labourCessPct', 'gstRate'] as const;
export type ContractPercentField = (typeof CONTRACT_PERCENT_FIELDS)[number];

export const CONTRACT_PERCENT_LABELS: Record<ContractPercentField, string> = {
  retentionPct: 'Retention',
  securityDepositPct: 'Security deposit',
  advanceRecoveryPct: 'Advance recovery',
  tdsPct: 'TDS (income tax)',
  gstTdsPct: 'GST TDS',
  labourCessPct: 'Labour welfare cess',
  gstRate: 'GST',
};

/** Completion date after the extensions of time granted (days), as YYYY-MM-DD. */
export function revisedCompletion(endDate: string | null, extensionDays: number): string | null {
  if (!endDate) return null;
  const d = new Date(`${endDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + extensionDays);
  return d.toISOString().slice(0, 10);
}

/** "RA bill 3", or "RA bill 7 (final)". */
/** "RA bill 3", "RA bill 7 (final)", or "O&M bill 9" for an instalment of the O&M contract (item 131). */
export const billLabel = (billNo: number, isFinal: boolean, om = false): string => (om ? `O&M bill ${billNo}` : `RA bill ${billNo}${isFinal ? ' (final)' : ''}`);

/** The deductions on an RA bill, in the order the bill shows them. */
export const BILL_DEDUCTION_LABELS = {
  retention: 'Retention',
  securityDeposit: 'Security deposit',
  advanceRecovery: 'Mobilisation advance recovery',
  tds: 'TDS (income tax)',
  gstTds: 'GST TDS',
  labourCess: 'Labour welfare cess',
  slippage: 'Milestone slippage withheld',
  omPenalty: 'Service level penalties',
  obligations: 'Contract recoveries',
  other: 'Other deduction',
} as const;
