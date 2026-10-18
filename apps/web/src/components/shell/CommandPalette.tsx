'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from 'antd';
import {
  AlertOutlined,
  BankOutlined,
  BellOutlined,
  FileTextOutlined,
  FolderOpenOutlined,
  HistoryOutlined,
  InboxOutlined,
  LoadingOutlined,
  ProjectOutlined,
  SearchOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { AuthUser, SearchHitDto, SearchKind, SubmissionStatus } from '@erp/shared';
import { PRODUCT_NAME, SEARCH_KINDS, SEARCH_KIND_LABELS, SEARCH_MIN_LENGTH, SUBMISSION_STATUSES } from '@erp/shared';
import { confirmLeave } from '@/lib/leave-guard';
import { useProjects, useSearch } from '@/lib/queries';
import { useProjectScope } from '@/lib/project-scope';
import { requestNew } from '@/lib/new-intent';
import { recentRecords, rememberRecord, type RecentRecord } from '@/lib/recent';
import { StatusTag } from '@/components/common/StatusTag';
import type { NavIcon, NavSection } from './nav';
import type { RecentPage } from './pins';
import { newEntriesFor, type NewEntry } from './NewMenu';
import { SparkleIcon } from '@/components/ai/SparkleIcon';
import s from './Sidebar.module.css';
import { useDebounced } from '@/lib/debounce';

interface Target {
  key: string;
  label: string;
  /** Shown after the label, quieter: a record's vendor and project. */
  sub?: string | null;
  hint?: string;
  icon: NavIcon;
  group: string;
  /** Lower-cased text the query is matched against (pages, projects, actions). */
  text: string;
  status?: SubmissionStatus;
  go: () => void;
}

const KIND_ICONS: Partial<Record<SearchKind, NavIcon>> = { risk: AlertOutlined, document: FolderOpenOutlined, vendor: ShopOutlined, client: BankOutlined, item: InboxOutlined, person: UserOutlined };
const STATUSES = new Set<string>(SUBMISSION_STATUSES);
/** How many recently opened records and pages lead the list before anything is typed. */
const RECENT_SHOWN = 8;
/** Typed as a question: Ask Nirmaan goes first rather than last. */
const QUESTION = /\?\s*$|^(what|which|who|how|why|when|where|is|are|did|do|does|show|list|tell|kitn|kya|kaun|kab|kahan|kaise)\b/i;

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

/**
 * Search everything (UI roadmap item 62), from the keyboard (Ctrl K / ⌘K) or the header's search box: pages, projects,
 * records by number or name (through `GET /search`, which applies each list's own access rules), and actions such as
 * "New daily report for Jajpur". With nothing typed it leads with the records and pages opened lately (UX item 87).
 */
export function CommandPalette({
  open,
  onClose,
  sections,
  recentPages = [],
  withProjects,
  user,
  onAsk,
}: {
  open: boolean;
  onClose: () => void;
  sections: NavSection[];
  /** Pages opened lately (from the sidebar's pins), newest first. */
  recentPages?: RecentPage[];
  withProjects: boolean;
  user: AuthUser;
  /** Hands what was typed to Ask Nirmaan, when the assistant is on */
  onAsk?: (question: string) => void;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const [recent, setRecent] = useState<RecentRecord[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const { data: projects } = useProjects(open && withProjects);
  const [, setProjectScope] = useProjectScope();
  const term = useDebounced(query, 200);
  const search = useSearch(term, open && withProjects);
  const searching = search.isFetching || (query.trim() !== term.trim() && query.trim().length >= SEARCH_MIN_LENGTH);

  const navigate = useCallback(
    (href: string) => {
      onClose();
      // An open form with unsaved changes asks first.
      void confirmLeave().then((ok) => ok && router.push(href));
    },
    [onClose, router],
  );

  const pages = useMemo<Target[]>(() => {
    const list: Target[] = sections.flatMap((sec) =>
      sec.items.map((i) => ({ key: i.href, label: i.label, hint: sec.title ?? '', icon: i.icon, group: 'Pages', text: `${i.label} ${i.keywords ?? ''}`.toLowerCase(), go: () => navigate(i.href) })),
    );
    if (!list.some((t) => t.key === '/notifications')) {
      list.push({ key: '/notifications', label: 'Notifications', hint: '', icon: BellOutlined, group: 'Pages', text: 'notifications alerts inbox', go: () => navigate('/notifications') });
    }
    return list;
  }, [sections, navigate]);

  const projectTargets = useMemo<Target[]>(
    () =>
      (projects ?? []).map((p) => ({
        key: p.id,
        label: p.name,
        hint: p.code,
        icon: ProjectOutlined,
        group: 'Projects',
        text: `${p.name} ${p.code} ${p.clientName ?? ''} ${p.location ?? ''}`.toLowerCase(),
        go: () => navigate(`/projects/${p.id}`),
      })),
    [projects, navigate],
  );

  /** "New DPR", or "new dpr for jajpur": the project after "for" is picked in the header before the form opens. */
  const actions = useMemo<Target[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const entries = newEntriesFor(user).flat();
    const start = (e: NewEntry, projectId?: string) => {
      onClose();
      if (projectId) setProjectScope(projectId);
      requestNew(e.kind, () => void confirmLeave().then((ok) => ok && router.push(e.href)));
    };
    const at = q.match(/^(.*?)\s+for\s+(.+)$/);
    if (at && withProjects) {
      const project = rank(projectTargets, at[2])[0];
      const p = project ? (projects ?? []).find((x) => x.id === project.key) : undefined;
      if (p) {
        return rank(
          entries.map((e) => ({ key: `${e.kind}:${p.id}`, label: `${e.action} for ${p.name}`, hint: p.code, icon: () => e.icon, group: 'Actions', text: `${e.action} ${e.label} new`.toLowerCase(), go: () => start(e, p.id) })),
          at[1],
        );
      }
    }
    return rank(
      entries.map((e) => ({ key: e.kind, label: e.action, icon: () => e.icon, group: 'Actions', text: `${e.action} ${e.label} new`.toLowerCase(), go: () => start(e) })),
      q,
    );
  }, [query, user, projectTargets, projects, withProjects, setProjectScope, router, onClose]);

  const records = useMemo<Target[]>(() => {
    if (query.trim().length < SEARCH_MIN_LENGTH) return [];
    // Only the answer to what is in the box now: an earlier query's records would read as matches for this one.
    const hits = search.data?.q === query.trim().slice(0, 80) ? search.data.hits : [];
    const order = (h: SearchHitDto) => SEARCH_KINDS.indexOf(h.kind);
    return [...hits]
      .sort((a, b) => order(a) - order(b))
      .map((h) => ({
        key: `${h.kind}:${h.id}`,
        label: h.title,
        sub: h.subtitle,
        icon: KIND_ICONS[h.kind] ?? FileTextOutlined,
        group: SEARCH_KIND_LABELS[h.kind],
        text: '',
        status: h.status && STATUSES.has(h.status) ? (h.status as SubmissionStatus) : undefined,
        go: () => {
          rememberRecord({ href: h.href, title: h.title, kind: SEARCH_KIND_LABELS[h.kind] });
          navigate(h.href);
        },
      }));
  }, [search.data, query, navigate]);

  /** Records and pages opened lately, newest first, in one group. */
  const recentTargets = useMemo<Target[]>(
    () =>
      [
        ...recent.map((r) => ({ at: r.at, t: { key: r.href, label: r.title, sub: r.kind, icon: HistoryOutlined, group: 'Recent', text: `${r.title} ${r.kind}`.toLowerCase(), go: () => navigate(r.href) } })),
        ...recentPages
          .filter((p) => !recent.some((r) => r.href === p.item.href))
          .map((p) => ({ at: p.at, t: { key: p.item.href, label: p.item.label, sub: p.item.href.startsWith('/projects/') ? 'Project' : 'Page', icon: p.item.icon, group: 'Recent', text: '', go: () => navigate(p.item.href) } })),
      ]
        .sort((a, b) => b.at - a.at)
        .slice(0, RECENT_SHOWN)
        .map((r) => r.t),
    [recent, recentPages, navigate],
  );

  const askTarget = useMemo<Target | null>(() => {
    const q = query.trim();
    if (!onAsk || q.length < 3) return null;
    return { key: 'ask', label: `Ask ${PRODUCT_NAME}: “${q}”`, icon: SparkleIcon, group: 'Ask', text: '', go: () => onAsk(q) };
  }, [onAsk, query]);

  const results = useMemo(() => {
    if (!query.trim()) return [...recentTargets, ...pages, ...projectTargets.slice(0, 5)];
    const found = [...actions, ...rank(pages, query), ...rank(projectTargets, query).slice(0, 8), ...records];
    if (!askTarget) return found;
    return QUESTION.test(query.trim()) ? [askTarget, ...found] : [...found, askTarget];
  }, [actions, pages, projectTargets, records, recentTargets, query, askTarget]);

  useEffect(() => setIndex(0), [query]);
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setRecent(recentRecords());
    const t = window.setTimeout(() => input.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, [open]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      results[index]?.go();
    }
  };

  const placeholder = withProjects ? 'Search pages, projects, numbers (PO-2026-0012), vendors, people, or “new DPR for …”' : 'Search pages';
  const empty = results.length === 0 && !searching;

  return (
    <Modal open={open} onCancel={onClose} footer={null} closable={false} width={620} style={{ top: 88 }} destroyOnHidden styles={{ container: { padding: 0, overflow: 'hidden' } }} aria-label="Search">
      <div className={s.palette}>
        <div className={s.paletteInput}>
          {searching ? <LoadingOutlined aria-label="Searching" /> : <SearchOutlined aria-hidden />}
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={placeholder}
            aria-label="Search"
            role="combobox"
            aria-expanded
            aria-controls="palette-results"
            aria-activedescendant={results[index] ? `palette-${index}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <ul ref={listRef} id="palette-results" role="listbox" className={s.paletteList}>
          {empty && <li className={s.paletteEmpty}>Nothing matches “{query.trim()}”.</li>}
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
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events -- an option of the combobox: the search box takes the keys (aria-activedescendant) */}
                <li
                  id={`palette-${i}`}
                  data-index={i}
                  role="option"
                  aria-selected={i === index}
                  className={`${s.option} ${i === index ? s.optionActive : ''}`}
                  onMouseMove={() => i !== index && setIndex(i)}
                  onClick={() => t.go()}
                >
                  <Icon aria-hidden />
                  <span className={s.optionLabel}>
                    {t.label}
                    {t.sub ? <span className={s.optionSub}>{t.sub}</span> : null}
                  </span>
                  {t.status ? <StatusTag status={t.status} /> : null}
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
