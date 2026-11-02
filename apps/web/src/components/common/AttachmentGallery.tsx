'use client';

import React from 'react';
import { Image, Space, Typography } from 'antd';
import { tk } from '@/ds';
import { PaperClipOutlined } from '@/components/common/icons';
import type { AttachmentDto } from '@erp/shared';
import { fileUrl } from '@/lib/api';
import { NO_VALUE } from '@/lib/format';

export function AttachmentGallery({ attachments, size = 96, emptyText = 'No photos' }: { attachments: AttachmentDto[]; size?: number; emptyText?: string }) {
  if (!attachments || attachments.length === 0) return <Typography.Text type="secondary">{emptyText}</Typography.Text>;
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
                style={{ objectFit: 'cover', borderRadius: tk.radius.md, border: `1px solid ${tk.color.line.hairline}` }}
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
  if (images.length === 0) return <span className="text-muted">{NO_VALUE}</span>;
  const shown = images.slice(0, max);
  return (
    <Image.PreviewGroup>
      <Space size={4}>
        {shown.map((a) => (
          <Image key={a.id} src={fileUrl(a.url)} alt={a.fileName} width={size} height={size} style={{ objectFit: 'cover', borderRadius: tk.radius.sm }} />
        ))}
        {images.length > max && <span className="text-muted">+{images.length - max}</span>}
      </Space>
    </Image.PreviewGroup>
  );
}
