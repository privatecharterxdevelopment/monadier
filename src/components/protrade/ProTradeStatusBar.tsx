import React, { useMemo } from 'react';
import { useAccount } from 'wagmi';
import { useWeb3 } from '../../contexts/Web3Context';
import { useBotRuntimeTimer } from '../../hooks/useBotRuntimeTimer';
import { useHlBotSetup } from '../../hooks/useHlBotSetup';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { isHlBotEnabled } from '../../lib/hlBotGates';
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
  const { address: web3Address } = useWeb3();
  const { address: wagmiAddress } = useAccount();
  const walletAddress = botWallet ?? wagmiAddress ?? web3Address ?? undefined;
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
    const running = botRunning;
    const totalPnl = botMetrics.totalPnlUsd;
    const pnlUp = totalPnl >= 0;
    const showDash = !botMetrics.hasHlSnapshot;
    return (
      <footer className="hl-status">
        <div className="hl-status-left">
          <span className="hl-status-mode hl-status-mode--bot">HL Bot · Hyperliquid</span>
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
          <span>HL {showDash ? '—' : fmtUsd(botMetrics.hlBalanceUsd)}</span>
          <span>Withdraw {showDash ? '—' : fmtUsd(botMetrics.hlWithdrawableUsd)}</span>
          <span>Open {showDash ? '—' : botMetrics.openPositionsCount}</span>
          <span className={botMetrics.unrealizedPnlUsd >= 0 ? 'hl-up' : 'hl-down'}>
            uPnL{' '}
            {showDash
              ? '—'
              : `${botMetrics.unrealizedPnlUsd >= 0 ? '+' : ''}${fmtUsd(botMetrics.unrealizedPnlUsd)}`}
          </span>
          <span className={pnlUp ? 'hl-up' : 'hl-down'}>
            Total P/L{' '}
            {showDash ? '—' : `${pnlUp ? '+' : ''}${fmtUsd(totalPnl)}`}
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
