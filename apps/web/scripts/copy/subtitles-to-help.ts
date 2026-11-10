/**
 * Codemod: a sentence under a page title moves behind its ⓘ (PageHeader `subtitle` → `help`) when it is text:
 * a string, a template, a choice between strings, or a description read from a registry. A subtitle that is markup
 * (a record's project line, tags) stays. Prints what it left. Safe to rerun.
 *   npx tsx --tsconfig tsconfig.json scripts/copy/subtitles-to-help.ts
 */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

const root = path.join(__dirname, '../../src');
const files: string[] = [];
const walk = (d: string) => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.tsx')) files.push(p);
  }
};
walk(root);

const isText = (e: ts.Expression): boolean =>
  ts.isStringLiteral(e) ||
  ts.isNoSubstitutionTemplateLiteral(e) ||
  ts.isTemplateExpression(e) ||
  (ts.isConditionalExpression(e) && isText(e.whenTrue) && isText(e.whenFalse)) ||
  (ts.isParenthesizedExpression(e) && isText(e.expression)) ||
  (ts.isBinaryExpression(e) && e.operatorToken.kind === ts.SyntaxKind.BarBarToken && isText(e.right)) ||
  /(description|INTROS)/.test(e.getText());

let moved = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits: number[] = [];
  const visit = (node: ts.Node) => {
    if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText() === 'PageHeader') {
      for (const a of node.attributes.properties) {
        if (!ts.isJsxAttribute(a) || a.name.getText() !== 'subtitle' || !a.initializer) continue;
        const init = a.initializer;
        const text = ts.isStringLiteral(init) || (ts.isJsxExpression(init) && init.expression && isText(init.expression));
        if (text) edits.push(a.name.getStart());
        else console.log(`kept ${path.relative(root, file)}:${sf.getLineAndCharacterOfPosition(a.getStart()).line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  let out = src;
  for (const at of edits.sort((x, y) => y - x)) out = out.slice(0, at) + 'help' + out.slice(at + 'subtitle'.length);
  fs.writeFileSync(file, out);
  moved += edits.length;
}
console.log(`moved ${moved} subtitles behind help`);
