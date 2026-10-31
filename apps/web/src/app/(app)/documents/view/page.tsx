'use client';

import React, { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Card, Collapse, Flex, Typography, theme } from 'antd';
import { ExportOutlined, FileTextOutlined, LeftOutlined, RightOutlined } from '@/components/common/icons';
import { fileUrl } from '@/lib/api';
import { useDocumentPage } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { LinkButton } from '@/components/common/LinkButton';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';

/**
 * A filed PDF opened at one page (Ask the contract, AI item 75): where an answer's citation such as "RD-AGR-01, page 4"
 * leads. The browser's own PDF viewer shows the file at the page; the page's text is under it, for small screens and
 * for copying a clause.
 */
function DocumentPageView() {
  const search = useSearchParams();
  const file = search.get('file');
  const page = Math.max(1, Number(search.get('page')) || 1);
  const { data, isLoading, error, refetch } = useDocumentPage(file, page);
  const { token } = theme.useToken();

  if (!file) return <QueryError error={{ response: { status: 404 } }} />;
  if (isLoading) return <PageSkeleton shape="record" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;

  const at = (p: number) => `/documents/view?file=${data.attachmentId}&page=${p}`;
  const src = `${fileUrl(data.url)}#page=${page}`;
  return (
    <div className="page-container">
      <PageHeader
        title={data.title}
        subtitle={data.pages ? `Page ${page} of ${data.pages}` : `Page ${page}`}
        crumbs={[{ title: 'Drawings and documents', href: '/documents' }, { title: data.title, href: data.recordHref }, { title: `Page ${page}` }]}
        extra={
          <Flex gap={token.marginXS} wrap>
            <LinkButton href={at(page - 1)} icon={<LeftOutlined />} disabled={page <= 1}>
              Previous page
            </LinkButton>
            <LinkButton href={at(page + 1)} icon={<RightOutlined />} iconPlacement="end" disabled={!!data.pages && page >= data.pages}>
              Next page
            </LinkButton>
            <Button href={src} target="_blank" rel="noreferrer" icon={<ExportOutlined />}>
              Open the file
            </Button>
            <LinkButton href={data.recordHref} icon={<FileTextOutlined />}>
              {data.recordHref.includes('letter=') ? 'Open the letter' : 'Open the document'}
            </LinkButton>
          </Flex>
        }
      />
      <Flex vertical gap={token.margin}>
        <Card size="small" styles={{ body: { padding: 0 } }}>
          {/* The key reloads the frame when the page changes: a new #page alone does not move an open viewer. */}
          <iframe key={src} src={src} title={`${data.fileName}, page ${page}`} style={{ width: '100%', height: '75vh', border: 0, display: 'block', borderRadius: token.borderRadiusLG }} />
        </Card>
        <Collapse
          defaultActiveKey={['text']}
          items={[
            {
              key: 'text',
              label: 'Text on this page',
              children: data.text ? (
                <Typography.Paragraph copyable={{ text: data.text }} style={{ whiteSpace: 'pre-wrap', marginBottom: 0 }}>
                  {data.text}
                </Typography.Paragraph>
              ) : data.readError ? (
                <Typography.Text type="secondary">This file could not be read ({data.readError}), so Ask Nirmaan cannot search it. Read it in the file above.</Typography.Text>
              ) : (
                <Typography.Text type="secondary">No text was read from this page. It may be a scanned image; read it in the file above.</Typography.Text>
              ),
            },
          ]}
        />
      </Flex>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton shape="record" />}>
      <DocumentPageView />
    </Suspense>
  );
}
