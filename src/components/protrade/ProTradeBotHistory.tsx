import React, { useCallback, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useHyperliquidAccount } from '../../hooks/useHyperliquidAccount';
import { useHlBotManagedCoins } from '../../hooks/useHlBotManagedCoins';
import { useHlBotTradeWindows } from '../../hooks/useHlBotTradeWindows';
import { exportBotTradesPdf } from '../../lib/exportBotTradesPdf';
import { fmtClosedPnl, fmtTradingSince, fmtUsdSymbol, isHlFillOpen } from '../../lib/hyperliquid/format';
import { summarizeHlClosedPnlFromFills } from '../../lib/hyperliquid/hlPnl';
import { toNum } from '../../lib/hyperliquid/parse';
import { filterHlPositions } from '../../lib/hyperliquid/splitHlPositions';
import { filterFillsByScope } from '../../lib/hyperliquid/splitHlActivity';
import { displayHandle } from '../../lib/username';
import ProTradeHlBotDock from './ProTradeHlBotDock';

type Props = {
  refreshKey?: number;
  walletAddress?: string | null;
  walletConnected?: boolean;
  /** Rendered inside Profile → Bot trades (no standalone page chrome). */
  embedded?: boolean;
};

const ProTradeBotHistory: React.FC<Props> = ({
  refreshKey = 0,
  walletAddress,
  walletConnected = false,
  embedded = false,
}) => {
  const { user, profile } = useAuth();
  const displayName = displayHandle(profile, user?.email);
  const username = profile?.username?.trim() || null;
  const userId = user?.id ?? null;
  const wallet = walletAddress?.trim() || undefined;
  const { account, fills, fillsLoading } = useHyperliquidAccount(wallet);
  const openCoins = useMemo(
    () =>
      (account?.positions ?? [])
        .filter((p) => Math.abs(toNum(p.szi)) > 1e-12)
        .map((p) => p.coin),
    [account?.positions]
  );
  const { coins: botManagedCoins } = useHlBotManagedCoins(
    wallet,
    refreshKey + fills.length,
    openCoins,
    fills
  );
  const { windows: botWindows, fillTids: botFillTids, markers: botMarkers } = useHlBotTradeWindows(
    wallet,
    refreshKey + fills.length
  );
  const botFills = useMemo(
    () => filterFillsByScope(fills, 'bot', botWindows, botFillTids, botMarkers),
    [fills, botWindows, botFillTids, botMarkers]
  );

  const closeFills = useMemo(
    () => botFills.filter((f) => !isHlFillOpen(f.dir)),
    [botFills]
  );

  const pnlSummary = useMemo(() => summarizeHlClosedPnlFromFills(botFills), [botFills]);

  const botPositions = useMemo(
    () => filterHlPositions(account?.positions, botManagedCoins, 'bot'),
    [account?.positions, botManagedCoins]
  );

  const activeUpnl = useMemo(
    () => botPositions.reduce((sum, p) => sum + toNum(p.unrealizedPnl), 0),
    [botPositions]
  );

  const tradingSinceMs = useMemo(() => {
    if (pnlSummary.firstFillAt != null) return pnlSummary.firstFillAt;
    const created = profile?.created_at;
    if (typeof created === 'string' && created.trim()) {
      const ts = Date.parse(created);
      if (Number.isFinite(ts)) return ts;
    }
    return null;
  }, [pnlSummary.firstFillAt, profile?.created_at]);

  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const handleDownloadPdf = useCallback(async () => {
    if (!wallet || closeFills.length === 0 || exporting) return;
    setExportError(null);
    setExporting(true);
    try {
      await exportBotTradesPdf({
        fills: botFills,
        walletAddress: wallet,
        userId,
        username,
        displayName,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PDF export failed.';
      setExportError(msg);
    } finally {
      setExporting(false);
    }
  }, [wallet, closeFills.length, exporting, botFills, userId, username, displayName]);

  const showPdfExport = embedded && Boolean(wallet) && closeFills.length > 0;
  const accountLine = username ? `@${username}` : displayName;
  const showOverview = Boolean(wallet);

  return (
    <div className={`hl-history-page${embedded ? ' hl-history-page--embedded' : ''}`}>
      <header className="hl-history-head">
        <div className="hl-history-head-row">
          <div className="hl-history-head-main">
            <h1 className="hl-history-title">Bot trade history</h1>
            <p className="hl-history-sub">
              Bot trades only — manual Perps fills are listed under the Perps tab.
            </p>
            {embedded && (accountLine || userId) ? (
              <p className="hl-history-meta">
                {accountLine ? <span>Account: {accountLine}</span> : null}
                {accountLine && userId ? <span className="hl-history-meta-sep">·</span> : null}
                {userId ? <span>User ID: {userId}</span> : null}
              </p>
            ) : null}
          </div>

          {showOverview ? (
            <div className="hl-history-overview" aria-label="Bot trading totals">
              <div className="hl-history-overview-strip">
                <div className="hl-history-overview-stat">
                  <span className="hl-history-overview-k">Gain</span>
                  <span className="hl-history-overview-v hl-up">
                    {fillsLoading && pnlSummary.closedCount === 0
                      ? '…'
                      : fmtUsdSymbol(pnlSummary.totalGain)}
                  </span>
                </div>
                <div className="hl-history-overview-stat">
                  <span className="hl-history-overview-k">Loss</span>
                  <span className="hl-history-overview-v hl-down">
                    {fillsLoading && pnlSummary.closedCount === 0
                      ? '…'
                      : fmtUsdSymbol(Math.abs(pnlSummary.totalLoss))}
                  </span>
                </div>
                <div className="hl-history-overview-stat">
                  <span className="hl-history-overview-k">uPnL</span>
                  <span
                    className={`hl-history-overview-v ${
                      activeUpnl >= 0 ? 'hl-up' : 'hl-down'
                    }`}
                  >
                    {account == null && fillsLoading ? '…' : fmtClosedPnl(activeUpnl)}
                    {botPositions.length > 0 ? (
                      <span className="hl-history-overview-meta">
                        {' · '}
                        {botPositions.length} open
                      </span>
                    ) : null}
                  </span>
                </div>
              </div>
              <p className="hl-history-overview-since">
                {fillsLoading && tradingSinceMs == null
                  ? '…'
                  : fmtTradingSince(tradingSinceMs)}
              </p>
            </div>
          ) : null}

          {showPdfExport ? (
            <div className="hl-history-pdf-wrap">
              <button
                type="button"
                className="hl-history-pdf-btn"
                onClick={() => void handleDownloadPdf()}
                disabled={exporting}
                aria-label="Download bot trade history as PDF"
              >
                <Download size={14} aria-hidden />
                {exporting ? 'Exporting…' : 'Download PDF'}
              </button>
              {exportError ? (
                <p className="hl-history-pdf-error" role="alert">
                  {exportError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </header>
      <div className="hl-history-body hl-bot-dock">
        <ProTradeHlBotDock
          activeTab="tradeHistory"
          refreshKey={refreshKey}
          walletAddress={walletAddress}
          walletConnected={walletConnected}
          historyOnly
        />
      </div>
    </div>
  );
};

export default ProTradeBotHistory;
