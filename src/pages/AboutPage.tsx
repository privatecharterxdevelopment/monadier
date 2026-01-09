import React from 'react';
import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { Users, Building, Globe, ArrowRight, Shield, Award } from 'lucide-react';
import Logo from '../components/ui/Logo';
import Button from '../components/ui/Button';
import FadeIn from '../components/animations/FadeIn';
import CookieConsent from '../components/ui/CookieConsent';

const AboutPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-gray-900">
      <header className="relative z-10 container-custom py-8">
        <nav className="flex justify-between items-center">
          <Logo size="md" />
          <div className="hidden md:flex items-center space-x-8">
            <Link to="/banking" className="text-secondary hover:text-primary transition-colors">Banking</Link>
            <Link to="/saving" className="text-secondary hover:text-primary transition-colors">Saving</Link>
            <Link to="/investing" className="text-secondary hover:text-primary transition-colors">Investing</Link>
            <Link to="/about" className="text-white hover:text-primary transition-colors">About</Link>
            <Link to="/register">
              <Button variant="primary" size="md">Open an account</Button>
            </Link>
          </div>
        </nav>
      </header>

      <main className="container-custom py-20">
        <FadeIn>
          <div className="max-w-4xl">
            <h1 className="text-4xl md:text-6xl font-display mb-8">Redefining private banking</h1>
            <p className="text-xl text-secondary mb-12">
              We combine Swiss banking excellence with cutting-edge technology to deliver an unmatched financial experience.
            </p>
          </div>
        </FadeIn>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          <FadeIn delay={0.2}>
            <div className="bg-card-dark p-8 rounded-2xl border border-gray-800">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-6">
                <Users className="text-white" size={24} />
              </div>
              <h2 className="text-2xl font-display mb-4">Our Team</h2>
              <p className="text-secondary mb-6">Expert professionals with decades of banking and technology experience.</p>
              <Link to="/team">
                <Button variant="secondary" fullWidth>
                  Meet the team
                  <ArrowRight size={20} className="ml-2" />
                </Button>
              </Link>
            </div>
          </FadeIn>

          <FadeIn delay={0.3}>
            <div className="bg-card-dark p-8 rounded-2xl border border-gray-800">
              <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center mb-6">
                <Building className="text-white" size={24} />
              </div>
              <h2 className="text-2xl font-display mb-4">Our Story</h2>
              <p className="text-secondary mb-6">Founded in 2023 with a mission to modernize private banking.</p>
              <Link to="/story">
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
                <Globe className="text-white" size={24} />
              </div>
              <h2 className="text-2xl font-display mb-4">Global Reach</h2>
              <p className="text-secondary mb-6">Serving clients in over 30 countries with local expertise.</p>
              <Link to="/locations">
                <Button variant="secondary" fullWidth>
                  Our locations
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
                <h2 className="text-3xl font-display mb-6">Our Values</h2>
                <ul className="space-y-6">
                  <li className="flex items-start">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center mr-4 mt-1">
                      <Shield className="text-white" size={18} />
                    </div>
                    <div>
                      <h3 className="font-medium mb-2">Trust & Security</h3>
                      <p className="text-secondary">Your assets are protected by Swiss banking regulations.</p>
                    </div>
                  </li>
                  <li className="flex items-start">
                    <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center mr-4 mt-1">
                      <Award className="text-white" size={18} />
                    </div>
                    <div>
                      <h3 className="font-medium mb-2">Excellence</h3>
                      <p className="text-secondary">Committed to delivering exceptional service and results.</p>
                    </div>
                  </li>
                </ul>
              </div>
              <div className="text-center">
                <div className="text-5xl font-display mb-4">2023</div>
                <p className="text-xl text-secondary mb-8">Founded in Zug, Switzerland</p>
                <Link to="/register">
                  <Button variant="primary" size="lg">
                    Join us
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

export default AboutPage;