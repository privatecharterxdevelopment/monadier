import React from 'react';
import { User } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import TerminalModalFrame from './TerminalModalFrame';
import TerminalProfilePanel from './TerminalProfilePanel';

type Props = {
  onClose: () => void;
};

/** Legacy modal — prefer /dashboard2/profile */
const TerminalProfileModal: React.FC<Props> = ({ onClose }) => {
  const { user } = useAuth();

  return (
    <TerminalModalFrame
      wide
      title="Profile"
      subtitle={user?.email ?? undefined}
      icon={<User size={18} />}
      onClose={onClose}
    >
      <div className="term-profile-modal">
        <TerminalProfilePanel />
      </div>
    </TerminalModalFrame>
  );
};

export default TerminalProfileModal;
