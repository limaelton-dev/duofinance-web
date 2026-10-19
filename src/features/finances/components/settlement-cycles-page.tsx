'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { ApiError } from '@/lib/api/api-error';
import {
    getSettlementCycle,
    getSettlementCycles,
} from '@/lib/api/settlement-cycles';
import { financesQueryKeys } from '../cache/finances-query-keys';
import { useExpenseQuery } from '../hooks/use-expense-query';
import type { PositionDirection } from '../types/inter-member-position';
import type {
    SettlementCycle,
    SettlementView,
} from '../types/settlement-cycle';
import { formatPositionMoney } from '../utils/position-money';
import { formatDate, formatMoney } from '../utils/expense-money';
import { financialOriginPath } from '../utils/settlement-return';
import { hasFinancialOriginPage } from '../types/settlement-origin';
import styles from './finances-summary.module.css';
import formStyles from './settlement-depth.module.css';
import { SettlementCycleFinalization } from './settlement-cycle-finalization';

export function SettlementCyclesPage({
    spaceId,
    cycleId,
}: {
    spaceId: string;
    cycleId?: string;
}) {
    const auth = useAuthenticatedContext({ enabled: false }),
        space = useSpaceContext();
    if (
        !auth.data ||
        space.phase !== 'ready' ||
        space.activeSpaceId !== spaceId
    )
        return null;
    if (space.currentSpace?.type !== 'SHARED')
        return (
            <section>
                <h1>Acertos</h1>
                <p>Acertos se aplicam somente a espaços compartilhados.</p>
                <Link href={`/spaces/${spaceId}`}>Voltar ao espaço</Link>
            </section>
        );
    return (
        <SettlementRead
            key={`${auth.data.person.id}:${spaceId}:${space.generation}:${cycleId ?? 'list'}`}
            personId={auth.data.person.id}
            spaceId={spaceId}
            cycleId={cycleId}
        />
    );
}

function CycleTotals({ cycle }: { cycle: SettlementCycle }) {
    return (
        <>
            <p>
                {cycle.status === 'OPEN' ? 'Em aberto' : 'Finalizado'}
                {cycle.isOverdue ? ' · Vencido' : ''}
            </p>
            <p>
                {cycle.obligationCount} pendências na composição ·{' '}
                {cycle.openObligationCount} com valor em aberto
            </p>
            <dl className={styles.totals} aria-label="Totais do ciclo">
                <div>
                    <dt>Valor original bruto</dt>
                    <dd>
                        {formatPositionMoney(
                            cycle.totals.originalAmountInCents,
                        )}
                    </dd>
                </div>
                <div>
                    <dt>Valor reconhecido</dt>
                    <dd>
                        {formatPositionMoney(
                            cycle.totals.recognizedAmountInCents ??
                                cycle.totals.originalAmountInCents,
                        )}
                    </dd>
                    <dt>Valor reconhecido já acertado</dt>
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
                    <dt>Valor em aberto bruto</dt>
                    <dd>
                        {formatPositionMoney(
                            cycle.totals.remainingAmountInCents,
                        )}
                    </dd>
                </div>
                <div>
                    <dt>Compensado</dt>
                    <dd>
                        {formatPositionMoney(
                            cycle.totals.compensatedAmountInCents ?? '0',
                        )}
                    </dd>
                    <dt>Dispensado</dt>
                    <dd>
                        {formatPositionMoney(
                            cycle.totals.waivedAmountInCents ?? '0',
                        )}
                    </dd>
                    <dt>Bruto a pagar</dt>
                    <dd>
                        {formatPositionMoney(
                            cycle.position.payableAmountInCents,
                        )}
                    </dd>
                </div>
                <div>
                    <dt>Bruto a receber</dt>
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
                            ? 'Você paga '
                            : cycle.position.net.direction === 'RECEIVABLE'
                              ? 'Você recebe '
                              : ''}
                        {formatPositionMoney(cycle.position.net.amountInCents)}
                    </dd>
                </div>
            </dl>
            {cycle.totals.remainingAmountInCents === '0' &&
                cycle.status === 'OPEN' && (
                    <p>Sem valor em aberto. Este ciclo continua em aberto.</p>
                )}
            {cycle.totals.remainingAmountInCents !== '0' &&
                cycle.position.net.direction === 'BALANCED' && (
                    <p>
                        Os valores se equilibram, mas ainda existem pendências
                        abertas.
                    </p>
                )}
        </>
    );
}

function SettlementRead({
    personId,
    spaceId,
    cycleId,
}: {
    personId: string;
    spaceId: string;
    cycleId?: string;
}) {
    const context = useSpaceContextInstance(),
        router = useRouter();
    const [selection, setSelection] = useState<{
        view: SettlementView;
        direction: PositionDirection;
        cursor: string | null;
    }>({ view: 'OPEN', direction: 'ALL', cursor: null });
    const [selectedCycles, setSelectedCycles] = useState<string[]>([]);
    const current = useRef<typeof selection | null>(selection);
    useLayoutEffect(() => {
        current.current = selection;
        return () => {
            current.current = null;
        };
    }, [selection]);
    const list = useExpenseQuery(
        personId,
        spaceId,
        financesQueryKeys.cycles(
            personId,
            spaceId,
            selection.view,
            selection.cursor,
        ),
        !cycleId,
        (signal) =>
            getSettlementCycles(
                spaceId,
                selection.view,
                selection.cursor,
                signal,
            ),
        () => current.current === selection,
    );
    const detail = useExpenseQuery(
        personId,
        spaceId,
        financesQueryKeys.cycle(
            personId,
            spaceId,
            cycleId ?? '',
            selection.direction,
            selection.cursor,
        ),
        !!cycleId,
        (signal) =>
            getSettlementCycle(
                spaceId,
                cycleId!,
                selection.direction,
                selection.cursor,
                signal,
            ),
        () => current.current === selection,
    );
    const query = cycleId ? detail : list;
    const pathname = `/spaces/${spaceId}/finances/settlements${cycleId ? `/${cycleId}` : ''}`;
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
                window.location.pathname === pathname
            )
                router.replace(
                    `/spaces/${context.getSnapshot().activeSpaceId}`,
                );
        });
        return () => {
            active = false;
        };
    }, [query.error, context, router, spaceId, pathname]);
    const listValue =
        !cycleId && !list.isFetching && !list.isError ? list.data : undefined;
    const detailValue = cycleId && !detail.isError ? detail.data : undefined;
    const value = detailValue ?? listValue;
    function select(value: typeof selection) {
        current.current = value;
        setSelection(value);
    }
    function refresh() {
        if (query.isFetching) return;
        if (selection.cursor) select({ ...selection, cursor: null });
        else void query.refetch();
    }
    const cursorError =
        query.error instanceof ApiError &&
        query.error.code === 'VALIDATION_ERROR' &&
        !!selection.cursor;
    const memberName = (id: string) =>
        value?.members.find((member) => member.memberId === id)?.displayName ??
        'Membro do espaço';
    return (
        <section className={styles.stack}>
            <h1>{cycleId ? 'Detalhe do acerto' : 'Acertos'}</h1>
            <nav aria-label="Navegação financeira" className={styles.actions}>
                <Link href={`/spaces/${spaceId}/finances`}>Resumo</Link>
                <Link
                    href={`/spaces/${spaceId}/finances/settlements/transfers${cycleId ? `?cycleId=${cycleId}` : ''}`}
                >
                    Histórico de transferências
                </Link>
                {cycleId ? (
                    <Link href={`/spaces/${spaceId}/finances/settlements`}>
                        Voltar aos Acertos
                    </Link>
                ) : (
                    <span aria-current="page">Acertos</span>
                )}
                <Link href={`/spaces/${spaceId}`}>Voltar ao espaço</Link>
                <Link
                    href={`/spaces/${spaceId}/finances/settlements/offsets${cycleId ? `?cycleId=${cycleId}` : ''}`}
                >
                    Compensações
                </Link>
            </nav>
            <p>
                A posição líquida é informativa. Consultar este acerto não
                resolve nem compensa pendências. O valor resolvido não
                identifica dinheiro transferido.
            </p>
            <div className={styles.actions}>
                {cycleId ? (
                    <>
                        <label htmlFor="cycle-direction">
                            Mostrar composição
                        </label>
                        <select
                            id="cycle-direction"
                            value={selection.direction}
                            onChange={(event) =>
                                select({
                                    ...selection,
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
                    </>
                ) : (
                    <>
                        <label htmlFor="cycles-view">Mostrar acertos</label>
                        <select
                            id="cycles-view"
                            value={selection.view}
                            onChange={(event) =>
                                select({
                                    ...selection,
                                    view: event.target.value as SettlementView,
                                    cursor: null,
                                })
                            }
                        >
                            <option value="OPEN">Em aberto</option>
                            <option value="OVERDUE">Vencidos</option>
                            <option value="FINALIZED">Finalizados</option>
                            <option value="UPCOMING">
                                Hoje e datas futuras
                            </option>
                        </select>
                    </>
                )}
                <Button
                    variant="outline"
                    type="button"
                    aria-disabled={query.isFetching}
                    onClick={refresh}
                >
                    Atualizar / Voltar ao início
                </Button>
            </div>
            {(query.isPending || query.isFetching) && (
                <p role="status" aria-busy="true">
                    Carregando acertos…
                </p>
            )}
            {query.isError && (
                <div>
                    <p role="alert">
                        {cursorError
                            ? 'Esta página não está mais disponível. Reinicie a consulta dos acertos.'
                            : query.error instanceof ApiError &&
                                query.error.code ===
                                    'SETTLEMENT_CYCLE_NOT_FOUND'
                              ? 'Este acerto não está disponível.'
                              : 'Não foi possível consultar os acertos.'}
                    </p>
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() =>
                            cursorError
                                ? select({ ...selection, cursor: null })
                                : void query.refetch()
                        }
                    >
                        {cursorError
                            ? 'Reiniciar lista de acertos'
                            : 'Tentar novamente os acertos'}
                    </Button>
                </div>
            )}
            {value && (
                <p>
                    Referência da consulta:{' '}
                    <time dateTime={value.referenceDate}>
                        {formatDate(value.referenceDate)}
                    </time>
                </p>
            )}
            {listValue && (
                <>
                    <div className={styles.actions}>
                        <p>
                            {selectedCycles.length} ciclos selecionados para
                            conferir juntos.
                        </p>
                        {selectedCycles.length >= 2 ? (
                            <Button asChild variant="outline">
                                <Link
                                    href={`/spaces/${spaceId}/finances/settlements/selected?cycleIds=${[...selectedCycles].sort().join(',')}`}
                                >
                                    Conferir ciclos selecionados
                                </Link>
                            </Button>
                        ) : (
                            <Button variant="outline" disabled>
                                Selecione ao menos dois ciclos
                            </Button>
                        )}
                        {selectedCycles.length > 0 && (
                            <Button
                                variant="ghost"
                                onClick={() => setSelectedCycles([])}
                            >
                                Limpar seleção
                            </Button>
                        )}
                    </div>
                    {listValue.items.length === 0 ? (
                        <p>
                            {selection.cursor
                                ? 'Nenhum acerto nesta página.'
                                : selection.view === 'UPCOMING'
                                  ? 'Nenhum acerto em aberto para hoje ou datas futuras.'
                                  : selection.view === 'OVERDUE'
                                    ? 'Nenhum acerto vencido neste espaço.'
                                    : selection.view === 'FINALIZED'
                                      ? 'Nenhum acerto finalizado neste espaço.'
                                      : 'Nenhum ciclo de acerto em aberto neste espaço.'}
                        </p>
                    ) : (
                        <ul
                            className={styles.list}
                            aria-label="Ciclos de acerto"
                        >
                            {listValue.items.map((cycle) => (
                                <li key={cycle.id}>
                                    <label className={formStyles.check}>
                                        <input
                                            type="checkbox"
                                            checked={selectedCycles.includes(
                                                cycle.id,
                                            )}
                                            disabled={
                                                selectedCycles.length >= 50 &&
                                                !selectedCycles.includes(
                                                    cycle.id,
                                                )
                                            }
                                            onChange={(event) =>
                                                setSelectedCycles(
                                                    event.target.checked
                                                        ? [
                                                              ...selectedCycles,
                                                              cycle.id,
                                                          ]
                                                        : selectedCycles.filter(
                                                              (id) =>
                                                                  id !==
                                                                  cycle.id,
                                                          ),
                                                )
                                            }
                                        />
                                        Selecionar acerto de{' '}
                                        {formatDate(cycle.targetDate)}
                                    </label>
                                    <h2>
                                        Acerto de{' '}
                                        <time dateTime={cycle.targetDate}>
                                            {formatDate(cycle.targetDate)}
                                        </time>
                                    </h2>
                                    <CycleTotals cycle={cycle} />
                                    <Link
                                        href={`${pathname}/${cycle.id}`}
                                        aria-label={`Abrir acerto de ${formatDate(cycle.targetDate)}`}
                                    >
                                        Abrir acerto
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                    <p>
                        Pendências sem ciclo continuam disponíveis no resumo
                        entre vocês.
                    </p>
                </>
            )}
            {detailValue && (
                <>
                    <h2>
                        Acerto de{' '}
                        <time dateTime={detailValue.cycle.targetDate}>
                            {formatDate(detailValue.cycle.targetDate)}
                        </time>
                    </h2>
                    <CycleTotals cycle={detailValue.cycle} />
                    <SettlementCycleFinalization
                        data={detailValue}
                        refresh={() => void detail.refetch()}
                        refreshing={detail.isFetching}
                    />
                    {detailValue.cycle.status === 'OPEN' &&
                        detailValue.spaceStatus !== 'CLOSED' && (
                            <Link
                                href={`/spaces/${spaceId}/finances/settlements/offsets/new?cycleIds=${cycleId}`}
                            >
                                Conferir compensação deste ciclo
                            </Link>
                        )}
                    {detailValue.cycle.status === 'OPEN' &&
                        detailValue.spaceStatus !== 'CLOSED' &&
                        detailValue.cycle.totals.remainingAmountInCents !==
                            '0' && (
                            <Link
                                href={`/spaces/${spaceId}/finances/settlements/transfers/new?cycleId=${cycleId}`}
                            >
                                Registrar transferência
                            </Link>
                        )}
                    {detailValue.cycle.finalizedAt && (
                        <p>
                            Finalizado em:{' '}
                            <time dateTime={detailValue.cycle.finalizedAt}>
                                {new Intl.DateTimeFormat('pt-BR', {
                                    timeZone: 'America/Sao_Paulo',
                                    dateStyle: 'short',
                                    timeStyle: 'short',
                                }).format(
                                    new Date(detailValue.cycle.finalizedAt),
                                )}
                            </time>
                        </p>
                    )}
                    <p>
                        Os totais e as contagens consideram toda a composição do
                        ciclo, independentemente do filtro e da página.
                    </p>
                    <h2>Composição</h2>
                    {detailValue.items.length === 0 ? (
                        <p>
                            {detailValue.cycle.obligationCount === 0
                                ? 'Este ciclo não possui pendências na composição.'
                                : 'Nenhuma pendência nesta página para o filtro escolhido.'}
                        </p>
                    ) : (
                        <ul
                            className={styles.list}
                            aria-label="Composição do acerto"
                        >
                            {detailValue.items.map((item) => (
                                <li key={item.id}>
                                    <h3>{item.origin.description}</h3>
                                    <p>
                                        {item.remainingAmountInCents === 0
                                            ? item.status === 'WAIVED'
                                                ? 'Pendência dispensada pelo credor.'
                                                : item.status === 'RECONCILED'
                                                  ? 'Encerrada por reconciliação dos fatos da origem, sem registrar transferência.'
                                                  : 'Pendência acertada.'
                                            : item.debtorMemberId ===
                                                detailValue.actorMemberId
                                              ? `Você precisa acertar com ${memberName(item.creditorMemberId)}`
                                              : `${memberName(item.debtorMemberId)} precisa acertar com você`}
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
                                        Valor reconhecido já acertado:{' '}
                                        {formatMoney(
                                            item.resolvedAmountInCents,
                                        )}
                                    </p>
                                    <p>
                                        Em aberto:{' '}
                                        {formatMoney(
                                            item.remainingAmountInCents,
                                        )}
                                    </p>
                                    {item.remainingAmountInCents === 0 && (
                                        <p>Sem valor em aberto</p>
                                    )}
                                    <p>
                                        Data do fato:{' '}
                                        <time dateTime={item.factDate}>
                                            {formatDate(item.factDate)}
                                        </time>
                                    </p>
                                    <Link
                                        href={`/spaces/${spaceId}/finances/settlements/obligations/${item.id}`}
                                    >
                                        Conferir pendência e opções de acerto
                                    </Link>
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
                                    {hasFinancialOriginPage(item.origin) && (
                                        <Link
                                            href={financialOriginPath(
                                                spaceId,
                                                item.origin,
                                                cycleId,
                                            )}
                                            aria-label={`Ver ${item.origin.kind === 'INCOME' ? 'receita' : 'despesa'}: ${item.origin.description}`}
                                        >
                                            Ver{' '}
                                            {item.origin.kind === 'INCOME'
                                                ? 'receita'
                                                : 'despesa'}
                                        </Link>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                </>
            )}
            {value &&
                (value.page.nextCursor ? (
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() =>
                            select({
                                ...selection,
                                cursor: value.page.nextCursor,
                            })
                        }
                    >
                        {cycleId
                            ? 'Próximas pendências do acerto'
                            : 'Próximos acertos'}
                    </Button>
                ) : (
                    <p role="status">
                        {cycleId
                            ? 'Fim da composição para este filtro.'
                            : 'Fim dos acertos para este recorte.'}
                    </p>
                ))}
            {value && (
                <p>
                    Cada página reflete uma consulta atual. Novos registros
                    podem aparecer ao voltar ao início.
                </p>
            )}
        </section>
    );
}
