/*
 * The hero's art: the sheet a highway is set out on. Survey grid and contours under the whole field; the road itself, with its
 * chainage, transition curves and the day's WMM, running round the headline and behind Ask. Geometry from site-plan.ts.
 */
import React from 'react';
import { chainage, contours, heroAlignment, linePath, METRES_PER_PX, stationAt, stripAlignment, ticks } from './site-plan';
import type { Alignment } from './site-plan';

const SHEET = { w: 1920, h: 1000 };
const CONTOURS = contours(SHEET.w, SHEET.h);
const ROAD = heroAlignment();
const STRIP = stripAlignment();
const HALF = 7;
const WMM = { from: 14200, to: 14650 };

const deg = (r: number) => Math.round((Math.abs(r) * 180) / Math.PI);

/** Survey grid and contours, filling the hero at any size. */
export function HeroGround() {
  return (
    <svg className="lw-ground" viewBox={`0 0 ${SHEET.w} ${SHEET.h}`} preserveAspectRatio="xMidYMid slice" aria-hidden focusable="false">
      <defs>
        <pattern id="lw-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M40 0H0V40" className="lw-grid-line" />
        </pattern>
        <pattern id="lw-grid-cross" width="200" height="200" patternUnits="userSpaceOnUse">
          <path d="M-6 0H6M0 -6V6M194 0H206M200 -6V6M-6 200H6M0 194V206M194 200H206M200 194V206" className="lw-grid-cross" />
        </pattern>
      </defs>
      <rect width={SHEET.w} height={SHEET.h} fill="url(#lw-grid)" />
      <rect width={SHEET.w} height={SHEET.h} fill="url(#lw-grid-cross)" />
      {CONTOURS.map((c) => (
        <path key={c.level} d={c.d} className={c.index ? 'lw-contour lw-contour-index' : 'lw-contour'} />
      ))}
    </svg>
  );
}

/** The road's lines: both edges, the centre line, the ticks with their chainage and the stretch laid today. */
function Road({ a, labelsWhere, drawn = true }: { a: Alignment; labelsWhere: (h: number, x: number) => boolean; drawn?: boolean }) {
  const t = ticks(a, HALF);
  const from = (WMM.from - a.startCh) / METRES_PER_PX;
  const to = (WMM.to - a.startCh) / METRES_PER_PX;
  return (
    <>
      <path d={linePath(a.line, -HALF)} className="lw-road-edge" pathLength={1} data-draw={drawn || undefined} />
      <path d={linePath(a.line, HALF)} className="lw-road-edge" pathLength={1} data-draw={drawn || undefined} />
      <path d={linePath(a.line)} className="lw-road-cl" />
      <path d={t.d} className="lw-road-tick" />
      {t.labels
        .filter((l) => labelsWhere(l.h, l.x))
        .map((l) => (
          <text key={l.text} x={l.x} y={l.y} className="lw-plan-text lw-plan-ch" textAnchor="middle" dominantBaseline="hanging">
            {l.text}
          </text>
        ))}
      <path d={linePath(a.line, 0, from, to, 2)} className="lw-road-today" pathLength={1} />
    </>
  );
}

/** A record the AI reads, where it sits on the road: a point that keeps sending out a ring. */
function ReadPoint({ x, y, delay }: { x: number; y: number; delay: number }) {
  return (
    <g className="lw-read" style={{ animationDelay: `${delay}ms` }}>
      <circle cx={x} cy={y} r={11} className="lw-read-ring" style={{ animationDelay: `${delay + 600}ms` }} />
      <circle cx={x} cy={y} r={4.5} className="lw-read-dot" />
    </g>
  );
}

/** The wide screens' drawing, about the centre of the hero's content (the gap between the words and Ask is x = 0). */
export function HeroPlan() {
  const [c1] = ROAD.curves;
  const wmm = stationAt(ROAD, (WMM.from + WMM.to) / 2);
  const grader = stationAt(ROAD, 16900);
  return (
    <svg className="lw-plan" aria-hidden focusable="false">
      <svg x="50%" y="50%" width="1" height="1" overflow="visible">
        <g className="lw-plan-setout">
          <path d={`M${c1.ts[0]} ${c1.ts[1]}L${c1.pi[0]} ${c1.pi[1]}L${c1.st[0]} ${c1.st[1]}`} className="lw-plan-tangent" />
          <circle cx={c1.pi[0]} cy={c1.pi[1]} r={3.5} className="lw-plan-pi" />
          <text x={c1.pi[0] + 14} y={c1.pi[1] + 18} className="lw-plan-text" dominantBaseline="hanging">
            PI · Δ {deg(c1.turn)}° · R {c1.radius * METRES_PER_PX} m · spiral {c1.spiral * METRES_PER_PX} m
          </text>
        </g>
        <Road a={ROAD} labelsWhere={(h, x) => Math.abs(h) < 0.01 && x < -150} />
        <g className="lw-plan-note">
          <ReadPoint x={wmm.x} y={wmm.y} delay={2200} />
          <text x={wmm.x} y={wmm.y - 44} className="lw-plan-text lw-plan-strong" textAnchor="middle">
            WMM laid, {chainage(WMM.from)} to {chainage(WMM.to)}
          </text>
          <text x={wmm.x} y={wmm.y - 26} className="lw-plan-text" textAnchor="middle">
            296 Cum · approved 18:40
          </text>
        </g>
        <g className="lw-plan-note lw-plan-top">
          <ReadPoint x={grader.x} y={grader.y} delay={2600} />
          <text x={grader.x + 18} y={grader.y - 14} className="lw-plan-text lw-plan-strong">
            GRD-01 motor grader · 35 of 200 h
          </text>
        </g>
        <g className="lw-plan-scale" transform="translate(380 372)">
          <path d="M0 0H100M0 -5V5M50 -3V3M100 -5V5" className="lw-plan-rule" />
          <text x={0} y={12} className="lw-plan-text" textAnchor="middle" dominantBaseline="hanging">
            0
          </text>
          <text x={100} y={12} className="lw-plan-text" textAnchor="middle" dominantBaseline="hanging">
            {100 * METRES_PER_PX} m
          </text>
          <path d="M168 10L176 -14L184 10L176 4Z" className="lw-plan-north" />
          <text x={176} y={16} className="lw-plan-text" textAnchor="middle" dominantBaseline="hanging">
            N
          </text>
        </g>
      </svg>
    </svg>
  );
}

/** The narrow screens' drawing: a strip of the same road between the words and Ask. */
export function HeroStrip() {
  const wmm = stationAt(STRIP, (WMM.from + WMM.to) / 2);
  return (
    <svg className="lw-strip" viewBox="0 0 720 140" preserveAspectRatio="xMinYMid slice" aria-hidden focusable="false">
      <Road a={STRIP} labelsWhere={() => true} />
      <ReadPoint x={wmm.x} y={wmm.y} delay={1600} />
      <text x={24} y={18} className="lw-plan-text lw-plan-strong" dominantBaseline="hanging">
        WMM laid, {chainage(WMM.from)} to {chainage(WMM.to)} · 296 Cum
      </text>
    </svg>
  );
}
