import React from 'react';
import { motion } from 'framer-motion';

const partners = [
  { label: 'Arbitrum' },
  { label: 'GMX' },
  { label: 'MetaMask' },
  { label: 'WalletConnect' },
  { label: 'Reown' },
  { label: 'USDC' },
];

const LandingPartnersStrip: React.FC = () => {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="relative z-10 border-t border-white/[0.06] bg-background/80"
    >
      <div className="container-custom py-10 md:py-12">
        <p className="text-center text-[11px] uppercase tracking-[0.2em] text-zinc-600 mb-6 font-medium">
          Infrastructure
        </p>
        <div className="relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-20 bg-gradient-to-r from-[#08080a] to-transparent z-10" />
          <div className="absolute right-0 top-0 bottom-0 w-20 bg-gradient-to-l from-[#08080a] to-transparent z-10" />
          <div className="logo-carousel">
            {[0, 1].map((set) => (
              <div key={set} className="flex items-center gap-16 px-8">
                {partners.map((p) => (
                  <span
                    key={`${set}-${p.label}`}
                    className="text-sm font-medium text-zinc-600 whitespace-nowrap tracking-normal"
                  >
                    {p.label}
                  </span>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
};

export default LandingPartnersStrip;
