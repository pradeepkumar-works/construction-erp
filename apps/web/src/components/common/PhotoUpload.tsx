'use client';

import React, { useEffect, useState } from 'react';
import { App, Upload } from 'antd';
import type { UploadFile, UploadProps } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import type { AttachmentDto } from '@erp/shared';
import { errorMessage, fileUrl } from '@/lib/api';
import { uploadFile } from '@/lib/queries';

const toUploadFile = (a: AttachmentDto): UploadFile => ({ uid: a.id, name: a.fileName, status: 'done', url: fileUrl(a.url), response: a });

/** Form-friendly uploader: value is the list of uploaded AttachmentDto. */
export function PhotoUpload({
  value,
  onChange,
  max = 6,
}: {
  value?: AttachmentDto[];
  onChange?: (v: AttachmentDto[]) => void;
  max?: number;
}) {
  const { message } = App.useApp();
  const [files, setFiles] = useState<UploadFile[]>(() => (value ?? []).map(toUploadFile));

  // Keep in step with a value set from outside (e.g. form.setFieldsValue when editing an existing entry).
  useEffect(() => {
    const wanted = (value ?? []).map((a) => a.id).join('|');
    const shown = files
      .filter((f) => f.status === 'done')
      .map((f) => (f.response as AttachmentDto | undefined)?.id ?? f.uid)
      .join('|');
    if (wanted !== shown && !files.some((f) => f.status === 'uploading')) setFiles((value ?? []).map(toUploadFile));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const customRequest: UploadProps['customRequest'] = async (options) => {
    const file = options.file as File;
    try {
      const att = await uploadFile(file);
      options.onSuccess?.(att);
    } catch (err) {
      message.error(errorMessage(err, 'Upload failed'));
      options.onError?.(err as Error);
    }
  };

  const handleChange: UploadProps['onChange'] = ({ fileList }) => {
    setFiles(fileList);
    const done = fileList
      .filter((f) => f.status === 'done')
      .map((f) => {
        const att = f.response as AttachmentDto | undefined;
        if (att) return att;
        const existing = (value ?? []).find((a) => a.id === f.uid);
        return existing;
      })
      .filter((a): a is AttachmentDto => !!a);
    onChange?.(done);
  };

  return (
    <Upload
      listType="picture-card"
      accept="image/*,.pdf"
      fileList={files}
      customRequest={customRequest}
      onChange={handleChange}
      multiple
    >
      {files.length >= max ? null : (
        <div>
          <PlusOutlined />
          <div style={{ marginTop: 6 }}>Upload</div>
        </div>
      )}
    </Upload>
  );
}
