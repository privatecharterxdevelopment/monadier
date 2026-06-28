import React, { useEffect } from 'react';
import PageTransition from '../animations/PageTransition';
import Dashboard2Layout from '../../layouts/Dashboard2Layout';
import Dashboard2ProPage from '../../pages/dashboard/Dashboard2ProPage';

/** Pro Trade terminal — main window at app.monadier.io */
const MonadierAppRoot: React.FC = () => {
  useEffect(() => {
    document.title = 'Monadier · app.monadier.io';
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
