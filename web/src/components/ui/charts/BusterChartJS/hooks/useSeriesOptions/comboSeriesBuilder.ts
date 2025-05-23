import type { ChartProps } from '../../core';
import { LabelBuilderProps } from './useSeriesOptions';
import { SeriesBuilderProps } from './interfaces';
import { extractFieldsFromChain } from '../../../chartHooks';
import {
  DEFAULT_COLUMN_LABEL_FORMAT,
  DEFAULT_COLUMN_SETTINGS,
  ENABLED_DOTS_ON_LINE_SIZE
} from '@/api/asset_interfaces/metric';
import { barBuilder } from './barSeriesBuilder';
import { createDayjsDate } from '@/lib/date';
import { formatChartLabelDelimiter } from '../../../commonHelpers';
import { lineBuilder } from './lineSeriesBuilder';
import { ColumnSettings } from '@/api/asset_interfaces/metric/charts';

type ComboSeries = Array<
  ChartProps<'bar'>['data']['datasets'][number] | ChartProps<'line'>['data']['datasets'][number]
>;

export const comboSeriesBuilder_data = (props: SeriesBuilderProps): ComboSeries => {
  const { allYAxisKeysIndexes, allY2AxisKeysIndexes } = props;

  const comboSeries: ComboSeries = [];

  const makeYAxisKeyLoop = (items: SeriesBuilderProps['allYAxisKeysIndexes'], isY2: boolean) => {
    return items.map((item) => {
      return {
        ...item,
        isY2: isY2
      };
    });
  };

  const yAxisKeys = [
    ...makeYAxisKeyLoop(allYAxisKeysIndexes, false),
    ...makeYAxisKeyLoop(allY2AxisKeysIndexes, true)
  ];
  yAxisKeys.forEach(({ isY2, ...yAxisItem }, index) => {
    const renderResult = comboBuilder({
      ...props,
      yAxisItem,
      index,
      isY2
    });
    comboSeries.push(renderResult);
  });

  return comboSeries;
};

export const comboSeriesBuilder_labels = ({
  columnLabelFormats,
  xAxisKeys,
  dataset,
  allY2AxisKeysIndexes,
  allYAxisKeysIndexes,
  columnSettings
}: LabelBuilderProps): (string | Date)[] => {
  const xColumnLabelFormat = columnLabelFormats[xAxisKeys[0]] || DEFAULT_COLUMN_LABEL_FORMAT;
  const useDateLabels =
    xAxisKeys.length === 1 &&
    xColumnLabelFormat.columnType === 'date' &&
    xColumnLabelFormat.style === 'date';

  return dataset.source.map<string | Date>((item) => {
    if (useDateLabels) {
      const date = createDayjsDate(item[0] as string).toDate();
      return date;
    }

    return formatChartLabelDelimiter(item[0] as string, columnLabelFormats);
  });
};

type RenderBuilderProps = Pick<
  SeriesBuilderProps,
  | 'selectedDataset'
  | 'colors'
  | 'columnSettings'
  | 'columnLabelFormats'
  | 'xAxisKeys'
  | 'lineGroupType'
  | 'barGroupType'
> & {
  yAxisItem: SeriesBuilderProps['allYAxisKeysIndexes'][number];
  index: number;
};

const comboBuilder = (
  props: RenderBuilderProps & {
    yAxisItem: SeriesBuilderProps['allYAxisKeysIndexes'][number];
    index: number;
    isY2: boolean;
  }
): ComboSeries[number] => {
  const { yAxisItem, index, columnSettings, isY2 } = props;
  const yKey = extractFieldsFromChain(yAxisItem.name).at(-1)?.key!;
  const columnSetting = columnSettings[yKey];
  const columnVisualization =
    columnSetting?.columnVisualization || DEFAULT_COLUMN_SETTINGS.columnVisualization;
  const renderProps = {
    ...props,
    yAxisItem,
    index,
    yAxisID: isY2 ? 'y2' : 'y'
  };

  const renderResult = renderBuilder[columnVisualization](renderProps);

  return renderResult;
};

const dotSeriesBuilder = (
  props: RenderBuilderProps
): ChartProps<'line'>['data']['datasets'][number] => {
  const { yAxisItem, columnSettings, index } = props;
  const yKey = extractFieldsFromChain(yAxisItem.name).at(-1)?.key!;
  const uniqueColumnSetting = { ...columnSettings };
  const columnSetting = uniqueColumnSetting[yKey] || DEFAULT_COLUMN_SETTINGS;
  columnSetting.lineWidth = 0;
  columnSetting.lineSymbolSize = ENABLED_DOTS_ON_LINE_SIZE;

  return lineBuilder({ ...props, order: -index, columnSettings: uniqueColumnSetting });
};

const renderBuilder: Record<
  Required<ColumnSettings>['columnVisualization'],
  (props: RenderBuilderProps) => ComboSeries[number]
> = {
  bar: barBuilder,
  line: (props) => lineBuilder({ ...props, order: -props.index }),
  dot: dotSeriesBuilder
};
