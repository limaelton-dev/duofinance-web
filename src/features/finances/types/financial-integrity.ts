import type { Member, Settlement, Split } from './shared-expense';

export type Modality = 'ONE_TIME' | 'RECURRING' | 'INSTALLMENT';
export type OriginModality = Modality | 'AUTO';
export type OriginalKind =
    'DISBURSEMENT' | 'RECEIPT' | 'EXTERNAL_LIABILITY' | 'EXTERNAL_SETTLEMENT';
export type IntegrityFact = {
    id: string;
    kind: OriginalKind;
    amountInCents: number;
    factDate: string;
    recordedByPersonId?: string;
};
export type IntegrityTarget = {
    globalPayoff?: boolean;
    id: string | null;
    referenceDate?: string;
    stateVersion?: number | null;
    amountInCents: number | null;
    fulfilledAmountInCents: number;
    facts: IntegrityFact[];
    externalSettlements?: IntegrityFact[];
    dueDate?: string;
    position?: number;
};
export type IntegrityOrigin = {
    spaceId: string;
    commitment: {
        id: string;
        spaceId?: string;
        version: number;
        kind: 'EXPENSE' | 'INCOME';
        modality: Modality;
        description: string;
        amountInCents?: number | null;
        scope?: 'PERSONAL' | 'SHARED';
        versions?: {
            version: number;
            effectiveFrom: string;
            description: string;
            amountInCents: number | null;
        }[];
    };
    targets: IntegrityTarget[];
    facts: IntegrityFact[];
    adjustments?: {
        id: string;
        reason: string;
        factDate: string;
        amountInCents: number;
        direction: string;
    }[];
    cancellation?: { reason: string; factDate: string } | null;
};
export type MemberImpact = {
    memberId: string;
    currentAmountInCents: string;
    proposedAmountInCents: string;
    deltaInCents: string;
    requiresAcceptance: boolean;
};
export type RecurringMemberImpact = {
    memberId: string;
    currentFixedAmountInCents: string;
    proposedFixedAmountInCents: string;
    fixedDeltaInCents: string;
    currentVariableWeight: number;
    proposedVariableWeight: number;
    variableWeightDelta: number;
    currentOccurrenceCount: number;
    proposedOccurrenceCount: number;
    requiresAcceptance: boolean;
};
export type RecurringChangeImpact = {
    effectiveFrom: string;
    assessmentThrough: string;
    currentVersion: number;
    proposedVersion: number;
    currentOccurrences: string[];
    proposedOccurrences: string[];
    impactByMember: RecurringMemberImpact[];
    requiresAcceptance: boolean;
    materializedOccurrencesPreserved: {
        referenceDate: string;
        status: 'PENDING' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'CANCELLED';
        economicVersion: number;
    }[];
};
export type IntegrityPreview = {
    requiresFullReversal?: boolean;
    targets?: {
        id: string;
        dueDate?: string | null;
        amountInCents: number;
        proposed?: { amountInCents: number };
    }[];
    reconciliation?: {
        requiresOpenCycle: boolean;
        finalizedCycleIds?: string[];
    } | null;
    commitmentId: string;
    currentVersion: number;
    eligible: boolean;
    requiresAcceptance?: boolean;
    blockingReason?: string | null;
    currentAmountInCents?: string;
    amountInCents?: number | null;
    proposedAmountInCents?: number | string;
    proposedRemainingAmountInCents?: number;
    resultingRemainingAmountInCents?: number | null;
    fulfilledAmountInCents?: number;
    remainingAmountInCents?: number | null;
    cashImpactInCents?: string;
    supportedImpactInCents?: string;
    externalOutstandingImpactInCents?: string;
    impactByMember?: MemberImpact[];
    original?: IntegrityFact & {
        reversibleAmountInCents: number;
        reversedAmountInCents: number;
    };
};
export type CorrectionInput = {
    settlement?: Settlement;
    expectedCommitmentVersion: number;
    expectedSpaceVersion?: number;
    expectedOccurrenceVersion?: number;
    occurrenceId?: string;
    referenceDate?: string;
    installmentId?: string;
    factDate: string;
    reason: string;
    direction?: 'INCREASE' | 'DECREASE';
    amountInCents?: number;
    originalKind?: OriginalKind;
    originalId?: string;
};
export type ChangeInput = {
    scope: 'PERSONAL' | 'SHARED';
    kind: 'EXPENSE' | 'INCOME';
    description: string;
    amountInCents: number;
    effectiveFrom: string;
    expectedCommitmentVersion: number;
    expectedSpaceVersion?: number;
    distribution?: Split;
    expectedMemberId?: string | null;
    installmentIds?: string[];
};
export type ChangeProposal = {
    id: string;
    commitmentId: string;
    version: number;
    baseVersion: number;
    recipientMemberId: string;
    proposedByMemberId: string;
    effectiveFrom: string;
    registeredAt: string;
    status: 'PROPOSED' | 'ACCEPTED' | 'REJECTED' | 'CANCELLED';
    configuration: {
        description?: string;
        reason?: string;
        direction?: string;
        amountInCents?: number;
    };
    impact: IntegrityPreview | RecurringChangeImpact;
};
export type IntegrityResult = IntegrityPreview & {
    proposal?: ChangeProposal;
    version?: number;
    replayed?: boolean;
};
export type IntegrityContext = {
    spaceId: string;
    spaceType: 'PERSONAL' | 'SHARED';
    status: string;
    version?: number;
    members?: Member[];
};
export type FinancialReversal = IntegrityFact & {
    originalId: string;
    originalKind: OriginalKind;
    reason: string;
    actorId: string;
    registeredAt: string;
};
export type VersionHistory = {
    targets?: { id: string }[];
    version?: number;
    versions?: {
        id: string;
        version: number;
        description: string;
        effectiveFrom: string;
        amountInCents: number | null;
    }[];
    commitment?: IntegrityOrigin['commitment'];
};
