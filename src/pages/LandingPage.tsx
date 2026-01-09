import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Wallet, Shield, Layers, Coins, Bot, Globe, Lock, Zap, Download } from 'lucide-react';
import Button from '../components/ui/Button';
import Logo from '../components/ui/Logo';
import PhoneMockup from '../components/ui/PhoneMockup';
import CookieConsent from '../components/ui/CookieConsent';
import DownloadModal from '../components/ui/DownloadModal';
import { useAuth } from '../contexts/AuthContext';

const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  const mockupScreens = [
    '/dashboard-mockup.png',
    '/card-mockup.png',
    '/portfolio-mockup.png'
  ];

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/dashboard');
    }

    const interval = setInterval(() => {
      setCurrentImageIndex((prev) => (prev + 1) % mockupScreens.length);
    }, 3000);

    return () => clearInterval(interval);
  }, [isAuthenticated, navigate]);

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-background to-gray-900">
      {/* Header */}
      <header className="relative z-10 container-custom py-8">
        <nav className="flex justify-between items-center">
          <Logo size="md" />
          <div className="hidden md:flex items-center space-x-8">
            <Link to="/banking" className="text-secondary hover:text-primary transition-colors">Banking</Link>
            <Link to="/saving" className="text-secondary hover:text-primary transition-colors">Saving</Link>
            <Link to="/investing" className="text-secondary hover:text-primary transition-colors">Investing</Link>
            <Link to="/about" className="text-secondary hover:text-primary transition-colors">About</Link>
            <button
              onClick={() => setShowDownloadModal(true)}
              className="flex items-center gap-2 text-secondary hover:text-primary transition-colors"
            >
              <Download size={16} />
              Download
            </button>
            <Link to="/register">
              <Button variant="primary" size="md">Open an account</Button>
            </Link>
          </div>
        </nav>
      </header>
      
      {/* Hero Section */}
      <main className="relative z-10">
        <div className="container-custom grid md:grid-cols-2 gap-12 items-center min-h-[calc(100vh-120px)]">
          <div>
            <motion.h1
              className="text-4xl md:text-7xl font-display font-medium leading-tight mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8 }}
            >
              Decentralized Trading for Everyone
            </motion.h1>

            <motion.p
              className="text-xl text-secondary mb-12 max-w-xl"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.3 }}
            >
              Trade on the best DEXes across multiple chains. Non-custodial, secure, and fully decentralized. Your keys, your crypto.
            </motion.p>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.6 }}
              className="flex gap-4 flex-wrap"
            >
              <Link to="/register">
                <Button variant="primary" size="lg">
                  Get started
                  <ArrowRight size={20} className="ml-2" />
                </Button>
              </Link>
              <Link to="/about">
                <Button variant="secondary" size="lg">
                  Learn more
                </Button>
              </Link>
            </motion.div>

            {/* Quick Features */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.8, delay: 0.9 }}
              className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8"
            >
              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                  <Lock className="text-accent" size={24} />
                </div>
                <div>
                  <h3 className="font-medium">Non-Custodial</h3>
                  <p className="text-secondary text-sm">Your wallet, your funds</p>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                  <Layers className="text-accent" size={24} />
                </div>
                <div>
                  <h3 className="font-medium">Multi-Chain</h3>
                  <p className="text-secondary text-sm">5 networks supported</p>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center">
                  <Bot className="text-accent" size={24} />
                </div>
                <div>
                  <h3 className="font-medium">Trading Bot</h3>
                  <p className="text-secondary text-sm">Automated DEX trading</p>
                </div>
              </div>
            </motion.div>
          </div>
          
          <div className="relative flex justify-center items-center">
            <PhoneMockup>
              <motion.div
                key={currentImageIndex}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.5 }}
                className="h-full w-full"
              >
                <img
                  src={mockupScreens[currentImageIndex]}
                  alt="App interface"
                  className="h-full w-full object-cover"
                />
              </motion.div>
            </PhoneMockup>
          </div>
        </div>

        {/* Features Section */}
        <div className="container-custom py-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-5xl font-display font-medium mb-4">
              Fully Decentralized Trading
            </h2>
            <p className="text-xl text-secondary max-w-2xl mx-auto">
              Trade directly from your wallet on the best DEXes. No deposits, no custody, full control.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="bg-[#141414] border border-gray-800/50 rounded-2xl p-8 hover:border-white/20 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                <Wallet className="text-white/70" size={24} />
              </div>
              <h3 className="text-lg font-medium text-white mb-3 tracking-wide">Non-Custodial</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Trade directly from your own wallet. We never hold your funds. Your keys, your crypto, always.
              </p>
            </motion.div>

            {/* Feature 2 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-[#141414] border border-gray-800/50 rounded-2xl p-8 hover:border-white/20 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                <Layers className="text-white/70" size={24} />
              </div>
              <h3 className="text-lg font-medium text-white mb-3 tracking-wide">Multi-Chain</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Trade on Ethereum, BNB Chain, Arbitrum, Base, and Polygon. Switch networks instantly.
              </p>
            </motion.div>

            {/* Feature 3 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="bg-[#141414] border border-gray-800/50 rounded-2xl p-8 hover:border-white/20 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                <Globe className="text-white/70" size={24} />
              </div>
              <h3 className="text-lg font-medium text-white mb-3 tracking-wide">Live Balances</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                See your actual token balances fetched directly from the blockchain. Real-time and accurate.
              </p>
            </motion.div>

            {/* Feature 4 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="bg-[#141414] border border-gray-800/50 rounded-2xl p-8 hover:border-white/20 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                <Zap className="text-white/70" size={24} />
              </div>
              <h3 className="text-lg font-medium text-white mb-3 tracking-wide">DEX Integration</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Trade on Uniswap V3 and PancakeSwap. Best prices and liquidity from top decentralized exchanges.
              </p>
            </motion.div>

            {/* Feature 5 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="bg-[#141414] border border-gray-800/50 rounded-2xl p-8 hover:border-white/20 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                <Coins className="text-white/70" size={24} />
              </div>
              <h3 className="text-lg font-medium text-white mb-3 tracking-wide">Crypto Payments</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Pay for subscriptions with USDT or USDC directly from your wallet. No credit cards needed.
              </p>
            </motion.div>

            {/* Feature 6 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.6 }}
              className="bg-[#141414] border border-gray-800/50 rounded-2xl p-8 hover:border-white/20 transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
                <Shield className="text-white/70" size={24} />
              </div>
              <h3 className="text-lg font-medium text-white mb-3 tracking-wide">Secure & Private</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                No KYC for trading. Connect your wallet and start trading immediately. Full privacy.
              </p>
            </motion.div>
          </div>

          {/* Supported Chains */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="mt-24 text-center"
          >
            <p className="text-gray-600 mb-8 text-sm tracking-wide">SUPPORTED NETWORKS</p>
            <div className="flex flex-wrap justify-center gap-4">
              {['Ethereum', 'BNB Chain', 'Arbitrum', 'Base', 'Polygon'].map((chain) => (
                <div
                  key={chain}
                  className="px-5 py-2.5 rounded-full border border-white/10 bg-white/5 text-white/60 text-sm font-medium"
                >
                  {chain}
                </div>
              ))}
            </div>
          </motion.div>

          {/* CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="mt-24 text-center"
          >
            <h3 className="text-2xl md:text-3xl font-display font-medium mb-6">
              Ready to trade decentralized?
            </h3>
            <Link to="/register">
              <Button variant="primary" size="lg">
                Get Started
                <ArrowRight size={20} className="ml-2" />
              </Button>
            </Link>
          </motion.div>
        </div>
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