/** Device-only display preferences (not part of the save). */
const RANGES_PREF = 'zombie-idle-show-ranges';
let ranges: boolean = (() => { try { return localStorage.getItem(RANGES_PREF) === '1'; } catch { return false; } })();
/** Range lines on the battlefield: off by default. */
export const showRanges = () => ranges;
export function setShowRanges(on: boolean) { ranges = on; try { localStorage.setItem(RANGES_PREF, on ? '1' : '0'); } catch { /* storage blocked */ } }

const FPS_PREF = 'zombie-idle-show-fps';
let fps: boolean = (() => { try { return localStorage.getItem(FPS_PREF) === '1'; } catch { return false; } })();
/** FPS counter over the battlefield: off by default. */
export const showFps = () => fps;
export function setShowFps(on: boolean) { fps = on; try { localStorage.setItem(FPS_PREF, on ? '1' : '0'); } catch { /* storage blocked */ } }
