'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import dayjs, { type Dayjs } from 'dayjs';
import { Flex, Image, Segmented, Typography } from 'antd';
import { photoDays, photoPlaceWords, plural, type PhotoPlaceKind, type SitePhotoDto, type SitePhotoSource } from '@erp/shared';
import { tk } from '@/ds';
import { fileUrl } from '@/lib/api';
import { useSitePhotos } from '@/lib/queries';
import { formatLongDay } from '@/lib/format';
import { rangePresets } from '@/lib/dates';
import { AppTag } from '@/components/common/AppTag';
import { DatePicker } from '@/components/common/DatePicker';
import { Section, SectionStack } from '@/components/common/Section';
import { Loading, QueryError } from '@/components/common/QueryState';

const RECORD_PATH: Record<SitePhotoSource, string> = { PROGRESS: '/progress', DPR: '/dpr', INSPECTION: '/inspections' };
const MEANING = { AT_SITE: 'done', AWAY: 'failed', NO_FIX: 'closed', NO_SITE: 'closed' } as const satisfies Record<PhotoPlaceKind, string>;
const THUMB = 148;

type Where = 'all' | 'AWAY' | 'NO_FIX';

/**
 * Photos tab of a project (ARCHITECTURE "Site photos", Photo timeline): every photo filed on its progress entries, DPRs
 * and inspections, by the day it was taken, each with its time, the record it was filed on and whether the phone was at
 * the site. Away and no-location photos can be picked out, so a photo taken somewhere else is seen before the bill.
 */
export function PhotoTimeline({ projectId }: { projectId: string }) {
  const [range, setRange] = useState<[Dayjs, Dayjs] | null>(null);
  const [where, setWhere] = useState<Where>('all');
  const { data, isLoading, error, refetch } = useSitePhotos(projectId, { from: range?.[0].format('YYYY-MM-DD'), to: range?.[1].format('YYYY-MM-DD') });

  const shown = (data?.photos ?? []).filter((p) => where === 'all' || (where === 'AWAY' ? p.place.kind === 'AWAY' : p.place.kind === 'NO_FIX' || p.place.kind === 'NO_SITE'));
  const days = photoDays(shown);

  const counts = data?.counts;
  const summary = data
    ? [
        plural(data.total, 'photo'),
        data.sitePinned && counts ? `${counts.AT_SITE} at the site` : null,
        data.sitePinned && counts?.AWAY ? `${counts.AWAY} away` : null,
        counts?.NO_FIX && data.sitePinned ? `${counts.NO_FIX} with no location` : null,
        data.sitePinned ? null : 'the site is not pinned, so photos are not placed against it',
      ]
        .filter(Boolean)
        .join(', ')
    : '';

  return (
    <div>
      <Flex gap={tk.space[3]} wrap align="center" style={{ marginBottom: tk.space[4] }}>
        <DatePicker.RangePicker
          aria-label="Taken between"
          allowClear={false}
          presets={[{ label: 'Last 7 days', value: [dayjs().subtract(6, 'day'), dayjs()] }, { label: 'Last 30 days', value: [dayjs().subtract(29, 'day'), dayjs()] }, ...rangePresets()]}
          value={range ?? (data ? [dayjs(data.from), dayjs(data.to)] : null)}
          onChange={(v) => v?.[0] && v[1] && setRange([v[0], v[1]])}
          disabledDate={(d) => d.isAfter(dayjs(), 'day')}
        />
        {data?.sitePinned ? (
          <Segmented<Where>
            aria-label="Where the photos were taken"
            value={where}
            onChange={setWhere}
            options={[
              { value: 'all', label: 'All' },
              { value: 'AWAY', label: 'Away' },
              { value: 'NO_FIX', label: 'No location' },
            ]}
          />
        ) : null}
      </Flex>
      {isLoading ? (
        <Loading />
      ) : error || !data ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : (
        <>
          <p className="text-muted" style={{ margin: 0, marginBottom: tk.space[3] }}>
            <span translate="no">{summary}</span>
            {data.total > data.photos.length ? `. Showing the latest ${data.photos.length}; pick fewer days to see the rest.` : '.'}
          </p>
          {days.length === 0 ? (
            <Typography.Text type="secondary">{where === 'all' ? 'No photos filed in these days.' : 'No photos of this kind in these days.'}</Typography.Text>
          ) : (
            <Image.PreviewGroup>
              <SectionStack>
                {days.map((d) => (
                  <Section key={d.day} title={formatLongDay(d.day)} extra={<span className="text-muted">{plural(d.photos.length, 'photo')}</span>}>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(auto-fill, minmax(${THUMB}px, 1fr))`, gap: tk.space[3] }}>
                      {d.photos.map((p) => (
                        <PhotoTile key={p.id} photo={p} />
                      ))}
                    </div>
                  </Section>
                ))}
              </SectionStack>
            </Image.PreviewGroup>
          )}
        </>
      )}
    </div>
  );
}

function PhotoTile({ photo: p }: { photo: SitePhotoDto }) {
  const words = photoPlaceWords(p.place);
  const map = p.fix ? `https://www.google.com/maps?q=${p.fix.lat},${p.fix.lng}` : null;
  return (
    <figure style={{ margin: 0, minWidth: 0 }}>
      <Image
        src={fileUrl(p.url)}
        alt={`${p.record.title}, ${p.time ?? 'time not known'}`}
        width="100%"
        height={THUMB}
        style={{ objectFit: 'cover', borderRadius: tk.radius.md, border: tk.line('hairline') }}
      />
      <figcaption style={{ marginTop: tk.space[1], fontSize: tk.type.caption.fontSize, lineHeight: tk.type.caption.lineHeight }}>
        <Flex align="center" gap={tk.space[2]} wrap>
          <span translate="no" style={{ color: tk.color.text.strong }}>
            {p.time ?? 'No time'}
          </span>
          {map && p.place.kind === 'AWAY' ? (
            <a href={map} target="_blank" rel="noreferrer" aria-label={`${words}, open on a map`}>
              <AppTag meaning={MEANING[p.place.kind]}>{words}</AppTag>
            </a>
          ) : (
            <AppTag meaning={MEANING[p.place.kind]}>{words}</AppTag>
          )}
        </Flex>
        <Link href={`${RECORD_PATH[p.record.kind]}/${p.record.id}`} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.record.title}>
          {p.record.title}
        </Link>
        <span className="text-muted" translate="no">
          {p.uploadedBy}
        </span>
      </figcaption>
    </figure>
  );
}
