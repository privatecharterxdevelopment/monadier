import React from 'react';
import { Bot, Gift, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type HeroPerk = {
  icon: LucideIcon;
  title: string;
  subtitle: string;
};

const HERO_PERKS: HeroPerk[] = [
  {
    icon: Gift,
    title: 'Referral rewards',
    subtitle: 'Earn 2% from referrals\' profitable bot trades',
  },
  {
    icon: Sparkles,
    title: 'Success fee only',
    subtitle: 'No charge on losing trades — pay when you win',
  },
  {
    icon: Bot,
    title: '24/7 automation',
    subtitle: 'Bot scans 200+ HL markets while you sleep',
  },
];

const LandingHeroPerks: React.FC = () => (
  <ul className="landing-gmx-hero-perks" aria-label="Platform highlights">
    {HERO_PERKS.map(({ icon: Icon, title, subtitle }) => (
      <li key={title} className="landing-gmx-hero-perk">
        <span className="landing-gmx-hero-perk-icon" aria-hidden>
          <Icon size={20} strokeWidth={2} />
        </span>
        <span className="landing-gmx-hero-perk-copy">
          <span className="landing-gmx-hero-perk-title">{title}</span>
          <span className="landing-gmx-hero-perk-sub">{subtitle}</span>
        </span>
      </li>
    ))}
  </ul>
);

export default LandingHeroPerks;
