import type { Member, Settlement, Split } from './shared-expense';
import type { EconomicShare, OccurrenceFact } from './recurring-commitment';
export type InstallmentInput = {
    description: string;
    count: number;
    firstDueDate?: string;
    cadence?: 'MONTHLY' | 'ANNUAL';
    explicitDueDates?: string[];
    totalAmountInCents?: number;
    baseAmountInCents?: number;
    amountsInCents?: number[];
    plannedPaymentMethod: 'CARD' | 'PIX' | 'DEBIT' | 'CASH' | null;
} & (
    | { scope: 'PERSONAL' }
    | {
          scope: 'SHARED';
          distribution: Split;
          expectedMemberId: string | null;
          expectedSpaceVersion?: number;
          expectedRuleVersion?: number;
      }
);
export type InstallmentItem = {
    id: string;
    position: number;
    dueDate: string;
    amountInCents: number;
    effectiveAmountInCents: number;
    economicShares: EconomicShare[] | null;
    effectiveEconomicShares: EconomicShare[] | null;
    stateVersion: number;
    status:
        | 'PENDING'
        | 'PARTIALLY_FULFILLED'
        | 'FULFILLED'
        | 'PAID_OFF'
        | 'CANCELLED';
    fulfilledAmountInCents: number;
    remainingAmountInCents: number;
    facts: OccurrenceFact[];
    anticipation: {
        id: string;
        factDate: string;
        expectedRemainingAmountInCents: number;
        paidAmountInCents: number;
        adjustmentInCents: number;
    } | null;
    resolution: {
        id: string;
        kind?: string;
        reason?: string;
        factDate?: string;
    } | null;
    externalSettlements: {
        id: string;
        externalLiabilityId: string;
        amountInCents: number;
        factDate: string;
    }[];
};
export type InstallmentRoot = {
    id: string;
    spaceId: string;
    description: string;
    version: number;
    scope: 'PERSONAL' | 'SHARED';
    distribution?: Split;
    expectedMemberId?: string | null;
    plan: {
        id: string;
        count: number;
        cadence: 'MONTHLY' | 'ANNUAL' | 'EXPLICIT';
        status: 'OPEN' | 'COMPLETED';
        plannedPaymentMethod: InstallmentInput['plannedPaymentMethod'];
        totalAmountInCents: number;
        fulfilledAmountInCents: number;
        remainingAmountInCents: number;
        installments: InstallmentItem[];
        payoff: {
            id: string;
            paidAmountInCents: number;
            expectedRemainingAmountInCents: number;
            adjustmentInCents: number;
            factDate: string;
        } | null;
    };
};
export type InstallmentDetail = {
    spaceId: string;
    commitment: InstallmentRoot;
    installment?: InstallmentItem;
    replayed?: boolean;
};
export type InstallmentList = {
    spaceId: string;
    items: InstallmentRoot[];
    totalCount: number;
    totalAmountInCents: string;
    nextCursor: string | null;
};
export type InstallmentPreview = {
    spaceId: string;
    description: string;
    count: number;
    totalAmountInCents: number;
    installments: {
        position: number;
        dueDate: string;
        amountInCents: number;
        economicShares: EconomicShare[] | null;
    }[];
    expectedSpaceVersion?: number;
    expectedRuleVersion?: number;
};
export type ResolutionItem = {
    installmentId: string;
    position: number;
    dueDate: string;
    expectedRemainingAmountInCents: number;
    expectedInstallmentVersion: number;
    cancellationEligible: boolean;
    blockingReason: string | null;
};
export type ResolutionOptions = {
    spaceId: string;
    commitmentId: string;
    expectedCommitmentVersion: number;
    expectedSpaceVersion: number | null;
    totalOpenCount: number;
    totalExpectedRemainingAmountInCents: string;
    items: ResolutionItem[];
    nextCursor: string | null;
};
export type AnticipationOptions = {
    spaceId: string;
    commitmentId: string;
    expectedCommitmentVersion: number;
    expectedSpaceVersion?: number;
    totalEligibleCount: number;
    items: (InstallmentItem & {
        selectionEligible: boolean;
        blockingReason: string | null;
    })[];
    nextCursor: string | null;
};
export type InstallmentPayment = {
    factDate: string;
    method: 'PIX' | 'DEBIT' | 'CASH';
    payerMemberId?: string;
    expectedSpaceVersion?: number;
    settlement?: Settlement;
    expectedCommitmentVersion: number;
};
export type InstallmentAnticipationInput = InstallmentPayment & {
    selection:
        | { mode: 'IDS'; installmentIds: string[] }
        | { mode: 'FROM_END'; quantity: number };
    values: {
        installmentId: string;
        expectedInstallmentVersion: number;
        paidAmountInCents: number;
    }[];
};
export type AnticipationPreview = {
    spaceId: string;
    expectedCommitmentVersion: number;
    expectedSpaceVersion?: number;
    items: {
        installmentId: string;
        position: number;
        dueDate: string;
        expectedInstallmentVersion: number;
        expectedRemainingAmountInCents: number;
        paidAmountInCents: number;
        adjustmentInCents: number;
        effectiveEconomicShares: EconomicShare[] | null;
    }[];
    totalExpectedRemainingAmountInCents: string;
    totalPaidAmountInCents: string;
    totalAdjustmentInCents: string;
};
export type InstallmentVersions = {
    installmentId: string;
    expectedInstallmentVersion: number;
}[];
export type InstallmentPayoffInput = InstallmentPayment & {
    paidAmountInCents: number;
    installments: InstallmentVersions;
};
export type PayoffPreview = {
    spaceId: string;
    expectedCommitmentVersion: number;
    expectedSpaceVersion: number | null;
    items: ResolutionItem[];
    expectedRemainingAmountInCents: number;
    paidAmountInCents: number;
    adjustmentInCents: number;
    effectiveEconomicShares: EconomicShare[] | null;
};
export type InstallmentCancellationInput = {
    expectedCommitmentVersion: number;
    expectedSpaceVersion?: number;
    installments: InstallmentVersions;
    factDate: string;
    reason: string;
};
export type InstallmentOptions = InstallmentDetail & {
    installment: InstallmentItem;
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
