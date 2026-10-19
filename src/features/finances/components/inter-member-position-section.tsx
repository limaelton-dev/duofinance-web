'use client';

import { Button } from '@/components/ui/button';
import { FinancialLoading } from './financial-loading';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { ApiError } from '@/lib/api/api-error';
import { getInterMemberPosition } from '@/lib/api/get-inter-member-position';
import { financesQueryKeys } from '../cache/finances-query-keys';
import { useExpenseQuery } from '../hooks/use-expense-query';
import type { PositionDirection } from '../types/inter-member-position';
import { formatPositionMoney } from '../utils/position-money';
import { formatDate, formatMoney } from '../utils/expense-money';
import { financialOriginPath } from '../utils/settlement-return';
import styles from './finances-summary.module.css';
export function InterMemberPositionSection({
    personId,
    spaceId,
}: {
    personId: string;
    spaceId: string;
}) {
    const context = useSpaceContextInstance();
    const router = useRouter();
    const [selection, setSelection] = useState<{
        direction: PositionDirection;
        cursor: string | null;
    }>({ direction: 'ALL', cursor: null });
    const currentSelection = useRef(selection);
    useLayoutEffect(() => {
        currentSelection.current = selection;
    }, [selection]);
    const query = useExpenseQuery(
        personId,
        spaceId,
        financesQueryKeys.position(
            personId,
            spaceId,
            selection.direction,
            selection.cursor,
        ),
        true,
        (signal) =>
            getInterMemberPosition(
                spaceId,
                selection.direction,
                selection.cursor,
                signal,
            ),
        () => currentSelection.current === selection,
    );
    useEffect(
        () => () => {
            currentSelection.current = { direction: 'ALL', cursor: null };
        },
        [],
    );
    useEffect(() => {
        if (
            !(query.error instanceof ApiError) ||
            query.error.code !== 'SPACE_NOT_FOUND'
        )
            return;
        let active = true;
        const request = context.accessLost(spaceId);
        const generation = context.getSnapshot().generation;
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
    }, [context, query.error, router, spaceId]);
    const value = !query.isFetching && !query.isError ? query.data : undefined;
    const empty =
        value?.summary.payableAmountInCents === '0' &&
        value.summary.receivableAmountInCents === '0';
    const memberName = (id: string) =>
        value?.members.find((member) => member.memberId === id)?.displayName ??
        'Membro do espaço';
    function refresh() {
        if (query.isFetching) return;
        if (selection.cursor === null) void query.refetch();
        else setSelection({ direction: selection.direction, cursor: null });
    }
    return (
        <section className={styles.stack}>
            <h2>Entre vocês</h2>
            <Link href={`/spaces/${spaceId}/finances/settlements`}>
                Ver acertos
            </Link>
            <Link href={`/spaces/${spaceId}/finances/settlements/transfers`}>
                Histórico de transferências
            </Link>
            <p>
                Todas as pendências abertas deste espaço, de qualquer data, com
                ou sem acerto associado.
            </p>
            <p>
                A posição líquida é informativa. Consultar este resumo não
                resolve nem compensa pendências.
            </p>
            <div className={styles.filters}>
                <div className={styles.filter}>
                    <label htmlFor="position-direction">
                        Mostrar pendências
                    </label>
                    <select
                        id="position-direction"
                        value={selection.direction}
                        onChange={(event) =>
                            setSelection({
                                direction: event.target
                                    .value as PositionDirection,
                                cursor: null,
                            })
                        }
                    >
                        <option value="ALL">Todas as direções</option>
                        <option value="PAYABLE">A pagar</option>
                        <option value="RECEIVABLE">A receber</option>
                    </select>
                </div>
                <Button
                    variant="outline"
                    type="button"
                    onClick={refresh}
                    aria-disabled={query.isFetching}
                >
                    Atualizar / Voltar ao início
                </Button>
            </div>
            {(query.isPending || query.isFetching) && (
                <FinancialLoading label="Carregando posição entre vocês…" />
            )}
            {query.isError && (
                <div>
                    <p role="alert">
                        {query.error instanceof ApiError &&
                        query.error.code === 'SHARED_SPACE_REQUIRED'
                            ? 'Este espaço não possui resumo entre membros.'
                            : 'Não foi possível consultar a posição entre vocês.'}
                    </p>
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => void query.refetch()}
                    >
                        Tentar novamente a posição
                    </Button>
                </div>
            )}
            {value && (
                <>
                    <dl
                        className={styles.totals}
                        aria-label="Posição entre vocês"
                    >
                        <div>
                            <dt>Pendências a pagar</dt>
                            <dd>
                                {formatPositionMoney(
                                    value.summary.payableAmountInCents,
                                )}
                            </dd>
                        </div>
                        <div>
                            <dt>Pendências a receber</dt>
                            <dd>
                                {formatPositionMoney(
                                    value.summary.receivableAmountInCents,
                                )}
                            </dd>
                        </div>
                        <div>
                            <dt>Posição líquida informativa</dt>
                            <dd>
                                {value.summary.net.direction === 'PAYABLE'
                                    ? 'Você paga '
                                    : value.summary.net.direction ===
                                        'RECEIVABLE'
                                      ? 'Você recebe '
                                      : ''}
                                {formatPositionMoney(
                                    value.summary.net.amountInCents,
                                )}
                            </dd>
                        </div>
                    </dl>
                    {!empty && value.summary.net.direction === 'BALANCED' && (
                        <p>
                            Os valores se equilibram, mas ainda existem
                            pendências abertas.
                        </p>
                    )}
                    {!empty && value.spaceStatus !== 'CLOSED' && (
                        <Link
                            href={`/spaces/${spaceId}/finances/settlements/transfers/new`}
                        >
                            Registrar transferência
                        </Link>
                    )}
                    <p>
                        Os totais consideram todas as pendências abertas,
                        independentemente do filtro e da página.
                    </p>
                    {empty ? (
                        <p>Não há valores a acertar.</p>
                    ) : value.items.length === 0 ? (
                        <p>
                            Nenhuma pendência nesta página para o filtro
                            escolhido.
                        </p>
                    ) : (
                        <ul
                            className={styles.list}
                            aria-label="Pendências abertas"
                        >
                            {value.items.map((item) => (
                                <li key={item.id}>
                                    <h3>{item.origin.description}</h3>
                                    <p>
                                        {item.debtorMemberId ===
                                        value.actorMemberId
                                            ? `Você precisa acertar com ${memberName(item.creditorMemberId)}`
                                            : `${memberName(item.debtorMemberId)} precisa acertar com você`}
                                    </p>
                                    <p>
                                        Em aberto:{' '}
                                        {formatMoney(
                                            item.remainingAmountInCents,
                                        )}
                                    </p>
                                    <p>
                                        Valor original:{' '}
                                        {formatMoney(
                                            item.originalAmountInCents,
                                        )}
                                    </p>
                                    <p>
                                        Valor reconhecido:{' '}
                                        {formatMoney(
                                            item.recognizedAmountInCents ??
                                                item.originalAmountInCents,
                                        )}
                                    </p>
                                    <p>
                                        Data do fato:{' '}
                                        <time dateTime={item.factDate}>
                                            {formatDate(item.factDate)}
                                        </time>
                                    </p>
                                    <p>
                                        Registrada em:{' '}
                                        <time dateTime={item.registeredAt}>
                                            {new Intl.DateTimeFormat('pt-BR', {
                                                timeZone: 'America/Sao_Paulo',
                                                dateStyle: 'short',
                                                timeStyle: 'short',
                                            }).format(
                                                new Date(item.registeredAt),
                                            )}
                                        </time>
                                    </p>
                                    <p>
                                        {item.settlementCycle ? (
                                            <Link
                                                href={`/spaces/${spaceId}/finances/settlements/${item.settlementCycle.id}`}
                                            >
                                                Data-alvo do acerto:{' '}
                                                {formatDate(
                                                    item.settlementCycle
                                                        .targetDate,
                                                )}
                                            </Link>
                                        ) : (
                                            'Sem acerto associado'
                                        )}
                                    </p>
                                    <Link
                                        href={financialOriginPath(
                                            spaceId,
                                            item.origin,
                                        )}
                                        aria-label={`Ver ${item.origin.kind === 'INCOME' ? 'receita' : 'despesa'}: ${item.origin.description}`}
                                    >
                                        Ver{' '}
                                        {item.origin.kind === 'INCOME'
                                            ? 'receita'
                                            : 'despesa'}
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                    {!empty &&
                        (value.page.nextCursor ? (
                            <Button
                                variant="outline"
                                type="button"
                                onClick={() =>
                                    setSelection({
                                        direction: selection.direction,
                                        cursor: value.page.nextCursor,
                                    })
                                }
                            >
                                Próximas pendências
                            </Button>
                        ) : (
                            <p role="status">
                                Fim das pendências para este filtro.
                            </p>
                        ))}
                    <p>
                        Cada página reflete uma consulta atual. Novos registros
                        podem aparecer ao voltar ao início.
                    </p>
                    {value.spaceStatus === 'ACTIVE' && (
                        <>
                            <Link href={`/spaces/${spaceId}/expenses/new`}>
                                Adicionar despesa
                            </Link>
                            <Link href={`/spaces/${spaceId}/incomes/new`}>
                                Adicionar receita
                            </Link>
                        </>
                    )}
                </>
            )}
        </section>
    );
}
