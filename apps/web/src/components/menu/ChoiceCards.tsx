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

export type MenuPictureKind = 'SIDEBAR' | 'FLOATING' | 'NAVY' | 'FRAME' | 'BAR' | 'TOP_AND_SIDE' | 'TWO_BARS' | 'TWO_SIDEBARS';

/** One part of a pictured menu, in the menu's colours or plain (with a hairline where it meets the page). */
function Part({ on, edge, style }: { on: boolean; edge: 'r' | 'b'; style: React.CSSProperties }) {
  return <i className={[on ? s.fill : s.plainPart, !on && (edge === 'r' ? s.edgeR : s.edgeB)].filter(Boolean).join(' ')} style={style} />;
}

/** Three module names on a pictured bar. */
const marks = (on: boolean, top: number, left: number) =>
  [0, 1, 2].map((i) => <i key={i} className={on ? s.markOn : s.markOff} style={{ top, left: left + i * 22, width: 16, height: 4 }} />);

/**
 * A small picture of the menu each choice gives: the five layouts with their parts in colour or plain (`paint`, from
 * `navPainted`), the sidebar floating, and the top bar layout's three looks.
 */
export function MenuPicture({ kind, paint = { side: true, top: false } }: { kind: MenuPictureKind; paint?: { side: boolean; top: boolean } }) {
  return (
    <span className={s.pic} aria-hidden>
      {kind === 'SIDEBAR' && (
        <>
          <Part on={paint.side} edge="r" style={{ top: 0, bottom: 0, left: 0, width: 34 }} />
          <Part on={paint.top} edge="b" style={{ top: 0, left: 34, right: 0, height: 14 }} />
          {blocks(24, 44)}
        </>
      )}
      {kind === 'FLOATING' && (
        <>
          <i className={`${s.side} ${s.floating}`} />
          {blocks(12, 50)}
        </>
      )}
      {kind === 'TWO_SIDEBARS' && (
        <>
          <Part on={paint.side} edge="r" style={{ top: 0, bottom: 0, left: 0, width: 14 }} />
          <Part on={paint.side} edge="r" style={{ top: 0, bottom: 0, left: 14, width: 30 }} />
          <i className={paint.side ? s.markOn : s.markOff} style={{ top: 0, bottom: 0, left: 14, width: 1, height: 'auto' }} />
          <Part on={paint.top} edge="b" style={{ top: 0, left: 44, right: 0, height: 14 }} />
          {blocks(24, 52)}
        </>
      )}
      {kind === 'TOP_AND_SIDE' && (
        <>
          <Part on={paint.top} edge="b" style={{ top: 0, left: 0, right: 0, height: 14 }} />
          {marks(paint.top, 5, 28)}
          <Part on={paint.side} edge="r" style={{ top: 14, bottom: 0, left: 0, width: 34 }} />
          {blocks(24, 44)}
        </>
      )}
      {kind === 'TWO_BARS' && (
        <>
          <Part on={paint.top} edge="b" style={{ top: 0, left: 0, right: 0, height: 14 }} />
          {marks(paint.top, 5, 28)}
          <Part on={paint.side} edge="b" style={{ top: 14, left: 0, right: 0, height: 11 }} />
          <i className={paint.side ? s.markOn : s.tab} style={{ top: 23, left: 10, width: 22, height: 2 }} />
          {blocks(34, 10)}
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
