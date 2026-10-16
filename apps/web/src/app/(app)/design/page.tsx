'use client';

import React from 'react';
import { Alert, Button, Card, Col, ConfigProvider, DatePicker, Descriptions, Empty, Flex, Input, InputNumber, Progress, Row, Segmented, Select, Space, Statistic, Steps, Table, Tag, Typography, theme } from 'antd';
import { CheckOutlined, PlusOutlined } from '@ant-design/icons';
import { SUBMISSION_STATUSES } from '@erp/shared';
import { PageHeader } from '@/components/common/PageHeader';
import { StatusTag } from '@/components/common/StatusTag';
import { BRAND } from '@/lib/brand';
import { approveTheme } from '@/lib/theme';
import { formatINR } from '@/lib/format';
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
  const { prefs, setPrefs } = useAppearance();

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

        <Card title="Type" size="small">
          {([1, 2, 3, 4, 5] as const).map((level) => (
            <Typography.Title key={level} level={level} style={{ marginTop: 0 }}>
              Heading {level}: District Hospital Block B
            </Typography.Title>
          ))}
          <Typography.Paragraph>Body text: RCC slab GF continued, shuttering for the next pour, 34 workers on site.</Typography.Paragraph>
          <Space size={token.marginLG} wrap>
            <Typography.Text type="secondary">Secondary</Typography.Text>
            <Typography.Text type="success">Success</Typography.Text>
            <Typography.Text type="warning">Warning</Typography.Text>
            <Typography.Text type="danger">Danger</Typography.Text>
            <Typography.Link>Link</Typography.Link>
            <span className="mono">{formatINR('18650000')}</span>
          </Space>
        </Card>

        <Card title="Actions and status" size="small">
          <Flex wrap gap={token.marginSM} style={{ marginBottom: token.margin }}>
            <Button type="primary" icon={<PlusOutlined />}>
              New DPR
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
              <Statistic title="Total contract value" value="₹ 59.27 Cr" />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <Statistic title="Pending approvals" value={34} styles={{ content: { color: token.colorWarningText } }} />
            </Card>
          </Col>
          <Col xs={24} md={8}>
            <Card size="small">
              <Typography.Text type="secondary">Physical progress</Typography.Text>
              <Progress percent={31.5} />
            </Card>
          </Col>
        </Row>

        <Card title="Form" size="small">
          <Row gutter={[token.margin, token.margin]}>
            <Col xs={24} md={8}>
              <Input placeholder="Search work, issues, people" />
            </Col>
            <Col xs={24} md={8}>
              <Select style={{ width: '100%' }} placeholder="All projects" options={[{ value: 'a', label: 'Bhubaneswar - Puri Highway' }]} />
            </Col>
            <Col xs={12} md={4}>
              <DatePicker style={{ width: '100%' }} />
            </Col>
            <Col xs={12} md={4}>
              <InputNumber style={{ width: '100%' }} placeholder="Qty" />
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
                <Alert type="error" showIcon title="Vendor payable ₹ 13.26 L overdue" />
                <Empty description="No entries yet" />
              </Space>
            </Card>
          </Col>
        </Row>
      </Space>
    </div>
  );
}
