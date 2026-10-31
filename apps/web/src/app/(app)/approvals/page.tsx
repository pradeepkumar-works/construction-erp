'use client';

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert, App, Button, ConfigProvider, Empty, Flex, Grid, Input, Segmented, Select, Skeleton, Splitter, Typography, theme } from 'antd';
import { CheckOutlined } from '@/components/common/icons';
import type { PendingApprovalDto, ReviewDecision, SubmissionType } from '@erp/shared';
import { APPROVAL_AMOUNT_BASIS, SUBMISSION_TYPE_LABELS, approvalRightsOf, mayApprove } from '@erp/shared';
import { useProjectScope } from '@/lib/project-scope';
import { useUrlParam } from '@/lib/url-state';
import { approvalTypeParam, usePendingApprovals } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { approveTheme } from '@/lib/theme';
import { formatINR, inSentence } from '@/lib/format';
import { PageHeader } from '@/components/common/PageHeader';
import { QueryError } from '@/components/common/QueryState';
import { EmptyArt } from '@/components/common/EmptyArt';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { ReviewDialog } from '@/components/common/ReviewActions';
import { useApproveMany } from '@/components/list/bulk';
import { dialogOpen, isTyping } from '@/components/shell/HelpMenu';
import { singleKeysOn } from '@/lib/shortcuts';
import { ApprovalQueue } from '@/components/approvals/ApprovalQueue';
import { ApprovalPane } from '@/components/approvals/ApprovalPane';
import { ReviewedToday } from '@/components/approvals/ReviewedToday';
import { decidedInPlace, groupQueue, QUEUE_TYPE_LABELS, QUEUE_TYPES, queueKey, recordPage } from '@/components/approvals/queue';
import { ProgressDrawer } from '@/components/progress/ProgressDrawer';
import { DprDrawer } from '@/components/dpr/DprDrawer';
import { MrDrawer } from '@/components/material/MrDrawer';
import { MachineryDrawer } from '@/components/machinery/MachineryDrawer';
import { ExpenseDrawer } from '@/components/expenses/ExpenseDrawer';
import { MeasurementDrawer } from '@/components/measurements/MeasurementDrawer';
import { BillDrawer } from '@/components/bills/BillDrawer';
import { PurchaseOrderDrawer } from '@/components/purchasing/PurchaseOrderDrawer';
import { VendorBillDrawer } from '@/components/purchasing/VendorBillDrawer';
import { WorkOrderDrawer } from '@/components/subcontracts/WorkOrderDrawer';
import { SubBillDrawer } from '@/components/subcontracts/SubBillDrawer';
import { InspectionDrawer } from '@/components/inspections/InspectionDrawer';
import { PaymentRequestDrawer } from '@/components/payables/PaymentRequestRecord';
import { SupplierChoiceDrawer } from '@/components/purchasing/SupplierChoiceRecord';

type Opened = { type: SubmissionType; id: string };

/**
 * The Approvals inbox (UI roadmap item 58): the queue on the left in groups by type, the picked entry on the right with
 * Approve, Request changes and Reject under it, a selection of one type approved together, and J, K, A, C, R, X and O
 * on the keyboard. Phones get the queue alone, each entry opening in its drawer.
 */
export default function ApprovalsPage() {
  const { token } = theme.useToken();
  const { modal } = App.useApp();
  const router = useRouter();
  const screens = Grid.useBreakpoint();
  const split = !!screens.lg;
  const { user } = useAuth();
  const approver = !!user && mayApprove(user);
  const rights = user ? approvalRightsOf(user) : [];
  const limited = rights.filter((r) => r.maxAmount !== null && APPROVAL_AMOUNT_BASIS[r.type]);
  const { data, isLoading, error, refetch } = usePendingApprovals(approver);
  const approveMany = useApproveMany();

  // The search, type and order are in the URL (UX item 84): a reload or a link sent on opens the same queue.
  const [typeParam, setTypeParam] = useUrlParam('type');
  const type = QUEUE_TYPES.some(([t]) => t === typeParam) ? (typeParam as SubmissionType) : undefined;
  const setType = (t?: SubmissionType) => setTypeParam(t);
  const [projectId, setProjectId] = useProjectScope();
  const [searchParam, setSearch] = useUrlParam('q');
  const search = searchParam ?? '';
  const [order, setOrder] = useUrlParam('order');
  const newestFirst = order === 'newest';
  const setNewestFirst = (on: boolean) => setOrder(on ? 'newest' : undefined);
  const [collapsed, setCollapsed] = useState<Set<SubmissionType>>(new Set());
  const [current, setCurrent] = useState<string | null>(null);
  const lastIndex = useRef(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedType, setSelectedType] = useState<SubmissionType | null>(null);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [drawer, setDrawer] = useState<Opened | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);

  const counts = useMemo(() => {
    const c: Partial<Record<SubmissionType, number>> = {};
    for (const p of data ?? []) if (!projectId || p.projectId === projectId) c[p.type] = (c[p.type] ?? 0) + 1;
    return c;
  }, [data, projectId]);

  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    const items = (data ?? []).filter(
      (p) =>
        (!type || p.type === type) &&
        (!projectId || p.projectId === projectId) &&
        (!q || `${p.title} ${p.projectName} ${p.submittedByName}`.toLowerCase().includes(q)),
    );
    return groupQueue(items, newestFirst);
  }, [data, type, projectId, search, newestFirst]);

  const flat = useMemo(() => groups.filter((g) => !collapsed.has(g.type)).flatMap((g) => g.items), [groups, collapsed]);
  const total = groups.reduce((n, g) => n + g.items.length, 0);
  const currentItem = flat.find((p) => queueKey(p) === current) ?? null;

  // The picked entry stays picked while it waits; once decided (or filtered away) the one now in its place is picked.
  useEffect(() => {
    if (!split) return;
    const at = flat.findIndex((p) => queueKey(p) === current);
    if (at >= 0) {
      lastIndex.current = at;
      return;
    }
    setCurrent(flat.length ? queueKey(flat[Math.min(lastIndex.current, flat.length - 1)]) : null);
  }, [flat, current, split]);

  // A selection only holds entries still waiting.
  useEffect(() => {
    const waiting = new Set((data ?? []).map(queueKey));
    setSelected((s) => {
      const kept = [...s].filter((k) => waiting.has(k));
      if (kept.length === s.size) return s;
      if (!kept.length) setSelectedType(null);
      return new Set(kept);
    });
  }, [data]);

  const open = useCallback(
    (p: PendingApprovalDto) => {
      if (split) setCurrent(queueKey(p));
      else setDrawer({ type: p.type, id: p.id });
    },
    [split, setCurrent, setDrawer],
  );

  const select = (keys: string[], t: SubmissionType, on: boolean) => {
    setSelected((s) => {
      const next = new Set(selectedType === t ? s : []);
      for (const k of keys) {
        if (on) next.add(k);
        else next.delete(k);
      }
      setSelectedType(next.size ? t : null);
      return next;
    });
  };
  const clearSelection = () => {
    setSelected(new Set());
    setSelectedType(null);
  };

  const bulkApprove = () => {
    if (!selectedType || !selected.size) return;
    const t = selectedType;
    const ids = [...selected].map((k) => k.slice(k.indexOf(':') + 1));
    modal.confirm({
      title: `Approve ${ids.length} ${ids.length === 1 ? 'entry' : 'entries'} in ${inSentence(QUEUE_TYPE_LABELS[t])}?`,
      content: 'Each is approved on its own, as if one by one: its submitter is told and its activity shows your approval.',
      okText: `Approve ${ids.length}`,
      // They leave the queue at once (UX item 86) while they are sent one by one; a refusal brings back the rest.
      onOk: () => {
        setBulkRunning(true);
        void approveMany(approvalTypeParam[t], ids).finally(() => {
          setBulkRunning(false);
          clearSelection();
        });
      },
    });
  };

  const decide = (d: ReviewDecision) => {
    if (!currentItem) return;
    if (decidedInPlace(currentItem.type)) setDecision(d);
    else setDrawer({ type: currentItem.type, id: currentItem.id });
  };

  // J and K move, A, C and R decide, X ticks, O opens the full page (or the details), unless single keys are off.
  useEffect(() => {
    if (!split) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || !singleKeysOn() || isTyping(e.target) || dialogOpen()) return;
      const k = e.key.toLowerCase();
      if (!['j', 'k', 'a', 'c', 'r', 'x', 'o'].includes(k) || !flat.length) return;
      e.preventDefault();
      const at = Math.max(0, flat.findIndex((p) => queueKey(p) === current));
      if (k === 'j') setCurrent(queueKey(flat[Math.min(at + 1, flat.length - 1)]));
      else if (k === 'k') setCurrent(queueKey(flat[Math.max(at - 1, 0)]));
      else if (!currentItem) return;
      else if (k === 'a') decide('APPROVE');
      else if (k === 'c') decide('REQUEST_CHANGES');
      else if (k === 'r') decide('REJECT');
      else if (k === 'x' && decidedInPlace(currentItem.type)) select([queueKey(currentItem)], currentItem.type, !selected.has(queueKey(currentItem)));
      else if (k === 'o') {
        const href = recordPage(currentItem.type, currentItem.id);
        if (href) router.push(href);
        else setDrawer({ type: currentItem.type, id: currentItem.id });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // The split view fills the window below the header, each side scrolling on its own.
  const splitRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(560);
  useLayoutEffect(() => {
    const measure = () => {
      const el = splitRef.current;
      if (!el) return;
      const h = Math.max(480, Math.round(window.innerHeight - (el.getBoundingClientRect().top + window.scrollY) - 24));
      setHeight((old) => (old === h ? old : h));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  });

  const typeOptions = QUEUE_TYPES.filter(([t]) => rights.some((r) => r.type === t)).map(([t, label]) => ({ value: t, label: `${label} (${counts[t] ?? 0})` }));

  const queue = (
    <>
      {selected.size > 0 && selectedType && (
        <Flex
          align="center"
          justify="space-between"
          gap={token.marginXS}
          role="toolbar"
          aria-label="Selection"
          style={{ position: 'sticky', top: 0, zIndex: 2, padding: `${token.paddingXS}px ${token.paddingSM}px`, background: token.colorPrimaryBg, borderBottom: `${token.lineWidth}px ${token.lineType} ${token.colorPrimaryBorder}` }}
        >
          <Typography.Text strong>
            {selected.size} selected in {inSentence(QUEUE_TYPE_LABELS[selectedType])}
          </Typography.Text>
          <Flex gap={token.marginXS}>
            <Button size="small" type="text" onClick={clearSelection}>
              Clear
            </Button>
            <ConfigProvider theme={approveTheme}>
              <Button size="small" type="primary" icon={<CheckOutlined />} loading={bulkRunning} onClick={bulkApprove}>
                Approve {selected.size}
              </Button>
            </ConfigProvider>
          </Flex>
        </Flex>
      )}
      {isLoading ? (
        <div style={{ padding: token.padding }}>
          <Skeleton active paragraph={{ rows: 8 }} />
        </div>
      ) : total === 0 ? (
        <EmptyArt art="approved" title={!approver ? 'No pending approvals' : (data?.length ?? 0) > 0 ? 'Nothing matches these filters' : 'Nothing waiting for approval. Great work!'} />
      ) : (
        <ApprovalQueue
          groups={groups}
          current={split ? current : null}
          onOpen={open}
          selected={selected}
          selectedType={selectedType}
          onSelect={select}
          collapsed={collapsed}
          onToggleGroup={(t) =>
            setCollapsed((c) => {
              const next = new Set(c);
              if (next.has(t)) next.delete(t);
              else next.add(t);
              return next;
            })
          }
        />
      )}
    </>
  );

  const frame = { background: token.colorBgContainer, border: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, overflow: 'hidden' } as const;

  return (
    <div className="page-container">
      <PageHeader title="Approvals" subtitle={approver ? `${data?.length ?? 0} waiting for your review` : 'Site submissions waiting for review'} extra={approver ? <ReviewedToday onOpen={(r) => setDrawer({ type: r.type, id: r.id })} /> : undefined} />
      {!approver && <Alert type="info" showIcon title="Your role cannot approve submissions. Submissions you create appear in the project pages with their current status." style={{ marginBottom: token.margin }} />}
      {limited.length > 0 && (
        <Alert
          type="info"
          showIcon
          closable
          title={`Your approval limit: ${limited.map((r) => `${inSentence(SUBMISSION_TYPE_LABELS[r.type])} up to ${formatINR(r.maxAmount)}`).join(', ')}. Anything above goes to a higher approver.`}
          style={{ marginBottom: token.margin }}
        />
      )}
      {!!error && <QueryError error={error} onRetry={() => refetch()} />}
      <Flex wrap gap={token.marginSM} align="center" style={{ marginBottom: token.marginSM }}>
        <Input.Search allowClear placeholder="Search the queue" aria-label="Search the queue" value={search} onChange={(e) => setSearch(e.target.value)} style={{ width: screens.md ? 240 : '100%' }} />
        <Select<SubmissionType> allowClear placeholder="All types" aria-label="Type" value={type} onChange={setType} options={typeOptions} style={{ minWidth: 200, width: screens.md ? undefined : '100%' }} popupMatchSelectWidth={false} />
        <ProjectSelect value={projectId} onChange={(v) => setProjectId(v)} style={{ minWidth: 260, width: screens.md ? undefined : '100%' }} />
        <Segmented<'old' | 'new'>
          aria-label="Order"
          value={newestFirst ? 'new' : 'old'}
          onChange={(v) => setNewestFirst(v === 'new')}
          options={[
            { value: 'old', label: 'Oldest first' },
            { value: 'new', label: 'Newest first' },
          ]}
        />
      </Flex>
      {split ? (
        <div ref={splitRef} style={{ ...frame, height }}>
          <Splitter style={{ height: '100%' }}>
            <Splitter.Panel defaultSize="38%" min={320} max="60%" style={{ overflowY: 'auto' }}>
              {queue}
            </Splitter.Panel>
            <Splitter.Panel style={{ overflow: 'hidden' }}>
              {currentItem ? (
                <ApprovalPane item={currentItem} onDecide={decide} onOpenDetails={() => setDrawer({ type: currentItem.type, id: currentItem.id })} />
              ) : (
                <Flex align="center" justify="center" style={{ height: '100%' }}>
                  <Empty description={total ? 'Pick an entry from the queue' : 'Nothing to review'} />
                </Flex>
              )}
            </Splitter.Panel>
          </Splitter>
        </div>
      ) : (
        <div style={frame}>{queue}</div>
      )}
      {currentItem && decidedInPlace(currentItem.type) && (
        <ReviewDialog type={approvalTypeParam[currentItem.type]} id={currentItem.id} decision={decision} onClose={() => setDecision(null)} />
      )}
      <ProgressDrawer id={drawer?.type === 'PROGRESS' ? drawer.id : null} open={drawer?.type === 'PROGRESS'} onClose={() => setDrawer(null)} />
      <DprDrawer id={drawer?.type === 'DPR' ? drawer.id : null} open={drawer?.type === 'DPR'} onClose={() => setDrawer(null)} />
      <MrDrawer id={drawer?.type === 'MATERIAL_REQUEST' ? drawer.id : null} open={drawer?.type === 'MATERIAL_REQUEST'} onClose={() => setDrawer(null)} />
      <MachineryDrawer id={drawer?.type === 'MACHINERY' ? drawer.id : null} open={drawer?.type === 'MACHINERY'} onClose={() => setDrawer(null)} />
      <ExpenseDrawer id={drawer?.type === 'EXPENSE' ? drawer.id : null} open={drawer?.type === 'EXPENSE'} onClose={() => setDrawer(null)} />
      <MeasurementDrawer id={drawer?.type === 'MEASUREMENT' ? drawer.id : null} open={drawer?.type === 'MEASUREMENT'} onClose={() => setDrawer(null)} />
      <BillDrawer id={drawer?.type === 'BILL' ? drawer.id : null} open={drawer?.type === 'BILL'} onClose={() => setDrawer(null)} />
      <PurchaseOrderDrawer id={drawer?.type === 'PURCHASE_ORDER' ? drawer.id : null} open={drawer?.type === 'PURCHASE_ORDER'} onClose={() => setDrawer(null)} />
      <VendorBillDrawer id={drawer?.type === 'VENDOR_BILL' ? drawer.id : null} open={drawer?.type === 'VENDOR_BILL'} onClose={() => setDrawer(null)} />
      <WorkOrderDrawer id={drawer?.type === 'WORK_ORDER' ? drawer.id : null} open={drawer?.type === 'WORK_ORDER'} onClose={() => setDrawer(null)} />
      <SubBillDrawer id={drawer?.type === 'SUBCONTRACT_BILL' ? drawer.id : null} open={drawer?.type === 'SUBCONTRACT_BILL'} onClose={() => setDrawer(null)} />
      <InspectionDrawer id={drawer?.type === 'INSPECTION' ? drawer.id : null} open={drawer?.type === 'INSPECTION'} onClose={() => setDrawer(null)} />
      <PaymentRequestDrawer id={drawer?.type === 'PAYMENT_REQUEST' ? drawer.id : null} open={drawer?.type === 'PAYMENT_REQUEST'} onClose={() => setDrawer(null)} />
      <SupplierChoiceDrawer id={drawer?.type === 'SUPPLIER_CHOICE' ? drawer.id : null} open={drawer?.type === 'SUPPLIER_CHOICE'} onClose={() => setDrawer(null)} />
    </div>
  );
}
