'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getIncomeOptions } from '@/lib/api/income';
import { installmentRequest } from '@/lib/api/installment-commitment';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { useFinancialCommand } from '../hooks/use-financial-command';
import { useExpenseLeaveGuard } from '../hooks/use-expense-leave-guard';
import type {
    InstallmentInput,
    InstallmentPreview,
    InstallmentDetail,
} from '../types/installment-commitment';
import type { Split } from '../types/shared-expense';
import { formatDate, formatMoney } from '../utils/expense-money';
import {
    PlanningBoundary,
    PlanningHeading,
    PlanningDistribution,
    QueryFeedback,
    CommandFeedback,
    buildPlanningSplit,
    positiveAmount,
    planningKey,
    usePlanningPreview,
    EconomicShares,
} from './planning-shared';
import styles from './expenses.module.css';
import layout from './planning.module.css';

export function InstallmentCommitmentComposer({
    spaceId,
}: {
    spaceId: string;
}) {
    return (
        <PlanningBoundary spaceId={spaceId}>
            {(personId) => <Composer personId={personId} spaceId={spaceId} />}
        </PlanningBoundary>
    );
}
function Composer({
    personId,
    spaceId,
}: {
    personId: string;
    spaceId: string;
}) {
    const options = useExpenseQuery(
        personId,
        spaceId,
        planningKey(personId, spaceId, 'installment-create-options'),
        true,
        (signal) => getIncomeOptions(spaceId, signal),
    );
    const [description, setDescription] = useState(''),
        [count, setCount] = useState('2'),
        [amountMode, setAmountMode] = useState<'TOTAL' | 'BASE' | 'MANUAL'>(
            'TOTAL',
        ),
        [amount, setAmount] = useState(''),
        [amountLines, setAmountLines] = useState('');
    const [cadence, setCadence] = useState<'MONTHLY' | 'ANNUAL' | 'EXPLICIT'>(
            'MONTHLY',
        ),
        [firstDate, setFirstDate] = useState(''),
        [dateLines, setDateLines] = useState(''),
        [payment, setPayment] =
            useState<InstallmentInput['plannedPaymentMethod']>(null);
    const [mode, setMode] = useState<Split['mode']>('PERCENTAGES'),
        [shares, setShares] = useState<Record<string, string>>({}),
        [member, setMember] = useState('');
    const [review, setReview] = useState<InstallmentInput | null>(null),
        [error, setError] = useState<string | null>(null),
        [result, setResult] = useState<InstallmentDetail | null>(null),
        [dirty, setDirty] = useState(false);
    const form = useRef<HTMLFormElement>(null);
    const preview = usePlanningPreview<InstallmentInput, InstallmentPreview>(
        spaceId,
        (input, token, signal) =>
            installmentRequest(
                spaceId,
                '/preview',
                input,
                token,
                undefined,
                signal,
            ),
    );
    const command = useFinancialCommand<InstallmentInput, InstallmentDetail>({
        execute: (id, input, token, key, signal) =>
            installmentRequest(id, '', input, token, key, signal),
        onSuccess: (value) => {
            setResult(value);
            setDirty(false);
        },
    });
    const busy = command.isPending || command.canRetry;
    useExpenseLeaveGuard(dirty, busy, () => setDirty(false));
    function change() {
        setDirty(true);
        setReview(null);
        setError(null);
        preview.reset();
    }
    function prepare() {
        const o = options.data;
        if (
            !o ||
            !o.canCreate ||
            options.isFetching ||
            options.isError ||
            busy ||
            !form.current?.reportValidity()
        )
            return;
        try {
            const n = Number(count);
            if (!Number.isInteger(n) || n < 1 || n > 1200)
                throw new Error('Informe de 1 a 1.200 parcelas.');
            const amounts =
                amountMode === 'MANUAL'
                    ? amountLines
                          .split(/\r?\n/)
                          .map((line) => line.trim())
                          .filter(Boolean)
                          .map(positiveAmount)
                    : undefined;
            if (amounts && amounts.length !== n)
                throw new Error(
                    'Informe exatamente um valor por parcela, em linhas separadas.',
                );
            const cents = amounts ? null : positiveAmount(amount),
                total = amounts
                    ? amounts.reduce((sum, value) => sum + BigInt(value), 0n)
                    : BigInt(cents!) * BigInt(amountMode === 'BASE' ? n : 1);
            if (total > BigInt(Number.MAX_SAFE_INTEGER))
                throw new Error('O valor total ultrapassa o limite permitido.');
            const dates =
                cadence === 'EXPLICIT'
                    ? dateLines
                          .split(/\r?\n/)
                          .map((line) => line.trim())
                          .filter(Boolean)
                    : undefined;
            if (
                dates &&
                (dates.length !== n ||
                    dates.some((value) => !/^\d{4}-\d{2}-\d{2}$/.test(value)))
            )
                throw new Error(
                    'Informe exatamente uma data YYYY-MM-DD por parcela.',
                );
            const base = {
                description: description.trim(),
                count: n,
                plannedPaymentMethod: payment,
                ...(cadence === 'EXPLICIT'
                    ? { explicitDueDates: dates! }
                    : { firstDueDate: firstDate, cadence }),
                ...(amounts
                    ? { amountsInCents: amounts }
                    : amountMode === 'TOTAL'
                      ? { totalAmountInCents: cents! }
                      : { baseAmountInCents: cents! }),
            };
            const input: InstallmentInput =
                o.spaceType === 'PERSONAL'
                    ? { ...base, scope: 'PERSONAL' }
                    : {
                          ...base,
                          scope: 'SHARED',
                          distribution: buildPlanningSplit(
                              o.members ?? [],
                              mode,
                              shares,
                              Number(total),
                          ),
                          expectedMemberId: member || null,
                      };
            setReview(input);
            void preview.preview(input);
        } catch (failure) {
            setError((failure as Error).message);
        }
    }
    if (result)
        return (
            <section className={styles.stack}>
                <PlanningHeading
                    title="Parcelamento criado"
                    spaceId={spaceId}
                />
                <div className={styles.receipt} role="status">
                    <h2>{result.commitment.description}</h2>
                    <p>
                        {result.commitment.plan.count} parcelas ·{' '}
                        {formatMoney(result.commitment.plan.totalAmountInCents)}
                    </p>
                    <p>
                        Previsão registrada. Nenhum pagamento ou obrigação no
                        cartão foi criado automaticamente.
                    </p>
                    {result.replayed && (
                        <p>A tentativa original foi recuperada.</p>
                    )}
                    <Button asChild>
                        <Link
                            href={`/spaces/${spaceId}/installment-commitments/${result.commitment.id}`}
                        >
                            Conferir parcelamento
                        </Link>
                    </Button>
                </div>
            </section>
        );
    return (
        <section className={styles.stack}>
            <PlanningHeading title="Novo parcelamento" spaceId={spaceId}>
                Um plano com início e fim. Confira valores e datas antes de
                criar.
            </PlanningHeading>
            <QueryFeedback query={options} />
            {options.data?.canCreate && !options.isError ? (
                <form
                    ref={form}
                    className={`${styles.fields} ${layout.section}`}
                    onChange={change}
                    onSubmit={(event) => {
                        event.preventDefault();
                        prepare();
                    }}
                >
                    <fieldset
                        disabled={busy || preview.pending || options.isFetching}
                    >
                        <legend>Plano e cronograma</legend>
                        <label>
                            Descrição
                            <Input
                                name="description"
                                required
                                maxLength={160}
                                value={description}
                                onChange={(event) =>
                                    setDescription(event.target.value)
                                }
                            />
                        </label>
                        <label>
                            Quantidade de parcelas
                            <Input
                                name="count"
                                type="number"
                                min={1}
                                max={1200}
                                required
                                value={count}
                                onChange={(event) =>
                                    setCount(event.target.value)
                                }
                            />
                        </label>
                        <label>
                            Informar valores por
                            <select
                                value={amountMode}
                                onChange={(event) =>
                                    setAmountMode(
                                        event.target.value as typeof amountMode,
                                    )
                                }
                            >
                                <option value="TOTAL">
                                    Valor total do plano
                                </option>
                                <option value="BASE">
                                    Valor de cada parcela
                                </option>
                                <option value="MANUAL">
                                    Valores diferentes por parcela
                                </option>
                            </select>
                        </label>
                        {amountMode === 'MANUAL' ? (
                            <label>
                                Valores em R$, um por linha
                                <textarea
                                    className={layout.textarea}
                                    required
                                    rows={5}
                                    value={amountLines}
                                    placeholder={'100,00\n120,00'}
                                    onChange={(event) =>
                                        setAmountLines(event.target.value)
                                    }
                                />
                            </label>
                        ) : (
                            <label>
                                {amountMode === 'TOTAL'
                                    ? 'Valor total (R$)'
                                    : 'Valor de cada parcela (R$)'}
                                <Input
                                    required
                                    inputMode="decimal"
                                    value={amount}
                                    onChange={(event) =>
                                        setAmount(event.target.value)
                                    }
                                />
                            </label>
                        )}
                        <label>
                            Vencimentos
                            <select
                                value={cadence}
                                onChange={(event) =>
                                    setCadence(
                                        event.target.value as typeof cadence,
                                    )
                                }
                            >
                                <option value="MONTHLY">Mensais</option>
                                <option value="ANNUAL">Anuais</option>
                                <option value="EXPLICIT">
                                    Datas diferentes por parcela
                                </option>
                            </select>
                        </label>
                        {cadence === 'EXPLICIT' ? (
                            <label>
                                Datas YYYY-MM-DD, uma por linha
                                <textarea
                                    className={layout.textarea}
                                    required
                                    rows={5}
                                    value={dateLines}
                                    placeholder={'2026-11-20\n2026-12-20'}
                                    onChange={(event) =>
                                        setDateLines(event.target.value)
                                    }
                                />
                            </label>
                        ) : (
                            <label>
                                Primeiro vencimento
                                <Input
                                    type="date"
                                    name="firstDueDate"
                                    required
                                    value={firstDate}
                                    onChange={(event) =>
                                        setFirstDate(event.target.value)
                                    }
                                />
                            </label>
                        )}
                        <label>
                            Meio de pagamento previsto
                            <select
                                value={payment ?? ''}
                                onChange={(event) =>
                                    setPayment(
                                        (event.target.value ||
                                            null) as typeof payment,
                                    )
                                }
                            >
                                <option value="">Sem previsão</option>
                                <option value="PIX">Pix</option>
                                <option value="DEBIT">Débito</option>
                                <option value="CASH">Dinheiro</option>
                                <option value="CARD">Cartão</option>
                            </select>
                        </label>
                        <p className={styles.help}>
                            A previsão do meio não registra pagamento. Não
                            calculamos juros, descontos ou amortização bancária.
                        </p>
                        {options.data.spaceType === 'SHARED' && (
                            <PlanningDistribution
                                members={options.data.members ?? []}
                                mode={mode}
                                entries={shares}
                                onMode={(value) => {
                                    change();
                                    setMode(value);
                                    setShares({});
                                }}
                                onEntries={(value) => {
                                    change();
                                    setShares(value);
                                }}
                                expectedMemberId={member}
                                onExpectedMember={(value) => {
                                    change();
                                    setMember(value);
                                }}
                            />
                        )}
                    </fieldset>
                    {error && <p role="alert">{error}</p>}
                    {preview.error && <p role="alert">{preview.error}</p>}
                    {preview.pending && (
                        <p role="status">Consultando cronograma…</p>
                    )}
                    <CommandFeedback command={command} />
                    {!preview.data && (
                        <Button
                            type="submit"
                            disabled={
                                busy || preview.pending || options.isFetching
                            }
                        >
                            Conferir cronograma
                        </Button>
                    )}
                    {preview.data && review && (
                        <section
                            className={styles.summary}
                            aria-label="Cronograma do parcelamento"
                        >
                            <h2>Confira cada parcela</h2>
                            <p>
                                {preview.data.count} parcelas ·{' '}
                                {formatMoney(preview.data.totalAmountInCents)}
                            </p>
                            <ol className={layout.list}>
                                {preview.data.installments.map((item) => (
                                    <li
                                        key={item.position}
                                        className={layout.row}
                                    >
                                        <h3>
                                            Parcela {item.position} ·{' '}
                                            {formatDate(item.dueDate)}
                                        </h3>
                                        <p className={layout.money}>
                                            {formatMoney(item.amountInCents)}
                                        </p>
                                        <EconomicShares
                                            shares={item.economicShares}
                                            members={
                                                options.data!.members ?? []
                                            }
                                        />
                                    </li>
                                ))}
                            </ol>
                            <p className={styles.help}>
                                O cronograma confirmado preserva as datas e os
                                valores apresentados. Eventuais centavos de
                                divisão aparecem na última parcela.
                            </p>
                            <div className={styles.actions}>
                                <Button
                                    type="button"
                                    disabled={busy || options.isFetching}
                                    onClick={() =>
                                        command.submit(
                                            review.scope === 'SHARED'
                                                ? {
                                                      ...review,
                                                      expectedSpaceVersion:
                                                          preview.data!
                                                              .expectedSpaceVersion,
                                                      expectedRuleVersion:
                                                          preview.data!
                                                              .expectedRuleVersion,
                                                  }
                                                : review,
                                        )
                                    }
                                >
                                    Criar parcelamento
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => {
                                        setReview(null);
                                        preview.reset();
                                    }}
                                >
                                    Editar plano
                                </Button>
                            </div>
                        </section>
                    )}
                </form>
            ) : options.data && !options.data.canCreate ? (
                <p>Este espaço não permite novos parcelamentos agora.</p>
            ) : null}
        </section>
    );
}
