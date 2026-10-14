import type { Today } from '@/features/today/types/today';
import { apiRequest } from './api-client';

export const getToday = (spaceId: string, signal?: AbortSignal) =>
    apiRequest<Today>(`/spaces/${spaceId}/today`, { signal });
