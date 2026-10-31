'use client';

import React from 'react';
import { Button, Grid, Modal, Table, Typography } from 'antd';
import type { ToMeasureItemDto } from '@erp/shared';
import { useToMeasure } from '@/lib/queries';
import { formatDate, formatINR, formatQty } from '@/lib/format';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { EmptyArt } from '@/components/common/EmptyArt';
import { themeFontSize } from '@/lib/theme';
import type { MeasurementPrefill } from './MeasurementFormModal';

/**
 * Measure from progress: the quantities the site got approved on the daily
 * reports were read off them and typed into the measurement book again. This lists what each BOQ item has approved
 * that no sheet holds yet, and starts a sheet with those days as its lines.
 */
/** The lines, location and remarks a sheet for this item starts with: one line per approved day, oldest first. */
export function progressPrefill(item: ToMeasureItemDto): MeasurementPrefill {
  const places = [...new Set(item.entries.map((e) => e.location).filter((l): l is string => !!l))];
  const days = item.entries.map((e) => e.date);
  const span = days.length > 1 ? `${formatDate(days[0])} to ${formatDate(days[days.length - 1])}` : formatDate(days[0]);
  return {
    lines: item.entries.map((e) => ({
      description: [formatDate(e.date), e.location, e.activityName].filter(Boolean).join(' · ').slice(0, 200),
      nos: Number(e.quantity),
    })),
    // Every day in one place: that is the sheet's location. Several, and the quantity surveyor says where.
    location: places.length === 1 ? places[0] : undefined,
    remarks: `Measured from approved progress, ${span} (${days.length} ${days.length === 1 ? 'day' : 'days'}).`,
  };
}

/** The item, with how many approved days make up what is left and anything measured in another unit. */
function itemCell(r: ToMeasureItemDto) {
  return (
    <div>
      <span translate="no">{r.itemNo}</span> {r.description}
      <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
        {r.entries.length} approved {r.entries.length === 1 ? 'day' : 'days'}, {formatDate(r.entries[0].date)} onwards
        {r.otherUnitActivities.length ? ` · ${r.otherUnitActivities.join(', ')} ${r.otherUnitActivities.length === 1 ? 'records' : 'record'} another unit, so ${r.otherUnitActivities.length === 1 ? 'its' : 'their'} days are not here` : ''}
      </div>
    </div>
  );
}

/** What is left to measure, at the BOQ rate. */
function leftCell(r: ToMeasureItemDto) {
  return (
    <>
      <span className="mono" translate="no">
        {formatQty(r.toMeasureQty)} {r.unit}
      </span>
      <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
        <span translate="no">{formatINR(r.toMeasureAmount)}</span>
      </div>
    </>
  );
}

export function MeasureFromProgressModal({
  open,
  onClose,
  projectId,
  onStart,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  onStart: (item: ToMeasureItemDto) => void;
}) {
  // On a phone each row is one block instead of three columns, so the table never scrolls sideways.
  const wide = Grid.useBreakpoint().md !== false;
  const { data, isLoading, error, refetch } = useToMeasure(projectId, open);
  const start = (r: ToMeasureItemDto) => {
    onStart(r);
    onClose();
  };
  const startButton = (r: ToMeasureItemDto) => (
    <Button
      type="link"
      style={{ paddingInline: 0 }}
      onClick={(e) => {
        // The row opens it too, so the click stops here rather than starting the same sheet twice.
        e.stopPropagation();
        start(r);
      }}
    >
      Start sheet
    </Button>
  );

  return (
    <Modal open={open} onCancel={onClose} title="Measure from progress" footer={null} width={820} destroyOnHidden>
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : isLoading ? (
        <PageSkeleton shape="list" />
      ) : data?.length ? (
        <>
          <Typography.Paragraph type="secondary">
            Work the site got approved that no measurement sheet holds yet. Start a sheet and its approved days come in as lines, oldest first, for you to check against
            the book.
          </Typography.Paragraph>
          <Table<ToMeasureItemDto>
            rowKey="boqItemId"
            size="small"
            pagination={false}
            dataSource={data}
            scroll={{ y: 360 }}
            onRow={(r) => ({ onClick: () => start(r), style: { cursor: 'pointer' } })}
            columns={
              wide
                ? [
                    { title: 'BOQ item', key: 'item', render: (_, r) => itemCell(r) },
                    { title: 'To measure', key: 'left', width: 190, align: 'right', render: (_, r) => leftCell(r) },
                    { title: '', key: 'go', width: 110, align: 'right', render: (_, r) => startButton(r) },
                  ]
                : [
                    {
                      title: 'BOQ item and what is left',
                      key: 'both',
                      render: (_, r) => (
                        <div>
                          {itemCell(r)}
                          <div>{leftCell(r)}</div>
                          {startButton(r)}
                        </div>
                      ),
                    },
                  ]
            }
          />
        </>
      ) : (
        <EmptyArt art="approved" title="Nothing waiting to be measured">
          <Typography.Text type="secondary">Every BOQ item with approved progress is measured up to date. A day shows here once its daily report is approved.</Typography.Text>
        </EmptyArt>
      )}
    </Modal>
  );
}
