import React from 'react';
import { Info } from 'lucide-react';
import TerminalModalFrame from './TerminalModalFrame';
import HlBotSetupSteps from './HlBotSetupSteps';

type Props = {
  walletReady: boolean;
  hlBalanceUsd: number;
  agentApproved: boolean;
  botRunning: boolean;
  currentStep: 1 | 2 | 3 | 4;
  onClose: () => void;
};

const HlBotSetupGuideModal: React.FC<Props> = ({
  walletReady,
  hlBalanceUsd,
  agentApproved,
  botRunning,
  currentStep,
  onClose,
}) => (
  <TerminalModalFrame
    title="How the bot works"
    subtitle="Four steps — all inside Monadier."
    icon={<Info size={18} />}
    onClose={onClose}
  >
    <HlBotSetupSteps
      variant="guide"
      walletReady={walletReady}
      hlBalanceUsd={hlBalanceUsd}
      agentApproved={agentApproved}
      botRunning={botRunning}
      currentStep={currentStep}
    />
  </TerminalModalFrame>
);

export default HlBotSetupGuideModal;
