'use client';

import React from 'react';
import { TermsHeader } from '../TermsListController/TermsHeader';

export const TermIndividualHeader: React.FC<{
  termId: string;
}> = ({ termId }) => {
  return <TermsHeader termId={termId} />;
};
