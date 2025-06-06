import { useMutation, useQuery, useQueryClient, UseQueryOptions } from '@tanstack/react-query';
import { collectionQueryKeys } from '@/api/query_keys/collection';
import {
  collectionsGetList,
  collectionsGetCollection,
  collectionsCreateCollection,
  collectionsUpdateCollection,
  collectionsDeleteCollection,
  shareCollection,
  unshareCollection,
  updateCollectionShare,
  addAssetToCollection,
  removeAssetFromCollection
} from './requests';
import { useMemo } from 'react';
import { useBusterNotifications } from '@/context/BusterNotifications';
import { useMemoizedFn } from '@/hooks';
import { useBusterAssetsContextSelector } from '@/context/Assets/BusterAssetsProvider';
import { create } from 'mutative';
import type { BusterCollection } from '@/api/asset_interfaces/collection';
import { RustApiError } from '../errors';

export const useGetCollectionsList = (
  filters: Omit<Parameters<typeof collectionsGetList>[0], 'page' | 'page_size'>,
  options?: Omit<
    UseQueryOptions<Awaited<ReturnType<typeof collectionsGetList>>, RustApiError>,
    'queryKey' | 'queryFn' | 'initialData'
  >
) => {
  const payload = useMemo(() => {
    return { page: 0, page_size: 3000, ...filters };
  }, [filters]);

  return useQuery({
    ...collectionQueryKeys.collectionsGetList(filters),
    queryFn: () => collectionsGetList(payload),
    ...options
  });
};

const useFetchCollection = () => {
  const getAssetPassword = useBusterAssetsContextSelector((state) => state.getAssetPassword);

  return useMemoizedFn(async (collectionId: string) => {
    const { password } = getAssetPassword(collectionId!);
    return collectionsGetCollection({ id: collectionId!, password });
  });
};

export const useGetCollection = <T = BusterCollection>(
  collectionId: string | undefined,
  select?: (data: BusterCollection) => T
) => {
  const fetchCollection = useFetchCollection();
  return useQuery({
    ...collectionQueryKeys.collectionsGetCollection(collectionId!),
    queryFn: () => {
      return fetchCollection(collectionId!);
    },
    enabled: !!collectionId,
    select
  });
};

export const useCreateCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: collectionsCreateCollection,
    onSuccess: (collection) => {
      queryClient.invalidateQueries({
        queryKey: collectionQueryKeys.collectionsGetList().queryKey
      });
      queryClient.setQueryData(
        collectionQueryKeys.collectionsGetCollection(collection.id).queryKey,
        collection
      );
    }
  });
};

export const useUpdateCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: collectionsUpdateCollection,
    onMutate: (variables) => {
      const queryKey = collectionQueryKeys.collectionsGetCollection(variables.id).queryKey;
      queryClient.setQueryData(queryKey, (v) => {
        return {
          ...v!,
          name: variables.name || v?.name!
        };
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        collectionQueryKeys.collectionsGetCollection(data.id).queryKey,
        data
      );
    }
  });
};

export const useDeleteCollection = () => {
  const { openConfirmModal } = useBusterNotifications();
  const queryClient = useQueryClient();

  const deleteCollection = useMemoizedFn(
    async ({
      id,
      useConfirmModal = true
    }: {
      useConfirmModal?: boolean;
      id: string | string[];
    }) => {
      const ids = Array.isArray(id) ? id : [id];
      const deleteMethod = async () => {
        await collectionsDeleteCollection({ ids });
      };

      if (useConfirmModal) {
        return await openConfirmModal({
          title: 'Delete Collection',
          content: 'Are you sure you want to delete this collection?',
          onOk: deleteMethod
        });
      }

      return deleteMethod();
    }
  );

  return useMutation({
    mutationFn: deleteCollection,
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: collectionQueryKeys.collectionsGetList().queryKey
      });
    }
  });
};

export const useShareCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: shareCollection,
    onMutate: ({ params, id }) => {
      const queryKey = collectionQueryKeys.collectionsGetCollection(id).queryKey;
      queryClient.setQueryData(queryKey, (previousData) => {
        return create(previousData!, (draft: BusterCollection) => {
          draft.individual_permissions = [...params, ...(draft.individual_permissions || [])];
        });
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        collectionQueryKeys.collectionsGetCollection(data.id).queryKey,
        data
      );
    }
  });
};

export const useUnshareCollection = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: unshareCollection,
    onMutate: (variables) => {
      const queryKey = collectionQueryKeys.collectionsGetCollection(variables.id).queryKey;
      queryClient.setQueryData(queryKey, (previousData) => {
        return create(previousData!, (draft: BusterCollection) => {
          draft.individual_permissions =
            draft.individual_permissions?.filter((t) => !variables.data.includes(t.email)) || [];
        });
      });
    },
    onSuccess: (data) => {
      queryClient.setQueryData(
        collectionQueryKeys.collectionsGetCollection(data.id).queryKey,
        data
      );
    }
  });
};

export const useUpdateCollectionShare = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: updateCollectionShare,
    onMutate: ({ params, id }) => {
      const queryKey = collectionQueryKeys.collectionsGetCollection(id).queryKey;
      queryClient.setQueryData(queryKey, (previousData) => {
        return create(previousData!, (draft) => {
          draft.individual_permissions =
            draft.individual_permissions?.map((t) => {
              const found = params.users?.find((v) => v.email === t.email);
              if (found) return found;
              return t;
            }) || [];

          if (params.publicly_accessible !== undefined) {
            draft.publicly_accessible = params.publicly_accessible;
          }
          if (params.public_password !== undefined) {
            draft.public_password = params.public_password;
          }
          if (params.public_expiry_date !== undefined) {
            draft.public_expiry_date = params.public_expiry_date;
          }
        });
      });
    }
  });
};

export const useAddAssetToCollection = (useInvalidate = true) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: addAssetToCollection,
    onSuccess: (_, variables) => {
      if (useInvalidate) {
        queryClient.invalidateQueries({
          queryKey: collectionQueryKeys.collectionsGetCollection(variables.id).queryKey
        });
      }
    }
  });
};

export const useRemoveAssetFromCollection = (useInvalidate = true) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: removeAssetFromCollection,
    onMutate: (variables) => {
      const queryKey = collectionQueryKeys.collectionsGetCollection(variables.id).queryKey;
      const previousData = queryClient.getQueryData<BusterCollection>(queryKey);
      if (!previousData) return;
      queryClient.setQueryData(queryKey, (previousData) => {
        const ids = variables.assets.map((a) => a.id);
        return create(previousData!, (draft) => {
          draft.assets = draft.assets?.filter((a) => !ids.includes(a.id)) || [];
        });
      });
    },
    onSuccess: (_, variables) => {
      if (useInvalidate) {
        queryClient.invalidateQueries({
          queryKey: collectionQueryKeys.collectionsGetCollection(variables.id).queryKey
        });
      }
    }
  });
};

export const useAddAndRemoveAssetsFromCollection = () => {
  const queryClient = useQueryClient();
  const fetchCollection = useFetchCollection();
  const { mutateAsync: addAssetToCollection } = useAddAssetToCollection(false);
  const { mutateAsync: removeAssetFromCollection } = useRemoveAssetFromCollection(false);

  const addAndRemoveAssetsToCollection = useMemoizedFn(
    async (variables: {
      collectionId: string;
      assets: {
        type: 'metric' | 'dashboard';
        id: string;
      }[];
    }) => {
      let currentCollection = queryClient.getQueryData<BusterCollection>(
        collectionQueryKeys.collectionsGetCollection(variables.collectionId).queryKey
      );
      if (!currentCollection) {
        currentCollection = await fetchCollection(variables.collectionId);
        queryClient.setQueryData(
          collectionQueryKeys.collectionsGetCollection(variables.collectionId).queryKey,
          currentCollection
        );
      }

      if (!currentCollection) throw new Error('Collection not found');

      const removedAssets =
        currentCollection.assets
          ?.filter((a) => !variables.assets.some((b) => b.id === a.id))
          .map((a) => ({
            type: a.asset_type as 'metric' | 'dashboard',
            id: a.id
          })) || [];
      const addedAssets = variables.assets.filter(
        (a) => !currentCollection.assets?.some((b) => b.id === a.id)
      );

      await Promise.all([
        addedAssets.length > 0 &&
          addAssetToCollection({
            id: variables.collectionId,
            assets: addedAssets
          }),
        removedAssets.length > 0 &&
          removeAssetFromCollection({
            id: variables.collectionId,
            assets: removedAssets
          })
      ]);
    }
  );

  return useMutation({
    mutationFn: addAndRemoveAssetsToCollection,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: collectionQueryKeys.collectionsGetCollection(variables.collectionId).queryKey
      });
    }
  });
};
