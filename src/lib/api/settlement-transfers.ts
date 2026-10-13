import { apiRequest } from './api-client';
import type {
    TransferDetail,
    TransferDirection,
    TransferHistory,
    TransferInput,
    TransferOptions,
    TransferResult,
} from '@/features/finances/types/settlement-transfer';

export const getTransferOptions = (
    spaceId: string,
    direction: TransferDirection,
    cycleId: string | null,
    cursor: string | null,
    signal?: AbortSignal,
) => {
    const search = new URLSearchParams({ direction });
    if (cycleId) search.set('cycleId', cycleId);
    if (cursor) search.set('cursor', cursor);
    return apiRequest<TransferOptions>(
        `/spaces/${spaceId}/settlement-transfers/options?${search}`,
        { signal },
    );
};

export const recordTransfer = (
    spaceId: string,
    body: TransferInput,
    csrfToken: string,
    idempotencyKey: string,
    signal?: AbortSignal,
) =>
    apiRequest<TransferResult>(`/spaces/${spaceId}/settlement-transfers`, {
        method: 'POST',
        body,
        csrfToken,
        idempotencyKey,
        signal,
    });

export const getTransfer = (
    spaceId: string,
    transferId: string,
    signal?: AbortSignal,
) =>
    apiRequest<TransferDetail>(
        `/spaces/${spaceId}/settlement-transfers/${transferId}`,
        { signal },
    );

export const getTransferHistory = (
    spaceId: string,
    cycleId: string | null,
    obligationId: string | null,
    cursor: string | null,
    signal?: AbortSignal,
) => {
    const search = new URLSearchParams();
    if (cycleId) search.set('cycleId', cycleId);
    if (obligationId) search.set('obligationId', obligationId);
    if (cursor) search.set('cursor', cursor);
    const query = search.size ? `?${search}` : '';
    return apiRequest<TransferHistory>(
        `/spaces/${spaceId}/settlement-transfers${query}`,
        { signal },
    );
};
