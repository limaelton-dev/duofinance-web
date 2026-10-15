import type { ExpenseDisbursementOptions } from './expense-disbursement';
import type { Settlement } from './shared-expense';
import type { ExternalLiabilitySettlement } from './external-liability-settlement';

export type ExternalLiability = {
    id: string;
    holderMemberId?: string;
    holderPersonId?: string;
    amountInCents: number;
    remainingAmountInCents: number;
    factDate: string;
    registeredAt: string;
    recordedByPersonId: string;
    sequence: number;
    settlements?: ExternalLiabilitySettlement[];
};
export type ExternalLiabilityInput = {
    amountInCents: number;
    factDate: string;
    expectedCommitmentVersion: number;
    holderMemberId?: string;
    expectedSpaceVersion?: number;
    settlement?: Settlement;
};
export type ExternalLiabilityOptions = Omit<
    ExpenseDisbursementOptions,
    'canDisburse' | 'disbursementMethods'
> & {
    canAssume: boolean;
    nextCursor?: string | null;
};
