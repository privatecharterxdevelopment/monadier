import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { CreditCard, Globe, Shield, Smartphone, Bell, ArrowRight, Lock, Sparkles } from 'lucide-react';
import Logo from '../components/ui/Logo';
import CookieConsent from '../components/ui/CookieConsent';
import MobileMenu from '../components/ui/MobileMenu';

const CardPage: React.FC = () => {
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
              <Link to="/card" className="text-white transition-colors text-sm font-medium">
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
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10 mb-8">
              <Sparkles size={16} className="text-white/60" />
              <span className="text-sm text-gray-400">Coming Soon</span>
            </div>
            <h1 className="text-4xl md:text-6xl lg:text-7xl font-display font-medium leading-[1.1] mb-8 tracking-tight">
              +DebitCard <span className="text-gray-500">by Monadier</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed">
              Control your spending and track your income wherever you go. A premium debit card powered by Stripe, designed for the modern trader.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/register">
                <button className="px-5 py-2.5 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-100 transition-colors inline-flex items-center gap-2">
                  Join the waitlist
                  <ArrowRight size={14} />
                </button>
              </Link>
            </div>
          </motion.div>
        </section>

        {/* Card Preview */}
        <section className="container-custom mb-24">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.8 }}
            className="relative rounded-3xl overflow-hidden border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-12 md:p-20"
          >
            <div className="max-w-xl">
              <div className="w-64 h-40 rounded-2xl bg-gradient-to-br from-gray-800 to-gray-900 border border-white/10 mb-8 flex items-end p-6">
                <div>
                  <p className="text-white/40 text-xs mb-1">MONADIER</p>
                  <p className="text-white font-mono text-sm">**** **** **** 4242</p>
                </div>
              </div>
              <h2 className="text-2xl md:text-3xl font-display font-medium text-white mb-4">
                Your trading profits, instantly spendable
              </h2>
              <p className="text-gray-400 leading-relaxed">
                Connect your trading wallet and spend your crypto gains anywhere Visa is accepted. Real-time conversion, zero hassle.
              </p>
            </div>
          </motion.div>
        </section>

        {/* Features Grid */}
        <section className="container-custom mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-display font-medium mb-6">
              Everything you need in a card
            </h2>
            <p className="text-gray-400 text-lg leading-relaxed">
              Powered by Stripe's global infrastructure. Secure, fast, and accepted worldwide.
            </p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Globe,
                title: 'Global Acceptance',
                description: 'Use your card anywhere Visa is accepted, in over 200 countries worldwide.'
              },
              {
                icon: Smartphone,
                title: 'Instant Notifications',
                description: 'Real-time alerts for every transaction. Stay informed about your spending.'
              },
              {
                icon: Lock,
                title: 'Advanced Security',
                description: 'Freeze your card instantly, set spending limits, and control everything from the app.'
              },
              {
                icon: Shield,
                title: 'Fraud Protection',
                description: 'AI-powered fraud detection and zero liability on unauthorized transactions.'
              },
              {
                icon: Bell,
                title: 'Smart Budgeting',
                description: 'Set budgets by category and get alerts when you\'re approaching your limits.'
              },
              {
                icon: CreditCard,
                title: 'Virtual Cards',
                description: 'Create virtual cards for online shopping with unique numbers for extra security.'
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
        </section>

        {/* Stripe Partnership */}
        <section className="container-custom mb-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="p-8 md:p-12 rounded-3xl bg-white/[0.02] border border-white/5 text-center"
          >
            <p className="text-gray-500 text-sm uppercase tracking-wider mb-4">Powered by</p>
            <h3 className="text-2xl md:text-3xl font-display font-medium text-white mb-4">Stripe Issuing</h3>
            <p className="text-gray-400 max-w-2xl mx-auto leading-relaxed">
              Built on Stripe's world-class financial infrastructure. Your funds are secure, your data is protected, and your transactions are processed by the same technology trusted by millions of businesses worldwide.
            </p>
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
              Be the first to get +Card
            </h2>
            <p className="text-gray-400 text-lg mb-10">
              Join the waitlist and we'll notify you as soon as +Card launches. Early adopters get exclusive benefits.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/register">
                <button className="px-5 py-2.5 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-100 transition-colors inline-flex items-center gap-2">
                  Join the waitlist
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
    </div>
  );
};

export default CardPage;
