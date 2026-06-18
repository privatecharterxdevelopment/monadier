import React, { useMemo } from 'react';
import type { ProTradePanelMode } from './ProTradeTopNav';
import type { HlOpenOrder, HlPosition } from '../../lib/hyperliquid/user';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { toNum } from '../../lib/hyperliquid/parse';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';

function fmtUsd(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Props = {
  mode?: ProTradePanelMode;
  walletConnected: boolean;
  wsLive: boolean;
  openOrders: HlOpenOrder[];
  positions: HlPosition[];
  totalUpnl?: number;
  botMetrics?: Dashboard2Metrics;
};

const ProTradeStatusBar: React.FC<Props> = ({
  mode = 'hl',
  walletConnected,
  wsLive,
  openOrders,
  positions,
  totalUpnl = 0,
  botMetrics,
}) => {
  const orderSummary = useMemo(() => {
    let buyCount = 0;
    let buyUsd = 0;
    let sellCount = 0;
    let sellUsd = 0;
    for (const o of openOrders) {
      const notional = toNum(o.limitPx) * Math.abs(toNum(o.sz));
      if (o.side === 'B') {
        buyCount += 1;
        buyUsd += notional;
      } else {
        sellCount += 1;
        sellUsd += notional;
      }
    }
    const total = buyUsd + sellUsd;
    return { count: openOrders.length, total, buyCount, buyUsd, sellCount, sellUsd };
  }, [openOrders]);

  const positionStats = useMemo(() => {
    let openNotional = 0;
    let longs = 0;
    let shorts = 0;
    for (const p of positions) {
      const val = Math.abs(toNum(p.positionValue));
      openNotional += val;
      if (toNum(p.szi) >= 0) longs += val;
      else shorts += val;
    }
    return { openNotional, longs, shorts, delta: longs - shorts };
  }, [positions]);

  const upnl = totalUpnl;
  const up = upnl >= 0;

  if (mode === 'bot' && botMetrics) {
    const running = botMetrics.autoTradeEnabled;
    const totalPnl = botMetrics.totalPnlUsd;
    const pnlUp = totalPnl >= 0;
    return (
      <footer className="hl-status">
        <div className="hl-status-left">
          <span className="hl-status-mode hl-status-mode--bot">HL Bot · Hyperliquid</span>
          <span className={running ? 'hl-up' : undefined}>
            {running ? 'Auto-trading on' : 'Auto-trading off'}
          </span>
          <span>Einsatz {botMetrics.isLoading ? '—' : fmtUsd(botMetrics.vaultUsd)}</span>
          <span>Withdraw {botMetrics.isLoading ? '—' : fmtUsd(botMetrics.hlWithdrawableUsd)}</span>
          <span>Open {botMetrics.openPositionsCount}</span>
          <span className={pnlUp ? 'hl-up' : 'hl-down'}>
            P/L {botMetrics.isLoading ? '—' : `${pnlUp ? '+' : ''}${fmtUsd(totalPnl)}`}
          </span>
        </div>
        <div className="hl-status-right">
          {walletConnected ? (
            <span className="hl-status-connected">
              <span className="hl-status-dot" aria-hidden />
              Wallet connected
            </span>
          ) : (
            <span>Disconnected</span>
          )}
        </div>
      </footer>
    );
  }

  return (
    <footer className="hl-status">
      <div className="hl-status-left">
        <span className="hl-status-mode">Hyperliquid · Manual trade</span>
        <span>Open {fmtUsdSymbol(positionStats.openNotional)}</span>
        <span>Longs {fmtUsdSymbol(positionStats.longs)}</span>
        <span>Shorts {fmtUsdSymbol(positionStats.shorts)}</span>
        <span className={positionStats.delta >= 0 ? 'hl-up' : 'hl-down'}>
          Delta {positionStats.delta >= 0 ? '+' : ''}{fmtUsdSymbol(positionStats.delta)}
        </span>
        <span className={up ? 'hl-up' : 'hl-down'}>
          uPnL {up ? '+' : ''}{fmtUsdSymbol(upnl)}
        </span>
      </div>
      <div className="hl-status-mid">
        <span>
          Orders: {orderSummary.count}
          {orderSummary.total > 0 ? ` (${fmtUsdSymbol(orderSummary.total)})` : ''}
        </span>
        <span>
          Buys/Sells: {orderSummary.buyCount} ({fmtUsdSymbol(orderSummary.buyUsd)}) /{' '}
          {orderSummary.sellCount} ({fmtUsdSymbol(orderSummary.sellUsd)})
        </span>
      </div>
      <div className="hl-status-right">
        {walletConnected && wsLive ? (
          <span className="hl-status-connected">
            <span className="hl-status-dot" aria-hidden />
            Live
          </span>
        ) : walletConnected ? (
          <span>Connected</span>
        ) : (
          <span>Disconnected</span>
        )}
      </div>
    </footer>
  );
};

export default ProTradeStatusBar;
