'use client';
import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { ApiError } from '@/lib/api/api-error';
import {
    getTransfer,
    getTransferHistory,
} from '@/lib/api/settlement-transfers';
import { financesQueryKeys } from '../cache/finances-query-keys';
import { useExpenseQuery } from '../hooks/use-expense-query';
import type { Member } from '../types/shared-expense';
import type {
    TransferAllocation,
    SettlementTransfer,
} from '../types/settlement-transfer';
import { formatDate, formatMoney } from '../utils/expense-money';
import styles from './finances-summary.module.css';

const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const validId = (value?: string) => (value && uuid.test(value) ? value : null);

export function TransferHistoryPage({
    spaceId,
    transferId,
    cycleId,
    obligationId,
}: {
    spaceId: string;
    transferId?: string;
    cycleId?: string;
    obligationId?: string;
}) {
    const auth = useAuthenticatedContext({ enabled: false });
    const space = useSpaceContext();
    if (
        !auth.data ||
        space.phase !== 'ready' ||
        space.activeSpaceId !== spaceId
    )
        return null;
    if (space.currentSpace?.type !== 'SHARED')
        return (
            <section>
                <h1>Transferências de acerto</h1>
                <p>
                    O histórico entre membros se aplica somente a espaços
                    compartilhados.
                </p>
                <Link href={`/spaces/${spaceId}`}>Voltar ao espaço</Link>
            </section>
        );
    return (
        <History
            key={`${auth.data.person.id}:${spaceId}:${space.generation}:${transferId ?? 'list'}:${cycleId ?? ''}:${obligationId ?? ''}`}
            personId={auth.data.person.id}
            spaceId={spaceId}
            transferId={transferId}
            cycleId={validId(cycleId)}
            obligationId={validId(obligationId)}
        />
    );
}

function TransferSummary({
    transfer,
    allocations,
    members,
}: {
    transfer: SettlementTransfer;
    allocations: TransferAllocation[];
    members: Member[];
}) {
    const name = (id: string) =>
        members.find((member) => member.memberId === id)?.displayName ??
        'Membro do espaço';
    const author =
        members.find((member) => member.personId === transfer.createdByPersonId)
            ?.displayName ?? 'Membro do espaço';
    return (
        <>
            <p>
                {name(transfer.payerMemberId)} transferiu{' '}
                {formatMoney(transfer.amountInCents)} para{' '}
                {name(transfer.recipientMemberId)}.
            </p>
            <p>
                Data do dinheiro:{' '}
                <time dateTime={transfer.factDate}>
                    {formatDate(transfer.factDate)}
                </time>
            </p>
            <p>
                Registrada por {author} em{' '}
                <time dateTime={transfer.registeredAt}>
                    {new Intl.DateTimeFormat('pt-BR', {
                        timeZone: 'America/Sao_Paulo',
                        dateStyle: 'short',
                        timeStyle: 'short',
                    }).format(new Date(transfer.registeredAt))}
                </time>
            </p>
            <p>Distribuição manual em {allocations.length} pendência(s).</p>
        </>
    );
}

function History({
    personId,
    spaceId,
    transferId,
    cycleId,
    obligationId,
}: {
    personId: string;
    spaceId: string;
    transferId?: string;
    cycleId: string | null;
    obligationId: string | null;
}) {
    const router = useRouter();
    const context = useSpaceContextInstance();
    const space = useSpaceContext();
    const [cursor, setCursor] = useState<string | null>(null);
    const currentCursor = useRef<string | null>(cursor);
    useLayoutEffect(() => {
        currentCursor.current = cursor;
    }, [cursor]);
    const history = useExpenseQuery(
        personId,
        spaceId,
        financesQueryKeys.transferHistory(
            personId,
            spaceId,
            cycleId,
            obligationId,
            cursor,
        ),
        !transferId,
        (signal) =>
            getTransferHistory(spaceId, cycleId, obligationId, cursor, signal),
        () => currentCursor.current === cursor,
    );
    const detail = useExpenseQuery(
        personId,
        spaceId,
        financesQueryKeys.transfer(personId, spaceId, transferId ?? ''),
        !!transferId,
        (signal) => getTransfer(spaceId, transferId!, signal),
    );
    const query = transferId ? detail : history;
    const pathname = transferId
        ? `/spaces/${spaceId}/finances/settlements/transfers/${transferId}`
        : `/spaces/${spaceId}/finances/settlements/transfers`;
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
        !transferId && !history.isFetching && !history.isError
            ? history.data
            : undefined;
    const detailValue =
        transferId && !detail.isFetching && !detail.isError
            ? detail.data
            : undefined;
    const base = `/spaces/${spaceId}/finances/settlements/transfers`;
    const cycleBack = cycleId
        ? `/spaces/${spaceId}/finances/settlements/${cycleId}`
        : `/spaces/${spaceId}/finances`;
    return (
        <section className={styles.stack}>
            <h1>
                {transferId
                    ? 'Transferência de acerto'
                    : 'Histórico de transferências'}
            </h1>
            <nav aria-label="Navegação financeira" className={styles.actions}>
                <Link href={cycleBack}>Voltar ao acerto ou resumo</Link>
                {transferId && <Link href={base}>Todas as transferências</Link>}
                {space.currentSpace?.status !== 'CLOSED' && (
                    <Link
                        href={`/spaces/${spaceId}/finances/settlements/transfers/new${cycleId ? `?cycleId=${cycleId}` : ''}`}
                    >
                        Registrar transferência
                    </Link>
                )}
            </nav>
            <p>
                Transferências são fatos internos registrados por membros. O
                sistema não executa pagamentos.
            </p>
            {(query.isPending || query.isFetching) && (
                <p role="status" aria-busy="true">
                    Carregando transferências…
                </p>
            )}
            {query.isError && (
                <div>
                    <p role="alert">
                        {query.error instanceof ApiError &&
                        query.error.code === 'SETTLEMENT_TRANSFER_NOT_FOUND'
                            ? 'Esta transferência não está disponível.'
                            : 'Não foi possível consultar as transferências.'}
                    </p>
                    <button
                        type="button"
                        onClick={() =>
                            cursor ? setCursor(null) : void query.refetch()
                        }
                    >
                        Tentar novamente as transferências
                    </button>
                </div>
            )}
            {listValue && (
                <>
                    {(cycleId || obligationId) && (
                        <p>
                            Histórico filtrado para o acerto ou pendência de
                            origem.
                        </p>
                    )}
                    {listValue.items.length === 0 ? (
                        <p>Nenhuma transferência registrada neste recorte.</p>
                    ) : (
                        <ul
                            className={styles.list}
                            aria-label="Transferências registradas"
                        >
                            {listValue.items.map((entry) => (
                                <li key={entry.transfer.id}>
                                    <TransferSummary
                                        transfer={entry.transfer}
                                        allocations={entry.allocations}
                                        members={listValue.members}
                                    />
                                    {(cycleId || obligationId) && (
                                        <p>
                                            Aplicado neste recorte:{' '}
                                            {formatMoney(
                                                entry.appliedAmountInCentsInFilter,
                                            )}
                                        </p>
                                    )}
                                    <Link href={`${base}/${entry.transfer.id}`}>
                                        Ver alocações e origens
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    )}
                    {listValue.page.nextCursor ? (
                        <button
                            type="button"
                            onClick={() => {
                                currentCursor.current =
                                    listValue.page.nextCursor;
                                setCursor(listValue.page.nextCursor);
                            }}
                        >
                            Próximas transferências
                        </button>
                    ) : (
                        <p role="status">Fim do histórico deste recorte.</p>
                    )}
                    <button
                        type="button"
                        onClick={() =>
                            cursor ? setCursor(null) : void history.refetch()
                        }
                    >
                        Atualizar histórico / Voltar ao início
                    </button>
                </>
            )}
            {detailValue && (
                <>
                    <TransferSummary
                        transfer={detailValue.transfer}
                        allocations={detailValue.allocations}
                        members={detailValue.members}
                    />
                    <h2>Aplicações</h2>
                    <ul
                        className={styles.list}
                        aria-label="Alocações da transferência"
                    >
                        {detailValue.allocations.map((allocation) => (
                            <li key={allocation.id}>
                                <h3>{allocation.origin.description}</h3>
                                <p>
                                    Aplicado:{' '}
                                    {formatMoney(allocation.amountInCents)}
                                </p>
                                {allocation.cycleId ? (
                                    <Link
                                        href={`/spaces/${spaceId}/finances/settlements/${allocation.cycleId}`}
                                    >
                                        Ver acerto
                                    </Link>
                                ) : (
                                    <p>Sem acerto associado</p>
                                )}
                                <Link
                                    href={`/spaces/${spaceId}/expenses/${allocation.origin.commitmentId}${allocation.cycleId ? `?returnCycle=${allocation.cycleId}` : ''}`}
                                >
                                    Ver despesa de origem
                                </Link>
                            </li>
                        ))}
                    </ul>
                    <p>
                        Consulte a posição e o acerto para ver os valores atuais
                        das pendências.
                    </p>
                    <Link href={`/spaces/${spaceId}/finances`}>
                        Ver posição atual
                    </Link>
                </>
            )}
        </section>
    );
}
