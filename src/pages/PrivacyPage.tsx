import React from 'react';
import { useTranslation } from 'react-i18next';
import LegalDocumentLayout from '../components/legal/LegalDocumentLayout';
import { getPrivacyPageContent } from '../content/hypergainPrivacyPolicy';

const PrivacyPage: React.FC = () => {
  const { i18n } = useTranslation();
  const content = getPrivacyPageContent(i18n.language);

  return (
    <LegalDocumentLayout
      title={content.title}
      updated={content.updated}
      intro={content.intro}
      backLabel={content.backLabel}
      sections={content.sections}
    />
  );
};

export default PrivacyPage;
