import React, { useMemo } from 'react';
import type {
  BusterChatResponseMessage_file,
  BusterChatResponseMessage_fileMetadata
} from '@/api/asset_interfaces';
import { Text } from '@/components/ui/typography';
import { motion, AnimatePresence } from 'framer-motion';
import { itemAnimationConfig } from './animationConfig';
import { StatusIndicator } from '@/components/ui/indicators';
import { FileCard } from '../card/FileCard';
import { TextAndVersionPill } from '../typography/TextAndVersionPill';
import { cn } from '@/lib/utils';

export const StreamingMessage_File: React.FC<{
  isSelectedFile: boolean;
  responseMessage: BusterChatResponseMessage_file;
  isCompletedStream: boolean;
}> = React.memo(({ isCompletedStream, responseMessage, isSelectedFile }) => {
  const {
    file_name,
    version_number,
    id,
    metadata = []
  } = (responseMessage || {}) as BusterChatResponseMessage_file;

  return (
    <AnimatePresence initial={!isCompletedStream}>
      <motion.div id={id} {...itemAnimationConfig}>
        <FileCard
          className={cn(isSelectedFile && 'border-foreground shadow-md')}
          fileName={<TextAndVersionPill fileName={file_name} versionNumber={version_number} />}>
          <StreamingMessageBody metadata={metadata} />
        </FileCard>
      </motion.div>
    </AnimatePresence>
  );
});

StreamingMessage_File.displayName = 'StreamingMessage_File';

const StreamingMessageBody: React.FC<{
  metadata: BusterChatResponseMessage_fileMetadata[];
}> = React.memo(({ metadata }) => {
  return (
    <div className="flex w-full flex-col items-center space-y-1 px-2.5 py-2">
      {metadata.map((metadata, index) => (
        <MetadataItem metadata={metadata} key={index} />
      ))}
    </div>
  );
});

StreamingMessageBody.displayName = 'ChatResponseMessageBody';

const MetadataItem: React.FC<{ metadata: BusterChatResponseMessage_fileMetadata }> = ({
  metadata
}) => {
  const { status, message, timestamp } = metadata;

  const timestampFormatted = useMemo(() => {
    if (!timestamp) return '';
    return `${timestamp} seconds`;
  }, [timestamp]);

  return (
    <div
      className="@container flex w-full items-center justify-start space-x-1.5"
      style={{
        containerType: 'inline-size'
      }}>
      <StatusIndicator status={status} />

      <Text truncate size="xs" className="leading-1.3" variant="secondary">
        {message}
      </Text>

      {timestamp && (
        <Text variant="tertiary" className="whitespace-nowrap @[190px]:hidden" size="xs">
          {timestampFormatted}
        </Text>
      )}
    </div>
  );
};
