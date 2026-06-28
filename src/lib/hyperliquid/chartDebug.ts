export type ChartDebugEvent = {
  ts: number;
  scope: string;
  event: string;
  data?: Record<string, unknown>;
};

const MAX_EVENTS = 48;
const events: ChartDebugEvent[] = [];
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

export function isChartDebugEnabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    if (localStorage.getItem('monadier-chart-debug') === '1') return true;
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).has('chartDebug');
    }
  } catch {
    /* private mode */
  }
  return false;
}

export function subscribeChartDebug(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getChartDebugEvents(): ChartDebugEvent[] {
  return [...events];
}

export function chartDebugLog(
  scope: string,
  event: string,
  data?: Record<string, unknown>
): void {
  const row: ChartDebugEvent = { ts: Date.now(), scope, event, data };
  events.push(row);
  if (events.length > MAX_EVENTS) events.shift();
  emit();
  if (isChartDebugEnabled()) {
    console.debug(`[Chart:${scope}] ${event}`, data ?? '');
  }
}

/** Always logged — blank charts are user-visible failures. */
export function chartDebugWarn(
  scope: string,
  event: string,
  data?: Record<string, unknown>
): void {
  const row: ChartDebugEvent = { ts: Date.now(), scope, event, data };
  events.push(row);
  if (events.length > MAX_EVENTS) events.shift();
  emit();
  console.warn(`[Chart:${scope}] ${event}`, data ?? '');
}
