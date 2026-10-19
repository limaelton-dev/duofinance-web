'use client';
import { FinancialLoading } from './financial-loading';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useEffect, useRef, useState } from 'react';
import { getExternalLiabilitySettlementOptions } from '@/lib/api/external-liability-settlement';
import { ApiError } from '@/lib/api/api-error';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { useExternalLiabilitySettlementCommand } from '../hooks/use-external-liability-settlement-command';
import { useExpenseLeaveGuard } from '../hooks/use-expense-leave-guard';
import type { SettleExternalLiabilityInput } from '../types/external-liability-settlement';
import { decimalUnits, formatDate, formatMoney } from '../utils/expense-money';
import { isPastOrCurrentCivilDate } from '../utils/personal-expense-date';
import styles from './financial-records.module.css';

export function ExternalLiabilitySettlementForm({
    personId,
    spaceId,
    commitmentId,
    liabilityId,
    onAccessLost,
    onSuccess,
    onCancel,
}: {
    personId: string;
    spaceId: string;
    commitmentId: string;
    liabilityId: string;
    onAccessLost: () => void;
    onSuccess: (replayed: boolean) => void;
    onCancel: () => void;
}) {
    const options = useExpenseQuery(
        personId,
        spaceId,
        [
            'finances',
            personId,
            spaceId,
            'external-liability-settlement-options',
            commitmentId,
            liabilityId,
        ],
        true,
        (signal) =>
            getExternalLiabilitySettlementOptions(
                spaceId,
                commitmentId,
                liabilityId,
                signal,
            ),
    );
    const [amount, setAmount] = useState(''),
        [date, setDate] = useState('');
    const [dirty, setDirty] = useState(false),
        [review, setReview] = useState<SettleExternalLiabilityInput | null>(
            null,
        );
    const [validation, setValidation] = useState<string | null>(null);
    const form = useRef<HTMLFormElement>(null);
    const command = useExternalLiabilitySettlementCommand((result) => {
        setDirty(false);
        onSuccess(result.replayed);
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
    const o = options.data;
    function change() {
        setDirty(true);
        setReview(null);
        setValidation(null);
    }
    function reject(field: string, message: string) {
        setValidation(message);
        form.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
    }
    function prepare() {
        if (!o?.canSettle || options.isFetching || options.isError || busy)
            return;
        const cents = decimalUnits(amount),
            factDate = date || o.referenceDate;
        if (
            cents === null ||
            cents <= 0 ||
            cents > o.externalLiability.remainingAmountInCents
        )
            return reject(
                'amountInCents',
                'Informe um valor positivo com até duas casas decimais, até o saldo externo aberto.',
            );
        if (!isPastOrCurrentCivilDate(factDate, o.referenceDate))
            return reject(
                'factDate',
                'Informe uma data válida de pagamento, até hoje.',
            );
        setReview({
            amountInCents: cents,
            factDate,
            expectedCommitmentVersion: o.expectedCommitmentVersion,
            ...(o.spaceType === 'SHARED'
                ? { expectedSpaceVersion: o.expectedSpaceVersion }
                : {}),
        });
    }
    return (
        <section
            className={styles.stack}
            aria-label="Pagamento da obrigação externa"
        >
            {(options.isPending || options.isFetching) && (
                <FinancialLoading label="Carregando opções de pagamento…" />
            )}
            {options.isError && (
                <>
                    <p role="alert">
                        Não foi possível carregar as opções de pagamento.
                    </p>
                    <Button
                        variant="outline"
                        onClick={() => void options.refetch()}
                    >
                        Tentar novamente as opções
                    </Button>
                </>
            )}
            {o && !o.canSettle && (
                <p>
                    Não é possível registrar pagamento desta obrigação agora.
                    Somente o titular pode pagar uma obrigação aberta.
                </p>
            )}
            {o?.canSettle && !options.isError && (
                <form
                    ref={form}
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault();
                        prepare();
                    }}
                >
                    <h4>Registrar pagamento</h4>
                    <p>
                        {o.description}. Saldo externo aberto:{' '}
                        {formatMoney(
                            o.externalLiability.remainingAmountInCents,
                        )}
                        .
                    </p>
                    <fieldset disabled={busy || options.isFetching}>
                        <legend>Pagamento ao credor externo</legend>
                        <label>
                            Valor do pagamento (R$)
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
                            Data do pagamento externo
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
                    </fieldset>
                    {validation && <p role="alert">{validation}</p>}
                    {command.error && (
                        <>
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
                                    Atualizar saldo e revisar
                                </Button>
                            )}
                        </>
                    )}
                    <Button type="submit" disabled={busy || options.isFetching}>
                        Revisar pagamento
                    </Button>
                    {review && (
                        <div
                            role="group"
                            aria-label="Confirmar pagamento externo"
                        >
                            <p>
                                Valor pago: {formatMoney(review.amountInCents)}{' '}
                                em {formatDate(review.factDate)}. Saldo externo
                                após o pagamento:{' '}
                                {formatMoney(
                                    o.externalLiability.remainingAmountInCents -
                                        review.amountInCents,
                                )}
                                .
                            </p>
                            <p>
                                O valor da despesa, o suporte acumulado e os
                                acertos entre membros permanecem iguais.
                            </p>
                            <Button
                                type="button"
                                disabled={busy || options.isFetching}
                                onClick={() =>
                                    command.submit({
                                        id: commitmentId,
                                        liabilityId,
                                        input: review,
                                    })
                                }
                            >
                                Confirmar pagamento externo
                            </Button>
                            <Button
                                variant="outline"
                                type="button"
                                disabled={busy}
                                onClick={() => setReview(null)}
                            >
                                Editar pagamento
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
                        <p role="status">Registrando pagamento externo…</p>
                    )}
                </form>
            )}
            <Button
                variant="outline"
                type="button"
                disabled={busy}
                onClick={() => {
                    if (!dirty || window.confirm('Sair sem salvar?'))
                        onCancel();
                }}
            >
                Cancelar pagamento
            </Button>
        </section>
    );
}
