'use client';

import React from 'react';
import { DatePicker, Form, Input, Select } from 'antd';
import dayjs from 'dayjs';
import { REVISION_STATUSES, REVISION_STATUS_LABELS } from '@erp/shared';
import { PhotoUpload } from '@/components/common/PhotoUpload';

const grid = (cols: string) => ({ display: 'grid', gridTemplateColumns: cols, gap: '0 16px' }) as const;

/** Revision, date, status, from whom and the files: in the new-document form (under `revision`) and the revision form. */
export function RevisionFields({ prefix = [] }: { prefix?: string[] }) {
  const n = (k: string) => [...prefix, k];
  return (
    <>
      <div style={grid('1fr 1fr 1.6fr')}>
        <Form.Item name={n('revision')} label="Revision" rules={[{ required: true, whitespace: true, message: 'Required' }]}>
          <Input maxLength={20} placeholder="R0, A, P1" />
        </Form.Item>
        <Form.Item name={n('issuedOn')} label="Issued on" rules={[{ required: true, message: 'Required' }]}>
          <DatePicker style={{ width: '100%' }} format="DD MMM YYYY" disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
        </Form.Item>
        <Form.Item name={n('status')} label="Status" rules={[{ required: true, message: 'Required' }]}>
          <Select options={REVISION_STATUSES.map((s) => ({ value: s, label: REVISION_STATUS_LABELS[s] }))} />
        </Form.Item>
      </div>
      <Form.Item name={n('receivedFrom')} label="Issued by (architect, consultant, client)">
        <Input maxLength={200} />
      </Form.Item>
      <Form.Item name={n('remarks')} label="What changed">
        <Input.TextArea rows={2} maxLength={1000} placeholder="Clouded changes, or the consultant's comments" />
      </Form.Item>
      <Form.Item name={n('files')} label="Drawing (PDF or image)" extra="PDF or image, up to about 4 MB a file on the hosted app.">
        <PhotoUpload />
      </Form.Item>
    </>
  );
}
