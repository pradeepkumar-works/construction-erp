'use client';

import React, { useEffect, useRef, useState } from 'react';
import { App, Avatar, Button, Card, Dropdown, Flex, Mentions, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { GetRef } from 'antd';
import { CheckCircleOutlined, EllipsisOutlined, MessageOutlined, UndoOutlined } from '@/components/common/icons';
import { commentSegments, COMMENT_MAX_LENGTH, type CommentDto, type CommentKind, type CommentThreadDto } from '@erp/shared';
import { useCommentAction, useComments, useMentionable } from '@/lib/queries';
import { errorMessage } from '@/lib/api';
import { formatDateTime, timeAgo } from '@/lib/format';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';
import { themeFontSize } from '@/lib/theme';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** Where a notice about a comment leads: the comments of the record's page. */
export const COMMENTS_ANCHOR = 'record-comments';

interface ComposerProps {
  kind: CommentKind;
  entityId: string;
  label: string;
  placeholder: string;
  submitLabel: string;
  initial?: { body: string; mentions: { id: string; name: string }[] };
  /** Put the cursor in it once shown (a Reply or Edit the person just pressed). */
  focusOnOpen?: boolean;
  onSubmit: (body: string, mentions: string[]) => Promise<unknown>;
  onCancel?: () => void;
}

/** A comment box: type @ for the people who see the project; Ctrl Enter sends. */
function Composer({ kind, entityId, label, placeholder, submitLabel, initial, focusOnOpen, onSubmit, onCancel }: ComposerProps) {
  const { token } = theme.useToken();
  const box = useRef<GetRef<typeof Mentions>>(null);
  const [body, setBody] = useState(initial?.body ?? '');
  const [picked, setPicked] = useState<{ id: string; name: string }[]>(initial?.mentions ?? []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wants, setWants] = useState(!!focusOnOpen);
  const people = useMentionable(kind, entityId, wants);
  useEffect(() => {
    if (focusOnOpen) box.current?.focus();
  }, [focusOnOpen]);

  const send = async () => {
    if (!body.trim()) {
      setError('Write the comment first');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSubmit(body, picked.filter((m) => body.includes(`@${m.name}`)).map((m) => m.id));
      setBody('');
      setPicked([]);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <Mentions
        ref={box}
        aria-label={label}
        value={body}
        autoSize={{ minRows: 2, maxRows: 8 }}
        maxLength={COMMENT_MAX_LENGTH}
        placeholder={placeholder}
        onFocus={() => setWants(true)}
        onChange={(v) => {
          setBody(v);
          if (error) setError(null);
        }}
        onSelect={(o) => {
          const p = people.data?.find((x) => x.name === o.value);
          if (p && !picked.some((m) => m.id === p.id)) setPicked([...picked, { id: p.id, name: p.name }]);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void send();
          }
        }}
        loading={people.isLoading}
        notFoundContent={people.isLoading ? 'Loading people…' : 'No one by that name sees this project'}
        options={(people.data ?? []).map((p) => ({ value: p.name, key: p.id, label: `${p.name} · ${p.role}` }))}
        status={error ? 'error' : undefined}
      />
      {error && (
        <Typography.Text type="danger" role="alert" style={{ display: 'block', marginTop: token.marginXXS, fontSize: themeFontSize('fontSizeSM') }}>
          {error}
        </Typography.Text>
      )}
      <Flex gap={token.marginXS} justify="flex-end" style={{ marginTop: token.marginXS }}>
        {onCancel && <Button onClick={onCancel}>Cancel</Button>}
        <Button type="primary" loading={busy} onClick={() => void send()}>
          {submitLabel}
        </Button>
      </Flex>
    </div>
  );
}

function Body({ c }: { c: CommentDto }) {
  const { token } = theme.useToken();
  if (c.removed) return <Typography.Text type="secondary">Comment removed</Typography.Text>;
  return (
    <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {commentSegments(c.body, c.mentions).map((s, i) =>
        s.mentionId ? (
          <span key={i} translate="no" style={{ color: token.colorPrimaryText, fontWeight: token.fontWeightStrong }}>
            {s.text}
          </span>
        ) : (
          <React.Fragment key={i}>{s.text}</React.Fragment>
        ),
      )}
    </Typography.Paragraph>
  );
}

interface CommentProps {
  c: CommentDto;
  kind: CommentKind;
  entityId: string;
  canComment: boolean;
  /** Actions after Edit and Remove: Reply, Resolve */
  extra?: React.ReactNode;
  askRemove: (c: CommentDto) => void;
}

function Comment({ c, kind, entityId, canComment, extra, askRemove }: CommentProps) {
  const { token } = theme.useToken();
  const [editing, setEditing] = useState(false);
  const action = useCommentAction(kind, entityId);
  return (
    <Flex gap={token.marginSM} align="flex-start" className="comment">
      <Avatar size={32} style={{ flex: 'none', background: token.colorPrimaryBg, color: token.colorPrimaryText }} aria-hidden>
        {initials(c.authorName)}
      </Avatar>
      <div style={{ flex: 1, minWidth: 0 }}>
        <Flex gap={token.marginXS} wrap align="baseline">
          <Typography.Text strong translate="no">
            {c.authorName}
          </Typography.Text>
          <Typography.Text type="secondary" style={{ fontSize: themeFontSize('fontSizeSM') }} title={formatDateTime(c.createdAt)}>
            {timeAgo(c.createdAt)}
            {c.editedAt && !c.removed ? ' · edited' : ''}
          </Typography.Text>
          {c.mine && !c.removed && canComment && !editing && (
            <Dropdown
              trigger={['click']}
              menu={{
                items: [
                  { key: 'edit', label: 'Edit' },
                  { key: 'remove', label: 'Remove', danger: true },
                ],
                onClick: ({ key }) => (key === 'edit' ? setEditing(true) : askRemove(c)),
              }}
            >
              <Button type="text" size="small" icon={<EllipsisOutlined />} aria-label={`More for your comment of ${formatDateTime(c.createdAt)}`} style={{ marginInlineStart: 'auto' }} />
            </Dropdown>
          )}
        </Flex>
        {editing ? (
          <Composer
            kind={kind}
            entityId={entityId}
            label="Edit your comment"
            placeholder="Write the comment"
            submitLabel="Save"
            focusOnOpen
            initial={{ body: c.body, mentions: c.mentions }}
            onSubmit={async (body, mentions) => {
              await action.mutateAsync({ method: 'patch', path: `/comments/${c.id}`, body: { body, mentions } });
              setEditing(false);
            }}
            onCancel={() => setEditing(false)}
          />
        ) : (
          <Body c={c} />
        )}
        {extra}
      </div>
    </Flex>
  );
}

function Thread({ t, kind, entityId, canComment, askRemove }: { t: CommentThreadDto; kind: CommentKind; entityId: string; canComment: boolean; askRemove: (c: CommentDto) => void }) {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [replying, setReplying] = useState(false);
  const action = useCommentAction(kind, entityId);
  const resolved = !!t.resolvedAt;
  const toggle = async () => {
    try {
      await action.mutateAsync({ path: `/comments/${t.id}/${resolved ? 'reopen' : 'resolve'}` });
      message.success(resolved ? 'Thread opened again' : 'Thread resolved');
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
  const tools = canComment ? (
    <Flex gap={token.marginXS} wrap style={{ marginTop: token.marginXXS, marginInlineStart: -token.paddingXS }}>
      {!replying && (
        <Button type="link" size="small" icon={<MessageOutlined />} onClick={() => setReplying(true)}>
          Reply
        </Button>
      )}
      <Button type="link" size="small" icon={resolved ? <UndoOutlined /> : <CheckCircleOutlined />} loading={action.isPending} onClick={() => void toggle()}>
        {resolved ? 'Reopen' : 'Resolve'}
      </Button>
    </Flex>
  ) : null;

  return (
    <div
      className="comment-thread"
      data-thread={t.id}
      style={{
        padding: token.paddingSM,
        border: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`,
        borderRadius: token.borderRadiusLG,
        background: resolved ? token.colorFillQuaternary : token.colorBgContainer,
      }}
    >
      {resolved && (
        <AppTag tone="success" icon={<CheckCircleOutlined />} style={{ marginBottom: token.marginXS }}>
          {`Resolved by ${t.resolvedByName ?? 'someone'} on ${formatDateTime(t.resolvedAt)}`}
        </AppTag>
      )}
      <Comment c={t} kind={kind} entityId={entityId} canComment={canComment} askRemove={askRemove} extra={t.replies.length ? null : tools} />
      {t.replies.length > 0 && (
        <Flex vertical gap={token.marginSM} style={{ marginTop: token.marginSM, marginInlineStart: token.marginLG, paddingInlineStart: token.paddingSM, borderInlineStart: `2px solid ${token.colorBorderSecondary}` }}>
          {t.replies.map((r) => (
            <Comment key={r.id} c={r} kind={kind} entityId={entityId} canComment={canComment} askRemove={askRemove} />
          ))}
          {tools}
        </Flex>
      )}
      {replying && (
        <div style={{ marginTop: token.marginSM, marginInlineStart: token.marginLG }}>
          <Composer
            kind={kind}
            entityId={entityId}
            label={`Reply to ${t.authorName}`}
            placeholder="Write a reply. Type @ to bring someone in."
            submitLabel="Reply"
            focusOnOpen
            onSubmit={async (body, mentions) => {
              await action.mutateAsync({ path: '/comments', body: { kind, entityId, parentId: t.id, body, mentions } });
              setReplying(false);
            }}
            onCancel={() => setReplying(false)}
          />
        </div>
      )}
    </div>
  );
}

/**
 * A record's comments: threads with replies, @mentions of the people who see the project (they get a notice,
 * and so does everyone in a thread when it gets a reply), resolve and reopen. Open threads first; resolved ones on request.
 */
export function CommentsSection({ kind, entityId }: { kind: CommentKind; entityId: string }) {
  const { token } = theme.useToken();
  const { data, isLoading, error } = useComments(kind, entityId);
  const action = useCommentAction(kind, entityId);
  const [showResolved, setShowResolved] = useState(false);
  const [askRemove, removeDialog] = useConfirmDelete();

  // Opened from a notice: bring the comments into view once they are drawn.
  useEffect(() => {
    if (data && typeof window !== 'undefined' && window.location.hash === `#${COMMENTS_ANCHOR}`) document.getElementById(COMMENTS_ANCHOR)?.scrollIntoView({ block: 'start' });
  }, [data]);

  if (isLoading) return <Typography.Text type="secondary">Loading comments…</Typography.Text>;
  if (error || !data) return <Typography.Text type="secondary">{error ? errorMessage(error) : 'No comments'}</Typography.Text>;

  const open = data.threads.filter((t) => !t.resolvedAt);
  const resolved = data.threads.filter((t) => t.resolvedAt);
  const remove = (c: CommentDto) =>
    askRemove({
      verb: 'Remove',
      what: 'your comment',
      description: c.parentId ? 'It comes off the thread.' : 'Its replies stay, under "Comment removed".',
      notice: 'Comment removed',
      onConfirm: () => action.mutateAsync({ method: 'delete', path: `/comments/${c.id}` }),
    });

  return (
    <Flex vertical gap={token.marginSM} className="comments">
      {data.canComment && (
        <Composer
          kind={kind}
          entityId={entityId}
          label="New comment"
          placeholder="Ask a question or note something for the team. Type @ to bring someone in."
          submitLabel="Comment"
          onSubmit={(body, mentions) => action.mutateAsync({ path: '/comments', body: { kind, entityId, body, mentions } })}
        />
      )}
      {open.length === 0 && resolved.length === 0 && <Typography.Text type="secondary">No comments yet.</Typography.Text>}
      {open.map((t) => (
        <Thread key={t.id} t={t} kind={kind} entityId={entityId} canComment={data.canComment} askRemove={remove} />
      ))}
      {resolved.length > 0 && (
        <>
          <Button type="link" size="small" style={{ alignSelf: 'flex-start', paddingInline: 0 }} aria-expanded={showResolved} onClick={() => setShowResolved(!showResolved)}>
            {showResolved ? `Hide resolved (${resolved.length})` : `Show resolved (${resolved.length})`}
          </Button>
          {showResolved && resolved.map((t) => <Thread key={t.id} t={t} kind={kind} entityId={entityId} canComment={data.canComment} askRemove={remove} />)}
        </>
      )}
      {removeDialog}
    </Flex>
  );
}

/** The comments as a card of their own, for a page not drawn by `RecordFrame` (a meeting, a material approval). */
export function CommentsCard({ kind, entityId, heading = (t) => t }: { kind: CommentKind; entityId: string; heading?: (text: string) => React.ReactNode }) {
  const { data } = useComments(kind, entityId);
  return (
    <Card id={COMMENTS_ANCHOR} size="small" title={heading(data ? `Comments (${data.threads.length})` : 'Comments')} style={{ scrollMarginTop: 96 }}>
      <CommentsSection kind={kind} entityId={entityId} />
    </Card>
  );
}
