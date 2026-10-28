import React from 'react';
import { ownFieldLabel, type DprOwnField } from '@erp/shared';
import { Chips, DatePicker, Input, Select, TimePicker } from '../components';
import { useLanguage, useT } from '../i18n/LanguageContext';

/** The values of the company's own DPR fields (item 134 part 2) as the phone holds them: text, by key. */
export type OwnValues = Record<string, string>;

/** The values as the API takes them: blank ones left out; the API reads numbers and yes / no from the text. */
export const ownPayload = (fields: DprOwnField[], v: OwnValues | undefined): Record<string, string> =>
  Object.fromEntries(fields.flatMap((f) => (v?.[f.key]?.trim() ? [[f.key, v[f.key].trim()]] : [])));

/** Saved or queued values back into the form. */
export const ownValuesFrom = (v: Record<string, unknown> | null | undefined): OwnValues =>
  Object.fromEntries(Object.entries(v ?? {}).flatMap(([k, x]) => (x === null || x === undefined ? [] : [[k, x === true ? 'yes' : x === false ? 'no' : String(x)]])));

/**
 * What is wrong with the values, in the phone's language: `required` only when the report is being sent. Mirrors the
 * API's `readExtra`, which has the last word.
 */
export function ownProblems(fields: DprOwnField[], v: OwnValues | undefined, t: ReturnType<typeof useT>, language: 'en' | 'hi', prefix = ''): string | null {
  for (const f of fields) {
    const label = ownFieldLabel(f, language);
    const raw = v?.[f.key]?.trim() ?? '';
    if (!raw) {
      if (f.required) return prefix + (f.kind === 'YES_NO' || f.kind === 'CHOICE' ? t('Choose {label}', { label }) : t('Fill in {label}', { label }));
      continue;
    }
    if (f.kind === 'NUMBER') {
      const n = Number(raw);
      if (Number.isNaN(n)) return prefix + t('{label}: enter a number', { label });
      if (f.min !== null && n < f.min) return prefix + t('{label}: enter {min} or more', { label, min: f.min });
      if (f.max !== null && n > f.max) return prefix + t('{label}: enter up to {max}', { label, max: f.max });
    }
  }
  return null;
}

/** The inputs of the company's own fields, each by its kind, named in Hindi when the phone is in Hindi and the field has it. */
export function OwnFieldInputs({ fields, values, onChange }: { fields: DprOwnField[]; values: OwnValues | undefined; onChange: (v: OwnValues) => void }) {
  const t = useT();
  const { language } = useLanguage();
  const set = (key: string, x: string) => onChange({ ...(values ?? {}), [key]: x });
  return (
    <>
      {fields.map((f) => {
        const label = f.unit ? `${ownFieldLabel(f, language)} (${f.unit})` : ownFieldLabel(f, language);
        const value = values?.[f.key] ?? '';
        switch (f.kind) {
          case 'YES_NO':
            return (
              <Chips
                key={f.key}
                label={label}
                required={f.required}
                value={value === 'yes' || value === 'no' ? value : null}
                options={[
                  { value: 'yes', label: t('Yes') },
                  { value: 'no', label: t('No') },
                ]}
                onChange={(x) => set(f.key, x ?? '')}
              />
            );
          case 'CHOICE':
            return f.options.length <= 4 ? (
              <Chips key={f.key} label={label} required={f.required} value={value || null} options={f.options.map((o) => ({ value: o, label: o }))} onChange={(x) => set(f.key, x ?? '')} />
            ) : (
              <Select key={f.key} label={label} required={f.required} value={value || null} options={f.options.map((o) => ({ value: o, label: o }))} onChange={(x) => set(f.key, x)} placeholder={t('Choose')} />
            );
          case 'DATE':
            return <DatePicker key={f.key} label={label} required={f.required} value={value} onChange={(x) => set(f.key, x)} />;
          case 'TIME':
            return <TimePicker key={f.key} label={label} required={f.required} value={value} onChange={(x) => set(f.key, x)} />;
          case 'NUMBER':
            return <Input key={f.key} label={label} required={f.required} value={value} onChangeText={(x) => set(f.key, x)} keyboardType="decimal-pad" />;
          default:
            return <Input key={f.key} label={label} required={f.required} value={value} onChangeText={(x) => set(f.key, x)} multiline={f.kind === 'LONG_TEXT'} maxLength={f.kind === 'LONG_TEXT' ? 1000 : 200} />;
        }
      })}
    </>
  );
}
