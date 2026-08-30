/**
 * The subset of the design system that TypeScript also needs.
 *
 * Some values cannot be read from CSS at the point they are used: the browser
 * theme colour is emitted into the document head, and a few inline style
 * fallbacks run before a stylesheet applies. Those values live here and must
 * stay identical to the semantic tokens declared in `src/app/globals.css`;
 * `design-tokens.test.ts` fails if the two drift.
 *
 * This is not a second design system. Anything that can be expressed in CSS
 * belongs in the token layer, not here.
 */

/** Warm near-black desktop canvas — `--surface-canvas`. */
export const surfaceCanvas = "#13110f";

/** Paper-white raised surface — `--surface-raised`. */
export const surfaceRaised = "#f2ebde";

/** Secondary raised surface — `--surface-raised-2`. */
export const surfaceRaised2 = "#e8dfcc";

/** The single lime signal — `--accent-base`. */
export const accentBase = "#c8ff3d";

/** Warm ember, used for failure and destructive intent — `--accent-alt`. */
export const accentAlt = "#e8633a";

/** Process and device state colours — `--state-*`. */
export const stateColors = {
  running: accentBase,
  starting: "#e8b842",
  stopped: "#9a9082",
  failed: accentAlt,
  stale: "#b9a97e",
  offline: "#9a9082"
} as const;

export type StateColorName = keyof typeof stateColors;
