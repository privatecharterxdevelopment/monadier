import React, { useEffect, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, ExternalLink, Loader2 } from 'lucide-react';
import { fetchVaultActivityForWallet, type VaultActivityEntry } from '../../lib/vaultActivity';

type Props = {
  wallet?: string;
  refreshKey?: number;
  /** Card in trade panel vs table section in positions dock */
  variant?: 'card' | 'dock';
  skin?: 'terminal' | 'hl';
};

function fmtUsd(n: number) {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtWhen(d: Date) {
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtDateParts(d: Date) {
  return {
    date: d.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }),
    time: d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
  };
}

const TerminalVaultActivity: React.FC<Props> = ({
  wallet,
  refreshKey = 0,
  variant = 'card',
  skin = 'terminal',
}) => {
  const [entries, setEntries] = useState<VaultActivityEntry[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!wallet) {
      setEntries([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void fetchVaultActivityForWallet(wallet).then((rows) => {
      if (!cancelled) {
        setEntries(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [wallet, refreshKey]);

  if (!wallet) return null;

  const emptyMessage = 'No deposits or withdrawals found for this wallet yet.';
  const isHl = skin === 'hl';
  const emptyClass = isHl ? 'hl-dock-empty' : 'term-empty';
  const tableClass = isHl ? 'hl-table' : 'term-table';

  if (variant === 'dock') {
    return (
      <div className="term-vault-activity-dock">
        <h3 className={isHl ? 'hl-dock-section-title' : 'term-vault-activity-dock-title'}>
          Vault activity
        </h3>
        {loading ? (
          <div className={`term-loading-block term-loading-block--sm ${emptyClass}`}>
            <Loader2 size={16} className="animate-spin" />
            <span>Loading on-chain history…</span>
          </div>
        ) : entries.length === 0 ? (
          <p className={emptyClass}>{emptyMessage}</p>
        ) : (
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Type</th>
                <th>Amount</th>
                <th>Date</th>
                <th>Time</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {entries.map((row) => {
                const { date, time } = fmtDateParts(row.timestamp);
                return (
                  <tr key={row.id}>
                    <td>
                      <span className="term-vault-activity-dock-type">
                        {row.type === 'deposit' ? (
                          <ArrowDownLeft size={14} className="term-pnl-pos" aria-hidden />
                        ) : (
                          <ArrowUpRight size={14} className="term-pnl-neg" aria-hidden />
                        )}
                        {row.type === 'deposit' ? 'Deposit' : 'Withdraw'}
                      </span>
                    </td>
                    <td>
                      <strong>{fmtUsd(row.amountUsd)}</strong>
                    </td>
                    <td className="term-history-date">{date}</td>
                    <td className="term-history-time">{time}</td>
                    <td>
                      <a
                        href={row.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="term-history-verify"
                      >
                        Arbiscan
                        <ExternalLink size={12} />
                      </a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  return (
    <div className="term-panel-card term-panel-card--muted">
      <span className="term-panel-card-label">Vault activity</span>
      {loading ? (
        <div className="term-loading-block term-loading-block--sm">
          <Loader2 size={16} className="animate-spin" />
          <span>Loading on-chain history…</span>
        </div>
      ) : entries.length === 0 ? (
        <p className="term-hint">{emptyMessage}</p>
      ) : (
        <ul className="term-vault-activity-list">
          {entries.map((row) => (
            <li key={row.id} className="term-vault-activity-item">
              <div className="term-vault-activity-main">
                {row.type === 'deposit' ? (
                  <ArrowDownLeft size={14} className="term-pnl-pos" aria-hidden />
                ) : (
                  <ArrowUpRight size={14} className="term-pnl-neg" aria-hidden />
                )}
                <span className="term-vault-activity-type">
                  {row.type === 'deposit' ? 'Deposited' : 'Withdrawn'}{' '}
                  <strong>{fmtUsd(row.amountUsd)}</strong>
                </span>
              </div>
              <span className="term-vault-activity-time">{fmtWhen(row.timestamp)}</span>
              <a
                href={row.explorerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="term-link-btn term-vault-activity-tx"
              >
                Blockchain log
                <ExternalLink size={12} />
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default TerminalVaultActivity;
