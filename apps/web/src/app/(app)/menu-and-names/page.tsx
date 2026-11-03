'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, App, Button, Card, Checkbox, ColorPicker, Flex, Input, Segmented, Table, Typography } from 'antd';
import { CHROME_START_FILL, chromeStyle, tk } from '@/ds';
import type { NavFill, NavGradientAngle, NavLayout, NavLook, NavModuleSet, NavPaint, NavPalette, NavSettingsDto, NavSidebarLook } from '@erp/shared';
import {
  DEFAULT_NAV_SETTINGS,
  GRADIENT_PALETTES,
  NAV_LAYOUTS,
  NAV_LAYOUT_LABELS,
  NAV_LAYOUT_PARTS,
  NAV_LOOK_LABELS,
  NAV_PAINTS,
  NAV_PAINT_LABELS,
  NAV_MODULE_SET_LABELS,
  NAV_NAME_MAX,
  NAV_PALETTES,
  NAV_PALETTE_LABELS,
  NAV_SIDEBAR_LOOK_LABELS,
  canManageModules,
  navFillProblem,
  navModuleDefs,
  navPaintWords,
  navPainted,
  readableFill,
  type NavModuleDef,
} from '@erp/shared';
import { useAppearance } from '@/lib/appearance';
import { useAuth } from '@/lib/auth';
import { useNotify } from '@/lib/notify';
import { useNavSettings, useSaveNavSettings } from '@/lib/queries';
import { PageHeader } from '@/components/common/PageHeader';
import { PageSkeleton, QueryError } from '@/components/common/QueryState';
import { ChoiceCards, ColourPicture, MenuPicture, type Choice, type MenuPictureKind } from '@/components/menu/ChoiceCards';
import { setChromePreview } from '@/components/shell/ShellColours';
import { NoAccess } from '@/components/common/NoAccess';
import { TreeIcon } from '@/components/shell/nav-icons';

/** What each layout puts where, in a line; its picture is drawn with the parts in colour the company chose. */
const LAYOUT_WORDS: Record<NavLayout, string> = {
  SIDEBAR: 'Every module and page in a menu down the left, folded to icons when you need the room.',
  TOP_BAR: 'Home holds the modules as tiles; a module opens with its sub-modules in a bar across the top.',
  TOP_AND_SIDE: 'The modules across a bar at the top; the module you open has its sub-modules and pages down the left.',
  TWO_BARS: 'The modules across a first bar; the module you open has its sub-modules across a second bar under it.',
  TWO_SIDEBARS: 'The modules in a narrow column of icons; the module you open has its sub-modules and pages in a column beside it.',
};
const LAYOUT_PICTURE: Record<NavLayout, MenuPictureKind> = { SIDEBAR: 'SIDEBAR', TOP_BAR: 'NAVY', TOP_AND_SIDE: 'TOP_AND_SIDE', TWO_BARS: 'TWO_BARS', TWO_SIDEBARS: 'TWO_SIDEBARS' };
// Layouts read best in the order people know them: everything down the side, everything on top, then the mixes.
const LAYOUT_ORDER: NavLayout[] = ['SIDEBAR', 'TOP_BAR', 'TOP_AND_SIDE', 'TWO_BARS', 'TWO_SIDEBARS'];

const SIDEBAR_LOOKS: Choice<NavSidebarLook>[] = [
  { value: 'RAIL', label: NAV_SIDEBAR_LOOK_LABELS.RAIL, description: 'The menu down the left against the page’s edge.', picture: <MenuPicture kind="SIDEBAR" /> },
  { value: 'FLOATING', label: NAV_SIDEBAR_LOOK_LABELS.FLOATING, description: 'The menu as a rounded panel standing on the page, with room round it.', picture: <MenuPicture kind="FLOATING" /> },
];

const LOOKS: Choice<NavLook>[] = [
  { value: 'NAVY', label: NAV_LOOK_LABELS.NAVY, description: 'A bar in the menu’s colour with the module’s menu in a white bar under it. The most familiar.', picture: <MenuPicture kind="NAVY" /> },
  { value: 'FRAME', label: NAV_LOOK_LABELS.FRAME, description: 'A light frame round the page; Home lists each module with its sub-modules.', picture: <MenuPicture kind="FRAME" /> },
  { value: 'BAR', label: NAV_LOOK_LABELS.BAR, description: 'One white bar holding the module and its menu; Home groups the modules in three.', picture: <MenuPicture kind="BAR" /> },
];

const SETS: Choice<NavModuleSet>[] = [
  { value: 'DEPARTMENTS', label: NAV_MODULE_SET_LABELS.DEPARTMENTS, description: 'Modules as a contractor’s departments run: project management, purchase, stores, contractors, machinery and so on.' },
  { value: 'AREAS', label: NAV_MODULE_SET_LABELS.AREAS, description: 'The modules as Nirmaan has them: site, materials, purchases, subcontracts, client billing and so on.' },
];

/** What each palette is, in a line. The colours are design tokens (`ds/source/chrome.ts`). */
const PALETTE_WORDS: Record<NavPalette, string> = {
  QUIET: 'Light grey with near-black words. Nirmaan’s own.',
  NAVY: 'Blueprint navy with white words.',
  GRAPHITE: 'Near-black, calm beside any page.',
  FOREST: 'A deep green, for the outdoors trades.',
  OXBLOOD: 'A deep red-brown with white words.',
  SAND: 'A bone stone with near-black words.',
  SKY: 'A pale blue with near-black words.',
  LAGOON: 'Deep-sea teal across the bar, lighter to the right.',
  DUSK: 'Navy deepening into slate.',
  OCEAN: 'A deep teal, a shade lighter at the foot.',
  WALNUT: 'A dark brown with the grain of a lighter one.',
  MIDNIGHT: 'Graphite with a hint of navy.',
  DAWN: 'Light grey into the palest blue.',
  CUSTOM: 'Your company’s own colour.',
};

type ColourKind = NavFill['kind'];
const kindOf = (v: Pick<NavSettingsDto, 'palette' | 'fill'>): ColourKind =>
  v.palette === 'CUSTOM' ? (v.fill?.kind ?? 'SOLID') : GRADIENT_PALETTES.includes(v.palette) ? 'GRADIENT' : 'SOLID';

const ANGLES: { value: NavGradientAngle; label: string }[] = [
  { value: 180, label: 'Down' },
  { value: 90, label: 'Across' },
  { value: 135, label: 'Corner to corner' },
];


const sameFill = (a: NavFill | null, b: NavFill | null) => JSON.stringify(a) === JSON.stringify(b);
const sameNames = (a: Record<string, string>, b: Record<string, string>) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => a[k] === b[k]);
const same = (a: NavSettingsDto, b: NavSettingsDto) =>
  a.layout === b.layout &&
  a.look === b.look &&
  a.sidebarLook === b.sidebarLook &&
  a.paint === b.paint &&
  a.palette === b.palette &&
  sameFill(a.fill, b.fill) &&
  a.moduleSet === b.moduleSet &&
  a.personalLook === b.personalLook &&
  sameNames(a.names, b.names);

/** Drops empty names and names the same as the module's own, and a fill with no palette of its own, as the server keeps them. */
function tidy(v: NavSettingsDto): NavSettingsDto {
  const own = new Map([...navModuleDefs('AREAS'), ...navModuleDefs('DEPARTMENTS')].map((m) => [m.key, m.label]));
  const names = Object.fromEntries(
    Object.entries(v.names)
      .map(([k, n]) => [k, n.replace(/\s+/g, ' ').trim()] as const)
      .filter(([k, n]) => n && n !== own.get(k)),
  );
  return { ...v, names, fill: v.palette === 'CUSTOM' ? v.fill : null };
}

const hexOf = (c: { toHexString: () => string }) => c.toHexString().slice(0, 7).toUpperCase();

/** A colour box with its name over it (antd's picker is a button, so the name is its label). */
function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (hex: string) => void }) {
  return (
    <Flex vertical gap={tk.space[1]}>
      <Typography.Text type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
        {label}
      </Typography.Text>
      <ColorPicker value={value} disabledAlpha format="hex" showText aria-label={label} onChangeComplete={(c) => onChange(hexOf(c))} />
    </Flex>
  );
}

/**
 * The menu's colours: the curated plain colours or gradients, and the company's own. Each card is drawn in its own colours
 * for the theme on screen, and the menu itself shows the choice while it is open here (`setChromePreview`).
 */
function ColoursCard({ v, set }: { v: NavSettingsDto; set: (patch: Partial<NavSettingsDto>) => void }) {
  const { dark } = useAppearance();
  const mode = dark ? 'dark' : 'light';
  const [kind, setKind] = useState<ColourKind>(() => kindOf(v));
  // What the company's own colour was in each kind, so moving between plain and gradient keeps both.
  const [own, setOwn] = useState<Record<ColourKind, NavFill>>(() => ({ ...CHROME_START_FILL, ...(v.fill ? { [v.fill.kind]: v.fill } : {}) }));
  const shownKind = kind;

  const choices: Choice<NavPalette>[] = NAV_PALETTES.filter((p) => (p === 'CUSTOM' ? true : (GRADIENT_PALETTES.includes(p) ? 'GRADIENT' : 'SOLID') === shownKind)).map((p) => ({
    value: p,
    label: p === 'CUSTOM' ? (shownKind === 'GRADIENT' ? 'Your own gradient' : 'Your own colour') : NAV_PALETTE_LABELS[p],
    description: p === 'CUSTOM' ? (shownKind === 'GRADIENT' ? 'Two colours of your company’s, from one to the other.' : PALETTE_WORDS.CUSTOM) : PALETTE_WORDS[p],
    picture: <ColourPicture style={chromeStyle(p === 'CUSTOM' ? { palette: p, fill: own[shownKind] } : { palette: p, fill: null }, mode)} />,
  }));
  const chosen = v.palette === 'CUSTOM' ? (v.fill?.kind === shownKind ? 'CUSTOM' : undefined) : v.palette;

  const setOwnFill = (fill: NavFill) => {
    setOwn((o) => ({ ...o, [fill.kind]: fill }));
    set({ palette: 'CUSTOM', fill });
  };
  const pick = (p: NavPalette) => (p === 'CUSTOM' ? setOwnFill(own[shownKind]) : set({ palette: p, fill: null }));
  const fill = v.palette === 'CUSTOM' ? v.fill : null;
  const problem = fill ? navFillProblem(fill) : null;

  return (
    <Card size="small" title="Colours of the menu">
      <Flex vertical gap={tk.space[3]}>
        <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
          The parts of the menu you put in colour take these, in the light and the dark theme; the gradients stay in one hue, so the menu reads as one colour with depth. The menu on this screen shows your choice as you pick; no one else sees it until you save.
          {NAV_LAYOUT_PARTS[v.layout] && v.paint === 'NONE' && ' With both parts plain, these colours show only in the pictures until you put a part in colour.'}
        </Typography.Paragraph>
        <Segmented<ColourKind>
          aria-label="Plain colours or gradients"
          value={shownKind}
          onChange={setKind}
          options={[
            { value: 'SOLID', label: 'Plain colours' },
            { value: 'GRADIENT', label: 'Gradients' },
          ]}
          style={{ alignSelf: 'flex-start' }}
        />
        <ChoiceCards label="Colours of the menu" value={chosen as NavPalette} onChange={pick} choices={choices} compact />
        {fill && fill.kind === shownKind && (
          <Flex vertical gap={tk.space[3]}>
            <Flex gap={tk.space[4]} wrap align="flex-end">
              {fill.kind === 'SOLID' ? (
                <ColourField label="Colour" value={fill.color} onChange={(color) => setOwnFill({ ...fill, color })} />
              ) : (
                <>
                  <ColourField label="From" value={fill.from} onChange={(from) => setOwnFill({ ...fill, from })} />
                  <ColourField label="To" value={fill.to} onChange={(to) => setOwnFill({ ...fill, to })} />
                  <Flex vertical gap={tk.space[1]}>
                    <Typography.Text type="secondary" style={{ fontSize: tk.type.caption.fontSize }}>
                      Direction
                    </Typography.Text>
                    <Segmented<NavGradientAngle> aria-label="Direction of the gradient" value={fill.angle} onChange={(angle) => setOwnFill({ ...fill, angle })} options={ANGLES} />
                  </Flex>
                </>
              )}
            </Flex>
            {problem && (
              <Alert
                type="warning"
                showIcon
                title={problem}
                action={
                  <Button size="small" onClick={() => setOwnFill(readableFill(fill))}>
                    Use a readable shade
                  </Button>
                }
              />
            )}
          </Flex>
        )}
      </Flex>
    </Card>
  );
}

function MenuForm({ saved }: { saved: NavSettingsDto }) {
  const { message } = App.useApp();
  const { refresh } = useAuth();
  const notify = useNotify();
  const save = useSaveNavSettings();
  const [v, setV] = useState<NavSettingsDto>(saved);
  const changed = !same(tidy(v), tidy(saved));
  const set = <K extends keyof NavSettingsDto>(k: K, value: NavSettingsDto[K]) => setV((x) => ({ ...x, [k]: value }));
  const patch = (p: Partial<NavSettingsDto>) => setV((x) => ({ ...x, ...p }));
  const colourProblem = v.palette === 'CUSTOM' ? navFillProblem(v.fill) : null;
  // The menu shows the colours being tried; leaving the screen puts the company's back.
  useEffect(() => setChromePreview({ palette: v.palette, fill: v.fill }), [v.palette, v.fill]);
  useEffect(() => () => setChromePreview(null), []);
  const modules = useMemo(() => navModuleDefs(v.moduleSet), [v.moduleSet]);
  // Each layout pictured with the parts in colour this company chose, and each paint pictured in the chosen layout.
  const layouts: Choice<NavLayout>[] = LAYOUT_ORDER.filter((l) => NAV_LAYOUTS.includes(l)).map((l) => ({
    value: l,
    label: NAV_LAYOUT_LABELS[l],
    description: LAYOUT_WORDS[l],
    picture: <MenuPicture kind={LAYOUT_PICTURE[l]} paint={navPainted({ ...v, layout: l })} />,
  }));
  const paints: Choice<NavPaint>[] = NAV_PAINTS.map((p) => ({
    value: p,
    label: NAV_PAINT_LABELS[p],
    description: navPaintWords(v.layout, p),
    picture: <MenuPicture kind={LAYOUT_PICTURE[v.layout]} paint={navPainted({ ...v, paint: p })} />,
  }));
  const long = Object.values(v.names).some((n) => n.trim().length > NAV_NAME_MAX);

  const submit = () =>
    save.mutate(tidy(v), {
      // The signed-in user carries the menu, so the shell follows at once; everyone else gets it on their next page.
      onSuccess: async () => {
        await refresh();
        message.success('Menu saved. Everyone gets it on their next page.');
      },
      onError: (e) => notify.failed(e, submit),
    });

  const columns = [
    {
      key: 'module',
      title: 'Module',
      render: (_: unknown, m: NavModuleDef) => (
        <Flex align="center" gap={tk.space[2]}>
          <TreeIcon name={m.icon} />
          <span>{m.label}</span>
        </Flex>
      ),
    },
    {
      key: 'name',
      title: 'Your company’s name',
      width: '40%',
      render: (_: unknown, m: NavModuleDef) => {
        const value = v.names[m.key] ?? '';
        const tooLong = value.trim().length > NAV_NAME_MAX;
        return (
          <Input
            value={value}
            placeholder={m.label}
            aria-label={`Your company’s name for ${m.label}`}
            status={tooLong ? 'error' : undefined}
            onChange={(e) => set('names', { ...v.names, [m.key]: e.target.value })}
            allowClear
          />
        );
      },
    },
    {
      key: 'subs',
      title: 'Its menu',
      responsive: ['md' as const],
      render: (_: unknown, m: NavModuleDef) => <Typography.Text type="secondary">{m.subs.map((s) => s.label).join(', ')}</Typography.Text>,
    },
  ];

  return (
    <Flex vertical gap={tk.space[4]}>
      <Card size="small" title="Where the menu sits">
        <ChoiceCards label="Where the menu sits" value={v.layout} onChange={(x) => set('layout', x)} choices={layouts} />
      </Card>
      {NAV_LAYOUT_PARTS[v.layout] && (
        <Card size="small" title="Where the colours go">
          <ChoiceCards label="Where the colours go" value={v.paint} onChange={(x) => set('paint', x)} choices={paints} compact />
        </Card>
      )}
      {v.layout === 'SIDEBAR' ? (
        <Card size="small" title="Look of the sidebar">
          <ChoiceCards label="Look of the sidebar" value={v.sidebarLook} onChange={(x) => set('sidebarLook', x)} choices={SIDEBAR_LOOKS} />
        </Card>
      ) : v.layout !== 'TOP_BAR' ? null : (
        <Card size="small" title="Look of the top bar">
          <Flex vertical gap={tk.space[3]}>
            <ChoiceCards label="Look of the top bar" value={v.look} onChange={(x) => set('look', x)} choices={LOOKS} />
            {v.look !== 'NAVY' && <Typography.Text type="secondary">The light frame and the one bar keep a light top bar; the menu’s colours show in the menu on a phone.</Typography.Text>}
            <Checkbox checked={v.personalLook} onChange={(e) => set('personalLook', e.target.checked)}>
              Let each person choose their own look, from their account menu
            </Checkbox>
          </Flex>
        </Card>
      )}
      <ColoursCard v={v} set={patch} />
      <Card size="small" title="Modules and their names">
        <Flex vertical gap={tk.space[3]}>
          <ChoiceCards label="How pages are grouped into modules" value={v.moduleSet} onChange={(x) => set('moduleSet', x)} choices={SETS} />
          <Typography.Paragraph type="secondary" style={{ margin: 0 }}>
            Give a module the name your people use, up to {NAV_NAME_MAX} characters. Leave it empty to keep ours. Each person sees only the modules and pages their role opens.
          </Typography.Paragraph>
          <Table<NavModuleDef> rowKey="key" size="small" pagination={false} columns={columns} dataSource={modules} />
        </Flex>
      </Card>
      {long && <Alert type="error" showIcon title={`Shorten the names in red to ${NAV_NAME_MAX} characters or fewer.`} />}
      <Flex gap={tk.space[3]} wrap>
        <Button type="primary" onClick={submit} disabled={!changed || long || !!colourProblem} loading={save.isPending}>
          Save menu
        </Button>
        <Button onClick={() => setV(saved)} disabled={!changed}>
          Undo changes
        </Button>
        <Button type="link" onClick={() => setV({ ...DEFAULT_NAV_SETTINGS, names: {} })} disabled={same(tidy(v), DEFAULT_NAV_SETTINGS)}>
          Back to Nirmaan’s menu
        </Button>
      </Flex>
    </Flex>
  );
}

/**
 * Menu and names: an admin chooses where the menu sits (the top bar with the modules on Home, or the sidebar), the top
 * bar's look, how pages are grouped into modules and what each module is called. ARCHITECTURE "Menu and names".
 */
export default function MenuAndNamesPage() {
  const { user } = useAuth();
  const allowed = !!user && canManageModules(user.roleKey);
  const { data, isLoading, error, refetch } = useNavSettings(allowed);
  if (!user) return null;
  return (
    <div className="page-container" style={{ maxWidth: 1080, marginLeft: 0 }}>
      <PageHeader title="Menu and names" subtitle="Where the menu sits, how it looks, its colours and what each module is called, for everyone in your company." />
      {!allowed ? (
        <NoAccess title="Only an admin can change the menu" />
      ) : isLoading ? (
        <PageSkeleton shape="record" header={false} />
      ) : error ? (
        <QueryError error={error} onRetry={() => refetch()} />
      ) : data ? (
        <MenuForm saved={data} />
      ) : null}
    </div>
  );
}
