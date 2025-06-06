'use client';

import { useMemoizedFn } from '@/hooks';
import type { BusterChat, IBusterChat, IBusterChatMessage } from '@/api/asset_interfaces/chat';
import type {
  ChatEvent_GeneratingReasoningMessage,
  ChatEvent_GeneratingResponseMessage,
  ChatEvent_GeneratingTitle
} from '@/api/buster_socket/chats';
import { updateChatToIChat } from '@/lib/chat';
import { useBlackBoxMessage } from './useBlackBoxMessage';
import { useAppLayoutContextSelector } from '@/context/BusterAppLayout';
import { BusterRoutes } from '@/routes';
import { useSocketQueryOn } from '@/api/buster_socket_query';
import { useRef, useTransition } from 'react';
import { queryKeys } from '@/api/query_keys';
import { useQueryClient } from '@tanstack/react-query';
import { create } from 'mutative';
import {
  updateChatTitle,
  updateResponseMessage,
  updateReasoningMessage
} from './chatStreamMessageHelper';
import { useChatUpdate } from './useChatUpdate';
import { prefetchGetMetricDataClient } from '@/api/buster_rest/metrics';

export const useChatStreamMessage = () => {
  const queryClient = useQueryClient();
  const onChangePage = useAppLayoutContextSelector((x) => x.onChangePage);
  const { onUpdateChat, onUpdateChatMessage } = useChatUpdate();
  const chatRef = useRef<Record<string, IBusterChat>>({});
  const chatRefMessages = useRef<Record<string, IBusterChatMessage>>({});
  const [isPending, startTransition] = useTransition();

  const { checkBlackBoxMessage, removeBlackBoxMessage } = useBlackBoxMessage();

  const onUpdateChatMessageTransition = useMemoizedFn(
    (chatMessage: Parameters<typeof onUpdateChatMessage>[0]) => {
      const currentChatMessage = chatRefMessages.current[chatMessage.id] || {};
      const iChatMessage: IBusterChatMessage = create(currentChatMessage, (draft) => {
        Object.assign(draft || {}, chatMessage);
        if (chatMessage.id) {
          draft.id = chatMessage.id;
        }
      })!;
      chatRefMessages.current[chatMessage.id] = iChatMessage;

      onUpdateChatMessage(iChatMessage);

      startTransition(() => {
        //
      });
    }
  );

  const normalizeChatMessage = useMemoizedFn(
    (iChatMessages: Record<string, IBusterChatMessage>) => {
      for (const message of Object.values(iChatMessages)) {
        const options = queryKeys.chatsMessages(message.id);
        const queryKey = options.queryKey;
        queryClient.setQueryData(queryKey, message);
        chatRefMessages.current[message.id] = message;
      }
    }
  );

  const prefetchLastMessageMetricData = useMemoizedFn(
    (iChat: IBusterChat, iChatMessages: Record<string, IBusterChatMessage>) => {
      const lastMessageId = iChat.message_ids[iChat.message_ids.length - 1];
      const lastMessage = iChatMessages[lastMessageId];
      if (lastMessage?.response_message_ids) {
        Object.values(lastMessage.response_messages).forEach((responseMessage) => {
          if (responseMessage.type === 'file' && responseMessage.file_type === 'metric') {
            prefetchGetMetricDataClient(
              { id: responseMessage.id, version_number: responseMessage.version_number },
              queryClient
            );
            const options = queryKeys.metricsGetMetric(
              responseMessage.id,
              responseMessage.version_number
            );
            queryClient.invalidateQueries({ queryKey: options.queryKey });
          }
        });
      }
    }
  );

  const completeChatCallback = useMemoizedFn((d: BusterChat) => {
    const { iChat, iChatMessages } = updateChatToIChat(d, false);
    chatRef.current[iChat.id] = iChat;
    removeBlackBoxMessage({ messageId: iChat.message_ids[iChat.message_ids.length - 1] });
    normalizeChatMessage(iChatMessages);
    onUpdateChat(iChat);
    prefetchLastMessageMetricData(iChat, iChatMessages);

    queryClient.invalidateQueries({
      queryKey: [queryKeys.chatsGetList().queryKey, queryKeys.metricsGetList().queryKey]
    });
  });

  const stopChatCallback = useMemoizedFn((chatId: string) => {
    onUpdateChatMessage({
      id: chatId,
      isCompletedStream: true
    });
  });

  const initializeNewChatCallback = useMemoizedFn((d: BusterChat) => {
    const hasMultipleMessages = d.message_ids.length > 1;
    const { iChat, iChatMessages } = updateChatToIChat(d, true);
    chatRef.current[iChat.id] = iChat;
    normalizeChatMessage(iChatMessages);
    onUpdateChat(iChat);
    if (!hasMultipleMessages) {
      onChangePage({
        route: BusterRoutes.APP_CHAT_ID,
        chatId: iChat.id
      });
    }
  });

  const _generatingTitleCallback = useMemoizedFn((_: null, newData: ChatEvent_GeneratingTitle) => {
    const { chat_id } = newData;
    const currentChat = chatRef.current[chat_id];
    if (currentChat) {
      const updatedChat = updateChatTitle(currentChat, newData);
      chatRef.current[chat_id] = updatedChat;
      onUpdateChat(updatedChat);
    }
  });

  const _generatingResponseMessageCallback = useMemoizedFn(
    (_: null, d: ChatEvent_GeneratingResponseMessage) => {
      const { message_id } = d;
      const updatedMessage = updateResponseMessage(
        message_id,
        chatRefMessages.current[message_id],
        d
      );
      onUpdateChatMessageTransition({
        id: message_id,
        response_messages: updatedMessage?.response_messages,
        response_message_ids: updatedMessage?.response_message_ids
      });
    }
  );

  const _generatingReasoningMessageCallback = useMemoizedFn(
    (_: null, d: ChatEvent_GeneratingReasoningMessage) => {
      const { message_id, reasoning } = d;
      const updatedMessage = updateReasoningMessage(
        message_id,
        chatRefMessages.current[message_id],
        reasoning
      );

      checkBlackBoxMessage(updatedMessage, d); //we only trigger black box message if the reasoning message is completed

      onUpdateChatMessageTransition({
        id: message_id,
        reasoning_messages: updatedMessage?.reasoning_messages,
        reasoning_message_ids: updatedMessage?.reasoning_message_ids,
        isCompletedStream: false
      });
    }
  );

  useSocketQueryOn({
    responseEvent: '/chats/post:generatingTitle',
    callback: _generatingTitleCallback
  });

  useSocketQueryOn({
    responseEvent: '/chats/post:generatingResponseMessage',
    callback: _generatingResponseMessageCallback
  });

  useSocketQueryOn({
    responseEvent: '/chats/post:generatingReasoningMessage',
    callback: _generatingReasoningMessageCallback
  });

  return {
    initializeNewChatCallback,
    completeChatCallback,
    stopChatCallback
  };
};
