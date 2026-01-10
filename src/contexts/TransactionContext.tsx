import React, { createContext, useContext, useState, useCallback } from 'react';

export type TransactionType = 'deposit' | 'withdraw' | 'swap' | 'approve' | 'trade';
export type TransactionStatus = 'pending' | 'confirming' | 'success' | 'failed';

export interface Transaction {
  id: string;
  type: TransactionType;
  hash: string;
  status: TransactionStatus;
  description: string;
  amount?: string;
  token?: string;
  timestamp: number;
  chainId: number;
  blockExplorerUrl?: string;
}

interface TransactionContextType {
  transactions: Transaction[];
  addTransaction: (tx: Omit<Transaction, 'id' | 'timestamp'>) => string;
  updateTransaction: (id: string, updates: Partial<Transaction>) => void;
  removeTransaction: (id: string) => void;
  clearCompleted: () => void;
}

const TransactionContext = createContext<TransactionContextType>({
  transactions: [],
  addTransaction: () => '',
  updateTransaction: () => {},
  removeTransaction: () => {},
  clearCompleted: () => {}
});

export const useTransactions = () => useContext(TransactionContext);

export const TransactionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);

  const addTransaction = useCallback((tx: Omit<Transaction, 'id' | 'timestamp'>): string => {
    const id = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const newTx: Transaction = {
      ...tx,
      id,
      timestamp: Date.now()
    };
    setTransactions(prev => [newTx, ...prev]);
    return id;
  }, []);

  const updateTransaction = useCallback((id: string, updates: Partial<Transaction>) => {
    setTransactions(prev =>
      prev.map(tx => (tx.id === id ? { ...tx, ...updates } : tx))
    );
  }, []);

  const removeTransaction = useCallback((id: string) => {
    setTransactions(prev => prev.filter(tx => tx.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setTransactions(prev => prev.filter(tx => tx.status === 'pending' || tx.status === 'confirming'));
  }, []);

  return (
    <TransactionContext.Provider
      value={{
        transactions,
        addTransaction,
        updateTransaction,
        removeTransaction,
        clearCompleted
      }}
    >
      {children}
    </TransactionContext.Provider>
  );
};
