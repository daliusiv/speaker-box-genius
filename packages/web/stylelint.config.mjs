// Stylelint: tokens only, as errors, for every stylesheet except the baseline. The baseline is the
// legacy styles.css: it is ignored until its screens move onto src/ui/ (each migrated screen's
// rules leave styles.css for a linted file), so PRs mid-migration aren't blocked. tokens.css is
// generated from tokens.json and is where the raw values live.

/** Keywords and shapes a token-only property may still use. */
const KEYWORDS = [
  "0",
  "auto",
  "none",
  "inherit",
  "initial",
  "unset",
  "transparent",
  "currentColor",
  "currentcolor",
  "100%",
  "50%",
  "fit-content",
  "max-content",
  "min-content",
  "1fr",
  // calc() is fine when it is built from tokens (checked by the var() inside).
  "/^calc\\(.*var\\(--/",
  "/^min\\(.*var\\(--/",
  "/^max\\(.*var\\(--/",
  // 100vh/100dvh for full-screen sheets.
  "/^100d?v[hw]$/",
];

export default {
  plugins: ["stylelint-declaration-strict-value"],
  ignoreFiles: ["src/styles.css", "src/ui/tokens.css", "dist/**", "node_modules/**"],
  rules: {
    "scale-unlimited/declaration-strict-value": [
      [
        "/^(margin|padding)(-.+)?$/",
        "/^(row-|column-)?gap$/",
        "font-size",
        "font-weight",
        "border-radius",
        "/^(min-|max-)?(height|width)$/",
        "z-index",
        "color",
        "background-color",
        "border-color",
        "outline-color",
        "fill",
        "stroke",
      ],
      {
        ignoreValues: KEYWORDS,
        ignoreFunctions: false,
        expandShorthand: true,
        // Shorthands such as `padding: var(--space-2) var(--space-4)` are checked value by value.
        message: "Use a token (var(--…)) for ${property}: raw values break the scale. Add a token in src/ui/tokens.json if none fits.",
      },
    ],
  },
};
