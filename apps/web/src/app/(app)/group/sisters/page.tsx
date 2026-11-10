'use client';

import React, { useMemo, useState } from 'react';
import { App, Button, Card } from 'antd';
import { canNameSisterCompanies, type SisterLinkDto, type SisterNamedByDto } from '@erp/shared';
import { PlusOutlined } from '@/components/common/icons';
import { AppTag } from '@/components/common/AppTag';
import { NoAccess } from '@/components/common/NoAccess';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { Section, SectionStack } from '@/components/common/Section';
import { LocalDataTable } from '@/components/list/LocalDataTable';
import type { ListColumn } from '@/components/list/DataTable';
import { SisterForm } from '@/components/group/SisterForm';
import { useAuth } from '@/lib/auth';
import { useRemoveSister, useSisterLinks } from '@/lib/queries';

const PARTY = { VENDOR: 'Vendor', CLIENT: 'Client' } as const;
type NamedByRow = SisterNamedByDto & { id: string };

/**
 * Sister companies (item 192): which vendors and clients in this company's books are companies of its group, named by
 * the company's admin, and the sisters' links that name this company. The consolidated accounts take out what passes
 * through those ledgers.
 */
export default function SisterCompaniesPage() {
  const { user } = useAuth();
  const { modal } = App.useApp();
  const allowed = !!user && canNameSisterCompanies(user);
  const { data, isLoading, error, refetch } = useSisterLinks(allowed);
  const remove = useRemoveSister();
  const [naming, setNaming] = useState(false);

  const linkColumns = useMemo<ListColumn<SisterLinkDto>[]>(
    () => [
      { key: 'party', title: 'In our books', locked: true, card: 'title', cardText: (l) => l.partyName, render: (_, l) => <span translate="no">{l.partyName}</span> },
      { key: 'kind', title: 'As', width: 110, render: (_, l) => <AppTag variant="kind">{PARTY[l.party]}</AppTag> },
      {
        key: 'sister',
        title: 'Sister company',
        render: (_, l) => (
          <span>
            <span translate="no">{l.sisterName}</span>
            {l.outsideGroup ? <span className="text-muted"> (no longer in the group)</span> : null}
          </span>
        ),
      },
      {
        key: 'actions',
        title: '',
        label: 'Actions',
        width: 110,
        locked: true,
        card: false,
        render: (_, l) => (
          <Button
            size="small"
            onClick={() =>
              modal.confirm({
                title: `Stop naming ${l.partyName} as a sister?`,
                content: 'The consolidated accounts then keep its balances and sales in.',
                okText: 'Stop naming',
                onOk: () => remove.mutateAsync(l.id),
              })
            }
          >
            Remove
          </Button>
        ),
      },
    ],
    [modal, remove],
  );
  const namedByColumns = useMemo<ListColumn<NamedByRow>[]>(
    () => [
      { key: 'company', title: 'Sister company', locked: true, card: 'title', cardText: (n) => n.companyName, render: (_, n) => <span translate="no">{n.companyName}</span> },
      { key: 'kind', title: 'Keeps us as', width: 130, render: (_, n) => <AppTag variant="kind">{PARTY[n.party]}</AppTag> },
      { key: 'party', title: 'Under the name', render: (_, n) => <span translate="no">{n.partyName}</span> },
    ],
    [],
  );
  if (!user) return null;
  const newButton = allowed ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setNaming(true)} disabled={!data}>
      Name a sister
    </Button>
  ) : null;

  return (
    <div className="page-container">
      <PageHeader
        title="Sister companies"
        help="Name the vendors and clients in your books that are companies of your group. The group's consolidated accounts take out the balances and sales through their ledgers. Each company names its own; a sister's names for you show below."
        extra={newButton}
      />
      {!allowed ? (
        <NoAccess title="Admins of a group's company only" subTitle="Ask your company's admin to name its sister companies." />
      ) : isLoading ? (
        <PageSkeleton shape="list" header={false} />
      ) : error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : data ? (
        <Card size="small">
          <SectionStack>
            <Section title="Named in our books">
              <LocalDataTable<SisterLinkDto> list="sister-links" columns={linkColumns} rows={data.links} loading={false} failed={false} emptyText="No vendor or client named as a sister yet" />
            </Section>
            <Section title="Named in our sisters' books">
              <LocalDataTable<NamedByRow>
                list="sister-named-by"
                columns={namedByColumns}
                rows={data.namedBy.map((n) => ({ ...n, id: `${n.companyId}:${n.party}:${n.partyName}` }))}
                loading={false}
                failed={false}
                emptyText="No sister has named this company yet"
              />
            </Section>
          </SectionStack>
        </Card>
      ) : null}
      <SisterForm open={naming} data={data} onClose={() => setNaming(false)} />
    </div>
  );
}
