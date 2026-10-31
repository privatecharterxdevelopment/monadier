import React from 'react';
import { Shield } from 'lucide-react';
import TerminalModalFrame from './TerminalModalFrame';
import ProfileSecurityPanel from './ProfileSecurityPanel';

type Props = {
  onClose: () => void;
};

const TerminalSecurityModal: React.FC<Props> = ({ onClose }) => {
  return (
    <TerminalModalFrame
      title="Security"
      subtitle="Password, email, and sign-in activity"
      onClose={onClose}
      icon={<Shield size={18} />}
      wide
    >
      <ProfileSecurityPanel idPrefix="modal-sec" onForgotPasswordClick={onClose} />
    </TerminalModalFrame>
  );
};

export default TerminalSecurityModal;
