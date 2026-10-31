import { readScrollY } from './landingScrollLock';

/** Sticky nav clearance when snapping section titles to the top. */
const ANCHOR_TOP_OFFSET_PX = 76;

let programmaticScrollUntil = 0;

export function beginProgrammaticScroll(ms = 600): void {
  programmaticScrollUntil = Date.now() + ms;
}

export function isProgrammaticScroll(): boolean {
  return Date.now() < programmaticScrollUntil;
}

export function getAnchorScrollY(anchorId: string, offsetPx = ANCHOR_TOP_OFFSET_PX): number {
  const el = document.getElementById(anchorId);
  if (!el) return readScrollY();
  const rect = el.getBoundingClientRect();
  return Math.max(0, Math.round(readScrollY() + rect.top - offsetPx));
}

export function getElementScrollY(el: HTMLElement, offsetPx = ANCHOR_TOP_OFFSET_PX): number {
  const rect = el.getBoundingClientRect();
  return Math.max(0, Math.round(readScrollY() + rect.top - offsetPx));
}

export function scrollToAnchorY(
  anchorId: string,
  behavior: ScrollBehavior = 'auto',
  offsetPx = ANCHOR_TOP_OFFSET_PX
): void {
  const y = getAnchorScrollY(anchorId, offsetPx);
  beginProgrammaticScroll(behavior === 'smooth' ? 900 : 450);
  window.scrollTo({ top: y, behavior });
}
