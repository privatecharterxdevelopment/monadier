import React from 'react';
import Logo from '../../ui/Logo';

/** Top half of iPhone — HyperGain mark + wordmark on screen. */
const LandingBotWalletPhoneVisual: React.FC = () => (
  <div className="landing-bot-wallet-phone-stage" aria-hidden>
    <div className="landing-bot-wallet-phone">
      <div className="landing-bot-wallet-phone-notch" />
      <div className="landing-bot-wallet-phone-screen">
        <div className="landing-bot-wallet-phone-brand">
          <Logo size="md" variant="image" theme="dark" linked={false} />
        </div>
      </div>
    </div>
  </div>
);

export default LandingBotWalletPhoneVisual;
