// Heat colour for a 0-10 score (FMT-09): linear from HEAT_LO (score 0) to HEAT_HI (score 10), the same ramp
// as the live site. The old rule flipped the text to white above t = 0.55, which leaves the mid-blues at
// about 2.8:1. Here the text colour is whichever of the two inks has the better contrast on that cell's
// background, which is at least 4.5:1 for every score (checked in heat.test.ts).
//
// These constants mirror --heat-lo / --heat-hi / --heat-ink-* in tokens.css. A heat cell sets both its
// background and its text colour inline, so it reads the same in light and dark themes.

export const HEAT_LO = [234, 242, 251] as const;
export const HEAT_HI = [24, 86, 163] as const;
export const HEAT_INK_DARK = [0, 0, 0] as const; // #000000
export const HEAT_INK_LIGHT = [255, 255, 255] as const;

type RGB = readonly [number, number, number];

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function luminance([r, g, b]: RGB): number {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.x contrast ratio, 1 to 21. */
export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function heatRgb(score: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, score / 10));
  return HEAT_LO.map((c, i) => Math.round(c + (HEAT_HI[i]! - c) * t)) as [number, number, number];
}

export interface Heat {
  bg: string;
  fg: string;
  /** Contrast of fg on bg. */
  ratio: number;
}

const css = (c: RGB) => `rgb(${c.join(',')})`;

/** Background, text colour and ratio for a score; null when the score is unknown (no heat). */
export function heat(score: number | null | undefined): Heat | null {
  if (!isNum(score)) return null;
  const bg = heatRgb(score);
  const dark = contrast(bg, HEAT_INK_DARK);
  const light = contrast(bg, HEAT_INK_LIGHT);
  const useLight = light > dark;
  return { bg: css(bg), fg: css(useLight ? HEAT_INK_LIGHT : HEAT_INK_DARK), ratio: useLight ? light : dark };
}

/** Inline style for a heat cell (`''` when the score is unknown). */
export function heatStyle(score: number | null | undefined): string {
  const h = heat(score);
  return h ? `background:${h.bg};color:${h.fg}` : '';
}
