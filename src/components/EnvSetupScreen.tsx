import React from 'react';
import type { EnvIssue } from '../lib/envCheck';

type Props = {
  issue: EnvIssue;
};

const EnvSetupScreen: React.FC<Props> = ({ issue }) => (
  <div className="min-h-screen page-shell text-primary flex items-center justify-center p-8">
    <div className="max-w-lg glass-panel p-8">
      <h1 className="text-lg font-semibold mb-3">{issue.title}</h1>
      <ol className="text-sm text-secondary space-y-2 list-decimal list-inside mb-4">
        {issue.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <p className="text-xs text-secondary">
        Docs: <code className="text-primary">docs/SUPABASE_SETUP.md</code>
      </p>
    </div>
  </div>
);

export default EnvSetupScreen;
