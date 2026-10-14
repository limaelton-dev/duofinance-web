'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import { LogoutButton } from '@/features/auth/components/logout-button';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import { useSpaceDetails } from '@/features/spaces/hooks/use-space-details';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { isSpaceAccessDenied } from '@/features/spaces/state/space-context';
import type { SettlementCycle } from '@/features/finances/types/settlement-cycle';
import { formatPositionMoney } from '@/features/finances/utils/position-money';
import { formatDate } from '@/features/finances/utils/expense-money';
import { useToday } from '../hooks/use-today';
import type { TodaySettlements } from '../types/today';
import styles from './today.module.css';

export function TodayPage() {
    const auth = useAuthenticatedContext({ enabled: false });
    const space = useSpaceContext();
    if (!auth.data || space.phase !== 'ready' || !space.currentSpace)
        return null;
    return (
        <TodayRead
            key={`${auth.data.person.id}:${space.activeSpaceId}:${space.generation}`}
            personId={auth.data.person.id}
            displayName={auth.data.person.displayName}
            spaceId={space.currentSpace.id}
        />
    );
}

function CycleCard({
    cycle,
    settlements,
    spaceId,
}: {
    cycle: SettlementCycle;
    settlements: TodaySettlements;
    spaceId: string;
}) {
    const other = settlements.members.find(
        (member) => member.memberId !== settlements.actorMemberId,
    );
    return (
        <article className={styles.card}>
            <h3>
                Acerto de{' '}
                <time dateTime={cycle.targetDate}>
                    {formatDate(cycle.targetDate)}
                </time>
            </h3>
            <p>Em aberto{cycle.isOverdue ? ' · Vencido' : ''}</p>
            <p>
                {cycle.obligationCount}{' '}
                {cycle.obligationCount === 1 ? 'pendência' : 'pendências'} na
                composição · {cycle.openObligationCount} com valor em aberto
            </p>
            <dl className={styles.totals} aria-label="Resumo do acerto">
                <div>
                    <dt>Valor original bruto</dt>
                    <dd>
                        {formatPositionMoney(
                            cycle.totals.originalAmountInCents,
                        )}
                    </dd>
                </div>
                <div>
                    <dt>Valor resolvido</dt>
                    <dd>
                        {formatPositionMoney(
                            cycle.totals.resolvedAmountInCents,
                        )}
                    </dd>
                </div>
                <div>
                    <dt>Dinheiro transferido</dt>
                    <dd>
                        {formatPositionMoney(
                            cycle.totals.transferredAmountInCents,
                        )}
                    </dd>
                </div>
                <div>
                    <dt>Falta acertar</dt>
                    <dd>
                        {formatPositionMoney(
                            cycle.totals.remainingAmountInCents,
                        )}
                    </dd>
                </div>
                <div>
                    <dt>A pagar</dt>
                    <dd>
                        {formatPositionMoney(
                            cycle.position.payableAmountInCents,
                        )}
                    </dd>
                </div>
                <div>
                    <dt>A receber</dt>
                    <dd>
                        {formatPositionMoney(
                            cycle.position.receivableAmountInCents,
                        )}
                    </dd>
                </div>
                <div>
                    <dt>Posição líquida informativa</dt>
                    <dd>
                        {cycle.position.net.direction === 'PAYABLE'
                            ? `Você paga${other ? ` para ${other.displayName}` : ''}: `
                            : cycle.position.net.direction === 'RECEIVABLE'
                              ? `${other ? `${other.displayName} paga` : 'Pagamento'} para você: `
                              : ''}
                        {formatPositionMoney(cycle.position.net.amountInCents)}
                    </dd>
                </div>
            </dl>
            {cycle.totals.remainingAmountInCents === '0' ? (
                <p>Sem valor em aberto. Este ciclo continua em aberto.</p>
            ) : cycle.position.net.direction === 'BALANCED' ? (
                <p>
                    Os valores se equilibram, mas ainda existem pendências
                    abertas.
                </p>
            ) : null}
            <Link href={`/spaces/${spaceId}/finances/settlements/${cycle.id}`}>
                Ver acerto
            </Link>
        </article>
    );
}

function TodayRead({
    personId,
    displayName,
    spaceId,
}: {
    personId: string;
    displayName: string;
    spaceId: string;
}) {
    const space = useSpaceContext();
    const selection = useSpaceContextInstance();
    const today = useToday(personId, spaceId);
    const details = useSpaceDetails(personId, spaceId);
    useEffect(() => {
        if (
            isSpaceAccessDenied(today.error) ||
            isSpaceAccessDenied(details.error)
        )
            void selection.accessLost(spaceId);
    }, [today.error, details.error, selection, spaceId]);
    const shared = space.currentSpace?.type === 'SHARED';
    const data = today.data;
    const status =
        !today.isError && data ? data.spaceStatus : space.currentSpace?.status;
    const unavailable =
        !today.isError && data?.finance.status === 'UNAVAILABLE';
    const finance =
        !today.isError && data?.finance.status === 'AVAILABLE'
            ? data.finance.data
            : null;
    const settlements = shared ? finance?.settlements : null;
    const confirmed =
        !details.isError && details.data?.space.id === spaceId
            ? details.data
            : null;
    const canAddExpense =
        confirmed?.space.type === 'SHARED' &&
        confirmed.space.status === 'ACTIVE' &&
        status === 'ACTIVE' &&
        confirmed.activeMemberCount === 2;
    return (
        <section className={styles.page} aria-labelledby="today-title">
            <header>
                <p className={styles.spaceLabel}>{space.currentSpace?.label}</p>
                <h1 id="today-title">Hoje</h1>
                <h2>Olá, {displayName}.</h2>
                <p>
                    {!shared
                        ? 'Seu espaço pessoal está pronto.'
                        : `Seu espaço compartilhado está ${status === 'ACTIVE' ? 'ativo' : status === 'CLOSING' ? 'em encerramento' : 'encerrado'}.`}
                </p>
                {confirmed?.space.type === 'SHARED' && (
                    <p>
                        {confirmed.activeMemberCount === 1
                            ? 'Uma pessoa participa deste espaço.'
                            : 'Duas pessoas participam deste espaço.'}
                    </p>
                )}
                {data && !today.isError && (
                    <p>
                        Referência:{' '}
                        <time dateTime={data.referenceDate}>
                            {formatDate(data.referenceDate)}
                        </time>
                    </p>
                )}
            </header>
            <nav className={styles.actions} aria-label="Ações do espaço">
                {shared && (
                    <Link href={`/spaces/${spaceId}/finances`}>Finanças</Link>
                )}
                {canAddExpense && (
                    <Link href={`/spaces/${spaceId}/expenses/new`}>
                        Adicionar despesa
                    </Link>
                )}
                {!shared && (
                    <Link href="/spaces/new">Criar espaço compartilhado</Link>
                )}
                <Link href="/spaces">Ver espaços</Link>
            </nav>
            {confirmed?.space.type === 'SHARED' &&
                confirmed.space.status === 'ACTIVE' &&
                status === 'ACTIVE' &&
                confirmed.activeMemberCount === 1 && (
                    <aside className={styles.card}>
                        <p>Aguardando outra pessoa entrar no espaço.</p>
                        <Link href={`/spaces/${spaceId}`}>
                            Ver espaço e convite
                        </Link>
                    </aside>
                )}
            {details.isError && !isSpaceAccessDenied(details.error) && (
                <aside>
                    <p role="alert">
                        Não foi possível consultar o espaço. Tente novamente.
                    </p>
                    <button
                        type="button"
                        onClick={() => void details.refetch()}
                    >
                        Tentar novamente o espaço
                    </button>
                </aside>
            )}
            {today.isPending ? (
                <div
                    role="status"
                    aria-label="Carregando Hoje"
                    className={styles.skeleton}
                >
                    <p>Carregando Hoje…</p>
                    <div />
                    <div />
                </div>
            ) : today.isError || unavailable ? (
                <section
                    className={styles.card}
                    aria-label="Finanças indisponíveis"
                >
                    <p role="alert">
                        {unavailable && data?.finance.status === 'UNAVAILABLE'
                            ? data.finance.error.message
                            : 'Não foi possível carregar as finanças. Tente novamente.'}
                    </p>
                    <button
                        type="button"
                        onClick={() => void today.refetch()}
                        disabled={today.isFetching}
                    >
                        Tentar novamente
                    </button>
                </section>
            ) : finance ? (
                <>
                    {settlements &&
                        settlements.overdueCycles.totalCount > 0 && (
                            <section aria-labelledby="attention-title">
                                <h2 id="attention-title">Precisa de atenção</h2>
                                <p>
                                    {settlements.overdueCycles.totalCount}{' '}
                                    {settlements.overdueCycles.totalCount === 1
                                        ? 'acerto vencido'
                                        : 'acertos vencidos'}{' '}
                                    com valor em aberto
                                </p>
                                <ul
                                    className={styles.list}
                                    aria-label="Acertos vencidos"
                                >
                                    {settlements.overdueCycles.items.map(
                                        (cycle) => (
                                            <li key={cycle.id}>
                                                <CycleCard
                                                    cycle={cycle}
                                                    settlements={settlements}
                                                    spaceId={spaceId}
                                                />
                                            </li>
                                        ),
                                    )}
                                </ul>
                                {settlements.overdueCycles.totalCount >
                                    settlements.overdueCycles.items.length && (
                                    <p>
                                        <Link
                                            href={`/spaces/${spaceId}/finances/settlements`}
                                        >
                                            Ver todos os acertos
                                        </Link>
                                    </p>
                                )}
                            </section>
                        )}
                    {settlements && (
                        <section aria-labelledby="next-settlement-title">
                            <h2 id="next-settlement-title">Próximo acerto</h2>
                            {settlements.nextCycle ? (
                                <CycleCard
                                    cycle={settlements.nextCycle}
                                    settlements={settlements}
                                    spaceId={spaceId}
                                />
                            ) : (
                                <p>Nenhum acerto para hoje ou datas futuras.</p>
                            )}
                        </section>
                    )}
                    <section aria-labelledby="upcoming-commitments-title">
                        <h2 id="upcoming-commitments-title">
                            Próximos compromissos
                        </h2>
                        <p>Nenhum compromisso próximo para exibir.</p>
                        {shared && (
                            <Link href={`/spaces/${spaceId}/finances`}>
                                Ver finanças
                            </Link>
                        )}
                    </section>
                </>
            ) : null}
            <LogoutButton />
        </section>
    );
}
