import type { Split } from './shared-expense';

export type PlannedExpenseInput = {
    description: string;
    amountInCents: number;
    expectedPaymentDate: string;
} & (
    | { scope: 'PERSONAL' }
    | {
          scope: 'SHARED';
          expectedSpaceVersion: number;
          responsibilitySplit: Split;
          expectedPayerMemberId: string | null;
      }
);
export type PlannedExpenseResult = {
    spaceId: string;
    replayed: boolean;
    commitment: {
        id: string;
        description: string;
        amountInCents: number;
        expectedPaymentDate: string;
    };
};
export type PlannedExpenseList = {
    spaceId: string;
    month: string;
    items: {
        id: string;
        description: string;
        amountInCents: number;
        expectedPaymentDate: string;
        paidAmountInCents: number;
        assumedAmountInCents: number;
        remainingAmountInCents: number;
        status: 'PENDING' | 'PARTIALLY_FULFILLED' | 'FULFILLED';
        overdue: boolean;
    }[];
    totals: {
        expectedExpenseAmountInCents: string;
        remainingExpenseAmountInCents: string;
    };
    nextCursor: string | null;
};
