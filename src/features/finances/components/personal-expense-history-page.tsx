'use client';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { getPersonalExpenseHistory } from '@/lib/api/personal-expense';
import { ApiError } from '@/lib/api/api-error';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { personalExpenseQueryKeys } from '../cache/personal-expense-query-keys';
import { formatDate, formatMoney } from '../utils/expense-money';
import { disbursementMethodLabels } from './personal-expense-summary';
import styles from './expenses.module.css';

export function PersonalExpenseHistoryPage({
    personId,
    spaceId,
}: {
    personId: string;
    spaceId: string;
}) {
    const context = useSpaceContextInstance(),
        router = useRouter();
    const [selection, setSelection] = useState<{ cursor: string | null }>({
        cursor: null,
    });
    const current = useRef(selection);
    useLayoutEffect(() => {
        current.current = selection;
    }, [selection]);
    useEffect(
        () => () => {
            current.current = { cursor: null };
        },
        [],
    );
    const query = useExpenseQuery(
        personId,
        spaceId,
        personalExpenseQueryKeys.history(personId, spaceId, selection.cursor),
        true,
        (signal) =>
            getPersonalExpenseHistory(spaceId, selection.cursor, signal),
        () => current.current === selection,
    );
    useEffect(() => {
        if (
            !(query.error instanceof ApiError) ||
            query.error.code !== 'SPACE_NOT_FOUND'
        )
            return;
        let active = true;
        const request = context.accessLost(spaceId),
            generation = context.getSnapshot().generation;
        void request.then((success) => {
            if (
                success &&
                active &&
                context.getSnapshot().generation === generation &&
                window.location.pathname === `/spaces/${spaceId}/finances`
            )
                router.replace(
                    `/spaces/${context.getSnapshot().activeSpaceId}`,
                );
        });
        return () => {
            active = false;
        };
    }, [query.error, context, router, spaceId]);
    const value = !query.isFetching && !query.isError ? query.data : undefined;
    return (
        <section className={styles.stack}>
            <h1>Finanças</h1>
            <h2>Histórico de despesas</h2>
            <nav className={styles.actions} aria-label="Navegação financeira">
                <Link href={`/spaces/${spaceId}/finances/external-liabilities`}>
                    Obrigações externas em meu nome
                </Link>
                <Link href={`/spaces/${spaceId}/expenses/new`}>
                    Adicionar despesa
                </Link>
                <Link href={`/spaces/${spaceId}/incomes`}>Ver receitas</Link>
                <Link href={`/spaces/${spaceId}/incomes/new`}>
                    Adicionar receita
                </Link>
                <Link href={`/spaces/${spaceId}`}>Voltar ao espaço</Link>
            </nav>
            <button
                type="button"
                disabled={query.isFetching}
                onClick={() => {
                    if (selection.cursor === null) void query.refetch();
                    else setSelection({ cursor: null });
                }}
            >
                Atualizar / Voltar ao início
            </button>
            {(query.isPending || query.isFetching) && (
                <p role="status" aria-busy="true">
                    Carregando despesas…
                </p>
            )}
            {query.isError && (
                <div>
                    <p role="alert">
                        Não foi possível consultar suas despesas.
                    </p>
                    <button type="button" onClick={() => void query.refetch()}>
                        Tentar novamente as despesas
                    </button>
                </div>
            )}
            {value && (
                <>
                    {value.items.length === 0 ? (
                        <p>Nenhuma despesa registrada nesta página.</p>
                    ) : (
                        <ul
                            className={styles.stack}
                            aria-label="Despesas pessoais"
                        >
                            {value.items.map((item) => (
                                <li key={item.id}>
                                    <h3>
                                        <Link
                                            href={`/spaces/${spaceId}/expenses/${item.id}`}
                                        >
                                            {item.description}
                                        </Link>
                                    </h3>
                                    {item.status === 'PARTIALLY_PAID' && (
                                        <p>
                                            Parcialmente paga. Falta pagar:{' '}
                                            {formatMoney(
                                                item.remainingAmountInCents,
                                            )}
                                            .
                                        </p>
                                    )}
                                    <p>
                                        Data do fato:{' '}
                                        <time dateTime={item.factDate}>
                                            {formatDate(item.factDate)}
                                        </time>
                                    </p>
                                    <dl>
                                        <dt>Valor da despesa</dt>
                                        <dd>
                                            {formatMoney(item.amountInCents)}
                                        </dd>
                                        <dt>Valor desembolsado</dt>
                                        <dd>
                                            {formatMoney(
                                                item.paidAmountInCents ??
                                                    item.disbursement
                                                        ?.amountInCents ??
                                                    0,
                                            )}
                                        </dd>
                                        {item.externalLiabilities?.length ? (
                                            <>
                                                <dt>No seu cartão</dt>
                                                <dd>
                                                    {formatMoney(
                                                        item.assumedAmountInCents ??
                                                            0,
                                                    )}
                                                </dd>
                                                <dt>
                                                    Obrigação externa aberta
                                                </dt>
                                                <dd>
                                                    {formatMoney(
                                                        item.externalOutstandingAmountInCents ??
                                                            0,
                                                    )}
                                                </dd>
                                                <dt>Restante a realizar</dt>
                                                <dd>
                                                    {formatMoney(
                                                        item.remainingAmountInCents,
                                                    )}
                                                </dd>
                                            </>
                                        ) : null}
                                        {item.disbursement && (
                                            <>
                                                <dt>
                                                    Meio do primeiro pagamento
                                                </dt>
                                                <dd>
                                                    {
                                                        disbursementMethodLabels[
                                                            item.disbursement
                                                                ?.method ??
                                                                'PIX'
                                                        ]
                                                    }
                                                </dd>
                                            </>
                                        )}
                                    </dl>
                                </li>
                            ))}
                        </ul>
                    )}
                    {value.nextCursor && (
                        <button
                            type="button"
                            onClick={() =>
                                setSelection({ cursor: value.nextCursor })
                            }
                        >
                            Próxima página de despesas
                        </button>
                    )}
                </>
            )}
        </section>
    );
}
