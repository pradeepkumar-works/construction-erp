/**
 * The words a screen shows on its own (docs/WRITING.md "Screen text"): JSX text and text props, outside the public
 * website and outside what sits behind an ⓘ (`help`, `tooltip`, `<Help>`). copy-check holds the app to it; run this
 * file to list the long ones, longest first:
 *   npx tsx --tsconfig tsconfig.json scripts/copy/screen-text.ts [minWords]
 */
import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';

export const SRC = path.resolve(__dirname, '../../src');
/** A sentence longer than this is an explanation, and goes behind an ⓘ. */
export const LONG_WORDS = 25;

export interface ScreenString {
  where: string;
  words: number;
  text: string;
}

const HIDDEN_PROPS = new Set(['help', 'tooltip', 'aria-label', 'alt', 'docTitle', 'searchLabel', 'placeholder']);
const NOT_TEXT_PROPS = new Set(['className', 'style', 'href', 'key', 'id', 'd', 'type', 'kind', 'status', 'draftKey', 'name', 'accept']);

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isDirectory()) {
      if (f !== '(public)') tsxFiles(p, out);
    } else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

const wordCount = (t: string) => t.split(/\s+/).filter((w) => /[A-Za-z]/.test(w)).length;

function hidden(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node; n; n = n.parent) {
    if (ts.isJsxAttribute(n) && HIDDEN_PROPS.has(n.name.getText())) return true;
    if (ts.isJsxElement(n) && /^(Help|HelpLink)$/.test(n.openingElement.tagName.getText())) return true;
  }
  return false;
}

/** The text a JSX element shows as one run (its text children and string expressions), so a paragraph counts once. */
function runOf(el: ts.JsxElement): string {
  return el.children
    .map((c) => (ts.isJsxText(c) ? c.text : ts.isJsxExpression(c) && c.expression && (ts.isStringLiteral(c.expression) || ts.isNoSubstitutionTemplateLiteral(c.expression)) ? c.expression.text : ts.isJsxElement(c) && /^(strong|b|em|Link|a|span|Typography\.Text)$/.test(c.openingElement.tagName.getText()) ? runOf(c) : ' X '))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

export function screenStrings(): { strings: ScreenString[]; subtitleSentences: string[] } {
  const strings: ScreenString[] = [];
  const subtitleSentences: string[] = [];
  for (const file of tsxFiles(SRC)) {
    const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const at = (n: ts.Node) => `${path.relative(SRC, file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
    const add = (n: ts.Node, text: string) => {
      const t = text.replace(/\s+/g, ' ').trim();
      if (t && !hidden(n)) strings.push({ where: at(n), words: wordCount(t), text: t });
    };
    const visit = (node: ts.Node) => {
      if ((ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) && node.tagName.getText() === 'PageHeader') {
        for (const a of node.attributes.properties) {
          if (!ts.isJsxAttribute(a) || a.name.getText() !== 'subtitle' || !a.initializer) continue;
          const e = ts.isJsxExpression(a.initializer) ? a.initializer.expression : a.initializer;
          if (e && (ts.isStringLiteral(e) || ts.isNoSubstitutionTemplateLiteral(e) || ts.isTemplateExpression(e))) subtitleSentences.push(at(a));
        }
      }
      if (ts.isJsxElement(node) && node.children.some((c) => ts.isJsxText(c) && c.text.trim())) {
        add(node, runOf(node));
        node.children.forEach((c) => ts.isJsxText(c) || ts.forEachChild(c, visit));
        return;
      }
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node) || ts.isTemplateExpression(node)) {
        let p = node.parent;
        while (p && (ts.isConditionalExpression(p) || ts.isParenthesizedExpression(p) || ts.isBinaryExpression(p))) p = p.parent;
        const attr = p && ts.isJsxExpression(p) ? p.parent : p;
        if (attr && ts.isJsxAttribute(attr) && !NOT_TEXT_PROPS.has(attr.name.getText())) {
          add(node, ts.isTemplateExpression(node) ? node.getText().slice(1, -1).replace(/\$\{[^}]*\}/g, 'X') : node.text);
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return { strings, subtitleSentences };
}

if (require.main === module) {
  const min = Number(process.argv[2] ?? LONG_WORDS);
  const { strings } = screenStrings();
  const long = strings.filter((s) => s.words >= min).sort((a, b) => b.words - a.words);
  for (const s of long) console.log(`${s.words}\t${s.where}\t${s.text.slice(0, 140)}`);
  console.log(`${long.length} strings of ${min} words or more, ${strings.reduce((n, s) => n + s.words, 0)} words on screen in all`);
}
