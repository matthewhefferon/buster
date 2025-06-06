import { useMemoizedFn } from '@/hooks';
import {
  QueryClient,
  useQuery,
  useMutation,
  useQueryClient,
  UseQueryOptions
} from '@tanstack/react-query';
import {
  getListChats,
  getListChats_server,
  getChat,
  getChat_server,
  updateChat,
  deleteChat,
  getListLogs,
  duplicateChat,
  startChatFromAsset,
  updateChatMessageFeedback
} from './requests';
import type { IBusterChat, IBusterChatMessage } from '@/api/asset_interfaces/chat';
import { queryKeys } from '@/api/query_keys';
import { updateChatToIChat } from '@/lib/chat';
import { useMemo } from 'react';
import last from 'lodash/last';
import { prefetchGetMetricDataClient } from '../metrics/queryRequests';
import { useBusterNotifications } from '@/context/BusterNotifications';
import { useGetUserFavorites } from '../users/queryRequests';
import {
  useAddAssetToCollection,
  useRemoveAssetFromCollection
} from '../collections/queryRequests';
import { collectionQueryKeys } from '@/api/query_keys/collection';
import { RustApiError } from '../errors';

export const useGetListChats = (
  filters?: Omit<Parameters<typeof getListChats>[0], 'page_token' | 'page_size'>
) => {
  const filtersCompiled: Parameters<typeof getListChats>[0] = useMemo(
    () => ({ admin_view: false, page_token: 0, page_size: 3000, ...filters }),
    [filters]
  );

  const queryFn = useMemoizedFn(() => getListChats(filtersCompiled));

  return useQuery({
    ...queryKeys.chatsGetList(filters),
    queryFn
  });
};

export const prefetchGetListChats = async (
  params?: Parameters<typeof getListChats>[0],
  queryClientProp?: QueryClient
) => {
  const queryClient = queryClientProp || new QueryClient();

  await queryClient.prefetchQuery({
    ...queryKeys.chatsGetList(params),
    queryFn: () => getListChats_server(params)
  });

  return queryClient;
};

export const useGetListLogs = (
  filters?: Omit<Parameters<typeof getListLogs>[0], 'page_token' | 'page_size'>
) => {
  const filtersCompiled: Parameters<typeof getListLogs>[0] = useMemo(
    () => ({ page_token: 0, page_size: 3000, ...filters }),
    [filters]
  );

  const queryFn = useMemoizedFn(() => getListLogs(filtersCompiled));

  return useQuery({
    ...queryKeys.logsGetList(filters),
    queryFn
  });
};

export const useGetChat = <TData = IBusterChat>(
  params: Parameters<typeof getChat>[0],
  options?: Omit<UseQueryOptions<IBusterChat, RustApiError, TData>, 'queryKey' | 'queryFn'>
) => {
  const queryClient = useQueryClient();
  const queryFn = useMemoizedFn(() => {
    return getChat(params).then((chat) => {
      const { iChat, iChatMessages } = updateChatToIChat(chat, false);
      const lastMessageId = last(iChat.message_ids);
      const lastMessage = iChatMessages[lastMessageId!];
      if (lastMessage) {
        Object.values(lastMessage.response_messages).forEach((responseMessage) => {
          if (responseMessage.type === 'file' && responseMessage.file_type === 'metric') {
            prefetchGetMetricDataClient(
              { id: responseMessage.id, version_number: responseMessage.version_number },
              queryClient
            );
          }
        });
      }

      iChat.message_ids.forEach((messageId) => {
        queryClient.setQueryData(
          queryKeys.chatsMessages(messageId).queryKey,
          iChatMessages[messageId]
        );
      });

      return iChat;
    });
  });

  return useQuery({
    ...queryKeys.chatsGetChat(params.id),
    enabled: !!params.id,
    queryFn,
    select: options?.select,
    ...options
  });
};

export const useStartChatFromAsset = () => {
  const queryClient = useQueryClient();

  const mutationFn = useMemoizedFn(async (params: Parameters<typeof startChatFromAsset>[0]) => {
    const chat = await startChatFromAsset(params);
    const { iChat, iChatMessages } = updateChatToIChat(chat, false);
    iChat.message_ids.forEach((messageId) => {
      queryClient.setQueryData(
        queryKeys.chatsMessages(messageId).queryKey,
        iChatMessages[messageId]
      );
    });
    queryClient.setQueryData(queryKeys.chatsGetChat(chat.id).queryKey, iChat);
    return iChat;
  });

  return useMutation({
    mutationFn,
    onSuccess: (chat) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chatsGetList().queryKey
      });
    }
  });
};

export const prefetchGetChat = async (
  params: Parameters<typeof getChat>[0],
  queryClientProp?: QueryClient
) => {
  const queryClient = queryClientProp || new QueryClient();

  await queryClient.prefetchQuery({
    ...queryKeys.chatsGetChat(params.id),
    queryFn: async () => {
      return await getChat_server(params).then((chat) => {
        return updateChatToIChat(chat, true).iChat;
      });
    }
  });

  return queryClient;
};

export const useUpdateChat = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateChat,
    onMutate: (data) => {
      //this is actually handled in @useChatUpdate file
      //except for the chat title and feedback
      if (data.title) {
        const options = queryKeys.chatsGetChat(data.id);
        queryClient.setQueryData(options.queryKey, (old) => {
          return {
            ...old!,
            ...data
          };
        });
      }
    }
  });
};

export const useUpdateChatMessageFeedback = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateChatMessageFeedback,
    onMutate: ({ message_id, feedback }) => {
      const options = queryKeys.chatsMessages(message_id);
      queryClient.setQueryData(options.queryKey, (old) => {
        return {
          ...old!,
          feedback
        };
      });
    },
    onSuccess: (data) => {
      //
    }
  });
};

export const useDeleteChat = () => {
  const queryClient = useQueryClient();
  const { openConfirmModal } = useBusterNotifications();

  const mutationFn = useMemoizedFn(
    async ({
      useConfirmModal = true,
      data
    }: {
      data: Parameters<typeof deleteChat>[0];
      useConfirmModal?: boolean;
    }) => {
      const method = () => deleteChat(data);
      if (useConfirmModal) {
        return await openConfirmModal({
          title: 'Delete Chat',
          content: 'Are you sure you want to delete this chat?',
          onOk: method
        });
      }
      return method();
    }
  );

  return useMutation({
    mutationFn,
    onSuccess(data, variables, context) {
      queryClient.invalidateQueries({
        queryKey: queryKeys.chatsGetList().queryKey
      });
    }
  });
};

export const useGetChatMessageMemoized = () => {
  const queryClient = useQueryClient();

  const getChatMessageMemoized = useMemoizedFn((messageId: string) => {
    const options = queryKeys.chatsMessages(messageId);
    const queryKey = options.queryKey;
    return queryClient.getQueryData<IBusterChatMessage>(queryKey);
  });

  return getChatMessageMemoized;
};

export const useGetChatMemoized = () => {
  const queryClient = useQueryClient();

  const getChatMemoized = useMemoizedFn((chatId: string) => {
    const options = queryKeys.chatsGetChat(chatId);
    const queryKey = options.queryKey;
    return queryClient.getQueryData<IBusterChat>(queryKey);
  });

  return getChatMemoized;
};

export const useGetChatMessage = <TData = IBusterChatMessage>(
  messageId: string,
  options?: Omit<UseQueryOptions<IBusterChatMessage, RustApiError, TData>, 'queryKey' | 'queryFn'>
) => {
  return useQuery({
    ...queryKeys.chatsMessages(messageId),
    enabled: false, //this will come from the chat
    select: options?.select,
    ...options
  });
};

export const useDuplicateChat = () => {
  return useMutation({
    mutationFn: duplicateChat
  });
};

export const useSaveChatToCollections = () => {
  const queryClient = useQueryClient();
  const { data: userFavorites, refetch: refreshFavoritesList } = useGetUserFavorites();
  const { mutateAsync: addAssetToCollection } = useAddAssetToCollection();

  const saveChatToCollection = useMemoizedFn(
    async ({ chatIds, collectionIds }: { chatIds: string[]; collectionIds: string[] }) => {
      await Promise.all(
        collectionIds.map((collectionId) =>
          addAssetToCollection({
            id: collectionId,
            assets: chatIds.map((chatId) => ({ id: chatId, type: 'chat' }))
          })
        )
      );
    }
  );

  return useMutation({
    mutationFn: saveChatToCollection,
    onSuccess: (_, { collectionIds }) => {
      const collectionIsInFavorites = userFavorites.some((f) => {
        return collectionIds.includes(f.id);
      });
      if (collectionIsInFavorites) refreshFavoritesList();
      queryClient.invalidateQueries({
        queryKey: collectionIds.map(
          (id) => collectionQueryKeys.collectionsGetCollection(id).queryKey
        )
      });
    }
  });
};

export const useRemoveChatFromCollections = () => {
  const { data: userFavorites, refetch: refreshFavoritesList } = useGetUserFavorites();
  const { mutateAsync: removeAssetFromCollection } = useRemoveAssetFromCollection();
  const queryClient = useQueryClient();

  const removeChatFromCollection = useMemoizedFn(
    async ({ chatIds, collectionIds }: { chatIds: string[]; collectionIds: string[] }) => {
      await Promise.all(
        collectionIds.map((collectionId) =>
          removeAssetFromCollection({
            id: collectionId,
            assets: chatIds.map((chatId) => ({ id: chatId, type: 'chat' }))
          })
        )
      );
    }
  );

  return useMutation({
    mutationFn: removeChatFromCollection,
    onSuccess: (_, { collectionIds, chatIds }) => {
      const collectionIsInFavorites = userFavorites.some((f) => {
        return collectionIds.includes(f.id);
      });
      if (collectionIsInFavorites) refreshFavoritesList();

      queryClient.invalidateQueries({
        queryKey: collectionIds.map(
          (id) => collectionQueryKeys.collectionsGetCollection(id).queryKey
        )
      });
    }
  });
};
