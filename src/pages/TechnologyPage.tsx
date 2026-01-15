import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Brain, TrendingUp, Shield, Target, Activity, BarChart3, Cpu, LineChart } from 'lucide-react';
import Logo from '../components/ui/Logo';
import CookieConsent from '../components/ui/CookieConsent';
import MobileMenu from '../components/ui/MobileMenu';

const TechnologyPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-white/5">
        <div className="container-custom">
          <nav className="flex justify-between items-center h-20">
            <Logo size="md" />
            <div className="hidden md:flex items-center space-x-10">
              <Link to="/how-it-works" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
                How it works
              </Link>
              <Link to="/trading-bot" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
                Bot Trading
              </Link>
              <Link to="/pricing" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
                Pricing
              </Link>
              <Link to="/technology" className="text-white transition-colors text-sm font-medium">
                Technology
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

      <main className="pt-32 pb-24">
        {/* Hero Section */}
        <section className="container-custom mb-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-4xl mx-auto text-center"
          >
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-medium leading-[1.1] mb-8 tracking-tight">
              Our <span className="text-gray-500">Technology</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed">
              Institutional-grade quantitative trading algorithms powered by AI, designed for retail traders seeking professional-level performance.
            </p>
          </motion.div>
        </section>

        {/* Core Technology Section */}
        <section className="container-custom mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-display font-medium mb-6">
              Quantitative Trading Engine
            </h2>
            <p className="text-gray-400 text-lg leading-relaxed">
              Our trading engine combines multiple analytical approaches inspired by the world's most successful quantitative hedge funds.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Brain,
                title: 'AI-Powered Analysis',
                description: 'Advanced machine learning models analyze market conditions, sentiment, and technical patterns in real-time to generate high-confidence trading signals.'
              },
              {
                icon: BarChart3,
                title: 'Multi-Factor Models',
                description: 'Renaissance-style quantitative approach combining momentum, mean-reversion, and statistical arbitrage strategies for optimal market timing.'
              },
              {
                icon: Target,
                title: 'Signal Confidence Scoring',
                description: 'Every trade signal is assigned a confidence score ranging from 55% to 75%, ensuring only high-probability setups are executed.'
              },
              {
                icon: Activity,
                title: 'Dynamic Risk Management',
                description: 'Adaptive position sizing and exposure limits that respond to market volatility and portfolio performance in real-time.'
              },
              {
                icon: LineChart,
                title: 'Trailing Stop Technology',
                description: 'Intelligent trailing stops that activate at 0.6% profit, automatically locking in gains while letting winners run during strong trends.'
              },
              {
                icon: Cpu,
                title: 'Low-Latency Execution',
                description: 'Direct integration with GMX perpetuals for instant order execution on Arbitrum, minimizing slippage and maximizing fill rates.'
              }
            ].map((tech, index) => (
              <motion.div
                key={tech.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="p-8 rounded-2xl border border-white/5 hover:border-white/10 hover:bg-white/[0.02] transition-all"
              >
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-6">
                  <tech.icon className="text-white/60" size={24} />
                </div>
                <h3 className="text-lg font-medium text-white mb-3">{tech.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{tech.description}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* How It Works Section */}
        <section className="container-custom mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="p-8 md:p-12 rounded-3xl bg-white/[0.02] border border-white/5"
          >
            <div className="max-w-3xl mx-auto">
              <h2 className="text-3xl md:text-4xl font-display font-medium mb-8 text-center">
                Trading Signal Generation
              </h2>

              <div className="space-y-8">
                <div className="flex gap-6">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-medium">
                    1
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-white mb-2">Market Analysis</h3>
                    <p className="text-gray-400 leading-relaxed">
                      Our AI continuously monitors price action, volume, order flow, and on-chain metrics across multiple timeframes to identify emerging opportunities.
                    </p>
                  </div>
                </div>

                <div className="flex gap-6">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-medium">
                    2
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-white mb-2">Confidence Scoring</h3>
                    <p className="text-gray-400 leading-relaxed">
                      Each potential trade is evaluated against historical patterns and assigned a confidence score between 55-75%. Only signals meeting your threshold are executed.
                    </p>
                  </div>
                </div>

                <div className="flex gap-6">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-medium">
                    3
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-white mb-2">Position Management</h3>
                    <p className="text-gray-400 leading-relaxed">
                      Smart entry with predefined stop-loss and take-profit levels. Trailing stops automatically activate to protect profits while maximizing upside potential.
                    </p>
                  </div>
                </div>

                <div className="flex gap-6">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white font-medium">
                    4
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-white mb-2">Risk Control</h3>
                    <p className="text-gray-400 leading-relaxed">
                      Leverage up to 50x with institutional-grade risk controls. Position sizes are calculated to prevent excessive drawdowns while optimizing returns.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </section>

        {/* Stats Section */}
        <section className="container-custom mb-24">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="p-6 rounded-xl border border-white/5 bg-white/[0.02] text-center"
            >
              <p className="text-3xl md:text-4xl font-display font-medium text-white mb-2">55-75%</p>
              <p className="text-gray-500 text-sm">Confidence Range</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="p-6 rounded-xl border border-white/5 bg-white/[0.02] text-center"
            >
              <p className="text-3xl md:text-4xl font-display font-medium text-white mb-2">0.6%</p>
              <p className="text-gray-500 text-sm">Trailing Stop Activation</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="p-6 rounded-xl border border-white/5 bg-white/[0.02] text-center"
            >
              <p className="text-3xl md:text-4xl font-display font-medium text-white mb-2">50x</p>
              <p className="text-gray-500 text-sm">Max Leverage</p>
            </motion.div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="p-6 rounded-xl border border-white/5 bg-white/[0.02] text-center"
            >
              <p className="text-3xl md:text-4xl font-display font-medium text-white mb-2">24/7</p>
              <p className="text-gray-500 text-sm">Market Monitoring</p>
            </motion.div>
          </div>
        </section>

        {/* Security Section */}
        <section className="container-custom mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="grid md:grid-cols-2 gap-8"
          >
            <div className="p-8 rounded-2xl border border-white/5 bg-white/[0.02]">
              <Shield className="text-white/60 mb-6" size={32} />
              <h3 className="text-2xl font-display font-medium text-white mb-4">Non-Custodial Architecture</h3>
              <p className="text-gray-400 leading-relaxed">
                Your funds remain in your own wallet or our audited smart contract vault. We never have access to your private keys. Trade with complete peace of mind.
              </p>
            </div>
            <div className="p-8 rounded-2xl border border-white/5 bg-white/[0.02]">
              <TrendingUp className="text-white/60 mb-6" size={32} />
              <h3 className="text-2xl font-display font-medium text-white mb-4">Transparent Performance</h3>
              <p className="text-gray-400 leading-relaxed">
                Track every trade in real-time. Full transparency on entries, exits, and P&L. No hidden fees, no surprises. Your success is our success.
              </p>
            </div>
          </motion.div>
        </section>

        {/* CTA Section */}
        <section className="container-custom">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mx-auto text-center"
          >
            <h2 className="text-3xl md:text-4xl font-display font-medium mb-6">
              Experience institutional-grade trading
            </h2>
            <p className="text-gray-400 text-lg mb-10">
              Join traders who leverage our quantitative algorithms for consistent, data-driven results. Start with as little as $50.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/register">
                <button className="px-5 py-2.5 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-100 transition-colors inline-flex items-center gap-2">
                  Get started
                  <ArrowRight size={14} />
                </button>
              </Link>
              <Link to="/pricing">
                <button className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors text-sm font-medium">
                  View pricing
                </button>
              </Link>
            </div>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12">
        <div className="container-custom">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <Logo size="sm" />
            <div className="flex items-center gap-8">
              <Link to="/about" className="text-gray-500 hover:text-white text-sm transition-colors">About</Link>
              <Link to="/technology" className="text-gray-500 hover:text-white text-sm transition-colors">Technology</Link>
              <Link to="/terms" className="text-gray-500 hover:text-white text-sm transition-colors">Terms</Link>
              <Link to="/privacy" className="text-gray-500 hover:text-white text-sm transition-colors">Privacy</Link>
            </div>
            <p className="text-gray-600 text-sm">&copy; 2026 Monadier. All rights reserved.</p>
          </div>
        </div>
      </footer>

      <CookieConsent />
    </div>
  );
};

export default TechnologyPage;
