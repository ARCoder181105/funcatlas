import type { BundledLanguage } from "shiki";

/**
 * Syntax highlighting, loaded only when a code block is first opened.
 *
 * The highlighter is Shiki's own singleton -- it already caches the instance
 * and the grammars, so there is nothing here to cache. The dynamic import is
 * the point: Shiki's grammars are large, and nothing needs them until a
 * function's source is on screen.
 */

/** What the parser stores in `files.language`, mapped to a Shiki grammar.
 *  Anything unlisted renders unhighlighted rather than failing. */
const GRAMMARS: Record<string, BundledLanguage> = {
  typescript: "typescript",
  tsx: "tsx",
  javascript: "javascript",
  jsx: "jsx",
  go: "go",
  rust: "rust",
  python: "python",
  java: "java",
};

/**
 * Both themes in one pass.
 *
 * Shiki emits `--shiki-light` and `--shiki-dark` custom properties per token
 * and `index.css` picks between them, so switching the theme does not
 * re-highlight anything -- which also means the code block cannot lag a beat
 * behind the rest of the interface on toggle.
 *
 * These are stock themes rather than ones derived from `lib/tokens.ts`.
 * Vitesse is muted and warm enough to sit on the Ember ground without looking
 * pasted in; if it ever fights the palette, Shiki takes a plain theme object,
 * so that is data rather than a fork.
 */
const THEMES = { light: "vitesse-light", dark: "vitesse-dark" } as const;

export async function highlight(source: string, language: string): Promise<string> {
  const lang = GRAMMARS[language];
  const { getSingletonHighlighter } = await import("shiki");

  const highlighter = await getSingletonHighlighter({
    themes: [THEMES.light, THEMES.dark],
    langs: lang === undefined ? [] : [lang],
  });

  return highlighter.codeToHtml(source, {
    lang: lang ?? "text",
    themes: THEMES,
    defaultColor: false,
  });
}
