'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from 'antd';
import { BellOutlined, ProjectOutlined, SearchOutlined } from '@ant-design/icons';
import { useProjects } from '@/lib/queries';
import type { NavIcon, NavSection } from './nav';
import s from './Sidebar.module.css';

interface Target {
  key: string;
  href: string;
  label: string;
  hint: string;
  icon: NavIcon;
  group: 'Pages' | 'Projects';
  /** Lower-cased text the query is matched against. */
  text: string;
}

/** Every query word must appear; labels that start with the query come first. */
function rank(targets: Target[], query: string): Target[] {
  const q = query.trim().toLowerCase();
  if (!q) return targets;
  const words = q.split(/\s+/);
  return targets
    .filter((t) => words.every((w) => t.text.includes(w)))
    .map((t) => {
      const label = t.label.toLowerCase();
      return { t, score: label.startsWith(q) ? 0 : label.includes(q) ? 1 : 2 };
    })
    .sort((a, b) => a.score - b.score)
    .map((r) => r.t);
}

/** Quick-jump to any page in the sidebar or any project, from the keyboard (Ctrl K / ⌘K) or the sidebar's search box. */
export function CommandPalette({ open, onClose, sections, withProjects }: { open: boolean; onClose: () => void; sections: NavSection[]; withProjects: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const { data: projects } = useProjects(open && withProjects);

  const pages = useMemo<Target[]>(() => {
    const list = sections.flatMap((sec) =>
      sec.items.map((i) => ({ key: i.href, href: i.href, label: i.label, hint: sec.title ?? '', icon: i.icon, group: 'Pages' as const, text: `${i.label} ${i.keywords ?? ''}`.toLowerCase() })),
    );
    if (!list.some((t) => t.href === '/notifications')) {
      list.push({ key: '/notifications', href: '/notifications', label: 'Notifications', hint: '', icon: BellOutlined, group: 'Pages', text: 'notifications alerts inbox' });
    }
    return list;
  }, [sections]);

  const projectTargets = useMemo<Target[]>(
    () =>
      (projects ?? []).map((p) => ({
        key: p.id,
        href: `/projects/${p.id}`,
        label: p.name,
        hint: p.code,
        icon: ProjectOutlined,
        group: 'Projects' as const,
        text: `${p.name} ${p.code} ${p.clientName ?? ''} ${p.location ?? ''}`.toLowerCase(),
      })),
    [projects],
  );

  const results = useMemo(() => [...rank(pages, query), ...rank(projectTargets, query).slice(0, query.trim() ? 8 : 5)], [pages, projectTargets, query]);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    if (!open) return;
    setQuery('');
    const t = window.setTimeout(() => input.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const go = (t: Target | undefined) => {
    if (!t) return;
    onClose();
    router.push(t.href);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      go(results[index]);
    }
  };

  return (
    <Modal open={open} onCancel={onClose} footer={null} closable={false} width={580} style={{ top: 88 }} destroyOnHidden styles={{ container: { padding: 0, overflow: 'hidden' } }} aria-label="Search and jump">
      <div className={s.palette}>
        <div className={s.paletteInput}>
          <SearchOutlined aria-hidden />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={withProjects ? 'Search pages and projects' : 'Search pages'}
            aria-label="Search pages and projects"
            role="combobox"
            aria-expanded
            aria-controls="palette-results"
            aria-activedescendant={results[index] ? `palette-${index}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <ul ref={listRef} id="palette-results" role="listbox" className={s.paletteList}>
          {results.length === 0 && <li className={s.paletteEmpty}>Nothing matches “{query.trim()}”.</li>}
          {results.map((t, i) => {
            const Icon = t.icon;
            const heading = i === 0 || results[i - 1].group !== t.group;
            return (
              <React.Fragment key={`${t.group}-${t.key}`}>
                {heading && (
                  <li className={s.paletteHeading} role="presentation">
                    {t.group}
                  </li>
                )}
                <li
                  id={`palette-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === index}
                  className={`${s.option} ${i === index ? s.optionActive : ''}`}
                  onMouseMove={() => i !== index && setIndex(i)}
                  onClick={() => go(t)}
                >
                  <Icon aria-hidden />
                  <span className={s.optionLabel}>{t.label}</span>
                  {t.hint && <span className={s.optionHint}>{t.hint}</span>}
                </li>
              </React.Fragment>
            );
          })}
        </ul>
        <div className={s.paletteFoot}>
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd>to move
          </span>
          <span>
            <kbd>Enter</kbd>to open
          </span>
          <span>
            <kbd>Esc</kbd>to close
          </span>
        </div>
      </div>
    </Modal>
  );
}
