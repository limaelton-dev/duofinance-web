import { apiRequest } from './api-client';
import { normalizeExpenseFulfillment } from './normalize-fulfillment';
import type {
    ExternalLiabilityInput,
    ExternalLiabilityOptions,
} from '@/features/finances/types/credit-card-purchase';
import type { ExpenseDisbursementResult } from '@/features/finances/types/expense-disbursement';

export const getExternalLiabilityOptions = (
    spaceId: string,
    id: string,
    signal?: AbortSignal,
    cursor?: string | null,
) =>
    apiRequest<ExternalLiabilityOptions>(
        `/spaces/${spaceId}/financial-commitments/${id}/external-liability-options${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
    );
export const recordExternalLiability = (
    spaceId: string,
    id: string,
    body: ExternalLiabilityInput,
    csrfToken: string,
    idempotencyKey: string,
    signal?: AbortSignal,
) =>
    apiRequest<ExpenseDisbursementResult>(
        `/spaces/${spaceId}/financial-commitments/${id}/external-liabilities`,
        { method: 'POST', body, csrfToken, idempotencyKey, signal },
    ).then(normalizeExpenseFulfillment);
