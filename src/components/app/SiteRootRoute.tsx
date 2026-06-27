import React from 'react';
import PageTransition from '../animations/PageTransition';
import { isAppHost } from '../../lib/appUrls';
import MonadierAppRoot from './MonadierAppRoot';
import LandingPage from '../../pages/LandingPage';

/** `/` — marketing landing on monadier.com, Pro Trade on app.monadier.com (or /app in local dev). */
const SiteRootRoute: React.FC = () => {
  if (isAppHost()) {
    return <MonadierAppRoot />;
  }

  return (
    <PageTransition>
      <LandingPage />
    </PageTransition>
  );
};

export default SiteRootRoute;
