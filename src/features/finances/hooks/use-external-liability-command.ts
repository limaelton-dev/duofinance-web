'use client';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateIncomeQueries } from '../cache/income-query-keys';
import { recordExternalLiability } from '@/lib/api/credit-card-purchase';
import type { ExternalLiabilityInput } from '../types/credit-card-purchase';
import type { ExpenseDisbursementResult } from '../types/expense-disbursement';
import { useFinancialCommand } from './use-financial-command';

type Work = { id: string; input: ExternalLiabilityInput };

export function useExternalLiabilityCommand(
    onSuccess: (result: ExpenseDisbursementResult) => void,
    onAccessLost: () => void,
) {
    const client = useQueryClient();
    return useFinancialCommand<Work, ExpenseDisbursementResult>({
        execute: async (spaceId, work, token, key, signal) => {
            const result = await recordExternalLiability(
                spaceId,
                work.id,
                work.input,
                token,
                key,
                signal,
            );
            if (
                result.spaceId !== spaceId ||
                result.commitment.kind !== 'EXPENSE' ||
                result.commitment.id !== work.id
            )
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
    });
}
