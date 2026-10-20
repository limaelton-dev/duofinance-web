'use client';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateIncomeQueries } from '../cache/income-query-keys';
import { recordExpense } from '@/lib/api/shared-expense';
import type { ExpenseInput, ExpenseResult } from '../types/shared-expense';
import { useFinancialCommand } from './use-financial-command';

export function useExpenseCommand(
    onSuccess: (result: ExpenseResult) => void,
    onConflict: () => Promise<unknown>,
    onAccessLost: () => void,
    onFieldError: (fields: string[]) => void,
) {
    const client = useQueryClient();
    return useFinancialCommand<ExpenseInput, ExpenseResult>({
        execute: async (spaceId, input, token, key, signal) => {
            const result = await recordExpense(
                spaceId,
                input,
                token,
                key,
                signal,
            );
            if (result.spaceId !== spaceId)
                throw new Error(
                    'Não foi possível confirmar o destino do registro.',
                );
            return result;
        },
        invalidates: [],
        onSuccess: (result, capture) => {
            invalidateIncomeQueries(client, capture.personId, capture.spaceId);
            return onSuccess(result);
        },
        onAccessLost,
        onFieldError,
        onRejected: (failure) => {
            if (
                [
                    'EXPENSE_OPTIONS_CHANGED',
                    'SPACE_NOT_ACTIVE',
                    'SETTLEMENT_CYCLE_FINALIZED',
                    'CONCURRENT_MODIFICATION',
                    'SETTLEMENT_CYCLE_NOT_FOUND',
                ].includes(failure.code)
            )
                return onConflict();
        },
    });
}
