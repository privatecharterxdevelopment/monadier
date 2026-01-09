import React from 'react';
import { motion } from 'framer-motion';
import { Bell, ChevronDown, Clock, DollarSign, Lock, ShieldCheck } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import { useAuth } from '../../contexts/AuthContext';
import { formatCurrency } from '../../utils/formatters';

// Mock transaction data
const recentTransactions = [
  { 
    id: 1,
    merchant: 'Apple Store',
    category: 'Electronics',
    amount: 1299.99,
    date: '2025-07-15T14:32:21',
    status: 'completed'
  },
  { 
    id: 2,
    merchant: 'The Dorchester',
    category: 'Hotel',
    amount: 862.50,
    date: '2025-07-10T19:14:38',
    status: 'completed'
  },
  { 
    id: 3,
    merchant: 'British Airways',
    category: 'Travel',
    amount: 1458.72,
    date: '2025-07-05T10:23:45',
    status: 'pending'
  },
  { 
    id: 4,
    merchant: 'Louis Vuitton',
    category: 'Shopping',
    amount: 2195.00,
    date: '2025-07-01T16:09:12',
    status: 'completed'
  }
];

const CardPage: React.FC = () => {
  const { profile } = useAuth();
  const isSignature = profile?.membership_tier === 'signature';
  
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h2 className="font-display text-2xl mb-6">Your Monadier Card</h2>
          
          <div className="relative h-56 w-full rounded-xl overflow-hidden mb-8">
            <div 
              className={`absolute inset-0 ${
                isSignature ? 'bg-black' : 'bg-gray-700'
              }`}
            ></div>
            
            {/* Gold accent element */}
            <div 
              className={`absolute top-[20%] -right-10 w-32 h-56 rounded-full ${
                isSignature ? 'bg-accent/30' : 'bg-gray-600'
              } blur-xl`}
            ></div>
            
            <div className="absolute inset-0 p-6 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-center">
                  <div className="w-14 h-8 rounded-md bg-accent/10"></div>
                  <div className="text-sm uppercase font-medium">
                    {isSignature ? 'Signature' : 'Essential'}
                  </div>
                </div>
                <div className="mt-2 text-xs text-secondary">
                  {isSignature ? 'Metal Card' : 'Graphite Card'}
                </div>
              </div>
              
              <div>
                <div className="text-xs text-secondary mb-2">Card Number</div>
                <div className="flex space-x-4 text-xl font-medium">
                  <span>••••</span>
                  <span>••••</span>
                  <span>••••</span>
                  <span>4792</span>
                </div>
                
                <div className="mt-6 flex justify-between items-center">
                  <div>
                    <div className="text-xs text-secondary">CARDHOLDER NAME</div>
                    <div className="text-sm">{profile?.full_name || 'MONADIER MEMBER'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-secondary">VALID THRU</div>
                    <div className="text-sm">05/28</div>
                  </div>
                  <div>
                    <div className="text-xs text-secondary">CVV</div>
                    <div className="text-sm">•••</div>
                  </div>
                  <div className="w-14 h-14 rounded-full bg-accent/10 flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-accent/20"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <Card className="p-4">
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center">
                  <DollarSign size={18} className="text-accent" />
                </div>
                <div>
                  <h3 className="font-medium mb-1">Spending Limit</h3>
                  <p className="text-secondary text-sm">Set daily/monthly limits</p>
                </div>
              </div>
            </Card>
            
            <Card className="p-4">
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center">
                  <Lock size={18} className="text-accent" />
                </div>
                <div>
                  <h3 className="font-medium mb-1">Freeze Card</h3>
                  <p className="text-secondary text-sm">Temporarily lock your card</p>
                </div>
              </div>
            </Card>
            
            <Card className="p-4">
              <div className="flex items-start space-x-3">
                <div className="w-10 h-10 rounded-full bg-surface-hover flex items-center justify-center">
                  <Bell size={18} className="text-accent" />
                </div>
                <div>
                  <h3 className="font-medium mb-1">Notifications</h3>
                  <p className="text-secondary text-sm">Transaction alerts</p>
                </div>
              </div>
            </Card>
          </div>
          
          <Card className="p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="font-display text-xl">Recent Transactions</h3>
              <div className="flex space-x-2">
                <Button variant="ghost" size="sm">
                  <span>Filter</span>
                  <ChevronDown size={16} className="ml-1" />
                </Button>
                <Button variant="secondary" size="sm">View All</Button>
              </div>
            </div>
            
            <div className="space-y-4">
              {recentTransactions.map(transaction => (
                <div 
                  key={transaction.id}
                  className="flex justify-between items-center p-3 rounded-lg hover:bg-surface-hover transition-colors"
                >
                  <div className="flex items-center space-x-4">
                    <div className="w-10 h-10 bg-surface-hover rounded-full flex items-center justify-center">
                      <span className="text-accent font-medium">
                        {transaction.merchant.charAt(0)}
                      </span>
                    </div>
                    
                    <div>
                      <h4 className="font-medium">{transaction.merchant}</h4>
                      <div className="flex items-center text-secondary text-xs">
                        <span>{transaction.category}</span>
                        <span className="mx-2">•</span>
                        <span>{new Date(transaction.date).toLocaleDateString()}</span>
                        {transaction.status === 'pending' && (
                          <>
                            <span className="mx-2">•</span>
                            <span className="flex items-center text-warning">
                              <Clock size={12} className="mr-1" />
                              Pending
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  <div className="text-right">
                    <p className="font-medium">-{formatCurrency(transaction.amount)}</p>
                    <p className="text-secondary text-xs">
                      {isSignature ? '5% cashback' : '3% cashback'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </motion.div>
      </div>
      
      <div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
        >
          <Card className="p-6 mb-6">
            <h3 className="font-display text-xl mb-6">Card Details</h3>
            
            <div className="space-y-6">
              <div>
                <h4 className="text-secondary text-sm mb-2">Card Type</h4>
                <p className="font-medium">{isSignature ? 'Signature Metal Card' : 'Essential Graphite Card'}</p>
              </div>
              
              <div>
                <h4 className="text-secondary text-sm mb-2">Payments Network</h4>
                <p className="font-medium">Visa Infinite</p>
              </div>
              
              <div>
                <h4 className="text-secondary text-sm mb-2">Cashback Rate</h4>
                <p className="font-medium">{isSignature ? '5% Global' : '3% on select categories'}</p>
              </div>
              
              <div>
                <h4 className="text-secondary text-sm mb-2">Card Status</h4>
                <div className="flex items-center">
                  <div className="w-2 h-2 rounded-full bg-success mr-2"></div>
                  <p className="font-medium">Active</p>
                </div>
              </div>
              
              <div>
                <h4 className="text-secondary text-sm mb-2">Expiry Date</h4>
                <p className="font-medium">05/2028</p>
              </div>
            </div>
          </Card>
          
          <Card className="p-6 mb-6">
            <h3 className="font-display text-xl mb-6">Security Features</h3>
            
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="mt-1">
                  <ShieldCheck size={18} className="text-accent" />
                </div>
                <div>
                  <h4 className="font-medium mb-1">3D Secure</h4>
                  <p className="text-secondary text-sm">Advanced online payment protection</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="mt-1">
                  <Lock size={18} className="text-accent" />
                </div>
                <div>
                  <h4 className="font-medium mb-1">Transaction Monitoring</h4>
                  <p className="text-secondary text-sm">AI-powered fraud detection</p>
                </div>
              </div>
              
              <div className="flex items-start space-x-3">
                <div className="mt-1">
                  <Bell size={18} className="text-accent" />
                </div>
                <div>
                  <h4 className="font-medium mb-1">Real-time Alerts</h4>
                  <p className="text-secondary text-sm">Instant notifications for all transactions</p>
                </div>
              </div>
            </div>
          </Card>
          
          <Card className="p-6">
            <h3 className="font-display text-xl mb-4">Need Help?</h3>
            <p className="text-secondary mb-6">
              Our dedicated support team is available 24/7 to assist you with any card-related issues.
            </p>
            <Button variant="primary" fullWidth>Contact Support</Button>
          </Card>
        </motion.div>
      </div>
    </div>
  );
};

export default CardPage;