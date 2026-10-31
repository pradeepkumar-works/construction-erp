'use client';

import React, { useEffect, useState } from 'react';
import { Alert, Button, Flex, Result, Skeleton, theme } from 'antd';
import { DisconnectOutlined, ReloadOutlined } from '@/components/common/icons';
import { ResultMark } from '@/components/common/ResultMark';
import { PRODUCT_NAME } from '@erp/shared';
import { errorMessage, errorStatus } from '@/lib/api';
import { LinkButton } from '@/components/common/LinkButton';

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);
  return online;
}

/**
 * A request that failed: no access (403), not found (404) and no connection each get their own state with a way on;
 * anything else is an error with Retry.
 */
export function QueryError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const online = useOnline();
  const status = errorStatus(error);
  const retry = onRetry ? (
    <Button icon={<ReloadOutlined />} onClick={onRetry}>
      Try again
    </Button>
  ) : null;
  const home = <LinkButton href="/">Go to home</LinkButton>;

  if (status === 403)
    return <Result icon={<ResultMark kind="no-access" />} title="You don't have access to this" subTitle={`${errorMessage(error)}. Ask your admin if you need it.`} extra={home} />;
  if (status === 404) return <Result icon={<ResultMark kind="not-found" />} title="Not found" subTitle="It may have been deleted, or the link is out of date." extra={home} />;
  if (status === 0)
    return (
      <Result
        icon={<ResultMark icon={<DisconnectOutlined />} />}
        title={online ? `Can't reach ${PRODUCT_NAME}` : "You're offline"}
        subTitle={online ? 'The server did not answer. It may be restarting; try again in a moment.' : 'Check your connection. This page loads again when you are back online.'}
        extra={retry}
      />
    );
  return (
    <Alert
      type="error"
      showIcon
      title="Could not load data"
      description={errorMessage(error)}
      action={
        onRetry ? (
          <Button size="small" onClick={onRetry}>
            Retry
          </Button>
        ) : undefined
      }
    />
  );
}

/** Placeholder while a panel loads, shaped like a card of text rather than a spinner. */
export function Loading({ tip }: { tip?: string }) {
  return (
    <div style={{ padding: 24 }} aria-busy="true" aria-label={tip ?? 'Loading'}>
      <Skeleton active paragraph={{ rows: 5 }} />
    </div>
  );
}

/** A page-shaped placeholder: header, a row of figures, and a table or record body. */
export function PageSkeleton({ shape = 'list', header = true }: { shape?: 'list' | 'record' | 'home' | 'workspace'; header?: boolean }) {
  const { token } = theme.useToken();
  const card = (children: React.ReactNode, flex: string | number = 1) => (
    <div style={{ flex, minWidth: 220, background: token.colorBgContainer, border: `1px solid ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, padding: token.padding }}>{children}</div>
  );
  return (
    <div aria-busy="true" aria-label="Loading">
      {header ? <Skeleton active title={{ width: 280 }} paragraph={{ rows: 1, width: 420 }} style={{ marginBottom: token.marginLG }} /> : null}
      {shape === 'home' || shape === 'workspace' ? (
        <Flex gap={token.margin} wrap style={{ marginBottom: token.margin }}>
          {[0, 1, 2, 3].map((i) => (
            <React.Fragment key={i}>{card(<Skeleton active title={{ width: '50%' }} paragraph={{ rows: 1, width: '70%' }} />)}</React.Fragment>
          ))}
        </Flex>
      ) : null}
      {shape === 'workspace' ? <Skeleton.Button active block style={{ height: 40, marginBottom: token.margin }} /> : null}
      {shape === 'record' ? (
        <Flex gap={token.margin} wrap>
          {card(<Skeleton active paragraph={{ rows: 8 }} />, 3)}
          {card(<Skeleton active paragraph={{ rows: 5 }} />, 1)}
        </Flex>
      ) : shape === 'home' ? (
        <Flex gap={token.margin} wrap>
          {card(<Skeleton active paragraph={{ rows: 6 }} />, 2)}
          {card(<Skeleton active paragraph={{ rows: 6 }} />, 1)}
        </Flex>
      ) : (
        card(<Skeleton active title={false} paragraph={{ rows: 8, width: '100%' }} />)
      )}
    </div>
  );
}
