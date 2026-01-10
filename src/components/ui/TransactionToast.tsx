import React, { useEffect, useState } from 'react';
import { X, ExternalLink, Loader2, CheckCircle, XCircle, ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react';
import { useTransactions, Transaction, TransactionStatus } from '../../contexts/TransactionContext';

const STATUS_ICONS: Record<TransactionStatus, React.ReactNode> = {
  pending: <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />,
  confirming: <Loader2 className="w-4 h-4 animate-spin text-blue-400" />,
  success: <CheckCircle className="w-4 h-4 text-green-400" />,
  failed: <XCircle className="w-4 h-4 text-red-400" />
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  deposit: <ArrowDownLeft className="w-4 h-4" />,
  withdraw: <ArrowUpRight className="w-4 h-4" />,
  swap: <RefreshCw className="w-4 h-4" />,
  approve: <CheckCircle className="w-4 h-4" />,
  trade: <RefreshCw className="w-4 h-4" />
};

const STATUS_TEXT: Record<TransactionStatus, string> = {
  pending: 'Pending...',
  confirming: 'Confirming...',
  success: 'Confirmed',
  failed: 'Failed'
};

const STATUS_COLORS: Record<TransactionStatus, string> = {
  pending: 'border-yellow-500/30 bg-yellow-500/5',
  confirming: 'border-blue-500/30 bg-blue-500/5',
  success: 'border-green-500/30 bg-green-500/5',
  failed: 'border-red-500/30 bg-red-500/5'
};

function TransactionItem({ tx, onRemove }: { tx: Transaction; onRemove: () => void }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (tx.status === 'pending' || tx.status === 'confirming') {
      const interval = setInterval(() => {
        setElapsed(Math.floor((Date.now() - tx.timestamp) / 1000));
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [tx.status, tx.timestamp]);

  const formatElapsed = (seconds: number) => {
    if (seconds < 60) return `${seconds}s`;
    return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${STATUS_COLORS[tx.status]}`}
    >
      <div className="flex-shrink-0 p-2 bg-zinc-800 rounded-lg">
        {TYPE_ICONS[tx.type] || TYPE_ICONS.swap}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white capitalize">{tx.type}</span>
          {tx.amount && tx.token && (
            <span className="text-sm text-zinc-400">
              {tx.amount} {tx.token}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {STATUS_ICONS[tx.status]}
          <span className="text-xs text-zinc-500">
            {STATUS_TEXT[tx.status]}
            {(tx.status === 'pending' || tx.status === 'confirming') && (
              <span className="ml-1">({formatElapsed(elapsed)})</span>
            )}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-1">
        {tx.blockExplorerUrl && (
          <a
            href={tx.blockExplorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 hover:bg-zinc-700 rounded transition-colors"
            title="View on explorer"
          >
            <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
          </a>
        )}
        {(tx.status === 'success' || tx.status === 'failed') && (
          <button
            onClick={onRemove}
            className="p-1.5 hover:bg-zinc-700 rounded transition-colors"
            title="Dismiss"
          >
            <X className="w-3.5 h-3.5 text-zinc-400" />
          </button>
        )}
      </div>
    </div>
  );
}

export default function TransactionToast() {
  const { transactions, removeTransaction, clearCompleted } = useTransactions();

  // Only show recent transactions (last 5 minutes) or pending ones
  const visibleTransactions = transactions.filter(tx => {
    const age = Date.now() - tx.timestamp;
    const fiveMinutes = 5 * 60 * 1000;
    return tx.status === 'pending' || tx.status === 'confirming' || age < fiveMinutes;
  });

  if (visibleTransactions.length === 0) return null;

  const hasCompleted = visibleTransactions.some(
    tx => tx.status === 'success' || tx.status === 'failed'
  );

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 space-y-2">
      {hasCompleted && visibleTransactions.length > 1 && (
        <button
          onClick={clearCompleted}
          className="w-full text-xs text-zinc-500 hover:text-zinc-300 text-right pr-2 transition-colors"
        >
          Clear completed
        </button>
      )}
      {visibleTransactions.map(tx => (
        <TransactionItem
          key={tx.id}
          tx={tx}
          onRemove={() => removeTransaction(tx.id)}
        />
      ))}
    </div>
  );
}
