export type ScrollLockSnapshot = {
  scrollY: number;
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
  document.body.style.overflow = '';
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';

  window.scrollTo(0, scrollY);

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
    if (consumer.onWheel(e.deltaY)) {
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
