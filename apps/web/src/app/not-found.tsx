'use client';

import React from 'react';
import { Button, Flex, Result, Space } from 'antd';
import { BrandMark } from '@/components/shell/BrandMark';
import { LinkButton } from '@/components/common/LinkButton';
import { usePageTitle } from '@/lib/page-title';

/** Any address the app does not have (UI roadmap item 64). */
export default function NotFound() {
  usePageTitle('Page not found');
  return (
    <Flex vertical align="center" justify="center" style={{ minHeight: '100vh', padding: 24 }}>
      <BrandMark />
      <Result
        status="404"
        title={<h1 className="heading-plain">This page doesn&apos;t exist</h1>}
        subTitle="The link may be out of date, or the page has moved. Search from the top of any page with Ctrl K."
        extra={
          <Space wrap>
            <LinkButton href="/" type="primary">
              Go to home
            </LinkButton>
            <Button onClick={() => window.history.back()}>Go back</Button>
          </Space>
        }
      />
    </Flex>
  );
}
