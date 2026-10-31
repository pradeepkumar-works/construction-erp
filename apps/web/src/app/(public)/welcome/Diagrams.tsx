/*
 * The page's small drawings, each the arithmetic of the section it sits in: the road section the day's WMM went into, and the
 * running bill as a waterfall from the value of work to what the client pays.
 */
import React from 'react';
import { formatINRCompact } from '@/lib/format';
import { DEMO_TERMS } from './content';
import type { billOf } from './fragments';

/* The section, in px: 40 px a metre across, the layers five times deeper than true so they can be seen. */
const PX_M = 40;
const DEPTH = 0.2; // px per mm: five times deeper than the 0.04 the widths are drawn at
const SIDE = 2.2;
const EXISTING = 7.0;
const X0 = (600 - (EXISTING + 2 * SIDE) * PX_M) / 2;
const XA = X0 + SIDE * PX_M;
const XB = XA + EXISTING * PX_M;
const X1 = XB + SIDE * PX_M;
const XC = (XA + XB) / 2;
const TOP = 34;
const CAMBER = 0.06; // the 2.5% camber, drawn steeper with the depths

const surface = (x: number) => TOP + Math.abs(x - XC) * CAMBER;

/** A layer between two depths (mm below the surface), from `a` to `b` across, following the camber. */
function band(a: number, b: number, d1: number, d2: number): string {
  const xs = a < XC && b > XC ? [a, XC, b] : [a, b];
  const top = xs.map((x) => `${x.toFixed(1)},${(surface(x) + d1 * DEPTH).toFixed(1)}`);
  const bottom = [...xs].reverse().map((x) => `${x.toFixed(1)},${(surface(x) + d2 * DEPTH).toFixed(1)}`);
  return [...top, ...bottom].join(' ');
}

const LAYERS = [
  { key: 'bc', name: 'BC', mm: 40 },
  { key: 'dbm', name: 'DBM', mm: 60 },
  { key: 'wmm', name: 'WMM, laid today', mm: 150 },
  { key: 'gsb', name: 'GSB', mm: 200 },
] as const;

/** A typical section of the highway's widening: new layers on both sides of the existing road, the WMM picked out. */
export function PavementSection() {
  const bc = 40;
  const dbm = bc + 60;
  const wmm = dbm + 150;
  const gsb = wmm + 200;
  const ground = surface(X1) + gsb * DEPTH;
  const qty = 2 * SIDE * 0.15 * 450;
  return (
    <figure className="lw-section">
      <svg viewBox="0 0 600 190" className="lw-section-art" aria-hidden focusable="false">
        <defs>
          <pattern id="lw-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d="M0 0V8" className="lw-hatch-line" />
          </pattern>
          <pattern id="lw-dots" width="7" height="7" patternUnits="userSpaceOnUse">
            <circle cx="3.5" cy="3.5" r="1.1" className="lw-dot" />
          </pattern>
        </defs>
        <path d={`M${X0 - 40} ${ground + 18}H${X1 + 40}`} className="lw-section-ground" />
        <path
          d={Array.from({ length: 30 }, (_, i) => X0 - 36 + i * 18)
            .map((x) => `M${x} ${ground + 18}l-8 10`)
            .join('')}
          className="lw-section-ground"
        />
        <polygon points={band(XA, XB, dbm, gsb + 80)} className="lw-layer-existing" />
        <polygon points={band(X0, XA, wmm, gsb)} className="lw-layer-gsb" />
        <polygon points={band(XB, X1, wmm, gsb)} className="lw-layer-gsb" />
        <polygon points={band(X0, XA, dbm, wmm)} className="lw-layer-wmm" />
        <polygon points={band(XB, X1, dbm, wmm)} className="lw-layer-wmm" />
        <polygon points={band(X0, X1, bc, dbm)} className="lw-layer-dbm" />
        <polygon points={band(X0, X1, 0, bc)} className="lw-layer-bc" />
        {/* Widths: the widening each side and the road that was there. */}
        <g className="lw-section-dim">
          <path d={`M${X0} 10V${TOP - 6}M${XA} 10V${TOP - 8}M${XB} 10V${TOP - 8}M${X1} 10V${TOP - 6}`} />
          <path d={`M${X0} 16H${X1}`} />
          {[X0, XA, XB, X1].map((x) => (
            <path key={x} d={`M${x - 4} 20L${x + 4} 12`} />
          ))}
        </g>
      </svg>
      <figcaption className="lw-section-key">
        <ul>
          {LAYERS.map((l) => (
            <li key={l.key}>
              <svg className="lw-swatch" viewBox="0 0 22 12" aria-hidden focusable="false">
                <rect x="0.5" y="0.5" width="21" height="11" rx="2" className={`lw-layer-${l.key}`} />
              </svg>
              <span>
                {l.name} <b translate="no">{l.mm} mm</b>
              </span>
            </li>
          ))}
        </ul>
        <p>
          A typical section of the widening, {SIDE} m each side of the existing {EXISTING.toFixed(1)} m road, depths drawn five times
          deeper. Over 450 m that is{' '}
          <span translate="no">
            2 × {SIDE} m × 0.15 m × 450 m = {Math.round(qty)} Cum
          </span>
          , the 296 on the record.
        </p>
      </figcaption>
    </figure>
  );
}

type Bill = ReturnType<typeof billOf>;

/** The bill as a waterfall: the value, GST on top, each deduction off, and what is left to pay. Bars are shares of the most it
 * reaches (value plus GST); what comes off is drawn hollow. */
export function BillWaterfall({ value, bill }: { value: number; bill: Bill }) {
  const top = value + bill.gst || 1;
  const pct = (n: number) => `${((n / top) * 100).toFixed(2)}%`;
  type Step = { key: string; name: string; from: number; to: number; kind: 'total' | 'add' | 'less' };
  const steps: Step[] = [{ key: 'value', name: 'Value of work', from: 0, to: value, kind: 'total' }];
  steps.push({ key: 'gst', name: `GST ${DEMO_TERMS.gstPct}%`, from: value, to: value + bill.gst, kind: 'add' });
  let level = value + bill.gst;
  for (const l of bill.lines) {
    steps.push({ key: l.short, name: `${l.short[0].toUpperCase()}${l.short.slice(1)} ${l.pct}%`, from: level - l.amount, to: level, kind: 'less' });
    level -= l.amount;
  }
  steps.push({ key: 'net', name: 'Net payable', from: 0, to: bill.net, kind: 'total' });
  return (
    <ol className="lw-fall" aria-hidden data-ui>
      {steps.map((s) => (
        <li key={s.key} className={`lw-fall-${s.kind}`}>
          <span className="lw-fall-name">{s.name}</span>
          <span className="lw-fall-track">
            <i style={{ left: pct(s.from), width: pct(Math.max(0, s.to - s.from)) }} />
          </span>
          <span className="lw-fall-amount" translate="no">
            {s.kind === 'less' ? '−' : s.kind === 'add' ? '+' : ''}
            {formatINRCompact(s.to - s.from)}
          </span>
        </li>
      ))}
    </ol>
  );
}
