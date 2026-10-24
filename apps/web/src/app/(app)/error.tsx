'use client';

import React, { useEffect } from 'react';
import { Button, Result, Space, Typography } from 'antd';
import { ReloadOutlined } from '@/components/common/icons';
import { LinkButton } from '@/components/common/LinkButton';
import { usePageTitle } from '@/lib/page-title';
import { ResultMark } from '@/components/common/ResultMark';

/** A page that crashed while drawing: the shell stays, and the page can be tried again (UI roadmap item 64). */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  usePageTitle('Page error');
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="page-container">
      <Result
        icon={<ResultMark kind="error" />}
        title={<h1 className="heading-plain">This page ran into a problem</h1>}
        subTitle={
          <>
            Nothing you saved is lost. Try again, and if it keeps happening tell your admin what you were doing.
            {error.digest ? (
              <Typography.Paragraph type="secondary" copyable={{ text: error.digest }} style={{ marginTop: 8, marginBottom: 0 }}>
                Reference {error.digest}
              </Typography.Paragraph>
            ) : null}
          </>
        }
        extra={
          <Space wrap>
            <Button type="primary" icon={<ReloadOutlined />} onClick={reset}>
              Try again
            </Button>
            <LinkButton href="/">Go to home</LinkButton>
          </Space>
        }
      />
    </div>
  );
}
