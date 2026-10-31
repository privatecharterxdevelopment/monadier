import React from 'react';
import { useLandingTheme } from '../../contexts/LandingThemeContext';

const COPY = 'this software was sold to a chinese company.';

const GmxStyleLanding: React.FC = () => {
  const { isLight } = useLandingTheme();

  return (
    <div
      className={`landing-gmx landing-gmx--home landing-gmx--al landing-gmx--${isLight ? 'light' : 'dark'}`}
    >
      <main
        style={{
          minHeight: '100svh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '5rem 2.5rem',
        }}
      >
        <h1
          style={{
            margin: 0,
            maxWidth: '22ch',
            fontSize: 'clamp(1.75rem, 4.5vw, 3rem)',
            fontWeight: 400,
            lineHeight: 1.45,
            letterSpacing: '-0.03em',
            textAlign: 'center',
            color: isLight ? '#0a0a0a' : '#f4f4f5',
          }}
        >
          {COPY}
        </h1>
      </main>
    </div>
  );
};

export default GmxStyleLanding;
