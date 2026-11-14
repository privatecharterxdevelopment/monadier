import React, { useMemo } from 'react';
import { Loader2 } from 'lucide-react';
import { useTerminalBotAnalysis } from '../../hooks/useTerminalBotAnalysis';
import { useTerminalBotSettings } from '../../hooks/useTerminalBotSettings';
import { useHlBotSetup } from '../../hooks/useHlBotSetup';
import { usePlatformFeeGate } from '../../contexts/PlatformFeeContext';
import { HL_DEFAULT_CONCURRENT_POSITIONS } from '../../lib/hlBotConstants';
import { isActionableBotScanDetail } from '../../lib/hlBotReasonLabels';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';
import type { Dashboard2Metrics } from '../../hooks/useDashboard2Metrics';

type Props = {
  walletConnected: boolean;
  metrics: Dashboard2Metrics;
  vaultWallet?: string | null;
  symbol?: string;
  openPositionCoins?: string[];
  botRunning?: boolean;
};

/** Text-only insights under “Bot is reading market…” (pills stay under chart). */
const ProTradeBotScanInsights: React.FC<Props> = ({
  walletConnected,
  metrics,
  vaultWallet,
  symbol = 'BTCUSDT',
  openPositionCoins = [],
  botRunning: botRunningProp = true,
}) => {
  const platformFees = usePlatformFeeGate();
  const hlSetup = useHlBotSetup(vaultWallet ?? undefined);
  const { settings: botSettings } = useTerminalBotSettings();
  const hasWallet = walletConnected || Boolean(vaultWallet);
  // Parent only mounts this while the agent is on. Do not re-resolve
  // auto_trade here — a loading settings snapshot would flash "Bot off".
  const botRunning = botRunningProp;
  const feeGateActive = platformFees.botTradingBlocked;

  const hlBalanceUsd =
    hlSetup.accountUsd > 0 || !hlSetup.loading ? hlSetup.accountUsd : metrics.hlBalanceUsd;

  const botOpenCount = openPositionCoins.length;
  const slotOpenCount =
    botOpenCount > 0 ? botOpenCount : metrics.openPositionsCount;
  const maxSlots =
    botSettings.maxConcurrentPositions >= 3
      ? 3
      : botSettings.maxConcurrentPositions >= 2
        ? 2
        : HL_DEFAULT_CONCURRENT_POSITIONS;

  const analysis = useTerminalBotAnalysis({
    walletConnected: hasWallet,
    metrics,
    openPositionsCount: slotOpenCount,
    maxConcurrentPositions: maxSlots,
    vaultUsd: Math.max(hlBalanceUsd, hlSetup.perpUsd, hlSetup.spotUsdcUsd),
    vaultWallet,
    openPositionCoins,
    symbol,
    analysisActive: hasWallet && botRunning && !feeGateActive,
    botRunning,
    hlBotStrategy: botSettings.hlBotStrategy,
  });

  const primaryLine = useMemo(() => {
    if (!botRunning && !metrics.autoTradeEnabled) {
      return 'Agent stopped — Start bot to scan again.';
    }

    const detail = analysis.readiness?.detail?.trim();
    if (detail && isActionableBotScanDetail(detail)) return detail;

    return '';
  }, [botRunning, metrics.autoTradeEnabled, analysis.readiness?.detail]);

  if (!botRunning && !metrics.autoTradeEnabled) {
    return (
      <>
        <div className="hl-dock-bot-scan-row">
          <span className="hl-dock-bot-scan-title">Bot off</span>
        </div>
        <div className="hl-dock-bot-scan-insights" role="status">
          <p className="hl-dock-bot-scan-detail">{primaryLine}</p>
        </div>
      </>
    );
  }

  if (feeGateActive) {
    return (
      <div className="hl-dock-bot-scan-insights" role="status">
        <p className="hl-dock-bot-scan-detail">
          Pay fees now and reactivate the bot — {fmtUsdSymbol(platformFees.accruedUsd)} owed (
          {platformFees.successWinCount}/{platformFees.winsBeforeBlock} wins).
        </p>
        <button
          type="button"
          className="hl-dock-fee-pay"
          onClick={platformFees.openPayModal}
        >
          Pay Fees · {fmtUsdSymbol(platformFees.accruedUsd)}
        </button>
      </div>
    );
  }

  const showSpinner = analysis.analyzerActive && !analysis.slotsFull && !analysis.marginBlocked;
  const scanTitle = analysis.slotsFull
    ? analysis.readiness.headline
    : analysis.marginBlocked
      ? analysis.readiness.headline || 'Insufficient margin'
      : analysis.readiness.headline || 'Bot is reading market…';

  return (
    <>
      <div className="hl-dock-bot-scan-row">
        {showSpinner ? (
          <Loader2 size={14} className="hl-dock-bot-scan-loader animate-spin" aria-hidden />
        ) : null}
        <span className="hl-dock-bot-scan-title">{scanTitle}</span>
      </div>
      <div className="hl-dock-bot-scan-insights" aria-live="polite">
        {primaryLine ? (
          <p className="hl-dock-bot-scan-detail">{primaryLine}</p>
        ) : null}
      </div>
    </>
  );
};

export default ProTradeBotScanInsights;
