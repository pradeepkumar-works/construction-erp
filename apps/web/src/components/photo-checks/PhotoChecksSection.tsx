'use client';

import React, { useEffect, useRef } from 'react';
import { App, Flex, Image, Spin, Switch, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { ExclamationCircleFilled } from '@/components/common/icons';
import { PHOTO_FLAG_INFO, type AttachmentDto, type PhotoCheckKind } from '@erp/shared';
import { errorMessage, fileUrl } from '@/lib/api';
import { themeFontSize } from '@/lib/theme';
import { usePhotoChecks, useRunPhotoChecks, useSetPhotoFlags } from '@/lib/queries';
import { AttachmentGallery } from '@/components/common/AttachmentGallery';
import { SparkleIcon } from '@/components/ai/SparkleIcon';
import type { RecordSection } from '@/components/record/RecordFrame';

const isPhoto = (a: AttachmentDto) => a.mimeType?.startsWith('image/');

/**
 * A record's photos with what Ask Nirmaan saw in each (AI item 76): a caption, and flags such as workers without
 * helmets or a photo of other work than the entry says. Photos not looked at yet are checked when the record opens,
 * while Ask Nirmaan is on for the company. Advisory only; the project's safety officer can switch the flags off.
 */
export function PhotosWithChecks({ kind, id, attachments, size }: { kind: PhotoCheckKind; id: string; attachments: AttachmentDto[]; size?: number }) {
  const photos = attachments.filter(isPhoto);
  return (
    <>
      <AttachmentGallery attachments={attachments} size={size} />
      {photos.length ? <PhotoChecks kind={kind} id={id} photos={photos} /> : null}
    </>
  );
}

/** The Photos section for a record's sections list, with the photo checks under the photos. */
export const photosSection = (kind: PhotoCheckKind, id: string, attachments: AttachmentDto[]): RecordSection => ({
  key: 'photos',
  title: 'Photos',
  count: attachments.length,
  children: <PhotosWithChecks kind={kind} id={id} attachments={attachments} />,
});

function PhotoChecks({ kind, id, photos }: { kind: PhotoCheckKind; id: string; photos: AttachmentDto[] }) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const version = photos.length;
  const { data } = usePhotoChecks(kind, id, true, version);
  const run = useRunPhotoChecks(kind, id, version);
  const setFlags = useSetPhotoFlags();
  // Ask again while photos are left and the last run checked some; stop on an error or a run that got nowhere.
  const lastPending = useRef<number | null>(null);
  const pending = data?.pending ?? 0;
  const ready = !!data?.available && pending > 0 && !run.isPending && !run.isError;
  const check = run.mutate;
  useEffect(() => {
    if (!ready || lastPending.current === pending) return;
    lastPending.current = pending;
    check();
  }, [ready, pending, check]);

  if (!data || (!data.checks.length && !(data.available && pending))) return null;
  const byPhoto = new Map(data.checks.map((c) => [c.attachmentId, c]));
  const switchFlags = (on: boolean) =>
    setFlags.mutate(
      { projectId: data.projectId, flagsOff: !on },
      { onSuccess: () => message.success(on ? 'Photo flags are on for this project' : 'Photo flags are off for this project'), onError: (e) => message.error(errorMessage(e)) },
    );

  return (
    <section aria-label="Photo checks by Ask Nirmaan" className="photo-checks" style={{ marginTop: 12 }}>
      <Flex align="center" gap={6} className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM'), marginBottom: 4 }}>
        <SparkleIcon /> What Ask Nirmaan sees in the photos. It can be wrong and never holds up a submission.
      </Flex>
      {photos.map((p) => {
        const c = byPhoto.get(p.id);
        if (!c) return null;
        return (
          <Flex key={p.id} gap={10} align="flex-start" className="photo-check" style={{ padding: '8px 0', borderBottom: `1px solid ${token.colorSplit}` }}>
            <Image src={fileUrl(p.url)} alt="" width={40} height={40} preview={false} style={{ objectFit: 'cover', borderRadius: 4, flex: 'none' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Typography.Text>{c.caption ?? (c.status === 'DONE' ? 'No caption' : c.reason)}</Typography.Text>
              <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
                {c.fileName}
                {c.status !== 'DONE' && c.caption ? ` · ${c.reason}` : ''}
              </div>
              {c.flags.map((f) => (
                <Flex key={f.key} gap={6} align="flex-start" style={{ marginTop: 4 }}>
                  <ExclamationCircleFilled style={{ color: token.colorWarningText, marginTop: 4 }} aria-hidden />
                  <span>
                    <Typography.Text strong>{f.label}</Typography.Text>
                    {PHOTO_FLAG_INFO[f.key].safety ? (
                      <AppTag tone="pending" style={{ marginInlineStart: 6 }}>
                        Safety
                      </AppTag>
                    ) : null}
                    <span className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM'), display: 'block' }}>
                      {f.detail ? `${f.detail}. ` : ''}
                      {Math.round(f.confidence * 100)}% sure
                    </span>
                  </span>
                </Flex>
              ))}
            </div>
          </Flex>
        );
      })}
      {data.available && pending > 0 && run.isPending ? (
        <div style={{ padding: '8px 0' }}>
          <Spin size="small" description={`Ask Nirmaan is looking at ${pending === 1 ? 'a photo' : `${pending} photos`}`} />
        </div>
      ) : run.isError ? (
        <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }}>
          {errorMessage(run.error)}
        </Typography.Text>
      ) : null}
      {data.canSwitch || data.flagsOff ? (
        <Flex align="center" gap={8} wrap style={{ marginTop: 8, fontSize: themeFontSize('fontSizeSM') }}>
          {data.canSwitch ? (
            <>
              <Switch size="small" checked={!data.flagsOff} loading={setFlags.isPending} onChange={switchFlags} aria-label="Photo flags on this project" />
              <span>{data.flagsOff ? 'Photo flags are off on this project; captions still show' : 'Photo flags on this project'}</span>
            </>
          ) : (
            <span className="text-muted">The safety officer has switched photo flags off on this project.</span>
          )}
        </Flex>
      ) : null}
    </section>
  );
}
