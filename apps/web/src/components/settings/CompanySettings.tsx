'use client';

import React, { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { App, Button, Card, Descriptions, Flex, Form, Input, Popconfirm, Table, Typography, Upload } from 'antd';
import type { TableProps } from 'antd';
import { tk } from '@/ds';
import type { CompanyProfileDto, CompanySettingsDto, DocSeriesLineDto } from '@erp/shared';
import {
  CIN_PATTERN,
  HSN_PATTERN,
  TAN_PATTERN,
  DOC_SERIES_TOKENS,
  LOGO_MAX_BYTES,
  canManageCompanyData,
  canManageCustomFields,
  canSeeNav,
  dataUrlBytes,
  docPatternProblem,
  docSeriesRestarts,
  formatDocNo,
  logoProblem,
  navNode,
  standardDocPattern,
} from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useCompanySettings, useSaveCompanySettings } from '@/lib/queries';
import { useNotify } from '@/lib/notify';
import { useUrlTab } from '@/lib/url-state';
import { formatBytes, formatDate, todayDate, NO_VALUE } from '@/lib/format';
import { DatePicker } from '@/components/common/DatePicker';
import dayjs from 'dayjs';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { NoAccess } from '@/components/common/NoAccess';
import { AppTabs } from '@/components/common/AppTabs';
import { AppTag } from '@/components/common/AppTag';
import { Section, SectionStack } from '@/components/common/Section';
import { Help } from '@/components/common/Help';
import { DeleteOutlined, EditOutlined, RightOutlined, UploadOutlined } from '@/components/common/icons';
import { navIcon } from '@/components/shell/nav-icons';
import { FormGrid, FormShell } from '@/components/form/FormShell';
import { CustomFieldsSettings } from '@/components/custom-fields/CustomFieldsSettings';
import { CODE_INPUT, gstinRule, panRule, upper } from '@/components/form/inputs';

const TABS = ['company', 'numbering', 'fields', 'more'] as const;
type Tab = (typeof TABS)[number];

/** A logo scaled to fit 800 × 300 and written as a PNG, or a WebP when the PNG is over the limit. */
async function logoDataUrl(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Choose a PNG, JPEG or WebP image'));
      i.src = url;
    });
    const scale = Math.min(1, 800 / img.naturalWidth, 300 / img.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
    const png = canvas.toDataURL('image/png');
    return dataUrlBytes(png) <= LOGO_MAX_BYTES ? png : canvas.toDataURL('image/webp', 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The top of a printed paper as the company's details make it. */
function LetterheadPreview({ p }: { p: CompanyProfileDto }) {
  const tax = [p.gstin ? `GSTIN ${p.gstin}` : '', p.pan ? `PAN ${p.pan}` : '', p.cin ? `CIN ${p.cin}` : ''].filter(Boolean).join(' · ');
  return (
    <div
      aria-label="Letterhead preview"
      role="img"
      style={{ display: 'flex', gap: tk.space[4], alignItems: 'flex-start', padding: tk.space[4], border: `1px solid ${tk.color.line.hairline}`, borderRadius: tk.radius.md, background: tk.color.surface.base }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a data URL from the company's own settings, nothing to optimise */}
      {p.logo ? <img src={p.logo} alt="" style={{ maxHeight: 56, maxWidth: 160, objectFit: 'contain' }} /> : null}
      <div style={{ minWidth: 0 }}>
        <div style={{ ...tk.type.subhead, color: tk.color.text.strong }} translate="no">
          {p.name}
        </div>
        <div style={{ ...tk.type.caption, color: tk.color.text.muted }} translate="no">
          {[p.legalName && p.legalName !== p.name ? p.legalName : '', p.address ?? '', tax].filter(Boolean).map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface ProfileForm {
  legalName: string | null;
  address: string | null;
  gstin: string | null;
  pan: string | null;
  cin: string | null;
  tan: string | null;
}

function ProfileDialog({ open, profile, onClose }: { open: boolean; profile: CompanyProfileDto; onClose: () => void }) {
  const [form] = Form.useForm<ProfileForm>();
  const notify = useNotify();
  const save = useSaveCompanySettings<ProfileForm>('profile');
  useEffect(() => {
    if (open) form.setFieldsValue({ legalName: profile.legalName, address: profile.address, gstin: profile.gstin, pan: profile.pan, cin: profile.cin, tan: profile.tan });
  }, [open, profile, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={640}
      projectDefault={false}
      title="Letterhead details"
      okText="Save"
      onSubmit={async (v) => {
        const blank = (s: string | null | undefined) => (s?.trim() ? s.trim() : null);
        await save.mutateAsync({ legalName: blank(v.legalName), address: blank(v.address), gstin: blank(v.gstin), pan: blank(v.pan), cin: blank(v.cin), tan: blank(v.tan) });
        notify.success('Letterhead details saved');
      }}
    >
      <Form form={form} layout="vertical">
        <Form.Item name="legalName" label="Legal name" tooltip={`Printed under ${profile.name} when it differs`}>
          <Input maxLength={160} placeholder={profile.name} />
        </Form.Item>
        <Form.Item name="address" label="Registered address" tooltip="The letterhead and the subscription invoices print it">
          <Input.TextArea rows={3} maxLength={400} />
        </Form.Item>
        <FormGrid cols={2}>
          <Form.Item name="gstin" label="GSTIN" normalize={upper} rules={[gstinRule]}>
            <Input {...CODE_INPUT} maxLength={15} />
          </Form.Item>
          <Form.Item name="pan" label="PAN" normalize={upper} rules={[panRule]}>
            <Input {...CODE_INPUT} maxLength={10} />
          </Form.Item>
          <Form.Item name="cin" label="CIN" normalize={upper} rules={[{ pattern: CIN_PATTERN, message: 'A CIN is 21 characters, e.g. U45200OR2015PTC012345' }]}>
            <Input {...CODE_INPUT} maxLength={21} />
          </Form.Item>
          <Form.Item name="tan" label="TAN" normalize={upper} tooltip="Tax deduction account number, quoted on the TDS returns and challans" rules={[{ pattern: TAN_PATTERN, message: 'A TAN is four letters, five digits and a letter, e.g. BBNA01234F' }]}>
            <Input {...CODE_INPUT} maxLength={10} />
          </Form.Item>
        </FormGrid>
      </Form>
    </FormShell>
  );
}

interface EinvoiceForm {
  gstSac: string | null;
  einvoiceFrom: dayjs.Dayjs | null;
}

/** When the company came under e-invoicing, and the SAC its works bills report unless a bill names its own. */
function EinvoiceDialog({ open, profile, onClose }: { open: boolean; profile: CompanyProfileDto; onClose: () => void }) {
  const [form] = Form.useForm<EinvoiceForm>();
  const notify = useNotify();
  const save = useSaveCompanySettings<{ gstSac: string | null; einvoiceFrom: string | null }>('profile');
  useEffect(() => {
    if (open) form.setFieldsValue({ gstSac: profile.gstSac, einvoiceFrom: profile.einvoiceFrom ? dayjs(profile.einvoiceFrom) : null });
  }, [open, profile, form]);
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      width={520}
      projectDefault={false}
      title="E-invoicing"
      okText="Save"
      onSubmit={async (v) => {
        await save.mutateAsync({ gstSac: v.gstSac?.trim() || null, einvoiceFrom: v.einvoiceFrom ? v.einvoiceFrom.format('YYYY-MM-DD') : null });
        notify.success('E-invoicing saved');
      }}
    >
      <Form form={form} layout="vertical">
        <FormGrid cols={2}>
          <Form.Item
            name="einvoiceFrom"
            label="E-invoicing from"
            tooltip="The day the company's turnover put it under e-invoicing (above ₹5 crore in a year). Leave empty when it is not, and no bill gets an IRN"
          >
            <DatePicker style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item name="gstSac" label="SAC for works bills" tooltip="Reported on an RA bill's e-invoice unless the bill names its own, e.g. 995421 for civil works" rules={[{ pattern: HSN_PATTERN, message: 'A SAC is 4, 6 or 8 digits, e.g. 995421' }]}>
            <Input {...CODE_INPUT} inputMode="numeric" maxLength={8} placeholder="e.g. 995421" />
          </Form.Item>
        </FormGrid>
      </Form>
    </FormShell>
  );
}

function CompanyTab({ data }: { data: CompanySettingsDto }) {
  const p = data.profile;
  const { message } = App.useApp();
  const notify = useNotify();
  const [editing, setEditing] = useState(false);
  const [einvoicing, setEinvoicing] = useState(false);
  const saveLogo = useSaveCompanySettings<{ logo: string | null }>('logo');
  const pickLogo = async (file: File) => {
    try {
      const logo = await logoDataUrl(file);
      const problem = logoProblem(logo);
      if (problem) {
        message.error(problem);
        return;
      }
      await saveLogo.mutateAsync({ logo });
      notify.success(`Logo saved (${formatBytes(dataUrlBytes(logo))})`);
    } catch (e) {
      notify.failed(e);
    }
  };
  return (
    <SectionStack>
      <Section title="Preview" help="How the top of every printed paper reads: orders, bills, permits, letters and reports.">
        <LetterheadPreview p={p} />
      </Section>
      <Section
        title="Letterhead details"
        extra={
          <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
            Edit
          </Button>
        }
      >
        <Descriptions
          size="small"
          column={{ xs: 1, md: 2 }}
          items={[
            { key: 'name', label: 'Company', children: <span translate="no">{p.name}</span> },
            { key: 'legal', label: 'Legal name', children: <span translate="no">{p.legalName ?? NO_VALUE}</span> },
            { key: 'address', label: 'Registered address', children: <span translate="no">{p.address ?? NO_VALUE}</span> },
            { key: 'gstin', label: 'GSTIN', children: <span className="mono" translate="no">{p.gstin ?? NO_VALUE}</span> },
            { key: 'pan', label: 'PAN', children: <span className="mono" translate="no">{p.pan ?? NO_VALUE}</span> },
            { key: 'cin', label: 'CIN', children: <span className="mono" translate="no">{p.cin ?? NO_VALUE}</span> },
            { key: 'tan', label: 'TAN', children: <span className="mono" translate="no">{p.tan ?? NO_VALUE}</span> },
          ]}
        />
      </Section>
      <Section
        title="E-invoicing"
        help="RA bills and ready-mix bills to a registered client get an IRN and a signed QR from the IRP once the company is under e-invoicing. The IRP is reached through the GST provider set up in Administration › Connections."
        extra={
          <Button icon={<EditOutlined />} aria-label="Edit e-invoicing" onClick={() => setEinvoicing(true)}>
            Edit
          </Button>
        }
      >
        <Descriptions
          size="small"
          column={{ xs: 1, md: 2 }}
          items={[
            { key: 'from', label: 'E-invoicing from', children: p.einvoiceFrom ? formatDate(p.einvoiceFrom) : 'Not under e-invoicing' },
            { key: 'sac', label: 'SAC for works bills', children: <span className="mono" translate="no">{p.gstSac ?? NO_VALUE}</span> },
          ]}
        />
      </Section>
      <Section title="Logo" help="A PNG, JPEG or WebP. It is scaled to fit 800 × 300 and printed at the top left of every paper.">
        <Flex align="center" gap={tk.space[3]} wrap>
          <Upload
            accept="image/png,image/jpeg,image/webp"
            showUploadList={false}
            beforeUpload={(file) => {
              void pickLogo(file);
              return false;
            }}
          >
            <Button icon={<UploadOutlined />} loading={saveLogo.isPending}>
              {p.logo ? 'Change logo' : 'Upload logo'}
            </Button>
          </Upload>
          {p.logo ? (
            <Popconfirm title="Take the logo off?" description="Papers print the company name alone." okText="Take it off" okButtonProps={{ danger: true }} onConfirm={() => saveLogo.mutateAsync({ logo: null }).then(() => notify.success('Logo taken off'))}>
              <Button icon={<DeleteOutlined />}>Remove</Button>
            </Popconfirm>
          ) : (
            <Typography.Text type="secondary">No logo yet</Typography.Text>
          )}
        </Flex>
      </Section>
      <ProfileDialog open={editing} profile={p} onClose={() => setEditing(false)} />
      <EinvoiceDialog open={einvoicing} profile={p} onClose={() => setEinvoicing(false)} />
    </SectionStack>
  );
}

function PatternDialog({ line, onClose, onSave }: { line: DocSeriesLineDto | null; onClose: () => void; onSave: (kind: string, pattern: string) => Promise<unknown> }) {
  const [form] = Form.useForm<{ pattern: string }>();
  const pattern = Form.useWatch('pattern', form) ?? '';
  useEffect(() => {
    if (line) form.setFieldsValue({ pattern: line.pattern });
  }, [line, form]);
  const problem = pattern ? docPatternProblem(pattern) : null;
  const today = todayDate();
  return (
    <FormShell open={!!line} onClose={onClose} form={form} layout="modal" width={560} projectDefault={false} title={line?.label ?? ''} okText="Save" onSubmit={(v) => onSave(line!.kind, v.pattern.trim())}>
      <Form form={form} layout="vertical">
        <Form.Item
          name="pattern"
          label="Pattern"
          tooltip={`${DOC_SERIES_TOKENS.join(' ')}: {YYYY} 2026, {YY} 26, {FY} the financial year as 26-27, {NNNN} the running number, last. Numbers start again when the part before {NNNN} changes.`}
          rules={[{ validator: async (_, v: string) => { const p = docPatternProblem(v ?? ''); if (p) throw new Error(p); } }]}
        >
          <Input {...CODE_INPUT} maxLength={30} placeholder={`${line?.kind ?? 'PO'}/{FY}/{NNNN}`} />
        </Form.Item>
        <Flex gap={tk.space[2]} wrap style={{ marginTop: tk.neg(2), marginBottom: tk.space[3] }}>
          {line ? (
            <>
              <Button size="small" onClick={() => form.setFieldsValue({ pattern: `${line.kind}/{FY}/{NNNN}` })}>
                By financial year
              </Button>
              <Button size="small" onClick={() => form.setFieldsValue({ pattern: standardDocPattern(line.kind) })}>
                Standard
              </Button>
            </>
          ) : null}
        </Flex>
        {!problem && pattern ? (
          <Descriptions
            size="small"
            column={1}
            items={[
              { key: 'first', label: 'First number', children: <span className="mono" translate="no">{formatDocNo(pattern, today, 1)}</span> },
              { key: 'restarts', label: 'Starts again', children: docSeriesRestarts(pattern) },
            ]}
          />
        ) : null}
      </Form>
    </FormShell>
  );
}

/** A number or pattern that wraps on a narrow screen only after a slash, never inside 26-27. */
function DocNo({ value }: { value: string }) {
  const parts = value.split('/');
  return (
    <span className="mono" translate="no">
      {parts.map((part, i) => (
        <Fragment key={i}>
          {i > 0 ? <wbr /> : null}
          <span style={{ whiteSpace: 'nowrap' }}>{i < parts.length - 1 ? `${part}/` : part}</span>
        </Fragment>
      ))}
    </span>
  );
}

function NumberingTab({ data }: { data: CompanySettingsDto }) {
  const notify = useNotify();
  const save = useSaveCompanySettings<{ series: Record<string, string> }>('numbering');
  const [editing, setEditing] = useState<DocSeriesLineDto | null>(null);
  const current = Object.fromEntries(data.numbering.map((l) => [l.kind, l.pattern]));
  const saveAll = async (series: Record<string, string>, done: string) => {
    await save.mutateAsync({ series });
    notify.success(done);
  };
  const allFy = data.numbering.every((l) => l.pattern === `${l.kind}/{FY}/{NNNN}`);
  const columns: TableProps<DocSeriesLineDto>['columns'] = [
    { key: 'label', title: 'Document', dataIndex: 'label', render: (v: string, l) => (
      <Flex gap={tk.space[2]} align="center" wrap>
        {v}
        {l.standard ? null : <AppTag variant="kind">Your pattern</AppTag>}
      </Flex>
    ) },
    { key: 'pattern', title: 'Pattern', dataIndex: 'pattern', render: (v: string) => <DocNo value={v} />, responsive: ['md'] },
    { key: 'example', title: 'First number', dataIndex: 'example', render: (v: string) => <DocNo value={v} /> },
    { key: 'restarts', title: 'Starts again', dataIndex: 'restarts', responsive: ['lg'] },
    {
      key: 'edit',
      title: <span className="visually-hidden">Edit</span>,
      width: 56,
      align: 'right',
      render: (_, l) => <Button type="text" icon={<EditOutlined />} aria-label={`Edit the pattern of ${l.label.toLowerCase()}`} onClick={() => setEditing(l)} />,
    },
  ];
  return (
    <Section
      title={<Flex align="center" gap={tk.space[1]}>Number series<Help>Each kind of document is numbered by its own pattern. A number already given never changes; a new pattern applies to the next one.</Help></Flex>}
      extra={
        <Popconfirm
          title={allFy ? 'Go back to the standard patterns?' : 'Number everything by financial year?'}
          description={allFy ? 'Each kind numbers as PO-2026-0001 again.' : 'Each kind numbers as PO/26-27/0001, starting again each April.'}
          okText={allFy ? 'Use the standard' : 'Use the financial year'}
          onConfirm={() =>
            saveAll(
              Object.fromEntries(data.numbering.map((l) => [l.kind, allFy ? standardDocPattern(l.kind) : `${l.kind}/{FY}/{NNNN}`])),
              allFy ? 'Numbering back to the standard' : 'Numbering by financial year',
            )
          }
        >
          <Button loading={save.isPending}>{allFy ? 'Use the standard patterns' : 'Number by financial year'}</Button>
        </Popconfirm>
      }
    >
      <Table<DocSeriesLineDto> rowKey="kind" size="small" pagination={false} columns={columns} dataSource={data.numbering} onRow={(l) => ({ onClick: () => setEditing(l), style: { cursor: 'pointer' } })} />
      <PatternDialog
        line={editing}
        onClose={() => setEditing(null)}
        onSave={async (kind, pattern) => {
          await save.mutateAsync({ series: { ...current, [kind]: pattern } });
          notify.success(`${editing?.label ?? kind}: ${formatDocNo(pattern, todayDate(), 1)} next`);
        }}
      />
    </Section>
  );
}

/** Every other setting, by what it is about, each a link to its own page. */
const MORE: { title: string; ids: string[] }[] = [
  { title: 'People and access', ids: ['admin.users', 'admin.rules', 'admin.positions', 'admin.group', 'admin.home'] },
  { title: 'Menu and modules', ids: ['admin.modules', 'admin.menu', 'admin.masters'] },
  { title: 'Departments', ids: ['payroll.settings', 'correspondence.numbering', 'admin.ai'] },
  { title: 'Data and systems', ids: ['admin.connections', 'admin.audit', 'admin.data', 'admin.billing'] },
];

function MoreTab() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <SectionStack>
      {MORE.map((g) => {
        const nodes = g.ids.map((id) => navNode(id)).filter((n): n is NonNullable<typeof n> => !!n && !!n.route && canSeeNav(user, n));
        if (!nodes.length) return null;
        return (
          <Section key={g.title} title={g.title}>
            <ul aria-label={g.title} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
              {nodes.map((n) => {
                const Icon = navIcon(n.icon);
                return (
                  <li key={n.id} style={{ borderTop: `1px solid ${tk.color.line.hairline}` }}>
                    <Link href={n.route!} style={{ display: 'flex', alignItems: 'center', gap: tk.space[3], minHeight: 56, padding: `${tk.space[2]} 0`, color: tk.color.text.base }}>
                      <Icon aria-hidden />
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', ...tk.type.strong }}>{n.label}</span>
                        <span style={{ display: 'block', ...tk.type.caption, color: tk.color.text.muted }}>{n.description}</span>
                      </span>
                      <RightOutlined aria-hidden style={{ color: tk.color.text.faint }} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Section>
        );
      })}
    </SectionStack>
  );
}

/** Settings › Company (ARCHITECTURE "Company settings"): the letterhead, the logo, the number series, and every other setting. */
export function CompanySettings() {
  const { user } = useAuth();
  const allowed = !!user && canManageCompanyData(user.roleKey);
  const { data, isLoading, error, refetch } = useCompanySettings(allowed);
  const [tab, setTab] = useUrlTab<Tab>(TABS, 'company', { param: 'tab' });
  if (!allowed) return <NoAccess title="Only an admin can change the company settings" />;
  if (isLoading) return <PageSkeleton shape="record" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;
  return (
    <div className="page-container">
      <PageHeader title="Company settings" help="The details and logo every printed paper carries, how each kind of document is numbered, the fields of your own on vendors, projects and orders, and the way to every other setting." />
      <Card size="small">
        <AppTabs
          variant="page"
          activeKey={tab}
          onChange={(k) => setTab(k as Tab)}
          items={[
            { key: 'company', label: 'Company', children: <CompanyTab data={data} /> },
            { key: 'numbering', label: 'Numbering', children: <NumberingTab data={data} /> },
            ...(user && canManageCustomFields(user.roleKey) ? [{ key: 'fields', label: 'Fields', children: <CustomFieldsSettings /> }] : []),
            { key: 'more', label: 'Other settings', children: <MoreTab /> },
          ]}
        />
      </Card>
    </div>
  );
}

