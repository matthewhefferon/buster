'use client';

import React, { useMemo } from 'react';
import { ShareAssetType } from '@/api/asset_interfaces';
import { AppPasswordAccess } from '@/controllers/AppPasswordAccess';
import { AppNoPageAccess } from '@/controllers/AppNoPageAccess';
import { useGetAsset } from './useGetAsset';
import { FileIndeterminateLoader } from '@/components/features/FileIndeterminateLoader';

export type AppAssetCheckLayoutProps = {
  assetId: string;
  type: 'metric' | 'dashboard' | 'collection';
  versionNumber?: number;
};

export const AppAssetCheckLayout: React.FC<
  {
    children: React.ReactNode;
  } & AppAssetCheckLayoutProps
> = React.memo(({ children, type, assetId, versionNumber }) => {
  const { hasAccess, passwordRequired, isPublic, isFetched, showLoader } = useGetAsset({
    assetId,
    type,
    versionNumber
  });

  const Component = useMemo(() => {
    if (!isFetched) return <></>;

    if (!hasAccess && !isPublic) {
      return <AppNoPageAccess assetId={assetId} />;
    }

    if (isPublic && passwordRequired) {
      return (
        <AppPasswordAccess assetId={assetId} type={type as ShareAssetType}>
          {children}
        </AppPasswordAccess>
      );
    }

    return <>{children}</>;
  }, [isFetched, hasAccess, isPublic, passwordRequired, assetId, type, children]);

  return (
    <>
      {showLoader && <FileIndeterminateLoader />}
      {Component}
    </>
  );
});

AppAssetCheckLayout.displayName = 'AppAssetCheckLayout';
