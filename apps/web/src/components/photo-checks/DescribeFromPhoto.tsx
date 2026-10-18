'use client';

import React, { useState } from 'react';
import { App, Button, Flex, Form, type FormInstance } from 'antd';
import type { AttachmentDto } from '@erp/shared';
import { errorMessage } from '@/lib/api';
import { themeFontSize } from '@/lib/theme';
import { useAiStatus, useSnagDraft } from '@/lib/queries';
import { SparkleIcon } from '@/components/ai/SparkleIcon';

interface SnagFields {
  title?: string;
  description?: string;
  location?: string;
  trade?: string;
  photos?: AttachmentDto[];
}

/**
 * "Describe from photo" on a new snag (AI item 76): Ask Nirmaan drafts the title, details, place and trade from the
 * first photo and fills in the fields still empty. Nothing is saved until the user saves the snag.
 */
export function DescribeFromPhoto<T extends SnagFields>({ form, projectId }: { form: FormInstance<T>; projectId: string }) {
  const { message } = App.useApp();
  const ai = useAiStatus(true);
  const photos = Form.useWatch('photos', form) as AttachmentDto[] | undefined;
  const draft = useSnagDraft();
  const [filled, setFilled] = useState(false);
  const photo = photos?.find((p) => p.mimeType?.startsWith('image/'));
  if (!ai.data?.enabled || !photo) return null;

  const describe = async () => {
    try {
      const d = await draft.mutateAsync({ attachmentId: photo.id, projectId });
      const now = form.getFieldsValue(true) as SnagFields;
      const fill: Partial<SnagFields> = {};
      if (!now.title?.trim()) fill.title = d.title;
      if (!now.description?.trim()) fill.description = d.description;
      if (!now.location?.trim() && d.location) fill.location = d.location;
      if (!now.trade?.trim() && d.trade) fill.trade = d.trade;
      if (!Object.keys(fill).length) {
        message.info('Every field is filled in already; nothing was changed');
        return;
      }
      form.setFieldsValue(fill as never);
      setFilled(true);
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  return (
    <Flex align="center" gap={8} wrap style={{ marginTop: -8, marginBottom: 16 }}>
      <Button size="small" icon={<SparkleIcon />} loading={draft.isPending} onClick={describe}>
        Describe from photo
      </Button>
      <span className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
        {filled ? 'Filled in by Ask Nirmaan from the photo. Check it before you save.' : 'Ask Nirmaan fills in the empty fields from the first photo'}
      </span>
    </Flex>
  );
}
