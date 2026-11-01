'use client';

import React from 'react';
import { Result } from 'antd';
import { ResultMark } from '@/components/common/ResultMark';
import { LinkButton } from '@/components/common/LinkButton';

export function NoAccess({ title, subTitle = 'Ask your admin if you need it.' }: { title: React.ReactNode; subTitle?: React.ReactNode }) {
  return <Result icon={<ResultMark kind="no-access" />} title={title} subTitle={subTitle} extra={<LinkButton href="/">Go to home</LinkButton>} />;
}
