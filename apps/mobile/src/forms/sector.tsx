import React, { useState } from 'react';
import type { ProjectDetail, SectorFields } from '@erp/shared';
import { formatChainage, parseChainage, sectorKinds } from '@erp/shared';
import { useFetch } from '../api/hooks';
import { Chips, Input, Select } from '../components';
import { useT } from '../i18n/LanguageContext';
import type { FieldProps } from './keyboard';

/** The sector fields as typed, kept in a form's draft. */
export interface SectorDraft {
  from: string;
  to: string;
  floor: string | null;
  village: string | null;
}

/**
 * Chainage, floor or village for the chosen project's type (v4 item 41), as form state plus fields to render. The
 * project's settings come from the same cache as the other forms, so the fields work offline once loaded.
 */
export function useSectorInputs(projectId: string | null) {
  const project = useFetch<ProjectDetail>((a) => a.get(`/projects/${projectId}`), [projectId], { enabled: !!projectId, refetchOnFocus: false, cacheKey: `project:${projectId}` });
  const t = useT();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [floor, setFloor] = useState<string | null>(null);
  const [village, setVillage] = useState<string | null>(null);
  const p = project.data && project.data.id === projectId ? project.data : null;
  const k = p ? sectorKinds(p) : { chainage: false, floor: false, village: false };

  /** Adds messages for bad values to `e`. */
  const validate = (e: Record<string, string>) => {
    const a = parseChainage(from);
    const b = parseChainage(to);
    if (from.trim() && a === null) e.chainageFrom = t('Enter the chainage like {example}', { example: '14+200' });
    if (to.trim() && b === null) e.chainageTo = t('Enter the chainage like {example}', { example: '14+600' });
    if (!from.trim() && to.trim()) e.chainageFrom = t('Enter the chainage where it starts');
    if (p && a !== null && ((p.chainageStart !== null && a < p.chainageStart) || (p.chainageEnd !== null && (b ?? a) > p.chainageEnd)))
      e.chainageFrom = p.chainageEnd !== null ? t('Enter a chainage within {from} to {to}', { from: formatChainage(p.chainageStart ?? 0), to: formatChainage(p.chainageEnd) }) : t('Enter a chainage from {from} onwards', { from: formatChainage(p.chainageStart ?? 0) });
  };

  /** Request fields: blanks are null on an edit and left out on a create. */
  const body = (editing: boolean) => {
    const blank = editing ? null : undefined;
    return {
      chainageFrom: (k.chainage ? parseChainage(from) : null) ?? blank,
      chainageTo: (k.chainage ? parseChainage(to) : null) ?? blank,
      floor: (k.floor ? floor : null) ?? blank,
      village: (k.village ? village : null) ?? blank,
    };
  };

  const load = (e: Partial<SectorFields>) => {
    setFrom(e.chainageFrom !== null && e.chainageFrom !== undefined ? formatChainage(e.chainageFrom) : '');
    setTo(e.chainageTo !== null && e.chainageTo !== undefined && e.chainageTo !== e.chainageFrom ? formatChainage(e.chainageTo) : '');
    setFloor(e.floor ?? null);
    setVillage(e.village ?? null);
  };

  const clear = () => load({});

  /** What was typed, for a form's draft (`useFormDraft`); `restore` puts it back. */
  const value: SectorDraft = { from, to, floor, village };
  const restore = (v: SectorDraft | undefined) => {
    setFrom(v?.from ?? '');
    setTo(v?.to ?? '');
    setFloor(v?.floor ?? null);
    setVillage(v?.village ?? null);
  };

  /** `field` is the form's `useFieldChain()`, so Next runs through the chainage too. */
  const fields = (errors: Record<string, string>, field: () => Partial<FieldProps> = () => ({})) =>
    p ? (
      <>
        {k.chainage ? (
          <>
            <Input {...field()} label={t('Chainage from')} value={from} onChangeText={setFrom} placeholder={t('e.g. {example}', { example: '14+200' })} keyboardType="numbers-and-punctuation" error={errors.chainageFrom} />
            <Input {...field()} label={t('Chainage to')} value={to} onChangeText={setTo} placeholder={t('Blank for one point')} keyboardType="numbers-and-punctuation" error={errors.chainageTo} />
          </>
        ) : null}
        {k.floor && p.floors.length ? <Chips label={t('Floor')} value={floor} onChange={setFloor} options={p.floors.map((f) => ({ value: f, label: f }))} /> : null}
        {k.village && p.villages.length ? <Select label={t('Village')} value={village} options={p.villages.map((v) => ({ value: v, label: v }))} onChange={setVillage} placeholder={t('Choose village (optional)')} searchable={p.villages.length > 8} /> : null}
      </>
    ) : null;

  return { validate, body, load, clear, fields, value, restore };
}
