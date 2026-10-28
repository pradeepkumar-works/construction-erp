'use client';

import React from 'react';
import { Radio } from 'antd';
import s from './ChoiceCards.module.css';

export interface Choice<T extends string> {
  value: T;
  label: string;
  description: string;
  picture?: React.ReactNode;
}

/** A choice drawn as cards (Menu and names): a radio group, each card its picture, name and what it gives. */
export function ChoiceCards<T extends string>({ value, onChange, choices, label, disabled }: { value: T; onChange: (v: T) => void; choices: Choice<T>[]; label: string; disabled?: boolean }) {
  return (
    <Radio.Group value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label} disabled={disabled} className={s.cards}>
      {choices.map((c) => (
        <Radio key={c.value} value={c.value} className={s.card}>
          {c.picture}
          <span className={s.name}>{c.label}</span>
          <span className={s.desc}>{c.description}</span>
        </Radio>
      ))}
    </Radio.Group>
  );
}

const blocks = (top: number, left: number) => (
  <>
    <i className={s.block} style={{ top, left, width: 52, height: 18 }} />
    <i className={s.block} style={{ top, left: left + 58, width: 52, height: 18 }} />
    <i className={s.block} style={{ top: top + 24, left, width: 110, height: 8 }} />
  </>
);

/** A small picture of the menu each choice gives: the sidebar, and the top bar in its three looks. */
export function MenuPicture({ kind }: { kind: 'SIDEBAR' | 'NAVY' | 'FRAME' | 'BAR' }) {
  return (
    <span className={s.pic} aria-hidden>
      {kind === 'SIDEBAR' && (
        <>
          <i className={s.side} />
          {blocks(12, 44)}
        </>
      )}
      {kind === 'NAVY' && (
        <>
          <i className={s.navy} />
          <i className={s.row} />
          <i className={s.tab} />
          {blocks(34, 10)}
        </>
      )}
      {kind === 'FRAME' && (
        <>
          <i className={s.frame} />
          <i className={s.sheet} />
          <i className={s.tab} style={{ top: 21 }} />
          {blocks(34, 14)}
        </>
      )}
      {kind === 'BAR' && (
        <>
          <i className={s.white} />
          <i className={s.pill} />
          <i className={`${s.pill} ${s.pillOff}`} />
          {blocks(30, 10)}
        </>
      )}
    </span>
  );
}
