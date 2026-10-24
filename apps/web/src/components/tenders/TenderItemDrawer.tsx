'use client';

import React, { useEffect } from 'react';
import { AutoComplete, Button, Form, Input, InputNumber, Select, Space, Typography, theme } from 'antd';
import { ThunderboltOutlined } from '@/components/common/icons';
import type { ItemDto, SorItemDto, TenderDetailDto, TenderItemDto, TenderLineKind } from '@erp/shared';
import { TENDER_LINE_KINDS, TENDER_LINE_KIND_LABELS, sorPctLabel } from '@erp/shared';
import { useNotify } from '@/lib/notify';
import { useTenderAction } from '@/lib/queries';
import { formatINR, toNumber } from '@/lib/format';
import { FormGrid, FormSection, FormShell } from '@/components/form/FormShell';
import { LineTable } from '@/components/form/LineTable';
import { CODE_INPUT, MoneyInput, QuantityInput } from '@/components/form/inputs';
import { ItemSelect, SorItemSelect } from '@/components/common/SearchSelect';

interface Line {
  kind: TenderLineKind;
  itemId?: string | null;
  itemName?: string;
  name?: string;
  unit?: string;
  qtyPerUnit?: number | null;
  wastagePct?: number | null;
  rate?: number | null;
}

interface Values {
  itemNo?: string;
  description?: string;
  unit?: string;
  qty?: number | null;
  sorItemId?: string | null;
  sorRate?: number | null;
  ownRate?: number | null;
  lines: Line[];
}

const lineOf = (l: TenderItemDto['lines'][number]): Line => ({
  kind: l.kind,
  itemId: l.itemId,
  itemName: l.itemId ? `${l.name} (${l.unit})` : undefined,
  name: l.name,
  unit: l.unit,
  qtyPerUnit: toNumber(l.qtyPerUnit),
  wastagePct: toNumber(l.wastagePct),
  rate: l.rate === null ? null : toNumber(l.rate),
});

/** A unit's cost from the lines as typed (lines without a rate are priced by the master on saving, so left out here). */
function costOf(lines: Line[] | undefined) {
  return (lines ?? []).reduce((s, l) => s + (l.qtyPerUnit ?? 0) * (1 + (l.kind === 'MATERIAL' ? (l.wastagePct ?? 0) : 0) / 100) * (l.rate ?? 0), 0);
}

/**
 * A bid item and its rate analysis (v6 item 110): what one unit takes in materials (with wastage), labour man-days and
 * machine hours, each at a rate. A line left without a rate takes the store item's, the trade's labour rate or the
 * machines' rate on saving. The starter library fills a common item in one go.
 */
export function TenderItemDrawer({ open, onClose, tender, item }: { open: boolean; onClose: () => void; tender: TenderDetailDto; item: TenderItemDto | null }) {
  const [form] = Form.useForm<Values>();
  const { token } = theme.useToken();
  const notify = useNotify();
  const save = useTenderAction();
  const library = useTenderAction();
  const editing = !!item;
  const lines = Form.useWatch('lines', form) as Line[] | undefined;
  const sorRate = Form.useWatch('sorRate', form) as number | null | undefined;

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    if (item)
      form.setFieldsValue({
        itemNo: item.itemNo,
        description: item.description,
        unit: item.unit,
        qty: toNumber(item.qty),
        sorItemId: item.sorItemId,
        sorRate: item.sorRate === null ? null : toNumber(item.sorRate),
        ownRate: item.ownRate === null ? null : toNumber(item.ownRate),
        lines: item.lines.map(lineOf),
      });
    else form.setFieldsValue({ itemNo: String(tender.items.length + 1), lines: [] });
  }, [open, item, tender.items.length, form]);

  const cost = costOf(lines);
  const overheads = (cost * toNumber(tender.overheadPct)) / 100;
  const profit = (cost * toNumber(tender.profitPct)) / 100;
  const builtUp = cost + overheads + profit;
  const fromLibrary = async () => {
    if (!item) return;
    const t = await library.mutateAsync({ path: `/tenders/${tender.id}/items/${item.id}/library`, body: {} });
    const fresh = t.items.find((i) => i.id === item.id);
    if (fresh) form.setFieldValue('lines', fresh.lines.map(lineOf));
    notify.success(`Filled from the starter library: check the quantities and rates, then save`);
  };

  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="drawer"
      width={1000}
      projectDefault={false}
      allValues
      title={editing ? `Item ${item.itemNo} · rate analysis` : 'Add a bid item'}
      okText={editing ? 'Save' : 'Add item'}
      footerExtra={
        cost > 0 ? (
          <Typography.Text type="secondary" translate="no">
            {`Cost ${formatINR(cost, true)} + overheads and profit = ${formatINR(builtUp, true)} a unit`}
            {sorRate ? ` (${sorPctLabel(((builtUp / sorRate - 1) * 100).toFixed(2))} SOR)` : ''}
          </Typography.Text>
        ) : null
      }
      onSubmit={async (v) => {
        const head = {
          itemNo: v.itemNo?.trim(),
          description: v.description?.trim() || undefined,
          unit: v.unit?.trim() || undefined,
          qty: v.qty,
          sorItemId: v.sorItemId ?? null,
          sorRate: v.sorRate ?? null,
          ...(tender.bidType === 'ITEM_RATE' ? { ownRate: v.ownRate ?? null } : {}),
        };
        let id = item?.id;
        if (editing) await save.mutateAsync({ method: 'patch', path: `/tenders/${tender.id}/items/${item.id}`, body: head });
        else {
          const t = await save.mutateAsync({ path: `/tenders/${tender.id}/items`, body: head });
          id = t.items.find((i) => i.itemNo === head.itemNo)?.id;
        }
        if (id && (editing || v.lines?.length))
          await save.mutateAsync({
            method: 'put',
            path: `/tenders/${tender.id}/items/${id}/lines`,
            body: {
              lines: (v.lines ?? []).map((l) => ({
                kind: l.kind,
                itemId: l.kind === 'MATERIAL' ? (l.itemId ?? null) : null,
                name: l.name?.trim() || undefined,
                unit: l.unit?.trim() || undefined,
                qtyPerUnit: l.qtyPerUnit,
                wastagePct: l.kind === 'MATERIAL' ? (l.wastagePct ?? 0) : 0,
                // Blank takes the master's rate on saving.
                ...(l.rate === null || l.rate === undefined ? {} : { rate: l.rate }),
              })),
            },
          });
        notify.saved(editing ? `Item ${head.itemNo} saved` : `Item ${head.itemNo} added`);
      }}
    >
      <Form form={form} layout="vertical">
        <FormSection title="Item">
          <FormGrid cols={4}>
            <Form.Item name="itemNo" label="Item no." rules={[{ required: true, whitespace: true, message: 'Enter the item number' }]}>
              <Input maxLength={40} {...CODE_INPUT} />
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(a, b) => a.unit !== b.unit}>
              {() => (
                <Form.Item name="qty" label="Quantity" rules={[{ required: true, message: 'Enter the quantity in the BOQ' }]}>
                  <QuantityInput unit={form.getFieldValue('unit')} />
                </Form.Item>
              )}
            </Form.Item>
            <Form.Item name="unit" label="Unit" rules={[{ required: true, whitespace: true, message: 'Enter the unit, e.g. cum' }]}>
              <Input maxLength={20} placeholder="cum" />
            </Form.Item>
            <Form.Item name="sorRate" label="SOR rate">
              <MoneyInput />
            </Form.Item>
          </FormGrid>
          <Form.Item name="sorItemId" label="SOR item" extra={tender.sorBookName ? `From ${tender.sorBookName}: sets the description, unit and SOR rate` : 'Choose the schedule of rates on the tender to pick from it'}>
            <SorItemSelect
              allowClear
              aria-label="SOR item"
              bookId={tender.sorBookId}
              disabled={!tender.sorBookId}
              selected={item?.sorItemId && item.sorCode ? { value: item.sorItemId, label: `${item.sorCode} · ${item.description}` } : null}
              onPick={(s: SorItemDto) => form.setFieldsValue({ sorItemId: s.id, description: s.description, unit: s.unit, sorRate: toNumber(s.rate) })}
            />
          </Form.Item>
          <Form.Item name="description" label="Description" rules={[{ required: true, whitespace: true, message: 'Describe the item, or choose it from the SOR' }]}>
            <Input.TextArea autoSize={{ minRows: 1, maxRows: 4 }} maxLength={2000} />
          </Form.Item>
          {tender.bidType === 'ITEM_RATE' ? (
            <Form.Item name="ownRate" label="Rate to quote" extra="Leave blank to quote the built-up rate from the analysis">
              <MoneyInput style={{ maxWidth: 240 }} />
            </Form.Item>
          ) : null}
        </FormSection>
        <FormSection
          title="Rate analysis for one unit"
          extra={
            editing ? (
              <Button size="small" icon={<ThunderboltOutlined />} loading={library.isPending} onClick={() => void fromLibrary()}>
                Fill from the library
              </Button>
            ) : null
          }
        >
          <LineTable
            name="lines"
            label="Analysis"
            addText="Add a line"
            newLine={() => ({ kind: 'MATERIAL', wastagePct: 0 })}
            columns={[
              {
                key: 'kind',
                title: 'Kind',
                width: 130,
                render: (field) => (
                  <Form.Item name={[field.name, 'kind']} noStyle>
                    <Select
                      aria-label="Kind"
                      style={{ width: '100%' }}
                      options={TENDER_LINE_KINDS.map((k) => ({ value: k, label: TENDER_LINE_KIND_LABELS[k] }))}
                      onChange={(k: TenderLineKind) => form.setFieldValue(['lines', field.name], { kind: k, unit: k === 'LABOUR' ? 'day' : k === 'EQUIPMENT' ? 'hour' : undefined, wastagePct: 0 })}
                    />
                  </Form.Item>
                ),
              },
              {
                key: 'what',
                title: 'Material, trade or machines',
                render: (field) => (
                  <Form.Item noStyle shouldUpdate>
                    {() => {
                      const l = form.getFieldValue(['lines', field.name]) as Line | undefined;
                      if (l?.kind === 'MATERIAL')
                        return (
                          <Space orientation="vertical" size={4} style={{ width: '100%' }}>
                            <Form.Item name={[field.name, 'itemId']} noStyle>
                              <ItemSelect
                                allowClear
                                aria-label="Store item"
                                placeholder="Store item"
                                style={{ width: '100%' }}
                                selected={l.itemId && l.itemName ? { value: l.itemId, label: l.itemName } : null}
                                onPick={(i: ItemDto) => form.setFieldValue(['lines', field.name], { ...l, itemId: i.id, itemName: `${i.name} (${i.unit})`, name: i.name, unit: i.unit })}
                                onChange={(v) => !v && form.setFieldValue(['lines', field.name], { ...l, itemId: null, itemName: undefined })}
                              />
                            </Form.Item>
                            {!l.itemId ? (
                              <Form.Item name={[field.name, 'name']} rules={[{ required: true, whitespace: true, message: 'Choose the store item or name the material' }]} noStyle>
                                <Input aria-label="Material not in the store" placeholder="Or name it: Borrow earth" maxLength={160} />
                              </Form.Item>
                            ) : null}
                          </Space>
                        );
                      const options = (l?.kind === 'LABOUR' ? tender.labourTrades : tender.equipmentCategories).map((n) => ({ value: n }));
                      return (
                        <Form.Item name={[field.name, 'name']} rules={[{ required: true, whitespace: true, message: l?.kind === 'LABOUR' ? 'Name the trade, e.g. Mason' : 'Name the machines, e.g. Concreting' }]} noStyle>
                          <AutoComplete
                            aria-label={l?.kind === 'LABOUR' ? 'Trade' : 'Machine category'}
                            options={options}
                            placeholder={l?.kind === 'LABOUR' ? 'Mason' : 'Concreting'}
                            style={{ width: '100%' }}
                            showSearch={{ filterOption: (input, o) => String(o?.value ?? '').toLowerCase().includes(input.toLowerCase()) }}
                          />
                        </Form.Item>
                      );
                    }}
                  </Form.Item>
                ),
              },
              {
                key: 'unit',
                title: 'Unit',
                width: 90,
                render: (field) => (
                  <Form.Item name={[field.name, 'unit']} rules={[{ required: true, whitespace: true, message: 'Give the unit' }]} noStyle>
                    <Input aria-label="Unit" maxLength={20} placeholder="cum" />
                  </Form.Item>
                ),
              },
              {
                key: 'qty',
                title: 'For one unit',
                width: 130,
                align: 'right',
                render: (field) => (
                  <Form.Item name={[field.name, 'qtyPerUnit']} rules={[{ required: true, message: 'Enter how much one unit takes' }]} noStyle>
                    <InputNumber aria-label="For one unit" min={0} precision={6} stringMode={false} style={{ width: '100%' }} />
                  </Form.Item>
                ),
              },
              {
                key: 'wastage',
                title: 'Wastage',
                width: 100,
                align: 'right',
                render: (field) => (
                  <Form.Item noStyle shouldUpdate>
                    {() =>
                      form.getFieldValue(['lines', field.name, 'kind']) === 'MATERIAL' ? (
                        <Form.Item name={[field.name, 'wastagePct']} noStyle>
                          <InputNumber aria-label="Wastage" min={0} max={100} precision={2} suffix="%" style={{ width: '100%' }} />
                        </Form.Item>
                      ) : (
                        <Typography.Text type="secondary">-</Typography.Text>
                      )
                    }
                  </Form.Item>
                ),
              },
              {
                key: 'rate',
                title: 'Rate',
                width: 140,
                align: 'right',
                render: (field) => (
                  <Form.Item name={[field.name, 'rate']} noStyle>
                    <MoneyInput aria-label="Rate" placeholder="Master's" />
                  </Form.Item>
                ),
              },
              {
                key: 'amount',
                title: 'Amount',
                width: 120,
                align: 'right',
                render: (field) => (
                  <Form.Item noStyle shouldUpdate>
                    {() => {
                      const l = form.getFieldValue(['lines', field.name]) as Line | undefined;
                      const a = costOf(l ? [l] : []);
                      return (
                        <Typography.Text translate="no" type={l?.rate === null || l?.rate === undefined ? 'secondary' : undefined} style={{ fontSize: token.fontSizeSM }}>
                          {l?.rate === null || l?.rate === undefined ? 'On saving' : formatINR(a, true)}
                        </Typography.Text>
                      );
                    }}
                  </Form.Item>
                ),
              },
            ]}
          />
        </FormSection>
      </Form>
    </FormShell>
  );
}
