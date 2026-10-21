'use client';
import Link from 'next/link';
import { FinancialRecordLink } from './financial-record-link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    getInstallmentList,
    getInstallmentDetail,
    getInstallmentItems,
} from '@/lib/api/installment-commitment';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { formatDate, formatMoney } from '../utils/expense-money';
import {
    PlanningBoundary,
    PlanningHeading,
    planningKey,
    QueryFeedback,
    planningStatus,
    signedMoney,
} from './planning-shared';
import { PlannedOccurrenceActions } from './planned-occurrence-actions';
import { InstallmentResolutionForm } from './installment-resolution-form';
import styles from './expenses.module.css';
import layout from './planning.module.css';

export function InstallmentCommitmentPage({
    spaceId,
    commitmentId,
}: {
    spaceId: string;
    commitmentId?: string;
}) {
    return (
        <PlanningBoundary spaceId={spaceId}>
            {(personId) =>
                commitmentId ? (
                    <InstallmentDetail
                        personId={personId}
                        spaceId={spaceId}
                        commitmentId={commitmentId}
                    />
                ) : (
                    <InstallmentList personId={personId} spaceId={spaceId} />
                )
            }
        </PlanningBoundary>
    );
}
function InstallmentList({
    personId,
    spaceId,
}: {
    personId: string;
    spaceId: string;
}) {
    const [cursor, setCursor] = useState<string | null>(null);
    const query = useExpenseQuery(
        personId,
        spaceId,
        planningKey(personId, spaceId, 'installment-list', cursor),
        true,
        (signal) => getInstallmentList(spaceId, cursor, signal),
    );
    return (
        <section className={styles.stack}>
            <PlanningHeading title="Parcelamentos" spaceId={spaceId}>
                Planos finitos, valores reais e histórico de cada parcela.
            </PlanningHeading>
            <div className={styles.actions}>
                <Button asChild>
                    <Link
                        href={`/spaces/${spaceId}/installment-commitments/new`}
                    >
                        Criar parcelamento
                    </Link>
                </Button>
                <Link href={`/spaces/${spaceId}/finances/planning`}>
                    Ver planejamento
                </Link>
            </div>
            <QueryFeedback query={query} />
            {query.data && !query.isError && (
                <>
                    <p>{query.data.totalCount} parcelamentos.</p>
                    {query.data.items.length ? (
                        <ul className={layout.list}>
                            {query.data.items.map((item) => (
                                <li key={item.id} className={layout.row}>
                                    <h2>
                                        <FinancialRecordLink
                                            href={`/spaces/${spaceId}/installment-commitments/${item.id}`}
                                        >
                                            {item.description}
                                        </FinancialRecordLink>
                                    </h2>
                                    <p>
                                        {item.plan.count} parcelas ·{' '}
                                        {planningStatus[item.plan.status]}
                                    </p>
                                    <p>
                                        {formatMoney(
                                            item.plan.remainingAmountInCents,
                                        )}{' '}
                                        em aberto
                                    </p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p>
                            Nenhum parcelamento registrado. Crie um plano para
                            conferir seus valores e vencimentos.
                        </p>
                    )}
                    <div className={styles.actions}>
                        {cursor && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setCursor(null)}
                            >
                                Voltar ao início
                            </Button>
                        )}
                        {query.data.nextCursor && (
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() =>
                                    setCursor(query.data!.nextCursor)
                                }
                            >
                                Próxima página
                            </Button>
                        )}
                    </div>
                </>
            )}
        </section>
    );
}
function InstallmentDetail({
    personId,
    spaceId,
    commitmentId,
}: {
    personId: string;
    spaceId: string;
    commitmentId: string;
}) {
    const root = useExpenseQuery(
        personId,
        spaceId,
        planningKey(personId, spaceId, 'installment-detail', commitmentId),
        true,
        (signal) => getInstallmentDetail(spaceId, commitmentId, signal),
    );
    const items = useExpenseQuery(
        personId,
        spaceId,
        planningKey(personId, spaceId, 'installment-items', commitmentId),
        true,
        (signal) => getInstallmentItems(spaceId, commitmentId, signal),
    );
    const [selected, setSelected] = useState<string | null>(null),
        [mode, setMode] = useState<'ANTICIPATE' | 'PAYOFF' | 'CANCEL' | null>(
            null,
        ),
        [notice, setNotice] = useState<string | null>(null);
    const value = !root.isError ? root.data?.commitment : undefined;
    function saved(message: string) {
        setNotice(message);
        setMode(null);
        setSelected(null);
        void root.refetch();
        void items.refetch();
    }
    return (
        <section className={styles.stack}>
            <PlanningHeading title="Parcelamento" spaceId={spaceId} />
            <QueryFeedback query={root} />
            {notice && <p role="status">{notice}</p>}
            {value && (
                <>
                    <div className={styles.receipt}>
                        <h2>{value.description}</h2>
                        <p>
                            {value.plan.count} parcelas ·{' '}
                            {planningStatus[value.plan.status]}
                        </p>
                        <dl>
                            <dt>Total previsto no plano</dt>
                            <dd>
                                {formatMoney(value.plan.totalAmountInCents)}
                            </dd>
                            <dt>Realizado</dt>
                            <dd>
                                {formatMoney(value.plan.fulfilledAmountInCents)}
                            </dd>
                            <dt>Ainda em aberto</dt>
                            <dd>
                                {formatMoney(value.plan.remainingAmountInCents)}
                            </dd>
                        </dl>
                        <Link
                            href={`/spaces/${spaceId}/finances/commitments/${commitmentId}?modality=INSTALLMENT`}
                        >
                            Histórico e correções
                        </Link>
                    </div>
                    {value.plan.payoff && (
                        <section className={styles.receipt}>
                            <h2>Quitação global</h2>
                            <p>
                                Um pagamento de{' '}
                                {formatMoney(
                                    value.plan.payoff.paidAmountInCents,
                                )}{' '}
                                em {formatDate(value.plan.payoff.factDate)}.
                            </p>
                            <p>
                                Restante previsto:{' '}
                                {formatMoney(
                                    value.plan.payoff
                                        .expectedRemainingAmountInCents,
                                )}
                                . Diferença global:{' '}
                                {signedMoney(
                                    value.plan.payoff.adjustmentInCents,
                                )}
                                .
                            </p>
                            <p className={styles.help}>
                                O valor pertence ao fato global. As parcelas
                                mantêm o vínculo com a quitação, sem rateio
                                fictício do pagamento.
                            </p>
                        </section>
                    )}
                    {value.plan.remainingAmountInCents > 0 && (
                        <>
                            <div className={styles.actions}>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setMode(
                                            mode === 'ANTICIPATE'
                                                ? null
                                                : 'ANTICIPATE',
                                        );
                                        setSelected(null);
                                    }}
                                >
                                    Antecipar parcelas
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setMode(
                                            mode === 'PAYOFF' ? null : 'PAYOFF',
                                        );
                                        setSelected(null);
                                    }}
                                >
                                    Quitar restante
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => {
                                        setMode(
                                            mode === 'CANCEL' ? null : 'CANCEL',
                                        );
                                        setSelected(null);
                                    }}
                                >
                                    Cancelar futuras
                                </Button>
                            </div>
                            {mode && (
                                <InstallmentResolutionForm
                                    key={`${mode}:${value.version}`}
                                    mode={mode}
                                    personId={personId}
                                    spaceId={spaceId}
                                    commitmentId={commitmentId}
                                    shared={value.scope === 'SHARED'}
                                    onSaved={saved}
                                />
                            )}
                        </>
                    )}
                    <section className={layout.section}>
                        <h2>Parcelas e histórico</h2>
                        <QueryFeedback query={items} />
                        {items.data && !items.isError && (
                            <ol className={layout.list}>
                                {items.data.items.map((item) => (
                                    <li className={layout.row} key={item.id}>
                                        <h3>
                                            Parcela {item.position} ·{' '}
                                            {formatDate(item.dueDate)}
                                        </h3>
                                        <p>
                                            {planningStatus[item.status]} ·
                                            previsto{' '}
                                            {formatMoney(item.amountInCents)}
                                        </p>
                                        <p>
                                            Realizado:{' '}
                                            {formatMoney(
                                                item.fulfilledAmountInCents,
                                            )}{' '}
                                            · restante:{' '}
                                            {formatMoney(
                                                item.remainingAmountInCents,
                                            )}
                                            .
                                        </p>
                                        {item.anticipation && (
                                            <p>
                                                Antecipada em{' '}
                                                {formatDate(
                                                    item.anticipation.factDate,
                                                )}{' '}
                                                por{' '}
                                                {formatMoney(
                                                    item.anticipation
                                                        .paidAmountInCents,
                                                )}
                                                . Diferença:{' '}
                                                {signedMoney(
                                                    item.anticipation
                                                        .adjustmentInCents,
                                                )}
                                                .
                                            </p>
                                        )}
                                        {item.resolution && (
                                            <p>
                                                {item.status === 'PAID_OFF'
                                                    ? 'Vinculada à quitação global.'
                                                    : item.status ===
                                                        'CANCELLED'
                                                      ? `Restante cancelado.${item.resolution.reason ? ` Motivo: ${item.resolution.reason}` : ''}`
                                                      : 'Resolução registrada no histórico.'}
                                            </p>
                                        )}
                                        {item.facts.length > 0 && (
                                            <details>
                                                <summary>
                                                    Fatos desta parcela
                                                </summary>
                                                {item.facts.map((fact) => (
                                                    <p key={fact.id}>
                                                        {fact.kind ===
                                                        'EXTERNAL_LIABILITY'
                                                            ? 'Obrigação no cartão'
                                                            : 'Pagamento'}{' '}
                                                        ·{' '}
                                                        {formatMoney(
                                                            fact.amountInCents,
                                                        )}{' '}
                                                        ·{' '}
                                                        {formatDate(
                                                            fact.factDate,
                                                        )}
                                                    </p>
                                                ))}
                                            </details>
                                        )}
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => {
                                                setMode(null);
                                                setSelected(
                                                    selected === item.id
                                                        ? null
                                                        : item.id,
                                                );
                                            }}
                                        >
                                            {selected === item.id
                                                ? 'Fechar parcela'
                                                : 'Abrir parcela'}
                                        </Button>
                                        {selected === item.id && (
                                            <div className="col-span-full">
                                                <PlannedOccurrenceActions
                                                    key={`${item.id}:${item.stateVersion}`}
                                                    personId={personId}
                                                    spaceId={spaceId}
                                                    commitmentId={commitmentId}
                                                    target={{
                                                        type: 'INSTALLMENT',
                                                        installmentId: item.id,
                                                    }}
                                                    onSaved={() => {
                                                        void root.refetch();
                                                        void items.refetch();
                                                    }}
                                                />
                                            </div>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </section>
                    <Link href={`/spaces/${spaceId}/installment-commitments`}>
                        Ver parcelamentos
                    </Link>
                </>
            )}
        </section>
    );
}
