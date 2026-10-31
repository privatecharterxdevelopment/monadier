import React from 'react';
import { motion } from 'framer-motion';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import Card from '../../ui/Card';
import { formatCurrency } from '../../../utils/formatters';

interface AccountBalanceProps {
  balance: number;
  change: {
    amount: number;
    percentage: number;
    isPositive: boolean;
  };
}

const AccountBalance: React.FC<AccountBalanceProps> = ({ balance, change }) => {
  return (
    <Card className="overflow-hidden">
      <div className="p-6">
        <h3 className="text-secondary font-medium text-sm mb-1">Account Balance</h3>
        <div className="flex items-end space-x-2 mb-3">
          <div className="font-display text-primary text-4xl font-medium">
            {formatCurrency(balance)}
          </div>
          <div className={`flex items-center text-sm mb-1 ${change.isPositive ? 'text-success' : 'text-error'}`}>
            {change.isPositive ? (
              <ArrowUpRight size={16} className="mr-1" />
            ) : (
              <ArrowDownRight size={16} className="mr-1" />
            )}
            <span>
              {change.isPositive ? '+' : ''}{change.percentage}%
            </span>
          </div>
        </div>
        <p className="text-secondary text-sm">
          {change.isPositive ? '+' : ''}{formatCurrency(change.amount)} this month
        </p>
      </div>
      
      <div className="h-20 w-full bg-gradient-to-r from-surface to-surface px-2">
        {/* Simplified chart display */}
        <svg width="100%" height="100%" viewBox="0 0 100 20">
          <motion.path
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 1.5, ease: "easeInOut" }}
            d="M0,10 Q5,9 10,8 T20,5 T30,8 T40,6 T50,12 T60,9 T70,15 T80,8 T90,10 T100,7"
            fill="none"
            stroke="#d4af37"
            strokeWidth="1.5"
          />
        </svg>
      </div>
    </Card>
  );
};

export default AccountBalance;