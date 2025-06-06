'use client';

import React from 'react';
import { FileContainerSegmentProps } from './interfaces';
import { AppSegmented } from '@/components/ui/segmented';
import { useChatLayoutContextSelector } from '../../ChatLayoutContext';
import type { FileView, ReasoningFileView } from '../../ChatLayoutContext/useLayoutConfig';
import { type SegmentedItem } from '@/components/ui/segmented';
import { useMemoizedFn } from '@/hooks';

const segmentOptions: { label: string; value: ReasoningFileView }[] = [
  { label: 'Reasoning', value: 'reasoning' }
];

export const ReasoningContainerHeaderSegment: React.FC<FileContainerSegmentProps> = React.memo(
  ({ selectedFileView }) => {
    const onSetFileView = useChatLayoutContextSelector((x) => x.onSetFileView);

    const onChange = useMemoizedFn((fileView: SegmentedItem<FileView>) => {
      onSetFileView({ fileView: fileView.value });
    });

    return (
      <AppSegmented
        type="button"
        options={segmentOptions}
        value={selectedFileView}
        onChange={onChange}
      />
    );
  }
);

ReasoningContainerHeaderSegment.displayName = 'ReasoningContainerHeaderSegment';
