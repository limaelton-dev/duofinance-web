'use client';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    getOffset,
    getOffsetHistory,
    getOffsetOptions,
    recordOffset,
} from '@/lib/api/settlement-depth';
import { getSettlementCycles } from '@/lib/api/settlement-cycles';
import { useFinancialCommand } from '../hooks/use-financial-command';
import type {
    OffsetInput,
    OffsetOptions,
    OffsetResult,
    OffsetScope,
} from '../types/settlement-depth';
import { settlementIds } from '../utils/settlement-depth';
import { businessToday, formatDate, formatMoney } from '../utils/expense-money';
import { formatPositionMoney } from '../utils/position-money';
import { financialOriginPath } from '../utils/settlement-return';
import { hasFinancialOriginPage } from '../types/settlement-origin';
import {
    CommandFeedback,
    QueryFeedback,
    SettlementAccess,
    SettlementNav,
    settlementBlockMessage,
    useSettlementQuery,
} from './settlement-depth-shared';
import styles from './finances-summary.module.css';
import formStyles from './settlement-depth.module.css';

export function SettlementOffsetPage({
    spaceId,
    mode,
    offsetId,
    cycleIds,
    obligationIds,
    cycleId,
    obligationId,
}: {
    spaceId: string;
    mode: 'new' | 'history' | 'detail';
    offsetId?: string;
    cycleIds?: string;
    obligationIds?: string;
    cycleId?: string;
    obligationId?: string;
}) {
    const cycles = cycleIds ? settlementIds(cycleIds) : [],
        obligations = obligationIds ? settlementIds(obligationIds) : [];
    const validFilters =
        (!cycleId || !!settlementIds(cycleId)) &&
        (!obligationId || !!settlementIds(obligationId));
    return (
        <SettlementAccess spaceId={spaceId}>
            {(personId) =>
                !cycles || !obligations || !validFilters ? (
                    <section className={styles.stack}>
                        <h1>Compensações</h1>
                        <p>
                            O recorte informado não é válido. Selecione os
                            ciclos novamente.
                        </p>
                        <SettlementNav spaceId={spaceId} />
                    </section>
                ) : mode === 'new' ? (
                    <OffsetComposer
                        key={JSON.stringify([cycles, obligations])}
                        personId={personId}
                        spaceId={spaceId}
                        initialScope={{
                            cycleIds: cycles,
                            obligationIds: obligations,
                        }}
                    />
                ) : (
                    <OffsetRead
                        key={`${offsetId ?? ''}:${cycleId ?? ''}:${obligationId ?? ''}`}
                        personId={personId}
                        spaceId={spaceId}
                        offsetId={offsetId}
                        cycleId={cycleId ?? null}
                        obligationId={obligationId ?? null}
                    />
                )
            }
        </SettlementAccess>
    );
}
function OffsetComposer({
    personId,
    spaceId,
    initialScope,
}: {
    personId: string;
    spaceId: string;
    initialScope: OffsetScope;
}) {
    const [scope, setScope] = useState(initialScope),
        [result, setResult] = useState<OffsetResult | null>(null);
    const ready = scope.cycleIds.length + scope.obligationIds.length > 0;
    return (
        <section className={styles.stack}>
            <div className={styles.intro}>
                <h1>Compensar pendências</h1>
                <p>
                    Confira os valores que vocês devem um ao outro. A
                    compensação reduz as duas direções, sem registrar
                    transferência de dinheiro.
                </p>
            </div>
            <SettlementNav spaceId={spaceId} />
            {result ? (
                <OffsetReceipt spaceId={spaceId} result={result} />
            ) : ready ? (
                <OffsetPlan
                    key={JSON.stringify(scope)}
                    personId={personId}
                    spaceId={spaceId}
                    scope={scope}
                    onSuccess={setResult}
                />
            ) : (
                <ScopePicker
                    personId={personId}
                    spaceId={spaceId}
                    onChoose={setScope}
                />
            )}
        </section>
    );
}
function ScopePicker({
    personId,
    spaceId,
    onChoose,
}: {
    personId: string;
    spaceId: string;
    onChoose: (scope: OffsetScope) => void;
}) {
    const [selected, setSelected] = useState<string[]>([]),
        [cursor, setCursor] = useState<string | null>(null);
    const query = useSettlementQuery(
        personId,
        spaceId,
        ['settlement-cycles', 'OPEN', cursor],
        (signal) => getSettlementCycles(spaceId, 'OPEN', cursor, signal),
    );
    const data = !query.isFetching && !query.isError ? query.data : undefined;
    return (
        <>
            <h2>Selecione os ciclos</h2>
            <p>
                Escolha de um a cinquenta ciclos abertos para conferir as
                pendências recíprocas.
            </p>
            <QueryFeedback query={query} label="ciclos abertos" />
            {data && (
                <>
                    {data.items.length ? (
                        <ul className={styles.list}>
                            {data.items.map((c) => (
                                <li key={c.id}>
                                    <label className={formStyles.check}>
                                        <input
                                            type="checkbox"
                                            checked={selected.includes(c.id)}
                                            disabled={
                                                selected.length >= 50 &&
                                                !selected.includes(c.id)
                                            }
                                            onChange={(e) =>
                                                setSelected(
                                                    e.target.checked
                                                        ? [...selected, c.id]
                                                        : selected.filter(
                                                              (id) =>
                                                                  id !== c.id,
                                                          ),
                                                )
                                            }
                                        />
                                        Acerto de {formatDate(c.targetDate)} ·
                                        aberto{' '}
                                        {formatPositionMoney(
                                            c.totals.remainingAmountInCents,
                                        )}
                                    </label>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>
                            Nenhum ciclo aberto disponível. Consulte as
                            pendências no resumo de Finanças.
                        </p>
                    )}
                    <p>{selected.length} ciclos selecionados.</p>
                    <Button
                        disabled={!selected.length}
                        onClick={() =>
                            onChoose({
                                cycleIds: [...selected].sort(),
                                obligationIds: [],
                            })
                        }
                    >
                        Conferir valores para compensar
                    </Button>
                    {data.page.nextCursor && (
                        <Button
                            variant="outline"
                            onClick={() => setCursor(data.page.nextCursor)}
                        >
                            Próximos ciclos
                        </Button>
                    )}
                </>
            )}
        </>
    );
}
function OffsetPlan({
    personId,
    spaceId,
    scope,
    onSuccess,
}: {
    personId: string;
    spaceId: string;
    scope: OffsetScope;
    onSuccess: (result: OffsetResult) => void;
}) {
    const query = useSettlementQuery(
        personId,
        spaceId,
        ['settlement-offset-options', scope],
        (signal) => getOffsetOptions(spaceId, scope, null, signal),
    );
    const [date, setDate] = useState(businessToday()),
        [confirmed, setConfirmed] = useState(false);
    const command = useFinancialCommand<OffsetInput, OffsetResult>({
        execute: recordOffset,
        onSuccess,
    });
    const data = !query.isError ? query.data : undefined,
        busy = command.isPending || command.canRetry;
    return (
        <>
            <QueryFeedback query={query} label="opções de compensação" />
            {data && (
                <>
                    <OffsetPreview spaceId={spaceId} data={data} />
                    {!data.canRecord ? (
                        <p>{settlementBlockMessage(data.reason)}</p>
                    ) : (
                        <form
                            className={formStyles.form}
                            onSubmit={(e) => {
                                e.preventDefault();
                                if (
                                    busy ||
                                    query.isFetching ||
                                    !confirmed ||
                                    !data.preview.allocations.length
                                )
                                    return;
                                command.submit({
                                    scope: data.scope,
                                    expectedSpaceVersion: data.spaceVersion,
                                    factDate: date,
                                    expectedCycleVersions: data.cycles.map(
                                        (c) => ({
                                            cycleId: c.id,
                                            version: c.version,
                                        }),
                                    ),
                                    allocations: data.preview.allocations,
                                });
                            }}
                        >
                            <fieldset disabled={busy || query.isFetching}>
                                <label
                                    className={formStyles.field}
                                    htmlFor="offset-date"
                                >
                                    Data da compensação
                                    <Input
                                        id="offset-date"
                                        type="date"
                                        required
                                        max={data.referenceDate}
                                        value={date}
                                        onChange={(e) => {
                                            setDate(e.target.value);
                                            setConfirmed(false);
                                        }}
                                    />
                                </label>
                                <label className={formStyles.check}>
                                    <input
                                        type="checkbox"
                                        required
                                        checked={confirmed}
                                        onChange={(e) =>
                                            setConfirmed(e.target.checked)
                                        }
                                    />
                                    Confirmo a compensação de{' '}
                                    {formatPositionMoney(
                                        data.preview.amountInCents,
                                    )}{' '}
                                    em cada direção, sem transferência de
                                    dinheiro.
                                </label>
                                <Button
                                    type="submit"
                                    disabled={
                                        !confirmed ||
                                        BigInt(data.preview.amountInCents) <= 0n
                                    }
                                >
                                    Confirmar compensação
                                </Button>
                            </fieldset>
                        </form>
                    )}
                </>
            )}
            <CommandFeedback command={command} />
            <Button
                variant="outline"
                disabled={busy || query.isFetching}
                onClick={() => {
                    setConfirmed(false);
                    void query.refetch();
                }}
            >
                Atualizar valores para compensar
            </Button>
        </>
    );
}
function OffsetPreview({
    spaceId,
    data,
}: {
    spaceId: string;
    data: OffsetOptions;
}) {
    return (
        <>
            <h2>
                Pode compensar {formatPositionMoney(data.preview.amountInCents)}
            </h2>
            <p>
                Disponível no recorte:{' '}
                {formatPositionMoney(data.maximumAmountInCents)} em cada
                direção. A confirmação reduz as pendências abaixo.
            </p>
            {!data.preview.complete && (
                <p className={formStyles.note}>
                    Esta proposta cobre parte do valor disponível, respeitando o
                    limite de pendências por registro. As demais continuam em
                    aberto.
                </p>
            )}
            <ul className={styles.list} aria-label="Pendências da compensação">
                {data.preview.allocations.map((a) => {
                    const item = data.items.find(
                        (i) => i.id === a.obligationId,
                    );
                    return (
                        <li key={a.obligationId}>
                            <h3>
                                {item?.origin.description ??
                                    'Pendência do recorte'}
                            </h3>
                            <p>
                                {item
                                    ? item.debtorMemberId === data.actorMemberId
                                        ? 'Você deixa de dever '
                                        : 'Você deixa de receber '
                                    : 'Valor reduzido nesta pendência: '}
                                {formatMoney(a.amountInCents)}
                            </p>
                            <Link
                                href={`/spaces/${spaceId}/finances/settlements/obligations/${a.obligationId}`}
                            >
                                Conferir pendência
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </>
    );
}
function OffsetReceipt({
    spaceId,
    result,
}: {
    spaceId: string;
    result: OffsetResult;
}) {
    return (
        <div className={formStyles.receipt} role="status">
            <h2>Compensação registrada</h2>
            <p>
                {formatMoney(result.offset.amountInCents)} compensados em cada
                direção. Nenhum dinheiro foi transferido.
            </p>
            <Link
                href={`/spaces/${spaceId}/finances/settlements/offsets/${result.offset.id}`}
            >
                Conferir o resultado da compensação
            </Link>
            <Link href={`/spaces/${spaceId}/finances`}>
                Conferir posição atual
            </Link>
        </div>
    );
}
function OffsetRead({
    personId,
    spaceId,
    offsetId,
    cycleId,
    obligationId,
}: {
    personId: string;
    spaceId: string;
    offsetId?: string;
    cycleId: string | null;
    obligationId: string | null;
}) {
    const [cursor, setCursor] = useState<string | null>(null);
    const history = useSettlementQuery(
        personId,
        spaceId,
        ['settlement-offsets', cycleId, obligationId, cursor],
        (signal) =>
            getOffsetHistory(spaceId, cycleId, obligationId, cursor, signal),
        !offsetId,
    );
    const detail = useSettlementQuery(
        personId,
        spaceId,
        ['settlement-offset', offsetId],
        (signal) => getOffset(spaceId, offsetId!, signal),
        !!offsetId,
    );
    const query = offsetId ? detail : history,
        rows = offsetId
            ? detail.data
                ? [detail.data]
                : []
            : (history.data?.items ?? []);
    return (
        <section className={styles.stack}>
            <div className={styles.intro}>
                <h1>
                    {offsetId
                        ? 'Compensação de acerto'
                        : 'Histórico de compensações'}
                </h1>
                <p>
                    Compensações resolvem valores recíprocos sem criar fluxo de
                    caixa. Os fatos originais permanecem no histórico.
                </p>
            </div>
            <SettlementNav spaceId={spaceId} />
            <Link
                href={`/spaces/${spaceId}/finances/settlements/offsets/new${cycleId ? `?cycleIds=${cycleId}` : obligationId ? `?obligationIds=${obligationId}` : ''}`}
            >
                Conferir nova compensação
            </Link>
            <QueryFeedback query={query} label="compensações" />
            {!query.isFetching && !query.isError && query.data && (
                <>
                    {!rows.length ? (
                        <p>Nenhuma compensação neste recorte.</p>
                    ) : (
                        <ul
                            className={styles.list}
                            aria-label="Compensações registradas"
                        >
                            {rows.map((row) => (
                                <li key={row.offset.id}>
                                    <h2>
                                        Compensado:{' '}
                                        {formatMoney(row.offset.amountInCents)}
                                    </h2>
                                    <p>
                                        Data: {formatDate(row.offset.factDate)}{' '}
                                        · nenhum dinheiro transferido
                                    </p>
                                    {row.offset.reversedAmountInCents !==
                                        undefined && (
                                        <p>
                                            Revertido:{' '}
                                            {formatMoney(
                                                row.offset
                                                    .reversedAmountInCents,
                                            )}
                                            . Compensação efetiva:{' '}
                                            {formatMoney(
                                                row.offset
                                                    .effectiveAmountInCents ??
                                                    row.offset.amountInCents,
                                            )}
                                            .
                                        </p>
                                    )}
                                    {row.offset.reversalId && (
                                        <p>
                                            Este registro recebeu uma reversão
                                            vinculada. O fato original foi
                                            preservado.
                                        </p>
                                    )}
                                    {offsetId ? (
                                        <>
                                            <h3>Aplicações nas pendências</h3>
                                            {row.allocations.map((a) => (
                                                <div
                                                    className={formStyles.note}
                                                    key={a.id}
                                                >
                                                    <p>
                                                        {a.origin.description} ·{' '}
                                                        {formatMoney(
                                                            a.amountInCents,
                                                        )}
                                                    </p>
                                                    <div
                                                        className={
                                                            styles.actions
                                                        }
                                                    >
                                                        {hasFinancialOriginPage(
                                                            a.origin,
                                                        ) && (
                                                            <Link
                                                                href={financialOriginPath(
                                                                    spaceId,
                                                                    a.origin,
                                                                    a.cycleId,
                                                                )}
                                                            >
                                                                Ver origem
                                                                financeira
                                                            </Link>
                                                        )}
                                                        <Link
                                                            href={`/spaces/${spaceId}/finances/settlements/obligations/${a.obligationId}`}
                                                        >
                                                            Conferir pendência
                                                        </Link>
                                                        {a.cycleId && (
                                                            <Link
                                                                href={`/spaces/${spaceId}/finances/settlements/${a.cycleId}`}
                                                            >
                                                                Ver acerto
                                                            </Link>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                            <Link
                                                href={`/spaces/${spaceId}/finances/settlements/offsets/${row.offset.id}/reverse`}
                                            >
                                                Conferir reversão desta
                                                compensação
                                            </Link>
                                        </>
                                    ) : (
                                        <Link
                                            href={`/spaces/${spaceId}/finances/settlements/offsets/${row.offset.id}`}
                                        >
                                            Conferir compensação
                                        </Link>
                                    )}
                                </li>
                            ))}
                        </ul>
                    )}
                    {!offsetId && history.data?.page.nextCursor && (
                        <Button
                            variant="outline"
                            onClick={() =>
                                setCursor(history.data!.page.nextCursor)
                            }
                        >
                            Próximas compensações
                        </Button>
                    )}
                </>
            )}
            <Button
                variant="outline"
                disabled={query.isFetching}
                onClick={() =>
                    cursor ? setCursor(null) : void query.refetch()
                }
            >
                Atualizar / Voltar ao início
            </Button>
        </section>
    );
}
