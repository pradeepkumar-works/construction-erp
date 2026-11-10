/**
 * Codemod: an explanation printed as a paragraph (a `Typography.Paragraph` or `Typography.Text` of `LONG_WORDS` or more)
 * moves behind the ⓘ of the titled surface it sits directly in: `help` on a Section or FormSection, `TitleHelp` on the
 * title of a Card, Modal or Drawer whose first child it is, else a `HelpLink` ("How it works") in its place. A paragraph
 * that reads as a state ("No approved DPR…") stays, and is printed for a hand edit. Safe to rerun.
 *   npx tsx --tsconfig tsconfig.json scripts/copy/paragraphs-to-help.ts
 */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { LONG_WORDS, SRC } from './screen-text';

const files: string[] = [];
const walk = (d: string) => {
  for (const f of fs.readdirSync(d)) {
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) {
      if (f !== '(public)') walk(p);
    } else if (p.endsWith('.tsx')) files.push(p);
  }
};
walk(SRC);

const words = (t: string) => t.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;
const HELP_PROP = new Set(['Section', 'FormSection']);
const TITLED = new Set(['Card', 'Modal', 'Drawer']);
type Edit = { start: number; end: number; text: string };

/** The paragraph's spacing, kept on the link that takes its place. */
const styleOf = (n: ts.JsxElement) => {
  const style = n.openingElement.attributes.properties.find((a) => ts.isJsxAttribute(a) && a.name.getText() === 'style');
  return style && /(padding|margin)/.test(style.getText()) ? ` ${style.getText()}` : '';
};

let moved = 0;
for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits: Edit[] = [];
  const touched = new Set<ts.Node>();
  const visit = (n: ts.Node) => {
    if (ts.isJsxElement(n) && /^Typography\.(Paragraph|Text)$/.test(n.openingElement.tagName.getText())) {
      const body = src.slice(n.openingElement.end, n.closingElement.getStart()).trim();
      if (words(body.replace(/\{[^}]*\}/g, ' ')) >= LONG_WORDS) {
        const parent = n.parent;
        const where = `${path.relative(SRC, file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
        if (/^(No|Nothing|None|There (is|are))\b/.test(body)) {
          console.log(`left ${where} (a state, to shorten by hand)`);
        } else if (!ts.isJsxElement(parent) || touched.has(parent)) {
          edits.push({ start: n.getStart(), end: n.end, text: `<HelpLink${styleOf(n)}>${body}</HelpLink>` });
          moved++;
        } else {
          const open = parent.openingElement;
          const tag = open.tagName.getText();
          const attrs = open.attributes.properties.filter(ts.isJsxAttribute);
          const first = parent.children.find((c) => !(ts.isJsxText(c) && !c.text.trim())) === n;
          const title = attrs.find((a) => a.name.getText() === 'title');
          const help = `<>${body}</>`;
          let edit: Edit | null = null;
          if (HELP_PROP.has(tag) && !attrs.some((a) => a.name.getText() === 'help')) {
            edit = { start: open.tagName.end, end: open.tagName.end, text: ` help={${help}}` };
          } else if (TITLED.has(tag) && first && title?.initializer) {
            const value = ts.isStringLiteral(title.initializer) ? title.initializer.getText() : `{${(title.initializer as ts.JsxExpression).expression?.getText()}}`;
            edit = { start: title.getStart(), end: title.end, text: `title={<TitleHelp help={${help}}>${value.startsWith('{') ? value : value.slice(1, -1)}</TitleHelp>}` };
          }
          if (!edit) {
            edits.push({ start: n.getStart(), end: n.end, text: `<HelpLink${styleOf(n)}>${body}</HelpLink>` });
            moved++;
          } else {
            touched.add(parent);
            edits.push(edit);
            const lineStart = src.lastIndexOf('\n', n.getStart() - 1);
            const lineEnd = src.indexOf('\n', n.end);
            const whole = src.slice(lineStart + 1, n.getStart()).trim() === '' && src.slice(n.end, lineEnd).trim() === '';
            edits.push(whole ? { start: lineStart, end: lineEnd, text: '' } : { start: n.getStart(), end: n.end, text: '' });
            moved++;
          }
        }
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  if (!edits.length) continue;
  let out = src;
  for (const e of edits.sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  const names = ['TitleHelp', 'HelpLink'].filter((name) => out.includes(`<${name}`));
  const have = out.match(/import \{([^}]*)\} from '@\/components\/common\/Help';/);
  const want = [...new Set([...(have?.[1].split(',').map((x) => x.trim()).filter(Boolean) ?? []), ...names])].sort();
  if (names.length) {
    const line = `import { ${want.join(', ')} } from '@/components/common/Help';`;
    out = have ? out.replace(have[0], line) : out.replace(/(\nimport [^\n]*\n)/, `$1${line}\n`);
  }
  fs.writeFileSync(file, out);
}
console.log(`moved ${moved} paragraphs behind an ⓘ`);
