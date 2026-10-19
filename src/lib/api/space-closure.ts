import { apiRequest } from './api-client';
import type {
    ClosureDiagnostic,
    ClosureFinalSummary,
    ClosureFinancialValidation,
    ClosureHistory,
    ClosurePlanReview,
    ClosureView,
    ClosureWork,
} from '@/features/spaces/closure/types';

const base = (spaceId: string): `/${string}` => `/spaces/${spaceId}/closure`;
function verifyContext<
    T extends { spaceId: string; closure?: ClosureView | null },
>(spaceId: string, value: T): T {
    if (
        value.spaceId !== spaceId ||
        (value.closure && value.closure.spaceId !== spaceId)
    )
        throw new Error('O espaço da consulta foi alterado.');
    return value;
}

function diagnosticIdentity(value: ClosureDiagnostic) {
    return JSON.stringify({
        spaceId: value.spaceId,
        closure: value.closure,
        totalCount: value.finance.totalCount,
        counts: value.finance.counts,
        outstandingAmounts: value.finance.outstandingAmounts,
        financiallyReady: value.finance.financiallyReady,
    });
}

export async function getClosureDiagnostic(
    spaceId: string,
    signal: AbortSignal,
): Promise<ClosureDiagnostic> {
    const limit = 100;
    const first = await apiRequest<ClosureDiagnostic>(
        `${base(spaceId)}/diagnostic?limit=${limit}&offset=0`,
        { signal },
    );
    verifyContext(spaceId, first);
    const result = structuredClone(first);
    const identity = diagnosticIdentity(first);
    const seen = new Set(
        first.finance.blockers.map((item) => `${item.type}:${item.originId}`),
    );
    if (seen.size !== first.finance.blockers.length)
        throw new Error('O diagnóstico mudou. Atualize a consulta completa.');
    while (result.finance.blockers.length < first.finance.totalCount) {
        const page = await apiRequest<ClosureDiagnostic>(
            `${base(spaceId)}/diagnostic?limit=${limit}&offset=${result.finance.blockers.length}`,
            { signal },
        );
        if (
            diagnosticIdentity(page) !== identity ||
            !page.finance.blockers.length
        )
            throw new Error(
                'O diagnóstico mudou. Atualize a consulta completa.',
            );
        for (const blocker of page.finance.blockers) {
            const key = `${blocker.type}:${blocker.originId}`;
            if (seen.has(key))
                throw new Error(
                    'O diagnóstico mudou. Atualize a consulta completa.',
                );
            seen.add(key);
            result.finance.blockers.push(blocker);
        }
    }
    if (result.finance.blockers.length !== first.finance.totalCount)
        throw new Error('O diagnóstico está incompleto. Atualize a consulta.');
    return result;
}
export const getClosurePlanReview = (spaceId: string, signal: AbortSignal) =>
    apiRequest<ClosurePlanReview>(`${base(spaceId)}/plan-review`, {
        signal,
    }).then((result) => verifyContext(spaceId, result));
export const getClosureFinancialValidation = (
    spaceId: string,
    signal: AbortSignal,
) =>
    apiRequest<ClosureFinancialValidation>(
        `${base(spaceId)}/financial-validation`,
        { signal },
    ).then((result) => verifyContext(spaceId, result));
export const getClosureFinalSummary = (spaceId: string, signal: AbortSignal) =>
    apiRequest<ClosureFinalSummary>(`${base(spaceId)}/final-summary`, {
        signal,
    }).then((result) => verifyContext(spaceId, result));
export const getClosureHistory = (
    spaceId: string,
    cursor: string | null,
    signal: AbortSignal,
) =>
    apiRequest<Omit<ClosureHistory, 'spaceId'>>(
        `${base(spaceId)}/history?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
    ).then((result) => {
        for (const item of result.items) verifyContext(spaceId, item.snapshot);
        return { ...result, spaceId };
    });
export const executeClosure = (
    spaceId: string,
    work: ClosureWork,
    csrfToken: string,
    idempotencyKey: string,
    signal: AbortSignal,
) =>
    apiRequest<ClosureView>(
        `${base(spaceId)}${work.operation === 'start' ? '' : `/${work.operation}`}`,
        {
            method: 'POST',
            body: work.input,
            csrfToken,
            idempotencyKey,
            signal,
        },
    );
