'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { Button, Descriptions, Drawer, Flex, Progress, Typography } from 'antd';
import { tk } from '@/ds';
import { EditOutlined, LeftOutlined, PlusOutlined, RightOutlined } from '@/components/common/icons';
import {
  PIPE_MATERIAL_LABELS,
  PIPE_NODE_KIND_LABELS,
  PIPE_SCOPE_LABELS,
  PIPE_STAGE_LABELS,
  SEGMENT_STAGES,
  VALVE_NODE_KINDS,
  type AiDraftDto,
  type PipeNodeDto,
  type PipeSegmentDto,
  type PipeZoneDto,
  type SegmentStage,
} from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { requestNew } from '@/lib/new-intent';
import { formatPct, formatQty } from '@/lib/format';
import { Section } from '@/components/common/Section';
import { newEntriesFor } from '@/components/shell/NewMenu';
import { SEGMENT_STATE_LABELS, segmentState } from './PipeMap';

/**
 * One pipe, opened from the map or the pipe list: its size and ends, and each stage of its work against its length
 * (done, and waiting for approval). Work is recorded through a daily report, which opens with a line for this pipe and
 * stage, so it is approved like any other progress; a project editor corrects the pipe itself with Edit pipe.
 */
export function PipeCard({
  projectId,
  projectName,
  zone,
  segment,
  nodes,
  canEdit,
  onEdit,
  onStep,
  onClose,
}: {
  projectId: string;
  projectName: string;
  zone: PipeZoneDto;
  segment: PipeSegmentDto | null;
  nodes: PipeNodeDto[];
  canEdit: boolean;
  onEdit: (s: PipeSegmentDto) => void;
  /** The pipe before or after this one in the list, or null at its end */
  onStep: (by: -1 | 1) => (() => void) | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const canRecord = !!user && newEntriesFor(user).flat().some((e) => e.kind === 'dpr');
  const s = segment;
  const len = s ? Number(s.lengthM) : 0;
  const end = (id: string | undefined) => nodes.find((n) => n.id === id);

  const record = (stage: SegmentStage) => {
    if (!s) return;
    const activityId = zone.stageActivities[stage];
    const draft: AiDraftDto = {
      kind: 'dpr',
      title: `Daily report: ${PIPE_STAGE_LABELS[stage].toLowerCase()} on ${s.code}`,
      projectId,
      projectName,
      values: { lines: [{ id: crypto.randomUUID(), activityId, pipeSegmentId: s.id, labour: [], machines: [], materials: [] }] },
      flags: [],
      note: `Filled in from pipe ${s.code}, ${s.fromCode} to ${s.toCode}: enter the metres done today`,
    };
    requestNew('dpr', () => router.push(`/dpr?projectId=${projectId}`), draft);
  };

  const prev = onStep(-1);
  const next = onStep(1);
  return (
    <Drawer
      open={!!s}
      onClose={onClose}
      size={520}
      title={s ? <span translate="no">{`${s.code}, ${s.fromCode} to ${s.toCode}`}</span> : 'Pipe'}
      extra={
        <Flex gap={tk.space[2]}>
          <Button icon={<LeftOutlined />} aria-label="Previous pipe" disabled={!prev} onClick={() => prev?.()} />
          <Button icon={<RightOutlined />} aria-label="Next pipe" disabled={!next} onClick={() => next?.()} />
        </Flex>
      }
      footer={
        s && canEdit ? (
          <Button icon={<EditOutlined />} onClick={() => onEdit(s)}>
            Edit pipe
          </Button>
        ) : null
      }
    >
      {s ? (
        <Flex vertical gap={tk.space[5]}>
          <Descriptions
            size="small"
            column={1}
            items={[
              { key: 'state', label: 'Work', children: s.scope === 'EXISTING' ? 'Existing line' : `${SEGMENT_STATE_LABELS[segmentState(s)]}, ${formatPct(s.status.pct)} done` },
              { key: 'length', label: 'Length', children: <span translate="no">{`${formatQty(s.lengthM)} m`}</span> },
              { key: 'size', label: 'Size', children: <span translate="no">{`${s.diameterMm} mm ${PIPE_MATERIAL_LABELS[s.material]}${s.pipeClass ? ` ${s.pipeClass}` : ''}`}</span> },
              { key: 'scope', label: 'Scope', children: PIPE_SCOPE_LABELS[s.scope] },
              ...[
                { key: 'from', label: 'From', node: end(s.fromNodeId) },
                { key: 'to', label: 'To', node: end(s.toNodeId) },
              ].map(({ key, label, node }) => ({
                key,
                label,
                children: node ? (
                  <span translate="no">
                    {node.code}, {PIPE_NODE_KIND_LABELS[node.kind].toLowerCase()}
                    {node.chainage !== null ? ` at ${Math.floor(node.chainage / 1000)}+${String(node.chainage % 1000).padStart(3, '0')}` : ''}
                    {VALVE_NODE_KINDS.includes(node.kind) ? (node.fixed ? ', fixed' : ', not fixed yet') : ''}
                  </span>
                ) : (
                  <span translate="no">{key === 'from' ? s.fromCode : s.toCode}</span>
                ),
              })),
              ...(s.surface ? [{ key: 'surface', label: 'Surface over it', children: s.surface }] : []),
              ...(s.crossing ? [{ key: 'crossing', label: 'Crossing', children: s.crossing }] : []),
            ]}
          />
          {s.scope === 'EXISTING' ? null : (
            <Section title="Work against its length">
              <Flex vertical gap={tk.space[4]}>
                {SEGMENT_STAGES.map((stage) => {
                  const done = s.status.done[stage] ?? 0;
                  const waiting = s.waiting[stage] ?? 0;
                  const label = PIPE_STAGE_LABELS[stage];
                  const left = Math.max(0, len - done - waiting);
                  return (
                    <div key={stage}>
                      <Flex justify="space-between" align="baseline" gap={tk.space[3]} wrap>
                        <Typography.Text strong>{label}</Typography.Text>
                        <span translate="no">{`${formatQty(done)} of ${formatQty(len)} m`}</span>
                      </Flex>
                      <Progress
                        percent={len ? Math.round((100 * done) / len) : 0}
                        success={{ percent: 0 }}
                        showInfo={false}
                        aria-label={`${label}: ${formatQty(done)} of ${formatQty(len)} m`}
                      />
                      <Flex justify="space-between" align="center" gap={tk.space[3]} wrap>
                        <Typography.Text type="secondary">
                          {waiting ? `${formatQty(waiting)} m waiting for approval. ` : ''}
                          {left ? `${formatQty(left)} m to go` : done >= len - 0.001 ? 'Done end to end' : 'The rest waits for approval'}
                        </Typography.Text>
                        {canRecord && left && zone.stageActivities[stage] ? (
                          <Button size="small" icon={<PlusOutlined />} onClick={() => record(stage)}>
                            Record work
                          </Button>
                        ) : null}
                      </Flex>
                    </div>
                  );
                })}
              </Flex>
            </Section>
          )}
        </Flex>
      ) : null}
    </Drawer>
  );
}
