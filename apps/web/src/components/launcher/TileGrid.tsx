'use client';

import React, { useId, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Dropdown, Form, Modal, type MenuProps } from 'antd';
import type { NavFamily, NavNode } from '@erp/shared';
import { navDestination, navNode, navTarget, projectTabHref } from '@erp/shared';
import { familyColors } from '@/lib/brand';
import { useAppearance } from '@/lib/appearance';
import { useProjectScope } from '@/lib/project-scope';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { TreeIcon } from '@/components/shell/nav-icons';
import s from './TileGrid.module.css';

/** What a tile shows: a node of the tree in its module's colour family (a page takes its module's), or a place of its own
 *  (a pinned project or saved view) with its own name, icon and address. */
export interface TileEntry {
  key: string;
  node?: NavNode;
  family?: NavFamily;
  label?: string;
  icon?: string;
  description?: string;
  /** Where it goes, for a tile that is not a node. */
  href?: string;
  /** What waits on the user there; the tile's name says it too ("Purchases, 3 waiting"). */
  badge?: number;
}

/** A tile's menu (Pin to Home, Unpin, Move left…): drawn as ⋮ on the tile, and opened by right-click, a long press or Shift F10. */
export type TileMenu = (entry: TileEntry, index: number) => MenuProps['items'];

/** One tile: the icon in its family's colours, the name and a line on what it is for; the whole tile a link (or a button
 *  that asks for the project, for a project tab with no project chosen in the header). */
function Tile({ entry, tabIndex, onFocus, onKeyDown, onPickProject }: { entry: TileEntry; tabIndex: number; onFocus: () => void; onKeyDown: (e: React.KeyboardEvent) => void; onPickProject: (node: NavNode) => void }) {
  const { dark } = useAppearance();
  const [projectId] = useProjectScope();
  const { node } = entry;
  const { fg, bg } = familyColors(entry.family, dark);
  const to = node ? navDestination(node) : null;
  const label = entry.label ?? node?.label ?? '';
  const description = entry.description ?? node?.description;
  const descId = useId();
  // The name is the label (and what waits); the line under it is the description, so a tile reads like its sidebar link.
  const a11y = { 'aria-label': entry.badge ? `${label}, ${entry.badge} waiting` : label, 'aria-describedby': description ? descId : undefined };
  const body = (
    <>
      <span className={s.chip} style={{ color: fg, background: bg }}>
        <TreeIcon name={entry.icon ?? node?.icon ?? 'layout-grid'} />
        {!!entry.badge && (
          <span className={s.badge} aria-hidden translate="no">
            {entry.badge > 99 ? '99+' : entry.badge}
          </span>
        )}
      </span>
      <span className={s.label}>{label}</span>
      {description && (
        <span id={descId} className={s.desc}>
          {description}
        </span>
      )}
    </>
  );
  if (node && to?.kind === 'project' && !projectId)
    return (
      <button type="button" className={s.tile} tabIndex={tabIndex} onFocus={onFocus} onKeyDown={onKeyDown} onClick={() => onPickProject(node)} aria-haspopup="dialog" {...a11y}>
        {body}
      </button>
    );
  const href = entry.href ?? (!to ? '#' : to.kind === 'page' ? to.href : projectTabHref(projectId!, to.tab, to.query));
  return (
    <Link href={href} className={s.tile} tabIndex={tabIndex} onFocus={onFocus} onKeyDown={onKeyDown} {...a11y}>
      {body}
    </Link>
  );
}

/** The tile's ⋮ menu. The button is not a Tab stop (the tile is; Shift F10 opens this from it). */
function TileMenuButton({ label, items, open, onOpenChange }: { label: string; items: MenuProps['items']; open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dropdown menu={{ items, onClick: () => onOpenChange(false) }} trigger={['click']} open={open} onOpenChange={onOpenChange} placement="bottomRight">
      <button type="button" className={s.more} tabIndex={-1} aria-label={`More for ${label}`} aria-haspopup="menu" aria-expanded={open}>
        <TreeIcon name="ellipsis-vertical" />
      </button>
    </Dropdown>
  );
}

/** Asks which project a project-tab tile should open, then opens it there. */
function ProjectPick({ node, onClose }: { node: NavNode | null; onClose: () => void }) {
  const router = useRouter();
  const [, setScope] = useProjectScope();
  const [form] = Form.useForm<{ projectId: string }>();
  const to = node ? navDestination(node) : null;
  return (
    <Modal
      open={!!node}
      title={node ? `Open ${node.label.toLowerCase()} for a project` : undefined}
      okText="Open"
      onCancel={onClose}
      onOk={() => form.submit()}
      destroyOnHidden
      afterOpenChange={(open) => !open && form.resetFields()}
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={({ projectId }) => {
          if (to?.kind !== 'project') return;
          // The project becomes the header's, as choosing it there would.
          setScope(projectId);
          onClose();
          router.push(projectTabHref(projectId, to.tab, to.query));
        }}
      >
        <Form.Item name="projectId" label="Project" rules={[{ required: true, message: 'Choose the project' }]}>
          <ProjectSelect allowClear={false} placeholder="Choose a project" style={{ width: '100%' }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

const MOVES: Record<string, number | 'row-up' | 'row-down' | 'first' | 'last'> = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: 'row-down', ArrowUp: 'row-up', Home: 'first', End: 'last' };

/**
 * The launcher's grid of tiles (module screens; Home in phase 2). One Tab stop for the whole grid: the arrow keys move
 * between tiles (Up and Down by row, as laid out), Home and End to the ends, Enter opens. Grouped tiles (Accounts) sit under
 * their headings, still one grid for the keys.
 */
export function TileGrid({ entries, label, menu, compact }: { entries: TileEntry[]; label: string; menu?: TileMenu; compact?: boolean }) {
  const [active, setActive] = useState(0);
  const [menuAt, setMenuAt] = useState<number | null>(null);
  const [picking, setPicking] = useState<NavNode | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => {
    const out: { title?: string; items: { entry: TileEntry; index: number }[] }[] = [];
    entries.forEach((entry, index) => {
      const title = entry.node?.group;
      const last = out[out.length - 1];
      if (last && last.title === title) last.items.push({ entry, index });
      else out.push({ title, items: [{ entry, index }] });
    });
    return out;
  }, [entries]);
  const current = Math.min(active, entries.length - 1);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (menu && ((e.shiftKey && e.key === 'F10') || e.key === 'ContextMenu')) {
      const tiles = Array.from(root.current?.querySelectorAll<HTMLElement>(`.${s.tile}`) ?? []);
      const at = tiles.indexOf(document.activeElement as HTMLElement);
      if (at >= 0) {
        e.preventDefault();
        setMenuAt(at);
      }
      return;
    }
    const move = MOVES[e.key];
    if (move === undefined) return;
    const tiles = Array.from(root.current?.querySelectorAll<HTMLElement>(`.${s.tile}`) ?? []);
    const at = tiles.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    let next = at;
    if (typeof move === 'number') next = at + move;
    else if (move === 'first') next = 0;
    else if (move === 'last') next = tiles.length - 1;
    else {
      // The tile above or below: the nearest one on the next row, by where the tiles are drawn.
      const box = tiles[at].getBoundingClientRect();
      const down = move === 'row-down';
      const rows = tiles.map((t, i) => ({ i, r: t.getBoundingClientRect() })).filter(({ r }) => (down ? r.top > box.top + 1 : r.top < box.top - 1));
      if (rows.length) {
        const rowTop = down ? Math.min(...rows.map(({ r }) => r.top)) : Math.max(...rows.map(({ r }) => r.top));
        const row = rows.filter(({ r }) => Math.abs(r.top - rowTop) < 2);
        next = row.reduce((best, t) => (Math.abs(t.r.left - box.left) < Math.abs(best.r.left - box.left) ? t : best)).i;
      }
    }
    if (next < 0 || next >= tiles.length || next === at) return;
    e.preventDefault();
    setActive(next);
    tiles[next].focus();
  };

  return (
    <div ref={root} role="group" aria-label={label}>
      {groups.map((g, gi) => (
        <section key={g.title ?? gi} aria-label={g.title} style={{ marginTop: gi ? 'var(--ant-margin-lg)' : undefined }}>
          {g.title && <h2 className={s.groupTitle}>{g.title}</h2>}
          <ul className={compact ? `${s.grid} ${s.compact}` : s.grid}>
            {g.items.map(({ entry, index }) => {
              const items = menu?.(entry, index);
              return (
                <li
                  key={entry.key}
                  className={s.cell}
                  onContextMenu={
                    items?.length
                      ? (e) => {
                          e.preventDefault();
                          setMenuAt(index);
                        }
                      : undefined
                  }
                >
                  <Tile entry={entry} tabIndex={index === current ? 0 : -1} onFocus={() => setActive(index)} onKeyDown={onKeyDown} onPickProject={setPicking} />
                  {!!items?.length && (
                    <TileMenuButton
                      label={entry.label ?? entry.node?.label ?? ''}
                      items={items}
                      open={menuAt === index}
                      onOpenChange={(open) => {
                        setMenuAt(open ? index : null);
                        // Back to the tile when the menu closes, as after any menu.
                        if (!open) root.current?.querySelectorAll<HTMLElement>(`.${s.tile}`)[index]?.focus();
                      }}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <ProjectPick node={picking} onClose={() => setPicking(null)} />
    </div>
  );
}

const familyOf = (node: NavNode): NavFamily | undefined => {
  let n: NavNode | undefined = node;
  while (n && !n.family) n = n.parent ? navNode(n.parent) : undefined;
  return n?.family;
};

/** Tiles in their module's colours (a shortcut in its own module's, where the page lives). */
export const tileEntries = (nodes: NavNode[], badges?: Record<string, number>): TileEntry[] =>
  nodes.map((node) => ({ key: node.id, node, family: familyOf(navTarget(node)), badge: badges?.[node.id] }));

export { familyOf };
