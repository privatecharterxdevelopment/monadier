import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Shield, Layers, Bot, Globe, Lock, Zap, Download, ChevronRight } from 'lucide-react';
import Logo from '../components/ui/Logo';
import CookieConsent from '../components/ui/CookieConsent';
import DownloadModal from '../components/ui/DownloadModal';
import MobileMenu from '../components/ui/MobileMenu';
import { useAuth } from '../contexts/AuthContext';

const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }
  }, [isAuthenticated, navigate]);

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
              <Link to="/card" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
                +DebitCard
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
