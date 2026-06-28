import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { getOpenAppPath } from '../lib/appUrls';
import '../styles/admin-monitor.css';

type Props = {
  children: React.ReactNode;
};

/** Full-page admin shell — reachable at /admin */
const AdminMonitorLayout: React.FC<Props> = ({ children }) => {
  return (
    <div className="min-h-[100dvh] bg-[#0a0a0c] text-[#fafafa]">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-[#0a0a0c]/95 backdrop-blur px-4 py-3 md:px-8">
        <div className="max-w-[1600px] mx-auto flex items-center justify-between gap-4">
          <Link
            to={getOpenAppPath()}
            className="inline-flex items-center gap-2 text-sm text-[#a1a1aa] hover:text-white transition-colors"
          >
            <ArrowLeft size={16} />
            Back to Pro Trade
          </Link>
          <span className="text-xs uppercase tracking-wider text-[#71717a]">Admin · Hyperliquid</span>
        </div>
      </header>
      <div className="max-w-[1600px] mx-auto px-4 py-6 md:px-8 md:py-8 admin-monitor-scope">{children}</div>
    </div>
  );
};

export default AdminMonitorLayout;
