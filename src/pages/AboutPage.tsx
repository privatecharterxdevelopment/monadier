import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { MapPin, ArrowRight, Shield, Zap, Globe, Download, Sparkles } from 'lucide-react';
import Logo from '../components/ui/Logo';
import CookieConsent from '../components/ui/CookieConsent';
import DownloadModal from '../components/ui/DownloadModal';
import MobileMenu from '../components/ui/MobileMenu';

const AboutPage: React.FC = () => {
  const [showDownloadModal, setShowDownloadModal] = useState(false);

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
              <Link to="/forex" className="text-gray-400 hover:text-white transition-colors text-sm font-medium">
                Forex MT5
              </Link>
              <Link to="/about" className="text-white transition-colors text-sm font-medium">
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
              About <span className="text-gray-500">+Monadier</span>
            </h1>
            <p className="text-lg md:text-xl text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed">
              Making automated crypto trading accessible to everyone — no experience required. Whether you're a complete beginner or seasoned trader, start earning passive income in minutes.
            </p>
          </motion.div>
        </section>

        {/* Journey Timeline */}
        <section className="container-custom mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-display font-medium mb-6">
              The journey
            </h2>
            <p className="text-gray-400 text-lg leading-relaxed">
              From crypto research to building a platform that empowers traders worldwide.
            </p>
          </motion.div>

          <div className="space-y-6">
            {[
              {
                year: '2022-2023',
                title: 'Crypto Valley Research',
                location: 'Zug, Switzerland',
                description: 'Deep immersion in blockchain technology and DeFi protocols while working with a leading crypto company in Zug. Extensive research into decentralized exchanges, smart contracts, and automated trading systems.'
              },
              {
                year: '2024',
                title: 'Building +Monadier',
                location: 'Switzerland',
                description: 'Combining years of crypto trading experience with technical expertise to create a platform that automates DEX trading. Focus on non-custodial security and user-friendly interfaces.'
              },
              {
                year: '2025',
                title: 'Launch & Growth',
                location: 'Global',
                description: 'Launching +Monadier to help traders automate their strategies across multiple chains. Expanding support for Ethereum, BNB Chain, Arbitrum, Base, and Polygon.'
              }
            ].map((item, index) => (
              <motion.div
                key={item.year}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="flex gap-8 p-6 rounded-2xl border border-white/5 hover:border-white/10 hover:bg-white/[0.02] transition-all"
              >
                <div className="flex-shrink-0">
                  <span className="text-2xl font-display font-medium text-white/40">{item.year}</span>
                </div>
                <div>
                  <h3 className="text-lg font-medium text-white mb-1">{item.title}</h3>
                  <p className="text-gray-500 text-sm mb-3 flex items-center gap-2">
                    <MapPin size={14} />
                    {item.location}
                  </p>
                  <p className="text-gray-400 leading-relaxed">{item.description}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Vision Section */}
        <section className="container-custom mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="p-8 md:p-12 rounded-3xl bg-white/[0.02] border border-white/5"
          >
            <div className="max-w-3xl mx-auto text-center">
              <h2 className="text-3xl md:text-4xl font-display font-medium mb-6">
                Our vision
              </h2>
              <p className="text-gray-400 text-lg leading-relaxed">
                "You don't need to be a trading expert. You don't need to understand charts or technical analysis. With +Monadier, even complete beginners can set up automated trading in minutes. Whether you're travelling, sleeping, or enjoying life — your portfolio keeps working for you."
              </p>
            </div>
          </motion.div>
        </section>

        {/* Values */}
        <section className="container-custom mb-24">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Sparkles,
                title: 'Beginner Friendly',
                description: 'No trading experience needed. Our simple interface guides you through setup in minutes, not hours.'
              },
              {
                icon: Shield,
                title: 'Non-Custodial Security',
                description: 'Your keys, your crypto. We never have access to your funds or private keys. Trade with confidence.'
              },
              {
                icon: Zap,
                title: 'Set & Forget',
                description: 'Configure once, earn passively. No charts to watch, no complex decisions. The bot handles everything.'
              },
              {
                icon: Globe,
                title: 'Global Freedom',
                description: 'Trade from anywhere in the world. No borders, no restrictions. True financial freedom.'
              }
            ].map((value, index) => (
              <motion.div
                key={value.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="p-8 rounded-2xl border border-white/5 hover:border-white/10 hover:bg-white/[0.02] transition-all text-center"
              >
                <div className="w-12 h-12 rounded-xl bg-white/5 flex items-center justify-center mb-6 mx-auto">
                  <value.icon className="text-white/60" size={24} />
                </div>
                <h3 className="text-lg font-medium text-white mb-3">{value.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{value.description}</p>
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
              Ready to start your journey?
            </h2>
            <p className="text-gray-400 text-lg mb-10">
              Join thousands of beginners and pros who are already earning passive income with +Monadier. No experience needed.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Link to="/register">
                <button className="px-5 py-2.5 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-100 transition-colors inline-flex items-center gap-2">
                  Get started
                  <ArrowRight size={14} />
                </button>
              </Link>
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

export default AboutPage;
