'use client';

import React, { useMemo } from 'react';
import { MetricViewChartContent } from './MetricViewChartContent';
import { MetricViewChartHeader } from './MetricViewChartHeader';
import { useGetMetric, useGetMetricData } from '@/api/buster_rest/metrics';
import { useMemoizedFn, useMount } from '@/hooks';
import { inputHasText } from '@/lib/text';
import { MetricChartEvaluation } from './MetricChartEvaluation';
import { ChartType } from '@/api/asset_interfaces/metric/charts/enum';
import { AnimatePresence, motion } from 'framer-motion';
import { cn } from '@/lib/classMerge';
import { useIsMetricReadOnly } from '@/context/Metrics/useIsMetricReadOnly';
import { MetricSaveFilePopup } from './MetricSaveFilePopup';
import { useUpdateMetricChart } from '@/context/Metrics';

export const MetricViewChart: React.FC<{
  metricId: string;
  readOnly?: boolean;
  className?: string;
  cardClassName?: string;
}> = React.memo(
  ({ metricId, readOnly: readOnlyProp = false, className = '', cardClassName = '' }) => {
    const { data: metric } = useGetMetric(
      { id: metricId },
      {
        select: ({
          chart_config,
          name,
          description,
          time_frame,
          permission,
          evaluation_score,
          evaluation_summary,
          version_number,
          versions
        }) => ({
          name,
          description,
          time_frame,
          permission,
          evaluation_score,
          evaluation_summary,
          chart_config,
          version_number,
          versions
        })
      }
    );
    const {
      data: metricData,
      isFetched: isFetchedMetricData,
      error: metricDataError
    } = useGetMetricData({ id: metricId }, { enabled: false });

    const { onUpdateMetricName } = useUpdateMetricChart({ metricId });
    const { name, description, time_frame, evaluation_score, evaluation_summary } = metric || {};

    const isTable = metric?.chart_config.selectedChartType === ChartType.Table;
    const { isReadOnly, isVersionHistoryMode, isViewingOldVersion } = useIsMetricReadOnly({
      metricId,
      readOnly: readOnlyProp
    });
    const loadingData = !isFetchedMetricData;
    const errorData = !!metricDataError;
    const showEvaluation = !!evaluation_score && !!evaluation_summary;

    const onSetTitle = useMemoizedFn((title: string) => {
      if (inputHasText(title)) {
        onUpdateMetricName({
          name: title
        });
      }
    });

    if (!metric) return null;

    return (
      <div className={cn('flex h-full flex-col justify-between space-y-3.5 p-5', className)}>
        <MetricViewChartCard
          loadingData={loadingData}
          errorData={errorData}
          isTable={isTable}
          className={cardClassName}>
          <MetricViewChartHeader
            className="px-4"
            name={name}
            description={description}
            timeFrame={time_frame}
            onSetTitle={onSetTitle}
            readOnly={isReadOnly}
          />
          <div className={'border-border border-b'} />
          <MetricViewChartContent
            chartConfig={metric.chart_config}
            metricData={metricData?.data || []}
            dataMetadata={metricData?.data_metadata}
            fetchedData={isFetchedMetricData}
            errorMessage={metricDataError?.message}
            metricId={metricId}
            readOnly={isReadOnly}
          />
        </MetricViewChartCard>

        <AnimatePresenceWrapper show={showEvaluation}>
          <MetricChartEvaluation
            evaluationScore={evaluation_score}
            evaluationSummary={evaluation_summary}
          />
        </AnimatePresenceWrapper>

        {!isReadOnly && !isVersionHistoryMode && !isViewingOldVersion && (
          <MetricSaveFilePopup metricId={metricId} />
        )}
      </div>
    );
  }
);

MetricViewChart.displayName = 'MetricViewChart';

const MetricViewChartCard: React.FC<{
  children: React.ReactNode;
  loadingData: boolean;
  errorData: boolean;
  isTable: boolean;
  className?: string;
}> = React.memo(({ children, loadingData, errorData, isTable, className }) => {
  const cardClass = useMemo(() => {
    if (loadingData || errorData) return 'h-full max-h-[600px]';
    if (isTable) return '';
    return 'h-full max-h-[600px]';
  }, [isTable, loadingData, errorData]);

  return (
    <div
      className={cn(
        'bg-background flex flex-col overflow-hidden rounded border shadow',
        cardClass,
        className
      )}>
      {children}
    </div>
  );
});

MetricViewChartCard.displayName = 'MetricViewChartCard';

const animation = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: 0.4 }
};

const AnimatePresenceWrapper: React.FC<{
  children: React.ReactNode;
  show: boolean;
}> = ({ children, show }) => {
  return (
    <AnimatePresence initial={false}>
      {show && <motion.div {...animation}>{children}</motion.div>}
    </AnimatePresence>
  );
};
