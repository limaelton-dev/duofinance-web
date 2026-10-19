'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { getSelectedCycles } from '@/lib/api/settlement-depth';
import type { PositionDirection } from '../types/inter-member-position';
import { settlementIds } from '../utils/settlement-depth';
import { formatDate, formatMoney } from '../utils/expense-money';
import { formatPositionMoney } from '../utils/position-money';
import { financialOriginPath } from '../utils/settlement-return';
import { hasFinancialOriginPage } from '../types/settlement-origin';
import {
    QueryFeedback,
    SettlementAccess,
    SettlementNav,
    useSettlementQuery,
} from './settlement-depth-shared';
import styles from './finances-summary.module.css';

export function SettlementSelectedPage({
    spaceId,
    cycleIds,
}: {
    spaceId: string;
    cycleIds: string | undefined;
}) {
    const ids = settlementIds(cycleIds, 2);
    return (
        <SettlementAccess spaceId={spaceId}>
            {(personId) =>
                ids ? (
                    <SelectedRead
                        key={ids.join(',')}
                        personId={personId}
                        spaceId={spaceId}
                        cycleIds={ids}
                    />
                ) : (
                    <section className={styles.stack}>
                        <h1>Conferir ciclos juntos</h1>
                        <p>
                            Selecione de dois a cinquenta ciclos de acerto para
                            consultar este recorte.
                        </p>
                        <Link href={`/spaces/${spaceId}/finances/settlements`}>
                            Selecionar ciclos
                        </Link>
                    </section>
                )
            }
        </SettlementAccess>
    );
}
function SelectedRead({
    personId,
    spaceId,
    cycleIds,
}: {
    personId: string;
    spaceId: string;
    cycleIds: string[];
}) {
    const [selection, setSelection] = useState<{
        direction: PositionDirection;
        cursor: string | null;
    }>({ direction: 'ALL', cursor: null });
    const query = useSettlementQuery(
        personId,
        spaceId,
        [
            'settlement-selected',
            cycleIds,
            selection.direction,
            selection.cursor,
        ],
        (signal) =>
            getSelectedCycles(
                spaceId,
                cycleIds,
                selection.direction,
                selection.cursor,
                signal,
            ),
    );
    const data = !query.isFetching && !query.isError ? query.data : undefined;
    const name = (id: string) =>
        data?.members.find((m) => m.memberId === id)?.displayName ??
        'Membro do espaço';
    return (
        <section className={styles.stack}>
            <div className={styles.intro}>
                <h1>Conferir ciclos juntos</h1>
                <p>
                    Este resumo é temporário. Os ciclos e suas datas continuam
                    independentes; nenhum novo acerto foi criado.
                </p>
            </div>
            <SettlementNav spaceId={spaceId} />
            <div className={styles.actions}>
                <label htmlFor="selected-direction">Mostrar pendências</label>
                <select
                    id="selected-direction"
                    value={selection.direction}
                    onChange={(e) =>
                        setSelection({
                            direction: e.target.value as PositionDirection,
                            cursor: null,
                        })
                    }
                >
                    <option value="ALL">Todas as direções</option>
                    <option value="PAYABLE">A pagar</option>
                    <option value="RECEIVABLE">A receber</option>
                </select>
                <Button
                    variant="outline"
                    disabled={query.isFetching}
                    onClick={() =>
                        selection.cursor
                            ? setSelection({ ...selection, cursor: null })
                            : void query.refetch()
                    }
                >
                    Atualizar recorte
                </Button>
            </div>
            <QueryFeedback query={query} label="resumo dos ciclos" />
            {data && (
                <>
                    <h2>{data.selectedCycles.length} ciclos neste recorte</h2>
                    <ul
                        className={styles.list}
                        aria-label="Ciclos selecionados"
                    >
                        {data.selectedCycles.map((c) => (
                            <li key={c.id}>
                                <h3>
                                    <Link
                                        href={`/spaces/${spaceId}/finances/settlements/${c.id}`}
                                    >
                                        Acerto de {formatDate(c.targetDate)}
                                    </Link>
                                </h3>
                                <p>
                                    {c.status === 'FINALIZED'
                                        ? 'Finalizado · histórico preservado'
                                        : c.isOverdue
                                          ? 'Em aberto · vencido'
                                          : 'Em aberto'}
                                </p>
                                <p>
                                    Restante:{' '}
                                    {formatPositionMoney(
                                        c.totals.remainingAmountInCents,
                                    )}
                                </p>
                            </li>
                        ))}
                    </ul>
                    <dl
                        className={styles.totals}
                        aria-label="Totais dos ciclos selecionados"
                    >
                        {[
                            [
                                'Valor original bruto',
                                data.totals.originalAmountInCents,
                            ],
                            [
                                'Valor reconhecido',
                                data.totals.recognizedAmountInCents,
                            ],
                            [
                                'Dinheiro transferido',
                                data.totals.transferredAmountInCents,
                            ],
                            [
                                'Compensado',
                                data.totals.compensatedAmountInCents ?? '0',
                            ],
                            [
                                'Dispensado',
                                data.totals.waivedAmountInCents ?? '0',
                            ],
                            [
                                'Restante em aberto',
                                data.totals.remainingAmountInCents,
                            ],
                            [
                                'Bruto a pagar',
                                data.totals.grossPayableAmountInCents,
                            ],
                            [
                                'Bruto a receber',
                                data.totals.grossReceivableAmountInCents,
                            ],
                        ].map(([label, value]) => (
                            <div key={label}>
                                <dt>{label}</dt>
                                <dd>{formatPositionMoney(value)}</dd>
                            </div>
                        ))}
                    </dl>
                    <p>
                        {data.totals.transferCount} transferências vinculadas.
                        Total dos fatos de transferência:{' '}
                        {formatPositionMoney(
                            data.totals.transferTotalAmountInCents,
                        )}
                        . Uma transferência aplicada em mais de um ciclo é
                        contada uma vez.
                    </p>
                    <p>
                        Posição líquida informativa:{' '}
                        {data.position.net.direction === 'PAYABLE'
                            ? 'você paga '
                            : data.position.net.direction === 'RECEIVABLE'
                              ? 'você recebe '
                              : ''}
                        {formatPositionMoney(data.position.net.amountInCents)}.
                        Consultar os valores não compensa pendências.
                    </p>
                    {data.selectedCycles.every((c) => c.status === 'OPEN') &&
                        data.spaceStatus !== 'CLOSED' && (
                            <Link
                                href={`/spaces/${spaceId}/finances/settlements/offsets/new?cycleIds=${cycleIds.join(',')}`}
                            >
                                Conferir compensação deste recorte
                            </Link>
                        )}
                    <h2>Composição do recorte</h2>
                    {!data.items.length ? (
                        <p>Nenhuma pendência para este filtro.</p>
                    ) : (
                        <ul
                            className={styles.list}
                            aria-label="Composição dos ciclos selecionados"
                        >
                            {data.items.map((item) => (
                                <li key={item.id}>
                                    <h3>{item.origin.description}</h3>
                                    <p>
                                        {name(item.debtorMemberId)} deve a{' '}
                                        {name(item.creditorMemberId)} · em
                                        aberto{' '}
                                        {formatMoney(
                                            item.remainingAmountInCents,
                                        )}
                                    </p>
                                    <p>
                                        Data econômica:{' '}
                                        {formatDate(item.factDate)}
                                    </p>
                                    <div className={styles.actions}>
                                        <Link
                                            href={`/spaces/${spaceId}/finances/settlements/${item.cycleId}`}
                                        >
                                            Ver ciclo de origem
                                        </Link>
                                        {hasFinancialOriginPage(
                                            item.origin,
                                        ) && (
                                            <Link
                                                href={financialOriginPath(
                                                    spaceId,
                                                    item.origin,
                                                    item.cycleId,
                                                )}
                                            >
                                                Ver registro de origem
                                            </Link>
                                        )}
                                        <Link
                                            href={`/spaces/${spaceId}/finances/settlements/obligations/${item.id}`}
                                        >
                                            Conferir pendência
                                        </Link>
                                    </div>
                                </li>
                            ))}
                        </ul>
                    )}
                    {data.page.nextCursor ? (
                        <Button
                            variant="outline"
                            onClick={() =>
                                setSelection({
                                    ...selection,
                                    cursor: data.page.nextCursor,
                                })
                            }
                        >
                            Próximas pendências do recorte
                        </Button>
                    ) : (
                        <p role="status">Fim da composição deste recorte.</p>
                    )}
                </>
            )}
        </section>
    );
}
