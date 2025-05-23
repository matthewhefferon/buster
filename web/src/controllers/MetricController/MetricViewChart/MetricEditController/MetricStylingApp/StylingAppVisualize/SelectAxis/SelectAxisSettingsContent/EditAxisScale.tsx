import React from 'react';
import { LabelAndInput } from '../../../Common/LabelAndInput';
import { IBusterMetricChartConfig } from '@/api/asset_interfaces';
import { Select } from '@/components/ui/select';

const options: { label: string; value: IBusterMetricChartConfig['yAxisScaleType'] }[] = [
  { label: 'Linear', value: 'linear' },
  { label: 'Logarithmic', value: 'log' }
];

export const EditAxisScale: React.FC<{
  scaleType:
    | IBusterMetricChartConfig['yAxisScaleType']
    | IBusterMetricChartConfig['y2AxisScaleType'];
  onChangeAxisScale: (value: IBusterMetricChartConfig['yAxisScaleType']) => void;
}> = React.memo(({ scaleType, onChangeAxisScale }) => {
  return (
    <LabelAndInput label="Scale">
      <Select items={options} value={scaleType} onChange={onChangeAxisScale} />
    </LabelAndInput>
  );
});
EditAxisScale.displayName = 'EditAxisScale';
