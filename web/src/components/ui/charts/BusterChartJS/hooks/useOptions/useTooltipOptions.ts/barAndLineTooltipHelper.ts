import type { ITooltipItem } from '../../../../BusterChartTooltip/interfaces';
import type { Chart, ChartDataset, TooltipItem, ChartTypeRegistry } from 'chart.js';
import { formatChartLabel } from '../../../helpers';
import { getPercentage } from './helper';
import type { BusterChartConfigProps } from '@/api/asset_interfaces/metric/charts';
import { formatChartValueDelimiter } from '@/components/ui/charts/commonHelpers';

export const barAndLineTooltipHelper = (
  datasets: ChartDataset[],
  dataPoints: TooltipItem<keyof ChartTypeRegistry>[],
  chart: Chart,
  columnLabelFormats: NonNullable<BusterChartConfigProps['columnLabelFormats']>,
  hasMultipleMeasures: boolean,
  keyToUsePercentage: string[],
  hasCategoryAxis: boolean,
  hasMultipleShownDatasets: boolean,
  percentageMode: undefined | 'stacked'
): ITooltipItem[] => {
  const dataPoint = dataPoints[0];
  const dataPointDataset = dataPoint.dataset;
  const dataPointDataIndex = dataPoint.dataIndex;
  const tooltipDatasets = datasets.filter((dataset) => dataset.hidden && !dataset.isTrendline);

  // if (!datapointIsInTooltip) {
  // const datapointIsInTooltip = tooltipDatasets.some(
  //   (dataset) => dataset.label === dataPointDataset.label
  // );
  //   return [];   //I removed the early return because if tooltip only had non plotted values it would not show
  // }

  const tooltipItems = tooltipDatasets.map<ITooltipItem>((tooltipDataset) => {
    const usePercentage =
      !!percentageMode || keyToUsePercentage.includes(tooltipDataset.label as string);
    const assosciatedData = datasets.find((dataset) => dataset.label === tooltipDataset.label);
    const colorItem = assosciatedData?.backgroundColor as string;
    const color = assosciatedData
      ? typeof colorItem === 'function'
        ? (assosciatedData?.borderColor as string)
        : (assosciatedData?.backgroundColor as string)
      : undefined;

    const rawValue = tooltipDataset.data[dataPoint.dataIndex] as number;

    const formattedPercentage = usePercentage
      ? getPercentage(
          rawValue,
          dataPointDataIndex,
          datasets.findIndex((dataset) => dataset.label === tooltipDataset.label),
          tooltipDataset.label as string,
          columnLabelFormats,
          chart,
          hasMultipleShownDatasets,
          percentageMode
        )
      : undefined;

    return {
      seriesType: 'bar',
      usePercentage,
      color,
      formattedLabel: formatChartLabel(
        tooltipDataset.label as string,
        columnLabelFormats,
        hasMultipleMeasures,
        hasCategoryAxis
      ),
      values: [
        {
          formattedValue: formatChartValueDelimiter(
            tooltipDataset.data[dataPoint.dataIndex] as number,
            tooltipDataset.label as string,
            columnLabelFormats
          ),
          formattedLabel: tooltipDataset.label as string,
          formattedPercentage
        }
      ]
    };
  });

  return tooltipItems;
};
