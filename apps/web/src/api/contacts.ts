import type {
  ActivityListResponse,
  BulkTagResponse,
  Contact,
  ContactListResponse,
  SortField,
  SortOrder,
  Tag,
  UpdateContactInput,
} from '@contacts/shared';
import { apiRequest } from './client';

export interface ContactListParams {
  q?: string;
  tag?: string[];
  company?: string;
  sort: SortField;
  order: SortOrder;
  limit: number;
  cursor?: string;
}

export const contactKeys = {
  all: ['contacts'] as const,
  lists: () => [...contactKeys.all, 'list'] as const,
  list: (params: ContactListParams) => [...contactKeys.lists(), params] as const,
  detail: (id: number) => [...contactKeys.all, 'detail', id] as const,
  activity: (id: number) => [...contactKeys.all, 'activity', id] as const,
};

export const tagKeys = {
  all: ['tags'] as const,
};

export const contactsApi = {
  list: (params: ContactListParams, signal?: AbortSignal) =>
    apiRequest<ContactListResponse>('/contacts', { query: { ...params }, signal }),

  get: (id: number, signal?: AbortSignal) => apiRequest<Contact>(`/contacts/${id}`, { signal }),

  update: (id: number, input: UpdateContactInput) =>
    apiRequest<Contact>(`/contacts/${id}`, { method: 'PATCH', body: input }),

  activity: (id: number, limit: number, cursor?: string | null, signal?: AbortSignal) =>
    apiRequest<ActivityListResponse>(`/contacts/${id}/activity`, {
      query: { limit, cursor },
      signal,
    }),

  addTag: (id: number, name: string) =>
    apiRequest<Contact>(`/contacts/${id}/tags`, { method: 'POST', body: { name } }),

  removeTag: (id: number, tagId: number) =>
    apiRequest<Contact>(`/contacts/${id}/tags/${tagId}`, { method: 'DELETE' }),

  bulkTag: (contactIds: number[], tagName: string) =>
    apiRequest<BulkTagResponse>('/contacts/bulk-tags', {
      method: 'POST',
      body: { contactIds, tagName },
    }),
};

export const tagsApi = {
  list: (signal?: AbortSignal) => apiRequest<Tag[]>('/tags', { signal }),
};
