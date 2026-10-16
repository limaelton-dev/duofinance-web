'use client';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { getOpenExternalLiabilities } from '@/lib/api/external-liability-settlement';
import { ApiError } from '@/lib/api/api-error';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { formatDate, formatMoney } from '../utils/expense-money';
import styles from './expenses.module.css';

export function ExternalLiabilitiesPage({
    spaceId,
    memberId = null,
}: {
    spaceId: string;
    memberId?: string | null;
}) {
    const auth = useAuthenticatedContext({ enabled: false }),
        space = useSpaceContext();
    if (
        !auth.data ||
        space.phase !== 'ready' ||
        space.activeSpaceId !== spaceId
    )
        return null;
    return (
        <List
            key={`${auth.data.person.id}:${spaceId}:${space.generation}:${memberId}`}
            personId={auth.data.person.id}
            spaceId={spaceId}
            memberId={memberId}
        />
    );
}
function List({
    personId,
    spaceId,
    memberId,
}: {
    personId: string;
    spaceId: string;
    memberId: string | null;
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
        [
            'finances',
            personId,
            spaceId,
            'external-liabilities',
            memberId,
            selection.cursor,
        ],
        true,
        (signal) =>
            getOpenExternalLiabilities(
                spaceId,
                selection.cursor,
                signal,
                memberId,
            ),
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
                window.location.pathname ===
                    `/spaces/${spaceId}/finances/external-liabilities`
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
            <h1>
                {memberId === null
                    ? 'Obrigações externas em meu nome'
                    : 'Obrigações externas do membro selecionado'}
            </h1>
            <p>
                Compras no cartão com saldo aberto neste espaço. Selecione uma
                origem para consultar seu histórico. O pagamento continua
                autorizado somente ao titular da obrigação.
            </p>
            <Link href={`/spaces/${spaceId}/finances`}>Voltar às Finanças</Link>
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
                    Carregando obrigações externas…
                </p>
            )}
            {query.isError && (
                <>
                    <p role="alert">
                        Não foi possível consultar suas obrigações externas.
                    </p>
                    <button type="button" onClick={() => void query.refetch()}>
                        Tentar novamente as obrigações
                    </button>
                </>
            )}
            {value && (
                <>
                    {!value.canSettle && (
                        <p>
                            Este espaço não permite registrar pagamentos
                            externos agora.
                        </p>
                    )}
                    {value.items.length === 0 ? (
                        <p>Nenhuma obrigação externa aberta nesta página.</p>
                    ) : (
                        <ul
                            aria-label="Obrigações externas abertas"
                            className={styles.stack}
                        >
                            {value.items.map((item) => (
                                <li key={item.externalLiability.id}>
                                    <h2>{item.description}</h2>
                                    <p>
                                        Compra em{' '}
                                        {formatDate(
                                            item.externalLiability.factDate,
                                        )}
                                        . Valor assumido:{' '}
                                        {formatMoney(
                                            item.externalLiability
                                                .amountInCents,
                                        )}
                                        . Já liquidado:{' '}
                                        {formatMoney(
                                            item.externalLiability
                                                .amountInCents -
                                                item.externalLiability
                                                    .remainingAmountInCents,
                                        )}
                                        . Saldo externo aberto:{' '}
                                        {formatMoney(
                                            item.externalLiability
                                                .remainingAmountInCents,
                                        )}
                                        .
                                    </p>
                                    <Link
                                        href={`/spaces/${spaceId}/expenses/${item.commitmentId}#external-liability-${item.externalLiability.id}`}
                                    >
                                        Ver despesa: {item.description}
                                    </Link>
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
                            Próxima página de obrigações
                        </button>
                    )}
                </>
            )}
        </section>
    );
}
