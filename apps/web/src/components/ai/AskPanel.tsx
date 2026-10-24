'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { App, Button, Drawer, Empty, Flex, Result, Spin, Tooltip, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { ArrowLeftOutlined, CloseOutlined, CopyOutlined, DeleteOutlined, DislikeFilled, DislikeOutlined, HistoryOutlined, LikeFilled, LikeOutlined, PlusOutlined, ReloadOutlined } from '@/components/common/icons';
import { Bubble, Prompts, Sender, Welcome } from '@ant-design/x';
import type { BubbleItemType } from '@ant-design/x';
import XMarkdown, { type ComponentProps } from '@ant-design/x-markdown';
import { useQueryClient } from '@tanstack/react-query';
import type { AiMessageDto, AiStatusDto, AiThreadDetailDto, AiThreadDto, AuthUser } from '@erp/shared';
import { AI_QUESTION_MAX, PRODUCT_NAME } from '@erp/shared';
import { api, errorMessage } from '@/lib/api';
import { streamAsk } from '@/lib/ai';
import { useProjectScope } from '@/lib/project-scope';
import { useAiFeedback, useAiThreads, useDeleteAiThread, useProjects } from '@/lib/queries';
import { APP_HEADER_HEIGHT } from '@/lib/sticky';
import { askShortcutLabel } from '@/lib/shortcuts';
import { SparkleIcon } from './SparkleIcon';
import { suggestionsFor } from './suggestions';
import { DraftCard } from './drafts';
import { ConfirmDelete } from '@/components/common/ConfirmDelete';

/** One line of the conversation; `pending` while the answer streams, `error` when it failed or was stopped. */
interface ChatItem extends AiMessageDto {
  pending?: boolean;
  status?: string;
  error?: string;
  /** The question an answer replies to, for Retry */
  question?: string;
}

/** Links in an answer go through the app's router; on a phone they also close the panel. */
const NavigateCtx = createContext<() => void>(() => undefined);

function AnswerLink(props: ComponentProps & { href?: string }) {
  const onNavigate = useContext(NavigateCtx);
  const { href, children } = props;
  // The server keeps only links to records the assistant read; anything else is shown as its words.
  if (!href || !href.startsWith('/') || href.startsWith('//')) return <span>{children}</span>;
  return (
    <Link href={href} className="text-link" onClick={onNavigate}>
      {children}
    </Link>
  );
}

const MARKDOWN_COMPONENTS = { a: AnswerLink };

/** Width of the panel beside the page on a wide screen. */
const DOCK_WIDTH = 440;

let seq = 0;
const localId = (kind: string) => `local-${kind}-${++seq}`;

const blankMessage = (role: 'user' | 'assistant', text: string): ChatItem => ({ id: localId(role), role, text, citations: [], unverified: [], feedback: null, createdAt: new Date().toISOString() });

/**
 * Ask Nirmaan (AI item 67): a side panel on every page for questions about the company's own records. Answers stream
 * in with links to the records they used; figures the server could not find in those records are flagged. The panel
 * only reads: it never creates, approves or pays anything. It can fill in a form (item 71) that the user opens, checks
 * and saves.
 */
export default function AskPanel({
  open,
  onClose,
  user,
  status,
  mobile,
  question,
  onQuestionTaken,
}: {
  open: boolean;
  onClose: () => void;
  user: AuthUser;
  status?: AiStatusDto;
  mobile: boolean;
  /** A question handed over from Ctrl K, asked as soon as the panel opens */
  question?: string | null;
  onQuestionTaken: () => void;
}) {
  const { message } = App.useApp();
  const { token } = theme.useToken();
  const qc = useQueryClient();
  const pathname = usePathname();
  const [projectId] = useProjectScope();
  const { data: projects } = useProjects(true);
  const [view, setView] = useState<'chat' | 'history'>('chat');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [items, setItems] = useState<ChatItem[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const dock = useRef<HTMLElement>(null);
  const threads = useAiThreads(open && view === 'history');
  const deleteThread = useDeleteAiThread();
  const feedback = useAiFeedback();

  const projectName = projects?.find((p) => p.id === projectId)?.name;
  const suggestions = useMemo(() => suggestionsFor(user, pathname, projectName), [user, pathname, projectName]);
  const off = status && !status.enabled;
  const noneLeft = !!status && status.enabled && status.questionsLeftToday <= 0;

  const patch = useCallback((id: string, change: Partial<ChatItem> | ((m: ChatItem) => Partial<ChatItem>)) => {
    setItems((list) => list.map((m) => (m.id === id ? { ...m, ...(typeof change === 'function' ? change(m) : change) } : m)));
  }, []);

  const ask = useCallback(
    /** `fresh` starts a new conversation whatever is open. */
    async (raw: string, fresh = false) => {
      const q = raw.trim().slice(0, AI_QUESTION_MAX);
      if (q.length < 2 || busy) return;
      setView('chat');
      setInput('');
      const asked = blankMessage('user', q);
      const answer: ChatItem = { ...blankMessage('assistant', ''), pending: true, status: 'Thinking…', question: q };
      setItems((list) => [...list, asked, answer]);
      setBusy(true);
      const ctrl = new AbortController();
      abort.current = ctrl;
      try {
        await streamAsk(
          { question: q, threadId: fresh ? null : threadId, page: { path: pathname, projectId: projectId ?? null } },
          (e) => {
            if (e.type === 'thread') setThreadId(e.threadId);
            else if (e.type === 'status') patch(answer.id, { status: e.text });
            else if (e.type === 'text') patch(answer.id, (m) => ({ text: m.text + e.text }));
            else if (e.type === 'error') patch(answer.id, { error: e.message });
            else if (e.type === 'done') patch(answer.id, (m) => ({ ...e.message, pending: false, status: undefined, question: q, error: m.error }));
          },
          ctrl.signal,
        );
        patch(answer.id, (m) => ({ pending: false, status: undefined, error: m.error ?? (m.text ? undefined : 'No answer came back. Try again.') }));
      } catch (err) {
        const stopped = ctrl.signal.aborted;
        patch(answer.id, (m) => ({ pending: false, status: undefined, error: stopped ? (m.text ? 'Stopped.' : 'Stopped before an answer.') : errorMessage(err) }));
      } finally {
        abort.current = null;
        setBusy(false);
        void qc.invalidateQueries({ queryKey: ['ai', 'status'] });
        void qc.invalidateQueries({ queryKey: ['ai', 'threads'] });
      }
    },
    [busy, threadId, pathname, projectId, patch, qc],
  );

  // A question typed in Ctrl K is asked in a new conversation once the panel is open.
  useEffect(() => {
    if (!open || !question || busy) return;
    onQuestionTaken();
    abort.current?.abort();
    setItems([]);
    setThreadId(null);
    void ask(question, true);
  }, [open, question, busy, ask, onQuestionTaken]);

  // Stop an answer that is still coming when the panel unmounts.
  useEffect(() => () => abort.current?.abort(), []);

  // Beside the page there is no drawer to move focus, so opening puts the cursor in the question box.
  useEffect(() => {
    if (open && !mobile) dock.current?.querySelector('textarea')?.focus();
  }, [open, mobile]);

  /** Closing from inside the panel hands focus back to the header's Ask button rather than losing it. */
  const closeDock = () => {
    if (dock.current?.contains(document.activeElement)) document.querySelector<HTMLElement>('[data-tour="ask"]')?.focus();
    onClose();
  };

  const newChat = () => {
    abort.current?.abort();
    setItems([]);
    setThreadId(null);
    setView('chat');
  };

  const openThread = async (id: string) => {
    try {
      const t = await qc.fetchQuery({ queryKey: ['ai', 'threads', id], queryFn: async () => (await api.get<AiThreadDetailDto>(`/ai/threads/${id}`)).data, staleTime: 0 });
      abort.current?.abort();
      setItems(t.messages);
      setThreadId(t.id);
      setView('chat');
    } catch (e) {
      message.error(errorMessage(e));
    }
  };

  const rate = (m: ChatItem, value: 1 | -1) => {
    const next = m.feedback === value ? null : value;
    patch(m.id, { feedback: next });
    feedback.mutate({ id: m.id, value: next }, { onError: (e) => (patch(m.id, { feedback: m.feedback }), message.error(errorMessage(e))) });
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      message.success('Copied');
    } catch {
      message.error('Could not copy from this browser');
    }
  };

  const retry = (m: ChatItem) => {
    if (!m.question) return;
    setItems((list) => {
      const at = list.findIndex((x) => x.id === m.id);
      return at > 0 ? list.slice(0, at - 1) : list;
    });
    void ask(m.question);
  };

  const bubbles: BubbleItemType[] = items.map((m) =>
    m.role === 'user'
      ? { key: m.id, role: 'user', placement: 'end', content: m.text, shape: 'round' }
      : {
          key: m.id,
          role: 'ai',
          placement: 'start',
          variant: 'borderless',
          content: m.text,
          loading: !!m.pending && !m.text,
          loadingRender: () => (
            <Flex align="center" gap={token.marginXS} role="status">
              <Spin size="small" />
              <Typography.Text type="secondary">{m.status}</Typography.Text>
            </Flex>
          ),
          contentRender: (text: string) =>
            text ? (
              <div className="ai-answer">
                <XMarkdown content={text} components={MARKDOWN_COMPONENTS} streaming={{ hasNextChunk: !!m.pending }} escapeRawHtml />
              </div>
            ) : null,
          footer: <AnswerFooter item={m} onRate={rate} onCopy={copy} onRetry={retry} />,
        },
  );

  // The title names the dialog, so it stays the same in every view.
  const title = (
    <Flex align="center" gap={token.marginXS}>
      <SparkleIcon style={{ color: token.colorPrimary }} />
      <span>
        Ask <span translate="no">{PRODUCT_NAME}</span>
      </span>
    </Flex>
  );

  const extra = !off && (
    <Flex gap={token.marginXXS}>
      <Tooltip title="Past conversations">
        <Button type="text" icon={<HistoryOutlined />} aria-label="Past conversations" aria-pressed={view === 'history'} onClick={() => setView(view === 'history' ? 'chat' : 'history')} />
      </Tooltip>
      <Tooltip title="New conversation">
        <Button type="text" icon={<PlusOutlined />} aria-label="New conversation" onClick={newChat} disabled={!items.length && !threadId} />
      </Tooltip>
    </Flex>
  );

  let body: React.ReactNode;
  if (off) {
    body = <OffState status={status} onNavigate={onClose} />;
  } else if (view === 'history') {
    const list = threads.isLoading ? (
      <Flex justify="center" style={{ padding: token.paddingLG }}>
        <Spin description="Loading" />
      </Flex>
    ) : threads.data?.length ? (
      <Flex vertical gap={token.marginSM}>
        {groupThreads(threads.data).map(([group, rows]) => (
          <section key={group} aria-label={group}>
            <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
              {group}
            </Typography.Text>
            <ul style={{ listStyle: 'none', margin: `${token.marginXXS}px 0 0`, padding: 0 }}>
              {rows.map((t) => (
                <li key={t.id}>
                  <Flex align="center" gap={token.marginXXS}>
                    <Button
                      type={t.id === threadId ? 'link' : 'text'}
                      block
                      onClick={() => void openThread(t.id)}
                      aria-current={t.id === threadId ? 'true' : undefined}
                      style={{ justifyContent: 'flex-start', minWidth: 0 }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                    </Button>
                    <ConfirmDelete
                      what={`the conversation “${t.title}”`}
                      notice="Conversation deleted"
                      onConfirm={() => deleteThread.mutateAsync(t.id)}
                      onDone={() => {
                        if (t.id === threadId) newChat();
                      }}
                    >
                      <Button type="text" size="small" icon={<DeleteOutlined />} aria-label={`Delete “${t.title}”`} />
                    </ConfirmDelete>
                  </Flex>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </Flex>
    ) : (
      <Empty description="No conversations yet" />
    );
    body = (
      <>
        <Flex align="center" gap={token.marginXS} style={{ marginBottom: token.marginXS }}>
          <Button type="text" size="small" icon={<ArrowLeftOutlined />} aria-label="Back to the conversation" onClick={() => setView('chat')} />
          <Typography.Text strong>Past conversations</Typography.Text>
        </Flex>
        {list}
      </>
    );
  } else if (!items.length) {
    body = (
      <Flex vertical gap={token.marginLG} style={{ padding: `${token.paddingSM}px 0` }}>
        <Welcome
          variant="borderless"
          icon={<SparkleIcon style={{ fontSize: 28, color: token.colorPrimary }} />}
          title={`Hi ${user.fullName.split(' ')[0]}, what would you like to know?`}
          description="Ask about your projects, bills, orders, stock, progress or approvals. Answers come from the records you can see, with a link to each one. It can also fill in a material request, expense, progress entry, DPR or letter for you to check and save; it never saves or approves anything itself."
        />
        <Prompts title="Try asking" vertical items={suggestions.map((s) => ({ key: s, label: s }))} onItemClick={({ data }) => void ask(String(data.label))} />
      </Flex>
    );
  } else {
    body = <Bubble.List items={bubbles} autoScroll style={{ flex: 1, minHeight: 0 }} />;
  }

  const content = (
    <>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: view === 'history' || !items.length ? 'auto' : undefined }}>{body}</div>
      {!off && (
        <div>
          <Sender
            value={input}
            onChange={(v) => setInput(v.slice(0, AI_QUESTION_MAX))}
            onSubmit={(v) => void ask(v)}
            onCancel={() => abort.current?.abort()}
            loading={busy}
            disabled={noneLeft}
            placeholder={noneLeft ? 'You have asked the most questions allowed today' : 'Ask about projects, bills, orders, stock…'}
            autoSize={{ minRows: 1, maxRows: 6 }}
            suffix={(_, { components: { SendButton, LoadingButton } }) => (busy ? <LoadingButton aria-label="Stop the answer" /> : <SendButton aria-label="Ask" />)}
          />
          <Typography.Paragraph type="secondary" style={{ fontSize: token.fontSizeSM, margin: `${token.marginXXS}px 0 0` }}>
            Answers can be wrong; open the linked records before you act. Your company&apos;s admins can read conversations.
            {status && status.questionsLeftToday <= 10 ? ` ${status.questionsLeftToday} question${status.questionsLeftToday === 1 ? '' : 's'} left today.` : ''}
          </Typography.Paragraph>
        </div>
      )}
    </>
  );
  const bodyStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', padding: `${token.paddingSM}px ${token.padding}px`, gap: token.marginSM };

  if (mobile) {
    return (
      <NavigateCtx.Provider value={onClose}>
        <Drawer open={open} onClose={onClose} placement="right" size="100%" title={title} extra={extra} rootClassName="ask-panel" styles={{ body: bodyStyle }} aria-label={`Ask ${PRODUCT_NAME}`}>
          {content}
        </Drawer>
      </NavigateCtx.Provider>
    );
  }

  // On a wide screen the panel is a column beside the page, which narrows to make room (AppShell lays them out side
  // by side). It stays mounted while closed so the conversation is still there when it opens again.
  return (
    <NavigateCtx.Provider value={() => undefined}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- Escape from any control in the panel closes it; the keys bubble up from them */}
      <aside
        ref={dock}
        className="ask-panel"
        aria-label={`Ask ${PRODUCT_NAME}`}
        hidden={!open}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && !e.defaultPrevented) closeDock();
        }}
        style={{
          display: open ? 'flex' : 'none',
          flexDirection: 'column',
          flex: `0 0 ${DOCK_WIDTH}px`,
          width: DOCK_WIDTH,
          position: 'sticky',
          top: APP_HEADER_HEIGHT,
          height: `calc(100vh - ${APP_HEADER_HEIGHT}px)`,
          background: token.colorBgContainer,
          borderLeft: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`,
        }}
      >
        <Flex align="center" justify="space-between" gap={token.marginXS} style={{ padding: `${token.paddingSM}px ${token.padding}px`, borderBottom: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}` }}>
          <Typography.Title level={2} style={{ fontSize: token.fontSizeLG, margin: 0, display: 'flex', alignItems: 'center', gap: token.marginXS }}>
            <SparkleIcon style={{ color: token.colorPrimary }} />
            Ask <span translate="no">{PRODUCT_NAME}</span>
          </Typography.Title>
          <Flex gap={token.marginXXS}>
            {extra}
            <Tooltip title={`Close (${askShortcutLabel()})`}>
              <Button type="text" icon={<CloseOutlined />} aria-label={`Close Ask ${PRODUCT_NAME}`} onClick={closeDock} />
            </Tooltip>
          </Flex>
        </Flex>
        <div style={{ ...bodyStyle, flex: 1, minHeight: 0 }}>{content}</div>
      </aside>
    </NavigateCtx.Provider>
  );
}

/** Conversations under Today, Yesterday, This week and Earlier, newest first. */
function groupThreads(list: AiThreadDto[]): [string, AiThreadDto[]][] {
  const groups = new Map<string, AiThreadDto[]>();
  for (const t of list) {
    const g = groupOf(t.updatedAt);
    groups.set(g, [...(groups.get(g) ?? []), t]);
  }
  return [...groups.entries()];
}

function groupOf(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const days = Math.floor((new Date(today.toDateString()).getTime() - new Date(d.toDateString()).getTime()) / 86_400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  return 'Earlier';
}

function AnswerFooter({ item, onRate, onCopy, onRetry }: { item: ChatItem; onRate: (m: ChatItem, v: 1 | -1) => void; onCopy: (text: string) => void; onRetry: (m: ChatItem) => void }) {
  const { token } = theme.useToken();
  if (item.pending) {
    return item.text && item.status ? (
      <Flex align="center" gap={token.marginXS} role="status">
        <Spin size="small" />
        <Typography.Text type="secondary">{item.status}</Typography.Text>
      </Flex>
    ) : null;
  }
  const saved = !item.id.startsWith('local-');
  return (
    <Flex vertical gap={token.marginXS} style={{ marginTop: token.marginXXS }}>
      {item.error && (
        <Flex align="center" gap={token.marginXS} wrap>
          <Typography.Text type="danger">{item.error}</Typography.Text>
          {item.question && (
            <Button size="small" icon={<ReloadOutlined />} onClick={() => onRetry(item)}>
              Try again
            </Button>
          )}
        </Flex>
      )}
      {(item.drafts ?? []).map((d) => (
        <DraftOpen key={d.kind} draft={d} />
      ))}
      {item.citations.length > 0 && (
        <Flex wrap gap={token.marginXXS} align="center" aria-label="Records used">
          <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
            Sources
          </Typography.Text>
          {item.citations.map((c) => (
            <AppTag key={c.href} variant="filled" style={{ marginInlineEnd: 0 }}>
              <CitationLink href={c.href}>{c.label}</CitationLink>
            </AppTag>
          ))}
        </Flex>
      )}
      {item.unverified.length > 0 && (
        <Typography.Text type="warning" style={{ fontSize: token.fontSizeSM }}>
          Check {item.unverified.length === 1 ? 'this' : 'these'} {item.unverified.some((u) => u.startsWith('“')) ? '' : item.unverified.length === 1 ? 'figure ' : 'figures '}in the records: {item.unverified.join(', ')}. {item.unverified.length === 1 ? 'It was' : 'They were'} not in what Ask{' '}
          {PRODUCT_NAME} read.
        </Typography.Text>
      )}
      {saved && item.text && (
        <Flex gap={token.marginXXS}>
          <Tooltip title="Copy">
            <Button type="text" size="small" icon={<CopyOutlined />} aria-label="Copy answer" onClick={() => onCopy(item.text)} />
          </Tooltip>
          <Tooltip title="Helpful">
            <Button type="text" size="small" icon={item.feedback === 1 ? <LikeFilled /> : <LikeOutlined />} aria-label="Helpful" aria-pressed={item.feedback === 1} onClick={() => onRate(item, 1)} />
          </Tooltip>
          <Tooltip title="Not helpful">
            <Button type="text" size="small" icon={item.feedback === -1 ? <DislikeFilled /> : <DislikeOutlined />} aria-label="Not helpful" aria-pressed={item.feedback === -1} onClick={() => onRate(item, -1)} />
          </Tooltip>
        </Flex>
      )}
    </Flex>
  );
}

function DraftOpen({ draft }: { draft: NonNullable<AiMessageDto['drafts']>[number] }) {
  const onNavigate = useContext(NavigateCtx);
  return <DraftCard draft={draft} onNavigate={onNavigate} />;
}

function CitationLink({ href, children }: { href: string; children: React.ReactNode }) {
  const onNavigate = useContext(NavigateCtx);
  return (
    <Link href={href} onClick={onNavigate}>
      {children}
    </Link>
  );
}

function OffState({ status, onNavigate }: { status?: AiStatusDto; onNavigate: () => void }) {
  const router = useRouter();
  if (!status) return null;
  const settings = status.canManage ? (
    <Button
      type="primary"
      onClick={() => {
        onNavigate();
        router.push('/ai-settings');
      }}
    >
      Open Ask {PRODUCT_NAME} settings
    </Button>
  ) : null;
  if (status.reason === 'CAP_REACHED') {
    return <Result status="info" title="This month's allowance is used up" subTitle={status.canManage ? 'Raise the monthly allowance to keep asking this month.' : 'An admin can raise the monthly allowance in Admin.'} extra={settings} />;
  }
  if (status.reason === 'READ_ONLY') {
    const billing = status.canManage ? (
      <Button
        type="primary"
        onClick={() => {
          onNavigate();
          router.push('/billing');
        }}
      >
        Open Subscription
      </Button>
    ) : null;
    return (
      <Result
        status="info"
        title={`Ask ${PRODUCT_NAME} is paused`}
        subTitle={`The ${PRODUCT_NAME} trial or subscription has ended, so the company is read-only. ${status.canManage ? 'Renew it under Subscription to ask again.' : 'An admin can renew it under Admin > Subscription.'}`}
        extra={billing}
      />
    );
  }
  if (status.reason === 'ROLE_OFF') {
    return <Result status="info" title={`Ask ${PRODUCT_NAME} is not open to your role`} subTitle="Your company's admin chooses which roles can use it." />;
  }
  if (status.reason === 'NOT_CONFIGURED') {
    return <Result status="info" title={`Ask ${PRODUCT_NAME} is not set up yet`} subTitle="The server needs an AI key before anyone can ask questions." />;
  }
  return <Result status="info" title={`Ask ${PRODUCT_NAME} is switched off`} subTitle={status.canManage ? 'Switch it on for your company to ask questions about your records.' : 'An admin can switch it on in Admin.'} extra={settings} />;
}
