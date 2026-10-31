import React, { useEffect } from 'react';
import PageTransition from '../animations/PageTransition';
import Dashboard2Layout from '../../layouts/Dashboard2Layout';
import Dashboard2ProPage from '../../pages/dashboard/Dashboard2ProPage';

/** Pro Trade terminal — main window at app.hypergain.io */
const MonadierAppRoot: React.FC = () => {
  useEffect(() => {
    document.title = 'HyperGain · app.hypergain.io';
  }, []);

  return (
    <PageTransition fillViewport>
      <Dashboard2Layout>
        <Dashboard2ProPage />
      </Dashboard2Layout>
    </PageTransition>
  );
};

export default MonadierAppRoot;
