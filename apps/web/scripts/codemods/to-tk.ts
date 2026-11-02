/**
 * Moves a screen's styles onto the design tokens (docs/design/REDESIGN.md, PR 8):
 *
 *   npx tsx --tsconfig tsconfig.json scripts/codemods/to-tk.ts [--write] <file or folder>…
 *
 * What it rewrites, only inside a `style` / `styles` value, a `React.CSSProperties` object or a `Flex`'s `gap`:
 * - antd's tokens from `theme.useToken()` (`token.marginSM`, `token.colorTextSecondary`, `token.fontSizeSM`…) and the
 *   old calls `themeColor('…')` / `themeFontSize('…')` to their `tk` path;
 * - numbers on the scale for spacing, corners, type sizes and weights (`gap: 8` to `tk.space[2]`), and px strings made
 *   only of them (`'8px 12px'`);
 * - `${token.lineWidth}px ${token.lineType} ${token.colorBorderSecondary}` to `tk.line('hairline')`.
 * Then it drops a `theme.useToken()` nothing reads, the imports nothing uses, and adds `tk`. Anything off the scale, in
 * arithmetic, or passed where a number is needed (antd's `Space size`, `Row gutter`, a chart) is left for a person, and
 * listed. Without `--write` it only reports. Every screen is on the tokens now; it stays for a branch written before them.
 */
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const WEB = path.resolve(__dirname, '../..');

// ---- What each old name is on the scale -------------------------------------------------------------------------

type Kind = 'space' | 'radius' | 'font' | 'weight' | 'color' | 'shadow';
const SPACE_STEP: Record<number, string> = { 2: 'half', 4: '1', 8: '2', 12: '3', 16: '4', 20: '5', 24: '6', 32: '8', 48: '12' };
const RADIUS_OF: Record<number, string> = { 2: 'xs', 4: 'sm', 6: 'md', 10: 'lg', 999: 'pill' };
const TYPE_OF_SIZE: Record<number, string> = { 12: 'caption', 14: 'body', 16: 'lead', 20: 'subhead', 24: 'heading', 30: 'display' };
const TYPE_OF_WEIGHT: Record<number, string> = { 400: 'body', 500: 'strong', 600: 'title' };

const space = (n: number) => (SPACE_STEP[n] === 'half' ? 'tk.space.half' : `tk.space[${SPACE_STEP[n]}]`);

/** antd's token names, as `tk` paths. */
export const TOKEN: Record<string, { kind: Kind; to: string }> = {
  ...Object.fromEntries(
    (
      [
        ['XXS', 4],
        ['XS', 8],
        ['SM', 12],
        ['', 16],
        ['MD', 20],
        ['LG', 24],
        ['XL', 32],
        ['XXL', 48],
      ] as const
    ).flatMap(([s, n]) => [
      [`margin${s}`, { kind: 'space' as const, to: space(n) }],
      [`padding${s}`, { kind: 'space' as const, to: space(n) }],
    ]),
  ),
  paddingContentHorizontal: { kind: 'space', to: space(16) },
  paddingContentVertical: { kind: 'space', to: space(12) },
  borderRadius: { kind: 'radius', to: 'tk.radius.md' },
  borderRadiusLG: { kind: 'radius', to: 'tk.radius.lg' },
  borderRadiusSM: { kind: 'radius', to: 'tk.radius.sm' },
  borderRadiusXS: { kind: 'radius', to: 'tk.radius.xs' },
  fontSizeSM: { kind: 'font', to: 'tk.type.caption.fontSize' },
  fontSize: { kind: 'font', to: 'tk.type.body.fontSize' },
  fontSizeLG: { kind: 'font', to: 'tk.type.lead.fontSize' },
  fontSizeXL: { kind: 'font', to: 'tk.type.subhead.fontSize' },
  fontSizeHeading1: { kind: 'font', to: 'tk.type.display.fontSize' },
  fontSizeHeading2: { kind: 'font', to: 'tk.type.heading.fontSize' },
  fontSizeHeading3: { kind: 'font', to: 'tk.type.subhead.fontSize' },
  fontSizeHeading4: { kind: 'font', to: 'tk.type.lead.fontSize' },
  fontSizeHeading5: { kind: 'font', to: 'tk.type.body.fontSize' },
  fontWeightStrong: { kind: 'weight', to: 'tk.type.title.fontWeight' },
  colorText: { kind: 'color', to: 'tk.color.text.base' },
  colorTextHeading: { kind: 'color', to: 'tk.color.text.strong' },
  colorTextSecondary: { kind: 'color', to: 'tk.color.text.muted' },
  colorTextTertiary: { kind: 'color', to: 'tk.color.text.faint' },
  colorTextDescription: { kind: 'color', to: 'tk.color.text.faint' },
  colorTextQuaternary: { kind: 'color', to: 'tk.color.text.placeholder' },
  colorTextPlaceholder: { kind: 'color', to: 'tk.color.text.placeholder' },
  colorTextLightSolid: { kind: 'color', to: 'tk.color.text.onAccent' },
  colorWhite: { kind: 'color', to: 'tk.color.text.onAccent' },
  colorLink: { kind: 'color', to: 'tk.color.text.link' },
  colorPrimary: { kind: 'color', to: 'tk.color.accent.solid' },
  colorPrimaryText: { kind: 'color', to: 'tk.color.accent.text' },
  colorPrimaryBg: { kind: 'color', to: 'tk.color.accent.soft' },
  colorPrimaryBorder: { kind: 'color', to: 'tk.color.accent.chosen' },
  controlItemBgActive: { kind: 'color', to: 'tk.color.accent.chosen' },
  colorBgContainer: { kind: 'color', to: 'tk.color.surface.base' },
  colorBgLayout: { kind: 'color', to: 'tk.color.surface.canvas' },
  colorBgElevated: { kind: 'color', to: 'tk.color.surface.raised' },
  colorFillAlter: { kind: 'color', to: 'tk.color.surface.sunken' },
  colorFillTertiary: { kind: 'color', to: 'tk.color.surface.sunken' },
  colorFillQuaternary: { kind: 'color', to: 'tk.color.surface.sunken' },
  colorFillSecondary: { kind: 'color', to: 'tk.color.tone.neutral.bg' },
  colorBorder: { kind: 'color', to: 'tk.color.line.base' },
  colorBorderSecondary: { kind: 'color', to: 'tk.color.line.hairline' },
  colorSplit: { kind: 'color', to: 'tk.color.line.hairline' },
  colorSuccess: { kind: 'color', to: 'tk.color.tone.success.solid' },
  colorSuccessText: { kind: 'color', to: 'tk.color.tone.success.fg' },
  colorSuccessBg: { kind: 'color', to: 'tk.color.tone.success.bg' },
  colorWarning: { kind: 'color', to: 'tk.color.tone.pending.solid' },
  colorWarningText: { kind: 'color', to: 'tk.color.tone.pending.fg' },
  colorWarningBg: { kind: 'color', to: 'tk.color.tone.pending.bg' },
  colorError: { kind: 'color', to: 'tk.color.tone.danger.solid' },
  colorErrorText: { kind: 'color', to: 'tk.color.tone.danger.fg' },
  colorErrorBg: { kind: 'color', to: 'tk.color.tone.danger.bg' },
  colorInfo: { kind: 'color', to: 'tk.color.tone.info.solid' },
  colorInfoBg: { kind: 'color', to: 'tk.color.tone.info.bg' },
  boxShadowSecondary: { kind: 'shadow', to: 'tk.shadow.float' },
  boxShadowTertiary: { kind: 'shadow', to: 'tk.shadow.float' },
};

const LINE_OF: Record<string, string> = { colorBorderSecondary: 'hairline', colorSplit: 'hairline', colorBorder: 'base' };

/** Style keys whose number is a space, a corner, a type size or a weight (the lint rule's list). */
const SIZE_KEY = /^(?:margin|padding|inset|gap|rowGap|columnGap|borderRadius|border(?:Top|Bottom)(?:Left|Right)Radius|border(?:Start|End)(?:Start|End)Radius|fontSize|fontWeight|lineHeight|letterSpacing)(?:Top|Bottom|Left|Right|Inline|Block|InlineStart|InlineEnd|BlockStart|BlockEnd)?$/;
const keyKind = (key: string): 'space' | 'radius' | 'font' | 'weight' | null =>
  /Radius$/.test(key) ? 'radius' : key === 'fontSize' ? 'font' : key === 'fontWeight' ? 'weight' : /^(?:margin|padding|inset|gap|rowGap|columnGap)/.test(key) ? 'space' : null;

/** A number in a style, as its token, or null when it is off the scale. */
function numberTo(kind: 'space' | 'radius' | 'font' | 'weight', n: number): string | null {
  if (kind === 'space') return n < 0 ? (SPACE_STEP[-n] ? `tk.neg(${SPACE_STEP[-n] === 'half' ? "'half'" : SPACE_STEP[-n]})` : null) : SPACE_STEP[n] ? space(n) : null;
  if (kind === 'radius') return RADIUS_OF[n] ? `tk.radius.${RADIUS_OF[n]}` : null;
  if (kind === 'font') return TYPE_OF_SIZE[n] ? `tk.type.${TYPE_OF_SIZE[n]}.fontSize` : null;
  return TYPE_OF_WEIGHT[n] ? `tk.type.${TYPE_OF_WEIGHT[n]}.fontWeight` : null;
}

// ---- Where a rewrite is safe -------------------------------------------------------------------------------------

/** Inside a style: a `style`/`styles` attribute, a `CSSProperties` object, or a `Flex`'s gap. */
function inStyle(node: ts.Node): boolean {
  for (let n: ts.Node | undefined = node.parent; n; n = n.parent) {
    if (ts.isJsxAttribute(n)) {
      const name = n.name.getText();
      if (name === 'style' || name === 'styles') return true;
      if (/^(gap|rowGap|columnGap)$/.test(name)) {
        const el = n.parent.parent;
        return (ts.isJsxOpeningElement(el) || ts.isJsxSelfClosingElement(el)) && el.tagName.getText() === 'Flex';
      }
      return false;
    }
    if (ts.isVariableDeclaration(n) || ts.isParameter(n) || ts.isPropertyDeclaration(n)) return !!n.type && /CSSProperties/.test(n.type.getText());
    if (ts.isAsExpression(n) || ts.isSatisfiesExpression(n)) {
      if (/CSSProperties/.test(n.type.getText())) return true;
    }
    if (ts.isFunctionLike(n) || ts.isBlock(n) || ts.isSourceFile(n)) return false;
    // A number in arithmetic or handed to a call is a number someone needs; leave it.
    if (ts.isBinaryExpression(n) && n.operatorToken.kind !== ts.SyntaxKind.QuestionQuestionToken && n.operatorToken.kind !== ts.SyntaxKind.BarBarToken && n.operatorToken.kind !== ts.SyntaxKind.AmpersandAmpersandToken) return false;
    if (ts.isCallExpression(n) && n.expression.getText() !== 'themeColor' && n.expression.getText() !== 'themeFontSize') return false;
  }
  return false;
}

/** `token.X`, `themeColor('X')` or `themeFontSize('X')`: the antd name it reads, else null. */
function oldName(e: ts.Expression): string | null {
  if (ts.isPropertyAccessExpression(e) && ts.isIdentifier(e.expression) && e.expression.text === 'token') return e.name.text;
  if (ts.isCallExpression(e) && ts.isIdentifier(e.expression) && (e.expression.text === 'themeColor' || e.expression.text === 'themeFontSize') && e.arguments.length === 1 && ts.isStringLiteral(e.arguments[0]))
    return e.arguments[0].text;
  return null;
}

// ---- The rewrite ------------------------------------------------------------------------------------------------

interface Edit {
  start: number;
  end: number;
  text: string;
}

interface Result {
  text: string;
  changed: number;
  left: string[];
}

export function rewrite(file: string, source: string): Result {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits: Edit[] = [];
  const left: string[] = [];
  const at = (n: ts.Node) => `${path.relative(WEB, file)}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const covered = (n: ts.Node) => edits.some((e) => n.getStart() >= e.start && n.getEnd() <= e.end);

  const templateOf = (t: ts.TemplateExpression): string | null => {
    // Rebuild the template with each old token resolved; null when a part cannot move.
    let out = t.head.rawText ?? t.head.text;
    for (const span of t.templateSpans) {
      const name = oldName(span.expression);
      let lit = span.literal.rawText ?? span.literal.text;
      const m = name ? TOKEN[name] : undefined;
      if (name === 'lineWidth' && lit.startsWith('px')) {
        out += '1px';
        lit = lit.slice(2);
      } else if (name === 'lineType') {
        out += 'solid';
      } else if (m && (m.kind === 'space' || m.kind === 'radius') && lit.startsWith('px')) {
        out += `\${${m.to}}`;
        lit = lit.slice(2);
      } else if (m && m.kind === 'color' && !/^[0-9a-fA-F]/.test(lit)) {
        out += `\${${m.to}}`;
      } else if (m && m.kind === 'shadow') {
        out += `\${${m.to}}`;
      } else if (name) {
        return null;
      } else {
        out += `\${${span.expression.getText()}}`;
      }
      out += lit;
    }
    return out;
  };

  const visit = (node: ts.Node): void => {
    if (covered(node)) return;
    // A whole template: `${token.lineWidth}px ${token.lineType} ${token.colorSplit}` and friends.
    if (ts.isTemplateExpression(node) && node.templateSpans.some((s) => oldName(s.expression)) && inStyle(node)) {
      const spans = node.templateSpans;
      const names = spans.map((s) => oldName(s.expression));
      if (spans.length === 3 && names[0] === 'lineWidth' && names[1] === 'lineType' && names[2] && LINE_OF[names[2]] && node.head.text === '' && spans[0].literal.text === 'px ' && spans[1].literal.text === ' ' && spans[2].literal.text === '') {
        edits.push({ start: node.getStart(), end: node.getEnd(), text: `tk.line('${LINE_OF[names[2]]}')` });
        return;
      }
      const t = templateOf(node);
      if (t !== null) {
        edits.push({ start: node.getStart(), end: node.getEnd(), text: '`' + t + '`' });
        return;
      }
      left.push(`${at(node)} a template mixing tokens with arithmetic or alpha: ${node.getText().slice(0, 80)}`);
      return;
    }
    const name = ts.isExpression(node) ? oldName(node) : null;
    if (name) {
      const m = TOKEN[name];
      const parentIsTemplate = ts.isTemplateSpan(node.parent);
      if (!m) left.push(`${at(node)} ${node.getText()} has no token`);
      else if (parentIsTemplate) left.push(`${at(node)} ${node.getText()} inside a template that cannot move`);
      else if ((m.kind === 'font' || m.kind === 'weight') && !ts.isBinaryExpression(node.parent)) edits.push({ start: node.getStart(), end: node.getEnd(), text: m.to });
      else if (inStyle(node)) edits.push({ start: node.getStart(), end: node.getEnd(), text: m.to });
      else left.push(`${at(node)} ${node.getText()} where a number or a colour value is needed`);
      return;
    }
    // Numbers on the scale, and px strings made only of them.
    if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && SIZE_KEY.test(node.name.text) && inStyle(node)) {
      const kind = keyKind(node.name.text);
      const v = node.initializer;
      // A number, or the numbers a condition picks between (`strong ? 600 : undefined`).
      const numbers = (e: ts.Expression): ts.Expression[] =>
        ts.isParenthesizedExpression(e) ? numbers(e.expression) : ts.isConditionalExpression(e) ? [...numbers(e.whenTrue), ...numbers(e.whenFalse)] : [e];
      const valueOf = (e: ts.Expression) =>
        ts.isNumericLiteral(e) ? Number(e.text) : ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.MinusToken && ts.isNumericLiteral(e.operand) ? -Number(e.operand.text) : null;
      const found = numbers(v).filter((e) => valueOf(e) !== null && valueOf(e) !== 0);
      if (kind && found.length) {
        for (const e of found) {
          const num = valueOf(e)!;
          const to = numberTo(kind, num);
          if (to) edits.push({ start: e.getStart(), end: e.getEnd(), text: to });
          else left.push(`${at(e)} ${node.name.text}: ${num} is off the scale`);
        }
        return;
      }
      if (kind === 'space' && (ts.isStringLiteral(v) || ts.isNoSubstitutionTemplateLiteral(v)) && /px\b/.test(v.text)) {
        const parts = v.text.trim().split(/\s+/);
        const out = parts.map((p) => (p === '0' ? '0' : /^-?\d+px$/.test(p) ? numberTo('space', parseInt(p, 10)) : null));
        if (out.every((o) => o !== null)) {
          const text = out.every((o) => o === '0') ? '0' : '`' + out.map((o) => (o === '0' ? '0' : `\${${o}}`)).join(' ') + '`';
          edits.push({ start: v.getStart(), end: v.getEnd(), text });
        } else left.push(`${at(v)} ${node.name.text}: '${v.text}' is off the scale`);
        return;
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);

  let text = apply(source, edits);
  if (edits.length) text = tidy(file, text);
  return { text, changed: edits.length, left };
}

function apply(source: string, edits: Edit[]): string {
  let out = source;
  for (const e of [...edits].sort((a, b) => b.start - a.start)) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/** Drops a `theme.useToken()` nothing reads and imports nothing uses, and imports `tk`. */
function tidy(file: string, source: string): string {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const edits: Edit[] = [];
  const uses = (scope: ts.Node, name: string, except: ts.Node) => {
    let n = 0;
    const walk = (x: ts.Node) => {
      if (x === except) return;
      if (ts.isIdentifier(x) && x.text === name && !(ts.isPropertyAccessExpression(x.parent) && x.parent.name === x) && !(ts.isPropertyAssignment(x.parent) && x.parent.name === x)) n++;
      ts.forEachChild(x, walk);
    };
    walk(scope);
    return n;
  };
  const visit = (node: ts.Node) => {
    if (ts.isVariableStatement(node) && /^const \{ token \} = theme\.useToken\(\);$/.test(node.getText())) {
      const scope = node.parent;
      if (!uses(scope, 'token', node)) {
        const start = node.getFullStart();
        edits.push({ start, end: node.getEnd(), text: '' });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  let out = apply(source, edits);

  // Imports: `theme` from antd, `themeColor` / `themeFontSize` from '@/lib/theme', then `tk`.
  const body = (s: string) => s.replace(/^import[^;]*;$/gm, '');
  const unused = (name: string) => !new RegExp(`\\b${name}\\b`).test(body(out));
  out = out.replace(/^import \{([^}]*)\} from 'antd';$/m, (line, names: string) => {
    const kept = names.split(',').map((n) => n.trim()).filter((n) => n && !(n === 'theme' && unused('theme')));
    return `import { ${kept.join(', ')} } from 'antd';`;
  });
  out = out.replace(/^import \{([^}]*)\} from '@\/lib\/theme';\n/m, (line, names: string) => {
    const kept = names.split(',').map((n) => n.trim()).filter((n) => n && !(/^(themeColor|themeFontSize)$/.test(n) && unused(n)));
    return kept.length ? `import { ${kept.join(', ')} } from '@/lib/theme';\n` : '';
  });
  if (/\btk\./.test(body(out)) && !/^import \{[^}]*\btk\b[^}]*\} from '@\/ds';$/m.test(out)) {
    const m = /^import [^;]*from 'antd';$/m.exec(out) ?? /^import [^;]*;$/m.exec(out);
    if (m) out = out.slice(0, m.index + m[0].length) + "\nimport { tk } from '@/ds';" + out.slice(m.index + m[0].length);
  }
  return out;
}

// ---- Command line -----------------------------------------------------------------------------------------------

function filesUnder(p: string): string[] {
  const abs = path.resolve(WEB, p);
  if (fs.statSync(abs).isFile()) return [abs];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? filesUnder(path.join(abs, d.name)) : /\.tsx?$/.test(d.name) ? [path.join(abs, d.name)] : []));
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const targets = args.filter((a) => !a.startsWith('--'));
  if (!targets.length) {
    console.error('Usage: to-tk.ts [--write] <file or folder>…');
    process.exit(2);
  }
  const files = targets.flatMap(filesUnder);
  let changed = 0;
  const left: string[] = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    const r = rewrite(f, src);
    left.push(...r.left);
    if (r.changed && r.text !== src) {
      changed++;
      if (write) fs.writeFileSync(f, r.text);
    }
  }
  console.log(`to-tk: ${files.length} files read, ${changed} ${write ? 'rewritten' : 'would change'}.`);
  if (left.length) console.log(`Left for a person (${left.length}):\n  ${left.join('\n  ')}`);
}

if (require.main === module) main();
