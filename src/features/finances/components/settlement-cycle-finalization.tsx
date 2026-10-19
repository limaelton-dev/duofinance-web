'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import { finalizeCycle } from '@/lib/api/settlement-depth';
import { useFinancialCommand } from '../hooks/use-financial-command';
import type { SettlementCycleDetail } from '../types/settlement-cycle';
import type {
    FinalizationInput,
    FinalizationResult,
} from '../types/settlement-depth';
import {
    CommandFeedback,
    settlementBlockMessage,
} from './settlement-depth-shared';
import formStyles from './settlement-depth.module.css';

export function SettlementCycleFinalization({
    data,
    refresh,
    refreshing = false,
}: {
    data: SettlementCycleDetail;
    refresh: () => void;
    refreshing?: boolean;
}) {
    const space = useSpaceContext(),
        [confirmed, setConfirmed] = useState(false),
        [result, setResult] = useState<FinalizationResult | null>(null);
    const command = useFinancialCommand<FinalizationInput, FinalizationResult>({
        execute: (id, input, token, key, signal) =>
            finalizeCycle(id, data.cycle.id, input, token, key, signal),
        onSuccess: setResult,
    });
    if (result)
        return (
            <div className={formStyles.receipt} role="status">
                <h2>Ciclo finalizado</h2>
                <p>
                    A composição histórica foi preservada. Novos registros e
                    mudanças de composição ficam bloqueados neste ciclo.
                </p>
            </div>
        );
    if (data.cycle.status === 'FINALIZED')
        return (
            <p>
                Este ciclo foi finalizado. A composição histórica está
                preservada e não aceita alterações retroativas.
            </p>
        );
    const blocked =
        data.spaceStatus === 'CLOSED'
            ? 'SPACE_CLOSED'
            : data.cycle.totals.remainingAmountInCents !== '0'
              ? 'OPEN_OBLIGATIONS'
              : data.cycle.finalizationBlockReason;
    if (blocked) return <p>{settlementBlockMessage(blocked)}</p>;
    return (
        <form
            className={formStyles.form}
            onSubmit={(e) => {
                e.preventDefault();
                if (confirmed && space.currentSpace && !refreshing)
                    command.submit({
                        expectedSpaceVersion: space.currentSpace.version,
                        expectedCycleVersion: data.cycle.version,
                    });
            }}
        >
            <fieldset
                disabled={command.isPending || command.canRetry || refreshing}
            >
                <legend>Finalizar este ciclo</legend>
                <p>
                    Não há valor aberto. A finalização preserva a composição e
                    impede novos vínculos ou mudanças retroativas.
                </p>
                <label className={formStyles.check}>
                    <input
                        type="checkbox"
                        required
                        checked={confirmed}
                        onChange={(e) => setConfirmed(e.target.checked)}
                    />
                    Conferi os valores e quero finalizar este ciclo.
                </label>
                <Button type="submit" disabled={!confirmed}>
                    Finalizar ciclo de acerto
                </Button>
            </fieldset>
            <CommandFeedback command={command} />
            <Button
                type="button"
                variant="outline"
                disabled={command.isPending || command.canRetry || refreshing}
                onClick={() => {
                    setConfirmed(false);
                    refresh();
                }}
            >
                Atualizar antes de finalizar
            </Button>
        </form>
    );
}
