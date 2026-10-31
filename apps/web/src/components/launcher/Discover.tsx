'use client';

import React, { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { Button, Drawer, Flex, Form, Input, Typography } from 'antd';
import type { AuthUser, DiscoverEntry, LauncherDto, NavNode } from '@erp/shared';
import { NAV_TREE, discoverFor, navDestination, navTilesFor } from '@erp/shared';
import { formatDate } from '@/lib/format';
import { useNotify } from '@/lib/notify';
import { useRequestAccess } from '@/lib/queries';
import { FormShell } from '@/components/form/FormShell';
import { LinkButton } from '@/components/common/LinkButton';
import { TreeIcon } from '@/components/shell/nav-icons';
import { TileGrid, familyOf, type TileEntry } from './TileGrid';
import s from './HomeLauncher.module.css';

const TAGS: Record<DiscoverEntry['reason'], TileEntry['tag']> = {
  new: { text: 'New', tone: 'new' },
  featured: { text: 'Featured', tone: 'featured' },
  unopened: { text: 'Not opened yet' },
  locked: { text: 'Request access' },
};

/** The pages a Discover tile's drawer lists: those the user can open, or for a module they cannot, every page it has. */
function pagesOf(user: AuthUser, entry: DiscoverEntry): NavNode[] {
  if (!entry.locked) return navTilesFor(user, entry.node.id);
  return NAV_TREE.filter((n) => n.parent === entry.node.id && n.status === 'live' && n.tile !== false && !n.shortcutOf);
}

/** Where a request stands, in a sentence for the drawer. */
function requestLine(entry: DiscoverEntry): string | null {
  const r = entry.request;
  if (!r) return null;
  if (r.status === 'OPEN') return `You asked on ${formatDate(r.createdAt.slice(0, 10))}. Your admins have been told.`;
  if (r.status === 'GRANTED') return `Your admin granted this on ${formatDate(r.decidedAt?.slice(0, 10))}. Sign out and in again if it is not on Home yet.`;
  return `Your admin declined this on ${formatDate(r.decidedAt?.slice(0, 10))}${r.reply ? `: ${r.reply}` : ''}. You can ask again.`;
}

/** Asks the company's admins for a module, with a line on what for. */
function RequestAccess({ node, open, onClose }: { node: NavNode; open: boolean; onClose: () => void }) {
  const [form] = Form.useForm<{ note?: string }>();
  const request = useRequestAccess();
  const notify = useNotify();
  return (
    <FormShell
      open={open}
      onClose={onClose}
      form={form}
      layout="modal"
      projectDefault={false}
      title={`Request access to ${node.label}`}
      okText="Send request"
      onSubmit={async (v) => {
        await request.mutateAsync({ nodeId: node.id, note: v.note });
        notify.saved(`Request sent. Your admins will answer it`);
      }}
    >
      <Form form={form} layout="vertical">
        <Typography.Paragraph>Your admins can change your role or turn {node.label} on for you. You will get a notification when they answer.</Typography.Paragraph>
        <Form.Item name="note" label="What do you need it for?" extra="Optional. It helps them decide.">
          <Input.TextArea rows={3} maxLength={500} showCount />
        </Form.Item>
      </Form>
    </FormShell>
  );
}

/** A Discover tile opened: what the module is for and its pages, then Open, or Request access for one the role cannot open. */
function DiscoverDrawer({ user, entry, onClose }: { user: AuthUser; entry: DiscoverEntry | null; onClose: () => void }) {
  const [asking, setAsking] = useState(false);
  const node = entry?.node;
  const to = node ? navDestination(node) : null;
  const pages = entry ? pagesOf(user, entry) : [];
  const line = entry ? requestLine(entry) : null;
  const waiting = entry?.request?.status === 'OPEN';
  return (
    <Drawer
      open={!!entry}
      onClose={onClose}
      size={480}
      destroyOnHidden
      title={node?.label}
      footer={
        entry && node ? (
          <Flex gap="small" justify="flex-end">
            <Button onClick={onClose}>Close</Button>
            {!entry.locked && to?.kind === 'page' ? (
              <LinkButton type="primary" href={to.href}>
                Open {node.label}
              </LinkButton>
            ) : entry.locked ? (
              <Button type="primary" disabled={waiting} onClick={() => setAsking(true)}>
                {waiting ? 'Requested' : 'Request access'}
              </Button>
            ) : null}
          </Flex>
        ) : null
      }
    >
      {entry && node && (
        <>
          <Typography.Paragraph>{node.description}</Typography.Paragraph>
          {entry.locked && !line && <Typography.Paragraph type="secondary">Your role does not open it yet. Ask your admins if your work needs it.</Typography.Paragraph>}
          {line && <Typography.Paragraph type={entry.request?.status === 'DECLINED' ? 'secondary' : undefined}>{line}</Typography.Paragraph>}
          {pages.length > 0 && (
            <>
              <h3 className={s.drawerTitle}>{entry.locked ? 'What is in it' : 'Pages you can open'}</h3>
              <ul className={s.pageList}>
                {pages.map((p) => (
                  <li key={p.id} className={s.pageItem}>
                    <span className={s.recentIcon} aria-hidden>
                      <TreeIcon name={p.icon} />
                    </span>
                    <span className={s.recentText}>
                      <span className={s.recentLabel}>{p.label}</span>
                      {p.description && <span className={s.recentKind}>{p.description}</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
          <RequestAccess node={node} open={asking} onClose={() => setAsking(false)} />
        </>
      )}
    </Drawer>
  );
}

/**
 * Discover on Home (launcher phase 3): modules marked New or Featured (by the tree, or the company's admins in Admin › Home
 * tiles), modules the user can open but never has, and, unless the company turned it off, modules their role cannot open,
 * greyed, with Request access. Each tile opens a drawer saying what the module is for.
 */
export function DiscoverSection({ user, launcher }: { user: AuthUser; launcher: LauncherDto | undefined }) {
  const [picked, setPicked] = useState<DiscoverEntry | null>(null);
  const entries = useMemo(() => (launcher ? discoverFor(user, launcher, dayjs().format('YYYY-MM-DD')) : []), [user, launcher]);
  // The picked tile as it is now, so a request just sent shows as Requested.
  const current = picked ? (entries.find((e) => e.node.id === picked.node.id) ?? picked) : null;
  if (!entries.length) return null;
  const tiles: TileEntry[] = entries.map((e) => ({
    key: e.node.id,
    node: e.node,
    family: familyOf(e.node),
    tag: e.locked && e.request?.status === 'OPEN' ? { text: 'Requested' } : TAGS[e.reason],
    locked: e.locked,
    onOpen: () => setPicked(e),
  }));
  return (
    <section aria-labelledby="home-discover" className={s.section}>
      <h2 id="home-discover" className={s.sectionTitle}>
        Discover
      </h2>
      <TileGrid entries={tiles} label="Discover" />
      <DiscoverDrawer user={user} entry={current} onClose={() => setPicked(null)} />
    </section>
  );
}
