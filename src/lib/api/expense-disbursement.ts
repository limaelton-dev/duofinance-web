import { apiRequest } from './api-client';
import { normalizeExpenseFulfillment } from './normalize-fulfillment';
import type {
    ExpenseDisbursementInput,
    ExpenseDisbursementOptions,
    ExpenseDisbursementResult,
} from '@/features/finances/types/expense-disbursement';

export const getExpenseDisbursementOptions = (
    spaceId: string,
    id: string,
    signal?: AbortSignal,
) =>
    apiRequest<ExpenseDisbursementOptions>(
        `/spaces/${spaceId}/financial-commitments/${id}/disbursement-options`,
        { signal },
    );

export const recordExpenseDisbursement = (
    spaceId: string,
    id: string,
    body: ExpenseDisbursementInput,
    csrfToken: string,
    idempotencyKey: string,
    signal?: AbortSignal,
) =>
    apiRequest<ExpenseDisbursementResult>(
        `/spaces/${spaceId}/financial-commitments/${id}/disbursements`,
        { method: 'POST', body, csrfToken, idempotencyKey, signal },
    ).then(normalizeExpenseFulfillment);
