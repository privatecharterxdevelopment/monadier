import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import Logo from '../components/ui/Logo';
import MarketingSeo from '../components/seo/MarketingSeo';
import { REGISTRATION_CLOSED_MESSAGE } from '../lib/productShutdown';

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="auth-page auth-page--register">
      <MarketingSeo path="/register" />
      <div className="auth-page-inner">
        <motion.div
          className="w-full max-w-lg"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="auth-card auth-card--register">
            <div className="auth-card-brand">
              <Logo size="sm" theme="light" />
            </div>
            <h1 className="auth-card-title">{REGISTRATION_CLOSED_MESSAGE}</h1>
            <button
              type="button"
              className="term-modal-primary mt-10 w-full"
              onClick={() => navigate('/login')}
            >
              Sign in
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default RegisterPage;
