import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { LineChart, Coins, Briefcase, ArrowRight, Shield, Award } from 'lucide-react';
import Logo from '../components/ui/Logo';
import Button from '../components/ui/Button';
import FadeIn from '../components/animations/FadeIn';
import CookieConsent from '../components/ui/CookieConsent';

const InvestingPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-gray-900">
      <header className="relative z-10 container-custom py-8">
        <nav className="flex justify-between items-center">
          <Logo size="md" />
          <div className="hidden md:flex items-center space-x-8">
            <Link to="/banking" className="text-secondary hover:text-primary transition-colors">Banking</Link>
            <Link to="/saving" className="text-secondary hover:text-primary transition-colors">Saving</Link>
            <Link to="/investing" className="text-white hover:text-primary transition-colors">Investing</Link>
            <Link to="/about" className="text-secondary hover:text-primary transition-colors">About</Link>
            <Link to="/register">
              <Button variant="primary" size="md">Open an account</Button>
            </Link>
          </div>
        </nav>
      </header>

      <main className="container-custom py-20">
        <FadeIn>
          <div className="max-w-4xl">
            <h1 className="text-4xl md:text-6xl font-display mb-8">Intelligent investing for everyone</h1>
            <p className="text-xl text-secondary mb-12">
              Access premium investment opportunities with expert guidance and cutting-edge technology.
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          <FadeIn delay={0.2}>
            <div className="bg-card-dark p-8 rounded-2xl border border-gray-800">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-6">
                <LineChart className="text-white" size={24} />
              </div>
              <h2 className="text-2xl font-display mb-4">Smart Portfolios</h2>
              <p className="text-secondary mb-6">Professionally managed portfolios tailored to your goals.</p>
              <Link to="/register">
                <Button variant="secondary" fullWidth>
                  Start investing
                  <ArrowRight size={20} className="ml-2" />
                </Button>
              </Link>
            </div>
          </FadeIn>

          <FadeIn delay={0.3}>
            <div className="bg-card-dark p-8 rounded-2xl border border-gray-800">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-6">
                <Coins className="text-white" size={24} />
              </div>
              <h2 className="text-2xl font-display mb-4">Precious Metals</h2>
              <p className="text-secondary mb-6">Physical gold and silver with secure storage solutions.</p>
              <Link to="/register">
                <Button variant="secondary" fullWidth>
                  Learn more
                  <ArrowRight size={20} className="ml-2" />
                </Button>
              </Link>
            </div>
          </FadeIn>

          <FadeIn delay={0.4}>
            <div className="bg-card-dark p-8 rounded-2xl border border-gray-800">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-6">
                <Briefcase className="text-white" size={24} />
              </div>
              <h2 className="text-2xl font-display mb-4">Private Markets</h2>
              <p className="text-secondary mb-6">Exclusive access to private equity and venture capital.</p>
              <Link to="/register">
                <Button variant="secondary" fullWidth>
                  Explore
                  <ArrowRight size={20} className="ml-2" />
                </Button>
              </Link>
            </div>
          </FadeIn>
        </div>

        <FadeIn delay={0.5}>
          <div className="bg-card-dark p-12 rounded-2xl border border-gray-800">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl font-display mb-6">Why Choose Us</h2>
                <ul className="space-y-6">
                  <li className="flex items-start">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center mr-4 mt-1">
                      <Shield className="text-white" size={18} />
                    </div>
                    <div>
                      <h3 className="font-medium mb-2">Institutional Grade</h3>
                      <p className="text-secondary">Access investments typically reserved for institutions.</p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center mr-4 mt-1">
                      <Award className="text-white" size={18} />
                    </div>
                    <div>
                      <h3 className="font-medium mb-2">Expert Management</h3>
                      <p className="text-secondary">Your portfolio is managed by seasoned professionals.</p>
                    </div>
                  </li>
                </ul>
              </div>
              <div className="text-center">
                <div className="text-5xl font-display mb-4">CHF 100k</div>
                <p className="text-xl text-secondary mb-8">Minimum Investment</p>
                <Link to="/register">
                  <Button variant="primary" size="lg">
                    Get started
                    <ArrowRight size={20} className="ml-2" />
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </FadeIn>
      </main>

      <CookieConsent />
    </div>
  );
};

export default InvestingPage;