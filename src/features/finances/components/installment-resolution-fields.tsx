import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type {
    AnticipationOptions,
    ResolutionOptions,
    AnticipationPreview,
} from '../types/installment-commitment';
import { formatDate, formatMoney } from '../utils/expense-money';
import { signedMoney } from './planning-shared';
import styles from './expenses.module.css';
import layout from './planning.module.css';

export type SelectedInstallments = Record<
    string,
    { version: number; position: number; date: string; remaining: number }
>;

export function InstallmentSelectionFields({
    mode,
    selectionMode,
    quantity,
    options,
    selected,
    cursor,
    change,
    setSelected,
    setSelectionMode,
    setQuantity,
    setCursor,
}: {
    mode: 'ANTICIPATE' | 'CANCEL';
    selectionMode: 'IDS' | 'FROM_END';
    quantity: string;
    options: AnticipationOptions | ResolutionOptions;
    selected: SelectedInstallments;
    cursor: string | null;
    change: (clearResolved?: boolean) => void;
    setSelected: Dispatch<SetStateAction<SelectedInstallments>>;
    setSelectionMode: (mode: 'IDS' | 'FROM_END') => void;
    setQuantity: (quantity: string) => void;
    setCursor: (cursor: string | null) => void;
}) {
    return (
        <>
            {mode === 'ANTICIPATE' && (
                <label>
                    Selecionar parcelas
                    <select
                        value={selectionMode}
                        onChange={(event) => {
                            change(true);
                            setSelected({});
                            setSelectionMode(
                                event.target.value as typeof selectionMode,
                            );
                        }}
                    >
                        <option value="IDS">Escolher uma a uma</option>
                        <option value="FROM_END">
                            Das últimas para as primeiras
                        </option>
                    </select>
                </label>
            )}
            {mode === 'ANTICIPATE' && selectionMode === 'FROM_END' && (
                <label>
                    Quantidade a partir do final
                    <Input
                        type="number"
                        required
                        min={1}
                        max={1200}
                        value={quantity}
                        onChange={(event) => {
                            change(true);
                            setQuantity(event.target.value);
                        }}
                    />
                </label>
            )}
            {(mode === 'CANCEL' || selectionMode === 'IDS') && (
                <>
                    <ul className={layout.list}>
                        {options.items.map((item) => {
                            const anticipation = 'selectionEligible' in item,
                                id = anticipation
                                    ? item.id
                                    : item.installmentId,
                                eligible = anticipation
                                    ? item.selectionEligible
                                    : item.cancellationEligible,
                                version = anticipation
                                    ? item.stateVersion
                                    : item.expectedInstallmentVersion,
                                remaining = anticipation
                                    ? item.remainingAmountInCents
                                    : item.expectedRemainingAmountInCents;
                            return (
                                <li key={id} className={layout.row}>
                                    <label className={layout.check}>
                                        <input
                                            type="checkbox"
                                            disabled={!eligible}
                                            checked={!!selected[id]}
                                            onChange={(event) => {
                                                change(true);
                                                setSelected((previous) => {
                                                    const next = {
                                                        ...previous,
                                                    };
                                                    if (event.target.checked)
                                                        next[id] = {
                                                            version,
                                                            remaining,
                                                            position:
                                                                item.position,
                                                            date: item.dueDate,
                                                        };
                                                    else delete next[id];
                                                    return next;
                                                });
                                            }}
                                        />
                                        Parcela {item.position} ·{' '}
                                        {formatDate(item.dueDate)} ·{' '}
                                        {formatMoney(remaining)}
                                    </label>
                                    {!eligible && (
                                        <p className={styles.help}>
                                            {item.blockingReason ===
                                            'EXTERNAL_LIABILITY_EXISTS'
                                                ? 'Há obrigação externa assumida. Preserve esse fato.'
                                                : item.blockingReason ===
                                                    'INSTALLMENT_NOT_FUTURE'
                                                  ? 'O vencimento já chegou.'
                                                  : 'Esta parcela já foi resolvida.'}
                                        </p>
                                    )}
                                </li>
                            );
                        })}
                    </ul>
                    <p>{Object.keys(selected).length} parcelas selecionadas.</p>
                    <div className={styles.actions}>
                        {cursor && (
                            <Button
                                variant="outline"
                                type="button"
                                onClick={() => setCursor(null)}
                            >
                                Primeira página de parcelas
                            </Button>
                        )}
                        {options.nextCursor && (
                            <Button
                                variant="outline"
                                type="button"
                                onClick={() => setCursor(options.nextCursor)}
                            >
                                Mais parcelas
                            </Button>
                        )}
                    </div>
                </>
            )}
        </>
    );
}

export function InstallmentPayoffFields({
    options,
    amount,
    change,
    setAmount,
}: {
    options: AnticipationOptions | ResolutionOptions;
    amount: string;
    change: () => void;
    setAmount: (amount: string) => void;
}) {
    return (
        <>
            <p>
                {'totalOpenCount' in options ? options.totalOpenCount : 0}{' '}
                parcelas abertas · previsto restante:{' '}
                {signedMoney(
                    'totalExpectedRemainingAmountInCents' in options
                        ? options.totalExpectedRemainingAmountInCents
                        : '0',
                )}
                .
            </p>
            <label>
                Valor real global da quitação (R$)
                <Input
                    inputMode="decimal"
                    name="paidAmountInCents"
                    required
                    value={amount}
                    onChange={(event) => {
                        change();
                        setAmount(event.target.value);
                    }}
                />
            </label>
        </>
    );
}

export function InstallmentAnticipationAmounts({
    selectionPreview,
    resolved,
    amounts,
    resolveSelection,
    change,
    setResolved,
    setAmounts,
}: {
    selectionPreview: AnticipationPreview | null;
    resolved: AnticipationPreview | null;
    amounts: Record<string, string>;
    resolveSelection: () => Promise<void>;
    change: () => void;
    setResolved: (preview: AnticipationPreview) => void;
    setAmounts: Dispatch<SetStateAction<Record<string, string>>>;
}) {
    return (
        <>
            <Button
                variant="outline"
                type="button"
                onClick={() => void resolveSelection()}
            >
                Conferir parcelas selecionadas
            </Button>
            {selectionPreview && (
                <>
                    <p>
                        Informe quanto foi pago por cada parcela, mantendo o
                        vencimento original.
                    </p>
                    {selectionPreview.items.map((item) => (
                        <label key={item.installmentId}>
                            Parcela {item.position} · {formatDate(item.dueDate)}{' '}
                            · restante{' '}
                            {formatMoney(item.expectedRemainingAmountInCents)}
                            <Input
                                required
                                inputMode="decimal"
                                aria-label={`Valor real da parcela ${item.position}`}
                                value={amounts[item.installmentId] ?? ''}
                                onChange={(event) => {
                                    if (!resolved)
                                        setResolved(selectionPreview);
                                    change();
                                    setAmounts((previous) => ({
                                        ...previous,
                                        [item.installmentId]:
                                            event.target.value,
                                    }));
                                }}
                            />
                        </label>
                    ))}
                </>
            )}
        </>
    );
}
