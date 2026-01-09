import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { CreditCard, Banknote, ArrowRight, Globe, Wallet, Shield } from 'lucide-react';
import Logo from '../components/ui/Logo';
import Button from '../components/ui/Button';
import CookieConsent from '../components/ui/CookieConsent';

const BankingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-gray-900">
      <header className="relative z-10 container-custom py-8">
        <nav className="flex justify-between items-center">
          <Logo size="md" />
          <div className="hidden md:flex items-center space-x-8">
            <Link to="/banking" className="text-white hover:text-primary transition-colors">Banking</Link>
            <Link to="/saving" className="text-secondary hover:text-primary transition-colors">Saving</Link>
            <Link to="/investing" className="text-secondary hover:text-primary transition-colors">Investing</Link>
            <Link to="/about" className="text-secondary hover:text-primary transition-colors">About</Link>
            <Link to="/register">
              <Button variant="primary" size="md">Open an account</Button>
            </Link>
          </div>
        </nav>
      </header>

      <main className="container-custom py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="max-w-4xl"
        >
          <h1 className="text-4xl md:text-6xl font-display mb-8">Smart banking for modern life</h1>
          <p className="text-xl text-secondary mb-12">
            Experience banking that adapts to your lifestyle. Instant payments, global spending, and real-time insights all in one place.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-20">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="bg-card-dark p-8 rounded-2xl border border-gray-800"
          >
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-6">
              <CreditCard className="text-white" size={24} />
            </div>
            <h2 className="text-2xl font-display mb-4">Premium Metal Card</h2>
            <ul className="space-y-4 mb-8 text-secondary">
              <li className="flex items-center">
                <Globe size={20} className="mr-3" />
                Fee-free global spending
              </li>
              <li className="flex items-center">
                <Wallet size={20} className="mr-3" />
                Up to 5% cashback
              </li>
              <li className="flex items-center">
                <Shield size={20} className="mr-3" />
                Advanced fraud protection
              </li>
            </ul>
            <Link to="/register">
              <Button variant="primary">
                Get your card
                <ArrowRight size={20} className="ml-2" />
              </Button>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.4 }}
            className="bg-card-dark p-8 rounded-2xl border border-gray-800"
          >
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-6">
              <Banknote className="text-white" size={24} />
            </div>
            <h2 className="text-2xl font-display mb-4">Smart Current Account</h2>
            <ul className="space-y-4 mb-8 text-secondary">
              <li className="flex items-center">
                <Globe size={20} className="mr-3" />
                Multi-currency accounts
              </li>
              <li className="flex items-center">
                <Wallet size={20} className="mr-3" />
                Instant payments worldwide
              </li>
              <li className="flex items-center">
                <Shield size={20} className="mr-3" />
                Advanced analytics
              </li>
            </ul>
            <Link to="/register">
              <Button variant="primary">
                Open account
                <ArrowRight size={20} className="ml-2" />
              </Button>
            </Link>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
          className="bg-card-dark p-12 rounded-2xl border border-gray-800 text-center"
        >
          <h2 className="text-3xl font-display mb-6">Ready to get started?</h2>
          <p className="text-secondary mb-8 max-w-2xl mx-auto">
            Join thousands of people who've already discovered a better way to bank. Open your account in minutes.
          </p>
          <Link to="/register">
            <Button variant="primary" size="lg">
              Open your account
              <ArrowRight size={20} className="ml-2" />
            </Button>
          </Link>
        </motion.div>
      </main>

      <CookieConsent />
    </div>
  );
};

export default BankingPage;