// @ts-check
// ESLint for the API: typescript-eslint's recommended rules on src, every one an error but `no-explicit-any`, whose
// findings left are held by `--max-warnings` in package.json, so a new one fails. CI runs `pnpm --filter @erp/api lint`.
import { defineConfig, globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig([
  globalIgnores(['dist/**', 'node_modules/**', 'prisma/**']),
  {
    files: ['src/**/*.ts'],
    extends: [tseslint.configs.recommended],
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      // The repo's way to leave a value out on purpose: `_name`, or `{ omitted, ...rest }`.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_', ignoreRestSiblings: true }],
      '@typescript-eslint/no-explicit-any': 'warn',
      // The API is CommonJS; pdf.js is loaded with require only when a PDF is read.
      '@typescript-eslint/no-require-imports': 'off',
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='slice'][callee.object.callee.property.name='toISOString'][callee.object.callee.object.type='NewExpression'][callee.object.callee.object.arguments.length=0]",
          message: "Today in UTC is yesterday in India until 05:30. Use todayIn() from notifications/time.ts.",
        },
      ],
    },
  },
]);
