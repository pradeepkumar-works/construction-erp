'use client';

import React, { useState } from 'react';
import { Alert, Button, Typography } from 'antd';
import { COST_HEADS, COST_HEAD_LABELS, canSetBudget } from '@erp/shared';
import { tk } from '@/ds';
import { EditOutlined, PlusOutlined } from '@/components/common/icons';
import { useAuth } from '@/lib/auth';
import { useProjectOpening } from '@/lib/queries';
import { formatDate, formatDateTime, toNumber } from '@/lib/format';
import { Section } from '@/components/common/Section';
import { Money } from '@/components/common/Money';
import { OpeningFormModal } from './OpeningFormModal';

/**
 * A project's opening cost on its Budget tab (ARCHITECTURE "Opening cost"): what it had spent and done when it came on
 * Nirmaan, which cost to date counts from that day. A project that ran before and has none is told so.
 */
export function OpeningSection({ projectId }: { projectId: string }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  const { data } = useProjectOpening(projectId);
  if (!data || (!data.ranBefore && !data.opening)) return null;
  const canEdit = !!user && canSetBudget(user.roleKey);
  const o = data.opening;
  const button = canEdit && (
    <Button type={o ? 'default' : 'primary'} icon={o ? <EditOutlined /> : <PlusOutlined />} onClick={() => setEditing(true)}>
      {o ? 'Edit opening cost' : 'Record opening cost'}
    </Button>
  );
  return (
    <Section style={{ marginTop: tk.space[4] }} title="Opening cost" extra={o ? button : undefined}>
      {o ? (
        <>
          <Typography.Paragraph style={{ marginBottom: tk.space[2] }}>
            <Money value={o.total} /> spent by {formatDate(o.asOf)}
            {o.workDone ? (
              <>
                , with <Money value={o.workDone} /> of work done
              </>
            ) : null}
            . Cost to date counts it from that day.
          </Typography.Paragraph>
          <Typography.Paragraph type="secondary" style={{ marginBottom: tk.space[2] }}>
            {COST_HEADS.filter((h) => toNumber(o.heads[h]) > 0).map((h, i) => (
              <React.Fragment key={h}>
                {i ? ' · ' : ''}
                {COST_HEAD_LABELS[h]} <Money value={o.heads[h]} />
              </React.Fragment>
            ))}
          </Typography.Paragraph>
          {o.notes ? <Typography.Paragraph type="secondary" style={{ marginBottom: tk.space[2] }}>{o.notes}</Typography.Paragraph> : null}
          <Typography.Text type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
            Recorded by {o.updatedByName} on {formatDateTime(o.updatedAt)}
          </Typography.Text>
        </>
      ) : (
        <Alert
          type="warning"
          showIcon
          title="This project ran before it came on Nirmaan and has no opening cost"
          description={
            <>
              <p style={{ margin: 0 }}>
                {`It started ${data.startDate ? formatDate(data.startDate) : 'before'} and came on Nirmaan on ${formatDate(data.enteredOn)}. Its cost counts only what was recorded since, so cost reads low and margin high. Record what it had spent by then.${canEdit ? '' : ' Admin, management or the project manager can record it.'}`}
              </p>
              {button ? <div style={{ marginTop: tk.space[3] }}>{button}</div> : null}
            </>
          }
        />
      )}
      {canEdit && <OpeningFormModal open={editing} onClose={() => setEditing(false)} data={data} />}
    </Section>
  );
}
