'use client';
import { FinancialLoading } from './financial-loading';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { getPersonalExpenseHistory } from '@/lib/api/personal-expense';
import { ApiError } from '@/lib/api/api-error';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { personalExpenseQueryKeys } from '../cache/personal-expense-query-keys';
import { formatDate, formatMoney } from '../utils/expense-money';
import { disbursementMethodLabels } from './personal-expense-summary';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import { ChevronRight } from '@/components/ui/icons';
import styles from './finances-summary.module.css';

export function PersonalExpenseHistoryPage({
    personId,
    spaceId,
    embedded = false,
}: {
    personId: string;
    spaceId: string;
    embedded?: boolean;
}) {
    const context = useSpaceContextInstance(),
        router = useRouter();
    const space = useSpaceContext();
    const canCreate = space.currentSpace?.status === 'ACTIVE';
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
            {!embedded && (
                <div className={styles.heading}>
                    <h1>Finanças</h1>
                    {canCreate && (
                        <Button asChild>
                            <Link href={`/spaces/${spaceId}/expenses/new`}>
                                Adicionar despesa
                            </Link>
                        </Button>
                    )}
                </div>
            )}
            {!embedded && (
                <nav
                    className={styles.actions}
                    aria-label="Despesas e receitas pessoais"
                >
                    {!embedded && (
                        <Link
                            href={`/spaces/${spaceId}/finances/external-liabilities`}
                        >
                            Obrigações externas em meu nome
                        </Link>
                    )}
                    <Link href={`/spaces/${spaceId}/incomes`}>
                        Ver receitas
                    </Link>
                    {canCreate && (
                        <Link href={`/spaces/${spaceId}/incomes/new`}>
                            Adicionar receita
                        </Link>
                    )}
                    {!embedded && (
                        <Link href={`/spaces/${spaceId}`}>
                            Voltar ao espaço
                        </Link>
                    )}
                </nav>
            )}
            <div className={styles.heading}>
                <div className={styles.intro}>
                    <h2>Histórico de despesas</h2>
                    <p>
                        O que você registrou neste espaço, com o valor de cada
                        despesa e seus pagamentos.
                    </p>
                </div>
                <Button
                    variant="outline"
                    type="button"
                    disabled={query.isFetching}
                    onClick={() => {
                        if (selection.cursor === null) void query.refetch();
                        else setSelection({ cursor: null });
                    }}
                >
                    Atualizar / Voltar ao início
                </Button>
            </div>
            {(query.isPending || query.isFetching) && (
                <FinancialLoading label="Carregando despesas…" />
            )}
            {query.isError && (
                <div className={styles.feedback}>
                    <p role="alert">
                        Não foi possível consultar suas despesas.
                    </p>
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => void query.refetch()}
                    >
                        Tentar novamente as despesas
                    </Button>
                </div>
            )}
            {value && (
                <>
                    {value.items.length === 0 ? (
                        <div className={styles.empty}>
                            <h3>Nenhuma despesa por aqui</h3>
                            <p>Nenhuma despesa registrada nesta página.</p>
                            <p>
                                Adicione uma despesa para começar seu histórico.
                            </p>
                        </div>
                    ) : (
                        <ul
                            className={styles.list}
                            aria-label="Despesas pessoais"
                        >
                            {value.items.map((item) => (
                                <li key={item.id}>
                                    <Link
                                        className={styles.recordLink}
                                        aria-label={item.description}
                                        href={`/spaces/${spaceId}/expenses/${item.id}`}
                                    >
                                        <h3>{item.description}</h3>
                                        <span className={styles.recordAmount}>
                                            {formatMoney(item.amountInCents)}
                                        </span>
                                        <ChevronRight
                                            aria-hidden="true"
                                            className={styles.recordAccessory}
                                            size={20}
                                        />
                                    </Link>
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
                        <Button
                            variant="outline"
                            type="button"
                            onClick={() =>
                                setSelection({ cursor: value.nextCursor })
                            }
                        >
                            Próxima página de despesas
                        </Button>
                    )}
                </>
            )}
        </section>
    );
}
