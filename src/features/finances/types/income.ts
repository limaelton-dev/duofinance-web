import type { Member, Settlement, Split } from './shared-expense';
import type { SettlementRule } from './settlement-rule';

export type IncomeInput = {
    description: string;
    amountInCents: number;
    expectedReceiptDate: string;
} & (
    | { receipt: null | { factDate: string; amountInCents?: number } }
    | {
          expectedSpaceVersion: number;
          participationSplit: Split;
          expectedRecipientMemberId: string | null;
          receipt: null | {
              factDate: string;
              amountInCents?: number;
              recipientMemberId: string;
              settlement: Settlement;
          };
      }
);
export type IncomeReceiptInput = {
    amountInCents?: number;
    expectedCommitmentVersion: number;
    factDate: string;
} & (
    | {
          recipientMemberId?: never;
          expectedSpaceVersion?: never;
          settlement?: never;
      }
    | {
          expectedSpaceVersion: number;
          recipientMemberId: string;
          settlement: Settlement;
      }
);
export type IncomeOptions = {
    spaceId: string;
    spaceType: 'PERSONAL' | 'SHARED';
    status: 'ACTIVE' | 'CLOSING' | 'CLOSED';
    canCreate: boolean;
    referenceDate: string;
    version?: number;
    members?: Member[];
    defaultSettlementRule?: { rule: SettlementRule | null; version: number };
    suggestedTargetDate?: string | null;
    openCycles?: { id: string; targetDate: string; version: number }[];
};
export type IncomeReceiptOptions = {
    spaceId: string;
    spaceType: 'PERSONAL' | 'SHARED';
    commitmentId: string;
    expectedCommitmentVersion: number;
    amountInCents: number;
    referenceDate: string;
    canReceive: boolean;
    receivedAmountInCents: number;
    remainingAmountInCents: number;
    expectedSpaceVersion?: number;
    members?: Member[];
    participationSplit?: Split & {
        calculatedShares: { memberId: string; amountInCents: number }[];
    };
    expectedRecipientMemberId?: string | null;
    defaultSettlementRule?: { rule: SettlementRule | null; version: number };
    suggestedTargetDate?: string | null;
    openCycles?: { id: string; targetDate: string; version: number }[];
};
export type IncomeDetail = {
    spaceId: string;
    spaceType: 'PERSONAL' | 'SHARED';
    commitment: {
        id: string;
        kind: 'INCOME';
        modality: 'ONE_TIME';
        version: number;
        description: string;
        amountInCents: number;
        expectedReceiptDate: string;
        registeredAt: string;
        createdByPersonId: string;
        ownerPersonId?: string;
        participationSplit?: Split & {
            calculatedShares: { memberId: string; amountInCents: number }[];
        };
        expectedRecipientMemberId?: string | null;
        settlementRuleSnapshot?: SettlementRule | null;
        settlementRuleSourceVersion?: number;
    };
    receipt: null | {
        id: string;
        amountInCents: number;
        factDate: string;
        registeredAt: string;
        recordedByPersonId: string;
        recipientPersonId: string | null;
        recipientMemberId: string | null;
    };
    status: 'PENDING' | 'PARTIALLY_RECEIVED' | 'RECEIVED';
    receivedAmountInCents: number;
    remainingAmountInCents: number;
    receipts: NonNullable<IncomeDetail['receipt']>[];
    obligations: NonNullable<IncomeDetail['obligation']>[];
    obligation: null | {
        id: string;
        originCommitmentId: string;
        originReceiptId: string;
        debtorMemberId: string;
        creditorMemberId: string;
        originalAmountInCents: number;
        remainingAmountInCents: number;
        status: 'OPEN' | 'PARTIALLY_SETTLED' | 'SETTLED' | 'RECONCILED';
        recognizedAmountInCents: number;
        transferredAmountInCents: number;
        history?: {
            version: number;
            type: string;
            actorId: string;
            registeredAt: string;
            snapshot: {
                previousRecognizedAmountInCents?: number;
                recognizedAmountInCents?: number;
                previousRemainingAmountInCents?: number;
                remainingAmountInCents?: number;
                causeFulfillmentId?: string;
            };
        }[];
        cycleId: string | null;
    };
    settlementCycle: null | {
        id: string;
        targetDate: string;
        status: 'OPEN' | 'FINALIZED';
    };
    members?: Member[];
};
export type IncomeResult = IncomeDetail & { replayed: boolean };
export type IncomeHistory = {
    spaceId: string;
    items: {
        id: string;
        description: string;
        amountInCents: number;
        expectedReceiptDate: string;
        registeredAt: string;
        status: 'PENDING' | 'PARTIALLY_RECEIVED' | 'RECEIVED';
        receivedAmountInCents: number;
        remainingAmountInCents: number;
    }[];
    nextCursor: string | null;
};
