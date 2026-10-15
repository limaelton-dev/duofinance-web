'use client';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { ApiError } from '@/lib/api/api-error';
import { getIncomeHistory } from '@/lib/api/income';
import { incomeQueryKeys } from '../cache/income-query-keys';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { formatDate, formatMoney } from '../utils/expense-money';
import styles from './expenses.module.css';

export function IncomeHistoryPage({ spaceId }: { spaceId: string }) {
    const auth = useAuthenticatedContext({ enabled: false }),
        space = useSpaceContext();
    if (
        !auth.data ||
        space.phase !== 'ready' ||
        space.activeSpaceId !== spaceId
    )
        return null;
    return (
        <History
            key={`${auth.data.person.id}:${spaceId}:${space.generation}`}
            personId={auth.data.person.id}
            spaceId={spaceId}
        />
    );
}

function History({ personId, spaceId }: { personId: string; spaceId: string }) {
    const context = useSpaceContextInstance(),
        router = useRouter();
    const [selection, setSelection] = useState<{
        status: 'ALL' | 'PENDING' | 'RECEIVED';
        cursor: string | null;
    }>({ status: 'ALL', cursor: null });
    const current = useRef(selection);
    useLayoutEffect(() => {
        current.current = selection;
    }, [selection]);
    useEffect(
        () => () => {
            current.current = { status: 'ALL', cursor: null };
        },
        [],
    );
    const query = useExpenseQuery(
        personId,
        spaceId,
        incomeQueryKeys.history(
            personId,
            spaceId,
            selection.status,
            selection.cursor,
        ),
        true,
        (signal) =>
            getIncomeHistory(
                spaceId,
                selection.status,
                selection.cursor,
                signal,
            ),
        () => current.current === selection,
    );
    useEffect(() => {
        if (
            !(query.error instanceof ApiError) ||
            query.error.code !== 'SPACE_NOT_FOUND'
        )
            return;
        const generation = context.getSnapshot().generation;
        let active = true;
        void context.accessLost(spaceId).then((success) => {
            if (
                success &&
                active &&
                context.getSnapshot().generation === generation &&
                window.location.pathname === `/spaces/${spaceId}/incomes`
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
            <h1>Receitas</h1>
            <nav className={styles.actions} aria-label="Navegação financeira">
                <Link href={`/spaces/${spaceId}/incomes/new`}>
                    Adicionar receita
                </Link>
                <Link href={`/spaces/${spaceId}/finances`}>Finanças</Link>
                <Link href={`/spaces/${spaceId}`}>Voltar ao espaço</Link>
            </nav>
            <label htmlFor="income-status">Mostrar receitas</label>
            <select
                id="income-status"
                value={selection.status}
                onChange={(e) =>
                    setSelection({
                        status: e.target.value as typeof selection.status,
                        cursor: null,
                    })
                }
            >
                <option value="ALL">Todas</option>
                <option value="PENDING">Pendentes</option>
                <option value="RECEIVED">Recebidas</option>
            </select>
            <button
                type="button"
                disabled={query.isFetching}
                onClick={() =>
                    selection.cursor
                        ? setSelection({ ...selection, cursor: null })
                        : void query.refetch()
                }
            >
                Atualizar / Voltar ao início
            </button>
            {(query.isPending || query.isFetching) && (
                <p role="status">Carregando receitas…</p>
            )}
            {query.isError && (
                <div>
                    <p role="alert">Não foi possível consultar as receitas.</p>
                    <button type="button" onClick={() => void query.refetch()}>
                        Tentar novamente
                    </button>
                </div>
            )}
            {value && (
                <>
                    {value.items.length === 0 ? (
                        <p>Nenhuma receita neste filtro.</p>
                    ) : (
                        <ul className={styles.list}>
                            {value.items.map((item) => (
                                <li key={item.id}>
                                    <h2>{item.description}</h2>
                                    <p>
                                        Previsto:{' '}
                                        {formatMoney(item.amountInCents)} em{' '}
                                        <time
                                            dateTime={item.expectedReceiptDate}
                                        >
                                            {formatDate(
                                                item.expectedReceiptDate,
                                            )}
                                        </time>
                                        .
                                    </p>
                                    <p>
                                        {item.status === 'PENDING'
                                            ? 'Recebimento pendente'
                                            : `Recebido: ${formatMoney(item.receivedAmountInCents)}`}
                                    </p>
                                    <Link
                                        href={`/spaces/${spaceId}/incomes/${item.id}`}
                                    >
                                        Ver receita
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                    {value.nextCursor && (
                        <button
                            type="button"
                            onClick={() =>
                                setSelection({
                                    ...selection,
                                    cursor: value.nextCursor,
                                })
                            }
                        >
                            Próximas receitas
                        </button>
                    )}
                </>
            )}
        </section>
    );
}
