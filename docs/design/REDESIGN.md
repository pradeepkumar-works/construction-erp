# Redesign from the tokens up

Pradeep asked for the whole web UI to be redone from the root so Nirmaan feels like a world-class AI-native product:
colours, spacing, type, and how antd components are customised. This file is the plan and the record. It is a how-to;
the appendices explain and record.

Every value a screen shows comes from one table in `apps/web/src/ds/source/`, and screen code names it through one object,
`tk`. A change of look is an edit to the table. Lint and `scripts/tokens-check.ts` stop a screen from writing a colour or a
size of its own.

## How to read this

One box is one unit of work. Check a box only when its evidence exists: a file, a log line, a screenshot or a SHA. PRs land
one at a time on `main`, small and verifiable, in the order below. Each PR carries the checks CLAUDE.md names and screenshots
at 1440 and 390 in both themes under `ai-build/ui-redesign/<pr>/` in the project files.

**Rigor.** High for PR 1 to PR 4 (one-way doors: the shape every screen will import, and the new look). Each of those is
judged against the baseline screenshots taken before any change (`ai-build/ui-redesign/directions/base/`). The later caller
migrations are mechanical and run on a codemod, so their check is the same screenshot sweep plus the route walk in CI.

**What I do not run.** pstack's multi-phase plan asks for ten live swarm lanes per PR. Here the scripted sweep (7 screens,
2 widths, 2 themes) plus CI's route walk (every sidebar page for each role, both widths, both themes, axe) covers the same
surface without ten agents per PR, so the swarm is skipped. The decision trail is `.audit/ui-redesign.tsv` while the work
runs and is committed with the last PR.

## The sequence

### Put the table in at parity (PR 1)

- [ ] Add `apps/web/src/ds/` with `source/` (roles, scales, faces), `engine.ts` (`resolve`), `css.ts` (`tokenCss`),
  `antd.ts` (`antdTheme`, `antdComponents`, `antdComponentConfig`) and `index.ts` (`tk`, `useResolved`, the unions).
- [ ] Roles hold today's values, so nothing changes on screen. `BRAND.colors` and `--brand-*` are derived from the table.
- [ ] `lib/theme.ts` keeps its exports as thin re-exports over `ds` for the callers that still import it.
- [ ] Verify. `typecheck`, `next build`, lint, nav-check, copy-check. The screenshot sweep matches the baseline within
  antialiasing (pixel diff report in the PR).

### Guard the system (PR 2)

- [ ] `scripts/tokens-check.ts` in CI: every text role at 4.5:1 and every control edge at 3:1 on the surfaces it sits on, in
  both themes; no hex or px in CSS files outside media queries and hairlines; every `var(--…)` of ours is one the table emits.
- [ ] ESLint rule `ds/no-raw-style`: a hex, `rgba(`, a px size, a raw `fontWeight` or radius, `var(--ant-` or `var(--brand-`
  in a style fails, naming the `tk` path to use. `--fix` rewrites values that sit on the scale.
- [ ] `ds/legacy-files.json` lists every file not yet moved. It may only shrink: tokens-check fails when a listed file is
  already clean or a new file joins it. New screens are on the system from this PR on.

### Move the shell onto `tk` (PR 3)

- [x] Sidebar, top bar, launcher counts and sign-in panel read their colours from a `chrome` role group (`bg`, `deep`,
  `ink`, `accent`, `caption`) and `state.countFill`, so the sidebar's colours are table values rather than a navy written
  into the CSS. Its shades stay as shares of `chrome.ink` mixed over `chrome.bg`, which hold for a light rail as well as a
  dark one. No visible change (pixel diff against the base: only the clock-driven greeting and relative times move).
- [ ] The shell's sizes (34, 26 and 38 px rows, 10 and 11 px gaps) are off the scale, so they cannot move at parity. They
  move in PR 5 with the page frame, and the shell CSS stays on the legacy list until then.

### Land the new look (PR 4)

- [ ] The direction Pradeep picks (A quiet or B blueprint) as an edit to `ds/source/` and the font in `app/layout.tsx` only.
  Colours move onto 12-step ramps per hue with fixed step meanings, which replace the light and dark pairs.
- [ ] Inter for body and titles, page titles at 24 px, one radius set (4, 6, 10, pill), links in text colour.
- [ ] CLAUDE.md's look rules (navy sidebar, display face, canvas table header) are rewritten to match.
- [ ] Verify. The PR diff touches nothing outside `ds/source/`, `layout.tsx` and the docs. Screenshots before and after.

### Redo the shared components (PR 5 to PR 7)

- [ ] PR 5. Page frame: `PageHeader`, page and card spacing, no card inside a card, list toolbar on one line.
- [ ] PR 6. Data: `DataTable` rows and header, `Figures` (the one headline block), `AppTag` tones plus an `ai` tone, `AppTabs`, `StageBar`.
- [ ] PR 7. Entry and records: `FormShell`, fields, `RecordFrame`, drawers and dialogs, the Ask panel's AI surface.

### Move every screen onto `tk` (PR 8 to PR 13)

- [ ] PR 8. The codemod (`scripts/codemods/to-tk.ts`): bills moved by hand first, then the codemod rerun on them and diffed.
- [ ] PR 9 to PR 13. One department per PR: site work, materials and buying, money, people, insight and admin. Off-grid
  values (3, 5, 6, 7, 14, 18 px) are decided by hand with a before and after screenshot.

### Print, charts, and deleting the old surface (PR 14 and PR 15)

- [ ] PR 14. Print and email templates read `resolveStatic('light')`. Charts and feature colours use `series`.
- [ ] PR 15. Delete `BRAND.colors`, `familyColors`, `themeColor`, `themeFontSize`, `cssVariablesFor`, the `--brand-*` and
  mirrored `--ant-*` variables and `legacy-files.json`. Lint goes to error. Commit the decision trail.

## Appendix A. The shape (from a two-runner arena, synthesized)

Base: candidate 2 ("one recipe, three emissions"). Grafts from candidate 1: the `chrome` role group, the shrinking
`legacy-files.json` in place of a warning count, the parity PR proved by screenshots, and keeping antd's compact algorithm
for the hundreds of sizes we do not name. Rejected from both: putting the source in `packages/shared` now (mobile is out of
scope, moving it later is cheap) and OKLCH ramp generation (a designer's palette is chosen hexes; explicit ramps are enough).

```ts
import { tk } from '@/ds';
<div style={{ padding: tk.space[3], color: tk.color.text.muted, borderRadius: tk.radius.md, ...tk.type.label }} />
const { fg, bg } = tk.color.tone[tone]; // 'neutral' | 'info' | 'pending' | 'success' | 'danger' | 'violet' | 'ai'
```

- Every `tk` leaf is a CSS variable (`var(--c-text-muted)`), so it follows light, dark, comfortable and compact with no hook
  and no re-render. `data-theme` and `data-density` on `<html>` switch them; any subtree can be dark.
- antd gets concrete values from the same `resolve(mode, density)`, so a table header and a hand-built div cannot disagree.
- `useResolved()` gives concrete values for canvas charts; `resolveStatic('light')` for print, PDF and email.
- Types: closed unions (`Tone`, `SpaceStep`, `TypeName`, `RadiusName`); a typo in a path fails typecheck.

## Appendix B. Why the old system read as sloppy (measured on main c438c5a)

- `BRAND.colors` is 123 flat keys with light and dark as separate names (`accent` and `nightLink`) and feature colours
  beside system ones (`markupRed`, `trendBilledNight`). Dark mode is hand-paired, key by key.
- 3113 inline style objects in 485 of 646 files. 1052 inline margin or padding literals, including off-grid 6 (31 times),
  18 (14), 3, 5, 7 and 14. Nine different corner radii (1 to 10 and 999). Four font weights written inline.
- Colour on chrome rather than data: a navy sidebar, a blue selected pill, every link and date painted blue.
- Two display faces (condensed Archivo titles, Public Sans body) and 30 px page titles.

## Appendix C. Risks

- The light sidebar (direction A) breaks the CLAUDE.md rule "the navy sidebar"; PR 4 rewrites the rule with Pradeep's pick.
- A codemod PR touches many files. Each department PR is held to the route walk and the screenshot sweep.
- The design cleanup thread is changing pages in parallel. It keeps off `lib/theme.ts`, `lib/brand.ts`, `globals.css` and
  `app/layout.tsx`, and its `Money` component takes its figure style from `tk.type.figure`.
