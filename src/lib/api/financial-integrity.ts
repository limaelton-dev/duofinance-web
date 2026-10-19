import { apiRequest } from './api-client';
import type {
    ChangeInput,
    ChangeProposal,
    CorrectionInput,
    FinancialReversal,
    IntegrityFact,
    IntegrityOrigin,
    IntegrityResult,
    IntegrityTarget,
    OriginModality,
    VersionHistory,
} from '@/features/finances/types/financial-integrity';

const base = (spaceId: string, id: string): `/${string}` =>
    `/spaces/${spaceId}/financial-commitments/${id}`;
export async function getIntegrityOrigin(
    spaceId: string,
    id: string,
    modality: OriginModality,
    month: string,
    signal?: AbortSignal,
): Promise<IntegrityOrigin> {
    if (modality === 'AUTO') {
        const history = await apiRequest<VersionHistory>(
            `${base(spaceId, id)}/versions`,
            { signal },
        );
        modality =
            history.commitment?.modality === 'RECURRING'
                ? 'RECURRING'
                : history.targets?.some((target) => target.id !== id)
                  ? 'INSTALLMENT'
                  : 'ONE_TIME';
    }
    if (modality !== 'ONE_TIME') {
        const resource =
            modality === 'RECURRING'
                ? 'recurring-commitments'
                : 'installment-commitments';
        const root = await apiRequest<{
            commitment: IntegrityOrigin['commitment'] & {
                plan?: {
                    payoff?: {
                        id: string;
                        factId: string;
                        paidAmountInCents: number;
                        factDate: string;
                    } | null;
                };
            };
        }>(`/spaces/${spaceId}/${resource}/${id}`, { signal });
        if (
            root.commitment.id !== id ||
            (root.commitment.spaceId !== undefined &&
                root.commitment.spaceId !== spaceId)
        )
            throw new Error('O contexto do compromisso foi alterado.');
        const details = await apiRequest<{
            commitmentId: string;
            spaceId?: string;
            items: IntegrityTarget[];
        }>(
            `/spaces/${spaceId}/${resource}/${id}/${modality === 'RECURRING' ? `occurrences?month=${encodeURIComponent(month)}` : 'installments'}`,
            { signal },
        );
        if (
            details.commitmentId !== id ||
            (details.spaceId !== undefined && details.spaceId !== spaceId)
        )
            throw new Error(
                'O contexto dos registros financeiros foi alterado.',
            );
        return {
            spaceId,
            commitment: root.commitment,
            targets: root.commitment.plan?.payoff
                ? [
                      ...details.items,
                      {
                          id: root.commitment.plan.payoff.id,
                          globalPayoff: true,
                          amountInCents:
                              root.commitment.plan.payoff.paidAmountInCents,
                          fulfilledAmountInCents:
                              root.commitment.plan.payoff.paidAmountInCents,
                          dueDate: root.commitment.plan.payoff.factDate,
                          facts: [
                              {
                                  id: root.commitment.plan.payoff.factId,
                                  kind: 'DISBURSEMENT',
                                  amountInCents:
                                      root.commitment.plan.payoff
                                          .paidAmountInCents,
                                  factDate:
                                      root.commitment.plan.payoff.factDate,
                              },
                          ],
                      },
                  ]
                : details.items,
            facts: [],
        };
    }
    type Raw = {
        spaceId: string;
        commitment: IntegrityOrigin['commitment'];
        disbursements?: IntegrityFact[];
        receipts?: IntegrityFact[];
        externalLiabilities?: (IntegrityFact & {
            settlements?: IntegrityFact[];
        })[];
        adjustments?: IntegrityOrigin['adjustments'];
        cancellation?: IntegrityOrigin['cancellation'];
    };
    const raw = await apiRequest<Raw>(base(spaceId, id), { signal });
    if (raw.spaceId !== spaceId || raw.commitment.id !== id)
        throw new Error('O contexto do compromisso foi alterado.');
    const facts: IntegrityFact[] = [
        ...(raw.disbursements ?? []).map((f) => ({
            ...f,
            kind: 'DISBURSEMENT' as const,
        })),
        ...(raw.receipts ?? []).map((f) => ({
            ...f,
            kind: 'RECEIPT' as const,
        })),
        ...(raw.externalLiabilities ?? []).flatMap((f) => [
            { ...f, kind: 'EXTERNAL_LIABILITY' as const },
            ...(f.settlements ?? []).map((s) => ({
                ...s,
                kind: 'EXTERNAL_SETTLEMENT' as const,
            })),
        ]),
    ];
    return {
        spaceId: raw.spaceId,
        commitment: raw.commitment,
        targets: [],
        facts,
        adjustments: raw.adjustments,
        cancellation: raw.cancellation,
    };
}
export const getIntegrityVersions = (
    spaceId: string,
    id: string,
    signal?: AbortSignal,
) =>
    apiRequest<VersionHistory>(`${base(spaceId, id)}/versions`, {
        signal,
    }).then((value) => ({ ...value, spaceId }));
export const getFinancialReversals = (
    spaceId: string,
    id: string,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<{ items: FinancialReversal[]; nextCursor: string | null }>(
        `${base(spaceId, id)}/reversals${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
    ).then((value) => ({ ...value, spaceId }));
export const getChangeProposals = (
    spaceId: string,
    cursor: string | null,
    signal?: AbortSignal,
    id?: string,
) => {
    const path: `/${string}` = id
        ? `${base(spaceId, id)}/change-proposals`
        : `/spaces/${spaceId}/financial-change-proposals`;
    return apiRequest<{
        items: ChangeProposal[];
        nextCursor: string | null;
        totalCount: number;
    }>(`${path}${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`, {
        signal,
    }).then((value) => ({ ...value, spaceId }));
};

export type IntegrityOperation = 'ADJUST' | 'CANCEL' | 'REVERSE' | 'CHANGE';
const endpoints: Record<IntegrityOperation, [string, string]> = {
    ADJUST: ['adjustment-preview', 'adjustments'],
    CANCEL: ['cancellation-preview', 'cancellations'],
    REVERSE: ['reversal-preview', 'reversals'],
    CHANGE: ['change-preview', 'versions'],
};
export type IntegrityWork = {
    id: string;
    operation: IntegrityOperation;
    phase: 'PREVIEW' | 'CONFIRM';
    input: CorrectionInput | ChangeInput;
    requiresAcceptance?: boolean;
};
export const executeIntegrity = (
    spaceId: string,
    work: IntegrityWork,
    csrfToken: string,
    idempotencyKey: string,
    signal: AbortSignal,
) =>
    apiRequest<IntegrityResult>(
        `${base(spaceId, work.id)}/${work.phase === 'PREVIEW' ? endpoints[work.operation][0] : work.operation === 'CHANGE' && work.requiresAcceptance ? 'change-proposals' : endpoints[work.operation][1]}`,
        {
            method: 'POST',
            body: work.input,
            csrfToken,
            ...(work.phase === 'CONFIRM' ? { idempotencyKey } : {}),
            signal,
        },
    );
export type DecisionWork = {
    commitmentId: string;
    proposalId: string;
    acceptance: boolean;
    expectedCommitmentVersion: number;
    expectedProposalVersion: number;
    expectedSpaceVersion: number;
};
export const decideFinancialProposal = (
    spaceId: string,
    work: DecisionWork,
    csrfToken: string,
    idempotencyKey: string,
    signal: AbortSignal,
) =>
    apiRequest<{ proposal: ChangeProposal }>(
        `${base(spaceId, work.commitmentId)}/change-proposals/${work.proposalId}/${work.acceptance ? 'acceptance' : 'rejection'}`,
        {
            method: 'POST',
            body: {
                expectedCommitmentVersion: work.expectedCommitmentVersion,
                expectedProposalVersion: work.expectedProposalVersion,
                expectedSpaceVersion: work.expectedSpaceVersion,
            },
            csrfToken,
            idempotencyKey,
            signal,
        },
    );
