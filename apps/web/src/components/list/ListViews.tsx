'use client';

import React, { useState } from 'react';
import { App, Button, Checkbox, Dropdown, Flex, Form, Input, Modal, Select, Tabs, Tooltip, theme } from 'antd';
import type { MenuProps } from 'antd';
import { DeleteOutlined, EditOutlined, EllipsisOutlined, SaveOutlined, TeamOutlined } from '@/components/common/icons';
import type { SavedViewDto, SavedViewList } from '@erp/shared';
import { canManageSharedViews } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useIsPhone } from '@/lib/screen';
import { errorMessage } from '@/lib/api';
import { sameFilters, type ListFilters } from '@/lib/listPage';
import { useDeleteView, useSaveView, useSavedViews } from '@/lib/queries';
import { useConfirmDelete } from '@/components/common/ConfirmDelete';

export interface BuiltInView {
  key: string;
  label: string;
  filters: ListFilters;
}

/**
 * The views across the top of a list page: the built-in ones ("All", "Waiting for me", "This week"…), then the user's
 * saved views and those shared with the company. Picking one sets the filters, sort and columns; "Save view" keeps the
 * current ones under a name.
 */
export function ListViews({
  list,
  builtIns,
  filters,
  columns,
  onApply,
}: {
  list: SavedViewList;
  builtIns: BuiltInView[];
  filters: ListFilters;
  /** The columns shown now, saved with the view. */
  columns: string[];
  onApply: (filters: ListFilters, columns?: string[]) => void;
}) {
  const { token } = theme.useToken();
  const { user } = useAuth();
  // A phone has no room for a row of tabs: the views are a drop-down.
  const phone = useIsPhone();
  const { message } = App.useApp();
  const [askDelete, deleteDialog] = useConfirmDelete();
  const { data: saved } = useSavedViews(list);
  const save = useSaveView();
  const remove = useDeleteView();
  const [editing, setEditing] = useState<SavedViewDto | 'new' | null>(null);
  const [form] = Form.useForm<{ name: string; shared: boolean }>();

  // A built-in view stays picked while searching or sorting inside it; a saved view while searching.
  const without = (f: ListFilters, keys: string[]) => Object.fromEntries(Object.entries(f).filter(([k]) => !keys.includes(k)));
  const savedMatch = (saved ?? []).find((v) => sameFilters(without(v.state.filters, ['q']), without(filters, ['q'])));
  const builtInMatch = builtIns.find((v) => sameFilters(v.filters, without(filters, ['q', 'sortBy', 'sortOrder'])));
  const active = savedMatch?.id ?? builtInMatch?.key;
  // Nothing new to save when the filters are exactly a view's already.
  const unchanged = !!savedMatch || (!!builtInMatch && sameFilters(builtInMatch.filters, without(filters, ['q'])));
  const mayEdit = (v: SavedViewDto) => v.mine || (!!user && canManageSharedViews(user.roleKey));

  const submit = async () => {
    const values = await form.validateFields();
    try {
      if (editing === 'new') {
        await save.mutateAsync({ list, name: values.name, shared: values.shared, state: { filters: without(filters, ['q']), columns } });
        message.success(`Saved “${values.name}”`);
      } else if (editing) {
        await save.mutateAsync({ id: editing.id, list, name: values.name, shared: values.shared });
        message.success('View updated');
      }
      setEditing(null);
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const menuFor = (v: SavedViewDto): MenuProps['items'] => [
    {
      key: 'update',
      icon: <SaveOutlined />,
      label: 'Save the current filters to it',
      disabled: sameFilters(v.state.filters, without(filters, ['q'])) && (v.state.columns ?? []).join() === columns.join(),
      onClick: async () => {
        try {
          await save.mutateAsync({ id: v.id, list, state: { filters: without(filters, ['q']), columns } });
          message.success(`"${v.name}" updated`);
        } catch (err) {
          message.error(errorMessage(err));
        }
      },
    },
    {
      key: 'rename',
      icon: <EditOutlined />,
      label: 'Rename or share',
      onClick: () => {
        form.setFieldsValue({ name: v.name, shared: v.shared });
        setEditing(v);
      },
    },
    {
      key: 'delete',
      icon: <DeleteOutlined />,
      label: 'Delete',
      danger: true,
      onClick: () =>
        askDelete({
          what: `the view “${v.name}”`,
          description: v.shared ? 'It is shared, so it goes for everyone in the company.' : undefined,
          onConfirm: () => remove.mutateAsync({ id: v.id, list }),
          onDone: () => {
            if (active === v.id) onApply({});
          },
        }),
    },
  ];

  const items = [
    ...builtIns.map((v) => ({ key: v.key, label: v.label })),
    ...(saved ?? []).map((v) => ({
      key: v.id,
      label: (
        <Flex align="center" gap={token.marginXXS}>
          <span>{v.name}</span>
          {v.shared ? (
            <Tooltip title={v.mine ? 'Shared with the company' : `Shared by ${v.ownerName}`}>
              <TeamOutlined style={{ color: token.colorTextTertiary }} aria-label="Shared" />
            </Tooltip>
          ) : null}
          {mayEdit(v) && (
            <span role="presentation" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
              <Dropdown menu={{ items: menuFor(v) }} trigger={['click']}>
                <Button type="text" size="small" icon={<EllipsisOutlined />} aria-label={`${v.name} view options`} />
              </Dropdown>
            </span>
          )}
        </Flex>
      ),
    })),
  ];

  const pick = (key: string) => {
    const b = builtIns.find((v) => v.key === key);
    if (b) return onApply(b.filters);
    const v = saved?.find((x) => x.id === key);
    if (v) onApply(v.state.filters, v.state.columns);
  };

  return (
    <>
      {/* Save view sits beside the tabs, not in antd's tab bar, whose role="tablist" may hold only tabs. */}
      <Flex align="center" gap={token.marginSM} style={{ padding: `0 ${token.paddingSM}px`, borderBottom: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}` }}>
        {phone ? (
          <Select
            aria-label="View"
            value={active}
            placeholder="Custom filters"
            onChange={pick}
            style={{ flex: 1, minWidth: 0, margin: `${token.marginXS}px 0` }}
            options={[...builtIns.map((v) => ({ value: v.key, label: v.label })), ...(saved ?? []).map((v) => ({ value: v.id, label: v.shared ? `${v.name} (shared)` : v.name }))]}
          />
        ) : (
          <Tabs size="small" activeKey={active ?? '__none'} onChange={pick} items={items} tabBarStyle={{ marginBottom: -token.lineWidth }} style={{ flex: 1, minWidth: 0 }} />
        )}
        {phone && savedMatch && mayEdit(savedMatch) ? (
          <Dropdown menu={{ items: menuFor(savedMatch) }} trigger={['click']}>
            <Button size="small" icon={<EllipsisOutlined />} aria-label={`${savedMatch.name} view options`} />
          </Dropdown>
        ) : null}
        <Button
          size="small"
          icon={<SaveOutlined />}
          aria-label={phone ? 'Save view' : undefined}
          disabled={unchanged}
          onClick={() => {
            form.setFieldsValue({ name: '', shared: false });
            setEditing('new');
          }}
        >
          {phone ? null : 'Save view'}
        </Button>
      </Flex>
      <Modal open={!!editing} title={editing === 'new' ? 'Save this view' : 'Rename or share'} okText="Save" onOk={submit} okButtonProps={{ loading: save.isPending }} onCancel={() => setEditing(null)} destroyOnHidden>
        <Form form={form} layout="vertical" style={{ marginTop: token.marginSM }} onFinish={submit}>
          <Form.Item name="name" label="Name" rules={[{ required: true, whitespace: true, message: 'Give the view a name' }, { max: 60, message: 'Keep the name under 60 characters' }]}>
            <Input
              placeholder="Submitted this month"
              maxLength={60}
              // eslint-disable-next-line jsx-a11y/no-autofocus -- focus moves into the dialog that just opened, as the dialog pattern asks
              autoFocus
            />
          </Form.Item>
          <Form.Item name="shared" valuePropName="checked" style={{ marginBottom: 0 }} extra="Everyone in the company sees it on this list. Only you, or an admin, can change it.">
            <Checkbox>Share with the company</Checkbox>
          </Form.Item>
        </Form>
      </Modal>
      {deleteDialog}
    </>
  );
}
