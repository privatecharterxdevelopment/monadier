import React from 'react';

/** Studio grey ambient — matches landing page */
const MeshBackground: React.FC = () => {
  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none" aria-hidden>
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(180deg, #efeff2 0%, #e4e4e8 50%, #e0e0e6 100%)',
        }}
      />
      <div
        className="absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(255,255,255,0.5) 0%, transparent 55%)',
        }}
      />
    </div>
  );
};

export default MeshBackground;
