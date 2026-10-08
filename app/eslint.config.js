import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

/** Local design-token rules (see the `no-restricted-syntax` block below for
 *  the hard bans; these are the soft ones). */
const ARBITRARY = /\b(?:[a-z]+:)*(text|rounded)-\[\d+(?:\.\d+)?px\]/
const designTokens = {
  rules: {
    'no-arbitrary-size': {
      meta: {
        type: 'suggestion',
        docs: {
          description:
            'Prefer the token scale (text-13 …, rounded-sm/md/lg) over arbitrary px values.',
        },
        schema: [],
      },
      create(context) {
        const check = (node, text) => {
          const m = ARBITRARY.exec(text)
          if (!m) return
          context.report({
            node,
            message:
              m[1] === 'text'
                ? `Arbitrary size ${m[0]} — use the --text-* scale (text-10/11/13/15/17/22, or a Tailwind default). `
                : `Arbitrary radius ${m[0]} — the scale is rounded-sm (6) / md (8) / lg (12).`,
          })
        }
        return {
          Literal(node) {
            if (typeof node.value === 'string') check(node, node.value)
          },
          TemplateElement(node) {
            check(node, node.value.raw)
          },
        }
      },
    },
  },
}

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // No native tooltips: `title` on a DOM element
      // renders browser chrome that reads as foreign to the product, and
      // some browsers never show it over disabled controls. Use
      // `HoverTip` (components/hover-tip.tsx). Lowercase-element match
      // only, so component props named `title` (Modal, PageShell, …)
      // stay untouched; `<iframe title>` is exempt (an accessibility
      // requirement, not a tooltip), as are `alt`/`aria-*`, which this
      // rule never matches.
      'no-restricted-syntax': [
        'error',
        {
          selector:
            "JSXOpeningElement[name.name=/^(?!iframe$)[a-z]/] > JSXAttribute[name.name='title']",
          message:
            'Native title tooltips are banned — wrap the trigger in <HoverTip text="…"> (components/hover-tip.tsx) instead.',
        },
        // Design-token discipline. Color lives in the token
        // layer of index.css; a theme is swapped on <html>, so a component
        // may never name a color. Tailwind emits NOTHING for an unknown
        // utility, which is how a retired token silently deletes a focus
        // ring — hence the bans are errors, not warnings.
        {
          selector:
            "Literal[value=/(^|[\\s'\"(])(hover:|focus-visible:|focus:|active:|md:|sm:|lg:)*(bg|text|border|ring|from|to|via|divide|outline|fill|stroke)-(white|black)(\\/|\\b)/]",
          message:
            'No white/black utilities — use the pair for the block: inverse/inverse-fg, primary/primary-foreground, backdrop/on-backdrop, or sidebar-* on the rail.',
        },
        {
          selector:
            "TemplateElement[value.raw=/(^|[\\s'\"(])(hover:|focus-visible:|focus:|active:|md:|sm:|lg:)*(bg|text|border|ring|from|to|via|divide|outline|fill|stroke)-(white|black)(\\/|\\b)/]",
          message:
            'No white/black utilities — use the pair for the block: inverse/inverse-fg, primary/primary-foreground, backdrop/on-backdrop, or sidebar-* on the rail.',
        },
        {
          selector:
            "Literal[value=/(^|[\\s'\"(])(hover:|focus-visible:|focus:|active:|md:|sm:|lg:)*bg-text(\\/|\\b)(?!-)/]",
          message:
            'bg-text is an inverted block in disguise — use bg-inverse text-inverse-fg so it survives a theme swap.',
        },
        {
          selector:
            "Literal[value=/(bg|text|border|ring|fill|stroke|shadow|outline|from|to)-\\[#[0-9a-fA-F]{3,8}\\]/]",
          message:
            'No hex colors in className — add a token to index.css (layer C) and use its utility.',
        },
        {
          selector:
            "JSXAttribute[name.name=/^(fill|stroke|color|stopColor)$/] > Literal[value=/^#|^rgba?\\(/]",
          message:
            'No color literals on SVG attributes — use className="fill-<token>" / "stroke-<token>" (Tailwind v4 generates these from --color-*).',
        },
        {
          selector:
            "JSXAttribute[name.name='style'] Literal[value=/#[0-9a-fA-F]{3,8}\\b|rgba?\\(/]",
          message:
            'No color literals in style props — reference a token: var(--color-…) or color-mix(in srgb, var(--color-…) N%, transparent).',
        },
        {
          selector: "Literal[value=/\\[font-family:/]",
          message:
            'No inline font stacks — use font-sans / font-mono (tokens in index.css).',
        },
        {
          selector: "Literal[value=/(^|[\\s'\"(])dark:/]",
          message:
            'No dark: variants in components — the tokens carry the theme. If a surface truly needs a per-theme rule, put it in index.css.',
        },
      ],
    },
  },
  {
    // Arbitrary sizes are a WARNING; new code should use the --text-* tokens
    // (text-13 …).
    // Arbitrary radii likewise: the scale is 6/8/12 (rounded-sm/md/lg).
    // A local rule because `no-restricted-syntax` carries one severity
    // per config block and the bans above are errors.
    files: ['src/**/*.{ts,tsx}'],
    plugins: { 'design-tokens': designTokens },
    rules: {
      'design-tokens/no-arbitrary-size': 'warn',
    },
  },
  {
    // TanStack Router file routes must export `Route` alongside their
    // components, so fast-refresh can never apply to them — the rule
    // would flag every route file.
    files: ['src/routes/**/*.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
