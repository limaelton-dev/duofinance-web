import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Member, Split } from '../types/shared-expense';
import { decimalUnits, exactShares } from '../utils/expense-money';
import { formatPositionMoney } from '../utils/position-money';
import styles from './expenses.module.css';

export function calculateExpenseSplit(
    total: number | null,
    members: Member[],
    parts: Record<string, string>,
    mode: Split['mode'],
) {
    let split: Split | null = null,
        calculated: { memberId: string; amountInCents: number }[] = [],
        splitError: string | null = null;
    try {
        const values = members.map((m) => {
            const text =
                parts[m.memberId] ??
                (mode === 'PERCENTAGES'
                    ? members.length === 1
                        ? '100'
                        : '50'
                    : '');
            const value = decimalUnits(text);
            if (value === null)
                throw new Error(
                    mode === 'AMOUNTS'
                        ? 'Informe o valor de cada parte, com até duas casas decimais.'
                        : 'Informe os percentuais com até duas casas decimais.',
                );
            return { memberId: m.memberId, value };
        });
        split =
            mode === 'AMOUNTS'
                ? {
                      mode,
                      shares: values.map((v) => ({
                          memberId: v.memberId,
                          amountInCents: v.value,
                      })),
                  }
                : {
                      mode,
                      shares: values.map((v) => ({
                          memberId: v.memberId,
                          basisPoints: v.value,
                      })),
                  };
        if (total !== null && total > 0 && members.length)
            calculated = exactShares(total, split);
    } catch (failure) {
        splitError = (failure as Error).message;
    }
    const splitDifference =
        split?.mode === 'PERCENTAGES'
            ? 10000n -
              split.shares.reduce(
                  (sum, share) => sum + BigInt(share.basisPoints),
                  0n,
              )
            : split?.mode === 'AMOUNTS' && total !== null
              ? BigInt(total) -
                split.shares.reduce(
                    (sum, share) => sum + BigInt(share.amountInCents),
                    0n,
                )
              : null;
    const splitDifferenceText =
        splitDifference === null
            ? ''
            : formatPositionMoney(
                  (splitDifference < 0n
                      ? -splitDifference
                      : splitDifference
                  ).toString(),
              );
    const percentageSplit = split?.mode === 'PERCENTAGES' ? split : null;
    const residualRecipient =
        total !== null && percentageSplit
            ? calculated.find(
                  (share) =>
                      BigInt(share.amountInCents) >
                      (BigInt(total) *
                          BigInt(
                              percentageSplit.shares.find(
                                  (part) => part.memberId === share.memberId,
                              )!.basisPoints,
                          )) /
                          10000n,
              )
            : null;

    return {
        split,
        calculated,
        splitError,
        splitDifference,
        splitDifferenceText,
        residualRecipient,
    };
}

export function ExpenseSplitFields({
    busy,
    members,
    mode,
    parts,
    splitError,
    splitDifference,
    splitDifferenceText,
    invalid,
    mark,
    setMode,
    setParts,
}: {
    busy: boolean;
    members: Member[];
    mode: Split['mode'];
    parts: Record<string, string>;
    splitError: string | null;
    splitDifference: bigint | null;
    splitDifferenceText: string;
    invalid: (field: string) => boolean;
    mark: () => void;
    setMode: (mode: Split['mode']) => void;
    setParts: (parts: Record<string, string>) => void;
}) {
    return (
        <fieldset disabled={busy}>
            <legend>Como dividir?</legend>
            {members.length === 2 && (
                <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                        mark();
                        setMode('PERCENTAGES');
                        setParts(
                            Object.fromEntries(
                                members.map((m) => [m.memberId, '50']),
                            ),
                        );
                    }}
                >
                    50 / 50
                </Button>
            )}
            <label>
                Divisão
                <select
                    aria-label="Divisão"
                    name="responsibilitySplit.mode"
                    aria-invalid={invalid('responsibilitySplit.mode')}
                    aria-describedby={
                        invalid('responsibilitySplit.mode')
                            ? 'expense-error'
                            : undefined
                    }
                    value={mode}
                    onChange={(e) => {
                        mark();
                        setMode(e.target.value as typeof mode);
                        setParts({});
                    }}
                >
                    <option value="PERCENTAGES">Percentuais</option>
                    <option value="AMOUNTS">Valores</option>
                </select>
            </label>
            {members.map((m, index) => (
                <label key={m.memberId}>
                    {m.displayName} ({mode === 'AMOUNTS' ? 'R$' : '%'})
                    <Input
                        name={
                            index === 0
                                ? 'responsibilitySplit.shares'
                                : `responsibilitySplit.shares.${index}`
                        }
                        data-share-index={index}
                        aria-invalid={invalid('responsibilitySplit.shares')}
                        aria-describedby={
                            invalid('responsibilitySplit.shares')
                                ? 'expense-error'
                                : undefined
                        }
                        inputMode="decimal"
                        value={
                            parts[m.memberId] ??
                            (mode === 'PERCENTAGES'
                                ? members.length === 1
                                    ? '100'
                                    : '50'
                                : '')
                        }
                        onChange={(e) => {
                            mark();
                            setParts({
                                ...parts,
                                [m.memberId]: e.target.value,
                            });
                        }}
                    />
                </label>
            ))}
            {splitError && <p className={styles.help}>{splitError}</p>}
            {splitDifference !== null && splitDifference !== 0n && (
                <p className={styles.help}>
                    {splitDifference > 0n
                        ? 'Faltam '
                        : 'A divisão excede o total em '}
                    {mode === 'PERCENTAGES'
                        ? splitDifferenceText.replace('R$ ', '') + '%'
                        : splitDifferenceText}
                    {splitDifference > 0n ? ' para fechar a divisão.' : '.'}
                </p>
            )}
        </fieldset>
    );
}
