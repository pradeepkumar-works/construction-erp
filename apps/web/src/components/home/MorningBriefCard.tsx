'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { App, Button, Card, Flex, Typography, theme } from 'antd';
import { CloseOutlined, CoffeeOutlined } from '@ant-design/icons';
import { PRODUCT_NAME } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { useMorningBrief, useSetMorningBrief } from '@/lib/queries';

const offerHiddenKey = (userId: string) => `nirmaan.morningBrief.offerHidden.${userId}`;

/**
 * The morning brief on the home page (AI item 74): three lines on what needs this person today, written overnight from
 * their own My work. Offered once Ask Nirmaan is on for the company; each person asks for it themselves.
 */
export function MorningBriefCard() {
  const { user } = useAuth();
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { data } = useMorningBrief();
  const set = useSetMorningBrief();
  const [offerHidden, setOfferHidden] = useState(true);
  useEffect(() => {
    if (!user) return;
    try {
      setOfferHidden(localStorage.getItem(offerHiddenKey(user.id)) === '1');
    } catch {
      setOfferHidden(false);
    }
  }, [user]);

  if (!user || !data?.available) return null;

  const turn = async (on: boolean) => {
    try {
      await set.mutateAsync(on);
      message.success(on ? 'Morning brief on: here is today’s' : 'Morning brief off');
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  if (!data.optedIn) {
    if (offerHidden) return null;
    const hide = () => {
      setOfferHidden(true);
      try {
        localStorage.setItem(offerHiddenKey(user.id), '1');
      } catch {
        // shown again next time
      }
    };
    return (
      <Card size="small" style={{ marginBottom: token.margin }}>
        <Flex gap={token.margin} align="center" wrap justify="space-between">
          <Flex gap={token.marginSM} align="center" style={{ flex: '1 1 320px', minWidth: 0 }}>
            <CoffeeOutlined style={{ fontSize: 20, color: token.colorPrimary }} aria-hidden />
            <Typography.Text>
              Get a three-line brief each morning on what needs you, written by Ask {PRODUCT_NAME} from your own records. It also comes by email, and on WhatsApp if your alerts are on.
            </Typography.Text>
          </Flex>
          <Flex gap={token.marginXS}>
            <Button type="primary" onClick={() => turn(true)} loading={set.isPending}>
              Get the morning brief
            </Button>
            <Button type="text" icon={<CloseOutlined />} aria-label="Not now" onClick={hide} />
          </Flex>
        </Flex>
      </Card>
    );
  }

  const brief = data.brief;
  return (
    <Card
      size="small"
      title={
        <span>
          <CoffeeOutlined style={{ marginRight: token.marginXS }} aria-hidden />
          Your morning brief
        </span>
      }
      extra={
        <Button type="link" size="small" onClick={() => turn(false)} loading={set.isPending}>
          Turn off
        </Button>
      }
      style={{ marginBottom: token.margin }}
    >
      {brief ? (
        <>
          <ul style={{ margin: 0, paddingLeft: token.paddingLG }}>
            {brief.lines.map((l, i) => (
              <li key={i} style={{ marginBottom: token.marginXXS }}>
                {l.href ? <Link href={l.href}>{l.text}</Link> : l.text}
              </li>
            ))}
          </ul>
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            {brief.byAssistant ? `Written by Ask ${PRODUCT_NAME} from your records, ${formatDateTime(brief.writtenAt)}` : `From your records, ${formatDateTime(brief.writtenAt)}`}
          </Typography.Text>
        </>
      ) : (
        <Typography.Text type="secondary">Your next brief comes tomorrow morning.</Typography.Text>
      )}
    </Card>
  );
}
