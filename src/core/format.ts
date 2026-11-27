import type { Gear, Gun, RarityId } from './model.ts';
import { classById, strainById } from './model.ts';

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

/** Format a number stored as a natural log. Short suffixes up to 10^36, then scientific. */
export function fmtLn(ln: number): string {
  if (ln === -Infinity || Number.isNaN(ln)) return '0';
  const log10 = ln / Math.LN10 + 1e-9;
  if (log10 < 3) {
    const v = Math.exp(ln);
    return v < 10 ? v.toFixed(v < 1 ? 2 : 1).replace(/\.0$/, '') : Math.floor(v + 1e-6).toString();
  }
  const exp = Math.floor(log10);
  if (exp < SUFFIXES.length * 3) {
    const tier = Math.floor(exp / 3);
    const mant = Math.pow(10, log10 - tier * 3);
    return `${mant.toFixed(mant < 10 ? 2 : mant < 100 ? 1 : 0)}${SUFFIXES[tier]}`;
  }
  const mant = Math.pow(10, log10 - exp);
  return `${mant.toFixed(2)}e${exp.toLocaleString('en-US')}`;
}
export const fmtInt = (n: number) => Math.floor(n).toLocaleString('en-US');
export const fmtMult = (m: number) => (m >= 1e6 ? `×${fmtLn(Math.log(m))}` : m >= 10 ? `×${m.toFixed(0)}` : `×${m.toFixed(2)}`);
export const fmtNum = (v: number) => (v >= 100 ? fmtInt(v) : v >= 10 ? v.toFixed(1) : v.toFixed(2));

export const RARITY_COLOR: Record<RarityId, string> = {
  common: '#b8b8b8', uncommon: '#5fd068', rare: '#4aa3ff', epic: '#b66bff', legendary: '#ffb84a',
};
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
export const gunName = (g: Gun) => `${cap(g.rarity)} ${classById(g.cls).gun}`;

const ATTACH_NAME = { dmg: 'Hollow Points', spd: 'Drum Magazine', crit: 'Laser Sight', range: 'Long Scope' } as const;
export const gearName = (g: Gear) =>
  g.kind === 'attach' ? `${cap(g.rarity)} ${ATTACH_NAME[g.stat]}` : `${cap(g.rarity)} ${g.bane ? `${strainById(g.bane).dna} Bane` : 'Lucky Charm'}`;
export function gearDesc(g: Gear): string {
  const pct = (v: number) => `+${Math.round(v * 100)}%`;
  if (g.kind === 'attach') return `${pct(g.value)} ${g.stat === 'dmg' ? 'damage' : g.stat === 'spd' ? 'attack speed' : g.stat === 'crit' ? 'crit chance' : 'range'}`;
  return g.bane ? `${pct(g.value)} damage vs ${strainById(g.bane).dna} zombies` : `${pct(g.value)} damage vs everything`;
}
