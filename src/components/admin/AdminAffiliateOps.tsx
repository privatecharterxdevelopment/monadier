import React, { useCallback, useEffect, useState } from 'react';
import { Download, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fmtUsdSymbol } from '../../lib/hyperliquid/format';

type OpsSummary = {
  pending: number;
  scheduled: number;
  processing: number;
  paid: number;
  failed: number;
};

type PayoutItem = {
  id: string;
  batch_id: string;
  referrer_id: string;
  referrer_email: string;
  wallet_address: string;
  amount_usd: number;
  status: string;
  tx_hash: string | null;
  created_at: string;
  coin: string | null;
};

type BatchRow = {
  id: string;
  status: string;
  total_amount: number;
  wallet_count: number;
  processed_by: string | null;
  created_at: string;
  processed_at: string | null;
};

type OpsData = {
  summary: OpsSummary;
  payout_items: PayoutItem[];
  batches: BatchRow[];
  fraud_flags: unknown[];
};

const AdminAffiliateOps: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<OpsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [txDraft, setTxDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: ops, error: rpcErr } = await supabase.rpc('get_admin_affiliate_ops');
      if (rpcErr) throw rpcErr;
      setData(ops as OpsData);
    } catch (err) {
      console.error(err);
      setError('Could not load affiliate ops.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const generateBatch = async () => {
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const email = userData.user?.email ?? 'admin';
      const { data: result, error: rpcErr } = await supabase.rpc('generate_affiliate_payout_batch', {
        p_min_usd: 10,
        p_processed_by: email,
      });
      if (rpcErr) throw rpcErr;
      if (!result?.success) {
        setError(String(result?.error ?? 'Batch generation failed'));
        return;
      }
      await load();
    } catch (err) {
      console.error(err);
      setError('Batch generation failed.');
    } finally {
      setBusy(false);
    }
  };

  const markPaid = async (itemId: string) => {
    const tx = txDraft[itemId]?.trim();
    if (!tx) {
      setError('Enter tx hash before marking paid.');
      return;
    }
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const { error: rpcErr } = await supabase.rpc('mark_affiliate_payout_item_paid', {
        p_item_id: itemId,
        p_tx_hash: tx,
        p_processed_by: userData.user?.email ?? 'admin',
      });
      if (rpcErr) throw rpcErr;
      await load();
    } catch (err) {
      console.error(err);
      setError('Mark paid failed.');
    } finally {
      setBusy(false);
    }
  };

  const retryFailed = async (itemId: string) => {
    setBusy(true);
    try {
      const { error: rpcErr } = await supabase.rpc('retry_failed_affiliate_payout_item', {
        p_item_id: itemId,
      });
      if (rpcErr) throw rpcErr;
      await load();
    } catch (err) {
      console.error(err);
      setError('Retry failed.');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!data?.payout_items?.length) return;
    const header = ['referrer_email', 'wallet', 'amount_usd', 'status', 'tx_hash', 'coin', 'created_at'];
    const rows = data.payout_items.map((row) =>
      [
        row.referrer_email,
        row.wallet_address,
        row.amount_usd,
        row.status,
        row.tx_hash ?? '',
        row.coin ?? '',
        row.created_at,
      ].join(',')
    );
    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `affiliate-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="animate-spin text-secondary" size={24} />
      </div>
    );
  }

  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-primary">Affiliate Ops</h2>
          <p className="text-sm text-secondary">Payout batches, reconciliation, and fraud review.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-secondary hover:text-primary"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void generateBatch()}
            className="px-3 py-2 rounded-lg bg-white text-black font-medium disabled:opacity-50"
          >
            Generate batch
          </button>
          <button
            type="button"
            onClick={exportCsv}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border text-secondary hover:text-primary"
          >
            <Download size={14} />
            Export CSV
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}

      {summary ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {(['pending', 'scheduled', 'processing', 'paid', 'failed'] as const).map((key) => (
            <div key={key} className="bg-card-dark border border-border rounded-xl p-4">
              <p className="text-xs text-secondary capitalize">{key}</p>
              <p className="text-lg font-semibold text-primary">{fmtUsdSymbol(summary[key])}</p>
            </div>
          ))}
        </div>
      ) : null}

      <div className="bg-card-dark border border-border rounded-xl overflow-hidden flex flex-col h-[min(62dvh,680px)] min-w-0">
        <div className="admin-monitor-table-scroll flex-1 min-h-0 min-w-0">
        <table className="w-full min-w-max text-sm">
          <thead>
            <tr className="text-secondary border-b border-border">
              <th className="text-left p-3">Referrer</th>
              <th className="text-left p-3">Wallet</th>
              <th className="text-left p-3">Amount</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Tx hash</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data?.payout_items ?? []).map((row) => (
              <tr key={row.id} className="border-b border-border/60">
                <td className="p-3 text-primary">{row.referrer_email}</td>
                <td className="p-3 font-mono text-xs text-secondary">{row.wallet_address}</td>
                <td className="p-3 text-primary">{fmtUsdSymbol(row.amount_usd)}</td>
                <td className="p-3 capitalize text-secondary">{row.status}</td>
                <td className="p-3">
                  {row.status === 'paid' ? (
                    <span className="font-mono text-xs text-green-400">{row.tx_hash ?? '—'}</span>
                  ) : (
                    <input
                      className="w-full min-w-[180px] bg-black/30 border border-border rounded px-2 py-1 text-xs font-mono"
                      placeholder="0x…"
                      value={txDraft[row.id] ?? ''}
                      onChange={(e) =>
                        setTxDraft((prev) => ({ ...prev, [row.id]: e.target.value }))
                      }
                    />
                  )}
                </td>
                <td className="p-3">
                  {row.status !== 'paid' ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void markPaid(row.id)}
                        className="text-xs px-2 py-1 rounded bg-green-600 text-white disabled:opacity-50"
                      >
                        Mark paid
                      </button>
                      {row.status === 'failed' ? (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void retryFailed(row.id)}
                          className="text-xs px-2 py-1 rounded border border-border text-secondary"
                        >
                          Retry
                        </button>
                      ) : null}
                    </div>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      </div>

      {(data?.fraud_flags?.length ?? 0) > 0 ? (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
          <p className="text-sm text-yellow-300">
            {data?.fraud_flags?.length} referral(s) flagged for review (same wallet/IP/device patterns).
          </p>
        </div>
      ) : null}
    </div>
  );
};

export default AdminAffiliateOps;
