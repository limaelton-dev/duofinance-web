export type ClosureParticipant = {
    memberId: string;
    personId: string;
    displayName: string;
};
export type ClosureConsent = {
    memberId: string;
    planRevision: number;
    recordedAt: string;
    financialFingerprint?: string;
};
export type ClosureDestination = {
    originType: 'RECURRING' | 'INSTALLMENT';
    originId: string;
    expectedOriginVersion: number;
    destination: 'TERMINATE' | 'PERSONAL_SUCCESSOR' | 'SETTLE_BEFORE_CLOSURE';
    assigneeMemberId: string | null;
    amountInCents: number | null;
    cutoffDate: string;
    impactByMember: {
        memberId: string;
        beforeInCents: string | null;
        afterInCents: string | null;
        requiresAcceptance: boolean;
    }[];
    agreement?: {
        debtorMemberId: string;
        creditorMemberId: string;
        amountInCents: number;
    };
    originSnapshot: {
        version: number;
        fingerprint: string;
        kind: 'EXPENSE' | 'INCOME';
        description: string;
        eligibleRemainingInCents: string | null;
        futureItems: {
            originItemId: string | null;
            referenceDate: string;
            remainingInCents: number | null;
            version: number | null;
        }[];
        recurringImpacts?: {
            basis: 'PER_OCCURRENCE';
            economicVersion: number;
            effectiveFrom: string;
            valueMode: 'FIXED' | 'VARIABLE';
            amountInCents: number | null;
            distribution:
                | {
                      mode: 'AMOUNTS';
                      shares: { memberId: string; amountInCents: number }[];
                  }
                | {
                      mode: 'PERCENTAGES';
                      shares: { memberId: string; basisPoints: number }[];
                  };
            impactByMember: {
                memberId: string;
                beforeInCents: string | null;
                afterInCents: string | null;
                beforeBasisPoints: number | null;
                afterBasisPoints: number;
            }[];
        }[];
    };
};
export type ClosureView = {
    spaceId: string;
    spaceStatus: 'ACTIVE' | 'CLOSING' | 'CLOSED';
    spaceVersion: number;
    processId: string;
    processStatus: 'OPEN' | 'COMPLETED' | 'CANCELLED';
    planRevision: number;
    planStatus: 'DRAFT' | 'PROPOSED' | 'APPROVED' | 'REJECTED';
    cutoffDate: string;
    proposedCutoffDate: string | null;
    requestedByMemberId: string;
    requiredMemberIds: string[];
    participants: ClosureParticipant[];
    approvals: ClosureConsent[];
    confirmations: ClosureConsent[];
    futureDestinations: ClosureDestination[];
    proposalSnapshot?: {
        financialFingerprint: string;
        financialBlockerCount: number;
        outstandingAmounts: ClosureFinancialDiagnostic['outstandingAmounts'];
        routine: ClosureInformational['routine'];
        shopping: ClosureInformational['shopping'];
    } | null;
    hasBilateralApproval?: boolean;
    cancellationConsents?: (ClosureConsent & { spaceVersion: number })[];
    actorNextAction?:
        | 'PROPOSE_PLAN'
        | 'REVIEW_PLAN'
        | 'WAIT_APPROVAL'
        | 'RESOLVE_FINANCES'
        | 'REVIEW_CLOSURE'
        | 'WAIT_CANCELLATION'
        | 'APPROVE_CANCELLATION'
        | 'READ_ONLY';
    startedAt: string;
    completedAt: string | null;
    cancelledAt: string | null;
    invitationStatus: string | null;
};
export type ClosureBlocker = {
    type:
        | 'INTER_MEMBER_OBLIGATION'
        | 'PENDING_FINANCIAL_CHANGE'
        | 'OPEN_ONE_TIME_COMMITMENT'
        | 'OPEN_EXTERNAL_LIABILITY'
        | 'ACTIVE_RECURRENCE'
        | 'OPEN_RECURRING_OCCURRENCE'
        | 'UNRESOLVED_INSTALLMENT'
        | 'OPEN_SETTLEMENT_CYCLE';
    originId: string;
    commitmentId?: string;
    occurrenceId?: string;
    description?: string;
    version?: number;
    referenceDate?: string;
    amountInCents?: string | null;
    debtorMemberId?: string;
    creditorMemberId?: string;
    responsibleMemberId?: string;
    closureAgreementId?: string;
    action: string;
};
export type ClosureFinancialDiagnostic = {
    blockers: ClosureBlocker[];
    totalCount: number;
    counts: Record<string, number>;
    outstandingAmounts: {
        debtorMemberId: string;
        creditorMemberId: string;
        amountInCents: string;
    }[];
    financiallyReady: boolean;
};
export type ClosureInformational = {
    routine: { pendingTaskCount: number; activeRecurrenceCount: number };
    shopping: { activeListCount: number };
    blocksFinancialClosure?: false;
};
export type ClosureDiagnostic = {
    spaceId: string;
    closure: ClosureView | null;
    finance: ClosureFinancialDiagnostic;
    informational: ClosureInformational;
};
export type ClosureApplication = {
    effectId: string;
    originId: string;
    successorCommitmentId: string | null;
    agreementObligationId: string | null;
};
export type ClosurePlanReview = {
    spaceId: string;
    closure: ClosureView;
    finance: {
        fingerprint: string;
        diagnostic: ClosureFinancialDiagnostic;
        missingDestinationOriginIds: string[];
        appliedDestinations: ClosureApplication[];
    };
    informational: ClosureInformational;
};
export type ClosureFinancialValidation = ClosureFinancialDiagnostic & {
    spaceId: string;
    processId: string;
    planRevision: number;
    spaceVersion: number;
    planApproved: boolean;
    canConfirm: boolean;
    financialFingerprint: string;
    appliedDestinations: ClosureApplication[];
    resolutions: {
        kind:
            | 'TRANSFER'
            | 'OFFSET'
            | 'WAIVER'
            | 'REVERSAL'
            | 'ASSIGNMENT'
            | 'CYCLE_FINALIZATION';
        id: string;
        planRevision: number;
        obligationIds: string[];
    }[];
    missingDestinationOriginIds: string[];
    informational: ClosureInformational;
};
export type ClosureFinalSummary = ClosureFinancialValidation & {
    closure: ClosureView;
    validConfirmations: ClosureConsent[];
    actorConfirmed: boolean;
    requiredConfirmations: number;
    confirmedCount: number;
};
export type ClosureHistory = {
    spaceId: string;
    items: {
        id: string;
        processId: string;
        action: string;
        actorMemberId: string;
        planRevision: number;
        recordedAt: string;
        snapshot: ClosureView;
    }[];
    nextCursor: string | null;
};
export type ClosureVersion = {
    expectedSpaceVersion: number;
    expectedPlanRevision: number;
};
export type ClosureDestinationInput = ClosureVersion & {
    originType: ClosureDestination['originType'];
    originId: string;
    expectedOriginVersion: number;
} & (
        | { destination: 'TERMINATE' }
        | { destination: 'PERSONAL_SUCCESSOR'; assigneeMemberId: string }
        | {
              destination: 'SETTLE_BEFORE_CLOSURE';
              assigneeMemberId: string;
              amountInCents: number;
          }
    );
export type ClosureWork =
    | { operation: 'start'; input: { expectedSpaceVersion: number } }
    | {
          operation: 'cutoff-date';
          input: ClosureVersion & { cutoffDate: string };
      }
    | { operation: 'future-destinations'; input: ClosureDestinationInput }
    | {
          operation: 'proposal' | 'approval' | 'confirmation';
          input: ClosureVersion & { expectedFinancialFingerprint: string };
      }
    | { operation: 'rejection' | 'cancellation'; input: ClosureVersion };
