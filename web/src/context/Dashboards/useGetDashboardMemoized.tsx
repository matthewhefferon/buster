import { dashboardQueryKeys } from '@/api/query_keys/dashboard';
import { useMemoizedFn } from '@/hooks';
import { useQueryClient } from '@tanstack/react-query';

export const useGetDashboardMemoized = () => {
  const queryClient = useQueryClient();
  const getDashboardMemoized = useMemoizedFn((dashboardId: string, versionNumber?: number) => {
    const options = dashboardQueryKeys.dashboardGetDashboard(dashboardId, versionNumber || null);
    const data = queryClient.getQueryData(options.queryKey);
    return data;
  });
  return getDashboardMemoized;
};
