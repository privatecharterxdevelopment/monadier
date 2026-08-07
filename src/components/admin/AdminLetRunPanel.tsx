import React, { useCallback, useEffect, useState } from 'react';
import { Loader2, PauseCircle, PlayCircle, RefreshCw } from 'lucide-react';
import {
  fetchAdminLetRunStatus,
  setAdminLetRunAll,
  setAdminPositionLetRun,
  type AgentExpiryRow,
  type LetRunPositionRow,
} from '../../lib/adminLetRun';

function shortWallet(w: string): string {
  if (!w || w.length < 12) return w;
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

const AdminLetRunPanel: React.FC = () => {
  const [letRunAll, setLetRunAll] = useState(false);
  const [positions, setPositions] = useState<LetRunPositionRow[]>([]);
  const [agentExpiry, setAgentExpiry] = useState<AgentExpiryRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    const res = await fetchAdminLetRunStatus();
    setBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? 'Failed to load let-run status');
      return;
    }
    setLetRunAll(Boolean(res.data.letRunAll));
    setPositions(res.data.positions ?? []);
    setAgentExpiry(res.data.agentExpiry ?? []);
    setUpdatedAt(res.data.timestamp ?? new Date().toISOString());
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(id);
  }, [refresh]);

  const onToggleAll = async (next: boolean) => {
    setBusy(true);
    setError(null);
    const res = await setAdminLetRunAll(next);
    if (!res.ok) {
      setBusy(false);
      setError(res.error ?? 'Failed to set letRunAll');
      return;
    }
    setLetRunAll(next);
    await refresh();
  };

  const onToggleRow = async (row: LetRunPositionRow) => {
    const key = `${row.wallet}:${row.coin}`;
    setRowBusy(key);
    setError(null);
    const next = !row.letRun;
    const res = await setAdminPositionLetRun(row.wallet, row.coin, next);
    setRowBusy(null);
    if (!res.ok) {
      setError(res.error ?? 'Failed to toggle position');
      return;
    }
    await refresh();
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-card-dark p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-primary">Let run (per position)</h2>
            <p className="text-xs text-secondary mt-1 max-w-xl">
              Profit trail is default. Let run ON only when that wallet+coin is toggled —
              then no SL/trail for that one position (manual Close only).
            </p>
          </div>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded border border-border text-secondary hover:text-primary"
            onClick={() => void refresh()}
            disabled={busy}
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Refresh
          </button>
        </div>

        <div className="rounded-lg border border-border/60 bg-black/20 px-3 py-2 text-xs text-secondary">
          Global letRunAll is <span className="text-primary">{letRunAll ? 'ON in DB' : 'OFF'}</span>{' '}
          but <strong className="text-primary">ignored by the bot</strong> — only per-row Let run
          below (or the user app toggle) controls trail vs hold.
        </div>
        {updatedAt ? (
          <p className="text-[11px] text-secondary">Updated {new Date(updatedAt).toLocaleString()}</p>
        ) : null}
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
      </div>

      <div className="rounded-lg border border-border bg-card-dark overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-secondary border-b border-border">
              <th className="p-3">Wallet</th>
              <th className="p-3">Coin</th>
              <th className="p-3">Side</th>
              <th className="p-3">uPnL</th>
              <th className="p-3">Lev</th>
              <th className="p-3">Source</th>
              <th className="p-3">Let run</th>
            </tr>
          </thead>
          <tbody>
            {positions.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-secondary text-sm">
                  {busy ? 'Loading…' : 'No open positions on monitored wallets.'}
                </td>
              </tr>
            ) : (
              positions.map((p) => {
                const key = `${p.wallet}:${p.coin}`;
                return (
                  <tr key={key} className="border-b border-border/60">
                    <td className="p-3 font-mono text-xs">{shortWallet(p.wallet)}</td>
                    <td className="p-3 font-semibold">{p.coin}</td>
                    <td className={`p-3 ${p.side === 'LONG' ? 'text-emerald-400' : 'text-red-400'}`}>
                      {p.side}
                    </td>
                    <td
                      className={`p-3 ${p.uPnlUsd >= 0 ? 'text-emerald-400' : 'text-red-400'}`}
                    >
                      {p.uPnlUsd >= 0 ? '+' : ''}
                      {p.uPnlUsd.toFixed(2)}
                    </td>
                    <td className="p-3">{p.leverage}x</td>
                    <td className="p-3 text-xs text-secondary">{p.source}</td>
                    <td className="p-3">
                      <button
                        type="button"
                        disabled={rowBusy === key || busy}
                        onClick={() => void onToggleRow(p)}
                        className={`px-2.5 py-1 rounded text-xs font-bold border ${
                          p.letRun
                            ? 'border-emerald-600/50 bg-emerald-900/30 text-emerald-300'
                            : 'border-amber-600/40 bg-amber-900/20 text-amber-200'
                        }`}
                      >
                        {rowBusy === key ? '…' : p.letRun ? 'ON' : 'OFF'}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-border bg-card-dark overflow-x-auto">
        <div className="p-3 border-b border-border">
          <h3 className="text-sm font-semibold text-primary">Agent expiry (HL ~90d)</h3>
          <p className="text-[11px] text-secondary mt-0.5">
            Users must re-sign approveAgent — bot cannot rotate silently. Warn window = 14 days.
          </p>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-secondary border-b border-border">
              <th className="p-3">Wallet</th>
              <th className="p-3">Status</th>
              <th className="p-3">Days left</th>
              <th className="p-3">Expires</th>
            </tr>
          </thead>
          <tbody>
            {agentExpiry.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-4 text-secondary text-sm">
                  No agents expired or inside 14-day renew window.
                </td>
              </tr>
            ) : (
              agentExpiry.map((a) => (
                <tr key={a.wallet} className="border-b border-border/60">
                  <td className="p-3 font-mono text-xs">{shortWallet(a.wallet)}</td>
                  <td
                    className={`p-3 text-xs font-semibold ${
                      a.status === 'expired' ? 'text-red-400' : 'text-amber-300'
                    }`}
                  >
                    {a.status === 'expired' ? 'EXPIRED' : 'RENEW SOON'}
                  </td>
                  <td className="p-3">{a.daysLeft ?? '—'}</td>
                  <td className="p-3 text-xs text-secondary">
                    {a.expiresAt ? new Date(a.expiresAt).toLocaleString() : '—'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default AdminLetRunPanel;
