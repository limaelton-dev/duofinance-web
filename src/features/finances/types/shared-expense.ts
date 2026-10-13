import type { SettlementRule } from './settlement-rule';
export type Member = {
    memberId: string;
    personId: string;
    displayName: string;
};
export type FinancialContext = {
    spaceId: string;
    type: 'SHARED';
    status: 'ACTIVE' | 'CLOSING' | 'CLOSED';
    version: number;
    actorMemberId: string;
    members: Member[];
};
export type Split =
    | { mode: 'AMOUNTS'; shares: { memberId: string; amountInCents: number }[] }
    | {
          mode: 'PERCENTAGES';
          shares: { memberId: string; basisPoints: number }[];
      };
export type Settlement =
    | { mode: 'NONE' }
    | { mode: 'DATE'; targetDate: string }
    | { mode: 'CYCLE'; cycleId: string }
    | { mode: 'SUGGESTED'; referenceDate: string; expectedRuleVersion: number };
export type ExpenseInput = {
    expectedSpaceVersion: number;
    description: string;
    amountInCents: number;
    factDate: string;
    responsibilitySplit: Split;
    expectedPayerMemberId: string | null;
    disbursement: { payerMemberId: string; method: 'PIX' | 'DEBIT' | 'CASH' };
    settlement: Settlement;
};
export type ExpenseOptions = FinancialContext & {
    referenceDate: string;
    defaultSettlementRule: { rule: SettlementRule | null; version: number };
    suggestedTargetDate: string | null;
    openCycles: { id: string; targetDate: string; version: number }[];
    nextCursor: string | null;
};
export type ExpenseView = {
    spaceId: string;
    commitment: {
        id: string;
        version: number;
        kind: 'EXPENSE';
        modality: 'ONE_TIME';
        description: string;
        amountInCents: number;
        factDate: string;
        registeredAt: string;
        createdByPersonId: string;
        expectedPayerMemberId: string | null;
        responsibilitySplit: Split & {
            calculatedShares: { memberId: string; amountInCents: number }[];
        };
        settlementRuleSnapshot: SettlementRule | null;
        settlementRuleSourceVersion: number;
        suggestedTargetDate: string | null;
    };
    disbursement: {
        id: string;
        payerMemberId: string;
        method: 'PIX' | 'DEBIT' | 'CASH';
        amountInCents: number;
        factDate: string;
        registeredAt: string;
    };
    obligation: null | {
        id: string;
        originCommitmentId: string;
        originDisbursementId: string;
        debtorMemberId: string;
        creditorMemberId: string;
        originalAmountInCents: number;
        remainingAmountInCents: number;
        status: 'OPEN' | 'PARTIALLY_SETTLED' | 'SETTLED';
        cycleId: string | null;
    };
    settlementCycle: null | {
        id: string;
        targetDate: string;
        status: 'OPEN' | 'FINALIZED';
    };
};
export type ExpenseResult = ExpenseView & { replayed: boolean };
export type ExpenseDetail = ExpenseView & { members: Member[] };
