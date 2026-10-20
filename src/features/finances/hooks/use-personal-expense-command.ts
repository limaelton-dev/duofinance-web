'use client';
import { useQueryClient } from '@tanstack/react-query';
import { recordPersonalExpense } from '@/lib/api/personal-expense';
import { invalidatePersonalExpenseQueries } from '../cache/personal-expense-query-keys';
import type {
    PersonalExpenseInput,
    PersonalExpenseResult,
} from '../types/personal-expense';
import { useFinancialCommand } from './use-financial-command';

export function usePersonalExpenseCommand(
    onSuccess: (result: PersonalExpenseResult) => void,
    onAccessLost: () => void,
) {
    const client = useQueryClient();
    return useFinancialCommand<PersonalExpenseInput, PersonalExpenseResult>({
        execute: async (spaceId, input, token, key, signal) => {
            const result = await recordPersonalExpense(
                spaceId,
                input,
                token,
                key,
                signal,
            );
            if (result.spaceId !== spaceId || result.spaceType !== 'PERSONAL')
                throw new Error(
                    'Não foi possível confirmar o destino do registro.',
                );
            return result;
        },
        invalidates: [],
        onSuccess: (result, capture) => {
            invalidatePersonalExpenseQueries(
                client,
                capture.personId,
                capture.spaceId,
            );
            return onSuccess(result);
        },
        onAccessLost,
    });
}
