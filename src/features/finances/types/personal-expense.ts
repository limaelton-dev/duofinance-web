import type { ExternalLiability } from './credit-card-purchase';
export type DisbursementMethod = 'PIX' | 'DEBIT' | 'CASH';
export type PersonalExpenseInput = {
    description: string;
    amountInCents: number;
    factDate: string;
} & (
    | {
          disbursement: { method: DisbursementMethod; amountInCents?: number };
          externalLiability?: never;
      }
    | { externalLiability: { amountInCents?: number }; disbursement?: never }
);
export type PersonalExpenseOptions = {
    spaceId: string;
    referenceDate: string;
    disbursementMethods?: DisbursementMethod[];
};
export type PersonalExpenseDetail = {
    spaceId: string;
    spaceType: 'PERSONAL';
    status: 'PARTIALLY_PAID' | 'PAID' | 'PARTIALLY_FULFILLED' | 'FULFILLED';
    fulfillmentStatus?: 'PARTIALLY_FULFILLED' | 'FULFILLED';
    assumedAmountInCents?: number;
    externalOutstandingAmountInCents?: number;
    externalSettledAmountInCents?: number;
    supportedAmountInCents?: number;
    externalLiabilities?: ExternalLiability[];
    externalLiability?: ExternalLiability | null;
    paidAmountInCents: number;
    remainingAmountInCents: number;
    disbursements: NonNullable<PersonalExpenseDetail['disbursement']>[];
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
        ownerPersonId: string;
    };
    disbursement: null | {
        id: string;
        sequence?: number;
        payerPersonId: string;
        recordedByPersonId: string;
        method: DisbursementMethod;
        amountInCents: number;
        factDate: string;
        registeredAt: string;
    };
};
export type PersonalExpenseResult = PersonalExpenseDetail & {
    replayed: boolean;
};
export type PersonalExpenseHistory = {
    spaceId: string;
    items: {
        id: string;
        description: string;
        amountInCents: number;
        factDate: string;
        disbursement: {
            amountInCents: number;
            method: DisbursementMethod;
        } | null;
        status: 'PARTIALLY_PAID' | 'PAID' | 'PARTIALLY_FULFILLED' | 'FULFILLED';
        fulfillmentStatus?: 'PARTIALLY_FULFILLED' | 'FULFILLED';
        assumedAmountInCents?: number;
        externalOutstandingAmountInCents?: number;
        supportedAmountInCents?: number;
        externalLiabilities?: ExternalLiability[];
        externalLiability?: ExternalLiability | null;
        paidAmountInCents: number;
        remainingAmountInCents: number;
    }[];
    nextCursor: string | null;
};
