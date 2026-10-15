import type { ExternalLiability } from './credit-card-purchase';
import type { ExpenseDisbursementResult } from './expense-disbursement';

export type ExternalLiabilitySettlement = {
    id: string;
    externalLiabilityId: string;
    sequence: number;
    holderMemberId?: string;
    holderPersonId?: string;
    amountInCents: number;
    factDate: string;
    registeredAt: string;
    recordedByPersonId: string;
};
export type SettleExternalLiabilityInput = {
    amountInCents: number;
    factDate: string;
    expectedCommitmentVersion: number;
    expectedSpaceVersion?: number;
};
export type ExternalLiabilitySettlementOptions = {
    spaceId: string;
    spaceType: 'PERSONAL' | 'SHARED';
    commitmentId: string;
    description: string;
    referenceDate: string;
    expectedCommitmentVersion: number;
    expectedSpaceVersion?: number;
    canSettle: boolean;
    externalLiability: ExternalLiability;
};
export type OpenExternalLiabilities = {
    spaceId: string;
    spaceType: 'PERSONAL' | 'SHARED';
    referenceDate: string;
    expectedSpaceVersion?: number;
    canSettle: boolean;
    items: {
        commitmentId: string;
        commitmentVersion: number;
        description: string;
        externalLiability: ExternalLiability;
    }[];
    nextCursor: string | null;
};
export type SettleExternalLiabilityResult = ExpenseDisbursementResult & {
    settlement: ExternalLiabilitySettlement;
};
