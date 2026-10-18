## Before

<!-- What a user saw or could not do, in a sentence or two. -->

## After

<!-- What they see or can do now. -->

## How

<!-- The approach, the files that matter, anything a reviewer should look at first. -->

## Checks

- [ ] `pnpm typecheck`
- [ ] `cd apps/web && npx next build`
- [ ] `pnpm --filter @erp/web lint`
- [ ] `npx @ant-design/cli lint apps/web/src/<folder>` on each folder changed
- [ ] e2e: `cd e2e && npx playwright test` (flows and the route walk; CI runs both)
- [ ] Phone changed: `cd apps/mobile && npx tsc --noEmit && CI=1 npx expo export --platform android && npm run i18n:check`

## Screenshots

<!-- Every page this changes, at 1440 and 390 px, light and dark. The route walk's screenshots are in the
     `route-walk-screens-walk-1` and `-walk-2` artifacts of the e2e run. -->

| | Light | Dark |
|---|---|---|
| 1440 | | |
| 390 | | |

## Pre-delivery checklist

- [ ] The answer comes first: what the user came for is at the top, not under a wall of controls
- [ ] No figure shown twice on the same screen
- [ ] Colour only for exceptions, and never alone (a word or icon says it too)
- [ ] Figures stand against a reference (budget, plan, last period)
- [ ] Destructive actions sit behind a confirmation that names what goes
- [ ] One number format and one date format (`src/lib/format.ts`)
- [ ] Targets at least 24 px, 44 px on touch
- [ ] No horizontal scroll at 390 px
- [ ] State in the URL: filters, tabs and the open record survive a reload and a shared link
- [ ] Text colours from tokens, with AA contrast in both themes
- [ ] Every control labelled (a visible label or an `aria-label`)
- [ ] Loading, empty and error states drawn
