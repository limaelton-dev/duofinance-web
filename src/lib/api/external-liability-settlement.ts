import { apiRequest } from './api-client';
import { normalizeExpenseFulfillment } from './normalize-fulfillment';
import type {
    ExternalLiabilitySettlementOptions,
    OpenExternalLiabilities,
    SettleExternalLiabilityInput,
    SettleExternalLiabilityResult,
} from '@/features/finances/types/external-liability-settlement';

const path = (spaceId: string, commitmentId: string, liabilityId: string) =>
    `/spaces/${spaceId}/financial-commitments/${commitmentId}/external-liabilities/${liabilityId}` as const;

export const getOpenExternalLiabilities = (
    spaceId: string,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<OpenExternalLiabilities>(
        `/spaces/${spaceId}/external-liabilities${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
    );

export const getExternalLiabilitySettlementOptions = (
    spaceId: string,
    commitmentId: string,
    liabilityId: string,
    signal?: AbortSignal,
) =>
    apiRequest<ExternalLiabilitySettlementOptions>(
        `${path(spaceId, commitmentId, liabilityId)}/settlement-options`,
        { signal },
    );

export const settleExternalLiability = (
    spaceId: string,
    commitmentId: string,
    liabilityId: string,
    body: SettleExternalLiabilityInput,
    csrfToken: string,
    idempotencyKey: string,
    signal?: AbortSignal,
) =>
    apiRequest<SettleExternalLiabilityResult>(
        `${path(spaceId, commitmentId, liabilityId)}/settlements`,
        { method: 'POST', body, csrfToken, idempotencyKey, signal },
    ).then(normalizeExpenseFulfillment);
