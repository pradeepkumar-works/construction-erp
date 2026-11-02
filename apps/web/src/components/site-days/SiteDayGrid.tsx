'use client';

import React from 'react';
import { dayColumns, dayGrid, plural, type ProjectSummary } from '@erp/shared';
import { tk } from '@/ds';
import { useProjects } from '@/lib/queries';
import { EmptyArt } from '@/components/common/EmptyArt';
import { PageSkeleton } from '@/components/common/QueryState';
import { DayGridView, DayMark, type DayLegendItem } from '@/components/list/ListViewsOfData';

const DEFAULT_DAYS = 14;

/** The key for a grid of submissions (daily reports): one line per mark, in the order a day moves through. */
export const SUBMISSION_DAY_LEGEND: readonly DayLegendItem[] = [
  { key: 'done', mark: <DayMark meaning="done" />, label: 'Approved' },
  { key: 'waiting', mark: <DayMark meaning="waiting" />, label: 'Waiting for approval' },
  { key: 'inHand', mark: <DayMark meaning="inHand" />, label: 'Draft' },
  { key: 'failed', mark: <DayMark meaning="failed" />, label: 'Sent back or rejected' },
];
const MAX_DAYS = 31;
const DAY_MS = 86_400_000;

/**
 * The days a grid of sites shows: the list's date range when one is set, else the last two weeks; never past today, so
 * a day still to come is not read as missed, and at most a month, the latest days kept.
 */
export function gridDays(from: string | undefined, to: string | undefined, today: string): string[] {
  const end = to && to < today ? to : today;
  const span = from && from <= end ? (Date.parse(end) - Date.parse(from)) / DAY_MS + 1 : DEFAULT_DAYS;
  return dayColumns(end, Math.min(span, MAX_DAYS));
}

/**
 * The sites that file a record each day: the active projects, leaving out central stores and plants (CLAUDE.md "Central
 * store"); the header's project narrows it to that one.
 */
export function useFilingSites(projectId: string | undefined) {
  const { data, isLoading } = useProjects();
  const sites = (data ?? []).filter((p) => (projectId ? p.id === projectId : p.status === 'ACTIVE' && p.type !== 'STORE' && p.type !== 'PLANT'));
  return { sites, isLoading };
}

/**
 * A record filed by each site each day as sites by days (`DayGridView`): every site has a row, so one that did not file
 * shows its empty days and leads the list. The row head is the site's code and name, and how many days it missed.
 */
export function SiteDayGrid<T extends { projectId: string; date: string }>({
  label,
  sites,
  entries,
  days,
  cell,
  loading,
  shown,
  total,
  missingWord,
  legend,
}: {
  label: string;
  sites: ProjectSummary[];
  entries: T[];
  days: string[];
  cell: (entries: T[], day: string, site: ProjectSummary) => React.ReactNode;
  loading: boolean;
  /** How many entries came back, and how many the window holds; fewer back than there are means the oldest days are short. */
  shown: number;
  total: number;
  missingWord: string;
  /** The marks the cells use (`SUBMISSION_DAY_LEGEND`); a grid of counts has none. */
  legend?: readonly DayLegendItem[];
}) {
  const box = React.useRef<HTMLDivElement>(null);
  const ready = !loading && sites.length > 0;
  const span = `${days[0]}/${days[days.length - 1]}`;
  // The latest day is on the right, and it is the one asked about: open the grid scrolled to it.
  React.useLayoutEffect(() => {
    const region = box.current?.querySelector('[data-scroll-region]');
    if (ready && region) region.scrollLeft = region.scrollWidth;
  }, [ready, span]);
  if (loading) return <PageSkeleton header={false} />;
  if (!sites.length) return <EmptyArt art="entries" title="No active site yet. A project shows here once it is active." />;
  const rows = dayGrid(entries, { places: sites, placeKey: (p) => p.id, days, placeOf: (e) => e.projectId, dayOf: (e) => e.date });
  return (
    // Positioned and clipped: an empty cell's hidden words are placed against it, so they cannot widen the page.
    <div ref={box} style={{ position: 'relative', overflowX: 'clip' }}>
      {total > shown ? (
        <p style={{ ...tk.type.caption, color: tk.color.text.muted, margin: 0, marginBlockEnd: tk.space[2] }}>
          The latest {shown} of {total} are shown, so the oldest days may be short. Choose fewer days or one project to see them all.
        </p>
      ) : null}
      <DayGridView<ProjectSummary, T>
        label={label}
        rows={rows}
        days={days}
        placeKey={(p) => p.id}
        cell={cell}
        missingWord={missingWord}
        legend={legend}
        place={(site, missing) => (
          <>
            <span translate="no">
              <span style={tk.type.strong}>{site.code}</span> {site.name}
            </span>
            {missing ? <span style={{ display: 'block', ...tk.type.caption, color: tk.color.text.muted }}>{plural(missing, 'day')} missing</span> : null}
          </>
        )}
      />
    </div>
  );
}
