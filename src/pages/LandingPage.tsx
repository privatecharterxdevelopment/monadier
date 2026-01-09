import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowRight, Wallet, Shield, Layers, Coins, Bot, Globe, Lock, Zap } from 'lucide-react';
import Button from '../components/ui/Button';
import Logo from '../components/ui/Logo';
import PhoneMockup from '../components/ui/PhoneMockup';
import CookieConsent from '../components/ui/CookieConsent';
import { useAuth } from '../contexts/AuthContext';

const LandingPage: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

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
                <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
                  <Lock className="text-accent" size={24} />
                </div>
                <div>
                  <h3 className="font-medium">Non-Custodial</h3>
                  <p className="text-secondary text-sm">Your wallet, your funds</p>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
                  <Layers className="text-accent" size={24} />
                </div>
                <div>
                  <h3 className="font-medium">Multi-Chain</h3>
                  <p className="text-secondary text-sm">5 networks supported</p>
                </div>
              </div>

              <div className="flex items-center space-x-4">
                <div className="w-12 h-12 rounded-full bg-accent/20 flex items-center justify-center">
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
              className="bg-card-dark border border-gray-800 rounded-2xl p-8 hover:border-accent/50 transition-colors"
            >
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center mb-6">
                <Wallet className="text-white" size={28} />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Non-Custodial</h3>
              <p className="text-gray-400">
                Trade directly from your own wallet. We never hold your funds. Your keys, your crypto, always.
              </p>
            </motion.div>

            {/* Feature 2 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="bg-card-dark border border-gray-800 rounded-2xl p-8 hover:border-accent/50 transition-colors"
            >
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 flex items-center justify-center mb-6">
                <Layers className="text-white" size={28} />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Multi-Chain Support</h3>
              <p className="text-gray-400">
                Trade on Ethereum, BNB Chain, Arbitrum, Base, and Polygon. Switch networks instantly.
              </p>
            </motion.div>

            {/* Feature 3 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.3 }}
              className="bg-card-dark border border-gray-800 rounded-2xl p-8 hover:border-accent/50 transition-colors"
            >
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-green-500 to-green-600 flex items-center justify-center mb-6">
                <Globe className="text-white" size={28} />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Real Blockchain Balances</h3>
              <p className="text-gray-400">
                See your actual token balances fetched directly from the blockchain. Real-time and accurate.
              </p>
            </motion.div>

            {/* Feature 4 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.4 }}
              className="bg-card-dark border border-gray-800 rounded-2xl p-8 hover:border-accent/50 transition-colors"
            >
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center mb-6">
                <Zap className="text-white" size={28} />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">DEX Integration</h3>
              <p className="text-gray-400">
                Trade on Uniswap V3 and PancakeSwap. Best prices and liquidity from top decentralized exchanges.
              </p>
            </motion.div>

            {/* Feature 5 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.5 }}
              className="bg-card-dark border border-gray-800 rounded-2xl p-8 hover:border-accent/50 transition-colors"
            >
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-pink-500 to-pink-600 flex items-center justify-center mb-6">
                <Coins className="text-white" size={28} />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Crypto Payments</h3>
              <p className="text-gray-400">
                Pay for subscriptions with USDT or USDC directly from your wallet. No credit cards needed.
              </p>
            </motion.div>

            {/* Feature 6 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.6 }}
              className="bg-card-dark border border-gray-800 rounded-2xl p-8 hover:border-accent/50 transition-colors"
            >
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center mb-6">
                <Shield className="text-white" size={28} />
              </div>
              <h3 className="text-xl font-semibold text-white mb-3">Secure & Private</h3>
              <p className="text-gray-400">
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
            <p className="text-gray-500 mb-8">Supported Networks</p>
            <div className="flex flex-wrap justify-center gap-6">
              {[
                { name: 'Ethereum', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
                { name: 'BNB Chain', color: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30' },
                { name: 'Arbitrum', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
                { name: 'Base', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
                { name: 'Polygon', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30' }
              ].map((chain) => (
                <div
                  key={chain.name}
                  className={`px-6 py-3 rounded-full border ${chain.color} font-medium`}
                >
                  {chain.name}
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
    </div>
  );
};

export default LandingPage;