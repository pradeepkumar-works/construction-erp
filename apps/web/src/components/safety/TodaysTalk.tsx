'use client';

import React, { useState } from 'react';
import { Button, Drawer, Flex, Segmented, Select, Skeleton, Typography, theme } from 'antd';
import type { ToolboxTalkDraftDto } from '@erp/shared';
import { useProjects, useTodaysTalk } from '@/lib/queries';
import { formatDate } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';

type Lang = 'hi' | 'en';
/** Each language in its own script, so a supervisor finds theirs. */
const LANGS = [
  { value: 'hi' as const, label: <span lang="hi">हिन्दी</span> },
  { value: 'en' as const, label: 'English' },
];

/**
 * Today's toolbox talk (intelligence quick win Q8): the five-minute talk `GET /safety/talks/today` writes for a project
 * from its activities, today's permits and its recent incidents, in Hindi and English, with what brought each hazard up.
 * Record this talk opens the talk form with its topic and points; nothing is saved before that.
 */
export function TodaysTalk({
  open,
  onClose,
  projectId: fixedProject,
  onRecord,
}: {
  open: boolean;
  onClose: () => void;
  projectId?: string | null;
  onRecord?: (talk: ToolboxTalkDraftDto) => void;
}) {
  const { token } = theme.useToken();
  const [chosen, setChosen] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>('hi');
  const projectId = fixedProject ?? chosen;
  const { data: projects } = useProjects();
  const { data, isLoading, error, refetch } = useTodaysTalk(open ? projectId : null);
  const small = { fontSize: token.fontSizeSM };
  return (
    <Drawer
      open={open}
      onClose={onClose}
      size={640}
      destroyOnHidden
      title={data ? `Today's talk · ${data.projectName}` : "Today's talk"}
      extra={
        data && onRecord ? (
          <Button type="primary" onClick={() => onRecord(data)}>
            Record this talk
          </Button>
        ) : null
      }
    >
      <Flex vertical gap={16}>
        {!fixedProject ? (
          <Select
            aria-label="Project"
            showSearch={{ optionFilterProp: 'label' }}
            placeholder="Choose the project"
            value={chosen}
            onChange={setChosen}
            options={(projects ?? []).map((p) => ({ value: p.id, label: `${p.code} - ${p.name}` }))}
          />
        ) : null}
        {error ? <QueryError error={error} onRetry={() => refetch()} /> : null}
        {projectId && isLoading ? <Skeleton active paragraph={{ rows: 8 }} /> : null}
        {data ? (
          <>
            <Flex justify="space-between" align="center" gap={12} wrap>
              <Typography.Text type="secondary" style={small}>
                {`${formatDate(data.date)}. Read it out before work, about ${data.minutes} minutes.`}
              </Typography.Text>
              <Segmented aria-label="Language of the talk" value={lang} onChange={(v) => setLang(v as Lang)} options={LANGS} />
            </Flex>
            <div lang={lang} style={{ fontSize: token.fontSizeLG, lineHeight: 1.6 }}>
              <p style={{ marginTop: 0 }}>{data.opening[lang]}</p>
              {data.sections.map((s) => (
                <section key={s.hazard} style={{ marginBottom: token.marginMD }}>
                  <Typography.Title level={2} style={{ fontSize: token.fontSizeLG, margin: 0 }}>
                    {s.title[lang]}
                  </Typography.Title>
                  <ul style={{ margin: `${token.marginXXS}px 0 0`, paddingInlineStart: 20 }}>
                    {s.points.map((p) => (
                      <li key={p.en}>{p[lang]}</li>
                    ))}
                  </ul>
                  <Typography.Text type="secondary" style={small} lang="en">
                    {s.why}
                  </Typography.Text>
                </section>
              ))}
              {data.incidents.map((i) => (
                <p key={i.en}>{i[lang]}</p>
              ))}
              <p style={{ fontWeight: 600, marginBottom: 0 }}>{data.closing[lang]}</p>
            </div>
          </>
        ) : null}
      </Flex>
    </Drawer>
  );
}
