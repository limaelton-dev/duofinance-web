import { apiRequest } from './api-client';
import type {
    PlannedExpenseInput,
    PlannedExpenseList,
    PlannedExpenseResult,
} from '@/features/finances/types/planned-expense';
export const getPlannedExpenses = (
    spaceId: string,
    month: string,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<PlannedExpenseList>(
        `/spaces/${spaceId}/planned-expenses?month=${encodeURIComponent(month)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
    );
export const createPlannedExpense = (
    spaceId: string,
    body: PlannedExpenseInput,
    csrfToken: string,
    idempotencyKey: string,
    signal?: AbortSignal,
) =>
    apiRequest<PlannedExpenseResult>(`/spaces/${spaceId}/planned-expenses`, {
        method: 'POST',
        body,
        csrfToken,
        idempotencyKey,
        signal,
    });
