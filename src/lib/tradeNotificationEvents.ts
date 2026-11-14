type Listener = () => void;

const listeners = new Set<Listener>();

/** Ask the trade-notification provider to reload the bell (after manual/agent close). */
export function requestTradeNotificationRefresh(): void {
  for (const fn of listeners) fn();
}

export function subscribeTradeNotificationRefresh(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}