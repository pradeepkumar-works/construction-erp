'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Button, Collapse, Descriptions } from 'antd';
import type { DescriptionsProps } from 'antd';
import type { FigureInput } from '@erp/shared';
import { Figures } from '@/components/figures';
import { tk } from '@/ds';

/**
 * The parts every record shares (ARCHITECTURE "Records lead with the decision"): the project it belongs to under its
 * title, the figures the decision rests on, the facts with the reference ones folded, checks first and empty sections
 * folded into one line. RecordFrame draws them in the drawer, on the page and in the inbox's pane.
 */

type Facts = NonNullable<DescriptionsProps['items']>;

/** The project (or vendor, or client) a record belongs to: under its title, linked where it has a page. */
export interface RecordContext {
  label: string;
  href?: string;
}

/** A record's project as its context line: under the title, linked to the project. */
export const projectContext = (r: { projectId: string; projectName: string }): RecordContext => ({ label: r.projectName, href: `/projects/${r.projectId}` });

/** Who submitted and reviewed an entry and when: History says it, so the facts do not say it again. */
const HISTORY_KEYS = new Set(['by', 'reviewed']);

/**
 * The facts as a record shows them. The status is the tag beside the title, who did what and when is History's,
 * and the project is the line under the title, so `submissionMetaItems`' copies of them leave the grid.
 */
export function liftFacts(facts: Facts, opts: { context?: RecordContext; history: boolean }): { facts: Facts; context?: RecordContext } {
  let context = opts.context;
  const kept = facts.filter((f) => {
    const key = String(f.key ?? '');
    if (key === 'status') return false;
    if (opts.history && HISTORY_KEYS.has(key)) return false;
    if (key === 'project') {
      if (!context && typeof f.children === 'string' && f.children) context = { label: f.children };
      return !context;
    }
    return true;
  });
  return { facts: kept, context };
}

/** The project line under a record's title. */
export function ContextLine({ context }: { context?: RecordContext }) {
  if (!context) return null;
  return (
    <span translate="no" style={{ ...tk.type.body, color: tk.color.text.muted }}>
      {context.href ? (
        <Link href={context.href} className="text-link">
          {context.label}
        </Link>
      ) : (
        context.label
      )}
    </span>
  );
}

/** The figures a decision on this record rests on, in the one headline block. */
export function RecordHeadline({ figures }: { figures?: readonly FigureInput[] }) {
  if (!figures?.some(Boolean)) return null;
  return (
    <div style={{ marginBottom: tk.space[4] }}>
      <Figures label="Key figures" figures={figures} />
    </div>
  );
}

/** Reference facts (agreement, work order, address, terms): folded under Details, open on a tap. */
export function RecordDetails({ items, column }: { items?: Facts; column: DescriptionsProps['column'] }) {
  if (!items?.length) return null;
  return (
    <Collapse
      size="small"
      ghost
      style={{ marginBottom: tk.space[4] }}
      items={[{ key: 'details', label: `Details (${items.length})`, children: <Descriptions size="small" column={column} bordered items={items} /> }]}
    />
  );
}

/** A section as the frame orders it: Checks first, then the rest as the record gave them. */
export function checksFirst<S extends { key: string }>(sections: readonly S[]): S[] {
  return [...sections.filter((s) => s.key === 'checks'), ...sections.filter((s) => s.key !== 'checks')];
}

/**
 * Sections with nothing in them leave the page and the anchor bar for one quiet line ("Nothing yet: Photos, Documents");
 * a name in it opens that section where it stands, so a first comment or photo is still one tap away.
 */
export function useFoldedSections<S extends { key: string; title: string; empty?: boolean }>(sections: readonly S[]): { shown: S[]; folded: S[]; open: (key: string) => void } {
  const [opened, setOpened] = useState<ReadonlySet<string>>(new Set());
  const shown = sections.filter((s) => !s.empty || opened.has(s.key));
  const folded = sections.filter((s) => s.empty && !opened.has(s.key));
  return { shown, folded, open: (key) => setOpened((o) => new Set(o).add(key)) };
}

/** The line that stands for the empty sections. */
export function FoldedLine({ folded, open }: { folded: readonly { key: string; title: string }[]; open: (key: string) => void }) {
  if (!folded.length) return null;
  return (
    <p data-folded-sections style={{ ...tk.type.body, color: tk.color.text.muted, margin: `${tk.space[2]} 0 ${tk.space[4]}` }}>
      Nothing yet:{' '}
      {folded.map((s, i) => (
        <React.Fragment key={s.key}>
          {i ? ', ' : ''}
          <Button type="link" size="small" onClick={() => open(s.key)} style={{ paddingInline: 0 }} aria-label={`Open ${s.title}`}>
            {s.title}
          </Button>
        </React.Fragment>
      ))}
    </p>
  );
}
