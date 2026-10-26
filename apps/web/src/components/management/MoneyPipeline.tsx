'use client';

import React from 'react';
import { Grid, theme } from 'antd';
import { formatINRCompact, toNumber } from '@/lib/format';

export interface PipelineMoney {
  contractValue: string | null;
  workDone: string;
  billed: string;
  certified: string;
  paid: string;
  unbilled: string;
}

/**
 * The money pipeline, the management dashboard's own drawing: the contract, then work done, billed, certified by the client
 * and paid, each a bar on one scale, with what sits between two stages said in words. One hue: the gaps are the story, so
 * they are words rather than colours.
 */
export function MoneyPipeline({ money }: { money: PipelineMoney }) {
  const { token } = theme.useToken();
  const wide = Grid.useBreakpoint().sm !== false;
  const contract = money.contractValue === null ? null : toNumber(money.contractValue);
  const done = toNumber(money.workDone);
  const billed = toNumber(money.billed);
  const certified = toNumber(money.certified);
  const paid = toNumber(money.paid);
  const scale = Math.max(contract ?? 0, done, billed, 1);
  const gap = (v: number) => (v > 0.5 ? v : 0);
  const stages: {
    key: string;
    label: string;
    value: number | null;
    after?: React.ReactNode;
  }[] = [
    {
      key: 'contract',
      label: 'Contract',
      value: contract,
      after:
        contract !== null && gap(contract - done) ? (
          <>
            <Money v={contract - done} /> of work still to do
          </>
        ) : null,
    },
    {
      key: 'done',
      label: 'Work done',
      value: done,
      after: gap(toNumber(money.unbilled)) ? (
        <>
          <Money v={toNumber(money.unbilled)} /> done and not billed
        </>
      ) : (
        'Everything done is billed'
      ),
    },
    {
      key: 'billed',
      label: 'Billed',
      value: billed,
      after: gap(billed - certified) ? (
        <>
          <Money v={billed - certified} /> billed and waiting for the client’s certificate
        </>
      ) : null,
    },
    {
      key: 'certified',
      label: 'Certified',
      value: certified,
      after: gap(certified - paid) ? (
        <>
          <Money v={certified - paid} /> certified and not paid
        </>
      ) : null,
    },
    { key: 'paid', label: 'Paid', value: paid },
  ];
  return (
    <ol aria-label="Money from contract to paid" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {stages.map((s) => (
        <li key={s.key}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: wide ? '96px minmax(0, 1fr) 104px' : 'minmax(0, 1fr) auto',
              alignItems: 'center',
              columnGap: token.marginSM,
              rowGap: token.marginXXS,
              minHeight: 28,
            }}
          >
            <span style={{ color: token.colorTextSecondary }}>{s.label}</span>
            {wide ? <Bar share={s.value === null ? 0 : s.value / scale} /> : null}
            <span className="mono" translate="no" style={{ textAlign: 'right', fontWeight: token.fontWeightStrong }}>
              {s.value === null ? 'No contract value' : formatINRCompact(s.value)}
            </span>
            {wide ? null : (
              <div style={{ gridColumn: '1 / -1' }}>
                <Bar share={s.value === null ? 0 : s.value / scale} />
              </div>
            )}
          </div>
          {s.after ? (
            <p
              style={{
                margin: `${token.marginXXS}px 0 ${token.marginXS}px`,
                paddingInlineStart: wide ? 96 + token.marginSM : 0,
                color: token.colorTextSecondary,
                fontSize: token.fontSizeSM,
              }}
            >
              {s.after}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function Money({ v }: { v: number }) {
  const { token } = theme.useToken();
  return (
    <span className="mono" translate="no" style={{ color: token.colorText, fontWeight: token.fontWeightStrong }}>
      {formatINRCompact(v)}
    </span>
  );
}

function Bar({ share }: { share: number }) {
  const { token } = theme.useToken();
  const w = Math.max(0, Math.min(1, share)) * 100;
  return (
    <span
      aria-hidden
      style={{
        display: 'block',
        height: 8,
        borderRadius: 4,
        background: token.colorFillSecondary,
        overflow: 'hidden',
      }}
    >
      <span
        style={{
          display: 'block',
          height: '100%',
          width: `${w}%`,
          minWidth: w > 0 ? 4 : 0,
          borderRadius: 4,
          background: token.colorPrimary,
        }}
      />
    </span>
  );
}

/**
 * Done against planned (a bullet): the bar is the work done, the upright tick where the plan says it should be by today.
 * Behind plan reads in the words beside it, not in the bar's colour.
 */
export function ScheduleBullet({ done, planned, label }: { done: number; planned: number | null; label: string }) {
  const { token } = theme.useToken();
  const d = Math.max(0, Math.min(100, done));
  const p = planned === null ? null : Math.max(0, Math.min(100, planned));
  return (
    <span
      role="img"
      aria-label={label}
      style={{
        position: 'relative',
        display: 'block',
        height: 14,
        minWidth: 72,
      }}
    >
      <span
        style={{
          position: 'absolute',
          insetInline: 0,
          top: 3,
          height: 8,
          borderRadius: 4,
          background: token.colorFillSecondary,
        }}
      />
      <span
        style={{
          position: 'absolute',
          insetInlineStart: 0,
          top: 3,
          height: 8,
          width: `${d}%`,
          minWidth: d > 0 ? 4 : 0,
          borderRadius: 4,
          background: token.colorPrimary,
        }}
      />
      {p !== null ? (
        <span
          style={{
            position: 'absolute',
            top: 0,
            height: 14,
            width: 2,
            insetInlineStart: `calc(${p}% - 1px)`,
            background: token.colorText,
            borderRadius: 1,
          }}
        />
      ) : null}
    </span>
  );
}

/**
 * Cost against budget (a plan track): the track is the budget, the bar what is spent, and any spend past the budget runs
 * on in the danger colour; the tick is the forecast at completion. Pass every row the same `scale`.
 */
export function BudgetTrack({
  actual,
  budget,
  forecast,
  scale: shared,
  label,
}: {
  actual: number;
  budget: number | null;
  forecast: number | null;
  scale?: number;
  label: string;
}) {
  const { token } = theme.useToken();
  // One scale for every head (`scale`), so the bars compare across rows; else the row's own largest figure.
  const scale = Math.max(shared ?? 0, budget ?? 0, actual, forecast ?? 0, 1);
  const within = budget === null ? actual : Math.min(actual, budget);
  const over = budget === null ? 0 : Math.max(0, actual - budget);
  const pct = (v: number) => `${(v / scale) * 100}%`;
  return (
    <span
      role="img"
      aria-label={label}
      style={{
        position: 'relative',
        display: 'block',
        height: 14,
        minWidth: 96,
      }}
    >
      {budget !== null ? (
        <span
          style={{
            position: 'absolute',
            insetInlineStart: 0,
            top: 3,
            height: 8,
            width: pct(budget),
            borderRadius: 4,
            background: token.colorFillSecondary,
          }}
        />
      ) : null}
      <span
        style={{
          position: 'absolute',
          insetInlineStart: 0,
          top: 3,
          height: 8,
          width: pct(within),
          minWidth: within > 0 ? 4 : 0,
          borderRadius: 4,
          background: token.colorPrimary,
        }}
      />
      {over > 0 ? (
        <span
          style={{
            position: 'absolute',
            insetInlineStart: `calc(${pct(budget!)} + 2px)`,
            top: 3,
            height: 8,
            width: `calc(${pct(over)} - 2px)`,
            borderRadius: 4,
            background: token.colorError,
          }}
        />
      ) : null}
      {forecast !== null ? (
        <span
          style={{
            position: 'absolute',
            top: 0,
            height: 14,
            width: 2,
            insetInlineStart: `calc(${pct(forecast)} - 1px)`,
            background: token.colorText,
            borderRadius: 1,
          }}
        />
      ) : null}
    </span>
  );
}
