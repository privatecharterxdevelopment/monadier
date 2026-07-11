import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import Logo from '../components/ui/Logo';
import MarketingSeo from '../components/seo/MarketingSeo';
import RegisterForm from '../components/auth/RegisterForm';
import { afterAuthGo, getOpenAppPath } from '../lib/appUrls';
import { queueAuthToast } from '../lib/authToast';
import { captureReferralFromSearch } from '../lib/referralCapture';

const RegisterPage: React.FC = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref') ?? searchParams.get('referral');
    if (ref) captureReferralFromSearch(`?ref=${ref}`);
  }, [searchParams]);

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
            <h1 className="auth-card-title">{t('auth.register.title')}</h1>
            <RegisterForm
              idPrefix="page-reg"
              signInHref="/login"
              onSessionCreated={() => {
                queueAuthToast('signed_in');
                const returnTo = searchParams.get('from');
                afterAuthGo(
                  returnTo && returnTo.startsWith('/') ? returnTo : getOpenAppPath(),
                  navigate
                );
              }}
            />
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default RegisterPage;
