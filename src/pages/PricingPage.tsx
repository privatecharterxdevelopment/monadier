import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Fuel,
  Repeat,
  Building2,
  TrendingDown,
  Calculator,
  Info,
  CheckCircle,
  ArrowRight,
  Zap,
  Gift,
  Sparkles
} from 'lucide-react';
import Logo from '../components/ui/Logo';
import MobileMenu from '../components/ui/MobileMenu';

const PricingPage: React.FC = () => {
  const fees = [
    {
      name: 'Gas Fee',
      amount: 'FREE',
      description: 'Network transaction fees',
      when: 'Paid by Monadier for all trades',
      icon: Fuel,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
      note: 'We cover all gas costs for you',
      covered: true
    },
    {
      name: 'Platform Fee',
      amount: 'FREE',
      description: 'Monadier service fee',
      when: 'Paid by Monadier on Base chain',
      icon: Building2,
      color: 'text-green-400',
      bgColor: 'bg-green-500/10',
      note: 'We cover this fee for all users',
      covered: true
    },
    {
      name: 'DEX Fee',
      amount: '0.3%',
      description: 'Uniswap liquidity provider fee',
      when: 'Per swap (Open + Close = 0.6% total)',
      icon: Repeat,
      color: 'text-pink-400',
      bgColor: 'bg-pink-500/10',
      note: 'Goes directly to liquidity providers'
    },
    {
      name: 'Slippage',
      amount: '0.5% - 2%',
      description: 'Price difference during execution',
      when: 'Depends on liquidity & trade size',
      icon: TrendingDown,
      color: 'text-purple-400',
      bgColor: 'bg-purple-500/10',
      note: 'Lower on high-liquidity pairs'
    }
  ];

  const tradeExample = {
    tradeAmount: 50,
    dexFee: 0.30,
    slippage: 0.50,
    priceGain: 2.00
  };

  const totalCosts = tradeExample.dexFee + tradeExample.slippage;
  const netResult = tradeExample.priceGain - totalCosts;

  return (
    <div className="min-h-screen bg-background text-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-white/5">
        <div className="container-custom">
          <nav className="flex justify-between items-center h-20">
            <Link to="/">
              <Logo size="md" />
            </Link>

            <div className="hidden md:flex items-center space-x-10">
              <Link to="/how-it-works" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
                How it works
              </Link>
              <Link to="/trading-bot" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
                Bot Trading
              </Link>
              <Link to="/pricing" className="text-white transition-colors text-sm font-medium">
                Pricing
              </Link>
              <Link to="/about" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
                About
              </Link>
            </div>

            <div className="flex items-center gap-4">
              <Link to="/login" className="hidden md:block text-gray-400 hover:text-white transition-colors text-sm font-medium">
                Sign in
              </Link>
              <Link to="/register" className="hidden md:block">
                <button className="px-4 py-2 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-100 transition-colors">
                  Trade now
                </button>
              </Link>
              <MobileMenu />
            </div>
          </nav>
        </div>
      </header>

      <main className="pt-32 pb-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          {/* Hero Banner */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-r from-green-500/20 via-accent/20 to-green-500/20 rounded-2xl border border-green-500/30 p-6 mb-12 text-center"
          >
            <div className="flex items-center justify-center gap-2 mb-2">
              <Gift className="w-6 h-6 text-green-400" />
              <span className="text-green-400 font-semibold text-lg">Monadier Covers Your Fees</span>
            </div>
            <p className="text-gray-300">
              We pay gas fees and platform fees for every trade. You only pay the DEX swap fee (~0.6%).
            </p>
          </motion.div>

          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center mb-16"
          >
            <h1 className="font-display text-4xl md:text-5xl mb-4">
              Transparent Pricing
            </h1>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              We cover gas and platform fees so you keep more of your profits.
            </p>
          </motion.div>

          {/* Fee Cards */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12"
          >
            {fees.map((fee, index) => (
              <motion.div
                key={fee.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + index * 0.05 }}
                className="bg-card-dark rounded-2xl border border-gray-800 p-6"
              >
                <div className="flex items-start gap-4">
                  <div className={`w-12 h-12 rounded-xl ${fee.bgColor} flex items-center justify-center flex-shrink-0`}>
                    <fee.icon className={`w-6 h-6 ${fee.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-white font-semibold">{fee.name}</h3>
                        {(fee as any).covered && (
                          <span className="px-2 py-0.5 bg-green-500/20 text-green-400 text-xs font-medium rounded-full flex items-center gap-1">
                            <Gift className="w-3 h-3" />
                            Covered
                          </span>
                        )}
                      </div>
                      <span className={`font-mono font-bold ${fee.color}`}>{fee.amount}</span>
                    </div>
                    <p className="text-gray-400 text-sm mb-2">{fee.description}</p>
                    <p className="text-gray-500 text-xs">{fee.when}</p>
                    {fee.note && (
                      <p className={(fee as any).covered ? "text-green-500/70 text-xs mt-2 flex items-center gap-1" : "text-gray-600 text-xs mt-2 flex items-center gap-1"}>
                        {(fee as any).covered ? <Sparkles className="w-3 h-3" /> : <Info className="w-3 h-3" />}
                        {fee.note}
                      </p>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>

          {/* Example Calculation */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="bg-card-dark rounded-2xl border border-gray-800 p-8 mb-12"
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-accent/20 flex items-center justify-center">
                <Calculator className="w-5 h-5 text-accent" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-white">Example: $50 Trade</h2>
                <p className="text-gray-500 text-sm">Complete cost breakdown</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Left: Breakdown */}
              <div className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b border-gray-800">
                  <span className="text-gray-400">Trade Amount</span>
                  <span className="text-white font-mono">${tradeExample.tradeAmount.toFixed(2)}</span>
                </div>

                <div className="space-y-2 py-2">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm flex items-center gap-2">
                      Gas Fees
                      <span className="text-green-400 text-xs">(Covered)</span>
                    </span>
                    <span className="text-green-400 font-mono text-sm line-through opacity-50">-$1.50</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm flex items-center gap-2">
                      Platform Fee
                      <span className="text-green-400 text-xs">(Covered)</span>
                    </span>
                    <span className="text-green-400 font-mono text-sm line-through opacity-50">-$0.50</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">DEX Fee (0.6%)</span>
                    <span className="text-orange-400 font-mono text-sm">-${tradeExample.dexFee.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-gray-500 text-sm">Slippage (~1%)</span>
                    <span className="text-orange-400 font-mono text-sm">-${tradeExample.slippage.toFixed(2)}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center py-2 border-t border-gray-800">
                  <span className="text-gray-400">Total Costs</span>
                  <span className="text-red-400 font-mono font-semibold">-${totalCosts.toFixed(2)}</span>
                </div>
              </div>

              {/* Right: Result */}
              <div className="bg-background rounded-xl p-6">
                <div className="text-center mb-6">
                  <p className="text-gray-500 text-sm mb-2">Price Movement Gain</p>
                  <p className="text-green-400 text-3xl font-mono font-bold">+${tradeExample.priceGain.toFixed(2)}</p>
                </div>

                <div className="flex items-center justify-center gap-2 mb-4">
                  <span className="text-green-400">+${tradeExample.priceGain.toFixed(2)}</span>
                  <span className="text-gray-500">-</span>
                  <span className="text-red-400">${totalCosts.toFixed(2)}</span>
                  <span className="text-gray-500">=</span>
                </div>

                <div className={`text-center p-4 rounded-lg ${netResult >= 0 ? 'bg-green-500/10 border border-green-500/20' : 'bg-red-500/10 border border-red-500/20'}`}>
                  <p className="text-gray-400 text-xs mb-1">Net Result</p>
                  <p className={`text-2xl font-mono font-bold ${netResult >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {netResult >= 0 ? '+' : ''}{netResult.toFixed(2)} USD
                  </p>
                </div>

                {netResult >= 0 && (
                  <div className="flex items-start gap-2 mt-4 text-green-400 text-sm">
                    <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <p>With Monadier covering gas & platform fees, more profit stays in your pocket!</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Tips */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="bg-gradient-to-br from-accent/5 to-transparent rounded-2xl border border-accent/20 p-8 mb-12"
          >
            <h2 className="text-xl font-semibold text-white mb-6 flex items-center gap-2">
              <Zap className="w-5 h-5 text-accent" />
              Tips to Maximize Profits
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                {
                  title: 'Zero Gas Costs',
                  description: 'Monadier covers all blockchain gas fees for your trades. No ETH needed in your wallet for transactions.'
                },
                {
                  title: 'No Platform Fees',
                  description: 'We don\'t charge any platform fees on Base chain. Your profits are yours to keep.'
                },
                {
                  title: 'Low Total Costs',
                  description: 'Only ~1% total cost (DEX fee + slippage). Target trades with 2%+ potential for consistent profits.'
                },
                {
                  title: 'High Liquidity Pairs',
                  description: 'We trade major pairs like ETH/USDC for minimal slippage and best execution.'
                }
              ].map((tip, index) => (
                <div key={index} className="flex items-start gap-3">
                  <CheckCircle className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-white font-medium">{tip.title}</h3>
                    <p className="text-gray-400 text-sm">{tip.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="text-center"
          >
            <p className="text-gray-400 mb-4">Ready to start trading with full transparency?</p>
            <Link
              to="/dashboard/trading"
              className="inline-flex items-center gap-2 px-6 py-3 bg-accent text-black font-semibold rounded-lg hover:bg-accent/90 transition-colors"
            >
              Start Trading
              <ArrowRight className="w-4 h-4" />
            </Link>
          </motion.div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12">
        <div className="container-custom">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <Logo size="sm" />
            <div className="flex gap-6 text-sm text-gray-500">
              <Link to="/about" className="hover:text-white transition-colors">About</Link>
              <Link to="/support" className="hover:text-white transition-colors">Support</Link>
              <Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            </div>
            <p className="text-gray-600 text-sm">© 2024 Monadier. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default PricingPage;
