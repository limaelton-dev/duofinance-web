'use client';
import { FinancialLoading } from './financial-loading';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useEffect, useRef, useState } from 'react';
import { getExpenseDisbursementOptions } from '@/lib/api/expense-disbursement';
import { ApiError } from '@/lib/api/api-error';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { useExpenseDisbursementCommand } from '../hooks/use-expense-disbursement-command';
import { useExpenseLeaveGuard } from '../hooks/use-expense-leave-guard';
import type { ExpenseDisbursementInput } from '../types/expense-disbursement';
import type { DisbursementMethod } from '../types/personal-expense';
import type { Settlement } from '../types/shared-expense';
import { decimalUnits, formatDate, formatMoney } from '../utils/expense-money';
import { isPastOrCurrentCivilDate } from '../utils/personal-expense-date';
import { disbursementMethodLabels } from './personal-expense-summary';
import styles from './financial-records.module.css';

export function ExpenseDisbursementForm({
    personId,
    spaceId,
    commitmentId,
    onAccessLost,
}: {
    personId: string;
    spaceId: string;
    commitmentId: string;
    onAccessLost: () => void;
}) {
    const options = useExpenseQuery(
        personId,
        spaceId,
        [
            'finances',
            personId,
            spaceId,
            'expense-disbursement-options',
            commitmentId,
        ],
        true,
        (signal) =>
            getExpenseDisbursementOptions(spaceId, commitmentId, signal),
    );
    const [amount, setAmount] = useState(''),
        [date, setDate] = useState(''),
        [payer, setPayer] = useState('');
    const [method, setMethod] = useState<DisbursementMethod>('PIX'),
        [mode, setMode] = useState<Settlement['mode']>('NONE');
    const [targetDate, setTargetDate] = useState(''),
        [cycleId, setCycleId] = useState('');
    const [dirty, setDirty] = useState(false),
        [review, setReview] = useState<ExpenseDisbursementInput | null>(null),
        [validation, setValidation] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const form = useRef<HTMLFormElement>(null);
    const command = useExpenseDisbursementCommand((result) => {
        setDirty(false);
        setReview(null);
        setAmount('');
        setMessage(
            result.replayed
                ? 'A tentativa original foi recuperada.'
                : 'Pagamento registrado.',
        );
        void options.refetch();
    }, onAccessLost);
    const busy = command.isPending || command.canRetry;
    useExpenseLeaveGuard(dirty, busy, () => setDirty(false));
    useEffect(() => {
        if (
            options.error instanceof ApiError &&
            options.error.code === 'SPACE_NOT_FOUND'
        )
            onAccessLost();
    }, [options.error, onAccessLost]);
    useEffect(() => {
        if (command.fields.length)
            form.current
                ?.querySelector<HTMLElement>(`[name="${command.fields[0]}"]`)
                ?.focus();
    }, [command.fields]);
    function change() {
        setDirty(true);
        setReview(null);
        setValidation(null);
        setMessage(null);
    }
    function reject(field: string, text: string) {
        setValidation(text);
        form.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
    }
    function prepare() {
        const o = options.data;
        if (
            !o ||
            !o.canDisburse ||
            options.isFetching ||
            options.isError ||
            busy
        )
            return;
        const cents = decimalUnits(amount),
            factDate = date || o.referenceDate;
        if (cents === null || cents <= 0 || cents > o.remainingAmountInCents)
            return reject(
                'amountInCents',
                'Informe um valor positivo com até duas casas decimais, até o restante a pagar.',
            );
        if (!isPastOrCurrentCivilDate(factDate, o.referenceDate))
            return reject(
                'factDate',
                'Informe uma data válida do pagamento já ocorrido, até hoje.',
            );
        if (!o.disbursementMethods.includes(method))
            return reject(
                'method',
                'Escolha um meio de desembolso disponível.',
            );
        const base = {
            amountInCents: cents,
            factDate,
            method,
            expectedCommitmentVersion: o.expectedCommitmentVersion,
        };
        if (o.spaceType === 'PERSONAL') return setReview(base);
        if (
            !o.members?.some((m) => m.memberId === payer) ||
            o.expectedSpaceVersion === undefined
        )
            return reject('payerMemberId', 'Escolha quem pagou de fato.');
        let settlement: Settlement = { mode: 'NONE' };
        if (mode === 'DATE') {
            if (!targetDate || targetDate < o.referenceDate)
                return reject(
                    'targetDate',
                    'Escolha uma data-alvo de hoje em diante.',
                );
            settlement = { mode: 'DATE', targetDate };
        } else if (mode === 'CYCLE') {
            if (!o.openCycles?.some((c) => c.id === cycleId))
                return reject('cycleId', 'Escolha um acerto aberto.');
            settlement = { mode: 'CYCLE', cycleId };
        } else if (mode === 'SUGGESTED') {
            if (!o.suggestedTargetDate || !o.defaultSettlementRule?.version)
                return reject('settlement', 'Atualize a sugestão de acerto.');
            settlement = {
                mode: 'SUGGESTED',
                referenceDate: o.referenceDate,
                expectedRuleVersion: o.defaultSettlementRule.version,
            };
        }
        setReview({
            ...base,
            payerMemberId: payer,
            expectedSpaceVersion: o.expectedSpaceVersion,
            settlement,
        });
    }
    const o = options.data;
    return (
        <section className={styles.stack} aria-label="Novo pagamento">
            {message && <p role="status">{message}</p>}
            {(options.isPending || options.isFetching) && (
                <FinancialLoading label="Carregando opções de pagamento…" />
            )}
            {options.isError && (
                <div className={styles.feedback}>
                    <p role="alert">
                        Não foi possível carregar as opções de pagamento.
                    </p>
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => void options.refetch()}
                    >
                        Tentar novamente as opções
                    </Button>
                </div>
            )}
            {o && !o.canDisburse && (
                <p>Este espaço não permite registrar o pagamento agora.</p>
            )}
            {o?.canDisburse && !options.isError && (
                <form
                    ref={form}
                    noValidate
                    onSubmit={(e) => {
                        e.preventDefault();
                        prepare();
                    }}
                >
                    <h3>Registrar pagamento</h3>
                    <p>Falta pagar: {formatMoney(o.remainingAmountInCents)}.</p>
                    <fieldset disabled={busy || options.isFetching}>
                        <legend>Pagamento efetivo</legend>
                        <label>
                            Valor pago agora (R$)
                            <Input
                                name="amountInCents"
                                inputMode="decimal"
                                value={amount}
                                onChange={(e) => {
                                    change();
                                    setAmount(e.target.value);
                                }}
                                aria-invalid={
                                    command.fields.includes('amountInCents') ||
                                    undefined
                                }
                            />
                        </label>
                        <label>
                            Data do pagamento
                            <Input
                                name="factDate"
                                type="date"
                                max={o.referenceDate}
                                value={date || o.referenceDate}
                                onChange={(e) => {
                                    change();
                                    setDate(e.target.value);
                                }}
                                aria-invalid={
                                    command.fields.includes('factDate') ||
                                    undefined
                                }
                            />
                        </label>
                        <label>
                            Meio do desembolso
                            <select
                                name="method"
                                value={method}
                                onChange={(e) => {
                                    change();
                                    setMethod(
                                        e.target.value as DisbursementMethod,
                                    );
                                }}
                            >
                                {o.disbursementMethods.map((m) => (
                                    <option key={m} value={m}>
                                        {disbursementMethodLabels[m]}
                                    </option>
                                ))}
                            </select>
                        </label>
                        {o.spaceType === 'SHARED' && (
                            <>
                                <label>
                                    Quem pagou de fato
                                    <select
                                        name="payerMemberId"
                                        value={payer}
                                        onChange={(e) => {
                                            change();
                                            setPayer(e.target.value);
                                        }}
                                    >
                                        <option value="">
                                            Escolha uma pessoa
                                        </option>
                                        {o.members?.map((m) => (
                                            <option
                                                key={m.memberId}
                                                value={m.memberId}
                                            >
                                                {m.displayName}
                                            </option>
                                        ))}
                                    </select>
                                </label>
                                <label>
                                    Acerto para nova pendência
                                    <select
                                        name="settlement"
                                        value={mode}
                                        onChange={(e) => {
                                            change();
                                            setMode(
                                                e.target
                                                    .value as Settlement['mode'],
                                            );
                                        }}
                                    >
                                        <option value="NONE">
                                            Sem acerto associado
                                        </option>
                                        <option value="DATE">
                                            Criar acerto por data
                                        </option>
                                        {!!o.openCycles?.length && (
                                            <option value="CYCLE">
                                                Usar acerto aberto
                                            </option>
                                        )}
                                        {o.suggestedTargetDate && (
                                            <option value="SUGGESTED">
                                                Sugestão:{' '}
                                                {o.suggestedTargetDate}
                                            </option>
                                        )}
                                    </select>
                                </label>
                                {mode === 'DATE' && (
                                    <label>
                                        Data-alvo do acerto
                                        <Input
                                            name="targetDate"
                                            type="date"
                                            min={o.referenceDate}
                                            value={targetDate}
                                            onChange={(e) => {
                                                change();
                                                setTargetDate(e.target.value);
                                            }}
                                            aria-invalid={
                                                command.fields.includes(
                                                    'targetDate',
                                                ) || undefined
                                            }
                                        />
                                    </label>
                                )}
                                {mode === 'CYCLE' && (
                                    <label>
                                        Acerto aberto
                                        <select
                                            name="cycleId"
                                            value={cycleId}
                                            onChange={(e) => {
                                                change();
                                                setCycleId(e.target.value);
                                            }}
                                        >
                                            <option value="">Escolha</option>
                                            {o.openCycles?.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    {c.targetDate}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                )}
                                <p>
                                    A escolha se aplica quando este pagamento
                                    criar uma nova pendência. Os acertos
                                    existentes são preservados.
                                </p>
                            </>
                        )}
                    </fieldset>
                    {validation && <p role="alert">{validation}</p>}
                    {command.error && (
                        <div className={styles.feedback}>
                            <p role="alert">{command.error}</p>
                            {!busy && (
                                <Button
                                    variant="outline"
                                    type="button"
                                    onClick={() => {
                                        setReview(null);
                                        void options.refetch();
                                    }}
                                >
                                    Atualizar opções e revisar
                                </Button>
                            )}
                        </div>
                    )}
                    <Button type="submit" disabled={busy || options.isFetching}>
                        Revisar pagamento
                    </Button>
                    {review && (
                        <div role="group" aria-label="Confirmar pagamento">
                            <h3>Confira o pagamento</h3>
                            <dl>
                                <dt>Valor pago agora</dt>
                                <dd>{formatMoney(review.amountInCents)}</dd>
                                <dt>Meio do pagamento</dt>
                                <dd>
                                    {disbursementMethodLabels[review.method]}
                                </dd>
                                <dt>Restante a pagar após o registro</dt>
                                <dd>
                                    {formatMoney(
                                        o.remainingAmountInCents -
                                            review.amountInCents,
                                    )}
                                </dd>
                            </dl>
                            <p>
                                Confirme o pagamento de{' '}
                                {formatMoney(review.amountInCents)} em{' '}
                                {formatDate(review.factDate)}
                                {review.payerMemberId
                                    ? ` por ${o.members?.find((m) => m.memberId === review.payerMemberId)?.displayName}`
                                    : ''}
                                .
                            </p>
                            <Button
                                type="button"
                                disabled={busy || options.isFetching}
                                onClick={() =>
                                    command.submit({
                                        id: commitmentId,
                                        input: review,
                                    })
                                }
                            >
                                Confirmar pagamento
                            </Button>
                            <Button
                                variant="outline"
                                type="button"
                                disabled={busy}
                                onClick={() => setReview(null)}
                            >
                                Editar
                            </Button>
                        </div>
                    )}
                    {command.canRetry && (
                        <Button
                            variant="outline"
                            type="button"
                            disabled={command.isPending}
                            onClick={command.retry}
                        >
                            Reenviar a mesma tentativa
                        </Button>
                    )}
                    {command.isPending && (
                        <p role="status">Registrando pagamento…</p>
                    )}
                </form>
            )}
        </section>
    );
}
