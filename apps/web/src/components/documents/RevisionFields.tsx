'use client';

import React from 'react';
import { Form, Input, Select } from 'antd';
import { DatePicker } from '@/components/common/DatePicker';
import type { FormItemProps } from 'antd';
import dayjs from 'dayjs';
import { REVISION_STATUSES, REVISION_STATUS_LABELS } from '@erp/shared';
import { PhotoUpload } from '@/components/common/PhotoUpload';
import { FormGrid } from '@/components/form/FormShell';

/**
 * Revision, date, status, from whom and the files: in the new-document form (under `revision`) and the revision form.
 * `read` adds where a value was read from a drawing's title block.
 */
export function RevisionFields({ prefix = [], read }: { prefix?: string[]; read?: (key: 'revision' | 'date' | 'issuedBy') => Partial<FormItemProps> }) {
  const n = (k: string) => [...prefix, k];
  return (
    <>
      <FormGrid cols={3}>
        <Form.Item name={n('revision')} label="Revision" rules={[{ required: true, whitespace: true, message: 'Enter the revision, e.g. R0' }]} {...read?.('revision')}>
          <Input maxLength={20} placeholder="R0, A, P1" />
        </Form.Item>
        <Form.Item name={n('issuedOn')} label="Issued on" rules={[{ required: true, message: 'Pick the date it was issued' }]} {...read?.('date')}>
          <DatePicker style={{ width: '100%' }} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
        </Form.Item>
        <Form.Item name={n('status')} label="Status" rules={[{ required: true, message: 'Choose the status' }]}>
          <Select options={REVISION_STATUSES.map((s) => ({ value: s, label: REVISION_STATUS_LABELS[s] }))} />
        </Form.Item>
      </FormGrid>
      <Form.Item name={n('receivedFrom')} label="Issued by (architect, consultant, client)" {...read?.('issuedBy')}>
        <Input maxLength={200} />
      </Form.Item>
      <Form.Item name={n('remarks')} label="What changed">
        <Input.TextArea rows={2} maxLength={1000} placeholder="Clouded changes, or the consultant's comments" />
      </Form.Item>
      <Form.Item name={n('files')} label="Drawing (PDF, DXF, DWG or image)" extra="PDF, DXF or an image opens in the drawing viewer to mark up; a DWG is kept for download, so add its PDF or DXF too.">
        <PhotoUpload drawings />
      </Form.Item>
    </>
  );
}
