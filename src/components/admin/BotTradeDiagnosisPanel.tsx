import React, { useCallback, useState } from 'react';
import { RefreshCw, Stethoscope } from 'lucide-react';
import {
  blockingGateSummary,
  fetchAdminBotDiagnosisBatch,
  type AdminWalletTradeDiagnosis,
} from '../../lib/adminBotDiagnosis';
import { shortWallet } from '../../lib/adminDashboard';

type BotRow = {
  wallet_address: string;
  email?: string | null;
  bot_runnable?: boolean;
  agent_approved?: boolean;
};

export function BotTradeDiagnosisPanel({ bots }: { bots: BotRow[] }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diagnoses, setDiagnoses] = useState<Record<string, AdminWalletTradeDiagnosis>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const runDiagnosis = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const wallets = bots.map((b) => b.wallet_address).filter(Boolean);
      const result = await fetchAdminBotDiagnosisBatch(wallets);
      setDiagnoses(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Diagnosis failed');
    } finally {
      setLoading(false);
    }
  }, [bots]);

  const readyCount = Object.values(diagnoses).filter((d) => d.canTrade).length;
  const openCount = Object.values(diagnoses).filter((d) => d.wouldProcessOpens).length;

  return (
    <div className="rounded-xl border border-border bg-surface p-4 mb-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Stethoscope size={16} />
            Live trade diagnosis
          </h3>
          <p className="text-xs text-secondary mt-1">
            Agent &quot;approved&quot; in DB ≠ tradet. Zeigt Balance, Margin, Subscription, Markt-Gates und
            Funnel-IDs vom Bot-Service.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void runDiagnosis()}
          disabled={loading || bots.length === 0}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-sm disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          {loading ? 'Diagnose…' : 'Alle live prüfen'}
        </button>
      </div>

      {error ? <p className="text-xs text-red-400 mb-2">{error}</p> : null}

      {Object.keys(diagnoses).length > 0 ? (
        <p className="text-xs text-secondary mb-3">
          {readyCount} ready · {openCount} würden Opens versuchen · {bots.length - openCount} blockiert
        </p>
      ) : null}

      {Object.keys(diagnoses).length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-secondary border-b border-border">
                <th className="py-2 pr-3">User</th>
                <th className="py-2 pr-3">DB runnable</th>
                <th className="py-2 pr-3">Live</th>
                <th className="py-2 pr-3">Equity</th>
                <th className="py-2 pr-3">Perp / Spot</th>
                <th className="py-2 pr-3">Blocking gates</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {bots.map((b) => {
                const w = b.wallet_address.toLowerCase();
                const d = diagnoses[w];
                if (!d) return null;
                const blocking = d.gates.filter((g) => g.blocking);
                const isExpanded = expanded === w;
                return (
                  <React.Fragment key={w}>
                    <tr className="border-b border-border/60 align-top hover:bg-black/[0.03]">
                      <td className="py-2 pr-3">
                        <div className="font-mono">{shortWallet(w, 6)}</div>
                        <div className="text-secondary truncate max-w-[120px]">{b.email ?? '—'}</div>
                      </td>
                      <td className="py-2 pr-3">{b.bot_runnable ? 'yes' : 'no'}</td>
                      <td className="py-2 pr-3">
                        <span
                          className={
                            d.canTrade
                              ? 'text-emerald-500'
                              : d.wouldProcessOpens
                                ? 'text-amber-400'
                                : 'text-red-400'
                          }
                        >
                          {d.canTrade ? 'READY' : d.wouldProcessOpens ? 'PARTIAL' : 'BLOCKED'}
                        </span>
                      </td>
                      <td className="py-2 pr-3 font-mono">${d.hyperliquid.accountEquityUsd.toFixed(2)}</td>
                      <td className="py-2 pr-3 font-mono">
                        ${d.hyperliquid.perpUsd.toFixed(2)} / ${d.hyperliquid.spotUsdcUsd.toFixed(2)}
                      </td>
                      <td className="py-2 pr-3 text-amber-400/90 max-w-[220px]">
                        {blockingGateSummary(d)}
                      </td>
                      <td className="py-2 pr-3">
                        <button
                          type="button"
                          className="text-blue-400 hover:underline"
                          onClick={() => setExpanded(isExpanded ? null : w)}
                        >
                          {isExpanded ? 'Hide' : 'Details'}
                        </button>
                      </td>
                    </tr>
                    {isExpanded ? (
                      <tr className="bg-black/[0.02]">
                        <td colSpan={7} className="py-3 px-2">
                          <DiagnosisDetail diagnosis={d} dbAgent={b.agent_approved} />
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function DiagnosisDetail({
  diagnosis,
  dbAgent,
}: {
  diagnosis: AdminWalletTradeDiagnosis;
  dbAgent?: boolean;
}) {
  const blocking = diagnosis.gates.filter((g) => g.blocking);
  const passed = diagnosis.gates.filter((g) => !g.blocking);

  return (
    <div className="space-y-3 text-xs">
      {dbAgent && !diagnosis.hyperliquid.agentApproved ? (
        <p className="text-amber-400 font-medium">
          DB zeigt Agent approved, aber On-Chain-Check schlägt fehl — User muss Agent in HL neu approven.
        </p>
      ) : null}

      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <p className="font-semibold text-red-400 mb-1">Blocking ({blocking.length})</p>
          <ul className="space-y-1">
            {blocking.length === 0 ? (
              <li className="text-secondary">—</li>
            ) : (
              blocking.map((g) => (
                <li key={`${g.id}-${g.message.slice(0, 20)}`}>
                  <span className="font-mono text-amber-300">{g.id}</span>
                  <span className="text-secondary"> · {g.stage} — </span>
                  {g.message}
                </li>
              ))
            )}
          </ul>
        </div>
        <div>
          <p className="font-semibold text-emerald-500 mb-1">Passed ({passed.length})</p>
          <ul className="space-y-1 max-h-40 overflow-y-auto">
            {passed.slice(0, 8).map((g) => (
              <li key={`${g.id}-ok`} className="text-secondary">
                <span className="font-mono text-emerald-600/80">{g.id}</span> — {g.message}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="text-secondary">
        Signals: {diagnosis.globalScan.rawCandidateCount} raw → {diagnosis.globalScan.tradeableCount}{' '}
        tradeable
        {diagnosis.globalScan.best
          ? ` · best ${diagnosis.globalScan.best.coin} ${diagnosis.globalScan.best.direction}`
          : ''}
        {diagnosis.hyperliquid.openCoins.length > 0
          ? ` · open: ${diagnosis.hyperliquid.openCoins.join(', ')}`
          : ''}
      </div>

      {diagnosis.lastOpenError?.error ? (
        <p className="text-amber-400">
          Last open error: {diagnosis.lastOpenError.error}
          {diagnosis.lastOpenError.coin ? ` (${diagnosis.lastOpenError.coin})` : ''}
        </p>
      ) : null}

      {diagnosis.recentFunnel.length > 0 ? (
        <div>
          <p className="font-semibold mb-1">Recent funnel (6h)</p>
          <ul className="font-mono text-[10px] text-secondary space-y-0.5">
            {diagnosis.recentFunnel.slice(0, 6).map((r, i) => (
              <li key={`${r.recorded_at}-${i}`}>
                {r.stage} {r.coin} {r.direction}{' '}
                {r.passed ? '✓' : `✗ ${r.skip_reason ?? ''}`}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
