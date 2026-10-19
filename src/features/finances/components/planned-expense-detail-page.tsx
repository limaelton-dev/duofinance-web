'use client';
import Link from 'next/link';
import { apiRequest } from '@/lib/api/api-client';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { formatDate, formatMoney } from '../utils/expense-money';
import {
    PlanningBoundary,
    PlanningHeading,
    planningKey,
    QueryFeedback,
    planningStatus,
} from './planning-shared';
import { ExpenseDisbursementForm } from './expense-disbursement-form';
import { ExternalLiabilityForm } from './external-liability-form';
import styles from './expenses.module.css';
type Detail = {
    spaceId: string;
    commitment: {
        id: string;
        description: string;
        amountInCents: number;
        expectedPaymentDate: string;
    };
    status: string;
    paidAmountInCents: number;
    assumedAmountInCents?: number;
    remainingAmountInCents: number;
};
export function PlannedExpenseDetailPage({
    spaceId,
    commitmentId,
}: {
    spaceId: string;
    commitmentId: string;
}) {
    return (
        <PlanningBoundary spaceId={spaceId}>
            {(personId) => (
                <Detail
                    personId={personId}
                    spaceId={spaceId}
                    commitmentId={commitmentId}
                />
            )}
        </PlanningBoundary>
    );
}
function Detail({
    personId,
    spaceId,
    commitmentId,
}: {
    personId: string;
    spaceId: string;
    commitmentId: string;
}) {
    const context = useSpaceContextInstance(),
        query = useExpenseQuery(
            personId,
            spaceId,
            planningKey(personId, spaceId, 'planned-detail', commitmentId),
            true,
            (signal) =>
                apiRequest<Detail>(
                    `/spaces/${spaceId}/financial-commitments/${commitmentId}`,
                    { signal },
                ),
        );
    function accessLost() {
        void context.accessLost(spaceId);
    }
    const value = !query.isError ? query.data : undefined;
    return (
        <section className={styles.stack}>
            <PlanningHeading title="Despesa prevista" spaceId={spaceId} />
            <QueryFeedback query={query} />
            {value && (
                <>
                    <div className={styles.receipt}>
                        <h2>{value.commitment.description}</h2>
                        <p className={styles.amount}>
                            {formatMoney(value.commitment.amountInCents)}
                        </p>
                        <p>
                            Previsão:{' '}
                            {formatDate(value.commitment.expectedPaymentDate)}
                        </p>
                        <p>{planningStatus[value.status] ?? value.status}</p>
                        <dl>
                            <dt>Pago diretamente</dt>
                            <dd>{formatMoney(value.paidAmountInCents)}</dd>
                            <dt>Assumido no cartão</dt>
                            <dd>
                                {formatMoney(value.assumedAmountInCents ?? 0)}
                            </dd>
                            <dt>Ainda não realizado</dt>
                            <dd>{formatMoney(value.remainingAmountInCents)}</dd>
                        </dl>
                        <Link
                            href={`/spaces/${spaceId}/finances/commitments/${commitmentId}`}
                        >
                            Histórico e correções
                        </Link>
                    </div>
                    {value.remainingAmountInCents > 0 && (
                        <>
                            <ExpenseDisbursementForm
                                personId={personId}
                                spaceId={spaceId}
                                commitmentId={commitmentId}
                                onAccessLost={accessLost}
                            />
                            <ExternalLiabilityForm
                                personId={personId}
                                spaceId={spaceId}
                                commitmentId={commitmentId}
                                onAccessLost={accessLost}
                            />
                        </>
                    )}
                    <Link href={`/spaces/${spaceId}/finances/planning`}>
                        Ver planejamento
                    </Link>
                </>
            )}
        </section>
    );
}
