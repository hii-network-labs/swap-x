export interface Transaction {
  id: string;
  timestamp: number;
  txHash?: string;
  fromToken: {
    symbol: string;
    logo: string;
    amount: string;
  };
  toToken: {
    symbol: string;
    logo: string;
    amount: string;
  };
  exchangeRate: number;
  slippage: number;
  valueUsd: number;
}

export const saveTransaction = (transaction: Omit<Transaction, 'id' | 'timestamp'>) => {
  const transactions = getTransactions();
  const newTransaction: Transaction = {
    ...transaction,
    id: Date.now().toString(),
    timestamp: Date.now(),
  };
  transactions.unshift(newTransaction);
  localStorage.setItem('swap_transactions', JSON.stringify(transactions));
};

export const getTransactions = (): Transaction[] => {
  const stored = localStorage.getItem('swap_transactions');
  return stored ? JSON.parse(stored) : [];
};

export const clearTransactions = () => {
  localStorage.removeItem('swap_transactions');
};
