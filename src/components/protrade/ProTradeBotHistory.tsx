import React, { useCallback, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useHyperliquidAccount } from '../../hooks/useHyperliquidAccount';
import { exportBotTradesPdf } from '../../lib/exportBotTradesPdf';
import { isHlFillOpen } from '../../lib/hyperliquid/format';
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
  const { fills } = useHyperliquidAccount(wallet);
  const closeFills = useMemo(
    () => fills.filter((f) => !isHlFillOpen(f.dir)),
    [fills]
  );
  const [exporting, setExporting] = useState(false);

  const handleDownloadPdf = useCallback(() => {
    if (!wallet || closeFills.length === 0 || exporting) return;
    setExporting(true);
    void exportBotTradesPdf({
      fills,
      walletAddress: wallet,
      userId,
      username,
      displayName,
    }).finally(() => setExporting(false));
  }, [wallet, closeFills.length, exporting, fills, userId, username, displayName]);

  const showPdfExport = embedded && Boolean(wallet) && closeFills.length > 0;
  const accountLine = username ? `@${username}` : displayName;

  return (
    <div className={`hl-history-page${embedded ? ' hl-history-page--embedded' : ''}`}>
      <header className="hl-history-head">
        <div className="hl-history-head-row">
          <div>
            <h1 className="hl-history-title">Bot trade history</h1>
            <p className="hl-history-sub">
              Hyperliquid perps — fills and closed P/L from your HL account.
            </p>
            {embedded && (accountLine || userId) ? (
              <p className="hl-history-meta">
                {accountLine ? <span>Account: {accountLine}</span> : null}
                {accountLine && userId ? <span className="hl-history-meta-sep">·</span> : null}
                {userId ? <span>User ID: {userId}</span> : null}
              </p>
            ) : null}
          </div>
          {showPdfExport ? (
            <button
              type="button"
              className="hl-history-pdf-btn"
              onClick={handleDownloadPdf}
              disabled={exporting}
              aria-label="Download bot trade history as PDF"
            >
              <Download size={14} aria-hidden />
              {exporting ? 'Exporting…' : 'Download PDF'}
            </button>
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
