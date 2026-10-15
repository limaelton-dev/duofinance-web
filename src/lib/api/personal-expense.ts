import { normalizeExpenseFulfillment } from './normalize-fulfillment';
import { apiRequest } from './api-client';
import type {
    PersonalExpenseDetail,
    PersonalExpenseHistory,
    PersonalExpenseInput,
    PersonalExpenseOptions,
    PersonalExpenseResult,
} from '@/features/finances/types/personal-expense';

export const getPersonalExpenseOptions = (
    spaceId: string,
    signal?: AbortSignal,
) =>
    apiRequest<PersonalExpenseOptions>(
        `/spaces/${spaceId}/personal-expense-options`,
        { signal },
    );
export const getPersonalExpenseHistory = (
    spaceId: string,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<PersonalExpenseHistory>(
        `/spaces/${spaceId}/personal-expenses${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
    );
export const getPersonalExpenseDetail = (
    spaceId: string,
    id: string,
    signal?: AbortSignal,
) =>
    apiRequest<PersonalExpenseDetail>(
        `/spaces/${spaceId}/financial-commitments/${id}`,
        { signal },
    ).then(normalizeExpenseFulfillment);
export const recordPersonalExpense = (
    spaceId: string,
    body: PersonalExpenseInput,
    csrfToken: string,
    idempotencyKey: string,
    signal?: AbortSignal,
) =>
    apiRequest<PersonalExpenseResult>(`/spaces/${spaceId}/personal-expenses`, {
        method: 'POST',
        body,
        csrfToken,
        idempotencyKey,
        signal,
    }).then(normalizeExpenseFulfillment);
