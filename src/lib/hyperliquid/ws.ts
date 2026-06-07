import { HL_WS_URL } from './constants';

export type HlWsSubscription =
  | { type: 'l2Book'; coin: string }
  | { type: 'trades'; coin: string }
  | { type: 'candle'; coin: string; interval: string }
  | { type: 'allMids' }
  | { type: 'userFills'; user: string }
  | { type: 'orderUpdates'; user: string };

type WsMessage = {
  channel?: string;
  data?: unknown;
};

type Listener = (channel: string, data: unknown) => void;

function subKey(sub: HlWsSubscription): string {
  if (sub.type === 'candle') return `${sub.type}:${sub.coin}:${sub.interval}`;
  if ('user' in sub) return `${sub.type}:${sub.user}`;
  if ('coin' in sub) return `${sub.type}:${sub.coin}`;
  return sub.type;
}

/** Shared Hyperliquid WebSocket — one connection, many subscriptions. */
class HlWsClient {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private subs = new Map<string, HlWsSubscription>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  private connect() {
    if (this.disposed || this.ws?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(HL_WS_URL);
    this.ws = ws;

    ws.onopen = () => {
      for (const sub of this.subs.values()) {
        ws.send(JSON.stringify({ method: 'subscribe', subscription: sub }));
      }
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(String(ev.data)) as WsMessage;
        if (!msg.channel || msg.channel === 'subscriptionResponse') return;
        for (const fn of this.listeners) fn(msg.channel, msg.data);
      } catch {
        /* ignore malformed */
      }
    };

    ws.onclose = () => {
      this.ws = null;
      if (!this.disposed) this.scheduleReconnect();
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 2000);
  }

  subscribe(sub: HlWsSubscription) {
    const key = subKey(sub);
    if (this.subs.has(key)) return () => this.unsubscribe(sub);

    this.subs.set(key, sub);
    this.connect();

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: 'subscribe', subscription: sub }));
    }

    return () => this.unsubscribe(sub);
  }

  private unsubscribe(sub: HlWsSubscription) {
    const key = subKey(sub);
    if (!this.subs.has(key)) return;
    this.subs.delete(key);

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ method: 'unsubscribe', subscription: sub }));
    }

    if (this.subs.size === 0) {
      this.ws?.close();
      this.ws = null;
    }
  }

  addListener(fn: Listener) {
    this.listeners.add(fn);
    this.connect();
    return () => this.listeners.delete(fn);
  }

  dispose() {
    this.disposed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
    this.ws = null;
    this.subs.clear();
    this.listeners.clear();
  }
}

let shared: HlWsClient | null = null;

export function getHlWsClient(): HlWsClient {
  if (!shared) shared = new HlWsClient();
  return shared;
}
