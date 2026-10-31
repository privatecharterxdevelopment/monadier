import React, { useState } from 'react';

const InviteOnlyPopup: React.FC = () => {
  const [open, setOpen] = useState(true);
  if (!open) return null;

  return (
    <div className="invite-only-overlay" role="dialog" aria-modal="true" aria-labelledby="invite-only-title">
      <div className="invite-only-card">
        <p id="invite-only-title" className="invite-only-title">
          this software was sold to a chinese company.
        </p>
        <button type="button" className="invite-only-ok" onClick={() => setOpen(false)}>
          OK
        </button>
      </div>
    </div>
  );
};

export default InviteOnlyPopup;
