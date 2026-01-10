import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Mail, Clock, MessageCircle, HelpCircle, ArrowRight, Download } from 'lucide-react';
import Logo from '../components/ui/Logo';
import CookieConsent from '../components/ui/CookieConsent';
import DownloadModal from '../components/ui/DownloadModal';
import MobileMenu from '../components/ui/MobileMenu';

const SupportPage: React.FC = () => {
  const [showDownloadModal, setShowDownloadModal] = useState(false);

  const faqs = [
    {
      question: 'How do I get started with the trading bot?',
      answer: 'Simply create an account, connect your wallet, configure your trading strategy, and activate the bot. Our step-by-step guide on the "How it works" page will walk you through the process.'
    },
    {
      question: 'Is my wallet safe?',
      answer: 'Yes, absolutely. We are non-custodial, meaning we never have access to your private keys or funds. Your wallet remains under your full control at all times.'
    },
    {
      question: 'What networks do you support?',
      answer: 'We support Ethereum, BNB Chain, Arbitrum, Base, and Polygon. You can trade on Uniswap V3 and PancakeSwap across these networks.'
    },
    {
      question: 'How can I cancel my subscription?',
      answer: 'You can cancel your subscription at any time from your dashboard settings. Your access will remain active until the end of your billing period.'
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
              Support <span className="text-gray-500">Center</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed">
              We're here to help. Get in touch with our support team or find answers in our FAQ.
            </p>
          </motion.div>
        </section>

        {/* Contact Cards */}
        <section className="container-custom mb-24">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Email Support */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="p-8 rounded-2xl border border-white/5 bg-white/[0.02]"
            >
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-6">
                <Mail className="text-white/60" size={24} />
              </div>
              <h3 className="text-xl font-display font-medium text-white mb-2">
                Email Support
              </h3>
              <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                Send us an email and we'll get back to you within 24 hours.
              </p>
              <a
                href="mailto:support@monadier.com"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-100 transition-colors"
              >
                <Mail size={16} />
                support@monadier.com
              </a>
            </motion.div>

            {/* Support Hours */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="p-8 rounded-2xl border border-white/5 bg-white/[0.02]"
            >
              <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-6">
                <Clock className="text-white/60" size={24} />
              </div>
              <h3 className="text-xl font-display font-medium text-white mb-2">
                Support Hours
              </h3>
              <p className="text-gray-400 text-sm mb-6 leading-relaxed">
                Our team is available to assist you during the following hours.
              </p>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Monday - Sunday</span>
                  <span className="text-white font-medium">09:00 - 20:00 CET</span>
                </div>
                <p className="text-gray-500 text-xs">
                  Response time: within 24 hours
                </p>
              </div>
            </motion.div>
          </div>
        </section>

        {/* FAQ Section */}
        <section className="container-custom mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h2 className="text-3xl md:text-4xl font-display font-medium mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-gray-400 text-lg">
              Quick answers to common questions
            </p>
          </motion.div>

          <div className="max-w-3xl mx-auto space-y-4">
            {faqs.map((faq, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="p-6 rounded-2xl border border-white/5 bg-white/[0.02]"
              >
                <div className="flex items-start gap-4">
                  <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <HelpCircle size={16} className="text-white/60" />
                  </div>
                  <div>
                    <h3 className="text-white font-medium mb-2">{faq.question}</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">{faq.answer}</p>
                  </div>
                </div>
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
              Still have questions?
            </h2>
            <p className="text-gray-400 text-lg mb-10">
              Our support team is ready to help you get started.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href="mailto:support@monadier.com">
                <button className="px-5 py-2.5 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-100 transition-colors inline-flex items-center gap-2">
                  Contact support
                  <ArrowRight size={14} />
                </button>
              </a>
              <Link to="/how-it-works">
                <button className="px-5 py-2.5 text-gray-400 hover:text-white transition-colors text-sm font-medium">
                  Learn how it works
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
              <Link to="/support" className="text-gray-500 hover:text-white text-sm transition-colors">Support</Link>
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

export default SupportPage;
