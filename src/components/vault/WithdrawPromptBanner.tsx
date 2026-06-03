import React, { useEffect, useState } from 'react';
import { ArrowDownToLine, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { VaultClient } from '../../lib/vault';
import { useWeb3 } from '../../contexts/Web3Context';
import Button from '../ui/Button';

interface WithdrawPromptBannerProps {
  chainId: number;
  walletAddress: string;
}

/**
 * Optional reminder: trade P/L is already in the vault; user may tap Withdraw to move USDC to MetaMask.
 * V11 never auto-transfers to wallet — withdraw() must be signed by the user.
 */
export default function WithdrawPromptBanner({ chainId, walletAddress }: WithdrawPromptBannerProps) {
  const { publicClient, walletClient } = useWeb3();
  const [show, setShow] = useState(false);
  const [vaultBalance, setVaultBalance] = useState<number>(0);
  const [lastPnl, setLastPnl] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dismissKey = `withdraw_prompt_dismissed_${walletAddress.toLowerCase()}`;

  useEffect(() => {
    if (!walletAddress || chainId !== 42161) return;

    const run = async () => {
      if (sessionStorage.getItem(dismissKey) === '1') {
        return;
      }

      const { data: settings } = await supabase
        .from('vault_settings')
        .select('prompt_withdraw_after_close')
        .eq('wallet_address', walletAddress.toLowerCase())
        .eq('chain_id', chainId)
        .maybeSingle();

      if (!settings?.prompt_withdraw_after_close) return;

      const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
      const { data: lastClosed } = await supabase
        .from('positions')
        .select('profit_loss, closed_at')
        .eq('wallet_address', walletAddress.toLowerCase())
        .eq('chain_id', chainId)
        .eq('status', 'closed')
        .gte('closed_at', since)
        .order('closed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lastClosed?.closed_at) return;

      if (!publicClient) return;
      const vault = new VaultClient(publicClient as any, walletClient as any, chainId);
      const bal = await vault.getBalance(walletAddress as `0x${string}`);
      const balNum = parseFloat(bal);
      if (balNum < 1) return;

      setVaultBalance(balNum);
      setLastPnl(lastClosed.profit_loss as number | null);
      setShow(true);
    };

    void run();
  }, [walletAddress, chainId, publicClient, walletClient, dismissKey]);

  const handleDismiss = () => {
    sessionStorage.setItem(dismissKey, '1');
    setDismissed(true);
    setShow(false);
  };

  const handleWithdraw = async () => {
    if (!publicClient || !walletClient) return;
    setWithdrawing(true);
    setError(null);
    try {
      const vault = new VaultClient(publicClient as any, walletClient as any, chainId);
      const tx = await vault.withdrawAll(walletAddress as `0x${string}`);
      await publicClient.waitForTransactionReceipt({ hash: tx });
      handleDismiss();
    } catch (e: any) {
      setError(e.message || 'Withdraw failed');
    } finally {
      setWithdrawing(false);
    }
  };

  if (!show || dismissed) return null;

  return (
    <div className="mb-4 p-4 rounded-xl border border-accent/30 bg-accent/10 flex flex-col sm:flex-row sm:items-center gap-4">
      <div className="flex-1">
        <p className="text-primary font-medium text-sm flex items-center gap-2">
          <ArrowDownToLine className="w-4 h-4 text-accent" />
          Trade closed — funds are in your vault
        </p>
        <p className="text-secondary text-xs mt-1">
          P/L from the last close is already in your <strong className="text-[#52525b]">vault balance</strong>{' '}
          (${vaultBalance.toFixed(2)} USDC total).
          {lastPnl != null && (
            <span>
              {' '}
              Last trade: {lastPnl >= 0 ? '+' : ''}${lastPnl.toFixed(2)}.
            </span>
          )}{' '}
          Tap Withdraw only if you want USDC in MetaMask (you sign that tx).
        </p>
        {error && <p className="text-red-400 text-xs mt-2">{error}</p>}
      </div>
      <div className="flex gap-2 shrink-0">
        <Button variant="primary" onClick={handleWithdraw} isLoading={withdrawing}>
          Withdraw to wallet
        </Button>
        <button
          type="button"
          onClick={handleDismiss}
          className="p-2 text-secondary hover:text-primary"
          aria-label="Dismiss"
        >
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
