'use client';

import React, { useState } from 'react';
import { Alert, App, Grid, Modal, Table, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ActivityDto, BoqLinkSuggestion } from '@erp/shared';
import { api } from '@/lib/api';
import { FAIL_NOTICE } from '@/lib/notify';
import { formatQty } from '@/lib/format';
import { QueryError } from '@/components/common/QueryState';

/**
 * Links a project's activities to its BOQ items. The BOQ's sections are usually
 * named after the same work as the activities, so the links are offered; the planner unticks what is wrong and
 * confirms. An activity with no quantity of its own takes the item's unit and quantity.
 */
/** The offered item, with the section it sits under so the planner can place it. */
function itemCell(r: BoqLinkSuggestion) {
  return (
    <div>
      <span translate="no">{r.itemNo}</span> {r.description}
      {r.section ? <div className="text-muted">{r.section}</div> : null}
    </div>
  );
}

export function LinkBoqModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const { message } = App.useApp();
  const qc = useQueryClient();
  // On a phone the item goes under the activity instead of in columns of its own, so the table never scrolls sideways.
  const wide = Grid.useBreakpoint().md !== false;
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['activities', projectId, 'boq-links'],
    queryFn: async () => (await api.get<BoqLinkSuggestion[]>(`/projects/${projectId}/activities/boq-links`)).data,
    enabled: open,
  });
  // Everything is offered ticked; the state is what the planner unticked, so a fresh offer needs no effect to sync.
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  const picked = (data ?? []).map((s) => s.activityId).filter((id) => !dropped.has(id));

  const link = useMutation({
    mutationFn: async () => {
      const links = (data ?? []).filter((s) => !dropped.has(s.activityId)).map((s) => ({ activityId: s.activityId, boqItemId: s.boqItemId }));
      return (await api.post<ActivityDto[]>(`/projects/${projectId}/activities/boq-links`, { links })).data;
    },
    onSuccess: () => {
      setDropped(new Set());
      message.success(`${picked.length} activit${picked.length === 1 ? 'y' : 'ies'} linked to the BOQ`);
      qc.invalidateQueries({ queryKey: ['activities', projectId] });
      qc.invalidateQueries({ queryKey: ['boq', projectId] });
      qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
    },
    meta: FAIL_NOTICE,
  });

  return (
    <Modal
      open={open}
      onCancel={() => {
        setDropped(new Set());
        onClose();
      }}
      title="Link the activities to BOQ items"
      okText={`Link ${picked.length} activit${picked.length === 1 ? 'y' : 'ies'}`}
      okButtonProps={{ disabled: !picked.length }}
      confirmLoading={link.isPending}
      onOk={() => link.mutate()}
      width={860}
      destroyOnHidden
    >
      {error ? <QueryError error={error} onRetry={() => refetch()} /> : null}
      {!isLoading && data && !data.length ? (
        <Alert
          type="info"
          showIcon
          title="Nothing left to offer"
          description="Every activity is linked, or no BOQ section or item is named after one. Pick the item on the activity itself, or name the BOQ's sections after the activities and import again."
        />
      ) : (
        <>
          <Typography.Paragraph type="secondary">
            Matched by the name of the BOQ&apos;s sections and items. An activity with no quantity of its own takes the item&apos;s unit and quantity. Untick anything that is not the same work.
          </Typography.Paragraph>
          <Table<BoqLinkSuggestion>
            rowKey="activityId"
            size="small"
            loading={isLoading}
            pagination={false}
            dataSource={data ?? []}
            scroll={{ y: 420 }}
            rowSelection={{
              selectedRowKeys: picked,
              onChange: (keys) => setDropped(new Set((data ?? []).map((s) => s.activityId).filter((id) => !keys.includes(id)))),
              getCheckboxProps: (r) => ({ 'aria-label': `Link ${r.activityName}` }),
            }}
            columns={
              wide
                ? [
                    { title: 'Activity', dataIndex: 'activityName', width: '32%' },
                    { title: 'BOQ item', key: 'item', render: (_, r) => itemCell(r) },
                    { title: 'Unit', dataIndex: 'unit', width: 70 },
                    { title: 'Quantity', dataIndex: 'quantity', width: 110, align: 'right', className: 'mono', render: (v) => formatQty(v) },
                  ]
                : [
                    {
                      title: 'Activity and BOQ item',
                      key: 'both',
                      render: (_, r) => (
                        <div>
                          <div>{r.activityName}</div>
                          {itemCell(r)}
                          <div className="text-muted">
                            {formatQty(r.quantity)} {r.unit}
                          </div>
                        </div>
                      ),
                    },
                  ]
            }
          />
        </>
      )}
    </Modal>
  );
}
