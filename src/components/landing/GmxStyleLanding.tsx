import React from 'react';
import LandingPageShell from './LandingPageShell';
import LandingAlphaHero from './LandingAlphaHero';
import LandingFeaturePanel from './LandingFeaturePanel';
import LandingVolumeSection from './LandingVolumeSection';
import LandingFaqSection from './LandingFaqSection';
import { useLandingTheme } from '../../contexts/LandingThemeContext';

const GmxStyleLanding: React.FC = () => {
  const { isLight } = useLandingTheme();

  return (
    <div className={`landing-gmx landing-gmx--home landing-gmx--al landing-gmx--${isLight ? 'light' : 'dark'}`}>
      <LandingPageShell>
        <LandingAlphaHero />
        <LandingFeaturePanel />
        <LandingVolumeSection />
        <LandingFaqSection />
      </LandingPageShell>
    </div>
  );
};

export default GmxStyleLanding;
