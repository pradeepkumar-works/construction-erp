'use client';

import React from 'react';
import Link from 'next/link';
import { Button, Flex, Result, Space } from 'antd';
import { BrandMark } from '@/components/shell/BrandMark';

/** Any address the app does not have (UI roadmap item 64). */
export default function NotFound() {
  return (
    <Flex vertical align="center" justify="center" style={{ minHeight: '100vh', padding: 24 }}>
      <BrandMark />
      <Result
        status="404"
        title="This page doesn't exist"
        subTitle="The link may be out of date, or the page has moved. Search from the top of any page with Ctrl K."
        extra={
          <Space wrap>
            <Link href="/">
              <Button type="primary">Go to home</Button>
            </Link>
            <Button onClick={() => window.history.back()}>Go back</Button>
          </Space>
        }
      />
    </Flex>
  );
}
