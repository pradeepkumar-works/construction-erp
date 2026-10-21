'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Anchor, App, Button, Card, Col, Descriptions, Divider, Drawer, Flex, Row, Skeleton, Space, Steps, Tooltip, theme } from 'antd';
import type { DescriptionsProps } from 'antd';
import { ArrowLeftOutlined, ExpandOutlined, LinkOutlined, PrinterOutlined } from '@ant-design/icons';
import type { ApprovalTypeParam } from '@/lib/queries';
import { useStickyTop } from '@/lib/sticky';
import { useIsPhone } from '@/lib/screen';
import { rememberRecord } from '@/lib/recent';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { PageHeader } from '@/components/common/PageHeader';
import { LinkButton } from '@/components/common/LinkButton';
import { AuditTrail } from '@/components/common/AuditTrail';
import { ApprovalLevels } from './ApprovalLevels';
import type { Lifecycle } from './lifecycle';
import type { SubmissionBase } from '@erp/shared';

/** One block of a record: a table of lines, the photos, the totals… In the drawer it sits under a divider, on the page in its own card. */
export interface RecordSection {
  key: string;
  title: string;
  /** Shown after the title, e.g. the number of photos. */
  count?: number;
  children: React.ReactNode;
}

/** `pane`: inside another page, such as the Approvals inbox, which brings its own actions. */
export type RecordMode = 'drawer' | 'page' | 'pane';
type ActionSize = 'small' | 'middle';

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
    facts: NonNullable<DescriptionsProps['items']>;
    lifecycle?: Lifecycle;
    /** Alerts above the sections (a draft, a closed order). */
    notices?: React.ReactNode;
    sections: RecordSection[];
    /** The audit log; `submission` stands in for it on entries made before the log existed (or seeded). */
    activity?: { type: ApprovalTypeParam; id: string; submission?: SubmissionBase };
    /** The record's actions, at the drawer's top or in the page's footer. */
    actions?: (size: ActionSize) => React.ReactNode;
    /** Its print-out; the page falls back to the browser's print of itself. */
    print?: () => void;
  };
  /** Dialogs the actions open. */
  children?: React.ReactNode;
}

const sectionId = (key: string) => `record-${key}`;

/** The approval levels under the stage bar (v5 item 94), once the entry has been submitted. */
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

/** On a phone the actions sit in a bar fixed to the bottom of the screen, above the home indicator (UX item 84). */
const safeBottom = (padding: number) => `calc(${padding}px + env(safe-area-inset-bottom))`;
const sectionTitle = (s: RecordSection) => (s.count === undefined ? s.title : `${s.title} (${s.count})`);

/**
 * A submission or document shown whole (UI roadmap item 57): in a drawer for a quick look from a list, or as its own
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
    rememberRecord({ href, title: typeof title === 'string' ? title : props.kind, kind: props.kind });
  }, [shown, href, title, props.kind]);
  return props.mode === 'drawer' ? <RecordDrawer {...props} /> : props.mode === 'pane' ? <RecordPane {...props} /> : <RecordPage {...props} />;
}

/** The record without a frame of its own and without its actions, which the host page supplies. */
function RecordPane({ loading, error, onRetry, record, children }: RecordFrameProps) {
  const { token } = theme.useToken();
  return (
    <div className="record-pane">
      {loading && <Skeleton active paragraph={{ rows: 8 }} />}
      {!!error && <QueryError error={error} onRetry={onRetry} />}
      {record && (
        <>
          <Flex justify="space-between" align="flex-start" gap={token.marginSM} style={{ marginBottom: token.marginSM }}>
            <Space wrap size={token.marginXS} align="center">
              <span style={{ fontSize: token.fontSizeLG, fontWeight: token.fontWeightStrong }} role="heading" aria-level={2} translate="no">
                {record.title}
              </span>
              {record.tags}
            </Space>
            <Space size={token.marginXXS}>
              {record.print && (
                <Tooltip title="Print">
                  <Button size="small" type="text" icon={<PrinterOutlined />} onClick={record.print} aria-label="Print" />
                </Tooltip>
              )}
              <Tooltip title="Open full page">
                <LinkButton href={record.href} size="small" type="text" icon={<ExpandOutlined />} aria-label="Open full page" />
              </Tooltip>
            </Space>
          </Flex>
          {record.notices}
          <Descriptions size="small" column={{ xs: 1, sm: 2, xxl: 3 }} bordered items={record.facts} style={{ marginBottom: token.margin }} />
          {record.lifecycle && (
            <div role="group" aria-label="Stage">
              <Steps size="small" {...record.lifecycle} style={{ marginBottom: token.marginXS }} />
              {levelsOf(record)}
            </div>
          )}
          {record.sections.map((s) => (
            <React.Fragment key={s.key}>
              <Divider titlePlacement="start" plain>
                {sectionTitle(s)}
              </Divider>
              {s.children}
            </React.Fragment>
          ))}
          {record.activity && (
            <>
              <Divider titlePlacement="start" plain>
                Activity
              </Divider>
              <AuditTrail type={record.activity.type} id={record.activity.id} submission={record.activity.submission} />
            </>
          )}
        </>
      )}
      {children}
    </div>
  );
}

function RecordDrawer({ open, onClose, drawerSize = 820, kind, loading, error, onRetry, record, children }: RecordFrameProps) {
  const { token } = theme.useToken();
  // On a phone Approve, Submit and the rest are in the drawer's footer, always in reach of a thumb, not at its top.
  const phone = useIsPhone();
  const footerActions = phone && record ? record.actions?.('middle') : null;
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={drawerSize}
      title={
        record ? (
          <Space wrap size={token.marginXS}>
            <span translate="no">{record.title}</span>
            {record.tags}
          </Space>
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
          </Space>
        ) : null
      }
      footer={
        hasContent(footerActions) ? (
          <Flex wrap gap={token.marginXS} justify="flex-end" role="toolbar" aria-label="Record actions">
            {footerActions}
          </Flex>
        ) : undefined
      }
      styles={phone ? { footer: { paddingBottom: safeBottom(token.paddingSM) } } : undefined}
      destroyOnHidden
    >
      {loading && <Skeleton active />}
      {!!error && <QueryError error={error} onRetry={onRetry} />}
      {record && (
        <>
          {record.notices}
          <Descriptions size="small" column={drawerSize >= 960 ? { xs: 1, sm: 2, lg: 3 } : { xs: 1, sm: 2 }} bordered items={record.facts} style={{ marginBottom: token.margin }} />
          {record.lifecycle && (
            <div role="group" aria-label="Stage">
              <Steps size="small" {...record.lifecycle} style={{ marginBottom: token.marginXS }} />
              {levelsOf(record)}
            </div>
          )}
          {record.sections.map((s) => (
            <React.Fragment key={s.key}>
              <Divider titlePlacement="start" plain>
                {sectionTitle(s)}
              </Divider>
              {s.children}
            </React.Fragment>
          ))}
          {record.activity && (
            <>
              <Divider titlePlacement="start" plain>
                Activity
              </Divider>
              <AuditTrail type={record.activity.type} id={record.activity.id} submission={record.activity.submission} />
            </>
          )}
        </>
      )}
      {children}
    </Drawer>
  );
}

function RecordPage({ kind, list, loading, error, onRetry, record, children }: RecordFrameProps) {
  const { token } = theme.useToken();
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
            <Space wrap size={token.marginSM} align="center">
              {/* Numbers and names stay as they are under a browser's translation (docs/WRITING.md). */}
              <span translate="no">{record.title}</span>
              {record.tags}
            </Space>
          ) : (
            kind
          )
        }
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
          <Card style={{ marginBottom: token.margin }}>
            <Descriptions size="small" column={{ xs: 1, sm: 2, lg: 3, xxl: 4 }} items={record.facts} />
            {record.lifecycle && (
              <div role="group" aria-label="Stage" style={{ marginTop: token.margin, paddingTop: token.padding, borderTop: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}` }}>
                <Steps size="small" {...record.lifecycle} />
                {levelsOf(record)}
              </div>
            )}
          </Card>
          {record.notices}
          <Row gutter={[token.margin, token.margin]}>
            <Col xs={24} xl={17}>
              {record.sections.length > 1 && (
                <div data-record-chrome style={{ position: 'sticky', top, zIndex: 4, background: token.colorBgLayout, marginBottom: token.marginSM }}>
                  <Anchor
                    direction="horizontal"
                    affix={false}
                    replace
                    targetOffset={top + anchorHeight}
                    items={record.sections.map((s) => ({ key: s.key, href: `#${sectionId(s.key)}`, title: sectionTitle(s) }))}
                  />
                </div>
              )}
              {record.sections.map((s) => (
                <Card key={s.key} id={sectionId(s.key)} title={sectionTitle(s)} size="small" style={{ marginBottom: token.margin, scrollMarginTop: top + anchorHeight }}>
                  {s.children}
                </Card>
              ))}
            </Col>
            {record.activity && (
              <Col xs={24} xl={7}>
                <Card
                  title="Activity"
                  size="small"
                  style={{ position: 'sticky', top: top + token.marginSM }}
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
            gap={phone ? token.marginXS : token.marginSM}
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
                    padding: `${token.paddingXS}px ${token.paddingSM}px`,
                    paddingBottom: safeBottom(token.paddingXS),
                    background: token.colorBgContainer,
                    borderTop: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`,
                    boxShadow: token.boxShadowTertiary,
                  }
                : {
                    position: 'sticky',
                    bottom: 0,
                    zIndex: 5,
                    marginTop: token.margin,
                    padding: `${token.paddingSM}px ${token.padding}px`,
                    background: token.colorBgContainer,
                    border: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`,
                    borderRadius: token.borderRadiusLG,
                    boxShadow: token.boxShadowTertiary,
                  }
            }
          >
            <LinkButton href={list.href} icon={<ArrowLeftOutlined />} aria-label={phone ? `Back to ${list.label}` : undefined}>
              {phone ? null : list.label}
            </LinkButton>
            {phone ? (
              <Flex wrap gap={token.marginXS} justify="flex-end" style={{ flex: 1 }}>
                {record.actions?.('middle')}
              </Flex>
            ) : (
              <Space wrap>{record.actions?.('middle')}</Space>
            )}
          </Flex>
          {/* Room under the content for the fixed bar, so nothing hides behind it. */}
          {phone ? <div aria-hidden style={{ height: barHeight + token.margin }} /> : null}
        </>
      )}
      {children}
    </div>
  );
}
