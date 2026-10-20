'use client';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateIncomeQueries } from '../cache/income-query-keys';
import { recordIncome, recordIncomeReceipt } from '@/lib/api/income';
import type {
    IncomeInput,
    IncomeReceiptInput,
    IncomeResult,
} from '../types/income';
import { useFinancialCommand } from './use-financial-command';

type Work =
    | { kind: 'CREATE'; input: IncomeInput }
    | { kind: 'RECEIVE'; id: string; input: IncomeReceiptInput };

export function useIncomeCommand(
    onSuccess: (result: IncomeResult) => void,
    onAccessLost: () => void,
) {
    const client = useQueryClient();
    return useFinancialCommand<Work, IncomeResult>({
        execute: async (spaceId, work, token, key, signal) => {
            const result =
                work.kind === 'CREATE'
                    ? await recordIncome(
                          spaceId,
                          work.input,
                          token,
                          key,
                          signal,
                      )
                    : await recordIncomeReceipt(
                          spaceId,
                          work.id,
                          work.input,
                          token,
                          key,
                          signal,
                      );
            if (
                result.spaceId !== spaceId ||
                result.commitment.kind !== 'INCOME' ||
                (work.kind === 'RECEIVE' && result.commitment.id !== work.id)
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
