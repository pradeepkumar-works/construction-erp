'use client';

import React, { useEffect, useState } from 'react';
import { Badge, Button, Drawer, Dropdown, Flex, Modal, Switch, Timeline, Typography, theme } from 'antd';
import type { MenuProps } from 'antd';
import { CompassOutlined, CustomerServiceOutlined, GiftOutlined, QuestionCircleOutlined, ThunderboltOutlined } from '@/components/common/icons';
import { PRODUCT_NAME } from '@erp/shared';
import { formatDate } from '@/lib/format';
import { readPref, writePref } from '@/lib/prefs';
import { askShortcutKeys, singleKeysOn, useSingleKeys } from '@/lib/shortcuts';
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

/**
 * Help's menu items (keyboard shortcuts, also on ?; what's new; contact support; the tour) and the dialogs they open. The
 * header shows them under its Help button, or on a phone inside the account menu, with `dialogs` on the page.
 */
export function useHelpMenu({ onTour, withSearch, withAsk = false }: { onTour: () => void; withSearch: boolean; withAsk?: boolean }) {
  const { token } = theme.useToken();
  const [keysOpen, setKeysOpen] = useState(false);
  const [newsOpen, setNewsOpen] = useState(false);
  const [seen, setSeen] = useState<string | null>(() => readPref<string | null>(PREF_SEEN, null));
  const unseen = WHATS_NEW.length > 0 && seen !== WHATS_NEW[0].id;
  const [singleKeys, setSingleKeys] = useSingleKeys();

  // ? opens the shortcuts from anywhere outside a field or a dialog.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || !singleKeysOn() || isTyping(e.target) || dialogOpen()) return;
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
    { key: 'keys', icon: <ThunderboltOutlined />, label: 'Keyboard shortcuts', extra: singleKeys ? <Typography.Text keyboard>?</Typography.Text> : undefined, onClick: () => setKeysOpen(true) },
    { key: 'news', icon: <GiftOutlined />, label: unseen ? <Badge dot offset={[6, 0]}>What&apos;s new</Badge> : "What's new", onClick: openNews },
    { key: 'tour', icon: <CompassOutlined />, label: 'Take the tour', onClick: onTour },
    ...(SUPPORT ? [{ key: 'support', icon: <CustomerServiceOutlined />, label: <a href={`mailto:${SUPPORT}`}>Contact support</a> }] : []),
  ];

  const shortcuts: [string, string[]][] = [
    ...(withSearch ? ([['Search pages, projects and records', searchShortcut().startsWith('⌘') ? ['⌘', 'K'] : ['Ctrl', 'K']]] as [string, string[]][]) : []),
    ...(withAsk ? ([[`Ask ${PRODUCT_NAME} a question`, askShortcutKeys()]] as [string, string[]][]) : []),
    ['Skip the menu to the page (first Tab on a page)', ['Tab', 'Enter']],
    ...(singleKeys
      ? ([
          ['Fold the sidebar to icons and back', ['[']],
          ['Show these shortcuts', ['?']],
        ] as [string, string[]][])
      : []),
    ['Move through search results', ['↑', '↓']],
    ['Move through the rows of a list (after Tab to the list)', singleKeys ? ['↑', '↓', 'J', 'K'] : ['↑', '↓']],
    ['Open the row', ['Enter']],
    ...(singleKeys ? ([['Tick the row', ['X']]] as [string, string[]][]) : []),
    ['Close a dialog or drawer', ['Esc']],
    ['Submit the form you are filling', ['Ctrl', 'Enter']],
    ['Next line of a table in a form (adds one on the last)', ['Enter']],
  ];
  const approvalKeys: [string, string[]][] = [
    ...(singleKeys
      ? ([
          ['Next and previous entry', ['J', 'K']],
          ['Approve, request changes, reject', ['A', 'C', 'R']],
          ['Tick the entry for bulk approval', ['X']],
          ['Open its full page', ['O']],
        ] as [string, string[]][])
      : []),
    ['Confirm the decision', ['Ctrl', 'Enter']],
  ];

  const dialogs = (
    <>
      <Modal open={keysOpen} onCancel={() => setKeysOpen(false)} footer={null} title="Keyboard shortcuts" width={460}>
        <Flex vertical gap={token.marginSM}>
          <Flex justify="space-between" align="flex-start" gap={token.margin} style={{ paddingBottom: token.paddingSM, borderBottom: `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}` }}>
            <div>
              <Typography.Text strong id="single-keys-label">
                Single-key shortcuts
              </Typography.Text>
              <Typography.Text type="secondary" style={{ display: 'block', fontSize: token.fontSizeSM }}>
                Keys such as J, K and ? on their own. Turn them off if you use speech input or press keys by accident.
              </Typography.Text>
            </div>
            <Switch checked={singleKeys} onChange={setSingleKeys} aria-labelledby="single-keys-label" />
          </Flex>
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
  return { items, unseen, dialogs };
}

/** The header's Help button, opening the menu `useHelpMenu` gives. */
export function HelpButton({ items, unseen }: { items: MenuProps['items']; unseen: boolean }) {
  const { token } = theme.useToken();
  return (
    <Dropdown menu={{ items }} trigger={['click']} placement="bottomRight">
      <Button type="text" aria-label="Help" data-tour="help" icon={<Badge dot={unseen}>{<QuestionCircleOutlined style={{ fontSize: token.fontSizeLG }} />}</Badge>} />
    </Dropdown>
  );
}
