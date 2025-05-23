import React from 'react';
import { LabelAndInput } from '../../../Common/LabelAndInput';
import type { IColumnLabelFormat } from '@/api/asset_interfaces/metric/charts/columnLabelInterfaces';
import { Input } from '@/components/ui/inputs';

export const EditSuffix: React.FC<{
  suffix: IColumnLabelFormat['suffix'];
  onUpdateColumnConfig: (columnLabelFormat: Partial<IColumnLabelFormat>) => void;
}> = React.memo(
  ({ suffix, onUpdateColumnConfig }) => {
    return (
      <LabelAndInput label="Suffix">
        <Input
          className="w-full!"
          min={0}
          defaultValue={suffix}
          placeholder="dollars"
          onChange={(e) =>
            onUpdateColumnConfig({
              suffix: e.target.value ?? ''
            })
          }
        />
      </LabelAndInput>
    );
  },
  () => {
    return true;
  }
);
EditSuffix.displayName = 'EditSuffix';
