'use client';

import { BusterChatMessageReasoning_file } from '@/api/asset_interfaces';
import { SyntaxHighlighterLightTheme } from '@/components/ui/typography/AppCodeBlock';
import React, { useEffect, useMemo, useState } from 'react';
import { Text } from '@/components/ui/typography';
import pluralize from 'pluralize';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { TextAndVersionPill } from '../../typography/TextAndVersionPill';
import { FileCard } from '../../card/FileCard';
import { cn } from '@/lib/classMerge';

const style = SyntaxHighlighterLightTheme;

type LineSegment = {
  type: 'text' | 'hidden';
  content: string;
  lineNumber: number;
  numberOfLines?: number;
};

export const StreamingMessageCode: React.FC<
  BusterChatMessageReasoning_file & {
    isCompletedStream: boolean;
    buttons?: React.ReactNode;
  }
> = ({ status, isCompletedStream, file, file_name, version_number, buttons }) => {
  const { text = '', modified } = file;

  const [lineSegments, setLineSegments] = useState<LineSegment[]>([]);

  useEffect(() => {
    const processText = () => {
      // Split the text into lines, keeping empty lines
      const lines = (text || '').split('\n');
      const segments: LineSegment[] = [];
      let currentLine = 1;

      if (!modified || modified.length === 0) {
        // If no modified ranges, process the entire text as visible
        lines.forEach((line) => {
          segments.push({
            type: 'text',
            content: line,
            lineNumber: currentLine++
          });
        });
      } else {
        // Sort modified ranges to ensure proper processing
        const sortedModified = [...modified].sort((a, b) => a[0] - b[0]);

        let lastEnd = 0;
        for (const [start, end] of sortedModified) {
          // Add visible lines before the hidden section
          for (let i = lastEnd; i < start - 1; i++) {
            segments.push({
              type: 'text',
              content: lines[i],
              lineNumber: currentLine++
            });
          }

          // Add hidden section
          const hiddenLineCount = end - start + 1;
          segments.push({
            type: 'hidden',
            content: '',
            lineNumber: currentLine,
            numberOfLines: hiddenLineCount
          });
          currentLine += hiddenLineCount;
          lastEnd = end;
        }

        // Add remaining visible lines after the last hidden section
        for (let i = lastEnd; i < lines.length; i++) {
          segments.push({
            type: 'text',
            content: lines[i],
            lineNumber: currentLine++
          });
        }
      }

      setLineSegments(segments);
    };

    processText();
  }, [text, modified]);

  return (
    <FileCard
      fileName={useMemo(
        () => (
          <TextAndVersionPill fileName={file_name} versionNumber={version_number} />
        ),
        [file_name, version_number]
      )}
      headerButtons={buttons}>
      <div className="w-full overflow-x-auto p-3">
        {lineSegments.map((segment, index) => (
          <div
            key={`${segment.lineNumber}-${index}`}
            className={cn(
              'line-number pr-1',
              !isCompletedStream && 'animate-in fade-in duration-700'
            )}>
            {segment.type === 'text' ? (
              <MemoizedSyntaxHighlighter lineNumber={segment.lineNumber} text={segment.content} />
            ) : (
              <HiddenSection numberOfLinesUnmodified={segment.numberOfLines || 0} />
            )}
          </div>
        ))}
      </div>
    </FileCard>
  );
};

const HiddenSection: React.FC<{
  numberOfLinesUnmodified: number;
}> = ({ numberOfLinesUnmodified }) => (
  <div className="my-2! flex w-full items-center space-x-1 first:mt-0">
    <div className="bg-border h-[0.5px] w-full" />
    <Text variant="tertiary" size={'xs'} className="whitespace-nowrap">
      {`${numberOfLinesUnmodified} ${pluralize('line', numberOfLinesUnmodified)} unmodified`}
    </Text>
    <div className="bg-border h-[0.5px] w-4" />
  </div>
);

const lineNumberStyles: React.CSSProperties = {
  minWidth: '2.25em'
};
const MemoizedSyntaxHighlighter = React.memo(
  ({ lineNumber, text }: { lineNumber: number; text: string }) => {
    return (
      <SyntaxHighlighter
        style={style}
        language={'yaml'}
        showLineNumbers
        startingLineNumber={lineNumber}
        lineNumberStyle={lineNumberStyles}
        lineNumberContainerStyle={{ color: 'red' }}
        className={`m-0! w-fit! border-none! p-0!`}>
        {text}
      </SyntaxHighlighter>
    );
  }
);

MemoizedSyntaxHighlighter.displayName = 'MemoizedSyntaxHighlighter';
