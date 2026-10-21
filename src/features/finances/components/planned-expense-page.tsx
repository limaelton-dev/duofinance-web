'use client';
import Link from 'next/link';
import { FinancialRecordLink } from './financial-record-link';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { getIncomeOptions } from '@/lib/api/income';
import {
    createPlannedExpense,
    getPlannedExpenses,
} from '@/lib/api/planned-expense';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { useFinancialCommand } from '../hooks/use-financial-command';
import { useExpenseLeaveGuard } from '../hooks/use-expense-leave-guard';
import type {
    PlannedExpenseInput,
    PlannedExpenseResult,
} from '../types/planned-expense';
import type { Split } from '../types/shared-expense';
import { businessToday, formatDate, formatMoney } from '../utils/expense-money';
import {
    PlanningBoundary,
    PlanningHeading,
    planningKey,
    QueryFeedback,
    CommandFeedback,
    PlanningDistribution,
    buildPlanningSplit,
    positiveAmount,
    planningStatus,
    signedMoney,
} from './planning-shared';
import styles from './expenses.module.css';
import layout from './planning.module.css';

export function PlannedExpensePage({ spaceId }: { spaceId: string }) {
    return (
        <PlanningBoundary spaceId={spaceId}>
            {(personId) => <Planning personId={personId} spaceId={spaceId} />}
        </PlanningBoundary>
    );
}
function Planning({
    personId,
    spaceId,
}: {
    personId: string;
    spaceId: string;
}) {
    const [month, setMonth] = useState(() => businessToday().slice(0, 7)),
        [cursor, setCursor] = useState<string | null>(null);
    const list = useExpenseQuery(
        personId,
        spaceId,
        planningKey(personId, spaceId, 'planned', month, cursor),
        /^\d{4}-(0[1-9]|1[0-2])$/.test(month),
        (signal) => getPlannedExpenses(spaceId, month, cursor, signal),
    );
    return (
        <section className={styles.stack}>
            <PlanningHeading title="Planejar compromissos" spaceId={spaceId}>
                Registre o que está previsto e acompanhe o que ainda falta
                realizar.
            </PlanningHeading>
            <nav className={styles.actions} aria-label="Tipos de planejamento">
                <Button asChild variant="outline">
                    <Link href={`/spaces/${spaceId}/recurring-commitments`}>
                        Recorrências
                    </Link>
                </Button>
                <Button asChild variant="outline">
                    <Link href={`/spaces/${spaceId}/installment-commitments`}>
                        Parcelamentos
                    </Link>
                </Button>
            </nav>
            <PlannedComposer personId={personId} spaceId={spaceId} />
            <section className={layout.section} aria-labelledby="planned-list">
                <h2 id="planned-list">Despesas previstas do mês</h2>
                <label>
                    Mês
                    <Input
                        type="month"
                        required
                        value={month}
                        onChange={(event) => {
                            setMonth(event.target.value);
                            setCursor(null);
                        }}
                    />
                </label>
                <QueryFeedback query={list} />
                {list.data && !list.isError && (
                    <>
                        <dl className={layout.summary}>
                            <div>
                                <dt>Previsão do mês</dt>
                                <dd>
                                    {signedMoney(
                                        list.data.totals
                                            .expectedExpenseAmountInCents,
                                    )}
                                </dd>
                            </div>
                            <div>
                                <dt>Ainda não realizado</dt>
                                <dd>
                                    {signedMoney(
                                        list.data.totals
                                            .remainingExpenseAmountInCents,
                                    )}
                                </dd>
                            </div>
                        </dl>
                        {list.data.items.length ? (
                            <ul className={layout.list}>
                                {list.data.items.map((item) => (
                                    <li key={item.id} className={layout.row}>
                                        <h3>
                                            <FinancialRecordLink
                                                href={`/spaces/${spaceId}/finances/planning/${item.id}`}
                                            >
                                                {item.description}
                                            </FinancialRecordLink>
                                        </h3>
                                        <p>
                                            {formatDate(
                                                item.expectedPaymentDate,
                                            )}{' '}
                                            · {planningStatus[item.status]}
                                            {item.overdue ? ' · Em atraso' : ''}
                                        </p>
                                        <p className={layout.money}>
                                            {formatMoney(
                                                item.remainingAmountInCents,
                                            )}{' '}
                                            a realizar
                                        </p>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p>Nenhuma despesa prevista neste mês.</p>
                        )}
                        <div className={styles.actions}>
                            {cursor && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => setCursor(null)}
                                >
                                    Voltar ao início
                                </Button>
                            )}
                            {list.data.nextCursor && (
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() =>
                                        setCursor(list.data!.nextCursor)
                                    }
                                >
                                    Próxima página
                                </Button>
                            )}
                        </div>
                    </>
                )}
            </section>
        </section>
    );
}
function PlannedComposer({
    personId,
    spaceId,
}: {
    personId: string;
    spaceId: string;
}) {
    const options = useExpenseQuery(
        personId,
        spaceId,
        planningKey(personId, spaceId, 'create-options'),
        true,
        (signal) => getIncomeOptions(spaceId, signal),
    );
    const [description, setDescription] = useState(''),
        [amount, setAmount] = useState(''),
        [date, setDate] = useState('');
    const [mode, setMode] = useState<Split['mode']>('PERCENTAGES'),
        [entries, setEntries] = useState<Record<string, string>>({}),
        [member, setMember] = useState('');
    const [review, setReview] = useState<PlannedExpenseInput | null>(null),
        [result, setResult] = useState<PlannedExpenseResult | null>(null),
        [error, setError] = useState<string | null>(null),
        [dirty, setDirty] = useState(false);
    const form = useRef<HTMLFormElement>(null);
    const command = useFinancialCommand({
        execute: createPlannedExpense,
        onSuccess: (value) => {
            setResult(value);
            setDirty(false);
            setReview(null);
        },
    });
    const busy = command.isPending || command.canRetry;
    useExpenseLeaveGuard(dirty, busy, () => setDirty(false));
    function change() {
        setDirty(true);
        setReview(null);
        setError(null);
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
            const base = {
                description: description.trim(),
                amountInCents: positiveAmount(amount),
                expectedPaymentDate: date,
            };
            if (date < o.referenceDate)
                throw new Error('Escolha uma data prevista de hoje em diante.');
            if (o.spaceType === 'PERSONAL')
                setReview({ ...base, scope: 'PERSONAL' });
            else {
                if (o.version === undefined)
                    throw new Error('Atualize os participantes.');
                setReview({
                    ...base,
                    scope: 'SHARED',
                    expectedSpaceVersion: o.version,
                    expectedPayerMemberId: member || null,
                    responsibilitySplit: buildPlanningSplit(
                        o.members ?? [],
                        mode,
                        entries,
                        base.amountInCents,
                    ),
                });
            }
        } catch (failure) {
            setError((failure as Error).message);
        }
    }
    return (
        <section className={layout.section} aria-labelledby="planned-create">
            <h2 id="planned-create">Nova despesa prevista</h2>
            <p className={styles.help}>
                Cria uma despesa pendente. O pagamento será registrado quando
                acontecer.
            </p>
            <QueryFeedback query={options} />
            {result ? (
                <div className={styles.receipt} role="status">
                    <h3>Despesa prevista registrada</h3>
                    <p>
                        {result.commitment.description} ·{' '}
                        {formatMoney(result.commitment.amountInCents)}
                    </p>
                    <p>Pagamento pendente. Nenhum desembolso foi registrado.</p>
                    {result.replayed && (
                        <p>A tentativa original foi recuperada.</p>
                    )}
                    <Button asChild>
                        <Link
                            href={`/spaces/${spaceId}/finances/planning/${result.commitment.id}`}
                        >
                            Conferir despesa
                        </Link>
                    </Button>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                            setResult(null);
                            setDescription('');
                            setAmount('');
                            setDate('');
                        }}
                    >
                        Planejar outra despesa
                    </Button>
                </div>
            ) : options.data?.canCreate && !options.isError ? (
                <form
                    ref={form}
                    className={styles.fields}
                    onChange={change}
                    onSubmit={(event) => {
                        event.preventDefault();
                        prepare();
                    }}
                >
                    <fieldset disabled={busy || options.isFetching}>
                        <legend>Despesa</legend>
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
                            Valor previsto (R$)
                            <Input
                                name="amountInCents"
                                required
                                inputMode="decimal"
                                value={amount}
                                onChange={(event) =>
                                    setAmount(event.target.value)
                                }
                            />
                        </label>
                        <label>
                            Data prevista para pagamento
                            <Input
                                name="expectedPaymentDate"
                                type="date"
                                required
                                min={options.data.referenceDate}
                                value={date}
                                onChange={(event) =>
                                    setDate(event.target.value)
                                }
                            />
                        </label>
                        {options.data.spaceType === 'SHARED' && (
                            <PlanningDistribution
                                members={options.data.members ?? []}
                                mode={mode}
                                entries={entries}
                                onMode={(value) => {
                                    change();
                                    setMode(value);
                                    setEntries({});
                                }}
                                onEntries={(value) => {
                                    change();
                                    setEntries(value);
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
                    <CommandFeedback command={command} />
                    {!review && (
                        <Button
                            type="submit"
                            disabled={busy || options.isFetching}
                        >
                            Revisar despesa prevista
                        </Button>
                    )}
                    {review && (
                        <div
                            className={styles.summary}
                            aria-label="Confirmar despesa prevista"
                        >
                            <h3>Confira antes de registrar</h3>
                            <p>
                                {review.description} ·{' '}
                                {formatMoney(review.amountInCents)}
                            </p>
                            <p>
                                Prevista para{' '}
                                {formatDate(review.expectedPaymentDate)}.
                                Pagamento pendente.
                            </p>
                            {review.scope === 'SHARED' && (
                                <dl className={layout.summary}>
                                    {buildShares(
                                        review.amountInCents,
                                        review.responsibilitySplit,
                                    ).map((share) => (
                                        <div key={share.memberId}>
                                            <dt>
                                                {
                                                    options.data!.members?.find(
                                                        (m) =>
                                                            m.memberId ===
                                                            share.memberId,
                                                    )?.displayName
                                                }
                                            </dt>
                                            <dd>
                                                {formatMoney(
                                                    share.amountInCents,
                                                )}
                                            </dd>
                                        </div>
                                    ))}
                                </dl>
                            )}
                            <div className={styles.actions}>
                                <Button
                                    type="button"
                                    disabled={busy || options.isFetching}
                                    onClick={() => command.submit(review)}
                                >
                                    Confirmar despesa prevista
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => setReview(null)}
                                >
                                    Editar
                                </Button>
                            </div>
                        </div>
                    )}
                </form>
            ) : options.data && !options.data.canCreate ? (
                <p>Este espaço não permite novos compromissos agora.</p>
            ) : null}
        </section>
    );
}
import { exactShares as buildShares } from '../utils/expense-money';
