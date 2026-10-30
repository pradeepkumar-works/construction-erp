'use client';

import React, { useMemo, useState } from 'react';
import { App, Button, Card, Col, Dropdown, Form, Input, Row, Space, Typography, theme } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { OFFICIAL_REPORTS, canIssueOfficialReport, canViewContract, type OfficialIssueDto, type OfficialReportDto, type OfficialReportKind } from '@erp/shared';
import { DatePicker } from '@/components/common/DatePicker';
import { AppTag } from '@/components/common/AppTag';
import { FormShell } from '@/components/form/FormShell';
import { QueryError } from '@/components/common/QueryState';
import { DownloadOutlined, FileExcelOutlined, FilePdfOutlined, FileWordOutlined, PrinterOutlined, SendOutlined } from '@/components/common/icons';
import { useAuth } from '@/lib/auth';
import { fetchOfficialIssue, useIssueOfficialReport, useOfficialIssues, useOfficialReport } from '@/lib/queries';
import { formatDate, formatDayMonth } from '@/lib/format';
import { buildOfficialReportHtml, openOfficialReportPrint } from './officialHtml';
import { issueLine } from './official-format';

type Format = 'pdf' | 'docx' | 'xlsx' | 'print';

/** Download or print a report in the chosen format; the writers load on first use. */
async function output(r: OfficialReportDto, f: Format): Promise<boolean> {
  if (f === 'print') return openOfficialReportPrint(r);
  if (f === 'pdf') await (await import('./officialPdf')).downloadOfficialReportPdf(r);
  if (f === 'docx') await (await import('./officialDocx')).downloadOfficialReportDocx(r);
  if (f === 'xlsx') await (await import('./officialExcel')).downloadOfficialReportExcel(r);
  return true;
}

const FORMAT_WORDS: Record<Format, string> = {
  pdf: 'PDF',
  docx: 'Word file',
  xlsx: 'Excel workbook',
  print: 'print',
};

/**
 * The official daily, weekly and monthly progress reports of one project (item 167): pick the day, week or month, read
 * the report as it will print, download it as PDF, Word or Excel, and issue it to the client, which keeps that copy
 * with its number and revision in the register beside it.
 */
export function OfficialReportView({ projectId, kind, picker }: { projectId: string | undefined; kind: OfficialReportKind; picker: React.ReactNode }) {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { user } = useAuth();
  const [anchor, setAnchor] = useState<Dayjs>(dayjs());
  const [busy, setBusy] = useState<Format | null>(null);
  const [issueOpen, setIssueOpen] = useState(false);
  const [form] = Form.useForm<{ note?: string }>();
  const date = anchor.format('YYYY-MM-DD');
  const { data, isLoading, isFetching, error, refetch } = useOfficialReport(projectId, kind, date);
  const issues = useOfficialIssues(projectId);
  const issue = useIssueOfficialReport();
  const html = useMemo(() => (data ? buildOfficialReportHtml(data) : ''), [data]);
  const mayIssue = !!user && canIssueOfficialReport(user.roleKey);
  // An issued copy was made by someone who sees the contract, so it has money in it.
  const mayOpenIssued = !!user && canViewContract(user.roleKey);
  const ofKind = (issues.data ?? []).filter((i) => i.kind === kind);

  const run = async (r: OfficialReportDto | undefined, f: Format) => {
    if (!r) return;
    setBusy(f);
    try {
      if (!(await output(r, f))) message.warning('Pop-up blocked. Allow pop-ups to print the report.');
    } catch {
      message.error(`The ${FORMAT_WORDS[f]} could not be made. Try again, or print the report and save it as PDF.`);
    } finally {
      setBusy(null);
    }
  };
  const runIssued = async (i: OfficialIssueDto, f: Format) => {
    try {
      await run(await fetchOfficialIssue(i.id), f);
    } catch {
      message.error('That issued copy could not be opened. Try again.');
    }
  };

  const week = kind === 'WEEKLY' ? [anchor.subtract((anchor.day() + 6) % 7, 'day'), anchor.subtract((anchor.day() + 6) % 7, 'day').add(6, 'day')] : null;
  const periodPicker =
    kind === 'DAILY' ? (
      <DatePicker aria-label="Day" value={anchor} onChange={(d) => d && setAnchor(d)} allowClear={false} disabledDate={(d) => d.isAfter(dayjs(), 'day')} />
    ) : kind === 'WEEKLY' ? (
      <DatePicker
        picker="week"
        aria-label="Week"
        value={anchor}
        onChange={(d) => d && setAnchor(d)}
        allowClear={false}
        disabledDate={(d) => d.isAfter(dayjs(), 'day')}
        format={() => `${formatDayMonth(week![0])} to ${formatDate(week![1].format('YYYY-MM-DD'))}`}
      />
    ) : (
      <DatePicker
        picker="month"
        aria-label="Month"
        value={anchor}
        onChange={(d) => d && setAnchor(d)}
        allowClear={false}
        disabledDate={(d) => d.isAfter(dayjs(), 'month')}
        format="MMMM YYYY"
      />
    );

  const downloads = (
    <Space wrap>
      <Button type="primary" icon={<FilePdfOutlined />} loading={busy === 'pdf'} disabled={!data} onClick={() => run(data, 'pdf')}>
        Download PDF
      </Button>
      <Button icon={<FileWordOutlined />} loading={busy === 'docx'} disabled={!data} onClick={() => run(data, 'docx')}>
        Word
      </Button>
      <Button icon={<FileExcelOutlined />} loading={busy === 'xlsx'} disabled={!data} onClick={() => run(data, 'xlsx')}>
        Excel
      </Button>
      <Button icon={<PrinterOutlined />} disabled={!data} onClick={() => run(data, 'print')}>
        Print
      </Button>
    </Space>
  );

  return (
    <>
      <Card size="small" style={{ marginBottom: 12 }}>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            {picker}
            {periodPicker}
          </Space>
          {downloads}
        </Space>
      </Card>
      {error ? <QueryError error={error} onRetry={() => refetch()} /> : null}
      <Row gutter={[12, 12]}>
        <Col xs={24} xl={17}>
          <Card
            size="small"
            loading={isLoading}
            title={
              data ? (
                <Space wrap size={8}>
                  <span translate="no">{data.docNo}</span>
                  <AppTag tone={data.issue ? 'success' : 'neutral'}>{data.issue ? `Rev ${data.issue.revision} issued` : 'Draft'}</AppTag>
                </Space>
              ) : (
                OFFICIAL_REPORTS[kind].title
              )
            }
            extra={
              mayIssue && data ? (
                <Button icon={<SendOutlined />} onClick={() => setIssueOpen(true)}>
                  {data.issue ? 'Issue again' : 'Issue to client'}
                </Button>
              ) : null
            }
            styles={{
              body: { padding: 0, background: token.colorFillSecondary },
            }}
          >
            {data ? (
              <div
                style={{
                  padding: 12,
                  display: 'flex',
                  justifyContent: 'center',
                  opacity: isFetching ? 0.6 : 1,
                }}
              >
                <iframe
                  title={`${data.title} preview`}
                  srcDoc={html}
                  style={{
                    width: '100%',
                    maxWidth: 1000,
                    height: 1200,
                    border: `1px solid ${token.colorBorder}`,
                    background: token.colorWhite,
                  }}
                />
              </div>
            ) : !projectId ? (
              <Typography.Paragraph type="secondary" style={{ padding: 16, margin: 0 }}>
                Choose a project to see its report.
              </Typography.Paragraph>
            ) : null}
          </Card>
        </Col>
        <Col xs={24} xl={7}>
          <Card size="small" title="Issued to the client" loading={issues.isLoading}>
            <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
              {OFFICIAL_REPORTS[kind].description}
            </Typography.Paragraph>
            {ofKind.length && !mayOpenIssued ? (
              <Typography.Paragraph type="secondary" style={{ marginBottom: 8 }}>
                Issued copies carry the contract’s figures. Ask your project manager for one.
              </Typography.Paragraph>
            ) : null}
            {ofKind.length ? (
              <ul aria-label="Issued copies" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {ofKind.map((i) => (
                  <li
                    key={i.id}
                    style={{
                      display: 'flex',
                      gap: 8,
                      alignItems: 'flex-start',
                      padding: '8px 0',
                      borderTop: `1px solid ${token.colorBorderSecondary}`,
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <Typography.Text strong translate="no">
                        {i.docNo} · Rev {i.revision}
                      </Typography.Text>
                      <Typography.Paragraph type="secondary" style={{ margin: 0, fontSize: token.fontSizeSM }}>
                        {formatDate(i.from)}
                        {i.to !== i.from ? ` to ${formatDate(i.to)}` : ''} · issued {formatDate(i.issuedAt.slice(0, 10))} by {i.issuedByName}
                        {i.note ? ` · ${i.note}` : ''}
                      </Typography.Paragraph>
                    </div>
                    {mayOpenIssued ? (
                      <Dropdown
                        trigger={['click']}
                        menu={{
                          items: [
                            {
                              key: 'pdf',
                              label: 'PDF',
                              icon: <FilePdfOutlined />,
                            },
                            {
                              key: 'docx',
                              label: 'Word',
                              icon: <FileWordOutlined />,
                            },
                            {
                              key: 'xlsx',
                              label: 'Excel',
                              icon: <FileExcelOutlined />,
                            },
                            {
                              key: 'print',
                              label: 'Print',
                              icon: <PrinterOutlined />,
                            },
                          ],
                          onClick: ({ key }) => void runIssued(i, key as Format),
                        }}
                      >
                        <Button icon={<DownloadOutlined />} aria-label={`Download ${i.docNo} revision ${i.revision}`} />
                      </Dropdown>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
                No {OFFICIAL_REPORTS[kind].title.toLowerCase()} issued yet.
              </Typography.Paragraph>
            )}
          </Card>
        </Col>
      </Row>
      {data ? (
        <FormShell<{ note?: string }>
          open={issueOpen}
          onClose={() => setIssueOpen(false)}
          form={form}
          layout="modal"
          width={520}
          title={data.issue ? `Issue ${data.docNo} again` : `Issue ${data.docNo}`}
          okText={data.issue ? `Issue as Rev ${data.issue.revision + 1}` : 'Issue as Rev 0'}
          projectDefault={false}
          onSubmit={async (v) => {
            const r = await issue.mutateAsync({
              projectId: data.project.id,
              kind,
              date,
              note: v.note,
            });
            message.success(`${r.docNo} is issued: ${issueLine(r)}. Download it to send.`);
          }}
        >
          <Typography.Paragraph>
            The report is kept exactly as it is now, with today’s date and your name, so the copy you send can always be downloaded again.
            {data.issue ? ` ${issueLine(data)}; this makes the next revision.` : ''}
          </Typography.Paragraph>
          <Form form={form} layout="vertical">
            <Form.Item name="note" label="Note for the register (optional)">
              <Input.TextArea rows={2} maxLength={500} placeholder={data.issue ? 'What changed since the last revision' : 'Sent to the PIU by email'} />
            </Form.Item>
          </Form>
        </FormShell>
      ) : null}
    </>
  );
}
