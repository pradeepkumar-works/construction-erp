'use client';

import React, { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { App, Button, Card, Descriptions, Empty, Flex, Image, Pagination, Result, Segmented, Select, Switch, Typography, theme } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import { CheckOutlined, CloseOutlined, EditOutlined } from '@/components/common/icons';
import {
  AI_DRAFT_LABELS,
  CAPTURE_GO_LIVE_SHARE,
  CAPTURE_OUTCOME_LABELS,
  INBOUND_STATE_LABELS,
  INBOUND_STATES,
  INBOUND_TYPE_LABELS,
  WHATSAPP_PROVIDER_LABELS,
  canUseWhatsappCapture,
  formatPhone,
  type AiStatusDto,
  type CaptureSetupDto,
  type CaptureStatsDto,
  type InboundMessageDto,
  type InboundState,
} from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { API_URL, errorMessage, fileUrl } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { requestNew } from '@/lib/new-intent';
import { useCaptureMessages, useCaptureSetup, useDecideCapture, useUpdateCaptureSetup } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { LinkButton } from '@/components/common/LinkButton';
import { DRAFT_PAGES } from '@/components/ai/drafts';
import { ResultMark } from '@/components/common/ResultMark';

const STATE_COLOR: Record<InboundState, string> = { RECEIVED: 'default', ANSWERED: 'blue', DRAFTED: 'gold', SAVED: 'green', DISCARDED: 'default', FAILED: 'red' };
const PAGE_SIZE = 10;

const AI_OFF: Record<NonNullable<AiStatusDto['reason']>, string> = {
  COMPANY_OFF: 'Ask Nirmaan is switched off for your company, so messages are not read. An admin can switch it on in Admin, Ask Nirmaan.',
  NOT_CONFIGURED: 'Ask Nirmaan is not set up on this server yet, so messages are not read.',
  CAP_REACHED: "Your company has used this month's Ask Nirmaan allowance, so messages wait until an admin raises it.",
  ROLE_OFF: "Your company's admin has not opened Ask Nirmaan to your role, so your messages are not read.",
  READ_ONLY: 'Your trial or subscription has ended, so messages are not read until it is renewed.',
};

const EXAMPLES = [
  'Raise MR for 50 bags of cement and 2 MT of 12 mm steel for RD-2026-01, needed Friday',
  'Aaj ka DPR: 6 mistri, 10 helper, slab shuttering 2nd floor, 2 ghante baarish se kaam ruka',
  'A photo of the diesel bill with the caption "Diesel 40 litres for the DG set, 3,800 cash"',
];

/**
 * WhatsApp entries (AI item 120): a site person sends a text, a photo with a caption or a voice note to the company's
 * WhatsApp number; Ask Nirmaan drafts the entry it describes and replies with Save and Discard. This page is the switch
 * (messages are read from the mobile number on the profile), how to use it, and every message with what became of it:
 * a draft still waiting can be saved here as it is, opened in its form to change, or discarded.
 */
export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton shape="list" />}>
      <Capture />
    </Suspense>
  );
}

function Capture() {
  const { user } = useAuth();
  const search = useSearchParams();
  const router = useRouter();
  const only = search.get('id') ?? undefined;
  const allowed = !!user && canUseWhatsappCapture(user.roleKey);
  const setup = useCaptureSetup(allowed);
  const [scope, setScope] = useState<'mine' | 'company'>('mine');
  const [state, setState] = useState<InboundState | undefined>(undefined);
  const [page, setPage] = useState(1);
  const list = useCaptureMessages({ scope, state, id: only, page, pageSize: PAGE_SIZE }, allowed);
  const { token } = theme.useToken();

  if (user && !allowed)
    return (
      <>
        <PageHeader title="WhatsApp entries" />
        <Result icon={<ResultMark kind="no-access" />} title="WhatsApp entries are for company staff" />
      </>
    );
  if (!user || setup.isLoading || (list.isLoading && !list.data)) return <PageSkeleton shape="list" />;
  if (setup.error || !setup.data) return <QueryError error={setup.error} onRetry={() => setup.refetch()} />;
  if (list.error || !list.data) return <QueryError error={list.error} onRetry={() => list.refetch()} />;
  const data = list.data;

  return (
    <>
      <PageHeader title="WhatsApp entries" subtitle="Send what happened on site as a text, a photo or a voice note. Nirmaan drafts the entry and you save it with one tap." />
      <Flex vertical gap={token.marginMD}>
        <SetupCard setup={setup.data} />
        <Card size="small" title="Try it">
          <Flex vertical gap={token.marginXS}>
            <Typography.Text type="secondary">Write the way you would to your project manager. Name the project if you work on more than one.</Typography.Text>
            {EXAMPLES.map((e) => (
              <Typography.Text key={e} translate="no">
                “{e}”
              </Typography.Text>
            ))}
            <Typography.Text type="secondary">Nothing is saved until you reply 1 or tap Save. A voice note is written down first: check its figures.</Typography.Text>
          </Flex>
        </Card>

        <Flex wrap gap={token.marginSM} align="center" justify="space-between">
          <Flex wrap gap={token.marginSM} align="center">
            {setup.data.canSeeCompany && (
              <Segmented
                aria-label="Whose messages"
                value={scope}
                onChange={(v) => {
                  setScope(v as 'mine' | 'company');
                  setPage(1);
                }}
                options={[
                  { value: 'mine', label: 'Mine' },
                  { value: 'company', label: 'Everyone' },
                ]}
              />
            )}
            <Select
              aria-label="Show messages that are"
              allowClear
              placeholder="All states"
              style={{ minWidth: 180 }}
              value={state}
              onChange={(v) => {
                setState(v);
                setPage(1);
              }}
              options={INBOUND_STATES.filter((s) => s !== 'RECEIVED').map((s) => ({ value: s, label: INBOUND_STATE_LABELS[s] }))}
            />
            {only && (
              <Button onClick={() => router.replace('/whatsapp-capture')}>Show all messages</Button>
            )}
          </Flex>
          <StatsLine stats={data.stats} />
        </Flex>

        {data.items.length === 0 ? (
          <Card>
            <Empty description={setup.data.enabled ? 'No messages yet. Send one to the company number.' : 'No messages yet. Switch WhatsApp entries on above, then send one.'} />
          </Card>
        ) : (
          data.items.map((m) => <MessageCard key={m.id} m={m} showSender={scope === 'company'} picked={m.id === only} />)
        )}
        {data.total > PAGE_SIZE && <Pagination align="end" current={page} pageSize={PAGE_SIZE} total={data.total} onChange={setPage} showSizeChanger={false} />}
      </Flex>
    </>
  );
}

function SetupCard({ setup }: { setup: CaptureSetupDto }) {
  const { message } = App.useApp();
  const update = useUpdateCaptureSetup();
  const { token } = theme.useToken();
  const toggle = async (on: boolean) => {
    try {
      await update.mutateAsync(on);
      message.success(on ? 'WhatsApp entries are on for your number' : 'WhatsApp entries are off');
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
  const items = [
    { key: 'number', label: 'Send to', children: setup.number ? <span translate="no">{setup.number}</span> : 'Ask your admin for the company WhatsApp number' },
    { key: 'voice', label: 'Voice notes', children: setup.voice ? 'Written down, then drafted' : 'Not heard on this server yet: type instead' },
    {
      key: 'server',
      label: 'This server',
      children: setup.receiving ? `Receiving through ${setup.provider ? WHATSAPP_PROVIDER_LABELS[setup.provider] : 'WhatsApp'}` : 'Not receiving WhatsApp messages yet (see the deployment notes)',
    },
    ...(setup.webhookPath
      ? [
          {
            key: 'webhook',
            label: 'Webhook',
            children: (
              <Typography.Text copyable translate="no">
                {`${API_URL}${setup.webhookPath}`}
              </Typography.Text>
            ),
          },
        ]
      : []),
  ];
  return (
    <Card size="small" title="Your WhatsApp entries">
      <Flex vertical gap={token.marginSM}>
        <Flex gap={token.marginSM} align="center" wrap>
          <Switch checked={setup.enabled} loading={update.isPending} disabled={!setup.phone && !setup.enabled} onChange={toggle} aria-label="Read my WhatsApp messages as me" />
          <Typography.Text>
            {setup.phone ? (
              <>
                Read messages from <span translate="no">{formatPhone(setup.phone)}</span> as you
              </>
            ) : (
              'Add your mobile number first: messages are read from that number'
            )}
          </Typography.Text>
          {!setup.phone && (
            <LinkButton href="/notifications" size="small">
              Add my number
            </LinkButton>
          )}
        </Flex>
        {!setup.aiReady && setup.aiReason && <Typography.Text type="warning">{AI_OFF[setup.aiReason]}</Typography.Text>}
        <Descriptions size="small" column={{ xs: 1, md: 2 }} items={items} />
      </Flex>
    </Card>
  );
}

function StatsLine({ stats }: { stats: CaptureStatsDto }) {
  const decided = stats.saved + stats.changed + stats.discarded;
  if (!decided) return <Typography.Text type="secondary">No drafts decided in the last {stats.days} days</Typography.Text>;
  const share = stats.saved / decided;
  return (
    <Typography.Text type="secondary">
      Last {stats.days} days: <span translate="no">{stats.saved}</span> of <span translate="no">{decided}</span> drafts saved as drafted (
      <span translate="no">{Math.round(share * 100)}%</span>, aim {Math.round(CAPTURE_GO_LIVE_SHARE * 100)}%)
    </Typography.Text>
  );
}

function MessageCard({ m, showSender, picked }: { m: InboundMessageDto; showSender: boolean; picked: boolean }) {
  const { message } = App.useApp();
  const router = useRouter();
  const decide = useDecideCapture();
  const { token } = theme.useToken();
  const act = async (action: 'save' | 'discard') => {
    try {
      const r = await decide.mutateAsync({ id: m.id, action });
      message.success(action === 'save' ? `Saved and sent for approval: ${r.record?.label ?? 'entry'}` : 'Discarded. Nothing was saved.');
    } catch (e) {
      message.error(errorMessage(e));
    }
  };
  const open = () => m.draft && requestNew(m.draft.kind, () => router.push(DRAFT_PAGES[m.draft!.kind]), m.draft);
  const isImage = m.attachment?.mimeType.startsWith('image/');
  return (
    <Card size="small" data-message-id={m.id} style={picked ? { borderColor: token.colorPrimary } : undefined}>
      <Flex vertical gap={token.marginXS}>
        <Flex wrap gap={token.marginXS} align="center">
          <AppTag>{INBOUND_TYPE_LABELS[m.type]}</AppTag>
          <AppTag color={STATE_COLOR[m.state]}>{m.outcome ? CAPTURE_OUTCOME_LABELS[m.outcome] : INBOUND_STATE_LABELS[m.state]}</AppTag>
          <Typography.Text type="secondary">
            {formatDateTime(m.createdAt)}
            {showSender && m.userName ? <span translate="no">{` · ${m.userName}`}</span> : null}
          </Typography.Text>
        </Flex>
        {m.text && <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>{m.text}</Typography.Paragraph>}
        {m.transcript && (
          <Typography.Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
            <AppTag tone="pending">Check this</AppTag>
            Heard: {m.transcript}
          </Typography.Paragraph>
        )}
        {m.attachment &&
          (isImage ? (
            <Image src={fileUrl(m.attachment.url)} alt="Photo sent on WhatsApp" width={96} height={96} style={{ objectFit: 'cover', borderRadius: token.borderRadius }} />
          ) : (
            <Typography.Link href={fileUrl(m.attachment.url)} target="_blank" rel="noreferrer">
              Play the voice note
            </Typography.Link>
          ))}
        {m.draft && (
          <Card size="small" type="inner" title={`${AI_DRAFT_LABELS[m.draft.kind]}${m.state === 'SAVED' ? '' : ', not saved'}`}>
            <Flex vertical gap={token.marginXS}>
              <Typography.Text>{m.draft.title}</Typography.Text>
              {m.draft.flags.map((f) => (
                <Typography.Text key={f.field} type="warning">
                  Check: {f.note}
                </Typography.Text>
              ))}
              {m.state === 'DRAFTED' && (
                <Flex wrap gap={token.marginXS}>
                  {m.canSave && (
                    <Button type="primary" icon={<CheckOutlined />} loading={decide.isPending && decide.variables?.action === 'save'} onClick={() => act('save')}>
                      Save
                    </Button>
                  )}
                  <Button icon={<EditOutlined />} onClick={open}>
                    Open form
                  </Button>
                  <Button icon={<CloseOutlined />} loading={decide.isPending && decide.variables?.action === 'discard'} onClick={() => act('discard')}>
                    Discard
                  </Button>
                </Flex>
              )}
              {m.record && (
                <Typography.Text>
                  Saved: <Link href={m.record.href}>open the {AI_DRAFT_LABELS[m.record.kind].toLowerCase()}</Link>
                </Typography.Text>
              )}
            </Flex>
          </Card>
        )}
        {m.reply && !m.draft && (
          <Typography.Paragraph type="secondary" style={{ marginBottom: 0, whiteSpace: 'pre-wrap' }}>
            Nirmaan replied: {m.reply}
          </Typography.Paragraph>
        )}
        {m.error && m.state === 'FAILED' && <Typography.Text type="danger">{m.error}</Typography.Text>}
      </Flex>
    </Card>
  );
}
