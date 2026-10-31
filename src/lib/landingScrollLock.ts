export type ScrollLockSnapshot = {
  scrollY: number;
  /** Document Y of section bottom when lock was taken — used on forward release. */
  sectionEndY?: number;
};

export type LandingWheelConsumer = {
  id: string;
  /** When true, this consumer gets first chance at wheel events. */
  isActive: () => boolean;
  /** Return true to preventDefault on the wheel event. */
  onWheel: (deltaY: number) => boolean;
};

let scrollLockOwner: string | null = null;
const wheelConsumers: LandingWheelConsumer[] = [];
let wheelRouterBound = false;

export function isBodyScrollLocked(): boolean {
  return document.body.style.position === 'fixed';
}

export function getScrollLockOwner(): string | null {
  return scrollLockOwner;
}

export function lockPageScroll(scrollY: number, owner?: string) {
  if (owner) scrollLockOwner = owner;
  document.body.style.overflow = 'hidden';
  document.body.style.position = 'fixed';
  document.body.style.top = `-${scrollY}px`;
  document.body.style.width = '100%';
}

export function unlockPageScroll(snapshot: ScrollLockSnapshot, owner?: string) {
  if (owner && scrollLockOwner !== owner) return;

  const scrollY = Math.max(0, Math.round(snapshot.scrollY));
  scrollLockOwner = null;

  // While body is still fixed, prime the document scroll position so the first
  // paint after unlock is already at the target — prevents a one-frame flash to Y=0.
  const html = document.documentElement;
  const prevScrollBehavior = html.style.scrollBehavior;
  html.style.scrollBehavior = 'auto';
  html.scrollTop = scrollY;
  if (document.body.scrollTop !== scrollY) {
    document.body.scrollTop = scrollY;
  }

  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';

  window.scrollTo(0, scrollY);
  html.style.scrollBehavior = prevScrollBehavior;

  requestAnimationFrame(() => {
    window.scrollTo(0, scrollY);
  });
}

export function readScrollY(): number {
  if (isBodyScrollLocked()) {
    const top = document.body.style.top;
    if (top) return Math.abs(parseInt(top, 10)) || 0;
  }
  return window.scrollY;
}

export function captureScrollLock(scrollY: number): ScrollLockSnapshot {
  return { scrollY: Math.max(0, Math.round(scrollY)) };
}

export function resolveEngageScrollY(section: HTMLElement): number {
  const rect = section.getBoundingClientRect();
  return Math.max(0, Math.round(readScrollY() + rect.top));
}

export function resolveEngageSectionEndY(section: HTMLElement, scrollY: number): number {
  const rect = section.getBoundingClientRect();
  return Math.max(scrollY, Math.round(scrollY + rect.height));
}

export function resolveSectionReleaseScrollY(
  section: HTMLElement | null,
  snapshot: ScrollLockSnapshot,
  forward: boolean,
  continueDelta = 0
): number {
  const lockedScrollY = Math.max(0, Math.round(snapshot.scrollY));
  if (!forward) return lockedScrollY;

  const momentum =
    continueDelta > 0 ? Math.min(Math.abs(continueDelta) * 0.35, 72) : 32;

  if (section && isBodyScrollLocked()) {
    const rect = section.getBoundingClientRect();
    const currentY = readScrollY();
    const sectionTopY = Math.round(currentY + rect.top);
    const sectionBottomY = Math.round(currentY + rect.bottom);
    const storedEnd = snapshot.sectionEndY ?? sectionBottomY;
    const exitY = Math.max(storedEnd, sectionBottomY) + momentum;
    return Math.max(exitY, sectionTopY + 48, lockedScrollY + momentum);
  }

  if (snapshot.sectionEndY != null) {
    return Math.max(snapshot.sectionEndY + momentum, lockedScrollY + momentum);
  }

  const fallbackEnd = lockedScrollY;
  return Math.max(fallbackEnd + momentum, lockedScrollY + momentum);
}

/** @deprecated Use resolveSectionReleaseScrollY */
export function sectionReleaseScrollY(
  lockedScrollY: number,
  forward: boolean,
  continueDelta = 0
): number {
  if (!forward) return lockedScrollY;
  const nudge = continueDelta > 0 ? Math.min(continueDelta * 0.85, 140) : 88;
  return Math.max(0, Math.round(lockedScrollY + nudge));
}

function routeWheelEvent(e: WheelEvent) {
  for (let i = wheelConsumers.length - 1; i >= 0; i -= 1) {
    const consumer = wheelConsumers[i];
    if (!consumer.isActive()) continue;
    const consumed = consumer.onWheel(e.deltaY);
    if (consumed) {
      e.preventDefault();
    }
    return;
  }
}

export function registerLandingWheelConsumer(consumer: LandingWheelConsumer) {
  const existing = wheelConsumers.findIndex((c) => c.id === consumer.id);
  if (existing >= 0) wheelConsumers[existing] = consumer;
  else wheelConsumers.push(consumer);

  if (!wheelRouterBound) {
    wheelRouterBound = true;
    window.addEventListener('wheel', routeWheelEvent, { passive: false });
  }
}

export function unregisterLandingWheelConsumer(id: string) {
  const idx = wheelConsumers.findIndex((c) => c.id === id);
  if (idx >= 0) wheelConsumers.splice(idx, 1);
}

export function forceReleaseAllScrollLocks() {
  if (!isBodyScrollLocked()) {
    scrollLockOwner = null;
    return;
  }
  scrollLockOwner = null;
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
}
