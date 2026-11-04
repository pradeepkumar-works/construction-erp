'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Avatar, Badge, Breadcrumb, Button, Drawer, Dropdown, Flex, Grid, Layout, Space, Tooltip, Typography } from 'antd';
import { AppTag } from '@/components/common/AppTag';
import type { MenuProps } from 'antd';
import { BgColorsOutlined, CheckOutlined, ColumnHeightOutlined, LogoutOutlined, MenuOutlined, QuestionCircleOutlined, SearchOutlined, UserOutlined } from '@/components/common/icons';
import type { AuthUser, NavLook } from '@erp/shared';
import { NAV_LOOKS, NAV_LOOK_LABELS, PRODUCT_NAME, canUseAi, isGuest, isSupplier, mayApprove, moduleScreenHref, navPainted } from '@erp/shared';
import { useAuth } from '@/lib/auth';
import { useAppearance, type Density, type ThemeMode } from '@/lib/appearance';
import { ProjectScopeProvider } from '@/lib/project-scope';
import { readPref, writePref } from '@/lib/prefs';
import { askShortcutLabel, isAskShortcut, singleKeysOn } from '@/lib/shortcuts';
import { useAiStatus, usePendingApprovals, useProjects, useSaveOwnLook } from '@/lib/queries';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { SparkleIcon } from '@/components/ai/SparkleIcon';
import { AskContext } from '@/lib/ask';
import { tk } from '@/ds';
import { BrandMark } from './BrandMark';
import { CommandPalette } from './CommandPalette';
import { HelpButton, dialogOpen, isTyping, useHelpMenu } from './HelpMenu';
import { MessageBar } from './MessageBar';
import { NewMenu } from './NewMenu';
import { ProjectSwitcher } from './ProjectSwitcher';
import { CompanySwitcher, useCompanyMenu } from './CompanySwitcher';
import { moduleSections, navFor, navTrail } from './nav';
import { ModuleRail } from './ModuleRail';
import { TreeIcon } from './nav-icons';
import { PageTrailProvider } from './page-trail';
import { useShellPins } from './pins';
import { SEARCH_REQUEST } from './search-request';
import { PREF_RAIL, Sidebar, searchShortcut } from './Sidebar';
import { ProductTour, shouldAutoStartTour } from './ProductTour';
import { PinButton, TopBar, topBarHeight } from './TopBar';
import { useMenuPlace, useNavMenu } from './menu';
import { ShellColours } from './ShellColours';
import { StickyTopContext } from '@/lib/sticky';
import t from './TopBar.module.css';
import s from './Sidebar.module.css';

const { Header, Content } = Layout;

// The assistant's panel (and Ant Design X with it) loads the first time someone opens it.
const AskPanel = dynamic(() => import('@/components/ai/AskPanel'), { ssr: false });


export function AppShell({ user, children }: { user: AuthUser; children: React.ReactNode }) {
  return (
    <ProjectScopeProvider userId={user.id} enabled={!isGuest(user.roleKey)}>
      <Shell user={user}>{children}</Shell>
    </ProjectScopeProvider>
  );
}

function Shell({ user, children }: { user: AuthUser; children: React.ReactNode }) {
  const pathname = usePathname();
  const { logout, refresh } = useAuth();
  const screens = Grid.useBreakpoint();
  const isMobile = screens.md === false;
  // Below xl the header drops the words beside its icons.
  const roomy = !!screens.xl;
  // Only the widest screens have room for words beside the Ask button and a full-width search box.
  const spacious = !!screens.xxl;
  // The rail is remembered; with no choice yet, narrower laptop screens start with it.
  const [rail, setRail] = useState<boolean>(() => readPref<boolean | null>(PREF_RAIL, null) ?? window.innerWidth < 1100);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const approver = mayApprove(user);
  const { data: pending } = usePendingApprovals(approver);
  const pendingCount = approver ? (pending?.length ?? 0) : 0;
  const sections = useMemo(() => navFor(user), [user]);
  // Menu and names: the company's menu across the top (Home holds the modules, a module's page its sub-modules) or down the side.
  const { settings: navSettings, menu } = useNavMenu(user);
  // The client's and a supplier's portals keep the plain sidebar.
  const layout = isGuest(user.roleKey) || isSupplier(user.roleKey) ? 'SIDEBAR' : navSettings.layout;
  // A phone has no room for the modules across the top: those layouts draw as the top bar there, with the menu drawer.
  const topBar = layout === 'TOP_BAR' || layout === 'TWO_BARS' || (isMobile && layout === 'TOP_AND_SIDE');
  const topAndSide = layout === 'TOP_AND_SIDE' && !isMobile;
  const twoSidebars = layout === 'TWO_SIDEBARS' && !isMobile;
  const menuPlace = useMenuPlace(layout === 'SIDEBAR' ? [] : menu);
  const look = navSettings.look;
  const modulesOnBar = !isMobile && (layout === 'TWO_BARS' || layout === 'TOP_AND_SIDE');
  // Where the menu takes more of the width (the modules across the top, or two sidebars open), the tools are icons only.
  const compactTools = (layout === 'TOP_BAR' && look === 'BAR' && !!menuPlace) || modulesOnBar || (twoSidebars && !rail);
  const ownLook = useSaveOwnLook();
  // Which parts take the menu's colours (the rest are plain); Floating stands the sidebar on the canvas.
  const painted = navPainted({ ...navSettings, layout });
  const sidebarLook = navSettings.sidebarLook;
  const colouredHeader = !topBar && !topAndSide && painted.top;
  // On a bar in the menu's colours the search box and Ask's mark take the bar's own colours (TopBar.module.css).
  const navyBar = painted.top;
  const trail = useMemo(() => navTrail(sections, pathname), [sections, pathname]);
  const guest = isGuest(user.roleKey);
  const { data: projects } = useProjects(!guest);
  const { place: pinnable, isPinned, togglePin, pinSections, recentPages } = useShellPins(user);
  // Pinned sits under the top links; pages and records opened lately are in Search (Ctrl K).
  const sidebarSections = useMemo(() => [...sections.filter((x) => !x.title), ...pinSections, ...sections.filter((x) => x.title)], [sections, pinSections]);
  const projectCrumb = useMemo(() => {
    const id = pathname.match(/^\/projects\/([\w-]+)/)?.[1];
    return id ? projects?.find((p) => p.id === id) : undefined;
  }, [pathname, projects]);
  const [touring, setTouring] = useState(false);
  const { prefs, setPrefs } = useAppearance();
  // Ask Nirmaan: shown when the company has it on, and to admins while it is off so they can find the switch.
  const mayAsk = canUseAi(user.roleKey) && !user.support;
  const { data: aiStatus } = useAiStatus(mayAsk);
  const askVisible = mayAsk && (aiStatus ? aiStatus.enabled || aiStatus.reason === 'CAP_REACHED' || aiStatus.reason === 'READ_ONLY' || (aiStatus.canManage && aiStatus.reason === 'COMPANY_OFF') : !!user.ai);
  const [askOpen, setAskOpen] = useState(false);
  const [askLoaded, setAskLoaded] = useState(false);
  const [askQuestion, setAskQuestion] = useState<string | null>(null);
  const openAsk = useCallback((question?: string) => {
    setMobileOpen(false);
    setSearchOpen(false);
    setAskLoaded(true);
    setAskOpen(true);
    if (question) setAskQuestion(question);
  }, []);
  const takeAskQuestion = useCallback(() => setAskQuestion(null), []);
  // Stable, so the palette's targets (built with it) are not rebuilt on every render of the shell.
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearchQuery('');
  }, []);
  // Home's "Search records for …" opens Search with its words.
  useEffect(() => {
    const onRequest = (e: Event) => {
      setSearchQuery((e as CustomEvent<string>).detail ?? '');
      setSearchOpen(true);
    };
    window.addEventListener(SEARCH_REQUEST, onRequest);
    return () => window.removeEventListener(SEARCH_REQUEST, onRequest);
  }, []);
  const askContext = useMemo(() => ({ available: askVisible && !!aiStatus?.enabled, ask: (q: string) => openAsk(q) }), [askVisible, aiStatus?.enabled, openAsk]);

  // The first time someone signs in on this browser, once the shell has laid out.
  useEffect(() => {
    if (!shouldAutoStartTour(user)) return;
    const t = window.setTimeout(() => setTouring(true), 600);
    return () => window.clearTimeout(t);
  }, [user]);

  const toggleRail = useCallback(() => {
    setRail((r) => {
      writePref(PREF_RAIL, !r);
      return !r;
    });
  }, []);

  // Ctrl K / ⌘K opens quick-jump anywhere; Alt J / ⌘J opens Ask; [ folds the sidebar to its rail and back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'k') {
        if (guest) return;
        e.preventDefault();
        setMobileOpen(false);
        setSearchOpen((o) => !o);
      } else if (isAskShortcut(e)) {
        if (!askVisible) return;
        e.preventDefault();
        if (askOpen) setAskOpen(false);
        else openAsk();
      } else if (e.key === '[' && !e.ctrlKey && !e.metaKey && !e.altKey && !isMobile && singleKeysOn() && !isTyping(e.target) && !dialogOpen()) {
        toggleRail();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [guest, isMobile, toggleRail, askVisible, askOpen, openAsk]);

  // Close the drawer when the page changes (links, quick-jump or the browser's back button).
  useEffect(() => setMobileOpen(false), [pathname]);

  // After moving to another page within the app, focus goes to its heading, so a keyboard or screen reader
  // user starts on the new page rather than on the link they left, and hears where they are. A full load keeps the browser's.
  const firstPath = useRef(true);
  useEffect(() => {
    if (firstPath.current) {
      firstPath.current = false;
      return;
    }
    let tries = 0;
    let timer = 0;
    const focus = () => {
      const heading = document.getElementById('page-title');
      if (heading) heading.focus({ preventScroll: true });
      else if (++tries < 20) timer = window.setTimeout(focus, 100);
      else document.getElementById('main-content')?.focus({ preventScroll: true });
    };
    timer = window.setTimeout(focus, 0);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  // The page's last crumb (a record's kind, a project's code) joins the header's trail, so there is one breadcrumb.
  const [trailTail, setTrailTail] = useState<string | null>(null);
  const headerTrail = !isMobile && !!trail && !topBar && !topAndSide;
  const pageTrail = useMemo(() => ({ shown: headerTrail, setTail: setTrailTail }), [headerTrail]);

  const openSearch = guest
    ? undefined
    : () => {
        setMobileOpen(false);
        setSearchOpen(true);
      };

  const help = useHelpMenu({
    withSearch: !!openSearch,
    withAsk: askVisible,
    onTour: () => {
      setMobileOpen(false);
      setTouring(true);
    },
  });

  const companyMenu = useCompanyMenu(user);
  const userMenu: MenuProps['items'] = [
    { key: 'info', icon: <UserOutlined />, label: `${user.email}`, disabled: true },
    { type: 'divider' },
    // A phone's header has no room for the company switcher: the companies are listed here (a submenu would open off screen).
    ...(isMobile && companyMenu ? [{ key: 'company', type: 'group' as const, label: 'Company', children: companyMenu.items }, { type: 'divider' as const }] : []),
    // A phone's header has room for search, New, the bell and the account only: Ask and Help live here.
    ...(isMobile
      ? [
          ...(askVisible ? [{ key: 'ask', icon: <SparkleIcon style={{ color: tk.color.accent.solid }} />, label: `Ask ${PRODUCT_NAME}`, onClick: () => openAsk() }] : []),
          { key: 'help', icon: <QuestionCircleOutlined />, label: help.unseen ? <Badge dot offset={[6, 0]}>Help</Badge> : 'Help', children: help.items },
          { type: 'divider' as const },
        ]
      : []),
    {
      key: 'mode',
      icon: <BgColorsOutlined />,
      label: 'Appearance',
      children: ([['light', 'Light'], ['dark', 'Dark'], ['system', 'Same as this device']] as [ThemeMode, string][]).map(([mode, label]) => ({
        key: `mode-${mode}`,
        label,
        icon: prefs.mode === mode ? <CheckOutlined /> : <span className="menu-check-gap" />,
        onClick: () => setPrefs({ mode }),
      })),
    },
    {
      key: 'density',
      icon: <ColumnHeightOutlined />,
      label: 'Density',
      children: ([['comfortable', 'Comfortable'], ['compact', 'Compact']] as [Density, string][]).map(([density, label]) => ({
        key: `density-${density}`,
        label,
        icon: prefs.density === density ? <CheckOutlined /> : <span className="menu-check-gap" />,
        onClick: () => setPrefs({ density }),
      })),
    },
    // Menu and names: a person's own look for the top bar, where the company lets people choose.
    ...(layout === 'TOP_BAR' && navSettings.personalLook
      ? [
          {
            key: 'look',
            icon: <TreeIcon name="panels-top-left" />,
            label: 'Top bar look',
            children: ([[null, `Your company’s (${NAV_LOOK_LABELS[user.navigation?.look ?? 'NAVY']})`], ...NAV_LOOKS.map((l) => [l, NAV_LOOK_LABELS[l]])] as [NavLook | null, string][]).map(([l, label]) => ({
              key: `look-${l ?? 'company'}`,
              label,
              icon: (user.ownLook ?? null) === l ? <CheckOutlined /> : <span className="menu-check-gap" />,
              onClick: () => ownLook.mutate(l, { onSuccess: () => void refresh() }),
            })),
          },
        ]
      : []),
    { type: 'divider' },
    { key: 'logout', icon: <LogoutOutlined />, label: 'Sign out', onClick: logout },
  ];

  const initials = user.fullName
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // The right of the header: search, Ask, New, Help, the bell and the account; the top bar's module look has room for icons only.
  const toolsRoomy = roomy && !compactTools;
  const toolsSpacious = spacious && !compactTools;
  const tools = (
    <Flex gap={tk.space[1]} align="center" style={{ flexShrink: 0 }}>
      {openSearch &&
        (isMobile || !toolsRoomy ? (
          <Tooltip title={isMobile ? undefined : `Search  ${searchShortcut()}`}>
            <Button type="text" icon={<SearchOutlined />} onClick={openSearch} aria-label="Search pages, projects and records" data-tour="search" />
          </Tooltip>
        ) : (
          <Button
            color="default"
            variant="filled"
            icon={<SearchOutlined />}
            onClick={openSearch}
            aria-keyshortcuts="Control+K Meta+K"
            data-tour="search"
            style={{ width: toolsSpacious || !askVisible ? 260 : 220, justifyContent: 'flex-start', color: navyBar ? undefined : tk.color.text.faint }}
          >
            <span style={{ flex: 1, textAlign: 'left' }}>Search or jump to…</span>
            <Typography.Text keyboard type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
              {searchShortcut()}
            </Typography.Text>
          </Button>
        ))}
      {askVisible && !isMobile && (
        <Tooltip title={`Ask ${PRODUCT_NAME}  ${askShortcutLabel()}`}>
          <Button
            type="text"
            icon={<SparkleIcon style={{ color: navyBar ? tk.color.chrome.accent : tk.color.accent.solid }} />}
            onClick={() => (askOpen ? setAskOpen(false) : openAsk())}
            aria-label={toolsSpacious ? undefined : `Ask ${PRODUCT_NAME}`}
            aria-keyshortcuts="Alt+J Meta+J"
            aria-expanded={askOpen}
            data-tour="ask"
          >
            {toolsSpacious ? 'Ask' : null}
          </Button>
        </Tooltip>
      )}
      <span style={{ marginInline: tk.space[1] }}>
        <NewMenu user={user} compact={isMobile || !toolsRoomy} />
      </span>
      {isMobile ? null : <HelpButton items={help.items} unseen={help.unseen} />}
      <span data-tour="notifications">
        <NotificationBell />
      </span>
      <Dropdown menu={{ items: userMenu }} trigger={['click']}>
        <Button type="text" style={{ height: 40, padding: `0 ${tk.space[2]}` }} data-tour="account" aria-label={toolsRoomy ? undefined : `${user.fullName}, account`}>
          <Space>
            {isMobile && help.unseen ? (
              <Badge dot offset={[-2, 2]}>
                <Avatar size="small" style={{ background: tk.color.accent.solid, color: tk.color.text.onAccent, fontWeight: tk.type.title.fontWeight }}>
                  {initials}
                </Avatar>
              </Badge>
            ) : (
            <Avatar size="small" style={{ background: tk.color.accent.solid, color: tk.color.text.onAccent, fontWeight: tk.type.title.fontWeight }}>
              {initials}
            </Avatar>
            )}
            {toolsRoomy && (
              <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: tk.leading.tight }}>
                <span style={{ fontWeight: tk.type.title.fontWeight, fontSize: tk.type.body.fontSize }} translate="no">
                  {user.fullName}
                </span>
                <span className="text-muted" style={{ fontSize: tk.type.caption.fontSize }}>
                  {user.roleName}
                </span>
              </span>
            )}
          </Space>
        </Button>
      </Dropdown>
    </Flex>
  );

  const body = (
    <div style={{ display: 'flex', alignItems: 'flex-start', flex: 1 }}>
      <Content id="main-content" tabIndex={-1} style={{ outline: 'none', flex: 1, minWidth: 0 }}>
        <MessageBar user={user} />
        <PageTrailProvider value={pageTrail}>
          <AskContext.Provider value={askContext}>{children}</AskContext.Provider>
        </PageTrailProvider>
      </Content>
      {help.dialogs}
      {askVisible && askLoaded && <AskPanel open={askOpen} onClose={() => setAskOpen(false)} user={user} status={aiStatus} mobile={isMobile} question={askQuestion} onQuestionTaken={takeAskQuestion} />}
    </div>
  );

  if (topBar) {
    const pin = pinnable && <PinButton pinned={isPinned} onToggle={togglePin} />;
    return (
      <StickyTopContext.Provider value={topBarHeight(layout, look, isMobile, !!menuPlace)}>
        <Layout style={{ minHeight: '100vh' }} className={layout === 'TOP_BAR' && look === 'FRAME' ? t.frameBody : undefined}>
          <ShellColours choice={navSettings} />
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          {isMobile && (
            <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} placement="left" size={288} closable={false} styles={{ body: { padding: 0, background: painted.side ? tk.color.chrome.fill : tk.color.surface.base, backgroundAttachment: 'fixed' } }}>
              <Sidebar user={user} sections={sidebarSections} pendingCount={pendingCount} onNavigate={() => setMobileOpen(false)} plain={!painted.side} />
            </Drawer>
          )}
          {!guest && <CommandPalette open={searchOpen} onClose={closeSearch} sections={sections} recentPages={recentPages} withProjects user={user} onAsk={askVisible ? openAsk : undefined} initialQuery={searchQuery} />}
          <ProductTour user={user} mobile={isMobile} open={touring} onClose={() => setTouring(false)} />
          <TopBar user={user} layout={layout} look={look} painted={painted} mobile={isMobile} menu={menu} place={menuPlace} pendingCount={pendingCount} tools={tools} onOpenMenu={() => setMobileOpen(true)} pin={pin || undefined} />
          {layout === 'TOP_BAR' && look === 'FRAME' && !isMobile ? <div className={t.sheet}>{body}</div> : body}
        </Layout>
      </StickyTopContext.Provider>
    );
  }

  // Top bar and sidebar, Two sidebars: the module on screen has its sub-modules and pages in a sidebar; with no module
  // open (Home, My work) it holds the top links and the pins.
  const topSections = sections.filter((x) => !x.title);
  const moduleHead = menuPlace && (
    <Link href={moduleScreenHref(menuPlace.module.key)} className={s.head} aria-label={rail && topAndSide ? `${menuPlace.module.label} overview` : undefined}>
      <TreeIcon name={menuPlace.module.icon} className={s.icon} />
      <span className={s.label}>{menuPlace.module.label}</span>
    </Link>
  );
  const asideClass = (...more: (string | false)[]) => [s.aside, !painted.side && s.plain, ...more].filter(Boolean).join(' ');

  if (topAndSide) {
    const pin = pinnable && <PinButton pinned={isPinned} onToggle={togglePin} />;
    const panel = menuPlace ? [...topSections, ...moduleSections(menuPlace.module)] : [...topSections, ...pinSections];
    return (
      <StickyTopContext.Provider value={topBarHeight(layout, look, false, false)}>
        <Layout style={{ minHeight: '100vh' }}>
          <ShellColours choice={navSettings} />
          <a href="#main-content" className="skip-link">
            Skip to content
          </a>
          {!guest && <CommandPalette open={searchOpen} onClose={closeSearch} sections={sections} recentPages={recentPages} withProjects user={user} onAsk={askVisible ? openAsk : undefined} initialQuery={searchQuery} />}
          <ProductTour user={user} mobile={false} open={touring} onClose={() => setTouring(false)} />
          <TopBar user={user} layout={layout} look={look} painted={painted} mobile={false} menu={menu} place={menuPlace} pendingCount={pendingCount} tools={tools} onOpenMenu={() => setMobileOpen(true)} pin={pin || undefined} />
          <div style={{ display: 'flex', flex: 1, minWidth: 0 }}>
            <aside className={asideClass(s.asideUnderBar, rail && s.asideRail, painted.side && painted.top && s.asideHeader)}>
              <Sidebar user={user} sections={panel} pendingCount={pendingCount} rail={rail} onToggleRail={toggleRail} head={moduleHead || null} />
            </aside>
            {body}
          </div>
        </Layout>
      </StickyTopContext.Provider>
    );
  }

  return (
    <Layout hasSider style={{ minHeight: '100vh' }}>
      <ShellColours choice={navSettings} />
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>
      {!isMobile && (
        twoSidebars ? (
          <aside className={asideClass(s.asideTwo, painted.side && painted.top && s.asideHeader, sidebarLook === 'FLOATING' && s.asideFloating)} data-tour="sidebar">
            <ModuleRail pathname={pathname} top={topSections.flatMap((x) => x.items)} menu={menu} current={menuPlace?.module.key} pendingCount={pendingCount} panelOpen={!rail} onTogglePanel={toggleRail} />
            {!rail && <Sidebar user={user} sections={menuPlace ? moduleSections(menuPlace.module) : [...topSections, ...pinSections]} pendingCount={pendingCount} head={moduleHead || null} />}
          </aside>
        ) : (
          <aside className={asideClass(rail && s.asideRail, painted.side && painted.top && s.asideHeader, sidebarLook === 'FLOATING' && s.asideFloating)} data-tour="sidebar">
            <Sidebar user={user} sections={sidebarSections} pendingCount={pendingCount} rail={rail} onToggleRail={toggleRail} />
          </aside>
        )
      )}
      {isMobile && (
        <Drawer open={mobileOpen} onClose={() => setMobileOpen(false)} placement="left" size={288} closable={false} styles={{ body: { padding: 0, background: painted.side ? tk.color.chrome.fill : tk.color.surface.base, backgroundAttachment: 'fixed' } }}>
          <Sidebar user={user} sections={sidebarSections} pendingCount={pendingCount} onNavigate={() => setMobileOpen(false)} plain={!painted.side} />
        </Drawer>
      )}
      {!guest && <CommandPalette open={searchOpen} onClose={closeSearch} sections={sections} recentPages={recentPages} withProjects user={user} onAsk={askVisible ? openAsk : undefined} initialQuery={searchQuery} />}
      <ProductTour user={user} mobile={isMobile} open={touring} onClose={() => setTouring(false)} />
      <Layout>
        <Header
          className={colouredHeader ? t.onChrome : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: isMobile ? `0 ${tk.space[3]}` : `0 ${tk.space[6]}`,
            borderBottom: colouredHeader || sidebarLook === 'FLOATING' ? 'none' : tk.line('hairline'),
            position: 'sticky',
            top: 0,
            zIndex: 10,
            height: 56,
            lineHeight: 'normal',
            ...(colouredHeader
              ? { background: tk.color.chrome.fill, backgroundAttachment: 'fixed', color: tk.color.chrome.ink }
              : { background: sidebarLook === 'FLOATING' ? tk.color.surface.canvas : tk.color.surface.base }),
            gap: tk.space[3],
          }}
        >
          <Flex gap={isMobile ? tk.space[2] : tk.space[3]} align="center" style={{ minWidth: 0, flex: 1 }}>
            {isMobile ? (
              <>
                <Button type="text" icon={<MenuOutlined />} onClick={() => setMobileOpen(true)} aria-label="Open menu" data-tour="menu" />
                <BrandMark size={28} />
                {approver && pendingCount > 0 && (
                  <Link href="/approvals">
                    <AppTag meaning="waiting" style={{ margin: 0 }}>
                      {pendingCount} waiting
                    </AppTag>
                  </Link>
                )}
              </>
            ) : (
              <>
                {/* Below the widest screens the company is an icon (the sidebar names it), so the trail keeps its room. */}
                <CompanySwitcher user={user} compact={!spacious} maxWidth={220} />
                {!guest && (
                  <span data-tour="project" style={{ flexShrink: 0 }}>
                    <ProjectSwitcher width={roomy ? (companyMenu && !spacious ? 200 : 240) : 200} />
                  </span>
                )}
                {/* The header says where you are. */}
                {trail && (
                  <Breadcrumb
                    className="header-crumbs"
                    items={[
                      ...(trail.section ? [{ title: trail.section }] : []),
                      { title: pathname === trail.item.href ? trail.item.label : <Link href={trail.item.href}>{trail.item.label}</Link> },
                      ...(projectCrumb
                        ? [{ title: <span title={projectCrumb.name}>{projectCrumb.name}</span> }]
                        : trailTail && pathname !== trail.item.href
                          ? [{ title: <span aria-current="page">{trailTail}</span> }]
                          : []),
                    ]}
                  />
                )}
                {pinnable && (
                  <Tooltip title={isPinned ? 'Unpin from Home' : 'Pin to Home'}>
                    <Button
                      type="text"
                      size="small"
                      aria-label="Pin to Home"
                      aria-pressed={isPinned}
                      icon={<TreeIcon name={isPinned ? 'pin-off' : 'pin'} />}
                      onClick={togglePin}
                      // A long breadcrumb gives way first; the pin keeps its 24 px target.
                      style={{ flexShrink: 0, color: isPinned ? (colouredHeader ? tk.color.chrome.accent : tk.color.accent.solid) : undefined }}
                    />
                  </Tooltip>
                )}
              </>
            )}
          </Flex>
          {tools}
        </Header>
        {/* Ask Nirmaan opens as a column beside the page on a wide screen, so the page narrows instead of being covered. */}
        {body}
      </Layout>
    </Layout>
  );
}
