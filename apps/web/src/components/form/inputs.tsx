'use client';

import React from 'react';
import { InputNumber } from 'antd';
import type { InputNumberProps } from 'antd';
import type { Rule } from 'antd/es/form';
import { GSTIN_PATTERN, IFSC_PATTERN, PAN_PATTERN } from '@erp/shared';

const grouped = (precision: number) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: precision });
const MONEY = grouped(2);
const QTY = grouped(3);

type NumberProps = Omit<InputNumberProps<number>, 'formatter' | 'parser'>;

/** Takes "1,23,456.50" or "₹ 1,23,456.5" back to the number. */
const parse = (s: string | undefined) => Number((s ?? '').replace(/[₹,\s]/g, '')) as unknown as number;

/**
 * A rupee amount: ₹ in front, Indian grouping (12,34,567.50) once the field is left, the number keypad
 * on phones, and no spinner. Gives a number, like `InputNumber`.
 */
export function MoneyInput({ style, ...rest }: NumberProps) {
  return (
    <InputNumber<number>
      prefix="₹"
      min={0}
      precision={2}
      controls={false}
      inputMode="decimal"
      formatter={(v, info) => (info.userTyping ? info.input : v === undefined || v === null || (v as unknown) === '' ? '' : MONEY.format(Number(v)))}
      parser={parse}
      style={{ width: '100%', ...style }}
      {...rest}
    />
  );
}

/** A quantity with its unit after it (12.500 Cum), the number keypad on phones, and no spinner. */
export function QuantityInput({ unit, style, ...rest }: NumberProps & { unit?: string | null }) {
  return (
    <InputNumber<number>
      min={0}
      precision={3}
      controls={false}
      inputMode="decimal"
      suffix={unit || undefined}
      formatter={(v, info) => (info.userTyping ? info.input : v === undefined || v === null || (v as unknown) === '' ? '' : QTY.format(Number(v)))}
      parser={parse}
      style={{ width: '100%', ...style }}
      {...rest}
    />
  );
}

/** Spread on an `Input` for a phone number: the phone keypad and autofill. */
export const PHONE_INPUT = { type: 'tel', inputMode: 'tel', autoComplete: 'tel', placeholder: '98765 43210', maxLength: 20 } as const;
/** Spread on an `Input` for an email address: the email keyboard, no capitals or spell check. */
export const EMAIL_INPUT = { type: 'email', inputMode: 'email', autoComplete: 'email', autoCapitalize: 'none', spellCheck: false, placeholder: 'name@company.com' } as const;
/** Spread on an `Input` for a code typed in capitals (GSTIN, PAN, IFSC): capitals on the keyboard, no spell check. */
export const CODE_INPUT = { autoCapitalize: 'characters', spellCheck: false, autoComplete: 'off', translate: 'no' } as const;

/** Indian mobile or landline: 10 to 13 digits, with an optional +, spaces or dashes. */
export const phoneRule: Rule = { pattern: /^\+?[0-9][0-9\s-]{8,15}$/, message: 'Enter a phone number, e.g. 98765 43210' };
export const emailRule: Rule = { type: 'email', message: 'Enter an email address, e.g. name@company.com' };
export const gstinRule: Rule = { pattern: GSTIN_PATTERN, message: 'A GSTIN is 15 characters, e.g. 27ABCDE1234F1Z5' };
export const panRule: Rule = { pattern: PAN_PATTERN, message: 'A PAN is 10 characters, e.g. ABCDE1234F' };
export const ifscRule: Rule = { pattern: IFSC_PATTERN, message: 'An IFSC is 11 characters, e.g. SBIN0001234' };

/** Codes are kept in capitals whatever was typed (use as a Form.Item `normalize`). */
export const upper = (v: string | undefined) => (typeof v === 'string' ? v.toUpperCase() : v);
