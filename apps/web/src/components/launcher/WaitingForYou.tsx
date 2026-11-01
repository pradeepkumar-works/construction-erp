'use client';

import React from 'react';
import Link from 'next/link';
import { Skeleton } from 'antd';
import type { AuthUser, MyWorkCard, MyWorkDto } from '@erp/shared';
import { useMyWork } from '@/lib/queries';
import { formatINRCompact } from '@/lib/format';
import { CheckSquareOutlined } from '@/components/common/icons';
import { APPROVALS_TITLE, CARDS, amountOf, countWords, myWorkOrder, unitOf, urgencyOf } from '@/components/home/MyWorkPanel';
import { AppTag } from '@/components/common/AppTag';
import { tk } from '@/ds';
import { homeLayout, type MyWorkKey } from '@/components/home/layout';
import s from './HomeLauncher.module.css';

/** How many of My work's cards Home leads with. */
const SHOWN = 3;

const countOf = (data: MyWorkDto, k: MyWorkKey) => (k === 'approvals' ? (data.approvals ?? []).reduce((n, a) => n + a.count, 0) : (data[k] as MyWorkCard).count);

/** One card as a line: its title, the most pressing entry, its rupees or its count, and whether it is past its mark. */
function entryOf(data: MyWorkDto, k: MyWorkKey) {
  const amount = amountOf(data, k);
  const late = urgencyOf(data, k) > 0;
  if (k === 'approvals') {
    const d = data.approvalsWaitingDays;
    return { title: APPROVALS_TITLE, icon: <CheckSquareOutlined />, href: '/approvals', note: d ? `Oldest waiting ${d} day${d === 1 ? '' : 's'}` : 'All sent today', amount, late };
  }
  const card = data[k] as MyWorkCard;
  const meta = CARDS[k];
  const first = card.items[0];
  return {
    title: meta.title,
    icon: meta.icon,
    href: card.href ?? meta.href ?? first?.href ?? '/my-work',
    note: first ? [first.label, first.note].filter(Boolean).join(' · ') : '',
    amount,
    late,
  };
}

/**
 * Home's first section: the first three of My work's cards for the caller's role in My work's own order (`myWorkOrder`:
 * the bigger money, then the later, then the role's layout), each opening its list, and a link to the rest.
 */
export function WaitingForYou({ user }: { user: AuthUser }) {
  const { data, isPending, isError } = useMyWork();
  if (isError) return null;
  const order = homeLayout(user.roleKey).myWork;
  const busy = data ? myWorkOrder(data, order, (k) => countOf(data, k)) : [];
  return (
    <section aria-labelledby="home-waiting" className={s.section}>
      <h2 id="home-waiting" className={s.sectionTitle}>
        Waiting for you
      </h2>
      {isPending ? (
        // As many lines as it will show, plus All my work, so nothing below moves when it loads.
        <ul className={s.waitList} aria-hidden>
          {Array.from({ length: SHOWN + 1 }, (_, i) => (
            <li key={i}>
              <Skeleton.Button active block style={{ height: 64 }} />
            </li>
          ))}
        </ul>
      ) : !data || busy.length === 0 ? (
        <p className={s.emptyText}>
          Nothing waits for you right now. <Link href="/my-work">Open My work</Link>
        </p>
      ) : (
        <ul className={s.waitList}>
          {busy.slice(0, SHOWN).map((k) => {
            const e = entryOf(data, k);
            const n = countOf(data, k);
            return (
              <li key={k}>
                <Link href={e.href} className={`${s.recent} ${s.wait}`}>
                  <span className={s.recentIcon} aria-hidden>
                    {e.icon}
                  </span>
                  <span className={s.recentText}>
                    <span className={s.recentLabel}>{e.title}</span>
                    <span className={s.recentKind}>
                      {e.late && <AppTag meaning="failed">Overdue</AppTag>}
                      {[e.amount ? countWords(n, unitOf(k)) : null, e.note].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  {/* Rupees lead where there are rupees; the count where there are none. */}
                  <span className={s.waitCount} translate="no" style={tk.type.figure}>
                    {e.amount ? formatINRCompact(e.amount) : n}
                  </span>
                </Link>
              </li>
            );
          })}
          <li>
            <Link href="/my-work" className={`${s.recent} ${s.wait}`}>
              <span className={s.recentText}>
                <span className={s.recentLabel}>All my work</span>
                <span className={s.recentKind}>{busy.length > SHOWN ? `${busy.length - SHOWN} more waiting` : 'Every list in one place'}</span>
              </span>
            </Link>
          </li>
        </ul>
      )}
    </section>
  );
}
