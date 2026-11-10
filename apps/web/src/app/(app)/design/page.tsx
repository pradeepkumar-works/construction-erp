'use client';

import React from 'react';
import { Alert, Button, Card, Col, ConfigProvider, Descriptions, Empty, Flex, Input, InputNumber, Progress, Row, Segmented, Select, Statistic, Table, Typography } from 'antd';
import { tk } from '@/ds';
import { useResolved } from '@/ds/react';
import { TYPE, type TypeName } from '@/ds/source/scales';
import { DatePicker } from '@/components/common/DatePicker';
import { StageBar } from '@/components/record/StageBar';
import { AppTag } from '@/components/common/AppTag';
import { CheckCircleFilled, CheckOutlined, CloseCircleFilled, EditOutlined, PlusOutlined } from '@/components/common/icons';
import { PRODUCT_NAME, SUBMISSION_STATUSES } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusTag } from '@/components/common/StatusTag';
import { BRAND } from '@/lib/brand';
import { approveTheme, makeTheme } from '@/lib/theme';
import { Section } from '@/components/common/Section';
import { formatINR, formatINRCompact } from '@/lib/format';
import { useAppearance, type Density, type ThemeMode } from '@/lib/appearance';
import { Money } from '@/components/common/Money';

/** The colour roles worth seeing side by side in each mode, by their place in `tk.color`. */
const SWATCHES = [
  { group: 'Surface', roles: ['surface.canvas', 'surface.base', 'surface.sunken', 'surface.inverse'] },
  { group: 'Text', roles: ['text.strong', 'text.base', 'text.muted', 'text.faint', 'text.link'] },
  { group: 'Line', roles: ['line.hairline', 'line.base', 'line.focus'] },
  { group: 'Action, accent and AI', roles: ['action.solid', 'accent.solid', 'accent.soft', 'ai.mark'] },
  { group: 'Tones (text)', roles: ['tone.info.fg', 'tone.pending.fg', 'tone.success.fg', 'tone.danger.fg', 'tone.violet.fg'] },
  { group: 'Shell', roles: ['chrome.bg', 'chrome.ink'] },
] as const;

/** A role's value by its dotted place in a colour tree (`tk.color` gives the CSS variable, `useResolved().color` the hex). */
const roleAt = (tree: object, role: string) => role.split('.').reduce<unknown>((node, key) => (node as Record<string, unknown>)[key], tree) as string;

/** Where each style of the type scale is used. Twelve px is the floor, in either density. */
const TYPE_USE: Record<TypeName, string> = {
  display: 'The largest title, used sparingly (the sign-in title)',
  heading: "A page's title (its h1)",
  figure: 'A headline figure (tabular)',
  subhead: "A card's figure or a panel's lead line",
  title: 'Card, section and dialog titles',
  lead: 'A lead paragraph; a total that leads a block',
  strong: 'Body text that needs weight: a label beside its value',
  body: 'Body text, table cells, fields and buttons',
  label: 'Field labels, table headers, tags',
  caption: 'Captions, secondary lines under a figure and hints. Nothing is smaller',
};
const TYPE_ORDER: TypeName[] = ['display', 'heading', 'figure', 'subhead', 'title', 'lead', 'strong', 'body', 'label', 'caption'];

/** A control with its height as drawn, measured in the page. */
function Measured({ children }: { children: React.ReactNode }) {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [height, setHeight] = React.useState<number | null>(null);
  React.useLayoutEffect(() => {
    const el = ref.current?.firstElementChild;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setHeight(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <Flex align="center" gap={tk.space[2]}>
      <span ref={ref} style={{ display: 'inline-flex' }}>
        {children}
      </span>
      <Typography.Text type="secondary" className="mono" style={{ fontSize: tk.type.caption.fontSize }}>
        {height ?? '…'} px
      </Typography.Text>
    </Flex>
  );
}

/** One density's controls, drawn with that density's theme. */
function TargetSample({ label }: { label: string }) {
  return (
    <Flex vertical gap={tk.space[3]} align="flex-start">
      <Typography.Text strong>{label}</Typography.Text>
      <Measured>
        <Button size="small" icon={<EditOutlined />} aria-label={`Edit, ${label.toLowerCase()} small`} />
      </Measured>
      <Measured>
        <Button size="small">Small button</Button>
      </Measured>
      <Measured>
        <Button type="primary">Middle button</Button>
      </Measured>
      <Measured>
        <Input placeholder="Field" aria-label={`${label} field`} style={{ width: '12.5rem' }} />
      </Measured>
      <Measured>
        <Segmented size="small" options={['Small', 'Segmented']} aria-label={`${label} small segmented`} />
      </Measured>
      <Measured>
        <Segmented options={['Middle', 'Segmented']} aria-label={`${label} segmented`} />
      </Measured>
    </Flex>
  );
}

const rows = [
  { key: '1', item: 'RCC M25 in slab and beams', unit: 'Cum', qty: '420', amount: '3402000' },
  { key: '2', item: 'Brick masonry in CM 1:6', unit: 'Cum', qty: '980', amount: '6076000' },
  { key: '3', item: 'Vitrified tile flooring 600x600', unit: 'Sqm', qty: '6800', amount: '7820000' },
];

/**
 * The design reference: the colour roles, the type scale and the main components in the current appearance, all read
 * from the design tokens (`@/ds`, docs/design/REDESIGN.md).
 * Not in the sidebar; staff open /design to check a theme change in light, dark and compact before it ships.
 */
export default function DesignPage() {
  const { user } = useAuth();
  if (!user) return null;
  if (!user.platformAdmin || user.support)
    return (
      <div className="page-container">
        <PageHeader title="Design reference" />
        <Alert type="info" title={`This page is for ${PRODUCT_NAME} staff.`} />
      </div>
    );
  return <DesignReference />;
}

function DesignReference() {
  const r = useResolved();
  const { prefs, setPrefs, dark } = useAppearance();

  return (
    <div className="page-container">
      <PageHeader
        title="Design reference"
        help={`The ${BRAND.name} design tokens: colour roles, type and components in the appearance you have chosen`}
        extra={
          <>
            <Segmented<ThemeMode>
              value={prefs.mode}
              onChange={(mode) => setPrefs({ mode })}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
                { value: 'system', label: 'Device' },
              ]}
            />
            <Segmented<Density>
              value={prefs.density}
              onChange={(density) => setPrefs({ density })}
              options={[
                { value: 'comfortable', label: 'Comfortable' },
                { value: 'compact', label: 'Compact' },
              ]}
            />
          </>
        }
      />
      <Flex vertical gap={tk.space[6]}>
        <Card title="Colour roles" size="small">
          <Typography.Paragraph type="secondary">
            Every colour is a role in <Typography.Text code>tk.color</Typography.Text>, which follows the theme with no hook. A canvas or an antd
            number reads <Typography.Text code>useResolved()</Typography.Text>; print and email read <Typography.Text code>PRINT</Typography.Text>.
          </Typography.Paragraph>
          <Flex vertical gap={tk.space[4]}>
            {SWATCHES.map(({ group, roles }) => (
              <div key={group}>
                <Typography.Text strong style={{ display: 'block', marginBottom: tk.space[2] }}>
                  {group}
                </Typography.Text>
                <Row gutter={[r.space[3], r.space[3]]}>
                  {roles.map((role) => (
                    <Col key={role} xs={12} sm={8} md={6} lg={4}>
                      <div data-token={role} style={{ height: tk.space[12], borderRadius: tk.radius.md, background: roleAt(tk.color, role), border: tk.line('hairline') }} />
                      <Typography.Text className="mono" translate="no" style={{ ...tk.type.caption, display: 'block', marginTop: tk.space[1] }}>
                        {role}
                      </Typography.Text>
                      <Typography.Text type="secondary" className="mono" translate="no" style={tk.type.caption}>
                        {roleAt(r.color, role)}
                      </Typography.Text>
                    </Col>
                  ))}
                </Row>
              </div>
            ))}
          </Flex>
        </Card>

        <Card title="Type scale" size="small">
          <Typography.Paragraph type="secondary">
            Inter in ten styles, 12 px the floor. Compact keeps them; only heights and spacing shrink. In code spread the style (
            <Typography.Text code>{'...tk.type.label'}</Typography.Text>) or take its size (<Typography.Text code>tk.type.label.fontSize</Typography.Text>);
            in CSS read its variable (<Typography.Text code>var(--t-label)</Typography.Text>). Never a number.
          </Typography.Paragraph>
          <Table
            size="small"
            pagination={false}
            rowKey="name"
            scroll={{ x: 'max-content' }}
            dataSource={TYPE_ORDER.map((name) => ({ name, ...TYPE[name], use: TYPE_USE[name] }))}
            columns={[
              { title: 'Size', dataIndex: 'size', width: 70, align: 'right', render: (v: number) => <span className="mono" translate="no">{v} px</span> },
              { title: 'Weight', dataIndex: 'weight', width: 70, align: 'right', render: (v: number) => <span className="mono" translate="no">{v}</span> },
              {
                title: 'Style',
                dataIndex: 'name',
                width: 200,
                render: (name: TypeName) => (
                  <>
                    <Typography.Text code>tk.type.{name}</Typography.Text>
                    <div className="text-muted mono" translate="no" style={tk.type.caption}>
                      var(--t-{name})
                    </div>
                  </>
                ),
              },
              { title: 'Use', dataIndex: 'use' },
              { title: 'Sample', key: 'sample', render: (_, t) => <span style={tk.type[t.name]}>Hospital Block B</span> },
            ]}
          />
          <Typography.Paragraph style={{ marginTop: tk.space[4], marginBottom: 0 }}>
            Headings: level 1 is {tk.type.display.fontSize} px, 2 is {tk.type.heading.fontSize}, 3 is {tk.type.subhead.fontSize}, 4 is {tk.type.lead.fontSize} and 5 is{' '}
            {tk.type.body.fontSize}. A page title is an h1 drawn at {tk.type.heading.fontSize} px.
          </Typography.Paragraph>
          <Flex gap={tk.space[6]} wrap style={{ marginTop: tk.space[3] }}>
            <Typography.Text type="secondary">Secondary</Typography.Text>
            <Typography.Text type="success">Success</Typography.Text>
            <Typography.Text type="warning">Warning</Typography.Text>
            <Typography.Text type="danger">Danger</Typography.Text>
            <Typography.Link href="/design">Link</Typography.Link>
            <Money value={'18650000'} />
          </Flex>
        </Card>

        <Card title="Targets" size="small">
          <Typography.Paragraph type="secondary">
            Every control is at least 24 px high (WCAG 2.5.8) in both densities, and 44 px on a touch screen. Icon buttons side by side keep a gap
            between them.
          </Typography.Paragraph>
          <Row gutter={[r.space[6], r.space[4]]}>
            <Col xs={24} md={12}>
              <ConfigProvider theme={makeTheme({ dark, compact: false })}>
                <TargetSample label="Comfortable" />
              </ConfigProvider>
            </Col>
            <Col xs={24} md={12}>
              <ConfigProvider theme={makeTheme({ dark, compact: true })}>
                <TargetSample label="Compact" />
              </ConfigProvider>
            </Col>
          </Row>
        </Card>

        <Card title="Colour for exceptions" size="small">
          <Typography.Paragraph type="secondary">
            Numbers are neutral text. Colour marks only an exception: late, overdue, over budget, rejected, a fall that matters. A figure that is just a
            total or a count stays neutral. Tags keep their status colours, since they carry a word too. Coloured text is a tone's text role (
            <Typography.Text code>tk.color.tone.danger.fg</Typography.Text>), never its <Typography.Text code>solid</Typography.Text> fill.
          </Typography.Paragraph>
          <Row gutter={[r.space[6], r.space[4]]}>
            <Col xs={24} md={12}>
              <Flex align="center" gap={tk.space[2]} style={{ marginBottom: tk.space[3] }}>
                <CheckCircleFilled style={{ color: tk.color.tone.success.solid }} aria-hidden />
                <Typography.Text strong>Correct</Typography.Text>
              </Flex>
              <Row gutter={[r.space[4], r.space[4]]}>
                <Col span={8}>
                  <Statistic title="Contract value" value={formatINRCompact(592700000)} styles={{ content: { fontSize: tk.type.subhead.fontSize } }} />
                </Col>
                <Col span={8}>
                  <Statistic title="Pending approvals" value={34} styles={{ content: { fontSize: tk.type.subhead.fontSize } }} />
                </Col>
                <Col span={8}>
                  <Statistic title="Vendor payable" value={formatINRCompact(18400000)} styles={{ content: { fontSize: tk.type.subhead.fontSize, color: tk.color.tone.danger.fg } }} />
                  <Typography.Text type="danger" style={{ fontSize: tk.type.caption.fontSize }}>
                    {formatINRCompact(1326000)} overdue
                  </Typography.Text>
                </Col>
              </Row>
            </Col>
            <Col xs={24} md={12}>
              <Flex align="center" gap={tk.space[2]} style={{ marginBottom: tk.space[3] }}>
                <CloseCircleFilled style={{ color: tk.color.tone.danger.solid }} aria-hidden />
                <Typography.Text strong>Incorrect</Typography.Text>
              </Flex>
              <Row gutter={[r.space[4], r.space[4]]}>
                <Col span={8}>
                  <Statistic title="Contract value" value={formatINRCompact(592700000)} styles={{ content: { fontSize: tk.type.subhead.fontSize, color: tk.color.tone.success.fg } }} />
                </Col>
                <Col span={8}>
                  <Statistic title="Pending approvals" value={34} styles={{ content: { fontSize: tk.type.subhead.fontSize, color: tk.color.tone.pending.fg } }} />
                </Col>
                <Col span={8}>
                  <Statistic title="Vendor payable" value={formatINRCompact(18400000)} styles={{ content: { fontSize: tk.type.subhead.fontSize, color: tk.color.accent.text } }} />
                  <Typography.Text type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
                    the overdue part gets lost
                  </Typography.Text>
                </Col>
              </Row>
            </Col>
          </Row>
        </Card>

        <Card title="No cards inside cards" size="small">
          <Typography.Paragraph type="secondary">
            A card is one surface. Its parts are sections: a hairline (<Typography.Text code>tk.line('hairline')</Typography.Text>) above, a title
            and the content (<Typography.Text code>Section</Typography.Text> and <Typography.Text code>FigureBlock</Typography.Text> in
            components/common/Section.tsx). A project tab and a record are already a surface, so the blocks in them are sections, never cards of their
            own.
          </Typography.Paragraph>
          <Row gutter={[r.space[6], r.space[4]]}>
            <Col xs={24} md={12}>
              <Flex vertical gap={tk.space[4]}>
                <Section title="Agreement" extra={<Button size="small">Edit</Button>}>
                  <Descriptions size="small" column={2} items={[{ label: 'Work order', children: 'WO/OWD/2025/0417' }, { label: 'Contract value', children: formatINR('186500000') }]} />
                </Section>
                <Section title="Extensions of time">
                  <Typography.Text type="secondary">No extension claimed.</Typography.Text>
                </Section>
              </Flex>
            </Col>
            <Col xs={24} md={12}>
              <Typography.Paragraph>
                Not a card with a border and a header inside another card: two frames around the same content, and a second header that competes with the
                first.
              </Typography.Paragraph>
            </Col>
          </Row>
        </Card>

        <Card title="Actions and status" size="small">
          <Flex wrap gap={tk.space[3]} style={{ marginBottom: tk.space[4] }}>
            <Button type="primary" icon={<PlusOutlined />}>
              New daily report
            </Button>
            <Button>Export</Button>
            <Button type="dashed">Add line</Button>
            <Button type="text">Text</Button>
            <Button type="link">Link</Button>
            <Button danger>Reject</Button>
            <ConfigProvider theme={approveTheme}>
              <Button type="primary" icon={<CheckOutlined />}>
                Approve
              </Button>
            </ConfigProvider>
          </Flex>
          <Flex wrap gap={tk.space[2]}>
            {SUBMISSION_STATUSES.map((s) => (
              <StatusTag key={s} status={s} />
            ))}
            <AppTag variant="kind">Building</AppTag>
            <AppTag variant="kind">Road / Infrastructure</AppTag>
          </Flex>
        </Card>

        <Row gutter={[r.space[4], r.space[4]]}>
          <Col xs={24} md={8}>
            <Card size="small">
              <Statistic title="Total contract value" value={formatINRCompact(592700000)} />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <Statistic title="Pending approvals" value={34} />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <Typography.Text type="secondary">Physical progress</Typography.Text>
              <Progress percent={31.5} aria-label="Example progress" />
            </Card>
          </Col>
        </Row>

        <Card title="Form" size="small">
          <Row gutter={[r.space[4], r.space[4]]}>
            <Col xs={24} md={8}>
              <Input placeholder="Search work, issues, people" aria-label="Search" />
            </Col>
            <Col xs={24} md={8}>
              <Select style={{ width: '100%' }} placeholder="All projects" aria-label="Project" options={[{ value: 'a', label: 'Bhubaneswar - Puri Highway' }]} />
            </Col>
            <Col xs={12} md={4}>
              <DatePicker style={{ width: '100%' }} aria-label="Date" />
            </Col>
            <Col xs={12} md={4}>
              <InputNumber style={{ width: '100%' }} placeholder="Qty" aria-label="Quantity" />
            </Col>
          </Row>
        </Card>

        <Card title="Table" size="small" styles={{ body: { padding: 0 } }}>
          <Table
            pagination={false}
            dataSource={rows}
            columns={[
              { title: 'Item', dataIndex: 'item' },
              { title: 'Unit', dataIndex: 'unit', width: 80 },
              { title: 'Qty', dataIndex: 'qty', align: 'right', width: 100 },
              { title: 'Amount', dataIndex: 'amount', align: 'right', width: 160, render: (v: string) => formatINR(v) },
            ]}
          />
        </Card>

        <Row gutter={[r.space[4], r.space[4]]}>
          <Col xs={24} md={12}>
            <Card title="Record" size="small">
              <StageBar
                current={2}
                items={[{ title: 'Draft' }, { title: 'Submitted' }, { title: 'Approved' }, { title: 'Certified' }, { title: 'Paid' }]}
                style={{ marginBottom: tk.space[4] }}
              />
              <Descriptions size="small" bordered column={1} items={[{ label: 'Bill', children: 'RA bill 1' }, { label: 'Net payable', children: formatINR('2498618') }]} />
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title="Messages and empty" size="small">
              <Flex vertical gap={tk.space[2]}>
                <Alert type="info" showIcon title="1 transfer on the way" />
                <Alert type="warning" showIcon title="2 activities are delayed" />
                <Alert type="error" showIcon title={`Vendor payable ${formatINRCompact(1326000)} overdue`} />
                <Empty description="No entries yet" />
              </Flex>
            </Card>
          </Col>
        </Row>
      </Flex>
    </div>
  );
}
