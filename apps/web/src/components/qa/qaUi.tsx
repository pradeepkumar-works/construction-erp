'use client';

import React from 'react';
import { CALIBRATION_STATE_LABELS, QA_FREQUENCY_LABELS, QA_PLAN_SOURCE_LABELS, QA_WITNESS_LABELS, type AccreditationState, type CalibrationState, type QaPlanLineDef } from '@erp/shared';
import { AppTag } from '@/components/common/AppTag';

/** What a plan line covers, in words: "Work named concrete, rcc · M25" or "Cement received". */
/** IS 456 clause 15.2.2 in words, for the quality plan and the pour register alike. */
export const IS456_SAMPLING = 'one sample to 5 m³, two to 15, three to 30, four to 50, then one more for each 50 m³ (IS 456 clause 15.2.2)';

export function lineCovers(l: Pick<QaPlanLineDef, 'source' | 'match' | 'grade' | 'itemCategory'>): string {
  const what = l.source === 'RECEIPT' ? [l.itemCategory, l.match && `named ${l.match}`].filter(Boolean).join(' or ') : `named ${l.match}`;
  return [`${QA_PLAN_SOURCE_LABELS[l.source]}: ${what}`, l.grade].filter(Boolean).join(' · ');
}

/** How often, in words: "IS 456 sampling", "1 per 500 m2", "Each lot", "1 per 50 of each lot". */
export function lineFrequency(l: Pick<QaPlanLineDef, 'frequency' | 'per' | 'unit'>): string {
  if (l.frequency === 'QUANTITY') return `1 per ${l.per ?? '?'} ${l.unit ?? ''}`.trim();
  if (l.frequency === 'RECEIPT' && l.per) return `1 per ${l.per} of each lot`;
  return QA_FREQUENCY_LABELS[l.frequency];
}

export function WitnessTag({ line }: { line: Pick<QaPlanLineDef, 'witness' | 'holdPoint'> }) {
  return (
    <>
      <AppTag variant="kind">{QA_WITNESS_LABELS[line.witness]}</AppTag>
      {line.holdPoint ? <AppTag meaning="waiting">Hold point</AppTag> : null}
    </>
  );
}

const ACCREDITATION_WORDS: Record<Exclude<AccreditationState, 'NONE'>, string> = { VALID: 'Accredited', EXPIRING: 'Expiring', EXPIRED: 'Expired' };

/** Where an NABL lab's accreditation stands. */
export function AccreditationTag({ state }: { state: AccreditationState }) {
  if (state === 'NONE') return null;
  return (
    <AppTag kind="accreditation" status={state}>
      {ACCREDITATION_WORDS[state]}
    </AppTag>
  );
}

/** Where an instrument stands in the calibration register. */
export function CalibrationTag({ state }: { state: CalibrationState }) {
  return <AppTag kind="calibration" status={state}>{CALIBRATION_STATE_LABELS[state]}</AppTag>;
}
