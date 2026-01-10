import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Wallet, Settings, Bot, ArrowRight, CheckCircle, Download } from 'lucide-react';
import Logo from '../components/ui/Logo';
import CookieConsent from '../components/ui/CookieConsent';
import DownloadModal from '../components/ui/DownloadModal';
import MobileMenu from '../components/ui/MobileMenu';

const HowItWorksPage: React.FC = () => {
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  const steps = [
    {
      number: '01',
      icon: Wallet,
      title: 'Connect Your Wallet',
      description: 'Link your MetaMask, WalletConnect, or any compatible Web3 wallet. We support all major wallets and never have access to your private keys.',
      details: [
        'Non-custodial - you maintain full control',
        'Support for MetaMask, WalletConnect, Coinbase Wallet',
        'Connect in seconds with one click'
      ]
    },
    {
      number: '02',
      icon: Settings,
      title: 'Configure Your Strategy',
      description: 'Choose from proven trading strategies or create custom conditions. Set your parameters, risk levels, and trading pairs.',
      details: [
        'DCA, Grid Trading, and custom strategies',
        'Set stop-loss and take-profit levels',
        'Choose from 5 supported networks'
      ]
    },
    {
      number: '03',
      icon: Bot,
      title: 'Activate the Bot',
      description: 'Turn on automated trading and let the bot execute trades based on your strategy. Monitor performance in real-time.',
      details: [
        '24/7 automated execution',
        'Real-time notifications',
        'Pause or adjust anytime'
      ]
    },
    {
      number: '04',
      icon: TrendingUp,
      title: 'Track & Optimize',
      description: 'Monitor your portfolio performance, analyze trade history, and optimize your strategies based on results.',
      details: [
        'Detailed analytics dashboard',
        'P&L tracking per trade',
        'Export trade history'
      ]
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
              <Link to="/how-it-works" className="text-white transition-colors text-sm font-medium">
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
              How <span className="text-gray-500">Monadier</span> works
            </h1>
            <p className="text-lg md:text-xl text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed">
              From connecting your wallet to automated trading in minutes. Here's everything you need to know.
            </p>
          </motion.div>
        </section>

        {/* Steps */}
        <section className="container-custom mb-24">
          <div className="space-y-8">
            {steps.map((step, index) => (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="grid md:grid-cols-2 gap-8 p-8 md:p-12 rounded-3xl bg-white/[0.02] border border-white/5"
              >
                <div className={`flex flex-col justify-center ${index % 2 === 1 ? 'md:order-2' : ''}`}>
                  <div className="flex items-center gap-4 mb-6">
                    <span className="text-4xl font-display font-medium text-white/20">{step.number}</span>
                    <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center">
                      <step.icon className="text-white/60" size={24} />
                    </div>
                  </div>
                  <h3 className="text-2xl md:text-3xl font-display font-medium text-white mb-4">
                    {step.title}
                  </h3>
                  <p className="text-gray-400 leading-relaxed mb-6">
                    {step.description}
                  </p>
                  <ul className="space-y-3">
                    {step.details.map((detail, i) => (
                      <li key={i} className="flex items-center gap-3 text-gray-500 text-sm">
                        <CheckCircle size={16} className="text-white/40" />
                        {detail}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className={`flex items-center justify-center bg-white/5 rounded-2xl p-12 min-h-[280px] ${index % 2 === 1 ? 'md:order-1' : ''}`}>
                  <step.icon size={100} className="text-white/10" />
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Lifestyle Cards - 3 in a row with image overlay */}
        <section className="container-custom mb-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: 'No expertise needed',
                description: 'As easy as using a smartphone. Basic config, full control.',
                image: 'https://gbgafseabgqinnvlfslc.supabase.co/storage/v1/object/public/monadier/Whisk_2ae04f0ee31316d85fb4aac391681850dr.png'
              },
              {
                title: 'Focus on what matters',
                description: 'The bot trades while you enjoy time with family.',
                image: 'https://gbgafseabgqinnvlfslc.supabase.co/storage/v1/object/public/monadier/cute-emotional-grandfather-sitting-indoors-gazed-with-affection-his-cute-grandchild-hands-loving-cherished-time-spent-with-his-infant-grandson_176532-30614%20(1).avif'
              },
              {
                title: 'Trade while traveling',
                description: 'Stabilize finances remotely from anywhere in the world.',
                image: 'https://gbgafseabgqinnvlfslc.supabase.co/storage/v1/object/public/monadier/Whisk_8f7d9d31b5e186782df43bfb25e2f6c6dr.png'
              }
            ].map((card, index) => (
              <motion.div
                key={card.title}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className="relative rounded-2xl overflow-hidden border border-white/10 aspect-[3/4]"
              >
                <img
                  src={card.image}
                  alt={card.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <h3 className="text-xl font-display font-medium text-white mb-2">
                    {card.title}
                  </h3>
                  <p className="text-gray-300 text-sm leading-relaxed">
                    {card.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Supported Networks */}
        <section className="container-custom mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="p-8 md:p-12 rounded-3xl bg-white/[0.02] border border-white/5"
          >
            <h3 className="text-2xl font-display font-medium text-white mb-8 text-center">
              Supported Networks & DEXes
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {[
                { name: 'Ethereum', dex: 'Uniswap V3' },
                { name: 'BNB Chain', dex: 'PancakeSwap' },
                { name: 'Arbitrum', dex: 'Uniswap V3' },
                { name: 'Base', dex: 'Uniswap V3' },
                { name: 'Polygon', dex: 'Uniswap V3' }
              ].map((chain) => (
                <div
                  key={chain.name}
                  className="p-4 rounded-xl border border-white/5 bg-white/[0.02] text-center"
                >
                  <p className="font-medium text-white mb-1">{chain.name}</p>
                  <p className="text-gray-500 text-xs">{chain.dex}</p>
                </div>
              ))}
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
              Ready to start trading?
            </h2>
            <p className="text-gray-400 text-lg mb-10">
              Create your account, connect your wallet, and start automated trading in minutes.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/register">
                <button className="px-5 py-2.5 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-100 transition-colors inline-flex items-center gap-2">
                  Get started
                  <ArrowRight size={14} />
                </button>
              </Link>
              <Link to="/trading-bot">
                <button className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors text-sm font-medium">
                  Learn about strategies
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
              <Link to="/terms" className="text-gray-500 hover:text-white text-sm transition-colors">Terms</Link>
              <Link to="/privacy" className="text-gray-500 hover:text-white text-sm transition-colors">Privacy</Link>
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

export default HowItWorksPage;
