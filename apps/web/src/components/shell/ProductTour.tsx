'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Tour } from 'antd';
import type { TourProps } from 'antd';
import type { AuthUser } from '@erp/shared';
import { PRODUCT_NAME, isGuest, isSupplier, mayApprove } from '@erp/shared';
import { readPref, writePref } from '@/lib/prefs';
import { searchShortcut } from './Sidebar';

/** Users who have seen the tour on this browser (their ids), or "*" for every user. */
export const PREF_TOUR = 'nirmaan.tour.seen';

/** The element a step points at: shell parts carry `data-tour`. */
/** Who has seen the tour, ignoring anything unreadable in storage. */
const seenBy = (): string[] | '*' => {
  const v = readPref<unknown>(PREF_TOUR, []);
  return v === '*' ? '*' : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
};

const at = (name: string) => () => document.querySelector<HTMLElement>(`[data-tour="${name}"]`);

interface Step {
  /** `data-tour` of the element; none = centred on the page */
  target?: string;
  title: string;
  description: string;
  placement?: TourProps['placement'];
}

function stepsFor(user: AuthUser, mobile: boolean): Step[] {
  const guest = isGuest(user.roleKey);
  const first = user.fullName.split(' ')[0];
  const steps: (Step | false)[] = [
    {
      title: `Welcome to ${PRODUCT_NAME}, ${first}`,
      description: 'A quick look around the screen. Leave it any time; Help (?) at the top right has it again.',
    },
    mobile
      ? { target: 'menu', title: 'Your pages', description: 'The menu opens every page your role uses, grouped by module: Site, Materials, Client billing, Reports and more.', placement: 'bottom' }
      : {
          target: 'sidebar',
          title: 'Your pages',
          description: isSupplier(user.roleKey)
            ? 'Your enquiries, orders, invoices and payments with this company.'
            : guest
            ? 'The projects you follow and what the contractor shares with you.'
            : 'Every page your role uses, grouped by module: Site, Materials, Client billing, Reports and more. Press [ to fold it to icons and back.',
          placement: 'right',
        },
    !mobile && {
      target: 'modules',
      title: 'Your pages',
      description: 'Home holds every module your role uses. In a module, its pages run along the bar at the top.',
      placement: 'bottom',
    },
    mayApprove(user) && {
      target: 'approvals',
      title: 'Waiting for you',
      description: 'Entries that need your approval. Approve, reject or request changes with a note; the person who filed them is told.',
      placement: mobile ? 'bottom' : 'right',
    },
    {
      target: 'project',
      title: 'Work on one project',
      description: 'Pick a project here and every list shows that project only, until you switch back to All projects. It is remembered on this browser.',
      placement: 'bottom',
    },
    {
      target: 'search',
      title: 'Jump anywhere',
      description: `Find a page, a project or a record by its name or number. ${searchShortcut()} opens it from any page.`,
      placement: 'bottom',
    },
    {
      target: 'ask',
      title: `Ask ${PRODUCT_NAME}`,
      description: 'Ask about your projects, bills, orders or stock in plain words, in English or Hindi. Answers come from the records you can see, with a link to each one.',
      placement: 'bottom',
    },
    {
      target: 'new',
      title: 'Start something new',
      description: 'A daily report, progress entry, indent and whatever else your role files, from any page.',
      placement: 'bottomRight',
    },
    {
      target: 'notifications',
      title: 'Notifications',
      description: `Approvals, reminders and alerts arrive here, and on your phone too when you use the ${PRODUCT_NAME} app.`,
      placement: 'bottomRight',
    },
    {
      target: 'help',
      title: 'Help',
      description: 'Keyboard shortcuts, what has changed lately, and this tour again whenever you like.',
      placement: 'bottomRight',
    },
    {
      target: 'account',
      title: 'Your account',
      description: 'Choose light or dark and how compact pages are, or sign out.',
      placement: 'bottomRight',
    },
  ];
  return steps.filter((s): s is Step => !!s);
}

/**
 * The product tour (v4 item 51): a few steps over the app shell, shown once per user on this browser after they first
 * sign in, and again from Help. Steps whose element is not on screen (search for guests) are left out, and
 * so is approvals for roles that approve nothing.
 */
export function ProductTour({ user, mobile, open, onClose }: { user: AuthUser; mobile: boolean; open: boolean; onClose: () => void }) {
  const [current, setCurrent] = useState(0);
  // Worked out when the tour opens, so it follows what is on screen then.
  const steps = useMemo<TourProps['steps']>(
    () =>
      open
        ? stepsFor(user, mobile)
            .filter((s) => {
              if (!s.target) return true;
              const el = at(s.target)();
              return !!el && el.getClientRects().length > 0;
            })
            .map((s) => ({ title: s.title, description: s.description, placement: s.placement, target: s.target ? (at(s.target) as () => HTMLElement) : null }))
        : [],
    [open, user, mobile],
  );

  useEffect(() => {
    if (open) setCurrent(0);
  }, [open]);

  const close = () => {
    const seen = seenBy();
    if (seen !== '*' && !seen.includes(user.id)) writePref(PREF_TOUR, [...seen, user.id]);
    onClose();
  };

  return <Tour open={open} steps={steps} current={current} onChange={setCurrent} onClose={close} onFinish={close} rootClassName="product-tour" />;
}

/**
 * Whether to start the tour by itself: the first time this user signs in on this browser, outside support visits and
 * browsers driven by test tools (it would cover the page they check).
 */
export function shouldAutoStartTour(user: AuthUser) {
  if (user.support || navigator.webdriver) return false;
  const seen = seenBy();
  return seen !== '*' && !seen.includes(user.id);
}
