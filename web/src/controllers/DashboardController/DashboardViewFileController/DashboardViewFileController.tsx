'use client';

import React from 'react';
import { useMemoizedFn } from '@/hooks';
import { useBusterNotifications } from '@/context/BusterNotifications';
import { useGetDashboard, useUpdateDashboard } from '@/api/buster_rest/dashboards';
import { EditFileContainer } from '@/components/features/files/EditFileContainer';
import { useIsDashboardReadOnly } from '@/context/Dashboards/useIsDashboardReadOnly';

export const DashboardViewFileController: React.FC<{
  dashboardId: string;
  chatId?: string | undefined;
}> = React.memo(({ dashboardId }) => {
  const { data: dashboard } = useGetDashboard(
    { id: dashboardId },
    { select: (data) => data.dashboard }
  );
  const { openSuccessMessage } = useBusterNotifications();
  const {
    mutateAsync: onUpdateDashboard,
    isPending: isUpdatingDashboard,
    error: updateDashboardError
  } = useUpdateDashboard({
    saveToServer: true,
    updateVersion: false
  });

  const { isReadOnly } = useIsDashboardReadOnly({
    dashboardId
  });

  const { file, file_name } = dashboard || {};
  const updateDashboardErrorMessage = updateDashboardError?.message;

  const onSaveFile = useMemoizedFn(async (file: string) => {
    await onUpdateDashboard({
      file,
      id: dashboardId
    });
    openSuccessMessage(`${file_name} saved`);
  });

  return (
    <EditFileContainer
      fileName={file_name}
      file={file}
      onSaveFile={onSaveFile}
      error={updateDashboardErrorMessage}
      isSaving={isUpdatingDashboard}
      readOnly={isReadOnly}
    />
  );
});

DashboardViewFileController.displayName = 'DashboardViewFile';
