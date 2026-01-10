import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  Bot,
  Zap,
  Shield,
  Clock,
  Settings,
  TrendingUp,
  ArrowRight,
  ChevronDown,
  Layers,
  RefreshCw,
  Target,
  Download,
  Wallet,
  Key,
  Monitor,
  BarChart3,
  Check,
  AlertCircle,
  Infinity
} from 'lucide-react';
import Logo from '../components/ui/Logo';
import CookieConsent from '../components/ui/CookieConsent';
import DownloadModal from '../components/ui/DownloadModal';
import MobileMenu from '../components/ui/MobileMenu';

type TradingMode = 'crypto' | 'mt5';

const BotTradingPage: React.FC = () => {
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [tradingMode, setTradingMode] = useState<TradingMode>('crypto');

  const cryptoSteps = [
    {
      step: '01',
      title: 'Connect Wallet',
      description: 'Connect your MetaMask, WalletConnect, or any compatible wallet. Your keys stay with you.',
      icon: Wallet
    },
    {
      step: '02',
      title: 'Configure Strategy',
      description: 'Choose DCA, Grid trading, or custom conditions. Set your parameters and risk levels.',
      icon: Settings
    },
    {
      step: '03',
      title: 'Activate Bot',
      description: 'Turn on the bot and let it execute trades automatically based on your strategy.',
      icon: Bot
    }
  ];

  const mt5Steps = [
    {
      step: '01',
      title: 'Purchase License',
      description: 'Choose between lifetime access ($199) or monthly subscription ($29/mo). Get your personal license key.',
      icon: Key
    },
    {
      step: '02',
      title: 'Install MetaTrader 5',
      description: 'Download and install MT5 from the official website. Available for Windows, Mac, and mobile.',
      icon: Monitor
    },
    {
      step: '03',
      title: 'Add Expert Advisor',
      description: 'Download our EA bot file and place it in your MT5 Experts folder. Enter your license key to activate.',
      icon: Download
    },
    {
      step: '04',
      title: 'Start Trading',
      description: 'Attach the EA to any forex chart, configure your strategy, and let it trade 24/5 automatically.',
      icon: BarChart3
    }
  ];

  const cryptoFaqs = [
    {
      question: 'How does the crypto trading bot work?',
      answer: 'Our bot connects to your wallet and monitors the markets 24/7. When your configured conditions are met (price targets, time intervals, etc.), it automatically executes trades on decentralized exchanges like Uniswap and PancakeSwap. You maintain full custody of your funds at all times.'
    },
    {
      question: 'Is my wallet safe?',
      answer: 'Absolutely. We never have access to your private keys. The bot only has permission to execute trades you\'ve pre-approved. Your wallet remains non-custodial, meaning you have complete control over your funds at all times.'
    },
    {
      question: 'What strategies can I use?',
      answer: 'We support DCA (Dollar Cost Averaging), Grid Trading, custom price-based conditions, and more. You can set stop-loss and take-profit levels, configure trading intervals, and create complex multi-condition strategies.'
    },
    {
      question: 'Which networks are supported?',
      answer: 'We support Ethereum, BNB Chain, Arbitrum, Base, and Polygon. You can trade on Uniswap V3 and PancakeSwap with the same interface across all networks.'
    },
    {
      question: 'What are the fees?',
      answer: 'Our platform charges no trading fees. You only pay the standard DEX swap fees and network gas costs. Subscription plans unlock additional features like unlimited trades and advanced strategies.'
    }
  ];

  const mt5Faqs = [
    {
      question: 'What is the MT5 Expert Advisor?',
      answer: 'Our MT5 EA (Expert Advisor) is a professional automated trading bot that runs on the MetaTrader 5 platform. It executes forex trades automatically based on proven strategies while you sleep.'
    },
    {
      question: 'What\'s the difference between monthly and lifetime plans?',
      answer: 'The monthly plan ($29/mo) includes all features but has a limit of 5 trades per day. The lifetime plan ($199 one-time) gives you unlimited trades forever with no recurring fees. Both include all strategies and free updates.'
    },
    {
      question: 'How does the license validation work?',
      answer: 'When you purchase, you receive a unique license key tied to your account. The EA validates your license on startup and periodically checks trade limits for monthly plans. Your license is valid on one MT5 account at a time.'
    },
    {
      question: 'Which forex pairs are supported?',
      answer: 'The EA works with all major forex pairs (EUR/USD, GBP/USD, USD/JPY, etc.), minor pairs, and even some exotic pairs. It\'s optimized for major pairs but can be configured for any instrument your broker supports.'
    },
    {
      question: 'Can I use it on a demo account first?',
      answer: 'Yes! Both plans work on demo accounts for testing. We recommend practicing on a demo account before trading with real funds. Demo trading doesn\'t count toward your daily trade limit.'
    }
  ];

  const faqs = tradingMode === 'crypto' ? cryptoFaqs : mt5Faqs;

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
              <Link to="/trading-bot" className="text-white transition-colors text-sm font-medium">
                Bot Trading
              </Link>
              <Link to="/forex" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
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
                  Trade now
                </button>
              </Link>
              <MobileMenu onDownloadClick={() => setShowDownloadModal(true)} />
            </div>
          </nav>
        </div>
      </header>

      <main className="pt-32 pb-24">
        {/* Hero Section with Mode Switcher */}
        <section className="container-custom mb-16">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="max-w-4xl mx-auto text-center"
          >
            {/* Mode Switcher */}
            <div className="inline-flex items-center p-1.5 bg-white/5 rounded-full border border-white/10 mb-10">
              <button
                onClick={() => setTradingMode('crypto')}
                className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all ${
                  tradingMode === 'crypto'
                    ? 'bg-white text-gray-900'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Wallet size={16} />
                  Crypto DEX
                </span>
              </button>
              <button
                onClick={() => setTradingMode('mt5')}
                className={`px-6 py-2.5 rounded-full text-sm font-medium transition-all ${
                  tradingMode === 'mt5'
                    ? 'bg-blue-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span className="flex items-center gap-2">
                  <BarChart3 size={16} />
                  Forex MT5
                </span>
              </button>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={tradingMode}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                {tradingMode === 'crypto' ? (
                  <>
                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-medium leading-[1.1] mb-8 tracking-tight">
                      Automated <span className="text-gray-500">DEX trading</span>
                    </h1>
                    <p className="text-lg md:text-xl text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed">
                      Set your strategy, connect your wallet, and let the bot handle the rest. 24/7 automated trading on the best decentralized exchanges.
                    </p>
                  </>
                ) : (
                  <>
                    <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-medium leading-[1.1] mb-8 tracking-tight">
                      Professional <span className="text-blue-400">Forex Trading</span>
                    </h1>
                    <p className="text-lg md:text-xl text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed">
                      Automate your forex trading with our MetaTrader 5 Expert Advisor. Proven strategies, risk management, and 24/5 execution.
                    </p>
                  </>
                )}
              </motion.div>
            </AnimatePresence>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {tradingMode === 'crypto' ? (
                <>
                  <Link to="/register">
                    <button className="px-5 py-2.5 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-100 transition-colors inline-flex items-center gap-2">
                      Start trading
                      <ArrowRight size={14} />
                    </button>
                  </Link>
                  <button
                    onClick={() => setShowDownloadModal(true)}
                    className="px-5 py-2.5 border border-white/20 rounded-full text-sm text-white hover:bg-white/5 transition-colors font-medium inline-flex items-center gap-2"
                  >
                    <Download size={14} />
                    Download app
                  </button>
                </>
              ) : (
                <>
                  <Link to="/forex">
                    <button className="px-5 py-2.5 bg-blue-500 hover:bg-blue-600 text-white rounded-full text-sm font-medium transition-colors inline-flex items-center gap-2">
                      Get MT5 Bot
                      <ArrowRight size={14} />
                    </button>
                  </Link>
                  <a
                    href="https://www.metatrader5.com/en/download"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-5 py-2.5 border border-white/20 rounded-full text-sm text-white hover:bg-white/5 transition-colors font-medium inline-flex items-center gap-2"
                  >
                    <Monitor size={14} />
                    Download MT5
                  </a>
                </>
              )}
            </div>
          </motion.div>
        </section>

        {/* Hero Image Section */}
        <section className="container-custom mb-24">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative rounded-3xl overflow-hidden border border-white/10"
          >
            <div className="aspect-[16/9] md:aspect-[21/9] bg-gradient-to-br from-white/5 to-transparent">
              <img
                src="https://gbgafseabgqinnvlfslc.supabase.co/storage/v1/object/public/monadier/Screenshot%202026-01-09%20at%2014.44.31.png"
                alt="Monadier Trading Bot Interface"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent flex items-center justify-center">
              <h2 className="text-2xl md:text-4xl lg:text-5xl font-display font-medium text-white text-center px-6 max-w-4xl">
                {tradingMode === 'crypto'
                  ? 'Professional trading automation made simple'
                  : 'MetaTrader 5 automation for professional traders'
                }
              </h2>
            </div>
          </motion.div>
        </section>

        {/* MT5 Pricing Section - Only show for MT5 mode */}
        {tradingMode === 'mt5' && (
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
                Flexible options for every trader
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              {/* Monthly Plan */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="relative p-8 rounded-2xl border border-white/10 bg-white/[0.02]"
              >
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                    <RefreshCw className="w-6 h-6 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white">Monthly</h3>
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
                    Full access to MT5 EA bot
                  </li>
                  <li className="flex items-center gap-3 text-gray-400">
                    <Check className="w-5 h-5 text-purple-400 flex-shrink-0" />
                    All trading strategies
                  </li>
                  <li className="flex items-center gap-3 text-gray-400">
                    <Check className="w-5 h-5 text-purple-400 flex-shrink-0" />
                    Regular updates included
                  </li>
                  <li className="flex items-center gap-3 text-yellow-400">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span>5 trades per day limit</span>
                  </li>
                  <li className="flex items-center gap-3 text-gray-400">
                    <Check className="w-5 h-5 text-purple-400 flex-shrink-0" />
                    Email support
                  </li>
                </ul>

                <Link to="/register?plan=forex-monthly">
                  <button className="w-full py-4 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/30 rounded-xl font-medium transition-colors">
                    Start Monthly Plan
                  </button>
                </Link>
              </motion.div>

              {/* Lifetime Plan */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="relative p-8 rounded-2xl border border-blue-500/30 bg-blue-500/5"
              >
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-blue-500 text-white text-xs font-medium rounded-full">
                  Best Value
                </div>

                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                    <Infinity className="w-6 h-6 text-blue-400" />
                  </div>
                  <div>
                    <h3 className="text-xl font-semibold text-white">Lifetime</h3>
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
                    Lifetime access to MT5 EA bot
                  </li>
                  <li className="flex items-center gap-3 text-gray-400">
                    <Check className="w-5 h-5 text-blue-400 flex-shrink-0" />
                    All trading strategies
                  </li>
                  <li className="flex items-center gap-3 text-gray-400">
                    <Check className="w-5 h-5 text-blue-400 flex-shrink-0" />
                    Free lifetime updates
                  </li>
                  <li className="flex items-center gap-3 text-green-400">
                    <Infinity className="w-5 h-5 flex-shrink-0" />
                    <span>Unlimited trades</span>
                  </li>
                  <li className="flex items-center gap-3 text-gray-400">
                    <Check className="w-5 h-5 text-blue-400 flex-shrink-0" />
                    Priority support
                  </li>
                </ul>

                <Link to="/register?plan=forex-lifetime">
                  <button className="w-full py-4 bg-blue-500 hover:bg-blue-600 text-white rounded-xl font-medium transition-colors">
                    Get Lifetime Access
                  </button>
                </Link>
              </motion.div>
            </div>

            {/* Trade Limit Info Box */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="max-w-2xl mx-auto mt-8 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl"
            >
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-yellow-400 font-medium mb-1">About Trade Limits</p>
                  <p className="text-gray-400 text-sm">
                    Monthly plans are limited to 5 trades per day to ensure fair usage. Your license is validated on each trade.
                    Demo account trades don't count toward this limit. Upgrade to lifetime for unlimited trading.
                  </p>
                </div>
              </div>
            </motion.div>
          </section>
        )}

        {/* How It Works */}
        <section className="container-custom mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-display font-medium mb-6">
              How it works
            </h2>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              {tradingMode === 'crypto'
                ? 'Three simple steps to automated crypto trading'
                : 'Four simple steps to automated forex trading'
              }
            </p>
          </motion.div>

          <AnimatePresence mode="wait">
            <motion.div
              key={tradingMode}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.3 }}
              className={`grid grid-cols-1 gap-8 ${
                tradingMode === 'crypto' ? 'md:grid-cols-3' : 'md:grid-cols-4'
              }`}
            >
              {(tradingMode === 'crypto' ? cryptoSteps : mt5Steps).map((item, index) => (
                <motion.div
                  key={item.step}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className={`relative p-8 rounded-2xl border bg-white/[0.02] ${
                    tradingMode === 'mt5' ? 'border-blue-500/20' : 'border-white/5'
                  }`}
                >
                  <span className="text-5xl font-display font-medium text-white/10 absolute top-6 right-6">
                    {item.step}
                  </span>
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-6 ${
                    tradingMode === 'mt5' ? 'bg-blue-500/10' : 'bg-white/5'
                  }`}>
                    <item.icon className={tradingMode === 'mt5' ? 'text-blue-400' : 'text-white/60'} size={24} />
                  </div>
                  <h3 className="text-xl font-medium text-white mb-3">{item.title}</h3>
                  <p className="text-gray-500 leading-relaxed">{item.description}</p>
                </motion.div>
              ))}
            </motion.div>
          </AnimatePresence>
        </section>

        {/* Strategies - Only show for Crypto mode */}
        {tradingMode === 'crypto' && (
          <section className="container-custom mb-24">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="max-w-3xl mb-16"
            >
              <h2 className="text-3xl md:text-4xl font-display font-medium mb-6">
                Trading strategies
              </h2>
              <p className="text-gray-400 text-lg leading-relaxed">
                Choose from proven strategies or create your own custom conditions.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  icon: RefreshCw,
                  title: 'DCA (Dollar Cost Averaging)',
                  description: 'Automatically buy at regular intervals to average your entry price over time. Reduce the impact of volatility.',
                  tag: 'Popular'
                },
                {
                  icon: Layers,
                  title: 'Grid Trading',
                  description: 'Place buy and sell orders at preset intervals. Profit from market fluctuations within a range.',
                  tag: 'Advanced'
                },
                {
                  icon: Target,
                  title: 'Price Conditions',
                  description: 'Set custom buy/sell triggers based on price levels. Execute when your targets are hit.',
                  tag: 'Flexible'
                },
                {
                  icon: TrendingUp,
                  title: 'Stop-Loss & Take-Profit',
                  description: 'Automatically exit positions when price reaches your profit target or loss limit.',
                  tag: 'Essential'
                }
              ].map((strategy, index) => (
                <motion.div
                  key={strategy.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="p-8 rounded-2xl border border-white/5 hover:border-white/10 hover:bg-white/[0.02] transition-all"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                      <strategy.icon className="text-white/60" size={24} />
                    </div>
                    <span className="px-3 py-1 bg-white/5 rounded-full text-xs text-gray-400">
                      {strategy.tag}
                    </span>
                  </div>
                  <h3 className="text-lg font-medium text-white mb-3">{strategy.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{strategy.description}</p>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* MT5 Strategies - Only show for MT5 mode */}
        {tradingMode === 'mt5' && (
          <section className="container-custom mb-24">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="max-w-3xl mb-16"
            >
              <h2 className="text-3xl md:text-4xl font-display font-medium mb-6">
                Forex Strategies Included
              </h2>
              <p className="text-gray-400 text-lg leading-relaxed">
                Professional strategies optimized for the forex market.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  icon: Zap,
                  title: 'Scalping',
                  description: 'Quick trades capturing small price movements. Multiple positions per day with tight stop-losses.',
                  tag: 'High Frequency'
                },
                {
                  icon: TrendingUp,
                  title: 'Trend Following',
                  description: 'Identify and ride market trends. Uses moving averages and momentum indicators.',
                  tag: 'Popular'
                },
                {
                  icon: Layers,
                  title: 'Grid Trading',
                  description: 'Place orders at fixed intervals above and below price. Profit from ranging markets.',
                  tag: 'Range Markets'
                },
                {
                  icon: Target,
                  title: 'Breakout Trading',
                  description: 'Enter positions when price breaks key support/resistance levels with momentum.',
                  tag: 'Momentum'
                }
              ].map((strategy, index) => (
                <motion.div
                  key={strategy.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="p-8 rounded-2xl border border-blue-500/20 hover:border-blue-500/30 bg-blue-500/5 hover:bg-blue-500/10 transition-all"
                >
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                      <strategy.icon className="text-blue-400" size={24} />
                    </div>
                    <span className="px-3 py-1 bg-blue-500/20 rounded-full text-xs text-blue-400">
                      {strategy.tag}
                    </span>
                  </div>
                  <h3 className="text-lg font-medium text-white mb-3">{strategy.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{strategy.description}</p>
                </motion.div>
              ))}
            </div>
          </section>
        )}

        {/* Features */}
        <section className="container-custom mb-24">
          <div className={`p-8 md:p-12 rounded-3xl border ${
            tradingMode === 'mt5' ? 'bg-blue-500/5 border-blue-500/20' : 'bg-white/[0.02] border-white/5'
          }`}>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {(tradingMode === 'crypto' ? [
                  { icon: Clock, label: '24/7 Trading', value: 'Always On' },
                  { icon: Zap, label: 'Execution Speed', value: '< 1 second' },
                  { icon: Layers, label: 'Networks', value: '5 Chains' },
                  { icon: Shield, label: 'Custody', value: 'Non-Custodial' }
                ] : [
                  { icon: Clock, label: 'Market Hours', value: '24/5' },
                  { icon: Zap, label: 'Execution', value: 'Instant' },
                  { icon: BarChart3, label: 'Pairs', value: '28+ Forex' },
                  { icon: Shield, label: 'Risk Mgmt', value: 'Built-in' }
                ]
              ).map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="text-center"
                >
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4 ${
                    tradingMode === 'mt5' ? 'bg-blue-500/20' : 'bg-white/5'
                  }`}>
                    <stat.icon className={tradingMode === 'mt5' ? 'text-blue-400' : 'text-white/60'} size={24} />
                  </div>
                  <p className="text-2xl font-display font-medium text-white mb-1">{stat.value}</p>
                  <p className="text-gray-500 text-sm">{stat.label}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="container-custom mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-display font-medium mb-6">
              Frequently asked questions
            </h2>
          </motion.div>

          <div className="max-w-3xl mx-auto space-y-4">
            {faqs.map((faq, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.05 }}
                className={`border rounded-xl overflow-hidden ${
                  tradingMode === 'mt5' ? 'border-blue-500/20' : 'border-white/5'
                }`}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full flex items-center justify-between p-6 text-left hover:bg-white/[0.02] transition-colors"
                >
                  <span className="font-medium text-white">{faq.question}</span>
                  <ChevronDown
                    size={20}
                    className={`text-gray-500 transition-transform ${openFaq === index ? 'rotate-180' : ''}`}
                  />
                </button>
                {openFaq === index && (
                  <div className="px-6 pb-6">
                    <p className="text-gray-400 leading-relaxed">{faq.answer}</p>
                  </div>
                )}
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
            className={`max-w-3xl mx-auto text-center p-12 rounded-3xl border ${
              tradingMode === 'mt5'
                ? 'bg-gradient-to-br from-blue-500/10 via-purple-500/5 to-transparent border-blue-500/20'
                : ''
            }`}
          >
            <h2 className="text-3xl md:text-4xl font-display font-medium mb-6">
              {tradingMode === 'crypto'
                ? 'Ready to automate your trading?'
                : 'Ready to automate your forex trading?'
              }
            </h2>
            <p className="text-gray-400 text-lg mb-10">
              {tradingMode === 'crypto'
                ? 'Create your account and start trading in minutes. No credit card required.'
                : 'Get your license and start trading with MT5 in minutes.'
              }
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              {tradingMode === 'crypto' ? (
                <Link to="/register">
                  <button className="px-5 py-2.5 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-100 transition-colors inline-flex items-center gap-2">
                    Get started
                    <ArrowRight size={14} />
                  </button>
                </Link>
              ) : (
                <>
                  <Link to="/forex">
                    <button className="px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white rounded-full text-sm font-medium transition-colors inline-flex items-center gap-2">
                      Get Lifetime - $199
                      <ArrowRight size={14} />
                    </button>
                  </Link>
                  <Link to="/register?plan=forex-monthly">
                    <button className="px-6 py-3 border border-white/20 hover:bg-white/5 text-white rounded-full text-sm font-medium transition-colors">
                      Monthly - $29/mo
                    </button>
                  </Link>
                </>
              )}
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
              <Link to="/forex" className="text-gray-500 hover:text-white text-sm transition-colors">Forex MT5</Link>
              <Link to="/support" className="text-gray-500 hover:text-white text-sm transition-colors">Support</Link>
            </div>
            <p className="text-gray-600 text-sm">&copy; 2026 Monadier. All rights reserved.</p>
          </div>
        </div>
      </footer>

      <CookieConsent />
      <DownloadModal isOpen={showDownloadModal} onClose={() => setShowDownloadModal(false)} />
    </div>
  );
};

export default BotTradingPage;
