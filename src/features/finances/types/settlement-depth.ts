import type { Member } from './shared-expense';
import type { SettlementOrigin } from './settlement-origin';
import type { TransferObligation } from './settlement-transfer';
import type {
    SettlementCycle,
    SettlementCycleDetail,
} from './settlement-cycle';

export type AssignmentCycle = {
    id: string;
    targetDate: string;
    status: 'OPEN' | 'FINALIZED';
    version: number;
};
export type VersionedCycle = { cycleId: string; version: number };
export type SettlementContext = {
    spaceId: string;
    spaceStatus: 'ACTIVE' | 'CLOSING' | 'CLOSED';
    spaceVersion: number;
    actorMemberId: string;
    members: Member[];
    referenceDate: string;
};
export type SettlementResult = {
    spaceId: string;
    affectedCycleIds: string[];
    replayed: boolean;
};
export type AssignmentOptions = {
    spaceId: string;
    spaceVersion: number;
    obligation: {
        id: string;
        version: number;
        cycleId: string | null;
        remainingAmountInCents: number;
    };
    currentCycle: AssignmentCycle | null;
    cycles: AssignmentCycle[];
    nextCursor: string | null;
    eligible: boolean;
    blockingReason: string | null;
    today: string;
};
export type AssignmentInput = {
    settlement:
        | { mode: 'NONE' }
        | { mode: 'DATE'; targetDate: string }
        | { mode: 'CYCLE'; cycleId: string };
    expectedObligationVersion: number;
    expectedSpaceVersion: number;
    expectedCycleVersions: VersionedCycle[];
};
export type AssignmentResult = SettlementResult & {
    obligation: AssignmentOptions['obligation'];
    settlementCycle: AssignmentCycle | null;
};
export type SpecificRuleInput = {
    rule: { kind: 'MONTHLY_DAY'; dayOfMonth: number };
    expectedCommitmentVersion: number;
    expectedSpaceVersion: number;
};
export type RuleCommitment = {
    spaceId: string;
    spaceStatus: SettlementContext['spaceStatus'];
    commitment: {
        id: string;
        version: number;
        kind: 'EXPENSE' | 'INCOME';
        description: string;
        factDate: string;
    };
    settlementRule?: {
        source: 'SPECIFIC' | 'INHERITED';
        rule: SpecificRuleInput['rule'] | null;
        version: number;
    };
};
export type SpecificRuleResult = SettlementResult & {
    commitmentId: string;
    commitmentVersion: number;
    settlementRule: NonNullable<RuleCommitment['settlementRule']> & {
        referenceDate: string;
        suggestedTargetDate: string | null;
    };
};
export type FinalizationInput = {
    expectedSpaceVersion: number;
    expectedCycleVersion: number;
};
export type FinalizationResult = SettlementResult & {
    cycle: AssignmentCycle & {
        finalizedAt: string;
        finalizedByPersonId: string;
    };
};
export type SelectedCycles = Omit<SettlementCycleDetail, 'cycle' | 'items'> & {
    selectedCycles: (SettlementCycle & { readOnly: boolean })[];
    totals: SettlementCycle['totals'] & {
        transferTotalAmountInCents: string;
        transferCount: number;
        grossPayableAmountInCents: string;
        grossReceivableAmountInCents: string;
    };
    position: SettlementCycle['position'];
    items: (SettlementCycleDetail['items'][number] & { cycleId: string })[];
};
export type OffsetScope = { cycleIds: string[]; obligationIds: string[] };
export type OffsetAllocationInput = {
    obligationId: string;
    expectedObligationVersion: number;
    amountInCents: number;
};
export type OffsetOptions = SettlementContext & {
    canRecord: boolean;
    scope: OffsetScope;
    cycles: AssignmentCycle[];
    maximumAmountInCents: string;
    reason: string | null;
    items: TransferObligation[];
    preview: {
        amountInCents: string;
        allocations: OffsetAllocationInput[];
        complete: boolean;
    };
    page: {
        direction: 'ALL' | 'PAYABLE' | 'RECEIVABLE';
        pageSize: 20;
        nextCursor: string | null;
    };
};
export type OffsetInput = {
    scope: OffsetScope;
    expectedSpaceVersion: number;
    factDate: string;
    expectedCycleVersions: VersionedCycle[];
    allocations: OffsetAllocationInput[];
};
export type OffsetResult = SettlementResult & {
    offset: {
        id: string;
        amountInCents: number;
        reversedAmountInCents?: number;
        effectiveAmountInCents?: number;
        reversalId?: string | null;
        factDate: string;
        registeredAt: string;
        createdByPersonId: string;
    };
    allocations: {
        id: string;
        obligationId: string;
        cycleId: string | null;
        debtorMemberId: string;
        creditorMemberId: string;
        amountInCents: number;
        origin: SettlementOrigin;
    }[];
};
export type OffsetHistory = {
    spaceId: string;
    items: OffsetResult[];
    page: { nextCursor: string | null };
};
export type WaiverOptions = SettlementContext & {
    obligation: AssignmentOptions['obligation'] & {
        status: string;
        debtorMemberId: string;
        creditorMemberId: string;
    };
    settlementCycle: AssignmentCycle | null;
    canWaive: boolean;
    waiverBlockReason: string | null;
};
export type WaiverInput = {
    amountInCents: number;
    factDate: string;
    expectedSpaceVersion: number;
    expectedObligationVersion: number;
    reason?: string;
};
export type WaiverResult = SettlementResult & {
    waiver: {
        id: string;
        obligationId: string;
        creditorMemberId: string;
        amountInCents: number;
        factDate: string;
        registeredAt: string;
        createdByPersonId: string;
        reason: string | null;
    };
    obligation: AssignmentOptions['obligation'] & { status: string };
};
export type WaiverHistory = {
    spaceId: string;
    obligationId: string;
    items: WaiverResult[];
    page: { nextCursor: string | null };
};
export type ResolutionKind = 'TRANSFER' | 'OFFSET';
export type ReversalOptions = SettlementContext & {
    original: {
        kind: ResolutionKind;
        id: string;
        amountInCents: number;
        factDate: string;
        registeredAt: string;
        createdByPersonId: string;
    };
    allocations: {
        id: string;
        obligationId: string;
        originCommitmentId: string;
        debtorMemberId: string;
        creditorMemberId: string;
        amountInCents: number;
        cycleId: string | null;
    }[];
    previousReversals: {
        id: string;
        amountInCents: number;
        factDate: string;
        registeredAt: string;
        createdByPersonId: string;
    }[];
    obligations: {
        id: string;
        version: number;
        cycleId: string | null;
        remainingAmountInCents: number;
        status: string;
    }[];
    cycles: AssignmentCycle[];
    reversibleAmountInCents: number;
    requiresCorrectionCycle: boolean;
    canReverse: boolean;
    reversalBlockReason: string | null;
    impact: {
        originCommitmentId: string;
        debtorMemberId: string | null;
        creditorMemberId: string | null;
        remainingAmountInCents: number;
        requiresCorrectionCycle: boolean;
        affectedCurrentCycleIds: string[];
        newCorrectionObligation: boolean;
    }[];
};
export type ReversalInput = {
    expectedSpaceVersion: number;
    factDate: string;
    expectedObligationVersions: { obligationId: string; version: number }[];
    expectedCycleVersions: VersionedCycle[];
    applications: { allocationId: string; amountInCents: number }[];
    correctionCycleId?: string;
};
export type ReversalResult = SettlementResult & {
    reversal: {
        id: string;
        originalKind: ResolutionKind;
        originalId: string;
        amountInCents: number;
        factDate: string;
        registeredAt: string;
        createdByPersonId: string;
    };
    applications: {
        id: string;
        originalAllocationId: string;
        obligationId: string;
        originalCycleId: string | null;
        correctionCycleId: string | null;
        effectObligationId: string | null;
        amountInCents: number;
        debtorMemberId: string;
        creditorMemberId: string;
    }[];
    effects: {
        obligationId: string;
        originCommitmentId: string;
        remainingAmountInCents: number;
        cycleId: string | null;
        version: number;
        status: string;
    }[];
};
