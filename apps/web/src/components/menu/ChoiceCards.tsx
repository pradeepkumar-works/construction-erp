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
export function ChoiceCards<T extends string>({ value, onChange, choices, label, disabled, compact }: { value: T; onChange: (v: T) => void; choices: Choice<T>[]; label: string; disabled?: boolean; compact?: boolean }) {
  return (
    <Radio.Group value={value} onChange={(e) => onChange(e.target.value as T)} aria-label={label} disabled={disabled} className={compact ? `${s.cards} ${s.compact}` : s.cards}>
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

/** A small picture of the menu each choice gives: the sidebar in its three looks, and the top bar in its three. */
export function MenuPicture({ kind }: { kind: 'SIDEBAR' | 'HEADER' | 'FLOATING' | 'NAVY' | 'FRAME' | 'BAR' }) {
  return (
    <span className={s.pic} aria-hidden>
      {kind === 'SIDEBAR' && (
        <>
          <i className={s.side} />
          {blocks(12, 44)}
        </>
      )}
      {kind === 'HEADER' && (
        <>
          <i className={s.side} />
          <i className={s.navy} />
          {blocks(24, 44)}
        </>
      )}
      {kind === 'FLOATING' && (
        <>
          <i className={`${s.side} ${s.floating}`} />
          {blocks(12, 50)}
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

/**
 * A picture of the menu in a palette's colours: the rail with its words, the chosen page and a count, beside the page.
 * `style` carries the palette's chrome variables (`chromeStyle`), so the picture is drawn exactly as the menu will be.
 */
export function ColourPicture({ style }: { style?: React.CSSProperties }) {
  return (
    <span className={s.pic} style={style} aria-hidden>
      <i className={s.rail} />
      <i className={s.ink} style={{ top: 10, width: 26 }} />
      <i className={`${s.ink} ${s.inkQuiet}`} style={{ top: 24, width: 18 }} />
      <i className={s.chosen} />
      <i className={s.ink} style={{ top: 50, width: 22 }} />
      <i className={s.ink} style={{ top: 62, width: 16 }} />
      {blocks(12, 76)}
    </span>
  );
}
