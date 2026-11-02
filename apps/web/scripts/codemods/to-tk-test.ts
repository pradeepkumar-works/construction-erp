/**
 * The codemod's rewrites (scripts/codemods/to-tk.ts): what moves onto `tk`, and what is left for a person.
 *   npx tsx --tsconfig tsconfig.json scripts/codemods/to-tk-test.ts
 */
import assert from 'node:assert/strict';
import { rewrite } from './to-tk';

let n = 0;
const check = (name: string, f: () => void) => {
  f();
  n++;
  console.log(`ok ${name}`);
};
const run = (src: string) => rewrite('/x/src/components/demo/Demo.tsx', src);

check('antd tokens in a style move, and the hook and the theme import go', () => {
  const r = run(`'use client';
import React from 'react';
import { Flex, Typography, theme } from 'antd';

export function Demo() {
  const { token } = theme.useToken();
  return (
    <Flex gap={token.marginXS} style={{ marginTop: token.margin, padding: \`\${token.paddingXS}px \${token.paddingSM}px\` }}>
      <Typography.Text style={{ fontSize: token.fontSizeSM, color: token.colorTextSecondary }}>Hi</Typography.Text>
    </Flex>
  );
}
`);
  assert.match(r.text, /gap=\{tk\.space\[2\]\}/);
  assert.match(r.text, /marginTop: tk\.space\[4\]/);
  assert.match(r.text, /padding: `\$\{tk\.space\[2\]\} \$\{tk\.space\[3\]\}`/);
  assert.match(r.text, /fontSize: tk\.type\.caption\.fontSize, color: tk\.color\.text\.muted/);
  assert.doesNotMatch(r.text, /useToken|\btheme\b/);
  assert.match(r.text, /^import \{ tk \} from '@\/ds';$/m);
  assert.deepEqual(r.left, []);
});

check('a hairline border becomes tk.line', () => {
  const r = run(`const s = <div style={{ borderBottom: \`\${token.lineWidth}px \${token.lineType} \${token.colorSplit}\` }} />;`);
  assert.match(r.text, /borderBottom: tk\.line\('hairline'\)/);
});

check('numbers on the scale move, conditions included; off the scale is left and listed', () => {
  const r = run(`const s = <div style={{ gap: 12, marginLeft: -8, borderRadius: 6, fontWeight: strong ? 600 : undefined, padding: '8px 0', margin: 6 }} />;`);
  assert.match(r.text, /gap: tk\.space\[3\]/);
  assert.match(r.text, /marginLeft: tk\.neg\(2\)/);
  assert.match(r.text, /borderRadius: tk\.radius\.md/);
  assert.match(r.text, /fontWeight: strong \? tk\.type\.title\.fontWeight : undefined/);
  assert.match(r.text, /padding: `\$\{tk\.space\[2\]\} 0`/);
  assert.match(r.text, /margin: 6/);
  assert.equal(r.left.length, 1);
  assert.match(r.left[0], /margin: 6 is off the scale/);
});

check('the old calls move and their import goes', () => {
  const r = run(`import { Typography } from 'antd';
import { themeColor, themeFontSize } from '@/lib/theme';
const s = <span style={{ fontSize: themeFontSize('fontSizeXL'), color: themeColor('colorErrorText') }} />;
`);
  assert.match(r.text, /fontSize: tk\.type\.subhead\.fontSize, color: tk\.color\.tone\.danger\.fg/);
  assert.doesNotMatch(r.text, /@\/lib\/theme/);
});

check('a number someone needs is left: Space size, arithmetic, a colour with alpha', () => {
  const r = run(`function A() {
  const { token } = theme.useToken();
  return <Space size={token.marginXS}><div style={{ top: top + token.marginSM, background: \`\${token.colorPrimary}22\` }} /></Space>;
}`);
  assert.match(r.text, /size=\{token\.marginXS\}/);
  assert.match(r.text, /top \+ token\.marginSM/);
  assert.match(r.text, /\$\{token\.colorPrimary\}22/);
  assert.match(r.text, /theme\.useToken\(\)/);
  assert.equal(r.left.length, 3);
});

check('values outside a style stay as they are', () => {
  const src = `const cfg = { gap: 8, color: token.colorPrimary };`;
  assert.equal(run(src).text, src);
});

console.log(`to-tk-test: ${n} passed`);
