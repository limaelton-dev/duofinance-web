import type {
    DisbursementMethod,
    PersonalExpenseResult,
} from './personal-expense';
import type { ExpenseResult, Member, Settlement } from './shared-expense';
import type { SettlementRule } from './settlement-rule';

export type ExpenseDisbursementInput = {
    amountInCents: number;
    factDate: string;
    method: DisbursementMethod;
    expectedCommitmentVersion: number;
} & (
    | {
          payerMemberId?: never;
          expectedSpaceVersion?: never;
          settlement?: never;
      }
    | {
          payerMemberId: string;
          expectedSpaceVersion: number;
          settlement: Settlement;
      }
);

export type ExpenseDisbursementOptions = {
    spaceId: string;
    spaceType: 'PERSONAL' | 'SHARED';
    commitmentId: string;
    expectedCommitmentVersion: number;
    amountInCents: number;
    paidAmountInCents: number;
    remainingAmountInCents: number;
    referenceDate: string;
    canDisburse: boolean;
    disbursementMethods: DisbursementMethod[];
    expectedSpaceVersion?: number;
    members?: Member[];
    defaultSettlementRule?: { rule: SettlementRule | null; version: number };
    suggestedTargetDate?: string | null;
    openCycles?: { id: string; targetDate: string; version: number }[];
};

export type ExpenseDisbursementResult = ExpenseResult | PersonalExpenseResult;
