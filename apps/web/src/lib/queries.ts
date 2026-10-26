import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { Completion, CompletionMap, CompletionStatus, Item, Settings } from '@pulsar/shared';
import { toCompletionMap } from '@pulsar/shared';
import * as api from './api';
import { useToast } from '../components/Toast';

export const itemsKey = ['items'] as const;
export const settingsKey = ['settings'] as const;

/** Items + completions in one query (SPEC §4: completions cover a wide window). */
export function useItemsQuery(since?: string, until?: string): UseQueryResult<api.ItemsResponse> {
  return useQuery({
    queryKey: [...itemsKey, since ?? null, until ?? null],
    queryFn: () => api.fetchItems(since, until),
    placeholderData: keepPreviousData,
  });
}

export function useSettingsQuery(): UseQueryResult<{ settings: Settings }> {
  return useQuery({
    queryKey: settingsKey,
    queryFn: api.fetchSettings,
  });
}

export function completionMapFor(
  itemId: string,
  completions: readonly Completion[],
): CompletionMap {
  return toCompletionMap(itemId, completions);
}

/** Optimistic completion setter: PUT/DELETE with cache patch + rollback. */
export function useSetCompletion() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (vars: { itemId: string; date: string; status: CompletionStatus | null }) => {
      if (vars.status === null) {
        await api.deleteCompletion(vars.itemId, vars.date);
      } else {
        await api.putCompletion(vars.itemId, vars.date, vars.status);
      }
    },
    onMutate: async (vars): Promise<{ prev: Array<[QueryKey, api.ItemsResponse | undefined]> }> => {
      await qc.cancelQueries({ queryKey: itemsKey });
      const prev = qc.getQueriesData<api.ItemsResponse>({ queryKey: itemsKey });
      qc.setQueriesData<api.ItemsResponse>({ queryKey: itemsKey }, (old) => {
        if (!old) return old;
        const completions = old.completions.filter(
          (c) => !(c.itemId === vars.itemId && c.date === vars.date),
        );
        if (vars.status) {
          completions.push({
            itemId: vars.itemId,
            date: vars.date,
            status: vars.status,
            updatedAt: new Date().toISOString(),
          });
        }
        return { ...old, completions };
      });
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      ctx?.prev?.forEach(([key, data]) => qc.setQueryData(key, data));
      toast("Couldn't save that change.");
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: itemsKey });
    },
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: api.createItem,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: itemsKey });
    },
    onError: (err) => {
      toast(formatApiError(err, "Couldn't create the item."));
    },
  });
}

export function useUpdateItem() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (vars: { id: string; body: Parameters<typeof api.updateItem>[1] }) =>
      api.updateItem(vars.id, vars.body),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: itemsKey });
    },
    onError: (err) => {
      toast(formatApiError(err, "Couldn't save the item."));
    },
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (id: string) => api.deleteItem(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: itemsKey });
    },
    onError: (err) => {
      toast(formatApiError(err, "Couldn't delete the item."));
    },
  });
}

export function useUpdateSettings() {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: (body: Partial<Settings>) => api.updateSettings(body),
    onSuccess: (data) => {
      qc.setQueryData(settingsKey, data);
    },
    onError: (err) => {
      toast(formatApiError(err, "Couldn't save settings."));
    },
  });
}

export function useTestNotification() {
  return useMutation({
    mutationFn: api.postTestNotification,
  });
}

export function formatApiError(err: unknown, fallback: string): string {
  if (err instanceof api.ApiError) {
    if (err.details.length > 0) return err.details.join(' · ');
    if (err.status === 0) return 'Server unreachable — is the API running?';
    return `${fallback} (${err.message})`;
  }
  return fallback;
}

export type { Item, Settings, Completion, CompletionStatus, CompletionMap };
