import { apiRequest } from './api-client';
import type {
    RecurringList,
    RecurringDetail,
    RecurringOccurrences,
    OccurrenceOptions,
} from '@/features/finances/types/recurring-commitment';

function scope<
    T extends { commitment?: { spaceId: string }; spaceId?: string },
>(spaceId: string, value: T): T & { spaceId: string } {
    if (
        (value.commitment && value.commitment.spaceId !== spaceId) ||
        (value.spaceId && value.spaceId !== spaceId)
    )
        throw new Error('O registro pertence a outro espaço.');
    return { ...value, spaceId };
}
export const getRecurringList = (
    spaceId: string,
    month: string,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<RecurringList>(
        `/spaces/${spaceId}/recurring-commitments?month=${encodeURIComponent(month)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
    );
export const getRecurringDetail = (
    spaceId: string,
    id: string,
    signal?: AbortSignal,
) =>
    apiRequest<RecurringDetail>(
        `/spaces/${spaceId}/recurring-commitments/${id}`,
        { signal },
    ).then((value) => scope(spaceId, value));
export const getRecurringOccurrences = (
    spaceId: string,
    id: string,
    month: string,
    signal?: AbortSignal,
) =>
    apiRequest<RecurringOccurrences>(
        `/spaces/${spaceId}/recurring-commitments/${id}/occurrences?month=${encodeURIComponent(month)}`,
        { signal },
    ).then((value) => ({ ...value, spaceId }));
export const getRecurringOptions = (
    spaceId: string,
    id: string,
    date: string,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<OccurrenceOptions>(
        `/spaces/${spaceId}/recurring-commitments/${id}/occurrences/${date}/options${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
    ).then((value) => scope(spaceId, value));
export function recurringRequest<Result>(
    spaceId: string,
    suffix: string,
    body: unknown,
    csrfToken: string,
    idempotencyKey?: string,
    signal?: AbortSignal,
    method: 'POST' | 'PUT' = 'POST',
) {
    return apiRequest<Result>(
        `/spaces/${spaceId}/recurring-commitments${suffix}`,
        { method, body, csrfToken, idempotencyKey, signal },
    ).then((value) =>
        scope(spaceId, value as Result & { commitment?: { spaceId: string } }),
    );
}
