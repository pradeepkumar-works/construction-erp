// @ts-check
// The design system's lint rule (docs/design/REDESIGN.md): a screen names colours and sizes through `tk` from `@/ds`,
// never a value of its own. Files not yet moved are listed in src/ds/legacy-files.json and skip this rule; the list only
// shrinks (scripts/tokens-check.ts).

const HEX = /(^|[\s(,:'"`])#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-zA-Z_-])/;
const COLOR_FN = /\b(?:rgba?|hsla?|oklch|oklab)\(/;
const OLD_VARS = /var\(--(?:ant|brand)-/;
const PX = /(^|[\s(-])\d*\.?\d+px\b/;

/** Style keys whose value is a space, a corner, or type: these come from `tk.space`, `tk.radius` and `tk.type`. */
const SIZE_KEY = /^(?:margin|padding|inset|gap|rowGap|columnGap|borderRadius|border(?:Top|Bottom)(?:Left|Right)Radius|border(?:Start|End)(?:Start|End)Radius|fontSize|fontWeight|lineHeight|letterSpacing)(?:Top|Bottom|Left|Right|Inline|Block|InlineStart|InlineEnd|BlockStart|BlockEnd)?$/;

const OLD_CALLS = new Set(['themeColor', 'themeFontSize', 'familyColors', 'toneColors']);

/** @param {string} key */
const sizeKey = (key) => SIZE_KEY.test(key);

/** @type {import('eslint').Rule.RuleModule} */
const noRawStyle = {
  meta: {
    type: 'problem',
    docs: { description: 'Colours and sizes come from tk (@/ds), never a literal or an antd token of a screen\'s own.' },
    messages: {
      colour: 'A colour literal. Use a role from tk.color (@/ds), e.g. tk.color.text.muted or tk.color.tone.danger.fg.',
      oldVar: 'An antd or brand CSS variable. Use the tk path (@/ds) or, in CSS, its --c-*, --s-* or --r-* variable.',
      size: '"{{key}}" set to a number. Use tk.space[n], tk.radius.*, or spread a text style from tk.type.',
      brand: 'BRAND.colors is the old name for the token table. Use tk.color (@/ds).',
      useToken: 'theme.useToken() styles from antd\'s names. Use tk (@/ds), which follows the theme with no hook.',
      oldCall: '{{name}}() is the old token API. Use tk (@/ds).',
    },
    schema: [],
  },
  create(context) {
    /** @param {import('estree').Node} node @param {string} text */
    const checkText = (node, text) => {
      if (HEX.test(text) || COLOR_FN.test(text)) context.report({ node, messageId: 'colour' });
      else if (OLD_VARS.test(text)) context.report({ node, messageId: 'oldVar' });
    };
    return {
      Literal(node) {
        if (typeof node.value === 'string') checkText(node, node.value);
      },
      TemplateElement(node) {
        checkText(node, node.value.raw);
      },
      Property(node) {
        const key = node.key.type === 'Identifier' ? node.key.name : node.key.type === 'Literal' ? String(node.key.value) : null;
        if (!key || !sizeKey(key)) return;
        const v = node.value;
        const raw =
          v.type === 'Literal' && typeof v.value === 'number' ? (v.value === 0 ? null : String(v.value))
          : v.type === 'Literal' && typeof v.value === 'string' && PX.test(v.value) ? v.value
          : v.type === 'UnaryExpression' && v.argument.type === 'Literal' ? String(v.argument.value)
          : null;
        if (raw !== null) context.report({ node: v, messageId: 'size', data: { key } });
      },
      MemberExpression(node) {
        if (node.object.type === 'Identifier' && node.object.name === 'BRAND' && node.property.type === 'Identifier' && node.property.name === 'colors') {
          context.report({ node, messageId: 'brand' });
        }
      },
      CallExpression(node) {
        const c = node.callee;
        if (c.type === 'MemberExpression' && c.property.type === 'Identifier' && c.property.name === 'useToken') context.report({ node, messageId: 'useToken' });
        if (c.type === 'Identifier' && OLD_CALLS.has(c.name)) context.report({ node, messageId: 'oldCall', data: { name: c.name } });
      },
    };
  },
};

export default { rules: { 'no-raw-style': noRawStyle } };
