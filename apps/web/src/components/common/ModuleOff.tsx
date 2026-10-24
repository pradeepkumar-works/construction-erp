'use client';

import React from 'react';
import { Result, Space } from 'antd';
import { AppstoreAddOutlined } from '@/components/common/icons';
import { ResultMark } from '@/components/common/ResultMark';
import { SWITCHABLE_MODULE_INFO, canManageModules, type AuthUser, type SwitchableModule } from '@erp/shared';
import { LinkButton } from '@/components/common/LinkButton';
import { usePageTitle } from '@/lib/page-title';

/**
 * A page of a module the company has turned off (v6 item 117), opened from an old link or a bookmark: what is off, and for
 * an admin the way to turn it on. Its data is kept, so nothing is lost.
 */
export function ModuleOff({ module, user }: { module: SwitchableModule; user: AuthUser }) {
  const { label } = SWITCHABLE_MODULE_INFO[module];
  usePageTitle(label);
  const admin = canManageModules(user.roleKey) && !user.support;
  return (
    <div className="page-container">
      <Result
        icon={<ResultMark icon={<AppstoreAddOutlined />} />}
        title={<h1 className="heading-plain">{label} is turned off</h1>}
        subTitle={
          admin
            ? 'Your company is not using it. Its records are kept, and turning it on again under Modules brings them back.'
            : 'Your company is not using it. Its records are kept; ask your admin if you need it.'
        }
        extra={
          <Space wrap>
            {admin ? (
              <LinkButton type="primary" href="/company-modules">
                Open Modules
              </LinkButton>
            ) : null}
            <LinkButton href="/">Go to home</LinkButton>
          </Space>
        }
      />
    </div>
  );
}
