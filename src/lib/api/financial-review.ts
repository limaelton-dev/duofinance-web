import { apiRequest } from './api-client';
import type {
    FinancialForecast,
    FinancialOverview,
    FinancialReviewView,
    FinancialTimeline,
    FinancialReviewContext,
} from '@/features/finances/types/financial-review';

function assertScope<T extends FinancialReviewContext>(
    value: T,
    spaceId: string,
    month: string,
    memberId: string | null,
): T {
    if (
        value.spaceId !== spaceId ||
        value.month !== month ||
        value.memberId !== memberId
    )
        throw new Error('O contexto da consulta financeira foi alterado.');
    return value;
}

function parameters(
    month: string,
    memberId: string | null,
    cursor?: string | null,
) {
    const query = new URLSearchParams({ month });
    if (memberId !== null) query.set('memberId', memberId);
    if (cursor != null) query.set('cursor', cursor);
    return query;
}
export function getFinancialOverview(
    spaceId: string,
    month: string,
    memberId: string | null,
    signal?: AbortSignal,
) {
    return apiRequest<FinancialOverview>(
        `/spaces/${spaceId}/financial-overview?${parameters(month, memberId)}`,
        { signal },
    ).then((value) => assertScope(value, spaceId, month, memberId));
}
export function getFinancialTimeline(
    spaceId: string,
    month: string,
    view: FinancialReviewView,
    memberId: string | null,
    cursor: string | null,
    signal?: AbortSignal,
) {
    const query = parameters(month, memberId, cursor);
    query.set('view', view);
    return apiRequest<FinancialTimeline>(
        `/spaces/${spaceId}/financial-timeline?${query}`,
        { signal },
    ).then((value) => {
        if (value.view !== view)
            throw new Error('A visão da consulta financeira foi alterada.');
        return assertScope(value, spaceId, month, memberId);
    });
}
export function getFinancialForecast(
    spaceId: string,
    month: string,
    memberId: string | null,
    cursor: string | null,
    signal?: AbortSignal,
) {
    return apiRequest<FinancialForecast>(
        `/spaces/${spaceId}/financial-forecast?${parameters(month, memberId, cursor)}`,
        { signal },
    ).then((value) => assertScope(value, spaceId, month, memberId));
}
