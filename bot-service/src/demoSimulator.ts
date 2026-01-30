import { createClient } from '@supabase/supabase-js';
import { config } from './config';
import { logger } from './utils/logger';
import { marketService, TradingStrategy } from './services/market';
import { signalEngine } from './services/market';
import { Timeframe } from './services/signalEngine';

// ============================================================
// DEMO SIMULATOR — Amanda Campbell Account
// Runs alongside the real bot. Uses real market analysis but
// skips all on-chain execution. Records positions directly in
// the database so the frontend can display them.
// ============================================================

const DEMO_EMAIL = 'amanda.campbell22@gmail.com';
const DEMO_WALLET = '0xd3a0000000000000000000000000000000000001';
const DEMO_CHAIN_ID = 42161; // Arbitrum
const DEMO_STARTING_BALANCE = 2500;
const DEMO_STRATEGY: TradingStrategy = 'aggressive';

// Trade sizing
const DEMO_RISK_BPS = 5000; // 50% risk per trade
const DEMO_LEVERAGE = 25;
const DEMO_STOP_LOSS_PERCENT = 5;
const DEMO_TAKE_PROFIT_PERCENT = 10;
const DEMO_TRAILING_STOP_PERCENT = 1;

// Interval between trade attempts (15–30 min randomised)
const MIN_CYCLE_MS = 15 * 60 * 1000;
const MAX_CYCLE_MS = 30 * 60 * 1000;

// Position monitoring interval (every 30 seconds)
const MONITOR_INTERVAL_MS = 30_000;

// Tokens (same as real bot)
const DEMO_TOKENS = [
  { address: '0x82aF49447D8a07e3bd95BD0d56f35241523fBab1', symbol: 'WETH', binanceSymbol: 'ETHUSDT' },
  { address: '0x2f2a2543B76A4166549F7aaB2e75Bef0aefC5B0f', symbol: 'WBTC', binanceSymbol: 'BTCUSDT' },
];

const supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);

// ---- Helpers ----

function demoTxHash(): string {
  const rand = Array.from({ length: 62 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  return `0xdemo${rand}`.slice(0, 66);
}

function randomBetween(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function fetchBinancePrice(symbol: string): Promise<number> {
  try {
    const res = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${symbol}`);
    const data = await res.json();
    return parseFloat(data.price);
  } catch {
    return 0;
  }
}

// ---- Seed Data ----

async function ensureSeedData(): Promise<void> {
  // 1. Vault settings row
  const { data: existing } = await supabase
    .from('vault_settings')
    .select('id')
    .eq('wallet_address', DEMO_WALLET)
    .eq('chain_id', DEMO_CHAIN_ID)
    .single();

  if (!existing) {
    const { error } = await supabase.from('vault_settings').insert({
      wallet_address: DEMO_WALLET,
      chain_id: DEMO_CHAIN_ID,
      auto_trade_enabled: true,
      risk_level_bps: DEMO_RISK_BPS,
      take_profit_percent: DEMO_TAKE_PROFIT_PERCENT,
      stop_loss_percent: DEMO_STOP_LOSS_PERCENT,
      leverage_multiplier: DEMO_LEVERAGE,
      demo_vault_balance: DEMO_STARTING_BALANCE,
    });
    if (error) {
      logger.error('[DEMO] Failed to seed vault_settings', { error });
    } else {
      logger.info('[DEMO] Seeded vault_settings row', { balance: DEMO_STARTING_BALANCE });
    }
  } else {
    // Ensure demo_vault_balance column is populated
    const { data: vs } = await supabase
      .from('vault_settings')
      .select('demo_vault_balance')
      .eq('wallet_address', DEMO_WALLET)
      .eq('chain_id', DEMO_CHAIN_ID)
      .single();

    if (!vs?.demo_vault_balance || vs.demo_vault_balance <= 0) {
      await supabase
        .from('vault_settings')
        .update({ demo_vault_balance: DEMO_STARTING_BALANCE })
        .eq('wallet_address', DEMO_WALLET)
        .eq('chain_id', DEMO_CHAIN_ID);
      logger.info('[DEMO] Reset demo_vault_balance to starting balance');
    }
  }

  // 2. Subscription row (elite, 100-year expiry)
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('wallet_address', DEMO_WALLET)
    .single();

  if (!sub) {
    const expiry = new Date();
    expiry.setFullYear(expiry.getFullYear() + 100);

    const { error } = await supabase.from('subscriptions').insert({
      wallet_address: DEMO_WALLET,
      plan_tier: 'elite',
      status: 'active',
      start_date: new Date().toISOString(),
      end_date: expiry.toISOString(),
      billing_cycle: 'lifetime',
    });
    if (error) {
      logger.error('[DEMO] Failed to seed subscription', { error });
    } else {
      logger.info('[DEMO] Seeded elite subscription (100-year)');
    }
  }
}

// ---- Close Stale Positions ----

async function closeStalePositions(): Promise<void> {
  const { data: stale } = await supabase
    .from('positions')
    .select('id, token_symbol, entry_price, entry_amount, direction, created_at, leverage')
    .eq('wallet_address', DEMO_WALLET)
    .in('status', ['open', 'closing']);

  if (!stale || stale.length === 0) return;

  logger.info(`[DEMO] Closing ${stale.length} stale demo positions on startup`);

  for (const pos of stale) {
    const price = await fetchBinancePrice(
      pos.token_symbol === 'WBTC' ? 'BTCUSDT' : 'ETHUSDT'
    );
    if (price <= 0) continue;

    const leverage = pos.leverage || DEMO_LEVERAGE;
    const priceChange = pos.direction === 'SHORT'
      ? pos.entry_price - price
      : price - pos.entry_price;
    const pnlPercent = (priceChange / pos.entry_price) * leverage * 100;
    const pnl = (pos.entry_amount * pnlPercent) / 100;

    await supabase
      .from('positions')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
        close_reason: 'demo_startup_cleanup',
        exit_price: price,
        exit_amount: pos.entry_amount + pnl,
        profit_loss: pnl,
        profit_loss_percent: pnlPercent,
      })
      .eq('id', pos.id);

    // Update demo balance
    await adjustDemoBalance(pnl);

    logger.info('[DEMO] Closed stale position', {
      id: pos.id.slice(0, 8),
      token: pos.token_symbol,
      pnl: pnl.toFixed(2),
      pnlPercent: pnlPercent.toFixed(2),
    });
  }
}

// ---- Balance Helpers ----

async function getDemoBalance(): Promise<number> {
  const { data } = await supabase
    .from('vault_settings')
    .select('demo_vault_balance')
    .eq('wallet_address', DEMO_WALLET)
    .eq('chain_id', DEMO_CHAIN_ID)
    .single();

  return data?.demo_vault_balance ?? DEMO_STARTING_BALANCE;
}

async function adjustDemoBalance(delta: number): Promise<void> {
  const current = await getDemoBalance();
  const updated = Math.max(0, current + delta);

  await supabase
    .from('vault_settings')
    .update({ demo_vault_balance: updated })
    .eq('wallet_address', DEMO_WALLET)
    .eq('chain_id', DEMO_CHAIN_ID);
}

// ---- Open Demo Position ----

async function tryOpenPosition(): Promise<void> {
  // 1. Check if already has an open position
  const { data: openPos } = await supabase
    .from('positions')
    .select('id')
    .eq('wallet_address', DEMO_WALLET)
    .eq('status', 'open')
    .limit(1);

  if (openPos && openPos.length > 0) {
    logger.debug('[DEMO] Already has open position, skipping');
    return;
  }

  // 2. Get balance
  const balance = await getDemoBalance();
  if (balance < 5) {
    logger.info('[DEMO] Balance too low to trade', { balance });
    return;
  }

  // 3. Analyze all tokens and pick the best signal
  let bestSignal: {
    direction: 'LONG' | 'SHORT';
    confidence: number;
    reason: string;
    token: typeof DEMO_TOKENS[0];
  } | null = null;

  for (const token of DEMO_TOKENS) {
    try {
      const signal = await marketService.getSignal(
        DEMO_CHAIN_ID,
        token.address as `0x${string}`,
        BigInt(Math.floor(balance * 1e6)),
        DEMO_RISK_BPS,
        DEMO_STRATEGY
      );

      if (signal && (!bestSignal || signal.confidence > bestSignal.confidence)) {
        bestSignal = {
          direction: signal.direction as 'LONG' | 'SHORT',
          confidence: signal.confidence,
          reason: signal.reason,
          token,
        };
      }
    } catch (err) {
      logger.debug('[DEMO] Signal error for token', { token: token.symbol, error: err });
    }
  }

  if (!bestSignal) {
    logger.debug('[DEMO] No valid signal, skipping cycle');
    return;
  }

  // 4. Calculate position size
  const riskPercent = DEMO_RISK_BPS / 100; // 50%
  const positionSize = Math.floor(balance * (riskPercent / 100) * 2) / 2; // Round to 0.50
  if (positionSize < 1) return;

  // 5. Get current price
  const price = await fetchBinancePrice(bestSignal.token.binanceSymbol);
  if (price <= 0) return;

  const tokenAmount = positionSize / price;

  // 6. Insert position
  const txHash = demoTxHash();
  const takeProfitPrice = bestSignal.direction === 'LONG'
    ? price * (1 + DEMO_TAKE_PROFIT_PERCENT / 100)
    : price * (1 - DEMO_TAKE_PROFIT_PERCENT / 100);

  const { error } = await supabase.from('positions').insert({
    wallet_address: DEMO_WALLET,
    chain_id: DEMO_CHAIN_ID,
    token_address: bestSignal.token.address,
    token_symbol: bestSignal.token.symbol,
    direction: bestSignal.direction,
    entry_price: price,
    entry_amount: positionSize,
    token_amount: tokenAmount,
    entry_tx_hash: txHash,
    highest_price: price,
    lowest_price: price,
    trailing_stop_price: null,
    trailing_stop_percent: DEMO_TRAILING_STOP_PERCENT,
    trailing_increment: 0.15,
    take_profit_price: takeProfitPrice,
    take_profit_percent: DEMO_TAKE_PROFIT_PERCENT,
    profit_lock_percent: 0.4,
    stop_activated: false,
    status: 'open',
    is_leveraged: true,
    leverage_multiplier: DEMO_LEVERAGE,
    leverage: DEMO_LEVERAGE,
    collateral_amount: positionSize,
    borrowed_amount: 0,
    aave_health_factor: null,
  });

  if (error) {
    logger.error('[DEMO] Failed to insert position', { error });
    return;
  }

  // Deduct collateral from demo balance
  await adjustDemoBalance(-positionSize);

  logger.info(`[DEMO] Opened ${bestSignal.direction} position`, {
    token: bestSignal.token.symbol,
    price: price.toFixed(2),
    size: positionSize.toFixed(2),
    leverage: DEMO_LEVERAGE + 'x',
    confidence: bestSignal.confidence,
    reason: bestSignal.reason,
    txHash: txHash.slice(0, 14),
  });
}

// ---- Monitor Demo Positions (SL/TP/Trailing) ----

async function monitorPositions(): Promise<void> {
  const { data: positions } = await supabase
    .from('positions')
    .select('*')
    .eq('wallet_address', DEMO_WALLET)
    .eq('status', 'open');

  if (!positions || positions.length === 0) return;

  for (const pos of positions) {
    const binanceSymbol = pos.token_symbol === 'WBTC' ? 'BTCUSDT' : 'ETHUSDT';
    const price = await fetchBinancePrice(binanceSymbol);
    if (price <= 0) continue;

    const leverage = pos.leverage || pos.leverage_multiplier || DEMO_LEVERAGE;
    const priceChange = pos.direction === 'SHORT'
      ? pos.entry_price - price
      : price - pos.entry_price;
    const pnlPercent = (priceChange / pos.entry_price) * leverage * 100;
    const pnl = (pos.entry_amount * pnlPercent) / 100;

    // Update high/low watermarks
    const updates: Record<string, any> = {};
    if (price > (pos.highest_price || 0)) updates.highest_price = price;
    if (price < (pos.lowest_price || Infinity)) updates.lowest_price = price;

    // ---- CHECK TAKE PROFIT ----
    if (pnlPercent >= (pos.take_profit_percent || DEMO_TAKE_PROFIT_PERCENT)) {
      await closePosition(pos, price, pnl, pnlPercent, 'takeprofit');
      continue;
    }

    // ---- CHECK STOP LOSS ----
    if (pnlPercent <= -(pos.stop_loss_percent || DEMO_STOP_LOSS_PERCENT)) {
      await closePosition(pos, price, pnl, pnlPercent, 'stoploss');
      continue;
    }

    // ---- TRAILING STOP LOGIC ----
    const profitLockThreshold = pos.profit_lock_percent || 0.4;

    if (!pos.stop_activated && pnlPercent >= profitLockThreshold) {
      // Activate trailing stop at breakeven
      updates.stop_activated = true;
      updates.trailing_stop_price = pos.entry_price;
      updates.profit_locked = true;
      updates.profit_lock_price = price;
      logger.info('[DEMO] Trailing stop activated', {
        id: pos.id.slice(0, 8),
        token: pos.token_symbol,
        pnlPercent: pnlPercent.toFixed(2),
      });
    }

    if (pos.stop_activated || updates.stop_activated) {
      // Update trailing stop based on current price
      const trailPercent = pos.trailing_stop_percent || DEMO_TRAILING_STOP_PERCENT;
      let newTrailStop: number;

      if (pos.direction === 'LONG') {
        newTrailStop = price * (1 - trailPercent / (leverage * 100));
        const currentStop = updates.trailing_stop_price || pos.trailing_stop_price || pos.entry_price;
        if (newTrailStop > currentStop) {
          updates.trailing_stop_price = newTrailStop;
        }
        // Check if price hit trailing stop
        const activeStop = updates.trailing_stop_price || pos.trailing_stop_price;
        if (activeStop && price <= activeStop) {
          await closePosition(pos, price, pnl, pnlPercent, 'trailing_stop');
          continue;
        }
      } else {
        newTrailStop = price * (1 + trailPercent / (leverage * 100));
        const currentStop = updates.trailing_stop_price || pos.trailing_stop_price || pos.entry_price;
        if (newTrailStop < currentStop || !currentStop) {
          updates.trailing_stop_price = newTrailStop;
        }
        const activeStop = updates.trailing_stop_price || pos.trailing_stop_price;
        if (activeStop && price >= activeStop) {
          await closePosition(pos, price, pnl, pnlPercent, 'trailing_stop');
          continue;
        }
      }
    }

    // Apply watermark / trailing updates
    if (Object.keys(updates).length > 0) {
      await supabase
        .from('positions')
        .update(updates)
        .eq('id', pos.id);
    }
  }
}

async function closePosition(
  pos: any,
  exitPrice: number,
  pnl: number,
  pnlPercent: number,
  reason: string
): Promise<void> {
  const exitAmount = pos.entry_amount + pnl;
  const closedAt = new Date().toISOString();

  await supabase
    .from('positions')
    .update({
      status: 'closed',
      closed_at: closedAt,
      close_reason: reason,
      exit_price: exitPrice,
      exit_amount: exitAmount,
      profit_loss: pnl,
      profit_loss_percent: pnlPercent,
      close_tx_hash: demoTxHash(),
    })
    .eq('id', pos.id);

  // Return collateral + P/L to demo balance
  await adjustDemoBalance(pos.entry_amount + pnl);

  // Save to trade_history
  try {
    await supabase.from('trade_history').insert({
      position_id: pos.id,
      wallet_address: DEMO_WALLET,
      chain_id: DEMO_CHAIN_ID,
      token_symbol: pos.token_symbol,
      direction: pos.direction,
      entry_price: pos.entry_price,
      exit_price: exitPrice,
      entry_amount: pos.entry_amount,
      exit_amount: exitAmount,
      profit_loss: pnl,
      profit_loss_percent: pnlPercent,
      leverage: pos.leverage || DEMO_LEVERAGE,
      close_reason: reason,
      opened_at: pos.created_at,
      closed_at: closedAt,
      entry_tx_hash: pos.entry_tx_hash,
      exit_tx_hash: demoTxHash(),
    });
  } catch {
    // trade_history table may not exist
  }

  logger.info(`[DEMO] Closed position — ${reason}`, {
    id: pos.id.slice(0, 8),
    token: pos.token_symbol,
    direction: pos.direction,
    pnl: pnl.toFixed(2),
    pnlPercent: pnlPercent.toFixed(2) + '%',
    exitPrice: exitPrice.toFixed(2),
  });
}

// ---- Main Loop ----

export async function startDemoSimulator(): Promise<void> {
  logger.info('[DEMO] ========================================');
  logger.info('[DEMO] Demo Simulator starting');
  logger.info(`[DEMO] Wallet: ${DEMO_WALLET}`);
  logger.info(`[DEMO] Starting balance: $${DEMO_STARTING_BALANCE}`);
  logger.info('[DEMO] ========================================');

  // Seed data
  await ensureSeedData();

  // Close stale positions from prior runs
  await closeStalePositions();

  const balance = await getDemoBalance();
  logger.info(`[DEMO] Current balance: $${balance.toFixed(2)}`);

  // Run first trade attempt immediately
  try {
    await tryOpenPosition();
  } catch (err) {
    logger.error('[DEMO] Error in initial trade attempt', { error: err });
  }

  // Schedule trade attempts every 15–30 min
  const scheduleTradeCycle = () => {
    const delay = randomBetween(MIN_CYCLE_MS, MAX_CYCLE_MS);
    const delayMin = (delay / 60000).toFixed(1);
    logger.info(`[DEMO] Next trade check in ${delayMin} minutes`);

    setTimeout(async () => {
      try {
        await tryOpenPosition();
      } catch (err) {
        logger.error('[DEMO] Error in trade cycle', { error: err });
      }
      scheduleTradeCycle();
    }, delay);
  };
  scheduleTradeCycle();

  // Monitor positions every 30 seconds
  setInterval(async () => {
    try {
      await monitorPositions();
    } catch (err) {
      logger.error('[DEMO] Error in position monitor', { error: err });
    }
  }, MONITOR_INTERVAL_MS);

  logger.info('[DEMO] Simulator running — trades every 15-30 min, monitor every 30s');
}
