'use client';

import React from 'react';
import Link from 'next/link';
import { App, Table, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { DailyReportDto, DprBuiltInKey, ManpowerLine, MachineryLine } from '@erp/shared';
import { STANDARD_DPR_FORM, WEATHER_LABELS, canManageTemplates, canSeeDprChecks, canReviewHindrances, dprLabel, dprShows, filledExtra, linesSummary, ownFieldsOf } from '@erp/shared';
import { useDpr, useDprChecks } from '@/lib/queries';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { StatusTag } from '@/components/common/StatusTag';
import { photosSection } from '@/components/photo-checks/PhotoChecksSection';
import { ReviewActions } from '@/components/common/ReviewActions';
import { EditResubmitButton } from '@/components/common/EditResubmitButton';
import { submissionMetaItems } from '@/components/common/SubmitterInfo';
import { openDprPrint } from './dprPrint';
import { RecordFrame, type RecordMode } from '@/components/record/RecordFrame';
import { submissionLifecycle } from '@/components/record/lifecycle';
import { themeColor, themeFontSize } from '@/lib/theme';
import { Section } from '@/components/common/Section';
import { DprHindrance } from '@/components/risks/HindranceSuggestions';
import { DprLineTotals, DprPipelineSummary, DprWorkLines, crewNote } from './DprLines';
import { dprChecksSection } from './DprChecks';

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <Typography.Text strong style={{ display: 'block', marginBottom: 2, fontSize: themeFontSize('fontSizeSM'), textTransform: 'uppercase', letterSpacing: 0.4, color: themeColor('colorTextHeading') }}>
        {title}
      </Typography.Text>
      <div style={{ whiteSpace: 'pre-wrap' }}>{children ?? <span className="text-muted">-</span>}</div>
    </div>
  );
}

interface RecordProps {
  id: string | null;
  open?: boolean;
  onClose?: () => void;
  onEdit?: (entry: DailyReportDto) => void;
}

/** A daily report, in a drawer from a list or as its own page at `/dpr/<id>`. */
export function DprRecord({ id, mode, open, onClose, onEdit }: RecordProps & { mode: RecordMode }) {
  const { data, isLoading, error, refetch } = useDpr(id ?? undefined);
  const { user } = useAuth();
  const { message } = App.useApp();
  // Q3: checks for an approver while the report waits or is being made; an approved report is settled.
  const checks = useDprChecks(id ?? undefined, !!user && canSeeDprChecks(user.roleKey) && !!data && data.status !== 'APPROVED').data;

  const def = data?.form?.def ?? STANDARD_DPR_FORM;
  // A field the form hides shows only when the report has something in it (made before it was hidden).
  const note = (key: DprBuiltInKey, value: string | null) => (dprShows(def, key) || value ? <Note key={key} title={dprLabel(def, key)}>{value}</Note> : null);
  const form = data?.form;
  const formFact = form
    ? {
        key: 'form',
        label: 'DPR form',
        children:
          user && canManageTemplates(user.roleKey) && form.typeCode ? (
            <Link href={`/project-types/${form.typeCode}?tab=dpr-form`}>{form.standard ? 'Standard' : `Version ${form.version}`}</Link>
          ) : form.standard ? (
            'Standard'
          ) : (
            `Version ${form.version}`
          ),
      }
    : null;

  const print = () => {
    if (!data) return;
    if (!openDprPrint(data, user?.organizationName ?? '')) message.warning('Pop-up blocked. Allow pop-ups to print the DPR.');
  };

  return (
    <RecordFrame
      mode={mode}
      open={open}
      onClose={onClose}
      drawerSize={820}
      kind="Daily report"
      list={{ href: '/dpr', label: 'Daily reports' }}
      loading={isLoading}
      error={error}
      onRetry={() => refetch()}
      record={
        data && {
          href: `/dpr/${data.id}`,
          title: `DPR · ${formatDate(data.date)}`,
          tags: <StatusTag status={data.status} />,
          print,
          facts: [
            { key: 'date', label: 'Date', children: formatDate(data.date) },
            { key: 'weather', label: 'Weather', children: data.weather ? <AppTag style={{ margin: 0 }}>{WEATHER_LABELS[data.weather]}</AppTag> : '-' },
            { key: 'cond', label: 'Site condition', children: data.siteCondition ?? '-' },
            { key: 'mp', label: 'Total labour', children: data.totalManpower },
            ...filledExtra(ownFieldsOf(def, 'DAY'), data.extra).map((x) => ({ key: `own-${x.field.key}`, label: x.field.label, children: <span translate="no">{x.text}</span> })),
            ...(formFact ? [formFact] : []),
            ...submissionMetaItems(data).filter((i) => i.key !== 'status'),
          ],
          lifecycle: submissionLifecycle(data),
          sections: [
            ...dprChecksSection(checks?.checks),
            data.lines?.length
              ? {
                  key: 'work',
                  title: 'Work done',
                  children: (
                    <>
                      <DprPipelineSummary lines={data.lines} />
                      <DprWorkLines lines={data.lines} def={def} />
                      {data.workExecuted && data.workExecuted !== linesSummary(data.lines) ? (
                        <div style={{ marginTop: 12 }}>
                          <Note title="Work done today">{data.workExecuted}</Note>
                        </div>
                      ) : null}
                    </>
                  ),
                }
              : { key: 'work', title: 'Work done today', children: <div style={{ whiteSpace: 'pre-wrap' }}>{data.workExecuted || <span className="text-muted">-</span>}</div> },
            {
              key: 'resources',
              title: 'Labour and machinery',
              children: (
                <>
                  {crewNote(data) ? <Typography.Paragraph style={{ marginBottom: 12 }}>{crewNote(data)}</Typography.Paragraph> : null}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12 }}>
                    <Section title="Labour">
                      <Table<ManpowerLine>
                        size="small"
                        rowKey={(r, i) => `${r.category}-${i}`}
                        pagination={false}
                        dataSource={data.manpower}
                        columns={[
                          { title: 'Trade', dataIndex: 'category' },
                          { title: 'Workers', dataIndex: 'count', align: 'right', width: 90 },
                        ]}
                        summary={() => (
                          <Table.Summary.Row>
                            <Table.Summary.Cell index={0}>
                              <strong>Total</strong>
                            </Table.Summary.Cell>
                            <Table.Summary.Cell index={1} align="right">
                              <strong>{data.totalManpower}</strong>
                            </Table.Summary.Cell>
                          </Table.Summary.Row>
                        )}
                      />
                    </Section>
                    <Section title="Machinery">
                      <Table<MachineryLine>
                        size="small"
                        rowKey={(r, i) => `${r.name}-${i}`}
                        pagination={false}
                        dataSource={data.machinery}
                        columns={[
                          { title: 'Machine', dataIndex: 'name' },
                          { title: 'Hours', dataIndex: 'hours', align: 'right', width: 80 },
                        ]}
                      />
                    </Section>
                  </div>
                  {data.lines?.length ? (
                    <div style={{ marginTop: 12 }}>
                      <DprLineTotals lines={data.lines} />
                    </div>
                  ) : null}
                </>
              ),
            },
            {
              key: 'notes',
              title: 'Site notes',
              children: (
                <>
                  {note('materialReceived', data.materialReceived)}
                  {note('testsConducted', data.testsConducted)}
                  {note('safetyObservations', data.safetyObservations)}
                  {note('issues', data.issues)}
                  {mode !== 'pane' && data.issues && data.status !== 'DRAFT' && user && canReviewHindrances(user.roleKey) ? <DprHindrance dprId={data.id} /> : null}
                  {note('nextDayPlan', data.nextDayPlan)}
                </>
              ),
            },
            photosSection('dpr', data.id, data.attachments),
          ],
          activity: { type: 'dpr', id: data.id, submission: data },
          actions: (size) => (
            <>
              <EditResubmitButton entry={data} onEdit={onEdit} size={size} />
              <ReviewActions type="dpr" id={data.id} status={data.status} size={size} />
            </>
          ),
        }
      }
    />
  );
}

export function DprDrawer(props: RecordProps & { open: boolean; onClose: () => void }) {
  return <DprRecord mode="drawer" {...props} />;
}
