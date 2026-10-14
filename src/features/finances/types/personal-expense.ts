export type DisbursementMethod = 'PIX' | 'DEBIT' | 'CASH';
export type PersonalExpenseInput = {
    description: string;
    amountInCents: number;
    factDate: string;
    disbursement: { method: DisbursementMethod };
};
export type PersonalExpenseOptions = {
    spaceId: string;
    referenceDate: string;
    disbursementMethods: DisbursementMethod[];
};
export type PersonalExpenseDetail = {
    spaceId: string;
    spaceType: 'PERSONAL';
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
    disbursement: {
        id: string;
        payerPersonId: string;
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
        disbursement: { amountInCents: number; method: DisbursementMethod };
    }[];
    nextCursor: string | null;
};
