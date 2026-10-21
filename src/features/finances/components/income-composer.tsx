'use client';
import { FinancialLoading } from './financial-loading';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { ApiError } from '@/lib/api/api-error';
import { getIncomeOptions } from '@/lib/api/income';
import { incomeQueryKeys } from '../cache/income-query-keys';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { useExpenseLeaveGuard } from '../hooks/use-expense-leave-guard';
import { useIncomeCommand } from '../hooks/use-income-command';
import type { IncomeInput, IncomeResult } from '../types/income';
import type { Settlement, Split } from '../types/shared-expense';
import {
    decimalUnits,
    exactShares,
    formatDate,
    formatMoney,
} from '../utils/expense-money';
import styles from './financial-records.module.css';

export function IncomeComposer({ spaceId }: { spaceId: string }) {
    const auth = useAuthenticatedContext({ enabled: false });
    const space = useSpaceContext();
    if (
        !auth.data ||
        space.phase !== 'ready' ||
        space.activeSpaceId !== spaceId
    )
        return null;
    return (
        <Composer
            key={`${auth.data.person.id}:${spaceId}:${space.generation}`}
            personId={auth.data.person.id}
            spaceId={spaceId}
        />
    );
}

function Composer({
    personId,
    spaceId,
}: {
    personId: string;
    spaceId: string;
}) {
    const context = useSpaceContextInstance(),
        router = useRouter();
    const options = useExpenseQuery(
        personId,
        spaceId,
        incomeQueryKeys.options(personId, spaceId),
        true,
        (signal) => getIncomeOptions(spaceId, signal),
    );
    const [description, setDescription] = useState(''),
        [amount, setAmount] = useState(''),
        [receivedAmount, setReceivedAmount] = useState<string | null>(null);
    const [expectedDate, setExpectedDate] = useState(''),
        [received, setReceived] = useState(false);
    const [factDate, setFactDate] = useState(''),
        [splitMode, setSplitMode] = useState<'PERCENTAGES' | 'AMOUNTS'>(
            'PERCENTAGES',
        );
    const [shares, setShares] = useState<Record<string, string>>({});
    const [expectedRecipient, setExpectedRecipient] = useState(''),
        [actualRecipient, setActualRecipient] = useState('');
    const [settlementMode, setSettlementMode] =
        useState<Settlement['mode']>('NONE');
    const [targetDate, setTargetDate] = useState(''),
        [cycleId, setCycleId] = useState('');
    const [review, setReview] = useState<IncomeInput | null>(null),
        [result, setResult] = useState<IncomeResult | null>(null);
    const [dirty, setDirty] = useState(false),
        [validation, setValidation] = useState<string | null>(null);
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
        const generation = context.getSnapshot().generation;
        void context.accessLost(spaceId).then((success) => {
            if (
                success &&
                mounted.current &&
                context.getSnapshot().generation === generation &&
                window.location.pathname === `/spaces/${spaceId}/incomes/new`
            )
                router.replace(
                    `/spaces/${context.getSnapshot().activeSpaceId}`,
                );
        });
    }
    const command = useIncomeCommand((value) => {
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
        const o = options.data;
        if (!o || options.isFetching || !o.canCreate || busy) return;
        const cents = decimalUnits(amount);
        if (!description.trim() || description.trim().length > 160)
            return reject(
                'description',
                'Informe uma descrição de 1 a 160 caracteres.',
            );
        if (cents === null || cents <= 0)
            return reject(
                'amountInCents',
                'Informe um valor positivo com até duas casas decimais.',
            );
        const actualAmount =
            receivedAmount === null ? cents : decimalUnits(receivedAmount);
        if (
            received &&
            (actualAmount === null || actualAmount <= 0 || actualAmount > cents)
        )
            return reject(
                'receipt.amountInCents',
                'Informe um recebimento positivo com até duas casas decimais, até o valor total da receita.',
            );
        const forecast = expectedDate || o.referenceDate;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(forecast))
            return reject('expectedReceiptDate', 'Informe a data prevista.');
        const actual = factDate || o.referenceDate;
        if (
            received &&
            (!/^\d{4}-\d{2}-\d{2}$/.test(actual) || actual > o.referenceDate)
        )
            return reject(
                'factDate',
                'Informe uma data de recebimento já ocorrida, até hoje.',
            );
        if (o.spaceType === 'PERSONAL') {
            setReview({
                description: description.trim(),
                amountInCents: cents,
                expectedReceiptDate: forecast,
                receipt: received
                    ? { factDate: actual, amountInCents: actualAmount! }
                    : null,
            });
            return;
        }
        const members = o.members ?? [];
        if (!members.length || o.version === undefined)
            return reject(
                'participationSplit',
                'Atualize as opções do espaço.',
            );
        let split: Split;
        try {
            split =
                splitMode === 'PERCENTAGES'
                    ? {
                          mode: 'PERCENTAGES',
                          shares: members.map((m, index) => ({
                              memberId: m.memberId,
                              basisPoints:
                                  decimalUnits(
                                      shares[m.memberId] ??
                                          (members.length === 1
                                              ? '100'
                                              : index === 0
                                                ? '50'
                                                : '50'),
                                  ) ?? -1,
                          })),
                      }
                    : {
                          mode: 'AMOUNTS',
                          shares: members.map((m) => ({
                              memberId: m.memberId,
                              amountInCents:
                                  decimalUnits(shares[m.memberId] ?? '') ?? -1,
                          })),
                      };
            exactShares(cents, split);
        } catch {
            return reject(
                'participationSplit',
                'A participação precisa fechar exatamente o valor total ou 100%.',
            );
        }
        if (
            expectedRecipient &&
            !members.some((m) => m.memberId === expectedRecipient)
        )
            return reject(
                'expectedRecipientMemberId',
                'Escolha um membro do espaço.',
            );
        if (received && !members.some((m) => m.memberId === actualRecipient))
            return reject('recipientMemberId', 'Escolha quem recebeu o valor.');
        let settlement: Settlement = { mode: 'NONE' };
        if (received) {
            if (settlementMode === 'DATE') {
                if (!targetDate || targetDate < o.referenceDate)
                    return reject(
                        'targetDate',
                        'Escolha uma data-alvo de hoje em diante.',
                    );
                settlement = { mode: 'DATE', targetDate };
            } else if (settlementMode === 'CYCLE') {
                if (!o.openCycles?.some((c) => c.id === cycleId))
                    return reject('cycleId', 'Escolha um acerto aberto.');
                settlement = { mode: 'CYCLE', cycleId };
            } else if (settlementMode === 'SUGGESTED') {
                if (!o.suggestedTargetDate || !o.defaultSettlementRule?.version)
                    return reject(
                        'settlement',
                        'Atualize a sugestão de acerto.',
                    );
                settlement = {
                    mode: 'SUGGESTED',
                    referenceDate: o.referenceDate,
                    expectedRuleVersion: o.defaultSettlementRule.version,
                };
            }
        }
        setReview({
            description: description.trim(),
            amountInCents: cents,
            expectedReceiptDate: forecast,
            expectedSpaceVersion: o.version,
            participationSplit: split,
            expectedRecipientMemberId: expectedRecipient || null,
            receipt: received
                ? {
                      factDate: actual,
                      amountInCents: actualAmount!,
                      recipientMemberId: actualRecipient,
                      settlement,
                  }
                : null,
        });
    }
    if (result)
        return (
            <section className={styles.stack}>
                <h1 ref={heading} tabIndex={-1}>
                    Receita registrada
                </h1>
                <div className={styles.receipt}>
                    <h2>{result.commitment.description}</h2>
                    <p className={styles.amount}>
                        {formatMoney(result.commitment.amountInCents)}
                    </p>
                    <p>
                        {result.status === 'PENDING'
                            ? 'Recebimento pendente.'
                            : result.status === 'PARTIALLY_RECEIVED'
                              ? 'Receita parcialmente recebida.'
                              : 'Recebimento integral registrado.'}
                    </p>
                    <dl>
                        <dt>Recebido</dt>
                        <dd>{formatMoney(result.receivedAmountInCents)}</dd>
                        <dt>Falta receber</dt>
                        <dd>{formatMoney(result.remainingAmountInCents)}</dd>
                    </dl>
                    {result.obligation && (
                        <p>
                            Repasse de receita:{' '}
                            {formatMoney(
                                result.obligation.remainingAmountInCents,
                            )}
                            .
                        </p>
                    )}
                    {result.replayed && (
                        <p>A tentativa original foi recuperada.</p>
                    )}
                </div>
                <div className={styles.actions}>
                    <Button asChild>
                        <Link
                            href={`/spaces/${spaceId}/incomes/${result.commitment.id}`}
                        >
                            Ver receita
                        </Link>
                    </Button>
                    <Button asChild variant="outline">
                        <Link href={`/spaces/${spaceId}/incomes`}>
                            Ver receitas
                        </Link>
                    </Button>
                </div>
            </section>
        );
    const o = options.data;
    return (
        <section className={styles.stack}>
            <header className={styles.heading}>
                <Link
                    className={styles.back}
                    href={`/spaces/${spaceId}/incomes`}
                >
                    Voltar às receitas
                </Link>
                <h1>Adicionar receita</h1>
                <p>
                    Registre a previsão e informe o recebimento quando ele já
                    tiver acontecido.
                </p>
            </header>
            {(options.isPending || options.isFetching) && (
                <FinancialLoading label="Carregando opções…" />
            )}
            {options.isError && (
                <div className={styles.feedback}>
                    <p role="alert">
                        Não foi possível carregar as opções da receita.
                    </p>
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => void options.refetch()}
                    >
                        Tentar novamente
                    </Button>
                </div>
            )}
            {o && !o.canCreate && (
                <p>Este espaço não permite novos registros agora.</p>
            )}
            {o?.canCreate && (
                <form
                    ref={form}
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault();
                        prepare();
                    }}
                >
                    <fieldset disabled={busy || options.isFetching}>
                        <legend>Receita e recebimento</legend>
                        <div className={styles.field}>
                            <label htmlFor="income-description">
                                Descrição
                            </label>
                            <Input
                                id="income-description"
                                name="description"
                                value={description}
                                maxLength={160}
                                onChange={(e) => {
                                    change();
                                    setDescription(e.target.value);
                                }}
                                aria-invalid={
                                    command.fields.includes('description') ||
                                    undefined
                                }
                            />
                        </div>
                        <div className={styles.field}>
                            <label htmlFor="income-amount">
                                Valor total (R$)
                            </label>
                            <Input
                                id="income-amount"
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
                        </div>
                        <div className={styles.field}>
                            <label htmlFor="income-expected-date">
                                Data prevista para recebimento
                            </label>
                            <Input
                                id="income-expected-date"
                                name="expectedReceiptDate"
                                type="date"
                                value={expectedDate || o.referenceDate}
                                onChange={(e) => {
                                    change();
                                    setExpectedDate(e.target.value);
                                }}
                                aria-invalid={
                                    command.fields.includes(
                                        'expectedReceiptDate',
                                    ) || undefined
                                }
                            />
                        </div>
                        {o.spaceType === 'SHARED' && (
                            <>
                                <h2>Participação econômica</h2>
                                <div className={styles.field}>
                                    <label htmlFor="income-split-mode">
                                        Dividir por
                                    </label>
                                    <select
                                        id="income-split-mode"
                                        value={splitMode}
                                        onChange={(e) => {
                                            change();
                                            setSplitMode(
                                                e.target.value as
                                                    'PERCENTAGES' | 'AMOUNTS',
                                            );
                                            setShares({});
                                        }}
                                    >
                                        <option value="PERCENTAGES">
                                            Percentual
                                        </option>
                                        <option value="AMOUNTS">Valor</option>
                                    </select>
                                </div>
                                {(o.members ?? []).map((m, index) => (
                                    <label key={m.memberId}>
                                        {m.displayName} (
                                        {splitMode === 'PERCENTAGES'
                                            ? '%'
                                            : 'R$'}
                                        )
                                        <Input
                                            name="participationSplit"
                                            inputMode="decimal"
                                            value={
                                                shares[m.memberId] ??
                                                (splitMode === 'PERCENTAGES'
                                                    ? o.members?.length === 1
                                                        ? '100'
                                                        : index === 0
                                                          ? '50'
                                                          : '50'
                                                    : '')
                                            }
                                            onChange={(e) => {
                                                change();
                                                setShares({
                                                    ...shares,
                                                    [m.memberId]:
                                                        e.target.value,
                                                });
                                            }}
                                            aria-invalid={
                                                command.fields.includes(
                                                    'participationSplit',
                                                ) || undefined
                                            }
                                        />
                                    </label>
                                ))}
                                <div className={styles.field}>
                                    <label htmlFor="income-expected-recipient">
                                        Quem deve receber, se previsto
                                    </label>
                                    <select
                                        id="income-expected-recipient"
                                        name="expectedRecipientMemberId"
                                        value={expectedRecipient}
                                        onChange={(e) => {
                                            change();
                                            setExpectedRecipient(
                                                e.target.value,
                                            );
                                        }}
                                    >
                                        <option value="">
                                            Ainda não definido
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
                                </div>
                            </>
                        )}
                        <fieldset className={styles.choices}>
                            <legend>Essa receita já foi recebida?</legend>
                            <label>
                                <input
                                    type="radio"
                                    name="received"
                                    checked={!received}
                                    onChange={() => {
                                        change();
                                        setReceived(false);
                                    }}
                                />
                                Ainda não
                            </label>
                            <label>
                                <input
                                    type="radio"
                                    name="received"
                                    checked={received}
                                    onChange={() => {
                                        change();
                                        setReceived(true);
                                    }}
                                />
                                Sim, informar valor
                            </label>
                        </fieldset>
                        {received && (
                            <>
                                <div className={styles.field}>
                                    <label htmlFor="income-received-amount">
                                        Valor recebido agora (R$)
                                    </label>
                                    <Input
                                        id="income-received-amount"
                                        name="receipt.amountInCents"
                                        inputMode="decimal"
                                        value={receivedAmount ?? amount}
                                        onChange={(e) => {
                                            change();
                                            setReceivedAmount(e.target.value);
                                        }}
                                        aria-invalid={
                                            command.fields.includes(
                                                'receipt.amountInCents',
                                            ) || undefined
                                        }
                                    />
                                </div>
                                <div className={styles.field}>
                                    <label htmlFor="income-fact-date">
                                        Data do recebimento efetivo
                                    </label>
                                    <Input
                                        id="income-fact-date"
                                        name="factDate"
                                        type="date"
                                        max={o.referenceDate}
                                        value={factDate || o.referenceDate}
                                        onChange={(e) => {
                                            change();
                                            setFactDate(e.target.value);
                                        }}
                                        aria-invalid={
                                            command.fields.includes(
                                                'factDate',
                                            ) || undefined
                                        }
                                    />
                                </div>
                                {o.spaceType === 'SHARED' && (
                                    <>
                                        <div className={styles.field}>
                                            <label htmlFor="income-actual-recipient">
                                                Quem recebeu de fato
                                            </label>
                                            <select
                                                id="income-actual-recipient"
                                                name="recipientMemberId"
                                                value={actualRecipient}
                                                onChange={(e) => {
                                                    change();
                                                    setActualRecipient(
                                                        e.target.value,
                                                    );
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
                                        </div>
                                        <div className={styles.field}>
                                            <label htmlFor="income-settlement">
                                                Repasse de receita
                                            </label>
                                            <select
                                                id="income-settlement"
                                                name="settlement"
                                                value={settlementMode}
                                                onChange={(e) => {
                                                    change();
                                                    setSettlementMode(
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
                                                {(o.openCycles?.length ?? 0) >
                                                    0 && (
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
                                        </div>
                                        {settlementMode === 'DATE' && (
                                            <label>
                                                Data-alvo do acerto
                                                <Input
                                                    name="targetDate"
                                                    type="date"
                                                    min={o.referenceDate}
                                                    value={targetDate}
                                                    onChange={(e) => {
                                                        change();
                                                        setTargetDate(
                                                            e.target.value,
                                                        );
                                                    }}
                                                    aria-invalid={
                                                        command.fields.includes(
                                                            'targetDate',
                                                        ) || undefined
                                                    }
                                                />
                                            </label>
                                        )}
                                        {settlementMode === 'CYCLE' && (
                                            <label>
                                                Acerto aberto
                                                <select
                                                    name="cycleId"
                                                    value={cycleId}
                                                    onChange={(e) => {
                                                        change();
                                                        setCycleId(
                                                            e.target.value,
                                                        );
                                                    }}
                                                >
                                                    <option value="">
                                                        Escolha
                                                    </option>
                                                    {o.openCycles?.map((c) => (
                                                        <option
                                                            key={c.id}
                                                            value={c.id}
                                                        >
                                                            {c.targetDate}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        )}
                                    </>
                                )}
                            </>
                        )}
                    </fieldset>
                    {validation && <p role="alert">{validation}</p>}
                    {command.error && <p role="alert">{command.error}</p>}
                    <Button type="submit" disabled={busy}>
                        Revisar receita
                    </Button>
                    {review && (
                        <div role="group" aria-label="Confirmar receita">
                            <h2>Confirme os dados</h2>
                            <p>{review.description}</p>
                            <dl>
                                <dt>Valor da receita</dt>
                                <dd>{formatMoney(review.amountInCents)}</dd>
                                <dt>Recebimento previsto</dt>
                                <dd>
                                    {formatDate(review.expectedReceiptDate)}
                                </dd>
                                <dt>Recebido agora</dt>
                                <dd>
                                    {formatMoney(
                                        review.receipt?.amountInCents ?? 0,
                                    )}
                                </dd>
                                <dt>Falta receber</dt>
                                <dd>
                                    {formatMoney(
                                        review.amountInCents -
                                            (review.receipt?.amountInCents ??
                                                0),
                                    )}
                                </dd>
                            </dl>
                            <p>
                                {review.receipt
                                    ? `Recebimento de ${formatMoney(review.receipt.amountInCents!)} em ${formatDate(review.receipt.factDate)}.`
                                    : 'Recebimento pendente.'}
                            </p>
                            <Button
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                    command.submit({
                                        kind: 'CREATE',
                                        input: review,
                                    })
                                }
                            >
                                Confirmar receita
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
                            onClick={command.retry}
                        >
                            Reenviar a mesma tentativa
                        </Button>
                    )}
                    {command.isPending && (
                        <p role="status">Registrando receita…</p>
                    )}
                </form>
            )}
        </section>
    );
}
