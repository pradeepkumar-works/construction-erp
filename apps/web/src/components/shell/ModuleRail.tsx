'use client';

import React from 'react';
import Link from 'next/link';
import { Tooltip } from 'antd';
import { MenuFoldOutlined, MenuUnfoldOutlined } from '@/components/common/icons';
import type { NavMenuModule } from '@erp/shared';
import { moduleScreenHref } from '@erp/shared';
import { BrandMark } from './BrandMark';
import { activeHref, type NavItem } from './nav';
import { TreeIcon } from './nav-icons';
import s from './Sidebar.module.css';

const cx = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

interface ModuleRailProps {
  pathname: string;
  /** The top links (Home, My work, Approvals) */
  top: NavItem[];
  menu: NavMenuModule[];
  /** The module the page on screen is in */
  current: string | undefined;
  pendingCount: number;
  /** Whether the column of the module's menu beside this one is shown */
  panelOpen: boolean;
  onTogglePanel: () => void;
}

/**
 * Two sidebars (Menu and names): the first column, the top links and every module the user may open, each with its icon
 * and name; the module's sub-modules and pages are in the column beside it (`Sidebar` over `moduleSections`).
 */
export function ModuleRail({ pathname, top, menu, current, pendingCount, panelOpen, onTogglePanel }: ModuleRailProps) {
  const active = activeHref(pathname, [{ key: 'top', items: top }]);
  return (
    <div className={s.modRail}>
      <Link href="/" className={s.brand} aria-label="Home">
        <BrandMark size={32} />
      </Link>
      <nav aria-label="Modules" className={s.modList}>
        <ul className={s.list}>
          {top.map((item) => {
            const on = item.href === active;
            const count = item.approvals ? pendingCount : 0;
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link href={item.href} className={cx(s.modItem, on && s.active)} aria-current={on ? 'page' : undefined} data-tour={item.approvals ? 'approvals' : undefined}>
                  <Icon className={s.icon} aria-hidden />
                  <span className={s.modLabel}>{item.label}</span>
                  {count > 0 && <span className={s.count}>{count.toLocaleString('en-IN')}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className={s.rule} role="separator" />
        <ul className={s.list}>
          {menu.map((m) => {
            const on = m.key === current;
            return (
              <li key={m.key}>
                <Tooltip title={m.label} placement="right" mouseEnterDelay={0.4}>
                  <Link href={moduleScreenHref(m.key)} className={cx(s.modItem, on && s.active)} aria-current={on ? (pathname === moduleScreenHref(m.key) ? 'page' : 'true') : undefined}>
                    <TreeIcon name={m.icon} className={s.icon} />
                    <span className={s.modLabel}>{m.label}</span>
                  </Link>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className={s.foot}>
        <Tooltip title={panelOpen ? undefined : 'Show the module’s menu  ['} placement="right">
          <button type="button" className={s.item} onClick={onTogglePanel} aria-label={panelOpen ? 'Hide the module’s menu' : 'Show the module’s menu'} aria-expanded={panelOpen} aria-keyshortcuts="[">
            {panelOpen ? <MenuFoldOutlined className={s.icon} aria-hidden /> : <MenuUnfoldOutlined className={s.icon} aria-hidden />}
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
