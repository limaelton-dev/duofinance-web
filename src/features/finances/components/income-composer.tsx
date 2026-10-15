'use client';
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
import { decimalUnits, exactShares, formatMoney } from '../utils/expense-money';
import styles from './expenses.module.css';

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
        [amount, setAmount] = useState('');
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
                receipt: received ? { factDate: actual } : null,
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
        const calculated = exactShares(cents, split);
        const difference = received
            ? (calculated.find((s) => s.memberId !== actualRecipient)
                  ?.amountInCents ?? 0)
            : 0;
        let settlement: Settlement = { mode: 'NONE' };
        if (received && difference > 0) {
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
                <p>
                    {result.commitment.description}:{' '}
                    {formatMoney(result.commitment.amountInCents)}
                </p>
                <p>
                    {result.status === 'PENDING'
                        ? 'Recebimento pendente.'
                        : 'Recebimento integral registrado.'}
                </p>
                {result.obligation && (
                    <p>
                        Repasse de receita:{' '}
                        {formatMoney(result.obligation.remainingAmountInCents)}.
                    </p>
                )}
                {result.replayed && <p>A tentativa original foi recuperada.</p>}
                <Link
                    href={`/spaces/${spaceId}/incomes/${result.commitment.id}`}
                >
                    Ver receita
                </Link>
                <Link href={`/spaces/${spaceId}/incomes`}>Ver receitas</Link>
            </section>
        );
    const o = options.data;
    return (
        <section className={styles.stack}>
            <h1>Adicionar receita</h1>
            <Link href={`/spaces/${spaceId}/incomes`}>Voltar às receitas</Link>
            {(options.isPending || options.isFetching) && (
                <p role="status">Carregando opções…</p>
            )}
            {options.isError && (
                <div>
                    <p role="alert">
                        Não foi possível carregar as opções da receita.
                    </p>
                    <button
                        type="button"
                        onClick={() => void options.refetch()}
                    >
                        Tentar novamente
                    </button>
                </div>
            )}
            {o && !o.canCreate && (
                <p>Este espaço não permite novos registros agora.</p>
            )}
            {o?.canCreate && (
                <form
                    ref={form}
                    onSubmit={(event) => {
                        event.preventDefault();
                        prepare();
                    }}
                >
                    <label htmlFor="income-description">Descrição</label>
                    <input
                        id="income-description"
                        name="description"
                        value={description}
                        maxLength={160}
                        onChange={(e) => {
                            change();
                            setDescription(e.target.value);
                        }}
                    />
                    <label htmlFor="income-amount">Valor total (R$)</label>
                    <input
                        id="income-amount"
                        name="amountInCents"
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => {
                            change();
                            setAmount(e.target.value);
                        }}
                    />
                    <label htmlFor="income-expected-date">
                        Data prevista para recebimento
                    </label>
                    <input
                        id="income-expected-date"
                        name="expectedReceiptDate"
                        type="date"
                        value={expectedDate || o.referenceDate}
                        onChange={(e) => {
                            change();
                            setExpectedDate(e.target.value);
                        }}
                    />
                    {o.spaceType === 'SHARED' && (
                        <>
                            <h2>Participação econômica</h2>
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
                                <option value="PERCENTAGES">Percentual</option>
                                <option value="AMOUNTS">Valor</option>
                            </select>
                            {(o.members ?? []).map((m, index) => (
                                <label key={m.memberId}>
                                    {m.displayName} (
                                    {splitMode === 'PERCENTAGES' ? '%' : 'R$'})
                                    <input
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
                                                [m.memberId]: e.target.value,
                                            });
                                        }}
                                    />
                                </label>
                            ))}
                            <label htmlFor="income-expected-recipient">
                                Quem deve receber, se previsto
                            </label>
                            <select
                                id="income-expected-recipient"
                                name="expectedRecipientMemberId"
                                value={expectedRecipient}
                                onChange={(e) => {
                                    change();
                                    setExpectedRecipient(e.target.value);
                                }}
                            >
                                <option value="">Ainda não definido</option>
                                {o.members?.map((m) => (
                                    <option key={m.memberId} value={m.memberId}>
                                        {m.displayName}
                                    </option>
                                ))}
                            </select>
                        </>
                    )}
                    <fieldset>
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
                            Sim, integralmente
                        </label>
                    </fieldset>
                    {received && (
                        <>
                            <p>
                                Valor do recebimento integral:{' '}
                                {formatMoney(decimalUnits(amount) ?? 0)}
                            </p>
                            <label htmlFor="income-fact-date">
                                Data do recebimento efetivo
                            </label>
                            <input
                                id="income-fact-date"
                                name="factDate"
                                type="date"
                                max={o.referenceDate}
                                value={factDate || o.referenceDate}
                                onChange={(e) => {
                                    change();
                                    setFactDate(e.target.value);
                                }}
                            />
                            {o.spaceType === 'SHARED' && (
                                <>
                                    <label htmlFor="income-actual-recipient">
                                        Quem recebeu de fato
                                    </label>
                                    <select
                                        id="income-actual-recipient"
                                        name="recipientMemberId"
                                        value={actualRecipient}
                                        onChange={(e) => {
                                            change();
                                            setActualRecipient(e.target.value);
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
                                        {(o.openCycles?.length ?? 0) > 0 && (
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
                                    {settlementMode === 'DATE' && (
                                        <label>
                                            Data-alvo do acerto
                                            <input
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
                                                    setCycleId(e.target.value);
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
                    {validation && <p role="alert">{validation}</p>}
                    {command.error && <p role="alert">{command.error}</p>}
                    <button type="submit" disabled={busy}>
                        Revisar receita
                    </button>
                    {review && (
                        <div role="group" aria-label="Confirmar receita">
                            <h2>Confirme os dados</h2>
                            <p>
                                {review.description}:{' '}
                                {formatMoney(review.amountInCents)}. Previsão:{' '}
                                {review.expectedReceiptDate}.
                            </p>
                            <p>
                                {review.receipt
                                    ? `Recebida integralmente em ${review.receipt.factDate}.`
                                    : 'Recebimento pendente.'}
                            </p>
                            <button
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
                            </button>
                            <button
                                type="button"
                                disabled={busy}
                                onClick={() => setReview(null)}
                            >
                                Editar
                            </button>
                        </div>
                    )}
                    {command.canRetry && (
                        <button type="button" onClick={command.retry}>
                            Reenviar a mesma tentativa
                        </button>
                    )}
                    {command.isPending && (
                        <p role="status">Registrando receita…</p>
                    )}
                </form>
            )}
        </section>
    );
}
