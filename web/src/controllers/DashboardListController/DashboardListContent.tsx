'use client';

import React, { useMemo, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { formatDate } from '@/lib';
import {
  BusterList,
  BusterListColumn,
  BusterListRow,
  ListEmptyStateWithButton
} from '@/components/ui/list';
import { BusterRoutes, createBusterRoute } from '@/routes';
import { useMemoizedFn } from '@/hooks';
import { DashboardSelectedOptionPopup } from './DashboardSelectedPopup';
import type { BusterDashboardListItem } from '@/api/asset_interfaces';
import { getShareStatus } from '@/components/features/metrics/StatusBadgeIndicator/helpers';
import { useCreateDashboard } from '@/api/buster_rest/dashboards';
import { useAppLayoutContextSelector } from '@/context/BusterAppLayout';
import { FavoriteStar } from '@/components/features/list';
import { ShareAssetType } from '@/api/asset_interfaces';
import { Text } from '@/components/ui/typography';

const columns: BusterListColumn[] = [
  {
    dataIndex: 'name',
    title: 'Title',
    render: (data, { id }) => {
      const name = data || 'New Dashboard';
      return (
        <div className="mr-2 flex items-center space-x-1.5">
          <Text truncate>{name}</Text>
          <FavoriteStar
            id={id}
            type={ShareAssetType.DASHBOARD}
            iconStyle="tertiary"
            title={name}
            className="opacity-0 group-hover:opacity-100"
          />
        </div>
      );
    }
  },
  {
    dataIndex: 'last_edited',
    title: 'Last edited',
    width: 140,
    render: (data) => formatDate({ date: data, format: 'lll' })
  },
  {
    dataIndex: 'created_at',
    title: 'Created at',
    width: 140,
    render: (data) => formatDate({ date: data, format: 'lll' })
  },
  {
    dataIndex: 'sharing',
    title: 'Sharing',
    width: 65,
    render: (_, data) => getShareStatus(data)
  },
  {
    dataIndex: 'owner',
    title: 'Owner',
    width: 55,
    render: (_, data: BusterDashboardListItem) => {
      return <Avatar image={data?.owner?.avatar_url} name={data?.owner?.name} size={18} />;
    }
  }
];

export const DashboardListContent: React.FC<{
  loading: boolean;
  dashboardsList: BusterDashboardListItem[];
  className?: string;
}> = React.memo(({ loading, dashboardsList, className = '' }) => {
  const { mutateAsync: createDashboard, isPending: isCreatingDashboard } = useCreateDashboard();
  const onChangePage = useAppLayoutContextSelector((x) => x.onChangePage);
  const [selectedDashboardIds, setSelectedDashboardIds] = useState<string[]>([]);

  const rows: BusterListRow[] = useMemo(() => {
    return dashboardsList.map((dashboard) => {
      return {
        id: dashboard.id,
        data: dashboard,
        link: createBusterRoute({
          route: BusterRoutes.APP_DASHBOARD_ID,
          dashboardId: dashboard.id
        })
      };
    });
  }, [dashboardsList]);

  const onClickEmptyState = useMemoizedFn(async () => {
    const res = await createDashboard({});
    if (res?.dashboard?.id) {
      onChangePage({
        route: BusterRoutes.APP_DASHBOARD_ID,
        dashboardId: res.dashboard.id
      });
    }
  });

  return (
    <div className={`${className} relative flex h-full flex-col items-center`}>
      <BusterList
        rows={rows}
        columns={columns}
        selectedRowKeys={selectedDashboardIds}
        onSelectChange={setSelectedDashboardIds}
        emptyState={
          !loading ? (
            <ListEmptyStateWithButton
              title={`You don’t have any dashboards yet.`}
              buttonText="New dashboard"
              description={`You don’t have any dashboards. As soon as you do, they will start to  appear here.`}
              onClick={onClickEmptyState}
              loading={isCreatingDashboard}
            />
          ) : (
            <></>
          )
        }
      />

      <DashboardSelectedOptionPopup
        selectedRowKeys={selectedDashboardIds}
        onSelectChange={setSelectedDashboardIds}
        hasSelected={selectedDashboardIds.length > 0}
      />
    </div>
  );
});

DashboardListContent.displayName = 'DashboardListContent';
