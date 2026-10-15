'use client';

import React from 'react';
import { Image, Space, Typography } from 'antd';
import { PaperClipOutlined } from '@ant-design/icons';
import type { AttachmentDto } from '@erp/shared';
import { fileUrl } from '@/lib/api';
import { themeColor } from '@/lib/theme';

export function AttachmentGallery({ attachments, size = 96 }: { attachments: AttachmentDto[]; size?: number }) {
  if (!attachments || attachments.length === 0) return <Typography.Text type="secondary">No photos</Typography.Text>;
  const images = attachments.filter((a) => a.mimeType?.startsWith('image/'));
  const files = attachments.filter((a) => !a.mimeType?.startsWith('image/'));
  return (
    <Space orientation="vertical" size={8} style={{ width: '100%' }}>
      {images.length > 0 && (
        <Image.PreviewGroup>
          <Space wrap size={8}>
            {images.map((a) => (
              <Image
                key={a.id}
                src={fileUrl(a.url)}
                alt={a.fileName}
                width={size}
                height={size}
                style={{ objectFit: 'cover', borderRadius: 6, border: `1px solid ${themeColor('colorBorderSecondary')}` }}
              />
            ))}
          </Space>
        </Image.PreviewGroup>
      )}
      {files.map((a) => (
        <a key={a.id} href={fileUrl(a.url)} target="_blank" rel="noreferrer">
          <PaperClipOutlined /> {a.fileName}
        </a>
      ))}
    </Space>
  );
}

export function PhotoThumbs({ attachments, size = 36, max = 3 }: { attachments: AttachmentDto[]; size?: number; max?: number }) {
  const images = (attachments ?? []).filter((a) => a.mimeType?.startsWith('image/'));
  if (images.length === 0) return <span className="text-muted">-</span>;
  const shown = images.slice(0, max);
  return (
    <Image.PreviewGroup>
      <Space size={4}>
        {shown.map((a) => (
          <Image key={a.id} src={fileUrl(a.url)} alt={a.fileName} width={size} height={size} style={{ objectFit: 'cover', borderRadius: 4 }} />
        ))}
        {images.length > max && <span className="text-muted">+{images.length - max}</span>}
      </Space>
    </Image.PreviewGroup>
  );
}
