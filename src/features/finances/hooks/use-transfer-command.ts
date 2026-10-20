'use client';
import { useQueryClient } from '@tanstack/react-query';
import { recordTransfer } from '@/lib/api/settlement-transfers';
import { todayQueryKeys } from '@/features/today/cache/today-query-keys';
import type {
    TransferInput,
    TransferResult,
} from '../types/settlement-transfer';
import { useFinancialCommand } from './use-financial-command';

export function useTransferCommand(
    onSuccess: (result: TransferResult) => void,
    onConflict: () => Promise<unknown>,
    onAccessLost: () => void,
    onFieldError: (fields: string[]) => void,
) {
    const client = useQueryClient();
    return useFinancialCommand<TransferInput, TransferResult>({
        execute: async (spaceId, input, token, key, signal) => {
            const result = await recordTransfer(
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
            void client.invalidateQueries({
                queryKey: todayQueryKeys.space(
                    capture.personId,
                    capture.spaceId,
                ),
            });
            const prefix = ['finances', capture.personId, capture.spaceId];
            for (const name of [
                'financial-review',
                'inter-member-position',
                'settlement-transfer-options',
                'settlement-transfers',
                'settlement-cycles',
            ])
                void client.invalidateQueries({ queryKey: [...prefix, name] });
            for (const cycleId of result.affectedCycleIds)
                void client.invalidateQueries({
                    queryKey: [...prefix, 'settlement-cycle', cycleId],
                });
            for (const allocation of result.allocations)
                void client.invalidateQueries({
                    queryKey: [
                        ...prefix,
                        'financial-commitment',
                        allocation.origin.commitmentId,
                    ],
                });
            return onSuccess(result);
        },
        onAccessLost,
        onFieldError,
        onRejected: (failure) => {
            if (
                [
                    'SPACE_NOT_ACTIVE',
                    'SETTLEMENT_CYCLE_FINALIZED',
                    'CONCURRENT_MODIFICATION',
                    'SETTLEMENT_CYCLE_NOT_FOUND',
                    'OBLIGATION_NOT_FOUND',
                ].includes(failure.code)
            )
                return onConflict();
        },
    });
}
