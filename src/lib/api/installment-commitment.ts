import { apiRequest } from './api-client';
import type {
    InstallmentList,
    InstallmentDetail,
    InstallmentItem,
    InstallmentOptions,
    AnticipationOptions,
    ResolutionOptions,
} from '@/features/finances/types/installment-commitment';
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
export const getInstallmentList = (
    spaceId: string,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<InstallmentList>(
        `/spaces/${spaceId}/installment-commitments${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
    );
export const getInstallmentDetail = (
    spaceId: string,
    id: string,
    signal?: AbortSignal,
) =>
    apiRequest<InstallmentDetail>(
        `/spaces/${spaceId}/installment-commitments/${id}`,
        { signal },
    ).then((value) => scope(spaceId, value));
export const getInstallmentItems = (
    spaceId: string,
    id: string,
    signal?: AbortSignal,
) =>
    apiRequest<{
        spaceId: string;
        commitmentId: string;
        items: InstallmentItem[];
    }>(`/spaces/${spaceId}/installment-commitments/${id}/installments`, {
        signal,
    }).then((value) => ({ ...value, spaceId }));
export const getInstallmentOptions = (
    spaceId: string,
    id: string,
    installmentId: string,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<InstallmentOptions>(
        `/spaces/${spaceId}/installment-commitments/${id}/installments/${installmentId}/options${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
    ).then((value) => scope(spaceId, value));
export const getAnticipationOptions = (
    spaceId: string,
    id: string,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<AnticipationOptions>(
        `/spaces/${spaceId}/installment-commitments/${id}/anticipation-options${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
    ).then((value) => ({ ...value, spaceId }));
export const getResolutionOptions = (
    spaceId: string,
    id: string,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<ResolutionOptions>(
        `/spaces/${spaceId}/installment-commitments/${id}/resolution-options${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
    ).then((value) => ({ ...value, spaceId }));
export function installmentRequest<Result>(
    spaceId: string,
    suffix: string,
    body: unknown,
    csrfToken: string,
    idempotencyKey?: string,
    signal?: AbortSignal,
) {
    return apiRequest<Result>(
        `/spaces/${spaceId}/installment-commitments${suffix}`,
        { method: 'POST', body, csrfToken, idempotencyKey, signal },
    ).then((value) =>
        scope(spaceId, value as Result & { commitment?: { spaceId: string } }),
    );
}
