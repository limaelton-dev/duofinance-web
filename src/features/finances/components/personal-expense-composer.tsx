'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { getPersonalExpenseOptions } from '@/lib/api/personal-expense';
import { ApiError } from '@/lib/api/api-error';
import { personalExpenseQueryKeys } from '../cache/personal-expense-query-keys';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { usePersonalExpenseCommand } from '../hooks/use-personal-expense-command';
import { useExpenseLeaveGuard } from '../hooks/use-expense-leave-guard';
import type { PersonalExpenseResult } from '../types/personal-expense';
import { decimalUnits, formatMoney } from '../utils/expense-money';
import { isPastOrCurrentCivilDate } from '../utils/personal-expense-date';
import {
    disbursementMethodLabels,
    PersonalExpenseSummary,
} from './personal-expense-summary';
import styles from './expenses.module.css';

export function PersonalExpenseComposer({
    personId,
    spaceId,
}: {
    personId: string;
    spaceId: string;
}) {
    const space = useSpaceContext(),
        context = useSpaceContextInstance(),
        router = useRouter();
    const [method, setMethod] = useState<
        'PIX' | 'DEBIT' | 'CASH' | 'CREDIT_CARD'
    >('PIX');
    const creditCard = method === 'CREDIT_CARD';
    const supportAmountField = creditCard
        ? 'externalLiability.amountInCents'
        : 'disbursement.amountInCents';
    const options = useExpenseQuery(
        personId,
        spaceId,
        [...personalExpenseQueryKeys.options(personId, spaceId), creditCard],
        true,
        (signal) => getPersonalExpenseOptions(spaceId, signal, creditCard),
    );
    const [description, setDescription] = useState(''),
        [amount, setAmount] = useState(''),
        [paidAmount, setPaidAmount] = useState<string | null>(null),
        [selectedDate, setDate] = useState<string | null>(null),
        [dirty, setDirty] = useState(false),
        [fieldError, setFieldError] = useState<{
            field: string;
            message: string;
        } | null>(null),
        [result, setResult] = useState<PersonalExpenseResult | null>(null);
    const form = useRef<HTMLFormElement>(null),
        heading = useRef<HTMLHeadingElement>(null),
        mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    function accessLost() {
        const capture = context.capture();
        if (!capture || capture.spaceId !== spaceId) return;
        const request = context.accessLost(spaceId),
            generation = context.getSnapshot().generation;
        void request.then((success) => {
            if (
                success &&
                mounted.current &&
                context.getSnapshot().generation === generation &&
                window.location.pathname === `/spaces/${spaceId}/expenses/new`
            )
                router.replace(
                    `/spaces/${context.getSnapshot().activeSpaceId}`,
                );
        });
    }
    const command = usePersonalExpenseCommand((value) => {
        setResult(value);
        setDirty(false);
    }, accessLost);
    const busy = command.isPending || command.canRetry;
    useExpenseLeaveGuard(dirty, busy, () => setDirty(false));
    useEffect(() => {
        if (
            options.error instanceof ApiError &&
            options.error.code === 'SPACE_NOT_FOUND'
        )
            accessLost();
    });
    useEffect(() => {
        if (command.fields.length)
            form.current
                ?.querySelector<HTMLElement>(`[name="${command.fields[0]}"]`)
                ?.focus();
    }, [command.fields]);
    useEffect(() => {
        if (result) heading.current?.focus();
    }, [result]);
    const factDate = selectedDate ?? options.data?.referenceDate ?? '',
        total = decimalUnits(amount),
        paid = decimalUnits(paidAmount ?? amount);
    function mark() {
        setDirty(true);
        setFieldError(null);
    }
    function reject(field: string, message: string) {
        setFieldError({ field, message });
        form.current?.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
    }
    function save() {
        if (busy || !options.data || options.isError || options.isFetching)
            return;
        if (!description.trim() || description.trim().length > 160)
            return reject(
                'description',
                'Informe uma descrição de 1 a 160 caracteres.',
            );
        if (total === null || total <= 0)
            return reject(
                'amountInCents',
                'Informe um valor positivo com até duas casas decimais.',
            );
        if (paid === null || paid <= 0 || paid > total)
            return reject(
                supportAmountField,
                creditCard
                    ? 'Informe um valor assumido positivo com até duas casas decimais, até o valor total da despesa.'
                    : 'Informe um pagamento positivo com até duas casas decimais, até o valor total da despesa.',
            );
        if (!isPastOrCurrentCivilDate(factDate, options.data.referenceDate))
            return reject(
                'factDate',
                creditCard
                    ? 'Informe uma data válida da compra já ocorrida, até hoje.'
                    : 'Informe uma data válida do pagamento já ocorrido, até hoje.',
            );
        if (
            !creditCard &&
            !options.data.disbursementMethods?.includes(
                method as 'PIX' | 'DEBIT' | 'CASH',
            )
        )
            return reject(
                'disbursement.method',
                'Escolha um meio de desembolso disponível.',
            );
        setFieldError(null);
        command.submit({
            description: description.trim(),
            amountInCents: total,
            factDate,
            ...(creditCard
                ? { externalLiability: { amountInCents: paid } }
                : {
                      disbursement: {
                          method: method as 'PIX' | 'DEBIT' | 'CASH',
                          amountInCents: paid,
                      },
                  }),
        });
    }
    function invalid(field: string) {
        return fieldError?.field === field || command.fields.includes(field);
    }
    if (result)
        return (
            <section className={styles.stack}>
                <h1 ref={heading} tabIndex={-1}>
                    Despesa registrada
                </h1>
                <p>{space.currentSpace?.label}</p>
                <PersonalExpenseSummary value={result} />
                {result.replayed && <p>A tentativa original foi recuperada.</p>}
                <div className={styles.actions}>
                    <Link
                        href={`/spaces/${spaceId}/expenses/${result.commitment.id}`}
                    >
                        Ver despesa
                    </Link>
                    <Link href={`/spaces/${spaceId}/finances`}>
                        Ver histórico de despesas
                    </Link>
                    <button
                        type="button"
                        onClick={() => {
                            setResult(null);
                            setDescription('');
                            setAmount('');
                            setPaidAmount(null);
                            setDate(null);
                            setMethod('PIX');
                            setDirty(false);
                            void options.refetch();
                        }}
                    >
                        Adicionar outra
                    </button>
                    <Link href={`/spaces/${spaceId}`}>Voltar</Link>
                </div>
            </section>
        );
    return (
        <section className={styles.stack}>
            <h1>Adicionar despesa</h1>
            <p>{space.currentSpace?.label} · Pessoal</p>
            {options.isPending || options.isFetching ? (
                <p role="status" aria-busy="true">
                    Carregando opções da despesa…
                </p>
            ) : null}
            {options.isError && (
                <div>
                    <p role="alert">
                        Não foi possível consultar as opções da despesa. Seus
                        campos foram preservados.
                    </p>
                    <button
                        type="button"
                        disabled={busy || options.isFetching}
                        onClick={() => void options.refetch()}
                    >
                        Tentar novamente as opções
                    </button>
                </div>
            )}
            <div className={styles.columns}>
                <form
                    ref={form}
                    className={styles.stack}
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault();
                        save();
                    }}
                >
                    <fieldset
                        disabled={
                            busy ||
                            !options.data ||
                            options.isError ||
                            options.isFetching
                        }
                    >
                        <legend>
                            {creditCard
                                ? 'Despesa realizada no cartão'
                                : 'Despesa já paga'}
                        </legend>
                        <label>
                            Descrição
                            <input
                                name="description"
                                maxLength={160}
                                value={description}
                                aria-invalid={invalid('description')}
                                aria-describedby={
                                    invalid('description')
                                        ? 'personal-expense-error'
                                        : undefined
                                }
                                onChange={(event) => {
                                    mark();
                                    setDescription(event.target.value);
                                }}
                            />
                        </label>
                        <label>
                            Valor (R$)
                            <input
                                name="amountInCents"
                                inputMode="decimal"
                                value={amount}
                                aria-invalid={invalid('amountInCents')}
                                aria-describedby={
                                    invalid('amountInCents')
                                        ? 'personal-expense-error'
                                        : undefined
                                }
                                onChange={(event) => {
                                    mark();
                                    setAmount(event.target.value);
                                }}
                            />
                        </label>
                        <label>
                            {creditCard
                                ? 'Valor assumido no cartão (R$)'
                                : 'Valor pago agora (R$)'}
                            <input
                                name={supportAmountField}
                                inputMode="decimal"
                                value={paidAmount ?? amount}
                                aria-invalid={invalid(supportAmountField)}
                                onChange={(event) => {
                                    mark();
                                    setPaidAmount(event.target.value);
                                }}
                            />
                        </label>
                        <label>
                            {creditCard
                                ? 'Data da compra'
                                : 'Data do pagamento'}
                            <input
                                name="factDate"
                                type="date"
                                value={factDate}
                                max={options.data?.referenceDate}
                                aria-invalid={invalid('factDate')}
                                aria-describedby={
                                    invalid('factDate')
                                        ? 'personal-expense-error'
                                        : undefined
                                }
                                onChange={(event) => {
                                    mark();
                                    setDate(event.target.value);
                                }}
                            />
                        </label>
                        <label>
                            Forma de pagamento
                            <select
                                name="disbursement.method"
                                aria-label="Forma de pagamento"
                                value={method}
                                aria-invalid={invalid('disbursement.method')}
                                aria-describedby={
                                    invalid('disbursement.method')
                                        ? 'personal-expense-error'
                                        : undefined
                                }
                                onChange={(event) => {
                                    mark();
                                    setMethod(
                                        event.target.value as typeof method,
                                    );
                                }}
                            >
                                <option value="CREDIT_CARD">
                                    Cartão de crédito
                                </option>
                                {(
                                    options.data?.disbursementMethods ??
                                    (['PIX', 'DEBIT', 'CASH'] as const)
                                ).map((value) => (
                                    <option key={value} value={value}>
                                        {disbursementMethodLabels[value]}
                                    </option>
                                ))}
                            </select>
                        </label>
                    </fieldset>
                    {(fieldError || command.error) && (
                        <p id="personal-expense-error" role="alert">
                            {fieldError?.message ?? command.error}
                        </p>
                    )}
                    {command.isPending && (
                        <p role="status">Salvando despesa…</p>
                    )}
                    {command.canRetry && (
                        <div>
                            <p>
                                O resultado ainda precisa ser confirmado. A
                                tentativa e os campos foram preservados.
                            </p>
                            <button
                                type="button"
                                disabled={command.isPending}
                                onClick={command.retry}
                            >
                                Tentar novamente o envio
                            </button>
                        </div>
                    )}
                    <button
                        type="submit"
                        disabled={
                            busy ||
                            !options.data ||
                            options.isError ||
                            options.isFetching
                        }
                    >
                        Salvar despesa
                    </button>
                    <Link href={`/spaces/${spaceId}/finances`}>Cancelar</Link>
                </form>
                <aside
                    className={styles.summary}
                    aria-label="Resumo da despesa"
                >
                    <h2>Resumo</h2>
                    <p>{description.trim() || 'Sua despesa'}</p>
                    <dl>
                        <dt>Valor da despesa</dt>
                        <dd>
                            {total !== null && total > 0
                                ? formatMoney(total)
                                : 'Informe o valor'}
                        </dd>
                        <dt>
                            {creditCard
                                ? 'No seu cartão'
                                : 'Valor desembolsado'}
                        </dt>
                        <dd>
                            {paid !== null && paid > 0
                                ? formatMoney(paid)
                                : 'Informe o valor'}
                        </dd>
                        <dt>Forma de pagamento</dt>
                        <dd>
                            {creditCard
                                ? 'Cartão de crédito'
                                : disbursementMethodLabels[
                                      method as 'PIX' | 'DEBIT' | 'CASH'
                                  ]}
                        </dd>
                    </dl>
                    {creditCard &&
                        total !== null &&
                        paid !== null &&
                        paid > 0 &&
                        paid <= total && (
                            <p>
                                Restante a realizar: {formatMoney(total - paid)}
                                .
                            </p>
                        )}
                    <p>
                        {creditCard
                            ? `Cartão do próprio titular. Saiu da conta agora: ${formatMoney(0)}. A obrigação externa permanece aberta.`
                            : 'O valor pago agora será registrado junto com esta despesa.'}
                    </p>
                </aside>
            </div>
        </section>
    );
}
