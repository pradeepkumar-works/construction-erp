'use client';

import React from 'react';
import { CALIBRATION_STATE_LABELS, QA_FREQUENCY_LABELS, QA_PLAN_SOURCE_LABELS, QA_WITNESS_LABELS, type AccreditationState, type CalibrationState, type QaPlanLineDef } from '@erp/shared';
import { AppTag } from '@/components/common/AppTag';

/** What a plan line covers, in words: "Work named concrete, rcc · M25" or "Cement received". */
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
      <AppTag tone={line.witness === 'OWN' ? 'neutral' : 'info'}>{QA_WITNESS_LABELS[line.witness]}</AppTag>
      {line.holdPoint ? <AppTag tone="pending">Hold point</AppTag> : null}
    </>
  );
}

const ACCREDITATION_TAG: Record<Exclude<AccreditationState, 'NONE'>, { tone: 'success' | 'pending' | 'danger'; text: string }> = {
  VALID: { tone: 'success', text: 'Accredited' },
  EXPIRING: { tone: 'pending', text: 'Expiring' },
  EXPIRED: { tone: 'danger', text: 'Expired' },
};

/** Where an NABL lab's accreditation stands. */
export function AccreditationTag({ state }: { state: AccreditationState }) {
  if (state === 'NONE') return null;
  const t = ACCREDITATION_TAG[state];
  return <AppTag tone={t.tone}>{t.text}</AppTag>;
}

const CALIBRATION_TONE: Record<CalibrationState, 'success' | 'pending' | 'danger' | 'neutral'> = {
  OK: 'success',
  DUE_SOON: 'pending',
  OVERDUE: 'danger',
  NEVER: 'danger',
  OUT_OF_USE: 'neutral',
};

/** Where an instrument stands in the calibration register. */
export function CalibrationTag({ state }: { state: CalibrationState }) {
  return <AppTag tone={CALIBRATION_TONE[state]}>{CALIBRATION_STATE_LABELS[state]}</AppTag>;
}
