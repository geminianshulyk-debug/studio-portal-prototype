import { Box, Layers, Leaf, PencilRuler, Ruler, type LucideIcon } from 'lucide-react';

/** Per-module visual identity: a line icon on a soft tint, assigned by course order. */
export const MOD_ICON: LucideIcon[] = [Ruler, Layers, PencilRuler, Leaf, Box];
export const MOD_TINT = ['butter', 'sky', 'blush', 'sage'];

const DAY = 864e5;
/** "in 2 days" / "today" / "1 day ago" — friendlier than a raw countdown in a headline. */
export function humanDue(iso: string, now: number) {
  const ms = new Date(iso.length === 10 ? iso + 'T23:59:00' : iso).getTime() - now;
  const d = Math.round(Math.abs(ms) / DAY);
  if (ms < 0) return d <= 0 ? 'earlier today' : `${d} day${d === 1 ? '' : 's'} ago`;
  if (ms < DAY) return 'today';
  return `in ${d} day${d === 1 ? '' : 's'}`;
}

/** Time-of-day greeting for the staff home hero. */
export const greeting = (now: number) => { const h = new Date(now).getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

/** "Dr. Meera Kulkarni" → "Dr. Kulkarni"; "Riya Shah (TA)" → "Riya". */
export function shortName(name: string) {
  const clean = name.replace(/\(.*?\)/g, '').trim();
  const t = clean.match(/^(Dr\.|Prof\.)\s/);
  return t ? `${t[1]} ${clean.split(/\s+/).at(-1)}` : clean.split(/\s+/)[0];
}

/** "Dr. Meera Kulkarni" → "MK"; titles and bracketed roles are ignored. */
export const initials = (name: string) => name.replace(/\(.*?\)|Dr\.|Prof\./g, '').trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();

/** Read a design token (CSS variable) for libraries that need literal colour values, e.g. charts and confetti. */
export const tok = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
export const chartColors = () => [1, 2, 3, 4, 5, 6].map((n) => tok(`--chart-${n}`));
