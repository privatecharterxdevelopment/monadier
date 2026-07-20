import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { getAbsoluteAppUrl } from '../lib/appUrls';
import AdminWalletQuiet from '../components/admin/AdminWalletQuiet';
import '../styles/admin-monitor.css';

type Props = {
  children: React.ReactNode;
};

/** Full-page admin shell — obscure path only (see getAdminPath). */
const AdminMonitorLayout: React.FC<Props> = ({ children }) => {
  const appHref = getAbsoluteAppUrl('?section=bot');

  return (
    <div className="admin-monitor-page h-[100dvh] flex flex-col bg-[#0a0a0c] text-[#fafafa] overflow-hidden">
      <AdminWalletQuiet />
      <header className="shrink-0 z-20 border-b border-white/10 bg-[#0a0a0c]/95 backdrop-blur px-4 py-3 md:px-8">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
          <a
            href={appHref}
            className="inline-flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Pro Trade
          </a>
          <span className="text-xs uppercase tracking-wider text-[#71717a]">Admin · Hyperliquid</span>
        </div>
      </header>
      <main className="admin-monitor-scroll flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden">
        <div className="max-w-[1600px] mx-auto px-4 py-6 md:px-8 md:py-8 admin-monitor-scope min-w-0">
          {children}
        </div>
      </main>
    </div>
  );
};

export default AdminMonitorLayout;
