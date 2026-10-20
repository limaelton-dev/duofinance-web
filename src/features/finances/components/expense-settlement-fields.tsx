import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { ExpenseOptions, Settlement } from '../types/shared-expense';
import { businessToday, formatDate } from '../utils/expense-money';

export function ExpenseSettlementFields({
    busy,
    suggested,
    optionsFailed,
    referenceDate,
    nextCursor,
    selectedMode,
    openCycles,
    targetDate,
    cycleId,
    invalid,
    mark,
    setSettlementMode,
    setTargetDate,
    setCycleId,
    loadMore,
}: {
    busy: boolean;
    suggested: string | null;
    optionsFailed: boolean;
    referenceDate: string | undefined;
    nextCursor: string | null | undefined;
    selectedMode: Settlement['mode'];
    openCycles: ExpenseOptions['openCycles'];
    targetDate: string;
    cycleId: string;
    invalid: (field: string) => boolean;
    mark: () => void;
    setSettlementMode: (mode: Settlement['mode']) => void;
    setTargetDate: (date: string) => void;
    setCycleId: (id: string) => void;
    loadMore: () => void;
}) {
    return (
        <fieldset disabled={busy}>
            <legend>Quando acertar?</legend>
            {!suggested && !optionsFailed && (
                <p>
                    Acerto padrão não definido. Escolha outra data, um acerto
                    aberto ou sem data de acerto.
                </p>
            )}
            <label>
                Acerto
                <select
                    aria-label="Acerto"
                    name="settlement.mode"
                    aria-invalid={invalid('settlement.mode')}
                    aria-describedby={
                        invalid('settlement.mode') ? 'expense-error' : undefined
                    }
                    value={selectedMode}
                    onChange={(e) => {
                        mark();
                        setSettlementMode(e.target.value as Settlement['mode']);
                    }}
                >
                    {suggested && (
                        <option value="SUGGESTED">
                            Sugerido: {formatDate(suggested)}
                        </option>
                    )}
                    <option value="DATE">Outra data</option>
                    {openCycles.length > 0 && !optionsFailed && (
                        <option value="CYCLE">Acerto aberto existente</option>
                    )}
                    <option value="NONE">Sem data de acerto</option>
                </select>
            </label>
            {selectedMode === 'DATE' && (
                <label>
                    Data do acerto
                    <Input
                        name="settlement.targetDate"
                        aria-invalid={invalid('settlement.targetDate')}
                        aria-describedby={
                            invalid('settlement.targetDate')
                                ? 'expense-error'
                                : undefined
                        }
                        type="date"
                        min={referenceDate ?? businessToday()}
                        value={targetDate}
                        onChange={(e) => {
                            mark();
                            setTargetDate(e.target.value);
                        }}
                    />
                </label>
            )}
            {selectedMode === 'CYCLE' && (
                <label>
                    Acerto aberto
                    <select
                        aria-label="Acerto aberto"
                        name="settlement.cycleId"
                        aria-invalid={invalid('settlement.cycleId')}
                        aria-describedby={
                            invalid('settlement.cycleId')
                                ? 'expense-error'
                                : undefined
                        }
                        value={cycleId}
                        onChange={(e) => {
                            mark();
                            setCycleId(e.target.value);
                        }}
                    >
                        <option value="">Selecione</option>
                        {openCycles.map((c) => (
                            <option key={c.id} value={c.id}>
                                {formatDate(c.targetDate)}
                            </option>
                        ))}
                    </select>
                </label>
            )}
            {nextCursor && !optionsFailed && (
                <Button type="button" variant="outline" onClick={loadMore}>
                    Carregar mais acertos
                </Button>
            )}
        </fieldset>
    );
}
