import React from 'react';
import PageTransition from '../animations/PageTransition';
import Dashboard2Layout from '../../layouts/Dashboard2Layout';
import Dashboard2ProPage from '../../pages/dashboard/Dashboard2ProPage';
import MonadierAppGate from './MonadierAppGate';

/** Pro Trade terminal — main window at app.monadier.com */
const MonadierAppRoot: React.FC = () => (
  <PageTransition fillViewport>
    <Dashboard2Layout>
      <MonadierAppGate>
        <Dashboard2ProPage />
      </MonadierAppGate>
    </Dashboard2Layout>
  </PageTransition>
);

export default MonadierAppRoot;
