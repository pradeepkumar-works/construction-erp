'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Card, Empty, Flex, Select, Space, Typography } from 'antd';
import { tk } from '@/ds';
import { orgChart, type OrgNode, type OrgPersonDto } from '@erp/shared';
import { useOrgPeople } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { DownOutlined, RightOutlined } from '@/components/common/icons';

type Node = OrgNode<OrgPersonDto>;
const HEAD_OFFICE = 'head-office';
const ALL = 'all';

/** The levels open when the chart first draws: the people at the top and who reports to them. */
const OPEN_DEPTH = 1;

const ids = (nodes: Node[], depth: number, upTo: number): string[] =>
  depth > upTo ? [] : nodes.flatMap((n) => (n.reports.length ? [n.person.id, ...ids(n.reports, depth + 1, upTo)] : []));

/**
 * The org chart: everyone under the person they report to (the operational line, whose recommendation their leave,
 * overtime and corrections wait on), with the functional line beside each name. Filtered to head office or one site,
 * someone whose manager sits elsewhere starts a tree and says whom they report to.
 */
export function OrgChart() {
  const { data, isLoading, error, refetch } = useOrgPeople();
  const [place, setPlace] = useState<string>(ALL);
  const [open, setOpen] = useState<Set<string> | null>(null);

  const places = useMemo(() => {
    const sites = new Map<string, string>();
    for (const p of data ?? []) if (p.projectId && p.projectName) sites.set(p.projectId, p.projectName);
    return [...sites].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data]);
  const people = useMemo(() => (data ?? []).filter((p) => place === ALL || (place === HEAD_OFFICE ? !p.projectId : p.projectId === place)), [data, place]);
  const roots = useMemo(() => orgChart(people), [people]);
  const expanded = open ?? new Set(ids(roots, 0, OPEN_DEPTH - 1));
  const toggle = (id: string) => {
    const next = new Set(expanded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setOpen(next);
  };

  if (isLoading) return <PageSkeleton shape="list" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;

  const managers = people.filter((p) => people.some((q) => q.reportingToId === p.id)).length;
  return (
    <div className="page-container">
      <PageHeader
        title="Org chart"
        subtitle="Who reports to whom. Leave, overtime and attendance corrections wait on the person someone reports to, then HR. A functional line is shown beside the name and routes nothing."
        crumbs={[{ title: 'HR and payroll', href: '/modules/people' }, { title: 'Org chart' }]}
      />
      <Card size="small">
        <Flex wrap gap="small" align="center" justify="space-between" style={{ marginBottom: tk.space[4] }}>
          <Select
            aria-label="Show"
            value={place}
            onChange={(v) => {
              setPlace(v);
              setOpen(null);
            }}
            style={{ minWidth: 220, maxWidth: '100%' }}
            showSearch={{ optionFilterProp: 'label' }}
            options={[{ value: ALL, label: 'Everyone' }, { value: HEAD_OFFICE, label: 'Head office' }, ...places.map(([value, label]) => ({ value, label }))]}
          />
          <Space wrap>
            <Typography.Text type="secondary">
              <span translate="no">{people.length}</span> {people.length === 1 ? 'person' : 'people'}, <span translate="no">{managers}</span> with people reporting to them
            </Typography.Text>
            <Button size="small" onClick={() => setOpen(new Set(ids(roots, 0, Infinity)))}>
              Open all
            </Button>
            <Button size="small" onClick={() => setOpen(new Set())}>
              Close all
            </Button>
          </Space>
        </Flex>
        {roots.length ? <People nodes={roots} expanded={expanded} toggle={toggle} top /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No one is posted here" />}
      </Card>
    </div>
  );
}

function People({ nodes, expanded, toggle, top = false }: { nodes: Node[]; expanded: Set<string>; toggle: (id: string) => void; top?: boolean }) {
  return (
    <ul
      style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        ...(top ? {} : { marginInlineStart: tk.space[3], paddingInlineStart: tk.space[3], borderInlineStart: tk.line('hairline') }),
      }}
    >
      {nodes.map((n) => (
        <Person key={n.person.id} node={n} expanded={expanded} toggle={toggle} top={top} />
      ))}
    </ul>
  );
}

function Person({ node, expanded, toggle, top }: { node: Node; expanded: Set<string>; toggle: (id: string) => void; top: boolean }) {
  const p = node.person;
  const isOpen = expanded.has(p.id);
  const listId = `org-${p.id}`;
  const meta = [p.designation, p.department, p.projectName ?? 'Head office'].filter(Boolean).join(' · ');
  // A root whose manager is outside the list: they left, or sit outside the filter.
  const outside = top && p.reportingToId && !node.loop ? p.reportingToName : null;
  return (
    <li style={{ paddingBlock: tk.space[1] }}>
      <Flex gap="small" align="flex-start">
        {node.reports.length ? (
          <Button
            type="text"
            size="small"
            icon={isOpen ? <DownOutlined /> : <RightOutlined />}
            aria-expanded={isOpen}
            aria-controls={isOpen ? listId : undefined}
            aria-label={`${isOpen ? 'Hide' : 'Show'} the ${node.below} ${node.below === 1 ? 'person' : 'people'} under ${p.fullName}`}
            onClick={() => toggle(p.id)}
          />
        ) : (
          // Holds the toggle's place, at the toggle's own size on a touch screen too.
          <Button type="text" size="small" icon={<RightOutlined />} disabled tabIndex={-1} aria-hidden style={{ visibility: 'hidden' }} />
        )}
        <div style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
          <div>
            <Link href={`/staff?tab=staff&employee=${p.id}`} translate="no" style={{ ...tk.type.strong }}>
              {p.fullName}
            </Link>{' '}
            <Typography.Text type="secondary" translate="no">
              {p.employeeCode}
            </Typography.Text>
            {node.reports.length > 0 && !isOpen ? (
              <Typography.Text type="secondary">
                {' '}
                · <span translate="no">{node.below}</span> below
              </Typography.Text>
            ) : null}
          </div>
          <Typography.Text type="secondary" style={tk.type.caption}>
            {meta}
          </Typography.Text>
          {p.functionalManagerName && (
            <div style={tk.type.caption}>
              <Typography.Text type="secondary" style={{ fontSize: 'inherit' }}>
                Also reports to <span translate="no">{p.functionalManagerName}</span> (functional)
              </Typography.Text>
            </div>
          )}
          {outside && (
            <div style={tk.type.caption}>
              <Typography.Text type="secondary" style={{ fontSize: 'inherit' }}>
                Reports to <span translate="no">{outside}</span>
              </Typography.Text>
            </div>
          )}
          {node.loop && (
            <div style={tk.type.caption}>
              <Typography.Text type="danger" style={{ fontSize: 'inherit' }}>
                Reports to <span translate="no">{p.reportingToName}</span>, who reports back up to them. Fix Reports to on one of their records.
              </Typography.Text>
            </div>
          )}
        </div>
      </Flex>
      {node.reports.length > 0 && isOpen && (
        <div id={listId}>
          <People nodes={node.reports} expanded={expanded} toggle={toggle} />
        </div>
      )}
    </li>
  );
}
