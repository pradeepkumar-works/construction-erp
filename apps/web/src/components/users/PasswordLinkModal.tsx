'use client';

import React from 'react';
import { Alert, App, Button, Input, Modal, Space, Typography } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import type { PasswordLinkDto } from '@erp/shared';
import { formatDateTime } from '@/lib/format';

/** Shows a set-password link after an invite or reset, for the admin to share if it was not emailed. */
export function PasswordLinkModal({ result, onClose }: { result: { name: string; email: string; invite: boolean; link: PasswordLinkDto } | null; onClose: () => void }) {
  const { message } = App.useApp();
  const link = result?.link;
  const copy = async () => {
    if (!link?.link) return;
    try {
      await navigator.clipboard.writeText(link.link);
      message.success('Link copied');
    } catch {
      message.error('Copy failed: select the link and copy it');
    }
  };
  return (
    <Modal open={!!result} title={result?.invite ? `Invite for ${result.name}` : `Password link for ${result?.name}`} onCancel={onClose} footer={<Button type="primary" onClick={onClose}>Done</Button>} destroyOnHidden>
      {result && link ? (
        <Space orientation="vertical" size={12} style={{ width: '100%' }}>
          {link.emailed ? (
            <Alert type="success" showIcon title={`Emailed to ${result.email}.`} description="You can also share the link below yourself." />
          ) : (
            <Alert type="info" showIcon title="Not emailed" description={`Email is not set up on this server, so send this link to ${result.email} yourself (WhatsApp, SMS or email).`} />
          )}
          {link.link ? (
            <Space.Compact style={{ width: '100%' }}>
              <Input readOnly value={link.link} aria-label="Set-password link" onFocus={(e) => e.target.select()} />
              <Button icon={<CopyOutlined />} onClick={copy}>
                Copy
              </Button>
            </Space.Compact>
          ) : (
            <Alert type="warning" showIcon title="The server does not know the web address, so it cannot make a link. Set WEB_URL on the API." />
          )}
          <Typography.Text type="secondary">
            The link works once and expires on {formatDateTime(link.expiresAt)}. Making a new link cancels this one.
          </Typography.Text>
        </Space>
      ) : null}
    </Modal>
  );
}
