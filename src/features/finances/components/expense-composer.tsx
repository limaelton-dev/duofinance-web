'use client';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import {
    getExpenseOptions,
    getFinancialContext,
} from '@/lib/api/shared-expense';
import { ApiError } from '@/lib/api/api-error';
import { useDefaultSettlementRule } from '../hooks/use-default-settlement-rule';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { useExpenseCommand } from '../hooks/use-expense-command';
import { useExpenseLeaveGuard } from '../hooks/use-expense-leave-guard';
import type {
    ExpenseInput,
    ExpenseOptions,
    ExpenseResult,
    Settlement,
    Split,
} from '../types/shared-expense';
import {
    decimalUnits,
    exactShares,
    formatMoney,
    formatDate,
    businessToday,
} from '../utils/expense-money';
import { ExpenseSummary } from './expense-summary';
import styles from './expenses.module.css';
import { PersonalExpenseComposer } from './personal-expense-composer';
export function ExpenseComposer({ spaceId }: { spaceId: string }) {
    const auth = useAuthenticatedContext({ enabled: false }),
        space = useSpaceContext();
    if (
        !auth.data ||
        space.phase !== 'ready' ||
        space.activeSpaceId !== spaceId
    )
        return null;
    if (space.currentSpace?.type === 'PERSONAL')
        return (
            <PersonalExpenseComposer
                key={`${auth.data.person.id}:${spaceId}:${space.generation}`}
                personId={auth.data.person.id}
                spaceId={spaceId}
            />
        );
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
    const queryClient = useQueryClient();
    const space = useSpaceContext(),
        context = useSpaceContextInstance(),
        router = useRouter(),
        shared = space.currentSpace?.type === 'SHARED';
    const [cursor, setCursor] = useState<string | null>(null),
        [pages, setPages] = useState<ExpenseOptions['openCycles']>([]);
    const options = useExpenseQuery(
        personId,
        spaceId,
        ['finances', personId, spaceId, 'shared-cash-expense-options', cursor],
        shared,
        (signal) => getExpenseOptions(spaceId, cursor, signal),
    );
    const fallback = useExpenseQuery(
        personId,
        spaceId,
        ['finances', personId, spaceId, 'financial-entry-context'],
        shared,
        (signal) => getFinancialContext(spaceId, signal),
    );
    const rule = useDefaultSettlementRule(personId, spaceId, shared);
    const financial = options.isError
        ? fallback.data
        : (options.data ?? fallback.data);
    const members = financial?.members ?? [];
    const [description, setDescription] = useState(''),
        [amount, setAmount] = useState(''),
        [paidAmount, setPaidAmount] = useState<string | null>(null),
        [factDate, setFactDate] = useState(businessToday),
        [mode, setMode] = useState<'AMOUNTS' | 'PERCENTAGES'>('PERCENTAGES'),
        [parts, setParts] = useState<Record<string, string>>({}),
        [planned, setPlanned] = useState(''),
        [planningOpen, setPlanningOpen] = useState(false),
        [payer, setPayer] = useState(''),
        [method, setMethod] = useState<'PIX' | 'DEBIT' | 'CASH'>('DEBIT'),
        [settlementMode, setSettlementMode] = useState<
            Settlement['mode'] | null
        >(null),
        [targetDate, setTargetDate] = useState(''),
        [cycleId, setCycleId] = useState(''),
        [dirty, setDirty] = useState(false),
        [fieldError, setFieldError] = useState<string | null>(null),
        [conflict, setConflict] = useState(false),
        [result, setResult] = useState<ExpenseResult | null>(null);
    const mounted = useRef(false),
        form = useRef<HTMLFormElement>(null);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    function mark() {
        setDirty(true);
        setResult(null);
        setFieldError(null);
    }
    async function refresh() {
        setPages([]);
        setCursor(null);
        setCycleId('');
        await Promise.all([
            queryClient.resetQueries({
                queryKey: [
                    'finances',
                    personId,
                    spaceId,
                    'shared-cash-expense-options',
                ],
            }),
            fallback.refetch(),
            rule.refetch(),
        ]);
    }
    function accessLost() {
        const original = context.capture();
        if (!original || original.spaceId !== spaceId) return;
        const request = context.accessLost(spaceId),
            generation = context.getSnapshot().generation;
        void request.then((success) => {
            if (
                success &&
                mounted.current &&
                context.getSnapshot().generation === generation
            )
                router.replace(
                    `/spaces/${context.getSnapshot().activeSpaceId}`,
                );
        });
    }
    const command = useExpenseCommand(
        (value) => {
            setResult(value);
            setDirty(false);
            setConflict(false);
        },
        async () => {
            setConflict(true);
            await refresh();
        },
        accessLost,
        (fields) => {
            if (fields[0] === 'expectedPayerMemberId') setPlanningOpen(true);
        },
    );
    const busy = command.isPending || command.canRetry;
    useExpenseLeaveGuard(dirty, busy, () => setDirty(false));
    useEffect(() => {
        const failures = [options.error, fallback.error, rule.error];
        if (
            failures.some(
                (f) => f instanceof ApiError && f.code === 'SPACE_NOT_FOUND',
            )
        )
            accessLost();
    });
    useEffect(() => {
        if (command.fields.length) {
            const field = command.fields[0];
            const shareIndex = /^responsibilitySplit\.shares\.(\d+)/.exec(
                field,
            )?.[1];
            const input =
                form.current?.querySelector<HTMLElement>(`[name="${field}"]`) ??
                (field.startsWith('responsibilitySplit.shares')
                    ? form.current?.querySelector<HTMLElement>(
                          `[data-share-index="${shareIndex ?? 0}"]`,
                      )
                    : null) ??
                form.current?.querySelector<HTMLElement>(
                    '[name="amountInCents"]',
                );
            input?.focus();
        }
    }, [command.fields]);
    const actualPayer = payer || financial?.actorMemberId || '',
        expected = planned || null;
    const total = decimalUnits(amount),
        paid = decimalUnits(paidAmount ?? amount);
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
    const suggested =
        (!options.isError && options.data?.suggestedTargetDate) || null;
    const selectedMode = settlementMode ?? (suggested ? 'SUGGESTED' : 'NONE');
    const openCycles = [...pages, ...(options.data?.openCycles ?? [])].filter(
        (c, i, list) => list.findIndex((x) => x.id === c.id) === i,
    );
    const writable =
        financial?.status === 'ACTIVE' &&
        ((!!options.data && !options.isError) ||
            (!!fallback.data && !fallback.isError));
    function focus(name: string, message: string) {
        setFieldError(message);
        form.current?.querySelector<HTMLElement>(`[name="${name}"]`)?.focus();
    }
    function save() {
        if (busy || !financial || !writable) return;
        if (!description.trim() || description.trim().length > 160) {
            focus(
                'description',
                'Informe uma descrição de 1 a 160 caracteres.',
            );
            return;
        }
        if (total === null || total <= 0) {
            focus(
                'amountInCents',
                'Informe um valor positivo com até duas casas decimais.',
            );
            return;
        }
        if (paid === null || paid <= 0 || paid > total) {
            focus(
                'disbursement.amountInCents',
                'Informe um pagamento positivo com até duas casas decimais, até o valor total da despesa.',
            );
            return;
        }
        if (
            !factDate ||
            factDate > (options.data?.referenceDate ?? businessToday())
        ) {
            focus(
                'factDate',
                'Informe a data do pagamento já ocorrido, até hoje.',
            );
            return;
        }
        if (splitError || !split || !calculated.length) {
            focus(
                'responsibilitySplit.shares',
                splitError ?? 'Confira a divisão.',
            );
            return;
        }
        let settlement: Settlement = { mode: 'NONE' };
        if (selectedMode === 'SUGGESTED') {
            if (!suggested || !options.data || options.isError) {
                focus(
                    'settlement.mode',
                    'Reconsulte a sugestão ou escolha outra data.',
                );
                return;
            }
            settlement = {
                mode: 'SUGGESTED',
                referenceDate: options.data.referenceDate,
                expectedRuleVersion: options.data.defaultSettlementRule.version,
            };
        } else if (selectedMode === 'DATE') {
            if (
                !targetDate ||
                targetDate < (options.data?.referenceDate ?? businessToday())
            ) {
                focus(
                    'settlement.targetDate',
                    'Escolha uma data de acerto a partir de hoje.',
                );
                return;
            }
            settlement = { mode: 'DATE', targetDate };
        } else if (selectedMode === 'CYCLE') {
            if (!cycleId || !openCycles.some((c) => c.id === cycleId)) {
                focus('settlement.cycleId', 'Escolha um acerto aberto.');
                return;
            }
            settlement = { mode: 'CYCLE', cycleId };
        }
        const input: ExpenseInput = {
            expectedSpaceVersion: financial.version,
            description: description.trim(),
            amountInCents: total,
            factDate,
            responsibilitySplit: split,
            expectedPayerMemberId: expected,
            disbursement: {
                payerMemberId: actualPayer,
                method,
                amountInCents: paid,
            },
            settlement,
        };
        setFieldError(null);
        command.submit(input);
    }
    if (!shared)
        return (
            <section>
                <h1>Adicionar despesa</h1>
                <p>
                    O registro de despesa compartilhada se aplica a um espaço
                    compartilhado.
                </p>
                <Link href={`/spaces/${spaceId}`}>Voltar ao espaço</Link>
            </section>
        );
    if (result)
        return (
            <section className={styles.stack}>
                <h1>Despesa registrada</h1>
                <p>{space.currentSpace?.label}</p>
                <ExpenseSummary
                    value={result}
                    members={members}
                    personId={personId}
                />
                <p>Registro: {result.commitment.id}</p>
                {result.replayed && <p>A tentativa original foi recuperada.</p>}
                <div className={styles.actions}>
                    <Link
                        href={`/spaces/${spaceId}/expenses/${result.commitment.id}`}
                    >
                        Ver despesa
                    </Link>
                    <button
                        type="button"
                        onClick={() => {
                            setResult(null);
                            setDescription('');
                            setAmount('');
                            setPaidAmount(null);
                            setParts({});
                            setPlanned('');
                            setPlanningOpen(false);
                            setPayer('');
                            setSettlementMode(null);
                            setTargetDate('');
                            setCycleId('');
                            setDirty(false);
                            void refresh();
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
            <p>{space.currentSpace?.label} · Compartilhado</p>
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
                    <fieldset disabled={busy}>
                        <legend>O que aconteceu?</legend>
                        <label>
                            Descrição
                            <input
                                name="description"
                                maxLength={160}
                                value={description}
                                onChange={(e) => {
                                    mark();
                                    setDescription(e.target.value);
                                }}
                            />
                        </label>
                        <label>
                            Valor (R$)
                            <input
                                name="amountInCents"
                                inputMode="decimal"
                                value={amount}
                                onChange={(e) => {
                                    mark();
                                    setAmount(e.target.value);
                                }}
                            />
                        </label>
                        <label>
                            Valor pago agora (R$)
                            <input
                                name="disbursement.amountInCents"
                                inputMode="decimal"
                                value={paidAmount ?? amount}
                                onChange={(event) => {
                                    mark();
                                    setPaidAmount(event.target.value);
                                }}
                            />
                        </label>
                        <label>
                            Data do pagamento
                            <input
                                name="factDate"
                                type="date"
                                value={factDate}
                                max={
                                    options.data?.referenceDate ??
                                    businessToday()
                                }
                                onChange={(e) => {
                                    mark();
                                    setFactDate(e.target.value);
                                }}
                            />
                        </label>
                    </fieldset>
                    {(options.isPending || fallback.isPending) &&
                        !financial && (
                            <p role="status">
                                Carregando participantes e opções…
                            </p>
                        )}
                    {options.isError && (
                        <div>
                            <p role="alert">
                                Não foi possível consultar as opções de acerto.
                                Seus campos foram preservados. Com participantes
                                confirmados, escolha outra data ou sem data de
                                acerto.
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
                    {fallback.isError && (
                        <div>
                            <p role="alert">
                                Não foi possível validar os participantes.
                                Reconsulte antes de salvar.
                            </p>
                            <button
                                type="button"
                                disabled={busy || fallback.isFetching}
                                onClick={() => void fallback.refetch()}
                            >
                                Tentar novamente os participantes
                            </button>
                        </div>
                    )}
                    {rule.isError && (
                        <p role="status">
                            Não foi possível consultar a regra padrão. Você pode
                            escolher uma data manual.
                        </p>
                    )}
                    {financial && (
                        <>
                            <fieldset disabled={busy}>
                                <legend>Como dividir?</legend>
                                {members.length === 2 && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            mark();
                                            setMode('PERCENTAGES');
                                            setParts(
                                                Object.fromEntries(
                                                    members.map((m) => [
                                                        m.memberId,
                                                        '50',
                                                    ]),
                                                ),
                                            );
                                        }}
                                    >
                                        50 / 50
                                    </button>
                                )}
                                <label>
                                    Divisão
                                    <select
                                        aria-label="Divisão"
                                        name="responsibilitySplit.mode"
                                        value={mode}
                                        onChange={(e) => {
                                            mark();
                                            setMode(
                                                e.target.value as typeof mode,
                                            );
                                            setParts({});
                                        }}
                                    >
                                        <option value="PERCENTAGES">
                                            Percentuais
                                        </option>
                                        <option value="AMOUNTS">Valores</option>
                                    </select>
                                </label>
                                {members.map((m, index) => (
                                    <label key={m.memberId}>
                                        {m.displayName} (
                                        {mode === 'AMOUNTS' ? 'R$' : '%'})
                                        <input
                                            name={
                                                index === 0
                                                    ? 'responsibilitySplit.shares'
                                                    : `responsibilitySplit.shares.${index}`
                                            }
                                            data-share-index={index}
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
                                                    [m.memberId]:
                                                        e.target.value,
                                                });
                                            }}
                                        />
                                    </label>
                                ))}
                                {splitError && <p>{splitError}</p>}
                            </fieldset>
                            <fieldset disabled={busy}>
                                <legend>Como foi pago?</legend>
                                <label>
                                    Quem pagou?
                                    <select
                                        aria-label="Quem pagou?"
                                        name="disbursement.payerMemberId"
                                        value={actualPayer}
                                        onChange={(e) => {
                                            mark();
                                            setPayer(e.target.value);
                                        }}
                                    >
                                        {members.map((m) => (
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
                                    Forma de pagamento
                                    <select
                                        name="disbursement.method"
                                        aria-label="Forma de pagamento"
                                        value={method}
                                        onChange={(e) => {
                                            mark();
                                            setMethod(
                                                e.target.value as typeof method,
                                            );
                                        }}
                                    >
                                        <option value="PIX">PIX</option>
                                        <option value="DEBIT">Débito</option>
                                        <option value="CASH">Dinheiro</option>
                                    </select>
                                </label>
                            </fieldset>
                            <div className={styles.planning}>
                                <button
                                    type="button"
                                    className={styles.planningToggle}
                                    disabled={busy}
                                    aria-expanded={planningOpen}
                                    aria-controls="payment-planning"
                                    onClick={() =>
                                        setPlanningOpen(!planningOpen)
                                    }
                                >
                                    Previsão de pagamento (opcional)
                                </button>
                                <fieldset
                                    id="payment-planning"
                                    hidden={!planningOpen}
                                    disabled={busy}
                                >
                                    <legend>Previsão de pagamento</legend>
                                    <p id="payment-planning-help">
                                        Informe apenas se havia uma pessoa
                                        combinada para pagar. Isso não altera a
                                        divisão nem o acerto.
                                    </p>
                                    <label>
                                        Quem era previsto pagar?
                                        <select
                                            aria-label="Quem era previsto pagar?"
                                            aria-describedby="payment-planning-help"
                                            name="expectedPayerMemberId"
                                            value={planned}
                                            onChange={(e) => {
                                                mark();
                                                setPlanned(e.target.value);
                                            }}
                                        >
                                            <option value="">
                                                Não informado
                                            </option>
                                            {members.map((m) => (
                                                <option
                                                    key={m.memberId}
                                                    value={m.memberId}
                                                >
                                                    {m.displayName}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </fieldset>
                            </div>
                        </>
                    )}
                    <fieldset disabled={busy}>
                        <legend>Quando acertar?</legend>
                        {!suggested && !options.isError && (
                            <p>
                                Acerto padrão não definido. Escolha outra data,
                                um acerto aberto ou sem data de acerto.
                            </p>
                        )}
                        <label>
                            Acerto
                            <select
                                aria-label="Acerto"
                                name="settlement.mode"
                                value={selectedMode}
                                onChange={(e) => {
                                    mark();
                                    setSettlementMode(
                                        e.target.value as Settlement['mode'],
                                    );
                                }}
                            >
                                {suggested && (
                                    <option value="SUGGESTED">
                                        Sugerido: {formatDate(suggested)}
                                    </option>
                                )}
                                <option value="DATE">Outra data</option>
                                {openCycles.length > 0 && !options.isError && (
                                    <option value="CYCLE">
                                        Acerto aberto existente
                                    </option>
                                )}
                                <option value="NONE">Sem data de acerto</option>
                            </select>
                        </label>
                        {selectedMode === 'DATE' && (
                            <label>
                                Data do acerto
                                <input
                                    name="settlement.targetDate"
                                    type="date"
                                    min={
                                        options.data?.referenceDate ??
                                        businessToday()
                                    }
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
                        {options.data?.nextCursor && !options.isError && (
                            <button
                                type="button"
                                onClick={() => {
                                    setPages(openCycles);
                                    setCursor(options.data!.nextCursor);
                                }}
                            >
                                Carregar mais acertos
                            </button>
                        )}
                    </fieldset>
                    {financial?.status !== 'ACTIVE' && financial && (
                        <p role="status">
                            Este espaço está em encerramento ou encerrado. Novas
                            despesas estão indisponíveis.
                        </p>
                    )}
                    {conflict && (
                        <p role="alert">
                            As opções mudaram. Confira os participantes e o
                            acerto antes de confirmar uma nova tentativa.
                        </p>
                    )}
                    {fieldError && <p role="alert">{fieldError}</p>}
                    {command.error && <p role="alert">{command.error}</p>}
                    {command.isPending && (
                        <p role="status">Salvando despesa…</p>
                    )}
                    {command.canRetry && (
                        <p role="status">
                            Resultado incerto. A troca de espaço e a saída ficam
                            bloqueadas até recuperar esta tentativa.
                        </p>
                    )}
                    <div className={styles.actions}>
                        <button type="submit" disabled={busy || !writable}>
                            {conflict
                                ? 'Confirmar nova tentativa'
                                : 'Salvar despesa'}
                        </button>
                        {command.canRetry && (
                            <button
                                type="button"
                                disabled={command.isPending}
                                onClick={command.retry}
                            >
                                Tentar novamente o envio
                            </button>
                        )}
                        <Link href={`/spaces/${spaceId}`}>Cancelar</Link>
                    </div>
                </form>
                <aside className={styles.summary} aria-label="Resumo vivo">
                    <h2>Resumo</h2>
                    <p>
                        {description || 'Sua despesa'} ·{' '}
                        {total !== null
                            ? formatMoney(total)
                            : 'Informe o valor'}
                    </p>
                    {calculated.map((s) => (
                        <p key={s.memberId}>
                            {s.memberId === financial?.actorMemberId
                                ? 'Sua parte'
                                : members.find((m) => m.memberId === s.memberId)
                                      ?.displayName}
                            : {formatMoney(s.amountInCents)}
                        </p>
                    ))}
                    {residualRecipient && (
                        <p>
                            O centavo residual foi atribuído a{' '}
                            {
                                members.find(
                                    (member) =>
                                        member.memberId ===
                                        residualRecipient.memberId,
                                )?.displayName
                            }{' '}
                            e está incluído na parte acima.
                        </p>
                    )}
                    {expected && (
                        <p>
                            Responsável previsto:{' '}
                            {members.find((m) => m.memberId === expected)
                                ?.displayName ?? 'Membro do registro'}
                        </p>
                    )}
                    <p>
                        Pago por:{' '}
                        {members.find((m) => m.memberId === actualPayer)
                            ?.displayName ?? 'Carregando'}
                    </p>
                    <p>
                        Valor pago agora:{' '}
                        {paid !== null ? formatMoney(paid) : 'Confira o valor'}.
                    </p>
                    <p>
                        Falta pagar:{' '}
                        {total !== null &&
                        paid !== null &&
                        paid <= total &&
                        paid > 0
                            ? formatMoney(total - paid)
                            : 'Confira os valores'}
                        .
                    </p>
                    <p>
                        A pendência entre membros considera o suporte acumulado
                        e será apresentada após salvar.
                    </p>
                    <p>
                        Acerto:{' '}
                        {selectedMode === 'SUGGESTED' && suggested
                            ? formatDate(suggested)
                            : selectedMode === 'DATE' && targetDate
                              ? formatDate(targetDate)
                              : selectedMode === 'CYCLE' && cycleId
                                ? formatDate(
                                      openCycles.find((c) => c.id === cycleId)
                                          ?.targetDate ?? '',
                                  )
                                : 'Sem data de acerto'}
                    </p>
                </aside>
            </div>
        </section>
    );
}
