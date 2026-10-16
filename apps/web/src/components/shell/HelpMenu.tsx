'use client';

import React, { useEffect, useState } from 'react';
import { Badge, Button, Drawer, Dropdown, Flex, Modal, Timeline, Typography, theme } from 'antd';
import type { MenuProps } from 'antd';
import { CompassOutlined, CustomerServiceOutlined, GiftOutlined, QuestionCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import { formatDate } from '@/lib/format';
import { readPref, writePref } from '@/lib/prefs';
import { searchShortcut } from './Sidebar';
import { WHATS_NEW } from './whats-new';

const PREF_SEEN = 'nirmaan.whatsnew.seen';
/** Where Help > Contact support writes to; without either variable the item is left out. */
const SUPPORT = process.env.NEXT_PUBLIC_SUPPORT_EMAIL || process.env.NEXT_PUBLIC_PRIVACY_EMAIL;

/** Typing in a field, so single-key shortcuts must not fire. */
export const isTyping = (el: EventTarget | null) => el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** A modal or drawer is on screen, so page shortcuts wait. */
export const dialogOpen = () => Array.from(document.querySelectorAll<HTMLElement>('.ant-modal-wrap, .ant-drawer-open')).some((el) => el.getClientRects().length > 0);

function Keys({ keys }: { keys: string[] }) {
  const { token } = theme.useToken();
  return (
    <Flex gap={token.marginXXS}>
      {keys.map((k) => (
        <Typography.Text key={k} keyboard>
          {k}
        </Typography.Text>
      ))}
    </Flex>
  );
}

/** The header's Help: keyboard shortcuts (also on ?), what's new, contact support and the tour. */
export function HelpMenu({ onTour, withSearch }: { onTour: () => void; withSearch: boolean }) {
  const { token } = theme.useToken();
  const [keysOpen, setKeysOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [seen, setSeen] = useState<string | null>(() => readPref<string | null>(PREF_SEEN, null));
  const unseen = WHATS_NEW.length > 0 && seen !== WHATS_NEW[0].id;

  // ? opens the shortcuts from anywhere outside a field or a dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target) || dialogOpen()) return;
      e.preventDefault();
      setKeysOpen(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openNews = () => {
    setNewsOpen(true);
    if (WHATS_NEW[0]) {
      writePref(PREF_SEEN, WHATS_NEW[0].id);
      setSeen(WHATS_NEW[0].id);
    }
  };

  const items: MenuProps['items'] = [
    { key: 'keys', icon: <ThunderboltOutlined />, label: 'Keyboard shortcuts', extra: <Typography.Text keyboard>?</Typography.Text>, onClick: () => setKeysOpen(true) },
    { key: 'news', icon: <GiftOutlined />, label: unseen ? <Badge dot offset={[6, 0]}>What&apos;s new</Badge> : "What's new", onClick: openNews },
    { key: 'tour', icon: <CompassOutlined />, label: 'Take the tour', onClick: onTour },
    ...(SUPPORT ? [{ key: 'support', icon: <CustomerServiceOutlined />, label: <a href={`mailto:${SUPPORT}`}>Contact support</a> }] : []),
  ];

  const shortcuts: [string, string[]][] = [
    ...(withSearch ? ([['Search pages and projects', searchShortcut().startsWith('⌘') ? ['⌘', 'K'] : ['Ctrl', 'K']]] as [string, string[]][]) : []),
    ['Fold the sidebar to icons and back', ['[']],
    ['Show these shortcuts', ['?']],
    ['Move through search results', ['↑', '↓']],
    ['Close a dialog or drawer', ['Esc']],
  ];
  const approvalKeys: [string, string[]][] = [
    ['Next and previous entry', ['J', 'K']],
    ['Approve, request changes, reject', ['A', 'C', 'R']],
    ['Tick the entry for bulk approval', ['X']],
    ['Open its full page', ['O']],
    ['Confirm the decision', ['Ctrl', 'Enter']],
  ];

  return (
    <>
      <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
        <Button type="text" aria-label="Help" data-tour="help" icon={<Badge dot={unseen}>{<QuestionCircleOutlined style={{ fontSize: token.fontSizeLG }} />}</Badge>} />
      </Dropdown>
      <Modal open={keysOpen} onCancel={() => setKeysOpen(false)} footer={null} title="Keyboard shortcuts" width={440}>
        <Flex vertical gap={token.marginSM}>
          {shortcuts.map(([what, keys]) => (
            <Flex key={what} justify="space-between" align="center" gap={token.margin}>
              <Typography.Text>{what}</Typography.Text>
              <Keys keys={keys} />
            </Flex>
          ))}
          <Typography.Text strong style={{ marginTop: token.marginXS }}>
            In Approvals
          </Typography.Text>
          {approvalKeys.map(([what, keys]) => (
            <Flex key={what} justify="space-between" align="center" gap={token.margin}>
              <Typography.Text>{what}</Typography.Text>
              <Keys keys={keys} />
            </Flex>
          ))}
        </Flex>
      </Modal>
      <Drawer open={newsOpen} onClose={() => setNewsOpen(false)} title="What's new" size={420}>
        <Timeline
          items={WHATS_NEW.map((n) => ({
            key: n.id,
            content: (
              <>
                <Typography.Text strong>{n.title}</Typography.Text>
                <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }}>
                  {formatDate(n.date)}
                </Typography.Text>
                <ul style={{ margin: `${token.marginXS}px 0 0`, paddingLeft: token.paddingMD }}>
                  {n.points.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </>
            ),
          }))}
        />
      </Drawer>
    </>
  );
}
