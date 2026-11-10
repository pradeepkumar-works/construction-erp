'use client';

import React, { useRef, useState } from 'react';
import { App, Button, Card, Col, Flex, Form, Grid, Input, Popconfirm, Row, Segmented, Select, Typography } from 'antd';
import type { TextAreaRef } from 'antd/es/input/TextArea';
import type { HrLetterKind, HrLetterTemplateDto, LetterValues } from '@erp/shared';
import { LETTER_FIELDS, LETTER_FIELD_KEYS, fillLetter, letterTemplateProblem } from '@erp/shared';
import { tk } from '@/ds';
import { AppTag } from '@/components/common/AppTag';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { Section } from '@/components/common/Section';
import { errorMessage } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/format';
import { useHrLetterTemplates, useSaveHrLetterTemplate } from '@/lib/queries';

/** Made-up facts the preview fills in, so a change reads as a real letter. */
const SAMPLE: LetterValues = {
  name: 'Asha Rao',
  code: 'EMP-030',
  designation: 'Site engineer',
  oldDesignation: 'Junior engineer',
  newDesignation: 'Site engineer',
  changedDesignation: 'Site engineer',
  department: 'Projects',
  company: 'your company',
  date: '01 Apr 2026',
  joinedOn: '01 Apr 2024',
  leftOn: '31 Mar 2026',
  postedAt: 'Puri Highway',
  fromSite: 'Cuttack Bridge',
  toSite: 'Puri Highway',
  ctc: '₹ 4,80,000 a year',
  oldCtc: '₹ 4,20,000 a year',
  probationEnds: '30 Sep 2026',
  noticeDays: '30',
  noticeGivenOn: '01 Mar 2026',
  note: 'The note recorded with the event prints here.',
};

/** One letter's words: the editor, the fields it may use and a preview with made-up facts. */
function LetterEditor({ t }: { t: HrLetterTemplateDto }) {
  const [form] = Form.useForm<{ body: string }>();
  const { message } = App.useApp();
  const save = useSaveHrLetterTemplate();
  const area = useRef<TextAreaRef>(null);
  const body = Form.useWatch('body', form) ?? t.body;
  const problem = letterTemplateProblem(body);
  const { user } = useAuth();
  const preview = problem ? [] : fillLetter(body, { ...SAMPLE, company: user?.organizationName ?? SAMPLE.company });

  const insert = (field: string) => {
    const el = area.current?.resizableTextArea?.textArea;
    const text = form.getFieldValue('body') ?? '';
    const at = el?.selectionStart ?? text.length;
    const end = el?.selectionEnd ?? at;
    form.setFieldValue('body', `${text.slice(0, at)}{${field}}${text.slice(end)}`);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(at + field.length + 2, at + field.length + 2);
    });
  };

  const submit = (next: string | null, done: string) =>
    save
      .mutateAsync({ kind: t.kind, body: next })
      .then((all) => {
        form.setFieldValue('body', all.find((x) => x.kind === t.kind)?.body ?? next ?? '');
        message.success(done);
      })
      .catch((err) => message.error(errorMessage(err, 'The letter could not be saved. Try again.')));

  return (
    <Flex vertical gap={tk.space[4]}>
      <Section
        title={t.title}
        extra={<AppTag variant="kind">{t.isStandard ? 'Standard words' : "Your company's words"}</AppTag>}
      >
        <Typography.Paragraph type="secondary">
          Paragraphs are split by a blank line. A field in curly brackets prints the person&apos;s fact; words in square brackets print only when every field inside
          them has a value, and a paragraph whose field is empty is left out.
          {t.updatedByName && ` Last changed by ${t.updatedByName}, ${formatDateTime(t.updatedAt)}.`}
        </Typography.Paragraph>
        <Form form={form} layout="vertical" initialValues={{ body: t.body }} onFinish={(v) => submit(v.body, `${t.title} saved. Letters print with these words from now on.`)}>
          <Form.Item
            name="body"
            label="Words of the letter"
            rules={[{ validator: (_, v: string) => (letterTemplateProblem(v ?? '') ? Promise.reject(new Error(letterTemplateProblem(v ?? '')!)) : Promise.resolve()) }]}
          >
            <Input.TextArea ref={area} autoSize={{ minRows: 10, maxRows: 24 }} maxLength={6000} spellCheck />
          </Form.Item>
          <Flex gap={tk.space[2]} wrap>
            <Button type="primary" htmlType="submit" loading={save.isPending} disabled={body === t.body}>
              Save
            </Button>
            {body !== t.body && <Button onClick={() => form.setFieldValue('body', t.body)}>Undo changes</Button>}
            {!t.isStandard && (
              <Popconfirm
                title="Go back to the standard words?"
                description="Your company's words for this letter are removed."
                okText="Use the standard words"
                cancelText="Keep mine"
                onConfirm={() => submit(null, `${t.title} prints the standard words again.`)}
              >
                <Button>Use the standard words</Button>
              </Popconfirm>
            )}
          </Flex>
        </Form>
      </Section>
      <Section title="Fields">
        <Typography.Paragraph type="secondary">Choose one to put it where the cursor is.</Typography.Paragraph>
        <Flex gap={tk.space[2]} wrap>
          {LETTER_FIELD_KEYS.map((f) => (
            <Button key={f} size="small" onClick={() => insert(f)} title={LETTER_FIELDS[f]} aria-label={`Insert ${LETTER_FIELDS[f].toLowerCase()}`}>
              <span translate="no">{`{${f}}`}</span>
            </Button>
          ))}
        </Flex>
      </Section>
      <Section title="Preview">
        {problem ? (
          <Typography.Text type="danger">{problem}</Typography.Text>
        ) : (
          <div translate="no">
            {preview.map((p, i) => (
              <Typography.Paragraph key={i}>{p}</Typography.Paragraph>
            ))}
          </div>
        )}
      </Section>
    </Flex>
  );
}

/** HR letter templates: the words of each letter, from the offer to the experience certificate, the company's own or the standard. */
export function LetterTemplates() {
  const { data, isLoading, error, refetch } = useHrLetterTemplates();
  const wide = Grid.useBreakpoint().md;
  const [kind, setKind] = useState<HrLetterKind>('OFFERED');
  if (isLoading) return <PageSkeleton shape="workspace" />;
  if (error || !data) return <QueryError error={error} onRetry={() => refetch()} />;
  const t = data.find((x) => x.kind === kind) ?? data[0];
  const own = data.filter((x) => !x.isStandard).length;
  const label = (x: HrLetterTemplateDto) => (x.isStandard ? x.title : `${x.title} (yours)`);
  return (
    <div className="page-container">
      <PageHeader
        title="Letter templates"
        help={`The words each HR letter prints, from the offer to the experience certificate. ${own ? `${own} of ${data.length} use your company's words.` : 'All use the standard words.'}`}
        crumbs={[{ title: 'HR and payroll', href: '/modules/people' }, { title: 'Letter templates' }]}
      />
      <Card>
        <Row gutter={[tk.space[5], tk.space[4]]}>
          <Col xs={24} md={7}>
            {wide ? (
              <Segmented
                vertical
                block
                aria-label="Letters"
                value={t.kind}
                onChange={(v) => setKind(v as HrLetterKind)}
                options={data.map((x) => ({ value: x.kind, label: label(x) }))}
              />
            ) : (
              <Select aria-label="Letter" value={t.kind} onChange={setKind} options={data.map((x) => ({ value: x.kind, label: label(x) }))} style={{ width: '100%' }} />
            )}
          </Col>
          <Col xs={24} md={17}>
            <LetterEditor key={t.kind} t={t} />
          </Col>
        </Row>
      </Card>
    </div>
  );
}
