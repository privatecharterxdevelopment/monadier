import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  BarChart3,
  Download,
  ArrowRight,
  Check,
  Shield,
  Zap,
  Clock,
  TrendingUp,
  Monitor,
  Key,
  RefreshCw,
  Infinity
} from 'lucide-react';
import Logo from '../components/ui/Logo';
import CookieConsent from '../components/ui/CookieConsent';
import DownloadModal from '../components/ui/DownloadModal';
import MobileMenu from '../components/ui/MobileMenu';

const ForexPage: React.FC = () => {
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<'lifetime' | 'monthly'>('lifetime');

  const features = [
    {
      icon: Monitor,
      title: 'MetaTrader 5 Integration',
      description: 'Seamlessly works with MT5 platform on Windows, Mac, and mobile devices.'
    },
    {
      icon: Zap,
      title: 'Automated Trading',
      description: 'Set your strategy once and let the bot execute trades 24/5 while you sleep.'
    },
    {
      icon: Shield,
      title: 'Risk Management',
      description: 'Built-in stop-loss, take-profit, and position sizing to protect your capital.'
    },
    {
      icon: TrendingUp,
      title: 'Multiple Strategies',
      description: 'Scalping, swing trading, trend following, and grid strategies included.'
    },
    {
      icon: Clock,
      title: '24/5 Operation',
      description: 'Trades automatically during all forex market hours without manual intervention.'
    },
    {
      icon: RefreshCw,
      title: 'Free Updates',
      description: 'Receive all future updates and improvements at no additional cost.'
    }
  ];

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
              <Link to="/forex" className="text-white transition-colors text-sm font-medium">
                Forex MT5
              </Link>
              <Link to="/about" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
                About
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => setShowDownloadModal(true)}
                className="hidden md:flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm font-medium"
              >
                <Download size={16} />
                Download
              </button>
              <Link to="/login" className="hidden md:block text-gray-400 hover:text-white transition-colors text-sm font-medium">
                Sign in
              </Link>
              <Link to="/register" className="hidden md:block">
                <button className="px-4 py-2 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-100 transition-colors">
                  Get Started
                </button>
              </Link>
              <MobileMenu onDownloadClick={() => setShowDownloadModal(true)} />
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
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-sm font-medium mb-8">
              <BarChart3 size={16} />
              MetaTrader 5 Expert Advisor
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-medium leading-[1.1] mb-8 tracking-tight">
              Professional <span className="text-blue-400">Forex Trading</span> Bot
            </h1>
            <p className="text-lg md:text-xl text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed">
              Automate your forex trading with our MetaTrader 5 Expert Advisor. Proven strategies, risk management, and 24/5 automated execution.
            </p>
          </motion.div>
        </section>

        {/* Pricing Section */}
        <section className="container-custom mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-display font-medium mb-4">
              Choose Your Plan
            </h2>
            <p className="text-gray-400 text-lg">
              One-time purchase or flexible monthly subscription
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Lifetime Plan */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              onClick={() => setSelectedPlan('lifetime')}
              className={`relative p-8 rounded-2xl border cursor-pointer transition-all ${
                selectedPlan === 'lifetime'
                  ? 'border-blue-500 bg-blue-500/5'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/20'
              }`}
            >
              {selectedPlan === 'lifetime' && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-500 text-white text-xs font-medium rounded-full">
                  Best Value
                </div>
              )}
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <Infinity className="w-6 h-6 text-blue-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">Lifetime License</h3>
                  <p className="text-gray-500 text-sm">One-time payment</p>
                </div>
              </div>

              <div className="mb-6">
                <span className="text-5xl font-display font-medium text-white">$199</span>
                <span className="text-gray-500 ml-2">USD</span>
              </div>

              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-3 text-gray-400">
                  <Check className="w-5 h-5 text-blue-400 flex-shrink-0" />
                  Lifetime access to MT5 bot
                </li>
                <li className="flex items-center gap-3 text-gray-400">
                  <Check className="w-5 h-5 text-blue-400 flex-shrink-0" />
                  All trading strategies included
                </li>
                <li className="flex items-center gap-3 text-gray-400">
                  <Check className="w-5 h-5 text-blue-400 flex-shrink-0" />
                  Free lifetime updates
                </li>
                <li className="flex items-center gap-3 text-gray-400">
                  <Check className="w-5 h-5 text-blue-400 flex-shrink-0" />
                  Personal license key
                </li>
                <li className="flex items-center gap-3 text-gray-400">
                  <Check className="w-5 h-5 text-blue-400 flex-shrink-0" />
                  Priority support
                </li>
              </ul>

              <Link to="/register?plan=forex-lifetime">
                <button className={`w-full py-4 rounded-xl font-medium transition-colors ${
                  selectedPlan === 'lifetime'
                    ? 'bg-blue-500 hover:bg-blue-600 text-white'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}>
                  Get Lifetime Access
                </button>
              </Link>
            </motion.div>

            {/* Monthly Plan */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              onClick={() => setSelectedPlan('monthly')}
              className={`relative p-8 rounded-2xl border cursor-pointer transition-all ${
                selectedPlan === 'monthly'
                  ? 'border-blue-500 bg-blue-500/5'
                  : 'border-white/10 bg-white/[0.02] hover:border-white/20'
              }`}
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                  <RefreshCw className="w-6 h-6 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-white">Monthly Subscription</h3>
                  <p className="text-gray-500 text-sm">Cancel anytime</p>
                </div>
              </div>

              <div className="mb-6">
                <span className="text-5xl font-display font-medium text-white">$29</span>
                <span className="text-gray-500 ml-2">/month</span>
              </div>

              <ul className="space-y-3 mb-8">
                <li className="flex items-center gap-3 text-gray-400">
                  <Check className="w-5 h-5 text-purple-400 flex-shrink-0" />
                  Full access to MT5 bot
                </li>
                <li className="flex items-center gap-3 text-gray-400">
                  <Check className="w-5 h-5 text-purple-400 flex-shrink-0" />
                  All trading strategies included
                </li>
                <li className="flex items-center gap-3 text-gray-400">
                  <Check className="w-5 h-5 text-purple-400 flex-shrink-0" />
                  Regular updates
                </li>
                <li className="flex items-center gap-3 text-gray-400">
                  <Check className="w-5 h-5 text-purple-400 flex-shrink-0" />
                  Personal license key
                </li>
                <li className="flex items-center gap-3 text-gray-400">
                  <Check className="w-5 h-5 text-purple-400 flex-shrink-0" />
                  Cancel anytime, no commitment
                </li>
              </ul>

              <Link to="/register?plan=forex-monthly">
                <button className={`w-full py-4 rounded-xl font-medium transition-colors ${
                  selectedPlan === 'monthly'
                    ? 'bg-purple-500 hover:bg-purple-600 text-white'
                    : 'bg-white/10 hover:bg-white/20 text-white'
                }`}>
                  Start Monthly Plan
                </button>
              </Link>
            </motion.div>
          </div>

          <p className="text-center text-gray-500 text-sm mt-8">
            All plans include a 14-day money-back guarantee. No questions asked.
          </p>
        </section>

        {/* Features Grid */}
        <section className="container-custom mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-display font-medium mb-4">
              Everything You Need
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Professional forex trading automation with enterprise-grade features
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="p-6 rounded-2xl border border-white/5 bg-white/[0.02] hover:border-white/10 transition-colors"
              >
                <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center mb-4">
                  <feature.icon className="w-6 h-6 text-blue-400" />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">{feature.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{feature.description}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* How to Get Started */}
        <section className="container-custom mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-display font-medium mb-4">
              Get Started in Minutes
            </h2>
            <p className="text-gray-400 text-lg">
              Simple setup process to start automated forex trading
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              { step: '01', title: 'Purchase', description: 'Choose your plan and complete payment' },
              { step: '02', title: 'Download', description: 'Get MT5 and the Monadier EA bot file' },
              { step: '03', title: 'Install', description: 'Add the EA to your MT5 Experts folder' },
              { step: '04', title: 'Activate', description: 'Enter your license key and start trading' }
            ].map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative p-6 rounded-2xl border border-white/5 bg-white/[0.02]"
              >
                <span className="text-4xl font-display font-medium text-white/10">
                  {item.step}
                </span>
                <h3 className="text-lg font-medium text-white mt-4 mb-2">{item.title}</h3>
                <p className="text-gray-500 text-sm">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* CTA Section */}
        <section className="container-custom">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="relative p-12 md:p-16 rounded-3xl bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-transparent border border-blue-500/20 text-center overflow-hidden"
          >
            <div className="absolute top-0 right-0 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl font-display font-medium mb-4">
                Ready to Automate Your Forex Trading?
              </h2>
              <p className="text-gray-400 text-lg mb-8 max-w-2xl mx-auto">
                Join thousands of traders using Monadier MT5 bot for consistent, automated forex trading.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Link to="/register?plan=forex-lifetime">
                  <button className="px-8 py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-full font-medium transition-colors inline-flex items-center gap-2">
                    Get Lifetime Access - $199
                    <ArrowRight size={18} />
                  </button>
                </Link>
                <Link to="/register?plan=forex-monthly">
                  <button className="px-8 py-4 border border-white/20 hover:bg-white/5 text-white rounded-full font-medium transition-colors">
                    Start Monthly - $29/mo
                  </button>
                </Link>
              </div>
            </div>
          </motion.div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/5 py-12 mt-24">
        <div className="container-custom">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <Logo size="sm" />
            <div className="flex items-center gap-8">
              <Link to="/how-it-works" className="text-gray-500 hover:text-white transition-colors text-sm">
                How it works
              </Link>
              <Link to="/trading-bot" className="text-gray-500 hover:text-white transition-colors text-sm">
                Bot Trading
              </Link>
              <Link to="/about" className="text-gray-500 hover:text-white transition-colors text-sm">
                About
              </Link>
              <Link to="/support" className="text-gray-500 hover:text-white transition-colors text-sm">
                Support
              </Link>
            </div>
            <p className="text-gray-600 text-sm">
              &copy; {new Date().getFullYear()} Monadier. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      <CookieConsent />
      <DownloadModal isOpen={showDownloadModal} onClose={() => setShowDownloadModal(false)} />
    </div>
  );
};

export default ForexPage;
