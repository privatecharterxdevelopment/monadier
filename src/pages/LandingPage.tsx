import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Shield, Layers, Bot, Globe, Lock, Zap, Download, ChevronRight, TrendingUp, TrendingDown, Trophy, Crown, Rocket } from 'lucide-react';
import Logo from '../components/ui/Logo';
import CookieConsent from '../components/ui/CookieConsent';
import DownloadModal from '../components/ui/DownloadModal';
import MobileMenu from '../components/ui/MobileMenu';
import { useAuth } from '../contexts/AuthContext';

// Trade types and generators for live feed
interface Trade {
  id: string;
  amount: number;
  pair: string;
  type: 'buy' | 'sell';
  profit: number;
  date: Date;
  walletAddress: string;
  tier: 'starter' | 'pro' | 'elite';
}

const tradingPairs = ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'BNB/USDT', 'XRP/USDT', 'DOGE/USDT', 'AVAX/USDT', 'MATIC/USDT'];

const generateWalletAddress = (): string => {
  const chars = '0123456789abcdef';
  let address = '0x';
  for (let i = 0; i < 6; i++) address += chars[Math.floor(Math.random() * chars.length)];
  address += '...';
  for (let i = 0; i < 4; i++) address += chars[Math.floor(Math.random() * chars.length)];
  return address;
};

const generateTrade = (timeOffset: number = 0): Trade => {
  const tiers: ('starter' | 'pro' | 'elite')[] = ['starter', 'pro', 'elite'];
  const tier = tiers[Math.floor(Math.random() * tiers.length)];
  let maxAmount = tier === 'elite' ? 50000 : tier === 'pro' ? 10000 : 1000;
  const amount = Math.floor(Math.random() * (maxAmount - 50) + 50);
  // 50/50 chance of profit or loss, with varying percentages
  const isProfit = Math.random() > 0.45;
  const profitPercent = isProfit
    ? Math.random() * 12 + 1  // +1% to +13%
    : -(Math.random() * 10 + 1); // -1% to -11%
  return {
    id: Math.random().toString(36).substr(2, 9),
    amount,
    pair: tradingPairs[Math.floor(Math.random() * tradingPairs.length)],
    type: Math.random() > 0.5 ? 'buy' : 'sell',
    profit: amount * (profitPercent / 100),
    date: new Date(Date.now() - timeOffset),
    walletAddress: generateWalletAddress(),
    tier
  };
};

const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [liveTrades, setLiveTrades] = useState<Trade[]>([]);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

  // Initialize and update live trades
  useEffect(() => {
    // Generate 5 initial trades with times spread from just now to 15 minutes ago
    const timeOffsets = [0, 2 * 60000, 5 * 60000, 9 * 60000, 14 * 60000]; // 0, 2m, 5m, 9m, 14m ago
    const initialTrades: Trade[] = timeOffsets.map(offset => generateTrade(offset));
    setLiveTrades(initialTrades);

    const addNewTrade = () => {
      setLiveTrades(prev => [generateTrade(0), ...prev.slice(0, 4)]);
    };

    const scheduleNextTrade = () => {
      const delay = Math.floor(Math.random() * 15000) + 10000; // 10-25 seconds
      return setTimeout(() => {
        addNewTrade();
        timeoutId = scheduleNextTrade();
      }, delay);
    };

    let timeoutId = scheduleNextTrade();
    return () => clearTimeout(timeoutId);
  }, []);

  return (
    <div className="relative min-h-screen bg-background">
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

      {/* Hero Section */}
      <main>
        <section className="pt-32 pb-24 md:pt-40 md:pb-32">
          <div className="container-custom">
            <div className="max-w-4xl mx-auto text-center">
              <motion.h1
                className="text-4xl md:text-6xl lg:text-7xl font-display font-medium leading-[1.1] mb-8 tracking-tight"
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
              >
                The platform made for <span className="text-gray-500">decentralized trading</span>
              </motion.h1>

              <motion.p
                className="text-lg md:text-xl text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
              >
                Trade on the best DEXes across multiple chains. Non-custodial, secure, and fully automated. Your keys, your crypto.
              </motion.p>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="flex flex-col sm:flex-row gap-3 justify-center"
              >
                <Link to="/register">
                  <button className="px-5 py-2.5 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-100 transition-colors inline-flex items-center gap-2">
                    Trade now
                    <ArrowRight size={14} />
                  </button>
                </Link>
                <button
                  onClick={() => setShowDownloadModal(true)}
                  className="px-5 py-2.5 border border-white/20 rounded-full text-sm text-white hover:bg-white/5 transition-colors font-medium inline-flex items-center gap-2"
                >
                  <Download size={14} />
                  Download the app
                </button>
              </motion.div>

              {/* Powered by & Logo Carousel */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.6 }}
                className="mt-16"
              >
                <p className="text-gray-600 text-xs uppercase tracking-wider mb-6">Powered by Reown</p>
                <div className="relative overflow-hidden">
                  {/* Gradient masks */}
                  <div className="absolute left-0 top-0 bottom-0 w-16 bg-gradient-to-r from-background to-transparent z-10" />
                  <div className="absolute right-0 top-0 bottom-0 w-16 bg-gradient-to-l from-background to-transparent z-10" />

                  {/* Scrolling container */}
                  <div className="flex animate-scroll">
                    {[...Array(2)].map((_, setIndex) => (
                      <div key={setIndex} className="flex items-center gap-12 px-6">
                        {/* Ethereum */}
                        <div className="flex items-center gap-2 text-gray-500 whitespace-nowrap">
                          <svg className="w-5 h-5" viewBox="0 0 32 32" fill="currentColor">
                            <path d="M16 0l-0.2 0.7v21.2l0.2 0.2 9.8-5.8z"/>
                            <path d="M16 0l-9.8 16.3 9.8 5.8v-10.5z" fillOpacity="0.6"/>
                          </svg>
                          <span className="text-sm">Ethereum</span>
                        </div>
                        {/* BNB Chain */}
                        <div className="flex items-center gap-2 text-gray-500 whitespace-nowrap">
                          <svg className="w-5 h-5" viewBox="0 0 32 32" fill="currentColor">
                            <path d="M16 4l3 3-6 6-3-3zm0 24l-3-3 6-6 3 3zM4 16l3-3 6 6-3 3zm24 0l-3 3-6-6 3-3zM16 13l3 3-3 3-3-3z"/>
                          </svg>
                          <span className="text-sm">BNB Chain</span>
                        </div>
                        {/* Arbitrum */}
                        <div className="flex items-center gap-2 text-gray-500 whitespace-nowrap">
                          <svg className="w-5 h-5" viewBox="0 0 32 32" fill="currentColor">
                            <path d="M16 4L6 26h5l5-14 5 14h5L16 4z"/>
                          </svg>
                          <span className="text-sm">Arbitrum</span>
                        </div>
                        {/* Base */}
                        <div className="flex items-center gap-2 text-gray-500 whitespace-nowrap">
                          <svg className="w-5 h-5" viewBox="0 0 32 32" fill="currentColor">
                            <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2"/>
                          </svg>
                          <span className="text-sm">Base</span>
                        </div>
                        {/* Polygon */}
                        <div className="flex items-center gap-2 text-gray-500 whitespace-nowrap">
                          <svg className="w-5 h-5" viewBox="0 0 32 32" fill="currentColor">
                            <path d="M21 11l-5-3-5 3v6l5 3 5-3v-6z"/>
                          </svg>
                          <span className="text-sm">Polygon</span>
                        </div>
                        {/* MetaMask */}
                        <div className="flex items-center gap-2 text-gray-500 whitespace-nowrap">
                          <svg className="w-5 h-5" viewBox="0 0 32 32" fill="currentColor">
                            <path d="M26 5L17 11l2-4zM6 5l9 6.1L13 7zm18 16l-2.5 3.5 5.3 1.5 1.5-5zm-21 0l1.5 5 5.3-1.5L7 21z"/>
                          </svg>
                          <span className="text-sm">MetaMask</span>
                        </div>
                        {/* WalletConnect */}
                        <div className="flex items-center gap-2 text-gray-500 whitespace-nowrap">
                          <svg className="w-5 h-5" viewBox="0 0 32 32" fill="currentColor">
                            <path d="M9 13c3.9-3.5 10.2-3.5 14 0l.4.4-1.5 1.5-.6-.6c-2.7-2.6-7.1-2.6-9.8 0l-.7.6-1.5-1.5zm17.3 3.3l1.3 1.3-6 6-4.2-4.2-.2.2-4.2 4.2-6-6 1.3-1.3 4.2 4.2.2-.2 4.2-4.2 4.2 4.2z"/>
                          </svg>
                          <span className="text-sm">WalletConnect</span>
                        </div>
                        {/* Coinbase */}
                        <div className="flex items-center gap-2 text-gray-500 whitespace-nowrap">
                          <svg className="w-5 h-5" viewBox="0 0 32 32" fill="currentColor">
                            <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="2"/>
                            <rect x="12" y="12" width="8" height="8" rx="1"/>
                          </svg>
                          <span className="text-sm">Coinbase</span>
                        </div>
                        {/* Trust Wallet */}
                        <div className="flex items-center gap-2 text-gray-500 whitespace-nowrap">
                          <svg className="w-5 h-5" viewBox="0 0 32 32" fill="currentColor">
                            <path d="M16 4C10 4 6 8 6 8v10c0 6 10 10 10 10s10-4 10-10V8s-4-4-10-4zm0 3c4 0 7 3 7 3v8c0 4-7 7-7 7s-7-3-7-7v-8s3-3 7-3z"/>
                          </svg>
                          <span className="text-sm">Trust Wallet</span>
                        </div>
                        {/* Rainbow */}
                        <div className="flex items-center gap-2 text-gray-500 whitespace-nowrap">
                          <svg className="w-5 h-5" viewBox="0 0 32 32" fill="currentColor">
                            <path d="M16 6C10.5 6 6 10.5 6 16h4c0-3.3 2.7-6 6-6s6 2.7 6 6h4c0-5.5-4.5-10-10-10z"/>
                            <circle cx="16" cy="16" r="4"/>
                          </svg>
                          <span className="text-sm">Rainbow</span>
                        </div>
                        {/* Phantom */}
                        <div className="flex items-center gap-2 text-gray-500 whitespace-nowrap">
                          <svg className="w-5 h-5" viewBox="0 0 32 32" fill="currentColor">
                            <path d="M16 4c-6.6 0-12 5.4-12 12 0 5 3.1 9.3 7.5 11l.5-2c-3.4-1.3-5.8-4.6-5.8-8.5C6.2 10.8 10.5 6.5 16 6.5s9.8 4.3 9.8 9.5c0 3.9-2.4 7.2-5.8 8.5l.5 2c4.4-1.7 7.5-6 7.5-11 0-6.6-5.4-12-12-12z"/>
                          </svg>
                          <span className="text-sm">Phantom</span>
                        </div>
                        {/* Ledger */}
                        <div className="flex items-center gap-2 text-gray-500 whitespace-nowrap">
                          <svg className="w-5 h-5" viewBox="0 0 32 32" fill="currentColor">
                            <rect x="6" y="6" width="20" height="20" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/>
                            <rect x="10" y="14" width="12" height="8" rx="1"/>
                          </svg>
                          <span className="text-sm">Ledger</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Hero Image Section */}
        <section className="py-16 md:py-24">
          <div className="container-custom">
            <motion.div
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.8 }}
            >
              <div className="relative rounded-2xl overflow-hidden border border-white/10">
                <img
                  src="https://gbgafseabgqinnvlfslc.supabase.co/storage/v1/object/public/monadier/Whisk_2cc1bba852fc61397f5488e539afb124dr%202.png"
                  alt="Monadier Trading App"
                  className="w-full h-auto"
                />
                {/* Overlay title */}
                <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                  <h2 className="text-2xl md:text-4xl lg:text-5xl font-display font-medium text-white text-center px-8 max-w-4xl leading-tight">
                    Professional trading automation on any device
                  </h2>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Value Props Strip */}
        <section className="border-y border-white/5 bg-white/[0.02]">
          <div className="container-custom py-12">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5 }}
                className="text-center"
              >
                <p className="text-3xl md:text-4xl font-display font-medium text-white mb-2">5+</p>
                <p className="text-gray-500 text-sm">Networks Supported</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="text-center"
              >
                <p className="text-3xl md:text-4xl font-display font-medium text-white mb-2">0%</p>
                <p className="text-gray-500 text-sm">Platform Trading Fees</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="text-center"
              >
                <p className="text-3xl md:text-4xl font-display font-medium text-white mb-2">24/7</p>
                <p className="text-gray-500 text-sm">Automated Trading</p>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="py-24 md:py-32">
          <div className="container-custom">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="max-w-3xl mb-16"
            >
              <h2 className="text-3xl md:text-4xl font-display font-medium mb-6">
                Everything you need to trade decentralized
              </h2>
              <p className="text-gray-400 text-lg leading-relaxed">
                Connect your wallet and access the best decentralized exchanges. Full control, maximum security, zero custody.
              </p>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[
                {
                  icon: Lock,
                  title: 'Non-Custodial',
                  description: 'Trade directly from your own wallet. We never hold your funds or private keys.'
                },
                {
                  icon: Layers,
                  title: 'Multi-Chain',
                  description: 'Trade on Ethereum, BNB Chain, Arbitrum, Base, and Polygon with one account.'
                },
                {
                  icon: Bot,
                  title: 'Trading Bot',
                  description: 'Automated trading strategies including DCA, Grid, and custom conditions.'
                },
                {
                  icon: Globe,
                  title: 'Best DEX Rates',
                  description: 'Access liquidity from Uniswap V3 and PancakeSwap for optimal pricing.'
                },
                {
                  icon: Zap,
                  title: 'Instant Execution',
                  description: 'Fast trade execution directly on-chain with real-time price updates.'
                },
                {
                  icon: Shield,
                  title: 'Secure & Private',
                  description: 'No KYC required for trading. Full privacy and security by default.'
                }
              ].map((feature, index) => (
                <motion.div
                  key={feature.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="group p-8 rounded-2xl border border-white/5 hover:border-white/10 hover:bg-white/[0.02] transition-all"
                >
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-6 group-hover:bg-white/10 transition-colors">
                    <feature.icon className="text-white/60" size={24} />
                  </div>
                  <h3 className="text-lg font-medium text-white mb-3">{feature.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed">{feature.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Main Feature Cards */}
        <section className="py-24 md:py-32 border-t border-white/5">
          <div className="container-custom space-y-8">
            {/* Card 1 - Trading Bot */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="grid md:grid-cols-2 gap-8 p-8 md:p-12 rounded-3xl bg-white/[0.02] border border-white/5"
            >
              <div className="flex flex-col justify-center">
                <span className="text-xs text-gray-500 uppercase tracking-wider mb-4">Trading Bot</span>
                <h3 className="text-2xl md:text-3xl font-display font-medium text-white mb-4">
                  Automated strategies that work for you
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  Set up DCA, Grid trading, or custom conditions. Our bot executes trades 24/7 while you focus on what matters.
                </p>
              </div>
              <div className="rounded-2xl overflow-hidden min-h-[240px]">
                <img
                  src="https://gbgafseabgqinnvlfslc.supabase.co/storage/v1/object/public/monadier/Whisk_49bc0f8e9ef8439b32841d1191c54f4deg.png"
                  alt="Trading Bot"
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>

            {/* Card 2 - Multi-Chain */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="grid md:grid-cols-2 gap-8 p-8 md:p-12 rounded-3xl bg-white/[0.02] border border-white/5"
            >
              <div className="flex flex-col justify-center md:order-2">
                <span className="text-xs text-gray-500 uppercase tracking-wider mb-4">Multi-Chain</span>
                <h3 className="text-2xl md:text-3xl font-display font-medium text-white mb-4">
                  One platform, all networks
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  Seamlessly switch between Ethereum, BNB Chain, Arbitrum, Base, and Polygon. Same interface, unified experience.
                </p>
              </div>
              <div className="rounded-2xl overflow-hidden min-h-[240px] md:order-1">
                <img
                  src="https://gbgafseabgqinnvlfslc.supabase.co/storage/v1/object/public/monadier/Whisk_74d603d73d32effb3cf403768aa4a846eg.png"
                  alt="Multi-Chain Trading"
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>

            {/* Card 3 - Security */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="grid md:grid-cols-2 gap-8 p-8 md:p-12 rounded-3xl bg-white/[0.02] border border-white/5"
            >
              <div className="flex flex-col justify-center">
                <span className="text-xs text-gray-500 uppercase tracking-wider mb-4">Security</span>
                <h3 className="text-2xl md:text-3xl font-display font-medium text-white mb-4">
                  Your keys, your crypto
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  Non-custodial by design. We never have access to your funds. Trade directly from your own wallet with full control.
                </p>
              </div>
              <div className="rounded-2xl overflow-hidden min-h-[240px]">
                <img
                  src="https://gbgafseabgqinnvlfslc.supabase.co/storage/v1/object/public/monadier/Whisk_ca26e810ee17f758df54ab2a850f99a5eg.png"
                  alt="Security"
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>

            {/* Card 4 - Analytics */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.3 }}
              className="grid md:grid-cols-2 gap-8 p-8 md:p-12 rounded-3xl bg-white/[0.02] border border-white/5"
            >
              <div className="flex flex-col justify-center md:order-2">
                <span className="text-xs text-gray-500 uppercase tracking-wider mb-4">Analytics</span>
                <h3 className="text-2xl md:text-3xl font-display font-medium text-white mb-4">
                  Track performance in real-time
                </h3>
                <p className="text-gray-400 leading-relaxed">
                  Monitor your portfolio, track P&L, and analyze trading history. All the insights you need to make informed decisions.
                </p>
              </div>
              <div className="rounded-2xl overflow-hidden min-h-[240px] md:order-1">
                <img
                  src="https://gbgafseabgqinnvlfslc.supabase.co/storage/v1/object/public/monadier/Whisk_16bb15b3d8f1856af8c44a70aca0df7eeg.png"
                  alt="Analytics"
                  className="w-full h-full object-cover"
                />
              </div>
            </motion.div>
          </div>
        </section>

        {/* Networks Section */}
        <section className="py-24 md:py-32 border-t border-white/5">
          <div className="container-custom">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center mb-16"
            >
              <h2 className="text-3xl md:text-4xl font-display font-medium mb-6">
                Trade on leading networks
              </h2>
              <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                Access the most popular blockchain networks with seamless switching and unified interface.
              </p>
            </motion.div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { name: 'Ethereum', dex: 'Uniswap V3' },
                { name: 'BNB Chain', dex: 'PancakeSwap' },
                { name: 'Arbitrum', dex: 'Uniswap V3' },
                { name: 'Base', dex: 'Uniswap V3' },
                { name: 'Polygon', dex: 'Uniswap V3' }
              ].map((chain, index) => (
                <motion.div
                  key={chain.name}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="p-6 rounded-xl border border-white/5 hover:border-white/10 bg-white/[0.02] text-center transition-all"
                >
                  <p className="font-medium text-white mb-1">{chain.name}</p>
                  <p className="text-gray-500 text-xs">{chain.dex}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Live Top Performers Section */}
        <section className="py-24 md:py-32 border-t border-white/5">
          <div className="container-custom">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="text-center mb-12"
            >
              <div className="inline-flex items-center gap-2 mb-4">
                <Trophy className="w-5 h-5 text-white/60" />
                <span className="text-sm text-gray-400 uppercase tracking-wider">Live Feed</span>
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
              </div>
              <h2 className="text-3xl md:text-4xl font-display font-medium mb-4">
                Top performers right now
              </h2>
              <p className="text-gray-400 text-lg max-w-2xl mx-auto">
                See what our traders are achieving with automated strategies
              </p>
            </motion.div>

            {/* Trade Table */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="rounded-2xl border border-white/5 overflow-hidden bg-white/[0.02]"
            >
              {/* Table Header */}
              <div className="hidden md:grid grid-cols-6 gap-4 px-6 py-4 border-b border-white/5 text-sm font-medium text-gray-500">
                <div>Trade</div>
                <div>Amount</div>
                <div>Profit/Loss</div>
                <div>Tier</div>
                <div>Wallet</div>
                <div>Time</div>
              </div>

              {/* Table Body */}
              <div className="divide-y divide-white/5">
                <AnimatePresence mode="popLayout">
                  {liveTrades.map((trade, index) => {
                    const getTierIcon = (tier: string) => {
                      switch (tier) {
                        case 'starter': return <Zap className="w-3 h-3 text-blue-400" />;
                        case 'pro': return <Crown className="w-3 h-3 text-white" />;
                        case 'elite': return <Rocket className="w-3 h-3 text-amber-400" />;
                        default: return null;
                      }
                    };
                    const getTierColor = (tier: string) => {
                      switch (tier) {
                        case 'starter': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
                        case 'pro': return 'bg-white/5 text-white border-white/10';
                        case 'elite': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
                        default: return '';
                      }
                    };
                    const timeDiff = Date.now() - trade.date.getTime();
                    const timeAgo = timeDiff < 60000 ? 'Just now' : `${Math.floor(timeDiff / 60000)}m ago`;

                    return (
                      <motion.div
                        key={trade.id}
                        initial={index === 0 ? { opacity: 0, x: -20, backgroundColor: 'rgba(255, 255, 255, 0.05)' } : { opacity: 1 }}
                        animate={{ opacity: 1, x: 0, backgroundColor: 'transparent' }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ duration: 0.4 }}
                        className="grid grid-cols-2 md:grid-cols-6 gap-2 md:gap-4 px-4 md:px-6 py-4 hover:bg-white/[0.02] transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            trade.type === 'buy' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                          }`}>
                            {trade.type.toUpperCase()}
                          </span>
                          <span className="text-white font-medium text-sm">{trade.pair}</span>
                        </div>

                        <div className="text-white font-mono text-sm">
                          ${trade.amount.toLocaleString()}
                        </div>

                        <div className={`flex items-center gap-1 font-mono text-sm ${trade.profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {trade.profit >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {trade.profit >= 0 ? '+' : ''}${trade.profit.toFixed(2)}
                        </div>

                        <div className="hidden md:flex">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${getTierColor(trade.tier)}`}>
                            {getTierIcon(trade.tier)}
                            <span className="capitalize">{trade.tier}</span>
                          </span>
                        </div>

                        <div className="hidden md:block text-gray-500 font-mono text-sm">
                          {trade.walletAddress}
                        </div>

                        <div className="text-gray-500 text-sm text-right md:text-left">
                          {timeAgo}
                        </div>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </div>
            </motion.div>

            {/* Stats Row */}
            <div className="grid grid-cols-3 gap-4 mt-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="p-4 rounded-xl border border-white/5 bg-white/[0.02] text-center"
              >
                <p className="text-2xl font-display font-medium text-white">2,847</p>
                <p className="text-gray-500 text-sm">Active Traders</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.4 }}
                className="p-4 rounded-xl border border-white/5 bg-white/[0.02] text-center"
              >
                <p className="text-2xl font-display font-medium text-white">$4.2M</p>
                <p className="text-gray-500 text-sm">24h Volume</p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: 0.5 }}
                className="p-4 rounded-xl border border-white/5 bg-white/[0.02] text-center"
              >
                <p className="text-2xl font-display font-medium text-white">67.3%</p>
                <p className="text-gray-500 text-sm">Avg. Win Rate</p>
              </motion.div>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-24 md:py-32 border-t border-white/5">
          <div className="container-custom">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
              className="max-w-3xl mx-auto text-center"
            >
              <h2 className="text-3xl md:text-4xl font-display font-medium mb-6">
                Ready to start trading?
              </h2>
              <p className="text-gray-400 text-lg mb-10">
                Open your account in minutes and connect your wallet to start trading on decentralized exchanges.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link to="/register">
                  <button className="px-5 py-2.5 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-100 transition-colors inline-flex items-center gap-2">
                    Get started
                    <ChevronRight size={14} />
                  </button>
                </Link>
                <Link to="/about">
                  <button className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors text-sm font-medium">
                    Learn more about us
                  </button>
                </Link>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/5 py-12">
          <div className="container-custom">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <Logo size="sm" />
              <div className="flex items-center gap-8">
                <Link to="/about" className="text-gray-500 hover:text-white text-sm transition-colors">About</Link>
                <Link to="/terms" className="text-gray-500 hover:text-white text-sm transition-colors">Terms</Link>
                <Link to="/privacy" className="text-gray-500 hover:text-white text-sm transition-colors">Privacy</Link>
              </div>
              <p className="text-gray-600 text-sm">&copy; 2026 Monadier. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </main>

      {/* Cookie Consent */}
      <CookieConsent />

      {/* Download Modal */}
      <DownloadModal
        isOpen={showDownloadModal}
        onClose={() => setShowDownloadModal(false)}
      />
    </div>
  );
};

export default LandingPage;
