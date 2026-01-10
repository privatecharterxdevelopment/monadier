import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Bot, Zap, Shield, Clock, Settings, TrendingUp, ArrowRight, ChevronDown, Layers, RefreshCw, Target, Download } from 'lucide-react';
import Logo from '../components/ui/Logo';
import CookieConsent from '../components/ui/CookieConsent';
import DownloadModal from '../components/ui/DownloadModal';
import MobileMenu from '../components/ui/MobileMenu';

const BotTradingPage: React.FC = () => {
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const faqs = [
    {
      question: 'How does the trading bot work?',
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
              <Link to="/card" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
                +DebitCard
              </Link>
              <Link to="/trading-bot" className="text-white transition-colors text-sm font-medium">
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
              Automated <span className="text-gray-500">DEX trading</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed">
              Set your strategy, connect your wallet, and let the bot handle the rest. 24/7 automated trading on the best decentralized exchanges.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
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
                Professional trading automation made simple
              </h2>
            </div>
          </motion.div>
        </section>

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
              Three simple steps to automated trading
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Connect Wallet',
                description: 'Connect your MetaMask, WalletConnect, or any compatible wallet. Your keys stay with you.',
                icon: Shield
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
            ].map((item, index) => (
              <motion.div
                key={item.step}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="relative p-8 rounded-2xl border border-white/5 bg-white/[0.02]"
              >
                <span className="text-5xl font-display font-medium text-white/10 absolute top-6 right-6">
                  {item.step}
                </span>
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-6">
                  <item.icon className="text-white/60" size={24} />
                </div>
                <h3 className="text-xl font-medium text-white mb-3">{item.title}</h3>
                <p className="text-gray-500 leading-relaxed">{item.description}</p>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Strategies */}
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

        {/* Features */}
        <section className="container-custom mb-24">
          <div className="p-8 md:p-12 rounded-3xl bg-white/[0.02] border border-white/5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
              {[
                { icon: Clock, label: '24/7 Trading', value: 'Always On' },
                { icon: Zap, label: 'Execution Speed', value: '< 1 second' },
                { icon: Layers, label: 'Networks', value: '5 Chains' },
                { icon: Shield, label: 'Custody', value: 'Non-Custodial' }
              ].map((stat, index) => (
                <motion.div
                  key={stat.label}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="text-center"
                >
                  <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mx-auto mb-4">
                    <stat.icon className="text-white/60" size={24} />
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
                className="border border-white/5 rounded-xl overflow-hidden"
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
            className="max-w-3xl mx-auto text-center"
          >
            <h2 className="text-3xl md:text-4xl font-display font-medium mb-6">
              Ready to automate your trading?
            </h2>
            <p className="text-gray-400 text-lg mb-10">
              Create your account and start trading in minutes. No credit card required.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/register">
                <button className="px-5 py-2.5 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-100 transition-colors inline-flex items-center gap-2">
                  Get started
                  <ArrowRight size={14} />
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

export default BotTradingPage;
