/** Device-only display preferences (not part of the save). */
const RANGES_PREF = 'zombie-idle-show-ranges';
let ranges: boolean = (() => { try { return localStorage.getItem(RANGES_PREF) === '1'; } catch { return false; } })();
/** Range lines on the battlefield: off by default. */
export const showRanges = () => ranges;
export function setShowRanges(on: boolean) { ranges = on; try { localStorage.setItem(RANGES_PREF, on ? '1' : '0'); } catch { /* storage blocked */ } }
