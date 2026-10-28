'use client';

import React from 'react';
import Link from 'next/link';
import { Card, Flex, Typography, theme } from 'antd';
import { MASTER_LISTS, MASTER_LIST_DEFS, mastersByDepartment, navDestination, type MasterList, type NavNode } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useMasterCounts } from '@/lib/queries';
import { useNavMenu } from '@/components/shell/menu';
import { PageHeader } from '@/components/common/PageHeader';
import { TreeIcon } from '@/components/shell/nav-icons';

const LIST_OF_NODE = new Map<string, MasterList>(MASTER_LISTS.map((l) => [MASTER_LIST_DEFS[l].node, l]));

function MasterRow({ node, count }: { node: NavNode; count?: { active: number; total: number } }) {
  const { token } = theme.useToken();
  const dest = navDestination(node);
  const href = dest?.kind === 'page' ? dest.href : '/masters';
  return (
    <Link href={href} className="master-row" style={{ display: 'flex', alignItems: 'center', gap: token.marginSM, minHeight: 44, padding: `${token.paddingXS}px 0`, color: 'inherit' }}>
      <TreeIcon name={node.icon} />
      <Flex vertical style={{ flex: 1, minWidth: 0 }}>
        <Typography.Text strong style={{ color: token.colorLink }}>
          {node.label}
        </Typography.Text>
        <Typography.Text type="secondary">{node.description}</Typography.Text>
      </Flex>
      {count && (
        <Typography.Text type="secondary" translate="no" style={{ whiteSpace: 'nowrap' }}>
          {count.active} of {count.total} on
        </Typography.Text>
      )}
    </Link>
  );
}

/**
 * Administration › Masters (item 135): every master the company keeps, under the department whose menu names it, with only
 * the ones this person may open. The simple lists open their own page; the rest open where they always lived.
 */
export default function MastersPage() {
  const { user } = useAuth();
  const { token } = theme.useToken();
  const { settings } = useNavMenu(user);
  const counts = useMasterCounts(!!user);
  if (!user) return null;
  const departments = mastersByDepartment(user);
  const countOf = new Map((counts.data?.lists ?? []).map((c) => [c.key, c]));
  return (
    <div className="page-container" style={{ maxWidth: 1080, marginLeft: 0 }}>
      <PageHeader title="Masters" subtitle="The lists your company keeps, by department: items and units, vendors, trades, designations, categories and the rest." />
      {departments.length === 0 ? (
        <Typography.Paragraph>Your role opens none of the masters. Ask an administrator if you need one.</Typography.Paragraph>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 420px), 1fr))', gap: token.margin }}>
          {departments.map(({ module, nodes }) => (
            <Card key={module.key} size="small" title={<h2 style={{ margin: 0, fontSize: token.fontSizeLG }}>{settings.names[module.key] || module.label}</h2>}>
              {nodes.map((n) => {
                const list = LIST_OF_NODE.get(n.id);
                return <MasterRow key={n.id} node={n} count={list ? countOf.get(list) : undefined} />;
              })}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
