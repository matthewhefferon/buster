import React from 'react';
import { DraggableAttributes } from '@dnd-kit/core';
import { SyntheticListenerMap } from '@dnd-kit/core/dist/hooks/utilities';
import { GripDotsVertical } from '@/components/ui/icons';
import { cn } from '@/lib/classMerge';

export const SelectAxisItemDragContainer = React.forwardRef<
  HTMLDivElement,
  {
    style?: React.CSSProperties;
    className?: string;
    isDragging?: boolean;
    listeners?: SyntheticListenerMap;
    attributes?: DraggableAttributes;
    children: React.ReactNode;
  }
>(({ style, className = '', children, listeners, attributes, isDragging }, ref) => {
  return (
    <div
      ref={ref}
      style={style}
      className={cn(
        'flex items-center space-x-1 overflow-hidden rounded-sm',
        'h-8',
        isDragging && 'bg-background cursor-grabbing border shadow-lg',
        className
      )}>
      <div
        {...listeners}
        {...attributes}
        className={cn(
          `text-icon-color hover:bg-item-active flex h-full w-8 min-w-8 cursor-grab items-center justify-center rounded`
        )}>
        <GripDotsVertical />
      </div>
      {children}
    </div>
  );
});

SelectAxisItemDragContainer.displayName = 'SelectAxisItemDragContainer';
