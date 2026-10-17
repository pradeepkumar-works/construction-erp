'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Popover, Tooltip } from 'antd';
import { DownOutlined, MenuFoldOutlined, MenuUnfoldOutlined } from '@ant-design/icons';
import type { AuthUser } from '@erp/shared';
import { BRAND } from '@/lib/brand';
import { readPref, writePref } from '@/lib/prefs';
import { useHoverIntent, usePrefetch } from '@/lib/prefetch';
import { BrandMark, Wordmark } from './BrandMark';
import { activeHref, type NavItem, type NavSection } from './nav';
import s from './Sidebar.module.css';

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

export const PREF_RAIL = 'nirmaan.sidebar.rail';
const PREF_CLOSED = 'nirmaan.sidebar.closed';

/** "⌘K" on a Mac, "Ctrl K" elsewhere. */
export function searchShortcut(): string {
  if (typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)) return '⌘K';
  return 'Ctrl K';
}

interface SidebarProps {
  user: AuthUser;
  sections: NavSection[];
  /** Pending approvals, shown on the Approvals link. */
  pendingCount: number;
  /** Icons only (desktop collapsed). */
  rail?: boolean;
  onToggleRail?: () => void;
  /** Called after a link is followed (closes the mobile drawer). */
  onNavigate?: () => void;
}

export function Sidebar({ user, sections, pendingCount, rail = false, onToggleRail, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const active = activeHref(pathname);
  const [closed, setClosed] = useState<string[]>(() => readPref<string[]>(PREF_CLOSED, []));
  const navRef = useRef<HTMLElement>(null);

  const toggle = (key: string) =>
    setClosed((prev) => {
      const next = prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key];
      writePref(PREF_CLOSED, next);
      return next;
    });

  // Keep the current page in view when the list is longer than the window (scrolling only the list, not the page).
  useEffect(() => {
    const nav = navRef.current;
    const el = nav?.querySelector('[aria-current="page"]');
    if (!nav || !el) return;
    const box = nav.getBoundingClientRect();
    const at = el.getBoundingClientRect();
    if (at.bottom > box.bottom) nav.scrollTop += at.bottom - box.bottom + 24;
    else if (at.top < box.top) nav.scrollTop -= box.top - at.top + 24;
  }, [active, rail]);

  const top = sections.filter((sec) => !sec.title);
  const groups = sections.filter((sec) => sec.title);
  const countFor = (item: NavItem) => (item.approvals ? pendingCount : 0);

  return (
    <div className={cx(s.sidebar, rail && s.rail)}>
      <div className={s.brand}>
        <BrandMark size={32} />
        {!rail && (
          <div style={{ lineHeight: 1.15, minWidth: 0 }}>
            <Wordmark color={BRAND.colors.onAccent} size={18} />
            <div className={s.org} title={user.organizationName}>
              {user.organizationName}
            </div>
          </div>
        )}
      </div>

      <nav ref={navRef} aria-label="Main" className={s.scroll}>
        {top.map((sec) => (
          <ul key={sec.key} className={s.list}>
            {sec.items.map((item) => (
              <NavLink key={item.href} item={item} active={item.href === active} rail={rail} count={countFor(item)} onNavigate={onNavigate} />
            ))}
          </ul>
        ))}
        {rail && groups.length > 0 && <div className={s.rule} role="separator" />}
        {groups.map((sec) =>
          rail ? (
            <RailSection key={sec.key} section={sec} active={sec.exact ? pathname : active} onNavigate={onNavigate} />
          ) : (
            <Group key={sec.key} section={sec} open={!closed.includes(sec.key)} onToggle={() => toggle(sec.key)} active={sec.exact ? pathname : active} onNavigate={onNavigate} />
          ),
        )}
      </nav>

      {onToggleRail && (
        <div className={s.foot}>
          <Tooltip title={rail ? 'Expand sidebar  [' : undefined} placement="right">
            <button type="button" className={s.item} onClick={onToggleRail} aria-label={rail ? 'Expand sidebar' : 'Collapse sidebar'} aria-keyshortcuts="[">
              {rail ? <MenuUnfoldOutlined className={s.icon} aria-hidden /> : <MenuFoldOutlined className={s.icon} aria-hidden />}
              <span className={s.label}>Collapse</span>
              {!rail && <kbd className={s.kbd}>[</kbd>}
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  );
}

function NavLink({ item, active, rail, count, onNavigate }: { item: NavItem; active: boolean; rail: boolean; count: number; onNavigate?: () => void }) {
  const Icon = item.icon;
  // Resting on a link fetches its list's first page ahead (item 83); Next fetches the page's code itself.
  const prefetch = usePrefetch();
  const ahead = useHoverIntent(() => prefetch.list(item.href));
  const link = (
    <Link
      href={item.href}
      {...ahead}
      className={cx(s.item, active && s.active)}
      aria-current={active ? 'page' : undefined}
      data-tour={item.approvals ? 'approvals' : undefined}
      aria-label={rail ? (count > 0 ? `${item.label}, ${count} pending` : item.label) : undefined}
      onClick={onNavigate}
    >
      <Icon className={s.icon} aria-hidden />
      <span className={s.label}>{item.label}</span>
      {count > 0 && <span className={s.count}>{count > 99 ? '99+' : count}</span>}
    </Link>
  );
  return (
    <li>
      {rail ? (
        <Tooltip title={item.label} placement="right" mouseEnterDelay={0.15}>
          {link}
        </Tooltip>
      ) : (
        link
      )}
    </li>
  );
}

function Group({ section, open, onToggle, active, onNavigate }: { section: NavSection; open: boolean; onToggle: () => void; active: string; onNavigate?: () => void }) {
  const id = `nav-${section.key}`;
  const current = section.items.find((i) => i.href === active);
  return (
    <div className={s.group}>
      <button type="button" className={cx(s.groupHead, !open && s.groupClosed, !open && current && s.groupHeadActive)} aria-expanded={open} aria-controls={id} onClick={onToggle}>
        <span>{section.title}</span>
        <DownOutlined className={cx(s.chevron, open && s.chevronOpen)} aria-hidden />
      </button>
      <div id={id} className={cx(s.fold, !open && s.foldClosed)} inert={!open}>
        <ul className={s.list}>
          {section.items.map((item) => (
            <NavLink key={item.href} item={item} active={item.href === active} rail={false} count={0} onNavigate={onNavigate} />
          ))}
        </ul>
      </div>
      {/* A folded section still shows the page you are on. */}
      {!open && current && (
        <ul className={s.list}>
          <NavLink item={current} active rail={false} count={0} onNavigate={onNavigate} />
        </ul>
      )}
    </div>
  );
}

/** On the rail a section is one icon; hovering, clicking or pressing Enter opens its links beside it (a click never closes what hovering opened). */
function RailSection({ section, active, onNavigate }: { section: NavSection; active: string; onNavigate?: () => void }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const fromKeyboard = useRef(false);
  const Icon = section.icon ?? section.items[0].icon;
  const hasActive = section.items.some((i) => i.href === active);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  };

  const onListKey = (e: React.KeyboardEvent) => {
    const links = Array.from(list.current?.querySelectorAll('a') ?? []);
    const at = links.indexOf(document.activeElement as HTMLAnchorElement);
    if (e.key === 'Escape' || e.key === 'ArrowLeft') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = e.key === 'ArrowDown' ? (at + 1) % links.length : (at - 1 + links.length) % links.length;
      links[next]?.focus();
    } else if (e.key === 'Tab') {
      close(true);
    }
  };

  const content = (
    <div className={s.flyout} onKeyDown={onListKey}>
      <div className={s.flyoutTitle}>{section.title}</div>
      <ul ref={list} className={s.list}>
        {section.items.map((item) => (
          <NavLink
            key={item.href}
            item={item}
            active={item.href === active}
            rail={false}
            count={0}
            onNavigate={() => {
              setOpen(false);
              onNavigate?.();
            }}
          />
        ))}
      </ul>
    </div>
  );

  return (
    <Popover
      content={content}
      open={open}
      onOpenChange={setOpen}
      trigger="hover"
      placement="rightTop"
      arrow={false}
      mouseEnterDelay={0.08}
      mouseLeaveDelay={0.15}
      styles={{ container: { padding: 6, background: 'var(--brand-ink)', boxShadow: '0 12px 32px color-mix(in srgb, var(--brand-ink-deep) 35%, transparent)' } }}
      afterOpenChange={(visible) => {
        if (visible && fromKeyboard.current) list.current?.querySelector('a')?.focus();
        fromKeyboard.current = false;
      }}
    >
      <button
        ref={button}
        type="button"
        className={cx(s.item, hasActive && s.active)}
        aria-label={section.title}
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') fromKeyboard.current = true;
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            fromKeyboard.current = true;
            setOpen(true);
          }
        }}
      >
        <Icon className={s.icon} aria-hidden />
      </button>
    </Popover>
  );
}
