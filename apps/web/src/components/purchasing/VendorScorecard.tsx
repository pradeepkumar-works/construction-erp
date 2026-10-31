'use client';

import React from 'react';
import { Flex, Typography } from 'antd';
import { VENDOR_RECORD_DAYS, rateVsMedian, vendorScore, type ComparativeStatementDto, type QuotationDto } from '@erp/shared';
import { AppTag } from '@/components/common/AppTag';
import { themeFontSize } from '@/lib/theme';

const pct = (v: number) => `${Math.round(v * 100)}%`;

/**
 * A quoting vendor's scorecard on the comparative statement: deliveries on time and
 * rejected at the gate over the last year, and its rates against the median here. A habit worth weighing before
 * finalising L1 shows in a tag; the figures stand under it.
 */
export function VendorScorecard({ data, quotation }: { data: ComparativeStatementDto; quotation: QuotationDto }) {
  const record = data.vendorRecords?.find((r) => r.vendorId === quotation.vendorId);
  const ratePct = rateVsMedian(data.lines, quotation.id);
  const s = vendorScore(record, ratePct);
  const small = { fontSize: themeFontSize('fontSizeSM') };
  const rate = ratePct === null ? null : ratePct === 0 ? 'At the median here' : `${Math.abs(ratePct)}% ${ratePct > 0 ? 'above' : 'below'} the median here`;
  return (
    <Flex vertical align="flex-end" gap={2}>
      <Flex gap={4} wrap justify="flex-end">
        {s.lateHabit ? <AppTag tone="pending" style={{ margin: 0 }}>Often late</AppTag> : null}
        {s.rejectHabit ? <AppTag tone="danger" style={{ margin: 0 }}>Rejections</AppTag> : null}
        {s.dear ? <AppTag tone="pending" style={{ margin: 0 }}>Dearer</AppTag> : null}
      </Flex>
      {record && !s.thin ? (
        <Typography.Text type="secondary" style={small}>
          On time {record.deliveries - record.late} of {record.deliveries}
          {record.rejectShare !== null ? `, ${pct(record.rejectShare)} rejected` : ''}
        </Typography.Text>
      ) : (
        <Typography.Text type="secondary" style={small}>
          {record?.deliveries ? `${record.deliveries} ${record.deliveries === 1 ? 'delivery' : 'deliveries'}, too few to judge` : `No deliveries in ${Math.round(VENDOR_RECORD_DAYS / 30)} months`}
        </Typography.Text>
      )}
      {rate ? (
        <Typography.Text type="secondary" style={small}>
          {rate}
        </Typography.Text>
      ) : null}
    </Flex>
  );
}
