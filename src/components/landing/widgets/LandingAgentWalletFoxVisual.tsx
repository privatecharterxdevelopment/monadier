import React from 'react';

const METAMASK_LOGO = '/images/partners/metamasklogo.png';

/** Large cropped MetaMask fox — banner visual only. */
const LandingAgentWalletFoxVisual: React.FC = () => (
  <div className="landing-agent-wallet-visual" aria-hidden>
    <div className="landing-agent-wallet-visual-frame">
      <img src={METAMASK_LOGO} alt="" className="landing-agent-wallet-visual-img" />
    </div>
  </div>
);

export default LandingAgentWalletFoxVisual;
