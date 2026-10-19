import { apiRequest } from './api-client';
import type {
    AssignmentInput,
    AssignmentOptions,
    AssignmentResult,
    FinalizationInput,
    FinalizationResult,
    OffsetHistory,
    OffsetInput,
    OffsetOptions,
    OffsetResult,
    OffsetScope,
    ResolutionKind,
    ReversalInput,
    ReversalOptions,
    ReversalResult,
    RuleCommitment,
    SelectedCycles,
    SpecificRuleInput,
    SpecificRuleResult,
    WaiverHistory,
    WaiverInput,
    WaiverOptions,
    WaiverResult,
} from '@/features/finances/types/settlement-depth';
import type { PositionDirection } from '@/features/finances/types/inter-member-position';

const obligationPath = (spaceId: string, id: string) =>
    `/spaces/${spaceId}/inter-member-obligations/${id}` as const;
const resolutionPath = (spaceId: string, kind: ResolutionKind, id: string) =>
    `/spaces/${spaceId}/settlement-${kind === 'TRANSFER' ? 'transfers' : 'offsets'}/${id}` as const;
function search(values: Record<string, string | null | undefined>) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values))
        if (value) query.set(key, value);
    return query.size ? `?${query}` : '';
}
export const getAssignmentOptions = (
    spaceId: string,
    id: string,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<AssignmentOptions>(
        `${obligationPath(spaceId, id)}/settlement-options${search({ cursor })}`,
        { signal },
    );
export const moveObligation = (
    spaceId: string,
    id: string,
    body: AssignmentInput,
    csrfToken: string,
    idempotencyKey: string,
    signal?: AbortSignal,
) =>
    apiRequest<AssignmentResult>(
        `${obligationPath(spaceId, id)}/settlement-assignment`,
        { method: 'POST', body, csrfToken, idempotencyKey, signal },
    );
export const getRuleCommitment = (
    spaceId: string,
    id: string,
    signal?: AbortSignal,
) =>
    apiRequest<RuleCommitment>(
        `/spaces/${spaceId}/financial-commitments/${id}`,
        { signal },
    );
export const configureSpecificRule = (
    spaceId: string,
    id: string,
    body: SpecificRuleInput,
    csrfToken: string,
    idempotencyKey: string,
    signal?: AbortSignal,
) =>
    apiRequest<SpecificRuleResult>(
        `/spaces/${spaceId}/financial-commitments/${id}/settlement-rule`,
        { method: 'PUT', body, csrfToken, idempotencyKey, signal },
    );
export const finalizeCycle = (
    spaceId: string,
    id: string,
    body: FinalizationInput,
    csrfToken: string,
    idempotencyKey: string,
    signal?: AbortSignal,
) =>
    apiRequest<FinalizationResult>(
        `/spaces/${spaceId}/settlement-cycles/${id}/finalize`,
        { method: 'POST', body, csrfToken, idempotencyKey, signal },
    );
export const getSelectedCycles = (
    spaceId: string,
    cycleIds: string[],
    direction: PositionDirection,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<SelectedCycles>(
        `/spaces/${spaceId}/settlement-cycles/summary${search({ cycleIds: [...cycleIds].sort().join(','), direction, cursor })}`,
        { signal },
    );
export const getOffsetOptions = (
    spaceId: string,
    scope: OffsetScope,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<OffsetOptions>(
        `/spaces/${spaceId}/settlement-offsets/options${search({ cycleIds: [...scope.cycleIds].sort().join(','), obligationIds: [...scope.obligationIds].sort().join(','), cursor })}`,
        { signal },
    );
export const recordOffset = (
    spaceId: string,
    body: OffsetInput,
    csrfToken: string,
    idempotencyKey: string,
    signal?: AbortSignal,
) =>
    apiRequest<OffsetResult>(`/spaces/${spaceId}/settlement-offsets`, {
        method: 'POST',
        body,
        csrfToken,
        idempotencyKey,
        signal,
    });
export const getOffset = (spaceId: string, id: string, signal?: AbortSignal) =>
    apiRequest<OffsetResult>(`/spaces/${spaceId}/settlement-offsets/${id}`, {
        signal,
    });
export const getOffsetHistory = (
    spaceId: string,
    cycleId: string | null,
    obligationId: string | null,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<OffsetHistory>(
        `/spaces/${spaceId}/settlement-offsets${search({ cycleId, obligationId, cursor })}`,
        { signal },
    );
export const getWaiverOptions = (
    spaceId: string,
    id: string,
    signal?: AbortSignal,
) =>
    apiRequest<WaiverOptions>(`${obligationPath(spaceId, id)}/waiver-options`, {
        signal,
    });
export const waiveObligation = (
    spaceId: string,
    id: string,
    body: WaiverInput,
    csrfToken: string,
    idempotencyKey: string,
    signal?: AbortSignal,
) =>
    apiRequest<WaiverResult>(`${obligationPath(spaceId, id)}/waivers`, {
        method: 'POST',
        body,
        csrfToken,
        idempotencyKey,
        signal,
    });
export const getWaiverHistory = (
    spaceId: string,
    id: string,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<WaiverHistory>(
        `${obligationPath(spaceId, id)}/waivers${search({ cursor })}`,
        { signal },
    );
export const getReversalOptions = (
    spaceId: string,
    kind: ResolutionKind,
    id: string,
    signal?: AbortSignal,
) =>
    apiRequest<ReversalOptions>(
        `${resolutionPath(spaceId, kind, id)}/reversal-options`,
        { signal },
    );
export const reverseSettlement = (
    spaceId: string,
    kind: ResolutionKind,
    id: string,
    body: ReversalInput,
    csrfToken: string,
    idempotencyKey: string,
    signal?: AbortSignal,
) =>
    apiRequest<ReversalResult>(
        `${resolutionPath(spaceId, kind, id)}/reversals`,
        { method: 'POST', body, csrfToken, idempotencyKey, signal },
    );
