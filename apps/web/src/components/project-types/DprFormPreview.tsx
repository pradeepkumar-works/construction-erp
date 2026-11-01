'use client';

import React from 'react';
import { Button, Flex, Form, Input, InputNumber, Select, Typography, theme } from 'antd';
import {
  DPR_LINE_PART_LABELS,
  DPR_SECTIONS,
  DPR_SECTION_LABELS,
  WEATHER_LABELS,
  WEATHER_OPTIONS,
  dprLabel,
  dprRequires,
  dprSectionFields,
  ownFieldLabel,
  ownFieldsOf,
  type DprBuiltInKey,
  type DprFormDef,
  type DprSection,
  type WorkLocation,
} from '@erp/shared';
import { CameraOutlined } from '@/components/common/icons';
import { DatePicker } from '@/components/common/DatePicker';
import { FormGrid, FormSection } from '@/components/form/FormShell';
import { OwnFieldInput } from '@/components/dpr/OwnFields';

export type PreviewMode = 'web' | 'phone';

/** Where a line's work is named, for the type's places: chainage, floor, village, else a note. */
const WHERE: Record<WorkLocation, string> = { CHAINAGE: 'Chainage from, to', FLOOR: 'Floor', VILLAGE: 'Village' };

/**
 * A type's DPR form as the site sees it: the web form's sections, or the phone's one column with the
 * Hindi names under the company's own fields. Nothing in it saves; it shows what the definition asks for.
 */
export function DprFormPreview({ def, mode, locations, progressFromDpr }: { def: DprFormDef; mode: PreviewMode; locations: WorkLocation[]; progressFromDpr: boolean }) {
  const { token } = theme.useToken();
  const phone = mode === 'phone';
  const opts = { progressFromDpr };
  const Grid = ({ cols, children }: { cols: 2 | 3; children: React.ReactNode }) => (phone ? <>{children}</> : <FormGrid cols={cols}>{children}</FormGrid>);
  const item = (key: DprBuiltInKey, control: React.ReactNode, extra?: React.ReactNode) => (
    <Form.Item key={key} label={dprLabel(def, key)} required={dprRequires(def, key)} extra={extra}>
      {control}
    </Form.Item>
  );
  const crew = def.lines.crewCategories.map((c) => ({ value: c, label: c }));
  const parts = def.lines.parts.map((p) => DPR_LINE_PART_LABELS[p].toLowerCase());
  const lineOwn = ownFieldsOf(def, 'LINE');
  const where = locations.length ? locations.map((l) => WHERE[l]).join(' or ') : 'Where (a note)';

  const builtIn = (key: DprBuiltInKey) => {
    switch (key) {
      case 'weather':
        return item(key, <Select aria-label="Weather" options={WEATHER_OPTIONS.map((w) => ({ value: w, label: WEATHER_LABELS[w] }))} placeholder="Sunny" />);
      case 'siteCondition':
        return item(key, <Input aria-label="Site condition" placeholder="Workable / Waterlogged" />);
      case 'lines':
        return (
          <Form.Item key={key} label={dprLabel(def, key)} required={dprRequires(def, key)}>
            <div style={{ border: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`, borderRadius: token.borderRadius, padding: token.paddingSM }}>
              <Flex vertical={phone} wrap gap={token.marginXS}>
                {def.lines.picker === 'CASCADE' ? (
                  <>
                    <Select aria-label="Component" placeholder="Component" style={{ flex: '1 1 160px' }} />
                    <Select aria-label="Sub-component" placeholder="Sub-component" style={{ flex: '1 1 160px' }} />
                    <Select aria-label="Activity" placeholder="Activity" style={{ flex: '1.4 1 200px' }} />
                  </>
                ) : (
                  <Select aria-label="Activity" placeholder="Activity (this week's first, then by component)" style={{ flex: '2 1 240px' }} />
                )}
                <Input aria-label="Where" placeholder={where} style={{ flex: '1 1 160px' }} />
                <InputNumber aria-label="Quantity today" placeholder="Today" style={{ flex: '0.7 1 110px', width: phone ? '100%' : undefined }} />
              </Flex>
              <Typography.Paragraph type="secondary" style={{ margin: `${token.marginXS}px 0 0` }}>
                {parts.length || lineOwn.length ? `Each line also takes ${[...parts, ...lineOwn.map((f) => f.label + (f.required ? ' (required)' : ''))].join(', ')}.` : 'Each line takes the activity, where and how much only.'}
              </Typography.Paragraph>
            </div>
          </Form.Item>
        );
      case 'manpower':
        return item(
          key,
          <Flex gap={token.marginXS}>
            <Select aria-label="Trade" placeholder="Trade" options={crew} style={{ flex: 1 }} />
            <InputNumber aria-label="Number" placeholder="Nos" style={{ width: 90 }} />
          </Flex>,
          phone ? undefined : `Categories: ${def.lines.crewCategories.join(', ')}`,
        );
      case 'machinery':
        return item(
          key,
          <Flex gap={token.marginXS}>
            <Select aria-label="Machine" placeholder={def.lines.machineNames[0] ?? 'Machine'} options={def.lines.machineNames.map((m) => ({ value: m, label: m }))} style={{ flex: 1 }} />
            <InputNumber aria-label="Hours" placeholder="Hrs" style={{ width: 90 }} />
          </Flex>,
        );
      case 'photos':
        return item(
          key,
          <Button icon={<CameraOutlined />}>Add photo</Button>,
          def.minPhotos ? `At least ${def.minPhotos} photo${def.minPhotos === 1 ? '' : 's'} to send the report` : 'Photos of the work done today',
        );
      default:
        return item(key, <Input.TextArea aria-label={dprLabel(def, key)} rows={phone ? 2 : 1} />);
    }
  };

  const section = (s: DprSection) => {
    const keys = dprSectionFields(def, s, opts);
    const own = s === 'DAY' ? ownFieldsOf(def, 'DAY') : [];
    if (s !== 'DAY' && !keys.length) return null;
    const inline = keys.filter((k) => k !== 'lines' && k !== 'photos');
    const wide = keys.filter((k) => k === 'lines' || k === 'photos');
    return (
      <FormSection key={s} title={DPR_SECTION_LABELS[s]}>
        {s === 'DAY' ? (
          <Grid cols={3}>
            <Form.Item label="Date" required>
              <DatePicker aria-label="Date" style={{ width: '100%' }} />
            </Form.Item>
            {inline.map(builtIn)}
            {own.map((f) => (
              <Form.Item
                key={f.key}
                required={f.required}
                label={
                  phone && f.labelHi ? (
                    <span>
                      {ownFieldLabel(f)}{' '}
                      <span lang="hi" style={{ color: token.colorTextSecondary }}>
                        {f.labelHi}
                      </span>
                    </span>
                  ) : (
                    ownFieldLabel(f)
                  )
                }
              >
                <OwnFieldInput field={f} aria-label={f.label} />
              </Form.Item>
            ))}
          </Grid>
        ) : (
          <>
            {wide.filter((k) => k === 'lines').map(builtIn)}
            {s === 'WORK' ? (
              <Form.Item label={keys.includes('lines') ? 'Other work and notes' : 'Work done'}>
                <Input.TextArea aria-label="Work done" rows={2} />
              </Form.Item>
            ) : null}
            <Grid cols={2}>{inline.map(builtIn)}</Grid>
            {wide.filter((k) => k === 'photos').map(builtIn)}
          </>
        )}
      </FormSection>
    );
  };

  return (
    <div
      style={
        phone
          ? { maxWidth: 380, margin: '0 auto', border: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}`, borderRadius: token.borderRadiusLG, padding: token.padding, background: token.colorBgContainer }
          : undefined
      }
    >
      {phone ? (
        <Typography.Title level={5} style={{ marginTop: 0 }}>
          New DPR
        </Typography.Title>
      ) : null}
      <Form layout="vertical" disabled component="div" aria-label="Preview of the DPR form">
        {DPR_SECTIONS.map(section)}
      </Form>
    </div>
  );
}
