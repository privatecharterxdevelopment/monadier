import React from 'react';
import LandingPage from '../../pages/LandingPage';
import { isAppHost } from '../../lib/appUrls';
import MonadierAppRoot from './MonadierAppRoot';

/** Marketing `/` vs app host `/` (app.monadier.com). */
const RootRoute: React.FC = () => {
  if (isAppHost()) {
    return <MonadierAppRoot />;
  }
  return <LandingPage />;
};

export default RootRoute;
