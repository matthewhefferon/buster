import React from 'react';
import { SelectAxisItemProps } from './interfaces';
import { useDroppable } from '@dnd-kit/core';
import { SelectAxisSortableItem } from './SelectAxisSortableItem';
import { StylingLabel } from '../../../Common';
import { SelectAxisContainerId } from '../config';
import { cn } from '@/lib/classMerge';

interface AvailableItemsListProps {
  items: SelectAxisItemProps[];
  activeZone: SelectAxisContainerId | null;
  isActive: boolean;
}

export const AvailableItemsList: React.FC<AvailableItemsListProps> = ({
  items,
  activeZone,
  isActive
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: SelectAxisContainerId.Available,
    data: {
      type: 'zone'
    }
  });

  const showDeleteHoverState =
    (isOver || isActive) && activeZone !== SelectAxisContainerId.Available;

  return (
    <StylingLabel
      id="available-items-list"
      label="Available"
      className="mb-4 h-full"
      ref={setNodeRef}>
      <div
        className={cn(
          'mb-1',
          showDeleteHoverState ? 'rounded bg-red-100 shadow-[0_0_3px_1px] shadow-red-300' : ''
        )}>
        {items.map((item) => (
          <SelectAxisSortableItem
            key={item.id}
            item={item}
            zoneId={SelectAxisContainerId.Available}
          />
        ))}
      </div>
    </StylingLabel>
  );
};
