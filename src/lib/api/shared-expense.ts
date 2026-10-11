import { apiRequest } from './api-client';
import type {
    ExpenseInput,
    ExpenseOptions,
    ExpenseDetail,
    ExpenseResult,
    FinancialContext,
} from '@/features/finances/types/shared-expense';
export const getExpenseOptions = (
    spaceId: string,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<ExpenseOptions>(
        `/spaces/${spaceId}/shared-cash-expense-options${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
    );
export const getFinancialContext = (spaceId: string, signal?: AbortSignal) =>
    apiRequest<FinancialContext>(`/spaces/${spaceId}/financial-entry-context`, {
        signal,
    });
export const getExpenseDetail = (
    spaceId: string,
    id: string,
    signal?: AbortSignal,
) =>
    apiRequest<ExpenseDetail>(
        `/spaces/${spaceId}/financial-commitments/${id}`,
        { signal },
    );
export const recordExpense = (
    spaceId: string,
    body: ExpenseInput,
    csrfToken: string,
    idempotencyKey: string,
    signal?: AbortSignal,
) =>
    apiRequest<ExpenseResult>(`/spaces/${spaceId}/shared-cash-expenses`, {
        method: 'POST',
        body,
        csrfToken,
        idempotencyKey,
        signal,
    });
