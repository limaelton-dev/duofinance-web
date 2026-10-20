'use client';
import { useQueryClient } from '@tanstack/react-query';
import { invalidateIncomeQueries } from '../cache/income-query-keys';
import { settleExternalLiability } from '@/lib/api/external-liability-settlement';
import type {
    SettleExternalLiabilityInput,
    SettleExternalLiabilityResult,
} from '../types/external-liability-settlement';
import { useFinancialCommand } from './use-financial-command';

type Work = {
    id: string;
    liabilityId: string;
    input: SettleExternalLiabilityInput;
};

export function useExternalLiabilitySettlementCommand(
    onSuccess: (result: SettleExternalLiabilityResult) => void,
    onAccessLost: () => void,
) {
    const client = useQueryClient();
    return useFinancialCommand<Work, SettleExternalLiabilityResult>({
        execute: async (spaceId, work, token, key, signal) => {
            const result = await settleExternalLiability(
                spaceId,
                work.id,
                work.liabilityId,
                work.input,
                token,
                key,
                signal,
            );
            if (
                result.spaceId !== spaceId ||
                result.commitment.kind !== 'EXPENSE' ||
                result.commitment.id !== work.id ||
                result.settlement.externalLiabilityId !== work.liabilityId
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
