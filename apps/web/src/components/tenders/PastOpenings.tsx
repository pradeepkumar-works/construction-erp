'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Flex, Skeleton, Typography, theme } from 'antd';
import { BID_HISTORY_DAYS, BID_MATCH_LABELS, WORK_KIND_LABELS, sorPctLabel, type BidLevelDto, type PastOpeningsDto, type TenderDetailDto } from '@erp/shared';
import { usePastOpenings } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { RankTag } from './tenderUi';

const atSor = (pct: string | number) => `${sorPctLabel(pct)}${Math.abs(Number(pct)) < 0.005 ? '' : ' the SOR'}`;

/** "this client's roads", "roads", or "this client or roads": the openings a level is read from. */
function basisWords(level: BidLevelDto, data: PastOpeningsDto) {
  const kind = WORK_KIND_LABELS[data.kind].toLowerCase();
  const n = `${level.count} opening${level.count === 1 ? '' : 's'}`;
  if (level.basis === 'CLIENT_AND_KIND') return `${n} of this client's ${kind}`;
  if (level.basis === 'KIND') return `${n} of ${kind}`;
  return `${n} of this client or of ${kind}`;
}

/**
 * Bid intelligence on a tender: where L1 landed on the company's past openings of the same
 * client and kind of work, against the SOR, and how the quote now on the tender would have stood on them. The figures
 * come from `GET /tenders/:id/past-openings`; nothing here is a rule of its own.
 */
export function PastOpenings({ tender }: { tender: TenderDetailDto }) {
  const { token } = theme.useToken();
  const { data, isLoading } = usePastOpenings(tender.id);
  const small = { fontSize: token.fontSizeSM };
  const level = data?.level ?? null;
  return (
    <Card
      size="small"
      title={
        <Typography.Title level={2} style={{ fontSize: token.fontSize, margin: 0 }}>
          Past openings
        </Typography.Title>
      }
    >
      {isLoading || !data ? (
        <Skeleton active paragraph={{ rows: 3 }} title={false} />
      ) : (
        <Flex vertical gap={8}>
          {level ? (
            <p style={{ margin: 0 }}>
              L1 landed at <strong translate="no">{atSor(level.median)}</strong> on the median of {basisWords(level, data)}, from{' '}
              <span translate="no">{sorPctLabel(level.low)}</span> to <span translate="no">{sorPctLabel(level.high)}</span>.
              {level.wouldLead !== null && data.quotedPct !== null ? (
                <>
                  {' '}
                  Our quote at <span translate="no">{atSor(data.quotedPct)}</span> would have been lowest on{' '}
                  <strong translate="no">
                    {level.wouldLead} of {level.count}
                  </strong>
                  .
                </>
              ) : null}
            </p>
          ) : (
            <Typography.Text type="secondary">
              {data.openings.length
                ? 'Too few past openings with a percentage to read a level from.'
                : `No past openings of this client or of ${WORK_KIND_LABELS[data.kind].toLowerCase()} in the last ${Math.round(BID_HISTORY_DAYS / 365)} years. The bids recorded at each opening show here.`}
            </Typography.Text>
          )}
          {data.openings.map((o) => (
            <Flex
              key={o.tenderId}
              justify="space-between"
              align="center"
              gap={12}
              style={{ minHeight: 44, borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 6 }}
            >
              <div style={{ minWidth: 0 }}>
                <Link href={`/tenders/${o.tenderId}`} translate="no">
                  {o.tenderNo}
                </Link>
                <Typography.Text type="secondary" style={{ ...small, display: 'block' }} ellipsis={{ tooltip: o.title }}>
                  <span translate="no">{o.title}</span>
                </Typography.Text>
                <Typography.Text type="secondary" style={{ ...small, display: 'block' }}>
                  {`${BID_MATCH_LABELS[o.match]}, opened ${formatDate(o.openedOn)}, ${o.bidders} bidders`}
                </Typography.Text>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div translate="no">{o.l1Pct === null ? 'L1 -' : `L1 ${sorPctLabel(o.l1Pct)}`}</div>
                {o.ourRank ? (
                  <Typography.Text type="secondary" style={small}>
                    Us <RankTag rank={o.ourRank} />
                    {o.ourPct !== null ? <span translate="no">{` ${sorPctLabel(o.ourPct)}`}</span> : null}
                  </Typography.Text>
                ) : (
                  <Typography.Text type="secondary" style={small}>
                    Not bid
                  </Typography.Text>
                )}
              </div>
            </Flex>
          ))}
        </Flex>
      )}
    </Card>
  );
}
