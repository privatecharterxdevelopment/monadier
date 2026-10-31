import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Play, Search, Zap } from 'lucide-react';
import {
  executeForceOpen,
  parseForceOpenCommand,
  previewForceOpen,
  type ForceOpenDirection,
  type ForceOpenResponse,
  type ForceOpenResultRow,
} from '../../lib/adminForceOpen';
import { getBotAdminSecret, setBotAdminSecretSession } from '../../lib/adminTwitter';

function shortWallet(w: string): string {
  if (!w || w.length < 12) return w;
  return `${w.slice(0, 6)}…${w.slice(-4)}`;
}

const AdminForceOpenPanel: React.FC = () => {
  const [command, setCommand] = useState('btc short 40x');
  const [coin, setCoin] = useState('BTC');
  const [direction, setDirection] = useState<ForceOpenDirection>('SHORT');
  const [leverage, setLeverage] = useState('40');
  const [adminSecretDraft, setAdminSecretDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ForceOpenResponse | null>(null);
  const [executeResult, setExecuteResult] = useState<ForceOpenResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showSkipped, setShowSkipped] = useState(false);

  useEffect(() => {
    setAdminSecretDraft(getBotAdminSecret());
  }, []);

  const applyCommandToFields = useCallback(() => {
    const parsed = parseForceOpenCommand(command);
    if ('error' in parsed) {
      setError(parsed.error);
      return null;
    }
    setCoin(parsed.coin);
    setDirection(parsed.direction);
    setLeverage(parsed.leverage != null ? String(parsed.leverage) : '');
    setError(null);
    return parsed;
  }, [command]);

  const resolved = useMemo(() => {
    const fromCmd = parseForceOpenCommand(command);
    if (!('error' in fromCmd)) return fromCmd;
    const lev = leverage.trim() ? Math.max(1, Math.floor(Number(leverage))) : undefined;
    if (!coin.trim()) return { error: 'Coin required' } as const;
    if (lev != null && (!Number.isFinite(lev) || lev < 1 || lev > 200)) {
      return { error: 'Leverage must be 1–200' } as const;
    }
    return {
      coin: coin.trim().toUpperCase(),
      direction,
      leverage: lev,
    };
  }, [command, coin, direction, leverage]);

  const eligibleRows = useMemo(
    () => (preview?.results ?? []).filter((r) => r.success),
    [preview]
  );
  const skippedRows = useMemo(
    () => (preview?.results ?? []).filter((r) => !r.success),
    [preview]
  );

  const onPreview = async () => {
    setBusy(true);
    setError(null);
    setExecuteResult(null);
    if (adminSecretDraft.trim()) setBotAdminSecretSession(adminSecretDraft.trim());

    const fromCmd = parseForceOpenCommand(command);
    const parsed =
      !('error' in fromCmd)
        ? fromCmd
        : !('error' in resolved)
          ? resolved
          : null;
    if (!parsed) {
      setBusy(false);
      setError(
        'error' in fromCmd
          ? fromCmd.error
          : 'error' in resolved
            ? resolved.error
            : 'Invalid command'
      );
      return;
    }
    setCoin(parsed.coin);
    setDirection(parsed.direction);
    setLeverage(parsed.leverage != null ? String(parsed.leverage) : '');

    const res = await previewForceOpen({
      coin: parsed.coin,
      direction: parsed.direction,
      leverage: parsed.leverage,
    });
    setBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? 'Preview failed');
      setPreview(null);
      setSelected(new Set());
      return;
    }
    setPreview(res.data);
    const next = new Set(
      (res.data.results ?? []).filter((r) => r.success).map((r) => r.wallet.toLowerCase())
    );
    setSelected(next);
  };

  const onExecute = async () => {
    if (!preview) {
      setError('Run Preview first');
      return;
    }
    if (selected.size === 0) {
      setError('Select at least one wallet with a free slot');
      return;
    }
    const label = `${preview.coin} ${preview.direction}${
      preview.leverage ? ` ${preview.leverage}x` : ''
    }`;
    if (
      !window.confirm(
        `Force-open ${label} for ${selected.size} wallet(s)?\n\nThis places live market orders.`
      )
    ) {
      return;
    }

    setBusy(true);
    setError(null);
    if (adminSecretDraft.trim()) setBotAdminSecretSession(adminSecretDraft.trim());

    const res = await executeForceOpen({
      coin: preview.coin,
      direction: preview.direction,
      leverage: preview.leverage ?? undefined,
      wallets: [...selected],
    });
    setBusy(false);
    if (!res.ok || !res.data) {
      setError(res.error ?? 'Execute failed');
      return;
    }
    setExecuteResult(res.data);
  };

  const toggleWallet = (wallet: string) => {
    const key = wallet.toLowerCase();
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllEligible = () => {
    setSelected(new Set(eligibleRows.map((r) => r.wallet.toLowerCase())));
  };

  const clearSelection = () => setSelected(new Set());

  const renderRows = (rows: ForceOpenResultRow[], selectable: boolean) => (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full text-sm text-left">
        <thead className="bg-black/[0.03] text-secondary text-xs uppercase">
          <tr>
            {selectable && <th className="px-3 py-2 w-10" />}
            <th className="px-3 py-2">Wallet</th>
            <th className="px-3 py-2">Slots</th>
            <th className="px-3 py-2">Free $</th>
            <th className="px-3 py-2">Lev</th>
            <th className="px-3 py-2">Notional</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const key = r.wallet.toLowerCase();
            return (
              <tr key={key} className="border-t border-border/60">
                {selectable && (
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.has(key)}
                      onChange={() => toggleWallet(r.wallet)}
                      disabled={busy}
                    />
                  </td>
                )}
                <td className="px-3 py-2 font-mono text-xs" title={r.wallet}>
                  {shortWallet(r.wallet)}
                </td>
                <td className="px-3 py-2">{r.slots ?? '—'}</td>
                <td className="px-3 py-2">
                  {r.freeMarginUsd != null ? `$${r.freeMarginUsd.toFixed(2)}` : '—'}
                </td>
                <td className="px-3 py-2">{r.leverage != null ? `${r.leverage}x` : '—'}</td>
                <td className="px-3 py-2">
                  {r.notionalUsd != null ? `$${r.notionalUsd.toFixed(0)}` : '—'}
                </td>
                <td className="px-3 py-2">
                  {r.success ? (
                    <span className="text-emerald-600">eligible</span>
                  ) : (
                    <span className="text-red-500 text-xs">{r.error ?? 'skip'}</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card-dark p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-amber-500/15 p-2 text-amber-600">
            <Zap size={18} />
          </div>
          <div>
            <h2 className="text-primary font-semibold text-lg">Force open</h2>
            <p className="text-secondary text-sm mt-1">
              Mass-open for auto-trade wallets with free slots. Soft gates skipped; hard safety
              (excluded coins, LONG allowlist, margin, agent) still applies.
            </p>
          </div>
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-secondary uppercase tracking-wide">
            Command
          </span>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onBlur={() => applyCommandToFields()}
            placeholder="btc short 40x"
            className="w-full rounded-lg border border-border bg-background px-3 py-2.5 text-primary font-mono text-sm"
            disabled={busy}
          />
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block space-y-1">
            <span className="text-xs text-secondary">Coin</span>
            <input
              value={coin}
              onChange={(e) => setCoin(e.target.value.toUpperCase())}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              disabled={busy}
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-secondary">Direction</span>
            <select
              value={direction}
              onChange={(e) => setDirection(e.target.value as ForceOpenDirection)}
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              disabled={busy}
            >
              <option value="SHORT">SHORT</option>
              <option value="LONG">LONG</option>
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs text-secondary">Leverage (optional)</span>
            <input
              value={leverage}
              onChange={(e) => setLeverage(e.target.value.replace(/[^\d]/g, ''))}
              placeholder="user default"
              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
              disabled={busy}
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-secondary">Bot admin secret</span>
          <input
            type="password"
            value={adminSecretDraft}
            onChange={(e) => setAdminSecretDraft(e.target.value)}
            onBlur={() => {
              if (adminSecretDraft.trim()) setBotAdminSecretSession(adminSecretDraft.trim());
            }}
            placeholder="BOT_ADMIN_SECRET"
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono"
            disabled={busy}
            autoComplete="off"
          />
        </label>

        {error && (
          <p className="text-sm text-red-500 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void onPreview()}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-lg bg-black text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />}
            Preview free slots
          </button>
          <button
            type="button"
            onClick={() => void onExecute()}
            disabled={busy || !preview || selected.size === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-600 text-white px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Execute ({selected.size})
          </button>
        </div>
      </div>

      {preview && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-primary">
              Preview{' '}
              <span className="font-semibold">
                {preview.coin} {preview.direction}
                {preview.leverage ? ` ${preview.leverage}x` : ''}
              </span>
              : <span className="text-emerald-600 font-medium">{preview.eligible} eligible</span>
              {', '}
              <span className="text-secondary">{preview.skipped} skipped</span>
            </p>
            <div className="flex gap-2 text-xs">
              <button
                type="button"
                className="text-secondary hover:text-primary underline"
                onClick={selectAllEligible}
              >
                Select all eligible
              </button>
              <button
                type="button"
                className="text-secondary hover:text-primary underline"
                onClick={clearSelection}
              >
                Clear
              </button>
              <button
                type="button"
                className="text-secondary hover:text-primary underline"
                onClick={() => setShowSkipped((v) => !v)}
              >
                {showSkipped ? 'Hide skipped' : 'Show skipped'}
              </button>
            </div>
          </div>
          {eligibleRows.length > 0 ? (
            renderRows(eligibleRows, true)
          ) : (
            <p className="text-sm text-secondary py-4 text-center">No wallets with free slots.</p>
          )}
          {showSkipped && skippedRows.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs uppercase text-secondary font-medium">Skipped</p>
              {renderRows(skippedRows, false)}
            </div>
          )}
        </div>
      )}

      {executeResult && (
        <div className="rounded-xl border border-border bg-card-dark p-4 space-y-3">
          <h3 className="font-semibold text-primary">Execute result</h3>
          <p className="text-sm text-secondary">
            Opened <span className="text-emerald-600 font-medium">{executeResult.opened}</span>
            {' · '}
            Failed <span className="text-red-500 font-medium">{executeResult.failed}</span>
            {' · '}
            Skipped {executeResult.skipped}
          </p>
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm text-left">
              <thead className="bg-black/[0.03] text-secondary text-xs uppercase">
                <tr>
                  <th className="px-3 py-2">Wallet</th>
                  <th className="px-3 py-2">Result</th>
                </tr>
              </thead>
              <tbody>
                {executeResult.results.map((r) => (
                  <tr key={r.wallet} className="border-t border-border/60">
                    <td className="px-3 py-2 font-mono text-xs" title={r.wallet}>
                      {shortWallet(r.wallet)}
                    </td>
                    <td className="px-3 py-2">
                      {r.success ? (
                        <span className="text-emerald-600">opened</span>
                      ) : (
                        <span className="text-red-500 text-xs">{r.error ?? 'failed'}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminForceOpenPanel;
