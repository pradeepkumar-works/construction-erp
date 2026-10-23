'use client';

import React, { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Form, Modal } from 'antd';
import type { NavFamily, NavNode } from '@erp/shared';
import { navDestination, navNode, navTarget, projectTabHref } from '@erp/shared';
import { familyColors } from '@/lib/brand';
import { useAppearance } from '@/lib/appearance';
import { useProjectScope } from '@/lib/project-scope';
import { ProjectSelect } from '@/components/common/ProjectSelect';
import { TreeIcon } from '@/components/shell/nav-icons';
import s from './TileGrid.module.css';

/** What a tile shows: the node, and the module's colour family (a page takes its module's). */
export interface TileEntry {
  node: NavNode;
  family?: NavFamily;
}

/** One tile: the icon in its family's colours, the name and a line on what it is for; the whole tile a link (or a button
 *  that asks for the project, for a project tab with no project chosen in the header). */
function Tile({ entry, tabIndex, onFocus, onKeyDown, onPickProject }: { entry: TileEntry; tabIndex: number; onFocus: () => void; onKeyDown: (e: React.KeyboardEvent) => void; onPickProject: (node: NavNode) => void }) {
  const { dark } = useAppearance();
  const [projectId] = useProjectScope();
  const { node } = entry;
  const { fg, bg } = familyColors(entry.family, dark);
  const to = navDestination(node);
  const body = (
    <>
      <span className={s.chip} style={{ color: fg, background: bg }}>
        <TreeIcon name={node.icon} />
      </span>
      <span className={s.label}>{node.label}</span>
      <span className={s.desc}>{node.description}</span>
    </>
  );
  if (to?.kind === 'project' && !projectId)
    return (
      <button type="button" className={s.tile} tabIndex={tabIndex} onFocus={onFocus} onKeyDown={onKeyDown} onClick={() => onPickProject(node)} aria-haspopup="dialog">
        {body}
      </button>
    );
  const href = !to ? '#' : to.kind === 'page' ? to.href : projectTabHref(projectId!, to.tab, to.query);
  return (
    <Link href={href} className={s.tile} tabIndex={tabIndex} onFocus={onFocus} onKeyDown={onKeyDown}>
      {body}
    </Link>
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
export function TileGrid({ entries, label }: { entries: TileEntry[]; label: string }) {
  const [active, setActive] = useState(0);
  const [picking, setPicking] = useState<NavNode | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const groups = useMemo(() => {
    const out: { title?: string; items: { entry: TileEntry; index: number }[] }[] = [];
    entries.forEach((entry, index) => {
      const title = entry.node.group;
      const last = out[out.length - 1];
      if (last && last.title === title) last.items.push({ entry, index });
      else out.push({ title, items: [{ entry, index }] });
    });
    return out;
  }, [entries]);
  const current = Math.min(active, entries.length - 1);

  const onKeyDown = (e: React.KeyboardEvent) => {
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
          <ul className={s.grid}>
            {g.items.map(({ entry, index }) => (
              <li key={entry.node.id}>
                <Tile entry={entry} tabIndex={index === current ? 0 : -1} onFocus={() => setActive(index)} onKeyDown={onKeyDown} onPickProject={setPicking} />
              </li>
            ))}
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
export const tileEntries = (nodes: NavNode[]): TileEntry[] => nodes.map((node) => ({ node, family: familyOf(navTarget(node)) }));
