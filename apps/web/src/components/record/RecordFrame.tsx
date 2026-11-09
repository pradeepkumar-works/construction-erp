'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Anchor, App, Button, Card, Col, Descriptions, Drawer, Flex, Row, Skeleton, Space, Tooltip } from 'antd';
import { tk } from '@/ds';
import type { DescriptionsProps } from 'antd';
import { ArrowLeftOutlined, ExpandOutlined, LinkOutlined, PrinterOutlined } from '@/components/common/icons';
import { useComments, type ApprovalTypeParam } from '@/lib/queries';
import type { CommentKind } from '@erp/shared';
import { CommentsSection } from '@/components/comments/CommentsSection';
import { Section } from '@/components/common/Section';
import { useStickyTop } from '@/lib/sticky';
import { useIsPhone } from '@/lib/screen';
import { rememberRecord } from '@/lib/recent';
import { recordVisit } from '@/components/shell/pins';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { PageHeader } from '@/components/common/PageHeader';
import { LinkButton } from '@/components/common/LinkButton';
import { AuditTrail } from '@/components/common/AuditTrail';
import { ApprovalLevels } from './ApprovalLevels';
import { StageBar } from './StageBar';
import { MoreActions } from './MoreActions';
import type { Lifecycle } from './lifecycle';
import type { FigureInput, SubmissionBase } from '@erp/shared';
import { ContextLine, FoldedLine, RecordDetails, RecordHeadline, checksFirst, liftFacts, useFoldedSections, type RecordContext } from './RecordParts';

/** One block of a record: a table of lines, the photos, the totals… In the drawer it sits under a divider, on the page in its own card. */
export interface RecordSection {
  key: string;
  title: string;
  /** Shown after the title, e.g. the number of photos. */
  count?: number;
  /** Nothing in it yet: it folds into the one "Nothing yet" line and leaves the anchor bar until opened. */
  empty?: boolean;
  children: React.ReactNode;
}

/** `pane`: inside another page, such as the Approvals inbox, which brings its own actions. */
export type RecordMode = 'drawer' | 'page' | 'pane';
type ActionSize = 'small' | 'middle';

/**
 * An action that lives in the record's ⋯ menu rather than beside Approve (Delete sat
 * next to Approve in the bar). Anything that destroys or cannot be taken back belongs here; the deciding buttons stay
 * in the bar. A `danger` item asks first, usually through `useConfirmDelete`.
 */
export interface RecordMenuAction {
  key: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

export interface RecordFrameProps {
  mode: RecordMode;
  /** Drawer only. */
  open?: boolean;
  onClose?: () => void;
  drawerSize?: number;
  /** What it is, as a heading before the record loads and in the page's breadcrumb: "Daily report". */
  kind: string;
  /** The list it belongs to, for the breadcrumb and the Back button. */
  list: { href: string; label: string };
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  /** Set once the record has loaded; everything below is about it. */
  record?: {
    /** Its own page, e.g. `/dpr/<id>`: "Open full page" in the drawer, Copy link on the page. */
    href: string;
    title: React.ReactNode;
    tags?: React.ReactNode;
    /** What it belongs to, under the title: the project, linked. Else the `project` fact stands in for it. */
    context?: RecordContext;
    /** The one to three figures a decision rests on (`figure()` facts), above the facts. */
    headline?: readonly FigureInput[];
    facts: NonNullable<DescriptionsProps['items']>;
    /** Reference facts (agreement, work order, terms, address): folded under Details. */
    details?: NonNullable<DescriptionsProps['items']>;
    lifecycle?: Lifecycle;
    /** Alerts above the sections (a draft, a closed order). */
    notices?: React.ReactNode;
    sections: RecordSection[];
    /** The audit log; `submission` stands in for it on entries made before the log existed (or seeded). */
    activity?: { type: ApprovalTypeParam; id: string; submission?: SubmissionBase };
    /** The record's actions, at the drawer's top or in the page's footer. */
    actions?: (size: ActionSize) => React.ReactNode;
    /** What sits in the ⋯ menu after them: deletes and anything else that should not be a tap from Approve. */
    more?: RecordMenuAction[];
    /** Its print-out; the page falls back to the browser's print of itself. */
    print?: () => void;
  };
  /** Dialogs the actions open. */
  children?: React.ReactNode;
}

const sectionId = (key: string) => `record-${key}`;

/**
 * The record's sections, and its comments after them when it is a submission: the activity's type is the
 * comment kind, and the count is its threads.
 */
function useSections(record: RecordFrameProps['record']): RecordSection[] {
  const kind = record?.activity ? (record.activity.type.toUpperCase() as CommentKind) : null;
  const id = record?.activity?.id;
  const comments = useComments(kind ?? 'DPR', kind ? id : undefined);
  if (!record) return [];
  if (!kind || !id) return checksFirst(record.sections);
  // Folded until the threads load, so the section never shows and then folds away.
  const threads = comments.data?.threads.length;
  return checksFirst([...record.sections, { key: 'comments', title: 'Comments', count: threads, empty: !threads, children: <CommentsSection kind={kind} entityId={id} /> }]);
}

/** The record's facts with the frame's own lifted out, its sections split into shown and folded. */
function useRecordParts(record: RecordFrameProps['record']) {
  const sections = useSections(record);
  const fold = useFoldedSections(sections);
  const lifted = record ? liftFacts(record.facts, { context: record.context, history: !!record.activity }) : { facts: [], context: undefined };
  return { ...fold, facts: lifted.facts, context: lifted.context };
}

/** The approval levels under the stage bar, once the entry has been submitted. */
const levelsOf = (record: NonNullable<RecordFrameProps['record']>) =>
  record.activity && record.lifecycle && record.lifecycle.current >= 2 ? <ApprovalLevels type={record.activity.type} id={record.activity.id} /> : null;

/** Whether the actions came out as nothing (no button this user may press), looking through fragments. */
function hasContent(node: React.ReactNode): boolean {
  if (node === null || node === undefined || typeof node === 'boolean' || node === '') return false;
  if (Array.isArray(node)) return node.some(hasContent);
  if (React.isValidElement(node) && node.type === React.Fragment) return hasContent((node.props as { children?: React.ReactNode }).children);
  return true;
}

/** The height of an element, following changes (the bar wraps onto a second line). */
function useHeight<E extends HTMLElement>(): [React.RefObject<E | null>, number] {
  const ref = useRef<E>(null);
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setHeight(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  });
  return [ref, height];
}

/** On a phone the actions sit in a bar fixed to the bottom of the screen, above the home indicator. */
const safeBottom = (padding: string) => `calc(${padding} + env(safe-area-inset-bottom))`;
/** A record's parts in the drawer and the inbox pane: a `Section` each (a hairline and its title), never a divider. */
const SECTION_GAP: React.CSSProperties = { marginTop: tk.space[4] };
const sectionTitle = (s: RecordSection) => (s.count === undefined ? s.title : `${s.title} (${s.count})`);

/**
 * A submission or document shown whole: in a drawer for a quick look from a list, or as its own
 * page with key facts, the stage bar, sections with an anchor bar, the activity beside them and the actions in a footer
 * that stays in view. Each record type fills the same props once and gets both.
 */
export function RecordFrame(props: RecordFrameProps) {
  // Opened records come back under Recent in Search (Ctrl K); the inbox's pane is a glance, not an opening.
  const shown = props.mode === 'page' || (props.mode === 'drawer' && !!props.open);
  const href = props.record?.href;
  const title = props.record?.title;
  useEffect(() => {
    if (!shown || !href) return;
    const name = typeof title === 'string' ? title : props.kind;
    rememberRecord({ href, title: name, kind: props.kind });
    // And Recent on Home, on every device.
    recordVisit('RECORD', href, `${name} · ${props.kind}`, href);
  }, [shown, href, title, props.kind]);
  return props.mode === 'drawer' ? <RecordDrawer {...props} /> : props.mode === 'pane' ? <RecordPane {...props} /> : <RecordPage {...props} />;
}

/** The record without a frame of its own and without its actions, which the host page supplies. */
function RecordPane({ loading, error, onRetry, record, children }: RecordFrameProps) {
  const { shown, folded, open, facts, context } = useRecordParts(record);
  return (
    <div className="record-pane">
      {loading && <Skeleton active paragraph={{ rows: 8 }} />}
      {!!error && <QueryError error={error} onRetry={onRetry} />}
      {record && (
        <>
          <Flex justify="space-between" align="flex-start" gap={tk.space[3]} style={{ marginBottom: tk.space[3] }}>
            <div>
              <Flex wrap gap={tk.space[2]} align="center">
                <span style={{ ...tk.type.title, color: tk.color.text.strong }} role="heading" aria-level={2} translate="no">
                  {record.title}
                </span>
                {record.tags}
              </Flex>
              <div>
                <ContextLine context={context} />
              </div>
            </div>
            <Flex gap={tk.space[1]}>
              {record.print && (
                <Tooltip title="Print">
                  <Button size="small" type="text" icon={<PrinterOutlined />} onClick={record.print} aria-label="Print" />
                </Tooltip>
              )}
              <Tooltip title="Open full page">
                <LinkButton href={record.href} size="small" type="text" icon={<ExpandOutlined />} aria-label="Open full page" />
              </Tooltip>
            </Flex>
          </Flex>
          {record.notices}
          <RecordHeadline figures={record.headline} />
          {facts.length ? <Descriptions size="small" column={{ xs: 1, sm: 2, xxl: 3 }} bordered items={facts} style={{ marginBottom: tk.space[4] }} /> : null}
          <RecordDetails items={record.details} column={{ xs: 1, sm: 2, xxl: 3 }} />
          {record.lifecycle && (
            <div role="group" aria-label="Stage">
              <StageBar {...record.lifecycle} label="Where it stands" style={{ marginBottom: tk.space[3] }} />
              {levelsOf(record)}
            </div>
          )}
          {shown.map((s) => (
            <Section key={s.key} title={sectionTitle(s)} style={SECTION_GAP}>
              {s.children}
            </Section>
          ))}
          <FoldedLine folded={folded} open={open} />
          {record.activity && (
            <Section title="History" style={SECTION_GAP}>
              <AuditTrail type={record.activity.type} id={record.activity.id} submission={record.activity.submission} />
            </Section>
          )}
        </>
      )}
      {children}
    </div>
  );
}

function RecordDrawer({ open: isOpen, onClose, drawerSize = 820, kind, loading, error, onRetry, record, children }: RecordFrameProps) {
  const { shown, folded, open, facts, context } = useRecordParts(record);
  // On a phone Approve, Submit and the rest are in the drawer's footer, always in reach of a thumb, not at its top.
  const phone = useIsPhone();
  const more = record?.more ?? [];
  const footerActions = phone && record ? record.actions?.('middle') : null;
  return (
    <Drawer
      open={isOpen}
      onClose={onClose}
      size={drawerSize}
      title={
        record ? (
          <div>
            <Flex wrap gap={tk.space[2]} align="center">
              <span translate="no">{record.title}</span>
              {record.tags}
            </Flex>
            {context ? (
              <div style={{ ...tk.type.body, marginTop: tk.space.half }}>
                <ContextLine context={context} />
              </div>
            ) : null}
          </div>
        ) : (
          kind
        )
      }
      extra={
        record ? (
          <Space wrap>
            {record.print && (
              <Button size="small" icon={<PrinterOutlined />} onClick={record.print}>
                Print
              </Button>
            )}
            <Tooltip title="Open full page">
              <LinkButton href={record.href} size="small" icon={<ExpandOutlined />} aria-label="Open full page" />
            </Tooltip>
            {phone ? null : record.actions?.('small')}
            {phone ? null : <MoreActions items={more} size="small" />}
          </Space>
        ) : null
      }
      footer={
        hasContent(footerActions) || (phone && more.length) ? (
          <Flex wrap gap={tk.space[2]} justify="flex-end" role="toolbar" aria-label="Record actions">
            {footerActions}
            {phone ? <MoreActions items={more} size="middle" /> : null}
          </Flex>
        ) : undefined
      }
      styles={phone ? { footer: { paddingBottom: safeBottom(tk.space[3]) } } : undefined}
      destroyOnHidden
    >
      {loading && <Skeleton active />}
      {!!error && <QueryError error={error} onRetry={onRetry} />}
      {record && (
        <>
          {record.notices}
          <RecordHeadline figures={record.headline} />
          {facts.length ? <Descriptions size="small" column={drawerSize >= 960 ? { xs: 1, sm: 2, lg: 3 } : { xs: 1, sm: 2 }} bordered items={facts} style={{ marginBottom: tk.space[4] }} /> : null}
          <RecordDetails items={record.details} column={drawerSize >= 960 ? { xs: 1, sm: 2, lg: 3 } : { xs: 1, sm: 2 }} />
          {record.lifecycle && (
            <div role="group" aria-label="Stage">
              <StageBar {...record.lifecycle} label="Where it stands" style={{ marginBottom: tk.space[3] }} />
              {levelsOf(record)}
            </div>
          )}
          {shown.map((s) => (
            <Section key={s.key} title={sectionTitle(s)} style={SECTION_GAP}>
              {s.children}
            </Section>
          ))}
          <FoldedLine folded={folded} open={open} />
          {record.activity && (
            <Section title="History" style={SECTION_GAP}>
              <AuditTrail type={record.activity.type} id={record.activity.id} submission={record.activity.submission} />
            </Section>
          )}
        </>
      )}
      {children}
    </Drawer>
  );
}

function RecordPage({ kind, list, loading, error, onRetry, record, children }: RecordFrameProps) {
  const { shown: sections, folded, open, facts, context } = useRecordParts(record);
  const { message } = App.useApp();
  const top = useStickyTop();
  const anchorHeight = 46;
  const phone = useIsPhone();
  const [barRef, barHeight] = useHeight<HTMLDivElement>();

  const copyLink = async () => {
    if (!record) return;
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${record.href}`);
      message.success('Link copied');
    } catch {
      message.warning('Could not copy. Copy the address from the address bar.');
    }
  };

  return (
    <div className="page-container record-page">
      <PageHeader
        crumbs={[{ title: list.label, href: list.href }, { title: kind }]}
        docTitle={typeof record?.title === 'string' ? record.title : kind}
        title={
          record ? (
            <Flex wrap gap={tk.space[3]} align="center" component="span">
              {/* Numbers and names stay as they are under a browser's translation (docs/WRITING.md). */}
              <span translate="no">{record.title}</span>
              {record.tags}
            </Flex>
          ) : (
            kind
          )
        }
        subtitle={context ? <ContextLine context={context} /> : undefined}
        extra={
          record ? (
            <span data-record-chrome>
              <Space wrap>
                <Button icon={<LinkOutlined />} onClick={copyLink}>
                  Copy link
                </Button>
                <Button icon={<PrinterOutlined />} onClick={record.print ?? (() => window.print())}>
                  Print
                </Button>
              </Space>
            </span>
          ) : null
        }
      />
      {loading && <PageSkeleton shape="record" header={false} />}
      {!!error && <QueryError error={error} onRetry={onRetry} />}
      {record && (
        <>
          <RecordHeadline figures={record.headline} />
          <Card style={{ marginBottom: tk.space[4] }}>
            {facts.length ? <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3, xxl: 4 }} items={facts} /> : null}
            <RecordDetails items={record.details} column={{ xs: 1, sm: 2, lg: 3, xxl: 4 }} />
            {record.lifecycle && (
              <div role="group" aria-label="Stage" style={facts.length || record.details?.length ? { marginTop: tk.space[4], paddingTop: tk.space[4], borderTop: tk.line('hairline') } : undefined}>
                <StageBar {...record.lifecycle} label="Where it stands" />
                {levelsOf(record)}
              </div>
            )}
          </Card>
          {record.notices}
          <Row gutter={[16, 16]}>
            <Col xs={24} xl={17}>
              {sections.length > 1 && (
                <div data-record-chrome style={{ position: 'sticky', top, zIndex: 4, background: tk.color.surface.canvas, marginBottom: tk.space[3] }}>
                  <Anchor
                    direction="horizontal"
                    affix={false}
                    replace
                    targetOffset={top + anchorHeight}
                    items={sections.map((s) => ({ key: s.key, href: `#${sectionId(s.key)}`, title: sectionTitle(s) }))}
                  />
                </div>
              )}
              {sections.map((s) => (
                <Card key={s.key} id={sectionId(s.key)} title={sectionTitle(s)} size="small" style={{ marginBottom: tk.space[4], scrollMarginTop: top + anchorHeight }}>
                  {s.children}
                </Card>
              ))}
              <FoldedLine folded={folded} open={open} />
            </Col>
            {record.activity && (
              <Col xs={24} xl={7}>
                <Card
                  title="History"
                  size="small"
                  style={{ position: 'sticky', top: `calc(${top}px + ${tk.space[3]})` }}
                  styles={{ body: { maxHeight: `calc(100vh - ${top + 160}px)`, overflowY: 'auto' } }}
                >
                  <AuditTrail type={record.activity.type} id={record.activity.id} submission={record.activity.submission} />
                </Card>
              </Col>
            )}
          </Row>
          <Flex
            ref={barRef}
            data-record-chrome
            justify="space-between"
            align="center"
            gap={phone ? tk.space[2] : tk.space[3]}
            wrap
            role="toolbar"
            aria-label="Record actions"
            style={
              phone
                ? {
                    position: 'fixed',
                    left: 0,
                    right: 0,
                    bottom: 0,
                    zIndex: 20,
                    padding: `${tk.space[2]} ${tk.space[3]}`,
                    paddingBottom: safeBottom(tk.space[2]),
                    background: tk.color.surface.base,
                    borderTop: tk.line('hairline'),
                    boxShadow: tk.shadow.float,
                  }
                : {
                    position: 'sticky',
                    bottom: 0,
                    zIndex: 5,
                    marginTop: tk.space[4],
                    padding: `${tk.space[3]} ${tk.space[4]}`,
                    background: tk.color.surface.base,
                    border: tk.line('hairline'),
                    borderRadius: tk.radius.lg,
                    boxShadow: tk.shadow.float,
                  }
            }
          >
            <LinkButton href={list.href} icon={<ArrowLeftOutlined />} aria-label={phone ? `Back to ${list.label}` : undefined}>
              {phone ? null : list.label}
            </LinkButton>
            {phone ? (
              <Flex wrap gap={tk.space[2]} justify="flex-end" style={{ flex: 1 }}>
                {record.actions?.('middle')}
                <MoreActions items={record.more ?? []} size="middle" />
              </Flex>
            ) : (
              <Space wrap>
                {record.actions?.('middle')}
                <MoreActions items={record.more ?? []} size="middle" />
              </Space>
            )}
          </Flex>
          {/* Room under the content for the fixed bar, so nothing hides behind it. */}
          {phone ? <div aria-hidden style={{ height: `calc(${barHeight}px + ${tk.space[4]})` }} /> : null}
        </>
      )}
      {children}
    </div>
  );
}
