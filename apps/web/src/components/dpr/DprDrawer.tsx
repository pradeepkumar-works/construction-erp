'use client';

import React from 'react';
import Link from 'next/link';
import { App, Table, Typography } from 'antd';
import type { DailyReportDto, DprBuiltInKey, ManpowerLine, MachineryLine } from '@erp/shared';
import { STANDARD_DPR_FORM, WEATHER_LABELS, canManageTemplates, canSeeDprChecks, canReviewHindrances, dprLabel, figure, filledExtra, linesSummary, ownFieldsOf } from '@erp/shared';
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
import { tk } from '@/ds';
import { Section } from '@/components/common/Section';
import { DprHindrance } from '@/components/risks/HindranceSuggestions';
import { DprLineTotals, DprPipelineSummary, DprWorkLines, crewNote } from './DprLines';
import { dprChecksSection } from './DprChecks';

function Note({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: tk.space[3] }}>
      <span style={{ display: 'block', marginBottom: tk.space.half, ...tk.type.label, color: tk.color.text.strong }}>{title}</span>
      <div style={{ whiteSpace: 'pre-wrap' }}>{children}</div>
    </div>
  );
}

/** The site notes the report has something in, in the form's own names; a field left empty says nothing. */
const SITE_NOTES = ['materialReceived', 'testsConducted', 'safetyObservations', 'issues', 'nextDayPlan'] as const satisfies readonly DprBuiltInKey[];

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
  const notes = data ? SITE_NOTES.filter((key) => data[key]?.trim()) : [];
  const hindrance = !!data && mode !== 'pane' && !!data.issues && data.status !== 'DRAFT' && !!user && canReviewHindrances(user.roleKey);
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
          context: { label: data.projectName, href: `/projects/${data.projectId}` },
          print,
          // Checks only for those who see them, and only once they have run.
          headline: [figure('labour', data.totalManpower), !!data.lines?.length && figure('workLines', data.lines.length), checks && figure('checksRaised', checks.checks.length)],
          facts: [
            ...filledExtra(ownFieldsOf(def, 'DAY'), data.extra).map((x) => ({ key: `own-${x.field.key}`, label: x.field.label, children: <span translate="no">{x.text}</span> })),
            ...submissionMetaItems(data),
          ],
          details: [
            ...(data.weather ? [{ key: 'weather', label: 'Weather', children: WEATHER_LABELS[data.weather] }] : []),
            ...(data.siteCondition ? [{ key: 'cond', label: 'Site condition', children: data.siteCondition }] : []),
            ...(formFact ? [formFact] : []),
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
                        <div style={{ marginTop: tk.space[3] }}>
                          <Note title="Work done today">{data.workExecuted}</Note>
                        </div>
                      ) : null}
                    </>
                  ),
                }
              : { key: 'work', title: 'Work done today', empty: !data.workExecuted?.trim(), children: <div style={{ whiteSpace: 'pre-wrap' }}>{data.workExecuted}</div> },
            {
              key: 'resources',
              title: 'Labour and machinery',
              empty: !data.manpower.length && !data.machinery.length && !data.lines?.length,
              children: (
                <>
                  {crewNote(data) ? <Typography.Paragraph style={{ marginBottom: tk.space[3] }}>{crewNote(data)}</Typography.Paragraph> : null}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: tk.space[3] }}>
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
                    <div style={{ marginTop: tk.space[3] }}>
                      <DprLineTotals lines={data.lines} />
                    </div>
                  ) : null}
                </>
              ),
            },
            {
              key: 'notes',
              title: 'Site notes',
              empty: !notes.length,
              children: notes.length ? notes.map((key) => (
                <React.Fragment key={key}>
                  <Note title={dprLabel(def, key)}>{data[key]}</Note>
                  {key === 'issues' && hindrance ? <DprHindrance dprId={data.id} /> : null}
                </React.Fragment>
              )) : <p className="text-muted" style={{ margin: 0 }}>No site notes for the day.</p>,
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
