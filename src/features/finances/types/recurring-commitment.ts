import type { Member, Settlement, Split } from './shared-expense';
export type RecurrencePattern =
    | { frequency: 'MONTHLY'; dayOfMonth: number }
    | { frequency: 'ANNUAL'; monthOfYear: number; dayOfMonth: number };
export type RecurringInput = {
    kind: 'EXPENSE' | 'INCOME';
    description: string;
    recurrence: RecurrencePattern;
    startsOn?: string;
    endsOn?: string | null;
} & (
    | { valueMode: 'FIXED'; amountInCents: number }
    | { valueMode: 'VARIABLE'; expectedAmountInCents?: number | null }
) &
    (
        | { scope: 'PERSONAL' }
        | {
              scope: 'SHARED';
              distribution: Split;
              expectedMemberId: string | null;
              expectedSpaceVersion: number;
          }
    );
type WithoutStart<T> = T extends unknown ? Omit<T, 'startsOn'> : never;
export type RecurringChangeInput = WithoutStart<RecurringInput> & {
    effectiveFrom: string;
    expectedCommitmentVersion: number;
};
export type OccurrenceFact = {
    id: string;
    kind: 'DISBURSEMENT' | 'RECEIPT' | 'EXTERNAL_LIABILITY';
    amountInCents: number;
    factDate: string;
    registeredAt: string;
    recordedByPersonId: string;
    payerMemberId?: string | null;
    recipientMemberId?: string | null;
    holderMemberId?: string | null;
    method?: 'PIX' | 'DEBIT' | 'CASH';
    remainingAmountInCents?: number;
};
export type EconomicShare = { memberId: string; amountInCents: number };
export type RecurringRoot = {
    id: string;
    spaceId: string;
    kind: 'EXPENSE' | 'INCOME';
    scope: 'PERSONAL' | 'SHARED';
    description: string;
    valueMode: 'FIXED' | 'VARIABLE';
    amountInCents: number | null;
    expectedAmountInCents: number | null;
    recurrence: RecurrencePattern;
    startsOn: string;
    endsOn: string | null;
    version: number;
    economicVersion: number;
    effectiveFrom: string;
    terminatedOn: string | null;
    distribution?: Split;
    expectedMemberId?: string | null;
    versions: {
        version: number;
        effectiveFrom: string;
        description: string;
        valueMode: 'FIXED' | 'VARIABLE';
        amountInCents: number | null;
        expectedAmountInCents: number | null;
        recurrence: RecurrencePattern;
        endsOn: string | null;
    }[];
    nextOccurrence: {
        referenceDate: string;
        amountInCents: number | null;
        expectedAmountInCents: number | null;
    } | null;
};
export type RecurringOccurrence = {
    id: string | null;
    commitmentId: string;
    referenceDate: string;
    economicVersion: number;
    stateVersion: number;
    amountInCents: number | null;
    expectedAmountInCents: number | null;
    valuePending: boolean;
    economicShares: EconomicShare[] | null;
    status: 'PENDING' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'CANCELLED';
    fulfilledAmountInCents: number;
    remainingAmountInCents: number | null;
    materializedAt: string | null;
    facts: OccurrenceFact[];
    validFacts?: OccurrenceFact[];
    externalSettlements: {
        id: string;
        externalLiabilityId: string;
        amountInCents: number;
        factDate: string;
    }[];
    valueHistory: {
        version: number;
        previousAmountInCents: number | null;
        amountInCents: number;
        registeredAt: string;
        actorId: string;
    }[];
    cancellation: { actorId: string; registeredAt: string } | null;
};
export type RecurringDetail = {
    spaceId: string;
    commitment: RecurringRoot;
    occurrence?: RecurringOccurrence;
    replayed?: boolean;
};
export type RecurringList = {
    spaceId: string;
    month: string;
    items: (RecurringRoot & { referenceDate: string })[];
    totalCount: number;
    totalAmountInCents: string;
    unknownAmountCount: number;
    nextCursor: string | null;
};
export type RecurringOccurrences = {
    spaceId: string;
    commitmentId: string;
    month: string;
    items: RecurringOccurrence[];
    totalCount: number;
    totalAmountInCents: string;
    unknownAmountCount: number;
};
export type OccurrenceOptions = RecurringDetail & {
    occurrence: RecurringOccurrence;
    expectedSpaceVersion?: number;
    members?: Member[];
    suggestedSettlement: {
        referenceDate: string;
        expectedRuleVersion: number;
        targetDate: string;
    } | null;
    openCycles: { id: string; targetDate: string; version: number }[];
    nextCursor: string | null;
};
export type OccurrenceVersionInput = {
    expectedCommitmentVersion: number;
    expectedOccurrenceVersion: number;
    expectedSpaceVersion?: number;
};
export type OccurrenceFulfillmentInput = OccurrenceVersionInput & {
    amountInCents: number;
    factDate: string;
    method?: 'PIX' | 'DEBIT' | 'CASH';
    payerMemberId?: string;
    recipientMemberId?: string;
    holderMemberId?: string;
    settlement?: Settlement;
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
    requiresAcceptance: boolean;
    currentOccurrences: string[];
    proposedOccurrences: string[];
    impactByMember: RecurringMemberImpact[];
    materializedOccurrencesPreserved: {
        referenceDate: string;
        status: 'PENDING' | 'PARTIALLY_FULFILLED' | 'FULFILLED' | 'CANCELLED';
        economicVersion: number;
    }[];
};
export type RecurringChangePreview = RecurringChangeImpact & {
    spaceId: string;
    commitmentId: string;
};
export type RecurringTerminationInput = {
    expectedCommitmentVersion: number;
    expectedSpaceVersion?: number;
    endsOn: string;
};
export type RecurringTerminationPreview = {
    spaceId: string;
    commitmentId: string;
    currentVersion: number;
    endsOn: string;
    materializedOccurrencesPreserved: { referenceDate: string }[];
};
