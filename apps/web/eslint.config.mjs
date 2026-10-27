// @ts-check
// ESLint for the web app (UX item 89, follow-up): typescript-eslint, React hooks, Next.js and jsx-a11y, on src. `pnpm --filter
// @erp/web lint` runs it and CI fails on any error. Every rule is an error except the two under "Still warnings", which
// have findings left; `--max-warnings` in package.json holds their count, so a new finding fails too.
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';

/** A preset's rules, each one an error (its options kept, rules it turns off left off). */
function asErrors(rules) {
  return Object.fromEntries(
    Object.entries(rules ?? {}).map(([name, value]) => {
      const level = Array.isArray(value) ? value[0] : value;
      if (level === 'off' || level === 0) return [name, value];
      return [name, Array.isArray(value) ? ['error', ...value.slice(1)] : 'error'];
    }),
  );
}

const tsRecommended = Object.assign({}, ...tseslint.configs.recommended.map((c) => c.rules ?? {}));

export default defineConfig([
  globalIgnores(['.next/**', 'out/**', 'dist/**', 'node_modules/**', 'next-env.d.ts']),
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [tseslint.configs.recommended],
    plugins: {
      '@next/next': nextPlugin,
      'react-hooks': reactHooks,
      'jsx-a11y': jsxA11y,
    },
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    settings: {
      // jsx-a11y checks DOM elements only, so the antd and app components are mapped to the element that takes their
      // props and the user's focus, to check the markup the app really draws. RecordLink is not mapped: without an
      // href it draws a button (role="button"), and its own markup is checked in RecordLink.tsx.
      'jsx-a11y': {
        components: {
          Button: 'button',
          Switch: 'button',
          Input: 'input',
          'Input.Password': 'input',
          'Input.Search': 'input',
          'Input.TextArea': 'textarea',
          InputNumber: 'input',
          Checkbox: 'input',
          Radio: 'input',
          'Typography.Link': 'a',
          Link: 'a',
          LinkButton: 'a',
          Card: 'div',
          Flex: 'div',
          Space: 'div',
          'Typography.Paragraph': 'div',
          'Typography.Text': 'span',
          Tag: 'span',
          AppTag: 'span',
        },
      },
    },
    rules: {
      ...asErrors(tsRecommended),
      ...asErrors(reactHooks.configs.flat['recommended-latest'].rules),
      ...asErrors(nextPlugin.configs.recommended.rules),
      ...asErrors(nextPlugin.configs['core-web-vitals'].rules),
      ...asErrors(jsxA11y.flatConfigs.recommended.rules),
      // The repo's way to leave a value out on purpose: `_name`, or `{ omitted, ...rest }`.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', ignoreRestSiblings: true }],

      // The brand look (UI roadmap, Nirmaan's own look): a tag is `AppTag` (a tone, not an antd colour) and an entry's stages
      // are `StageBar`; AppTag.tsx, which wraps antd's tag, is the one file that imports it. Icons are Lucide, from
      // `components/common/icons`, never `@ant-design/icons`.
      'no-restricted-imports': ['error', { paths: [
        { name: 'antd', importNames: ['Tag', 'Steps'], message: 'Use AppTag (components/common/AppTag) or StageBar (components/record/StageBar).' },
        { name: '@ant-design/icons', message: 'Use the Lucide icons in components/common/icons (same names); add one there if it is missing.' },
      ] }],

      // Still warnings, with findings left after this pass:
      // 51 effects that set state as they start (a value read from this browser after hydration, a form reset when it
      // opens, state following a prop). Each wants its own rewrite (state during render, a key, an external store),
      // which changes when the screen updates, so they are left for a pass of their own, with tests.
      'react-hooks/set-state-in-effect': 'warn',
      // The 2 landing page screenshots: next/image would move them onto Vercel's image optimiser, a hosting choice.
      '@next/next/no-img-element': 'warn',
    },
  },
  {
    files: ['src/components/common/AppTag.tsx'],
    rules: { 'no-restricted-imports': 'off' },
  },
]);
