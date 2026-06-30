import { toNum } from './parse';
import { hlInfoPost } from './hlInfoClient';

export type HlMarginSummary = {
  accountValue: string;
  totalNtlPos: string;
  totalRawUsd: string;
  totalMarginUsed: string;
};

export type HlPosition = {
  coin: string;
  szi: string;
  entryPx: string;
  positionValue: string;
  unrealizedPnl: string;
  marginUsed?: string;
  leverage: { type: string; value: number };
  liquidationPx: string | null;
};

export type HlOpenOrder = {
  coin: string;
  side: string;
  limitPx: string;
  sz: string;
  oid: number;
  timestamp: number;
  orderType: string;
  reduceOnly: boolean;
  isTrigger?: boolean;
  triggerPx?: string;
  triggerCondition?: string;
  isPositionTpsl?: boolean;
};

export type HlTwapOrder = {
  twapId: number;
  time: number;
  coin: string;
  side: string;
  sz: string;
  executedSz: string;
  executedNtl: string;
  minutes: number;
  randomize: boolean;
  reduceOnly: boolean;
  status: 'activated' | 'finished' | 'terminated' | 'error';
  statusDetail?: string;
};

export type HlUserFill = {
  coin: string;
  px: string;
  sz: string;
  side: string;
  time: number;
  closedPnl: string;
  fee: string;
  dir?: string;
  tid?: number;
};

export type HlFundingPayment = {
  coin: string;
  usdc: string;
  time: number;
  fundingRate: string;
};

export type HlHistoricalOrder = {
  coin: string;
  side: string;
  limitPx: string;
  sz: string;
  oid: number;
  timestamp: number;
  orderType: string;
  status: string;
  statusTimestamp: number;
};

export type HlSpotBalance = {
  coin: string;
  token: number;
  total: string;
  hold: string;
  entryNtl: string;
};

export type HlAccountState = {
  margin: HlMarginSummary;
  crossMargin?: HlMarginSummary;
  positions: HlPosition[];
  withdrawable: string;
};

export type HlSpotAccountState = {
  balances: HlSpotBalance[];
};

async function hlInfo<T>(body: Record<string, unknown>): Promise<T> {
  return hlInfoPost<T>(body);
}

type ClearinghouseState = {
  marginSummary?: HlMarginSummary;
  crossMarginSummary?: HlMarginSummary;
  withdrawable?: string;
  assetPositions?: Array<{
    position?: {
      coin?: string;
      szi?: string;
      entryPx?: string;
      positionValue?: string;
      unrealizedPnl?: string;
      marginUsed?: string;
      leverage?: { type?: string; value?: number } | number;
      liquidationPx?: string | null;
    };
  }>;
};

const EMPTY_MARGIN: HlMarginSummary = {
  accountValue: '0',
  totalNtlPos: '0',
  totalRawUsd: '0',
  totalMarginUsed: '0',
};

function normalizeLeverage(
  raw: { type?: string; value?: number } | number | null | undefined
): { type: string; value: number } {
  if (raw == null) return { type: 'cross', value: 0 };
  if (typeof raw === 'number') return { type: 'cross', value: raw };
  return {
    type: typeof raw.type === 'string' ? raw.type : 'cross',
    value: toNum(raw.value),
  };
}

function normalizePosition(
  raw: NonNullable<ClearinghouseState['assetPositions']>[number]['position']
): HlPosition | null {
  if (!raw?.coin) return null;
  const szi = String(raw.szi ?? '0');
  if (toNum(szi) === 0) return null;
  return {
    coin: raw.coin,
    szi,
    entryPx: String(raw.entryPx ?? '0'),
    positionValue: String(raw.positionValue ?? '0'),
    unrealizedPnl: String(raw.unrealizedPnl ?? '0'),
    marginUsed: raw.marginUsed != null ? String(raw.marginUsed) : undefined,
    leverage: normalizeLeverage(raw.leverage),
    liquidationPx: raw.liquidationPx ?? null,
  };
}

export type HlExtraAgent = {
  address: string;
  name: string;
  validUntil: number;
};

export async function fetchHlExtraAgents(user: string): Promise<HlExtraAgent[]> {
  const rows = await hlInfo<Array<{ address?: string; name?: string; validUntil?: number }>>({
    type: 'extraAgents',
    user,
  });
  if (!Array.isArray(rows)) return [];
  return rows
    .map((r) => ({
      address: String(r.address ?? '').toLowerCase(),
      name: String(r.name ?? ''),
      validUntil: Number(r.validUntil ?? 0),
    }))
    .filter((r) => r.address.length >= 42);
}

export function isHlExtraAgentActive(agent: HlExtraAgent): boolean {
  return agent.validUntil > Date.now();
}

export async function fetchHlAccountState(user: string): Promise<HlAccountState> {
  const data = await hlInfo<ClearinghouseState>({
    type: 'clearinghouseState',
    user: user.toLowerCase(),
  });
  const margin = data.marginSummary ?? EMPTY_MARGIN;
  const crossMargin = data.crossMarginSummary ?? EMPTY_MARGIN;
  const marginAccountValue = Math.max(
    toNum(margin.accountValue),
    toNum(crossMargin.accountValue)
  );
  const positions = (data.assetPositions ?? [])
    .map((row) => normalizePosition(row.position))
    .filter((p): p is HlPosition => p != null);

  return {
    margin: {
      accountValue: String(marginAccountValue),
      totalNtlPos: String(margin.totalNtlPos ?? crossMargin.totalNtlPos ?? '0'),
      totalRawUsd: String(margin.totalRawUsd ?? crossMargin.totalRawUsd ?? '0'),
      totalMarginUsed: String(
        Math.max(toNum(margin.totalMarginUsed), toNum(crossMargin.totalMarginUsed))
      ),
    },
    crossMargin: {
      accountValue: String(crossMargin.accountValue ?? '0'),
      totalNtlPos: String(crossMargin.totalNtlPos ?? '0'),
      totalRawUsd: String(crossMargin.totalRawUsd ?? '0'),
      totalMarginUsed: String(crossMargin.totalMarginUsed ?? '0'),
    },
    withdrawable: String(data.withdrawable ?? '0'),
    positions,
  };
}

type FrontendOpenOrderRow = HlOpenOrder & {
  isTrigger?: boolean;
  triggerPx?: string;
  triggerCondition?: string;
  isPositionTpsl?: boolean;
};

export async function fetchHlOpenOrders(user: string): Promise<HlOpenOrder[]> {
  const rows = await hlInfo<FrontendOpenOrderRow[]>({ type: 'frontendOpenOrders', user });
  if (!Array.isArray(rows)) return [];
  return rows.map((o) => ({
    coin: String(o.coin ?? ''),
    side: String(o.side ?? ''),
    limitPx: String(o.limitPx ?? '0'),
    sz: String(o.sz ?? '0'),
    oid: toNum(o.oid),
    timestamp: toNum(o.timestamp),
    orderType: String(o.orderType ?? ''),
    reduceOnly: Boolean(o.reduceOnly),
    isTrigger: Boolean(o.isTrigger),
    triggerPx: String(o.triggerPx ?? '0'),
    triggerCondition: String(o.triggerCondition ?? ''),
    isPositionTpsl: Boolean(o.isPositionTpsl),
  }));
}

export function isHlTriggerOrder(order: HlOpenOrder): boolean {
  if (order.isTrigger) return true;
  const type = order.orderType.toLowerCase();
  return type.includes('stop') || type.includes('take profit') || type.includes('tp');
}

type TwapHistoryRow = {
  time?: number;
  twapId?: number;
  state?: {
    coin?: string;
    side?: string;
    sz?: string;
    executedSz?: string;
    executedNtl?: string;
    minutes?: number;
    randomize?: boolean;
    reduceOnly?: boolean;
    timestamp?: number;
  };
  status?: { status?: string; description?: string };
};

export async function fetchHlTwapHistory(user: string, limit = 50): Promise<HlTwapOrder[]> {
  const rows = await hlInfo<TwapHistoryRow[]>({ type: 'twapHistory', user });
  if (!Array.isArray(rows)) return [];

  return rows.slice(0, limit).map((row, i) => {
    const state = row.state ?? {};
    const rawStatus = row.status?.status ?? 'finished';
    const status =
      rawStatus === 'activated' ||
      rawStatus === 'finished' ||
      rawStatus === 'terminated' ||
      rawStatus === 'error'
        ? rawStatus
        : 'finished';

    return {
      twapId: toNum(row.twapId, i),
      time: toNum(row.time) * 1000 || toNum(state.timestamp),
      coin: String(state.coin ?? ''),
      side: String(state.side ?? ''),
      sz: String(state.sz ?? '0'),
      executedSz: String(state.executedSz ?? '0'),
      executedNtl: String(state.executedNtl ?? '0'),
      minutes: toNum(state.minutes),
      randomize: Boolean(state.randomize),
      reduceOnly: Boolean(state.reduceOnly),
      status,
      statusDetail: row.status?.description,
    };
  });
}

export async function fetchHlUserFills(user: string, limit = 50): Promise<HlUserFill[]> {
  const fills = await hlInfo<HlUserFill[]>({ type: 'userFills', user });
  if (!Array.isArray(fills)) return [];
  return fills.slice(0, limit).map((f) => ({
    coin: String(f.coin ?? ''),
    px: String(f.px ?? '0'),
    sz: String(f.sz ?? '0'),
    side: String(f.side ?? ''),
    time: toNum(f.time),
    closedPnl: String(f.closedPnl ?? '0'),
    fee: String(f.fee ?? '0'),
    dir: f.dir != null ? String(f.dir) : undefined,
    tid: f.tid != null ? toNum(f.tid) : undefined,
  }));
}

export type HlUserAbstraction =
  | 'unifiedAccount'
  | 'portfolioMargin'
  | 'disabled'
  | 'default'
  | 'dexAbstraction';

export async function fetchHlUserAbstraction(user: string): Promise<HlUserAbstraction | null> {
  try {
    const mode = await hlInfo<string>({
      type: 'userAbstraction',
      user: user.toLowerCase(),
    });
    return normalizeHlUserAbstraction(mode);
  } catch {
    return null;
  }
}

export function normalizeHlUserAbstraction(raw: unknown): HlUserAbstraction | null {
  if (raw == null) return null;
  let mode = typeof raw === 'string' ? raw.trim() : String(raw);
  mode = mode.replace(/^"+|"+$/g, '');
  if (
    mode === 'unifiedAccount' ||
    mode === 'portfolioMargin' ||
    mode === 'disabled' ||
    mode === 'default' ||
    mode === 'dexAbstraction'
  ) {
    return mode;
  }
  return null;
}

export async function fetchHlUserFunding(user: string, limit = 50): Promise<HlFundingPayment[]> {
  const rows = await hlInfo<Array<Record<string, unknown>>>({ type: 'userFunding', user });
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, limit).map((r) => ({
    coin: String(r.coin ?? ''),
    usdc: String(r.usdc ?? r.payment ?? '0'),
    time: toNum(r.time),
    fundingRate: String(r.fundingRate ?? '0'),
  }));
}

export async function fetchHlSpotBalances(user: string): Promise<HlSpotBalance[]> {
  const data = await hlInfo<{ balances?: HlSpotBalance[] }>({
    type: 'spotClearinghouseState',
    user: user.toLowerCase(),
  });
  if (!Array.isArray(data.balances)) return [];
  return data.balances
    .map((b) => ({
      coin: String(b.coin ?? ''),
      token: toNum(b.token),
      total: String(b.total ?? '0'),
      hold: String(b.hold ?? '0'),
      entryNtl: String(b.entryNtl ?? '0'),
    }))
    .filter((b) => toNum(b.total) > 0 || toNum(b.hold) > 0);
}

export async function fetchHlHistoricalOrders(user: string, limit = 50): Promise<HlHistoricalOrder[]> {
  const rows = await hlInfo<Array<Record<string, unknown>>>({ type: 'historicalOrders', user });
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, limit).map((r) => {
    const order = (r.order ?? r) as Record<string, unknown>;
    const status = (r.status ?? r) as Record<string, unknown>;
    return {
      coin: String(order.coin ?? ''),
      side: String(order.side ?? ''),
      limitPx: String(order.limitPx ?? '0'),
      sz: String(order.sz ?? '0'),
      oid: toNum(order.oid),
      timestamp: toNum(order.timestamp),
      orderType: String(order.orderType ?? 'Limit'),
      status: String(status.status ?? r.status ?? 'filled'),
      statusTimestamp: toNum(status.timestamp ?? r.statusTimestamp ?? order.timestamp),
    };
  });
}
