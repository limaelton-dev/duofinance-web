'use client';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
} from '../types/shared-expense';
import { decimalUnits, businessToday } from '../utils/expense-money';
import { ExpenseSummary } from './expense-summary';
import {
    ExpenseSplitFields,
    calculateExpenseSplit,
} from './expense-split-fields';
import { ExpensePaymentFields } from './expense-payment-fields';
import { ExpenseSettlementFields } from './expense-settlement-fields';
import { ExpenseLiveSummary } from './expense-live-summary';
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
        <SharedExpenseComposer
            key={`${auth.data.person.id}:${spaceId}:${space.generation}`}
            personId={auth.data.person.id}
            spaceId={spaceId}
        />
    );
}
function SharedExpenseComposer({
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
    const [method, setMethod] = useState<
        '' | 'PIX' | 'DEBIT' | 'CASH' | 'CREDIT_CARD'
    >('');
    const creditCard = method === 'CREDIT_CARD';
    const supportAmountField = creditCard
        ? 'externalLiability.amountInCents'
        : 'disbursement.amountInCents';
    const [cursor, setCursor] = useState<string | null>(null),
        [pages, setPages] = useState<ExpenseOptions['openCycles']>([]);
    const options = useExpenseQuery(
        personId,
        spaceId,
        [
            'finances',
            personId,
            spaceId,
            'shared-cash-expense-options',
            creditCard,
            cursor,
        ],
        shared,
        (signal) => getExpenseOptions(spaceId, cursor, signal, creditCard),
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
        [settlementMode, setSettlementMode] = useState<
            Settlement['mode'] | null
        >(null),
        [targetDate, setTargetDate] = useState(''),
        [cycleId, setCycleId] = useState(''),
        [dirty, setDirty] = useState(false),
        [fieldError, setFieldError] = useState<{
            field: string;
            message: string;
        } | null>(null),
        [conflict, setConflict] = useState(false),
        [result, setResult] = useState<ExpenseResult | null>(null);
    const mounted = useRef(false),
        form = useRef<HTMLFormElement>(null),
        heading = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    useEffect(() => {
        if (result) heading.current?.focus();
    }, [result]);
    function invalid(field: string) {
        return (
            fieldError?.field === field ||
            command.fields.some(
                (name) => name === field || name.startsWith(field + '.'),
            )
        );
    }
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
    const actualPayer =
            payer || (creditCard ? '' : financial?.actorMemberId) || '',
        expected = planned || null;
    const total = decimalUnits(amount),
        paid = decimalUnits(paidAmount ?? amount);
    const {
        split,
        calculated,
        splitError,
        splitDifference,
        splitDifferenceText,
        residualRecipient,
    } = calculateExpenseSplit(total, members, parts, mode);
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
        setFieldError({ field: name, message });
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
        if (!method) {
            focus(
                'disbursement.method',
                'Escolha como a despesa foi realizada.',
            );
            return;
        }
        if (paid === null || paid <= 0 || paid > total) {
            focus(
                supportAmountField,
                creditCard
                    ? 'Informe um valor assumido positivo com até duas casas decimais, até o valor total da despesa.'
                    : 'Informe um pagamento positivo com até duas casas decimais, até o valor total da despesa.',
            );
            return;
        }
        if (
            !factDate ||
            factDate > (options.data?.referenceDate ?? businessToday())
        ) {
            focus(
                'factDate',
                creditCard
                    ? 'Informe a data da compra já ocorrida, até hoje.'
                    : 'Informe a data do pagamento já ocorrido, até hoje.',
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
        if (creditCard && !members.some((m) => m.memberId === actualPayer)) {
            focus(
                'externalLiability.holderMemberId',
                'Informe de quem é o cartão.',
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
            ...(creditCard
                ? {
                      externalLiability: {
                          holderMemberId: actualPayer,
                          amountInCents: paid,
                      },
                  }
                : {
                      disbursement: {
                          payerMemberId: actualPayer,
                          method: method as 'PIX' | 'DEBIT' | 'CASH',
                          amountInCents: paid,
                      },
                  }),
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
                <div className={styles.success}>
                    <CheckCircle2 aria-hidden="true" size={24} />
                    <h1 ref={heading} tabIndex={-1}>
                        Despesa registrada
                    </h1>
                </div>
                <p>{space.currentSpace?.label}</p>
                <ExpenseSummary
                    value={result}
                    members={members}
                    personId={personId}
                />
                {result.replayed && <p>A tentativa original foi recuperada.</p>}
                <div className={styles.actions}>
                    <Button asChild>
                        <Link
                            href={`/spaces/${spaceId}/expenses/${result.commitment.id}`}
                        >
                            Ver despesa
                        </Link>
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            setResult(null);
                            setDescription('');
                            setAmount('');
                            setPaidAmount(null);
                            setMethod('');
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
                    </Button>
                    <Link href={`/spaces/${spaceId}`}>Voltar</Link>
                </div>
            </section>
        );
    return (
        <section className={styles.stack}>
            <header className={styles.heading}>
                <h1>Adicionar despesa</h1>
                <p className={styles.context}>
                    {space.currentSpace?.label} · Compartilhado
                </p>
                <p className={styles.help}>
                    Registre o que aconteceu e confira como fica a divisão.
                </p>
            </header>
            <div className={styles.columns}>
                <form
                    ref={form}
                    className={styles.form}
                    noValidate
                    onSubmit={(event) => {
                        event.preventDefault();
                        save();
                    }}
                >
                    <div className={styles.fields}>
                        <fieldset disabled={busy}>
                            <legend>O que aconteceu?</legend>
                            <label>
                                Descrição
                                <Input
                                    name="description"
                                    placeholder="Ex.: Mercado"
                                    aria-invalid={invalid('description')}
                                    aria-describedby={
                                        invalid('description')
                                            ? 'expense-error'
                                            : undefined
                                    }
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
                                <Input
                                    name="amountInCents"
                                    placeholder="0,00"
                                    aria-invalid={invalid('amountInCents')}
                                    aria-describedby={
                                        invalid('amountInCents')
                                            ? 'expense-error'
                                            : undefined
                                    }
                                    inputMode="decimal"
                                    value={amount}
                                    onChange={(e) => {
                                        mark();
                                        setAmount(e.target.value);
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
                                    Não foi possível consultar as opções de
                                    acerto. Seus campos foram preservados. Com
                                    participantes confirmados, escolha outra
                                    data ou sem data de acerto.
                                </p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={busy || options.isFetching}
                                    onClick={() => void options.refetch()}
                                >
                                    Tentar novamente as opções
                                </Button>
                            </div>
                        )}
                        {fallback.isError && (
                            <div>
                                <p role="alert">
                                    Não foi possível validar os participantes.
                                    Reconsulte antes de salvar.
                                </p>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={busy || fallback.isFetching}
                                    onClick={() => void fallback.refetch()}
                                >
                                    Tentar novamente os participantes
                                </Button>
                            </div>
                        )}
                        {rule.isError && (
                            <p role="status">
                                Não foi possível consultar a regra padrão. Você
                                pode escolher uma data manual.
                            </p>
                        )}
                        {financial && (
                            <>
                                <ExpenseSplitFields
                                    busy={busy}
                                    members={members}
                                    mode={mode}
                                    parts={parts}
                                    splitError={splitError}
                                    splitDifference={splitDifference}
                                    splitDifferenceText={splitDifferenceText}
                                    invalid={invalid}
                                    mark={mark}
                                    setMode={setMode}
                                    setParts={setParts}
                                />
                                <ExpensePaymentFields
                                    busy={busy}
                                    members={members}
                                    method={method}
                                    actualPayer={actualPayer}
                                    paidAmount={paidAmount}
                                    amount={amount}
                                    factDate={factDate}
                                    referenceDate={options.data?.referenceDate}
                                    planningOpen={planningOpen}
                                    planned={planned}
                                    invalid={invalid}
                                    mark={mark}
                                    setMethod={setMethod}
                                    setPayer={setPayer}
                                    setPaidAmount={setPaidAmount}
                                    setFactDate={setFactDate}
                                    setPlanningOpen={setPlanningOpen}
                                    setPlanned={setPlanned}
                                />
                            </>
                        )}
                        <ExpenseSettlementFields
                            busy={busy}
                            suggested={suggested}
                            optionsFailed={options.isError}
                            referenceDate={options.data?.referenceDate}
                            nextCursor={options.data?.nextCursor}
                            selectedMode={selectedMode}
                            openCycles={openCycles}
                            targetDate={targetDate}
                            cycleId={cycleId}
                            invalid={invalid}
                            mark={mark}
                            setSettlementMode={setSettlementMode}
                            setTargetDate={setTargetDate}
                            setCycleId={setCycleId}
                            loadMore={() => {
                                setPages(openCycles);
                                setCursor(options.data!.nextCursor);
                            }}
                        />
                    </div>
                    <ExpenseLiveSummary
                        description={description}
                        total={total}
                        spaceLabel={space.currentSpace?.label}
                        calculated={calculated}
                        actorMemberId={financial?.actorMemberId}
                        members={members}
                        residualRecipient={residualRecipient}
                        method={method}
                        actualPayer={actualPayer}
                        paid={paid}
                        expected={expected}
                        selectedMode={selectedMode}
                        suggested={suggested}
                        targetDate={targetDate}
                        cycleId={cycleId}
                        openCycles={openCycles}
                    />
                    <div className={styles.confirmation}>
                        {financial?.status !== 'ACTIVE' && financial && (
                            <p role="status">
                                Este espaço está em encerramento ou encerrado.
                                Novas despesas estão indisponíveis.
                            </p>
                        )}
                        {conflict && (
                            <p role="alert">
                                As opções mudaram. Confira os participantes e o
                                acerto antes de confirmar uma nova tentativa.
                            </p>
                        )}
                        {(fieldError || command.error) && (
                            <p id="expense-error" role="alert">
                                {fieldError?.message ?? command.error}
                            </p>
                        )}
                        {command.isPending && (
                            <p role="status">Salvando despesa…</p>
                        )}
                        {command.canRetry && (
                            <p role="status">
                                Ainda não conseguimos confirmar o registro.
                                Recupere esta mesma tentativa antes de sair ou
                                trocar de espaço.
                            </p>
                        )}
                        <div className={styles.actions}>
                            <Button type="submit" disabled={busy || !writable}>
                                {command.isPending
                                    ? 'Salvando despesa…'
                                    : conflict
                                      ? 'Confirmar nova tentativa'
                                      : 'Salvar despesa'}
                            </Button>
                            {command.canRetry && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={command.isPending}
                                    onClick={command.retry}
                                >
                                    Recuperar esta tentativa
                                </Button>
                            )}
                            <Link href={`/spaces/${spaceId}`}>Cancelar</Link>
                        </div>
                    </div>
                </form>
            </div>
        </section>
    );
}
