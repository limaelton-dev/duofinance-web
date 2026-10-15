import { apiRequest } from './api-client';
import type {
    IncomeDetail,
    IncomeHistory,
    IncomeInput,
    IncomeOptions,
    IncomeReceiptInput,
    IncomeReceiptOptions,
    IncomeResult,
} from '@/features/finances/types/income';

export const getIncomeOptions = (spaceId: string, signal?: AbortSignal) =>
    apiRequest<IncomeOptions>(`/spaces/${spaceId}/income-options`, { signal });
export const getIncomeHistory = (
    spaceId: string,
    status: string,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<IncomeHistory>(
        `/spaces/${spaceId}/incomes?status=${status}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
    );
export const getIncomeDetail = (
    spaceId: string,
    id: string,
    signal?: AbortSignal,
) =>
    apiRequest<IncomeDetail>(`/spaces/${spaceId}/financial-commitments/${id}`, {
        signal,
    });
export const getIncomeReceiptOptions = (
    spaceId: string,
    id: string,
    signal?: AbortSignal,
) =>
    apiRequest<IncomeReceiptOptions>(
        `/spaces/${spaceId}/financial-commitments/${id}/receipt-options`,
        { signal },
    );
export const recordIncome = (
    spaceId: string,
    body: IncomeInput,
    csrfToken: string,
    idempotencyKey: string,
    signal?: AbortSignal,
) =>
    apiRequest<IncomeResult>(`/spaces/${spaceId}/incomes`, {
        method: 'POST',
        body,
        csrfToken,
        idempotencyKey,
        signal,
    });
export const recordIncomeReceipt = (
    spaceId: string,
    id: string,
    body: IncomeReceiptInput,
    csrfToken: string,
    idempotencyKey: string,
    signal?: AbortSignal,
) =>
    apiRequest<IncomeResult>(
        `/spaces/${spaceId}/financial-commitments/${id}/receipts`,
        { method: 'POST', body, csrfToken, idempotencyKey, signal },
    );
