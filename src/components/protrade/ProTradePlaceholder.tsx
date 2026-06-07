import React from 'react';

type Props = {
  title: string;
  description?: string;
};

const ProTradePlaceholder: React.FC<Props> = ({ title, description }) => (
  <div className="hl-placeholder">
    <h2>{title}</h2>
    <p>{description ?? 'Coming soon on Monadier Pro Trade.'}</p>
  </div>
);

export default ProTradePlaceholder;
