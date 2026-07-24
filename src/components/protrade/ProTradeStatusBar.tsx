import React, { useMemo } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useMonadierWallet } from '../../hooks/useMonadierWallet';
import { useBotRuntimeTimer } from '../../hooks/useBotRuntimeTimer';
import { useHlBotSetup } from '../../hooks/useHlBotSetup';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { isHlBotEnabled } from '../../lib/hlBotGates';
import type { ProTradePanelMode } from './ProTradeTopNav';
import type { HlOpenOrder, HlPosition } from '../../lib/hyperliquid/user';
import { fmtTradeUsdSymbol, fmtUsdSymbol } from '../../lib/hyperliquid/format';
import { toNum } from '../../lib/hyperliquid/parse';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';
import { BRAND_NAME } from '../../lib/brand';

function fmtUsd(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtUpnl(n: number) {
  return `${n >= 0 ? '+' : ''}${fmtTradeUsdSymbol(n)}`;
}

type Props = {
  mode?: ProTradePanelMode;
  walletConnected: boolean;
  wsLive: boolean;
  openOrders: HlOpenOrder[];
  positions: HlPosition[];
  totalUpnl?: number;
  botMetrics?: Dashboard2Metrics;
  botWallet?: string;
};

const ProTradeStatusBar: React.FC<Props> = ({
  mode = 'hl',
  walletConnected,
  wsLive,
  openOrders,
  positions,
  totalUpnl = 0,
  botMetrics,
  botWallet,
}) => {
  const { isAuthenticated } = useAuth();
  const { address: monadierAddress, isConnected } = useMonadierWallet();
  // Never fall back to raw wagmi — that leaked balances while logged out.
  const walletAddress =
    isAuthenticated && (botWallet ?? monadierAddress)
      ? (botWallet ?? monadierAddress)
      : undefined;
  const liveConnected = isAuthenticated && walletConnected && isConnected;
  const hlSetup = useHlBotSetup(mode === 'bot' ? walletAddress : undefined);
  const botSettings = useTerminalBotSettings();
  const timerWallet = walletAddress;
  const autoTradeOn =
    botMetrics != null
      ? botMetrics.autoTradeEnabled
      : botSettings.settings.autoTradeEnabled;
  const botEnabled = isHlBotEnabled(autoTradeOn);
  const botRunning = mode === 'bot' ? botEnabled : Boolean(botMetrics?.autoTradeEnabled);
  const botRuntime = useBotRuntimeTimer(
    timerWallet,
    botEnabled && mode === 'bot'
  );
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
    const running = liveConnected && botRunning;
    const showMoney = liveConnected;
    const totalPnl = showMoney ? botMetrics.totalPnlUsd : 0;
    const pnlUp = totalPnl >= 0;
    const openCount = showMoney
      ? positions.length > 0
        ? positions.length
        : botMetrics.openPositionsCount
      : 0;
    const botUpnl = showMoney
      ? positions.length > 0
        ? upnl
        : botMetrics.unrealizedPnlUsd
      : 0;
    const hlBal = showMoney ? botMetrics.hlBalanceUsd : 0;
    const hlWd = showMoney ? botMetrics.hlWithdrawableUsd : 0;
    return (
      <footer className="hl-status">
        <div className="hl-status-left">
          <span className="hl-status-mode hl-status-mode--bot">{BRAND_NAME} bot</span>
          <span className={running ? 'hl-up' : undefined}>
            {running ? (
              <>
                Auto-trading on
                {botRuntime.formatted ? (
                  <span className="hl-bot-runtime"> · {botRuntime.formatted}</span>
                ) : null}
              </>
            ) : (
              'Auto-trading off'
            )}
          </span>
          <span>HL {fmtUsd(hlBal)}</span>
          <span>Withdraw {fmtUsd(hlWd)}</span>
          <span>Open {openCount}</span>
          <span className={botUpnl >= 0 ? 'hl-up' : 'hl-down'}>
            uPnL {fmtUpnl(botUpnl)}
          </span>
          <span className={pnlUp ? 'hl-up' : 'hl-down'}>
            Total P/L {fmtUpnl(totalPnl)}
          </span>
        </div>
        <div className="hl-status-right">
          {liveConnected ? (
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
        <span>Open {fmtUsdSymbol(liveConnected ? positionStats.openNotional : 0)}</span>
        <span>Longs {fmtUsdSymbol(liveConnected ? positionStats.longs : 0)}</span>
        <span>Shorts {fmtUsdSymbol(liveConnected ? positionStats.shorts : 0)}</span>
        <span className={positionStats.delta >= 0 ? 'hl-up' : 'hl-down'}>
          Delta {liveConnected ? `${positionStats.delta >= 0 ? '+' : ''}${fmtUsdSymbol(positionStats.delta)}` : fmtUsdSymbol(0)}
        </span>
        <span className={up ? 'hl-up' : 'hl-down'}>
          uPnL {liveConnected ? `${up ? '+' : ''}${fmtTradeUsdSymbol(upnl)}` : fmtTradeUsdSymbol(0)}
        </span>
      </div>
      <div className="hl-status-mid">
        <span>
          Orders: {liveConnected ? orderSummary.count : 0}
          {liveConnected && orderSummary.total > 0 ? ` (${fmtUsdSymbol(orderSummary.total)})` : ''}
        </span>
        <span>
          Buys/Sells:{' '}
          {liveConnected
            ? `${orderSummary.buyCount} (${fmtUsdSymbol(orderSummary.buyUsd)}) / ${orderSummary.sellCount} (${fmtUsdSymbol(orderSummary.sellUsd)})`
            : '0 / 0'}
        </span>
      </div>
      <div className="hl-status-right">
        {liveConnected && wsLive ? (
          <span className="hl-status-connected">
            <span className="hl-status-dot" aria-hidden />
            Live
          </span>
        ) : wsLive ? (
          <span className="hl-status-connected">
            <span className="hl-status-dot" aria-hidden />
            Market live
          </span>
        ) : liveConnected ? (
          <span>Connected</span>
        ) : (
          <span>Disconnected</span>
        )}
      </div>
    </footer>
  );
};

export default ProTradeStatusBar;
