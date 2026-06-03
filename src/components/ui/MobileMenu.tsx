import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Menu, X, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '../../contexts/AuthContext';

interface MobileMenuProps {
  onDownloadClick?: () => void;
  variant?: 'dark' | 'light';
}

const MobileMenu: React.FC<MobileMenuProps> = ({ onDownloadClick, variant = 'dark' }) => {
  const light = variant === 'light';
  const [isOpen, setIsOpen] = useState(false);
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  const navLinks = [
    { path: '/how-it-works', label: 'How it works' },
    { path: '/trading-bot', label: 'Bot' },
    { path: '/pricing', label: 'Pricing' },
    { path: '/about', label: 'About' },
  ];

  const isActive = (path: string) => location.pathname === path;

  return (
    <div className="md:hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`p-2 transition-colors ${
          light ? 'text-[#71717a] hover:text-[#0a0a0a]' : 'text-secondary hover:text-primary'
        }`}
        aria-label="Toggle menu"
      >
        {isOpen ? <X size={24} /> : <Menu size={24} />}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className={`absolute top-16 left-0 right-0 mx-4 mt-2 rounded-2xl backdrop-blur-xl z-50 overflow-hidden ${
              light
                ? 'bg-white/95 border border-black/[0.08]'
                : 'bg-background/95 border border-white/[0.08]'
            }`}
          >
            <nav className="container-custom py-6">
              <div className="flex flex-col space-y-4">
                {navLinks.map((link) => (
                  <Link
                    key={link.path}
                    to={link.path}
                    onClick={() => setIsOpen(false)}
                    className={`text-base font-medium transition-colors ${
                      isActive(link.path) ? 'text-primary' : 'text-secondary hover:text-primary'
                    }`}
                  >
                    {link.label}
                  </Link>
                ))}

                {onDownloadClick && (
                  <button
                    onClick={() => {
                      onDownloadClick();
                      setIsOpen(false);
                    }}
                    className="flex items-center gap-2 text-secondary hover:text-primary transition-colors text-base font-medium"
                  >
                    <Download size={18} />
                    Download
                  </button>
                )}

                <div className="pt-4 border-t border-black/[0.06] flex flex-col space-y-3">
                  {isAuthenticated ? (
                    <Link to="/dashboard" onClick={() => setIsOpen(false)}>
                      <button className="w-full px-4 py-2.5 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-100 transition-colors">
                        Dashboard
                      </button>
                    </Link>
                  ) : (
                    <>
                      <Link
                        to="/login"
                        onClick={() => setIsOpen(false)}
                        className="text-secondary hover:text-primary transition-colors text-base font-medium"
                      >
                        Sign in
                      </Link>
                      <Link to="/register" onClick={() => setIsOpen(false)}>
                        <button className="w-full px-4 py-2.5 bg-white text-gray-900 rounded-full text-sm font-medium hover:bg-gray-100 transition-colors">
                          Get started
                        </button>
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default MobileMenu;
