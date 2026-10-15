import type { IncomeDetail } from '@/features/finances/types/income';
import type { PersonalExpenseDetail } from '@/features/finances/types/personal-expense';
import type { ExpenseView } from '@/features/finances/types/shared-expense';

export function normalizeExpenseFulfillment<
    T extends ExpenseView | PersonalExpenseDetail,
>(value: T): T {
    return {
        ...value,
        disbursements:
            value.disbursements ??
            (value.disbursement ? [value.disbursement] : []),
        paidAmountInCents:
            value.paidAmountInCents ?? value.disbursement?.amountInCents ?? 0,
        externalLiabilities: value.externalLiabilities ?? [],
        assumedAmountInCents: value.assumedAmountInCents ?? 0,
        externalOutstandingAmountInCents:
            value.externalOutstandingAmountInCents ?? 0,
        supportedAmountInCents:
            value.supportedAmountInCents ??
            value.paidAmountInCents ??
            value.disbursement?.amountInCents ??
            0,
        remainingAmountInCents: value.remainingAmountInCents ?? 0,
        status: value.status ?? 'PAID',
        ...('obligation' in value
            ? {
                  obligations:
                      value.obligations ??
                      (value.obligation ? [value.obligation] : []),
              }
            : {}),
    };
}

export function normalizeIncomeFulfillment<T extends IncomeDetail>(
    value: T,
): T {
    return {
        ...value,
        receipts: value.receipts ?? (value.receipt ? [value.receipt] : []),
        remainingAmountInCents:
            value.remainingAmountInCents ??
            (value.receipt ? 0 : value.commitment.amountInCents),
        obligations:
            value.obligations ?? (value.obligation ? [value.obligation] : []),
    };
}
