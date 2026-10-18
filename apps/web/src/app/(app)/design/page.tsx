'use client';

import React from 'react';
import { Alert, Button, Card, Col, ConfigProvider, DatePicker, Descriptions, Empty, Flex, Input, InputNumber, Progress, Row, Segmented, Select, Space, Statistic, Steps, Table, Tag, Typography, theme } from 'antd';
import { CheckCircleFilled, CheckOutlined, CloseCircleFilled, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { SUBMISSION_STATUSES } from '@erp/shared';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusTag } from '@/components/common/StatusTag';
import { BRAND } from '@/lib/brand';
import { approveTheme, makeTheme, themeFontSize } from '@/lib/theme';
import { Section } from '@/components/common/Section';
import { formatINR, formatINRCompact } from '@/lib/format';
import { useAppearance, type Density, type ThemeMode } from '@/lib/appearance';

/** Semantic tokens worth seeing side by side in each mode. */
const TOKENS = [
  'colorPrimary',
  'colorLink',
  'colorSuccess',
  'colorWarning',
  'colorError',
  'colorText',
  'colorTextSecondary',
  'colorTextTertiary',
  'colorBgLayout',
  'colorBgContainer',
  'colorBgElevated',
  'colorBorder',
  'colorBorderSecondary',
  'colorFillSecondary',
] as const;

/** The type scale (UX item 82): every size on screen is one of these, 12 px the floor, in either density. */
const TYPE_SCALE = [
  { token: 'fontSizeHeading1', alias: '', use: 'The largest heading, used sparingly (the sign-in title)' },
  { token: 'fontSizeHeading2', alias: '', use: "A page's title (its h1) and the KPI figures on Home" },
  { token: 'fontSizeXL', alias: 'fontSizeHeading3', use: 'Figures inside a tab, such as cost or safety totals' },
  { token: 'fontSizeLG', alias: 'fontSizeHeading4', use: 'Card, section and dialog titles; a total that leads a block' },
  { token: 'fontSize', alias: 'fontSizeHeading5', use: 'Body text, table cells, fields and buttons' },
  { token: 'fontSizeSM', alias: '', use: 'Captions, secondary lines under a figure, tags and hints. Nothing is smaller' },
] as const;

const kebab = (key: string) => key.replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase();

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
    <Flex align="center" gap={8}>
      <span ref={ref} style={{ display: 'inline-flex' }}>
        {children}
      </span>
      <Typography.Text type="secondary" className="mono" style={{ fontSize: themeFontSize('fontSizeSM') }}>
        {height ?? '…'} px
      </Typography.Text>
    </Flex>
  );
}

/** One density's controls, drawn with that density's theme. */
function TargetSample({ label }: { label: string }) {
  const { token } = theme.useToken();
  return (
    <Flex vertical gap={token.marginSM} align="flex-start">
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
        <Input placeholder="Field" aria-label={`${label} field`} style={{ width: 200 }} />
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
 * The design reference: every colour token, the type scale and the main components in the current appearance.
 * Not in the sidebar; open /design to check a theme change in light, dark and compact before it ships.
 */
export default function DesignPage() {
  const { token } = theme.useToken();
  const { prefs, setPrefs, dark } = useAppearance();

  return (
    <div className="page-container">
      <PageHeader
        title="Design reference"
        subtitle={`The ${BRAND.name} theme: colour tokens, type and components in the appearance you have chosen`}
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
      <Space orientation="vertical" size={token.marginLG} style={{ width: '100%' }}>
        <Card title="Colour tokens" size="small">
          <Row gutter={[token.marginSM, token.marginSM]}>
            {TOKENS.map((k) => (
              <Col key={k} xs={12} sm={8} md={6} lg={4}>
                <div data-token={k} style={{ height: 48, borderRadius: token.borderRadius, background: token[k], border: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}` }} />
                <Typography.Text style={{ fontSize: token.fontSizeSM, display: 'block', marginTop: 4 }}>{k}</Typography.Text>
                <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                  {String(token[k])}
                </Typography.Text>
              </Col>
            ))}
          </Row>
        </Card>

        <Card title="Type scale" size="small">
          <Typography.Paragraph type="secondary">
            Six sizes, 12 px the floor. Compact keeps them; only heights and spacing shrink. In code use the token (
            <Typography.Text code>token.fontSizeSM</Typography.Text>) or, outside a component and in CSS, its variable (
            <Typography.Text code>var(--ant-font-size-sm)</Typography.Text>), never a number.
          </Typography.Paragraph>
          <Table
            size="small"
            pagination={false}
            rowKey="token"
            dataSource={TYPE_SCALE.map((t) => ({ ...t, px: token[t.token] }))}
            columns={[
              { title: 'Size', dataIndex: 'px', width: 70, align: 'right', render: (v: number) => <span className="mono" translate="no">{v} px</span> },
              {
                title: 'Token',
                dataIndex: 'token',
                width: 260,
                render: (k: string, t) => (
                  <>
                    <Typography.Text code>{k}</Typography.Text>
                    {t.alias ? <Typography.Text code>{t.alias}</Typography.Text> : null}
                    <div className="text-muted mono" translate="no" style={{ fontSize: token.fontSizeSM }}>
                      var(--ant-{kebab(k)})
                    </div>
                  </>
                ),
              },
              { title: 'Use', dataIndex: 'use' },
              { title: 'Sample', key: 'sample', render: (_, t) => <span style={{ fontSize: t.px, lineHeight: 1.3 }}>Hospital Block B</span> },
            ]}
          />
          <Typography.Paragraph style={{ marginTop: token.margin, marginBottom: 0 }}>
            Headings: level 1 is {token.fontSizeHeading1} px, 2 is {token.fontSizeHeading2}, 3 is {token.fontSizeHeading3}, 4 is {token.fontSizeHeading4} and 5 is{' '}
            {token.fontSizeHeading5}. A page title is an h1 drawn at {token.fontSizeHeading2} px.
          </Typography.Paragraph>
          <Space size={token.marginLG} wrap style={{ marginTop: token.marginSM }}>
            <Typography.Text type="secondary">Secondary</Typography.Text>
            <Typography.Text type="success">Success</Typography.Text>
            <Typography.Text type="warning">Warning</Typography.Text>
            <Typography.Text type="danger">Danger</Typography.Text>
            <Typography.Link>Link</Typography.Link>
            <span className="mono" translate="no">{formatINR('18650000')}</span>
          </Space>
        </Card>

        <Card title="Targets" size="small">
          <Typography.Paragraph type="secondary">
            Every control is at least 24 px high (WCAG 2.5.8) in both densities, and 44 px on a touch screen. Icon buttons side by side keep a gap
            between them.
          </Typography.Paragraph>
          <Row gutter={[token.marginLG, token.margin]}>
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
            total or a count stays neutral. Tags keep their status colours, since they carry a word too. Coloured text uses the text tokens (
            <Typography.Text code>colorErrorText</Typography.Text>), never <Typography.Text code>colorWarning</Typography.Text> or{' '}
            <Typography.Text code>colorSuccess</Typography.Text>.
          </Typography.Paragraph>
          <Row gutter={[token.marginLG, token.margin]}>
            <Col xs={24} md={12}>
              <Flex align="center" gap={token.marginXS} style={{ marginBottom: token.marginSM }}>
                <CheckCircleFilled style={{ color: token.colorSuccess }} aria-hidden />
                <Typography.Text strong>Correct</Typography.Text>
              </Flex>
              <Row gutter={[token.margin, token.margin]}>
                <Col span={8}>
                  <Statistic title="Contract value" value={formatINRCompact(592700000)} styles={{ content: { fontSize: token.fontSizeXL } }} />
                </Col>
                <Col span={8}>
                  <Statistic title="Pending approvals" value={34} styles={{ content: { fontSize: token.fontSizeXL } }} />
                </Col>
                <Col span={8}>
                  <Statistic title="Vendor payable" value={formatINRCompact(18400000)} styles={{ content: { fontSize: token.fontSizeXL, color: token.colorErrorText } }} />
                  <Typography.Text type="danger" style={{ fontSize: token.fontSizeSM }}>
                    {formatINRCompact(1326000)} overdue
                  </Typography.Text>
                </Col>
              </Row>
            </Col>
            <Col xs={24} md={12}>
              <Flex align="center" gap={token.marginXS} style={{ marginBottom: token.marginSM }}>
                <CloseCircleFilled style={{ color: token.colorError }} aria-hidden />
                <Typography.Text strong>Incorrect</Typography.Text>
              </Flex>
              <Row gutter={[token.margin, token.margin]}>
                <Col span={8}>
                  <Statistic title="Contract value" value={formatINRCompact(592700000)} styles={{ content: { fontSize: token.fontSizeXL, color: token.colorSuccessText } }} />
                </Col>
                <Col span={8}>
                  <Statistic title="Pending approvals" value={34} styles={{ content: { fontSize: token.fontSizeXL, color: token.colorWarningText } }} />
                </Col>
                <Col span={8}>
                  <Statistic title="Vendor payable" value={formatINRCompact(18400000)} styles={{ content: { fontSize: token.fontSizeXL, color: token.colorPrimaryText } }} />
                  <Typography.Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                    the overdue part gets lost
                  </Typography.Text>
                </Col>
              </Row>
            </Col>
          </Row>
        </Card>

        <Card title="No cards inside cards" size="small">
          <Typography.Paragraph type="secondary">
            A card is one surface. Its parts are sections: a hairline in <Typography.Text code>colorBorderSecondary</Typography.Text> above, a title
            and the content (<Typography.Text code>Section</Typography.Text> and <Typography.Text code>FigureBlock</Typography.Text> in
            components/common/Section.tsx). A project tab and a record are already a surface, so the blocks in them are sections, never cards of their
            own.
          </Typography.Paragraph>
          <Row gutter={[token.marginLG, token.margin]}>
            <Col xs={24} md={12}>
              <Flex vertical gap={token.margin}>
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
          <Flex wrap gap={token.marginSM} style={{ marginBottom: token.margin }}>
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
          <Flex wrap gap={token.marginXS}>
            {SUBMISSION_STATUSES.map((s) => (
              <StatusTag key={s} status={s} />
            ))}
            <Tag color="blue">Building</Tag>
            <Tag color="geekblue">Road / Infrastructure</Tag>
          </Flex>
        </Card>

        <Row gutter={[token.margin, token.margin]}>
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
          <Row gutter={[token.margin, token.margin]}>
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

        <Row gutter={[token.margin, token.margin]}>
          <Col xs={24} md={12}>
            <Card title="Record" size="small">
              <Steps
                size="small"
                current={2}
                items={[{ title: 'Draft' }, { title: 'Submitted' }, { title: 'Approved' }, { title: 'Certified' }, { title: 'Paid' }]}
                style={{ marginBottom: token.margin }}
              />
              <Descriptions size="small" bordered column={1} items={[{ label: 'Bill', children: 'RA bill 1' }, { label: 'Net payable', children: formatINR('2498618') }]} />
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card title="Messages and empty" size="small">
              <Space orientation="vertical" style={{ width: '100%' }}>
                <Alert type="info" showIcon title="1 transfer on the way" />
                <Alert type="warning" showIcon title="2 activities are delayed" />
                <Alert type="error" showIcon title={`Vendor payable ${formatINRCompact(1326000)} overdue`} />
                <Empty description="No entries yet" />
              </Space>
            </Card>
          </Col>
        </Row>
      </Space>
    </div>
  );
}
