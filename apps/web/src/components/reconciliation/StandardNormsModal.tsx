'use client';

import React, { useState } from 'react';
import { Alert, App, Checkbox, Grid, Modal, Table, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { StandardNormMatchDto, StandardNormPlanDto, StandardNormResultDto } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { useStandardNorms } from '@/lib/queries';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { AppTag } from '@/components/common/AppTag';
import { formatQty } from '@/lib/format';
import { themeFontSize } from '@/lib/theme';

/**
 * Adopt the standard norms library on a project: the reconciliation stayed empty
 * because every norm had to be typed first. This shows what the library would set, item by item, before it is written.
 */
/** The BOQ item, with the norm the library reads it as. */
function workCell(r: StandardNormMatchDto) {
  return (
    <div>
      <span translate="no">{r.itemNo}</span> {r.description}
      <div className="text-muted" style={{ fontSize: themeFontSize('fontSizeSM') }}>
        {r.normLabel} · {r.note}
      </div>
    </div>
  );
}

/** What one unit of the work takes. */
function materialsCell(r: StandardNormMatchDto) {
  return (
    <div style={{ fontSize: themeFontSize('fontSizeSM') }}>
      {r.materials.map((m) => (
        <div key={m.item}>
          <span className="mono" translate="no">
            {formatQty(m.qtyPerUnit)} {m.unit}
          </span>{' '}
          <span translate="no">{m.itemName ?? m.item}</span>
          {Number(m.wastagePct) > 0 ? <span className="text-muted"> +{formatQty(m.wastagePct)}% wastage</span> : null}
          {m.itemId ? null : <span className="text-muted"> · new item</span>}
        </div>
      ))}
    </div>
  );
}

export function StandardNormsModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  // On a phone the work and what it takes stack, so the table never scrolls sideways.
  const wide = Grid.useBreakpoint().md !== false;
  const [replace, setReplace] = useState(false);
  const { data, isLoading, error, refetch } = useStandardNorms(projectId, open);
  const plan: StandardNormPlanDto | undefined = data;
  const already = plan?.matches.filter((m) => m.hasNorms).length ?? 0;
  const toSet = (plan?.matches.length ?? 0) - (replace ? 0 : already);

  const adopt = useMutation({
    mutationFn: async () => (await api.post<StandardNormResultDto>(`/reconciliation/projects/${projectId}/standard-norms`, { replace })).data,
    onSuccess: (r) => {
      message.success(`${r.norms} norm${r.norms === 1 ? '' : 's'} set on ${r.boqItems} BOQ item${r.boqItems === 1 ? '' : 's'}${r.newItems ? `, ${r.newItems} item${r.newItems === 1 ? '' : 's'} added to the master` : ''}`);
      qc.invalidateQueries({ queryKey: ['reconciliation'] });
      qc.invalidateQueries({ queryKey: ['standard-norms', projectId] });
      qc.invalidateQueries({ queryKey: ['items'] });
      onClose();
    },
    meta: FAIL_NOTICE,
  });

  return (
    <Modal
      open={open}
      onCancel={onClose}
      title="Add standard norms"
      width={860}
      okText={toSet ? `Add norms to ${toSet} BOQ item${toSet === 1 ? '' : 's'}` : 'Add norms'}
      okButtonProps={{ disabled: !toSet || !plan?.canAdopt }}
      confirmLoading={adopt.isPending}
      onOk={() => adopt.mutate()}
      destroyOnHidden
    >
      {error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : isLoading || !plan ? (
        <PageSkeleton shape="list" header={false} />
      ) : plan.matches.length ? (
        <>
          <Typography.Paragraph type="secondary">
            The usual figures for the work your BOQ names. They are a starting point: check each one against the approved mix design and correct it. The{' '}
            {plan.unmatchedCount} other BOQ item{plan.unmatchedCount === 1 ? '' : 's'} the library does not recognise stay for you to set.
          </Typography.Paragraph>
          <Table<StandardNormMatchDto>
            rowKey="boqItemId"
            size="small"
            pagination={false}
            dataSource={plan.matches}
            scroll={{ y: 340 }}
            columns={
              wide
                ? [
                    { title: 'BOQ item', key: 'work', render: (_, r) => workCell(r) },
                    { title: 'Per unit', key: 'materials', width: '42%', render: (_, r) => materialsCell(r) },
                    { title: '', key: 'state', width: 110, render: (_, r) => (r.hasNorms ? <AppTag tone="info">Has norms</AppTag> : null) },
                  ]
                : [
                    {
                      title: 'BOQ item and what it takes',
                      key: 'both',
                      render: (_, r) => (
                        <div>
                          {workCell(r)}
                          {materialsCell(r)}
                          {r.hasNorms ? <AppTag tone="info">Has norms</AppTag> : null}
                        </div>
                      ),
                    },
                  ]
            }
          />
          {plan.newItems.length ? (
            <Typography.Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
              {plan.newItems.length} item{plan.newItems.length === 1 ? '' : 's'} will be added to the item master:{' '}
              <span translate="no">{plan.newItems.map((i) => `${i.name} (${i.unit})`).join(', ')}</span>.
            </Typography.Paragraph>
          ) : null}
          {already ? (
            <Checkbox checked={replace} onChange={(e) => setReplace(e.target.checked)} style={{ marginTop: 12 }}>
              Replace the norms already set on {already} item{already === 1 ? '' : 's'}
            </Checkbox>
          ) : null}
          {plan.canAdopt ? null : (
            <Alert style={{ marginTop: 12 }} type="info" showIcon title="You can see these but not set them" description="The QS, the project manager, management or an admin can add them." />
          )}
        </>
      ) : (
        <Alert
          type="info"
          showIcon
          title="Nothing in this BOQ matches the library"
          description="The library knows concrete by grade, reinforcement, brickwork, plaster, sub-base, wet mix and bituminous work, each in its usual unit. Set the norms for this project's own items with New norm."
        />
      )}
    </Modal>
  );
}
