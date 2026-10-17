'use client';

import React, { useEffect } from 'react';
import Link from 'next/link';
import { Button, Result, Space, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

/** A page that crashed while drawing: the shell stays, and the page can be tried again (UI roadmap item 64). */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="page-container">
      <Result
        status="500"
        title="This page ran into a problem"
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
            <Link href="/">
              <Button>Go to home</Button>
            </Link>
          </Space>
        }
      />
    </div>
  );
}
