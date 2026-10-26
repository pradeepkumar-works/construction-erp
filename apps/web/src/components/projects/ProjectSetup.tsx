'use client';

import React from 'react';
import Link from 'next/link';
import { App, Button, Flex, Progress, Typography, theme } from 'antd';
import { CheckCircleOutlined, ExclamationCircleOutlined } from '@/components/common/icons';
import { sectorStepOf, type ProjectDetail, type ProjectSetupDto, type SetupStepDto } from '@erp/shared';
import { useHideProjectSetup, useProjectSetup } from '@/lib/queries';
import { formatINRCompact } from '@/lib/format';
import { Section } from '@/components/common/Section';

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const srOnly: React.CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 };

/** What a step asks for, and what is left or done, in words. */
function stepText(s: SetupStepDto, project: ProjectDetail, setup: ProjectSetupDto): { title: string; detail: string; warn?: boolean } {
  const n = s.count ?? 0;
  switch (s.key) {
    case 'team':
      return { title: 'Add the team', detail: s.done ? `${plural(n, 'person', 'people')} besides the project manager.` : 'Site engineers, store keeper and QS: add several at once, or copy the team of another project.' };
    case 'dates':
      return { title: 'Set the start and completion dates and the contract value', detail: 'Planned progress, time left and liquidated damages all start from them.' };
    case 'boq': {
      const g = setup.boqGap;
      if (g)
        return {
          title: 'Check the BOQ against the contract value',
          detail: `The BOQ adds up to ${formatINRCompact(g.boqTotal)}, ${Math.abs(g.gapPct)}% ${g.gapPct < 0 ? 'below' : 'above'} the ${formatINRCompact(g.contractValue)} contract. Work done, earned value and the budget are off until the two agree.`,
          warn: true,
        };
      return { title: 'Import the BOQ', detail: s.done ? `${plural(n, 'item')}, in line with the contract value.` : 'From Excel; work done, measurements and bills are all counted against it.' };
    }
    case 'activities':
      return { title: 'Add the activities', detail: s.done ? `${plural(n, 'activity', 'activities')}.` : 'Start from the template for the project type, or import the schedule.' };
    case 'boqLinks':
      return { title: 'Link the BOQ items to activities', detail: s.done ? 'Every BOQ item with a quantity has an activity.' : n ? `${plural(n, 'BOQ item has', 'BOQ items have')} no activity, so work on them is not counted.` : 'Needs the BOQ and the activities first.' };
    case 'schedule':
      return { title: 'Give every activity dates', detail: s.done ? 'Every activity has a planned start and finish.' : n ? `${plural(n, 'activity has', 'activities have')} no planned start or finish.` : 'Needs the activities first.' };
    case 'baseline':
      return { title: 'Freeze the baseline', detail: s.done ? 'Delays are measured against the plan you started with.' : 'So delays are measured against the plan you started with.' };
    case 'contract':
      return { title: 'Fill in the contract terms', detail: 'Agreement number and date, deductions, liquidated damages and the defect liability period.' };
    case 'budget':
      return { title: 'Set the budget', detail: 'Material, labour, machinery, subcontract and expenses, for cost against budget.' };
    case 'sector': {
      const kind = sectorStepOf(project.type);
      return { title: kind === 'chainage' ? 'Set the chainage' : kind === 'floors' ? 'List the floors' : 'Add the villages', detail: 'So progress and measurements can say where the work is.' };
    }
    case 'norms':
      return { title: 'Set the material norms', detail: s.done ? `${plural(n, 'norm')}.` : 'Material per unit of each BOQ item, so overuse is caught.' };
  }
}

/**
 * A new project's setup checklist on its Overview (finding 6 of the October review): each step links to the tab it is
 * done on and ticks itself from the records. It shows until the steps are done, a tenth of the work is done, or someone
 * who edits the project hides it.
 */
export function ProjectSetup({ project }: { project: ProjectDetail }) {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const { data } = useProjectSetup(project.id);
  const hide = useHideProjectSetup(project.id);
  if (!data?.show) return null;
  const hrefOf = (s: SetupStepDto) => (s.key === 'team' ? '#team' : `/projects/${project.id}?tab=${s.tab}`);

  return (
    <Section
      title="Set up this project"
      style={{ marginBottom: token.margin }}
      extra={
        <Button
          size="small"
          type="text"
          loading={hide.isPending}
          onClick={() =>
            hide.mutate(true, { onSuccess: () => message.success('Setup checklist hidden for everyone on the project') })
          }
        >
          Hide
        </Button>
      }
    >
      <Flex align="center" gap={token.marginSM} style={{ marginBottom: token.marginXS }}>
        <Progress percent={Math.round((data.done / data.total) * 100)} size="small" showInfo={false} style={{ flex: 1, margin: 0 }} aria-label={`Setup ${data.done} of ${data.total} done`} />
        <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM, whiteSpace: 'nowrap' }}>
          {data.done} of {data.total} done
        </Typography.Text>
      </Flex>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {data.steps.map((s) => {
          const t = stepText(s, project, data);
          const icon = t.warn ? (
            <ExclamationCircleOutlined aria-hidden style={{ color: token.colorWarningText, marginTop: 3 }} />
          ) : s.done ? (
            <CheckCircleOutlined aria-hidden style={{ color: token.colorSuccessText, marginTop: 3 }} />
          ) : (
            <span aria-hidden style={{ display: 'inline-block', width: 14, height: 14, marginTop: 3, borderRadius: '50%', border: `${token.lineWidth * 1.5}px solid ${token.colorBorder}` }} />
          );
          return (
            <li key={s.key} style={{ minHeight: 44, padding: `${token.paddingXXS + 2}px 0` }}>
              <Flex gap={token.marginXS} align="flex-start">
                {icon}
                <div style={{ minWidth: 0 }}>
                  {s.done && !t.warn ? (
                    <Typography.Text type="secondary">
                      <span style={srOnly}>Done: </span>
                      {t.title}
                    </Typography.Text>
                  ) : (
                    <Link href={hrefOf(s)} style={{ fontWeight: token.fontWeightStrong }}>
                      {t.title}
                    </Link>
                  )}
                  <Typography.Text type={t.warn ? undefined : 'secondary'} style={{ display: 'block', fontSize: token.fontSizeSM, color: t.warn ? token.colorWarningText : undefined }}>
                    {t.detail}
                  </Typography.Text>
                </div>
              </Flex>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}
