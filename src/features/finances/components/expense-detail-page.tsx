'use client';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { ApiError } from '@/lib/api/api-error';
import styles from './expenses.module.css';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { getExpenseDetail } from '@/lib/api/shared-expense';
import { ExpenseSummary } from './expense-summary';
import { settlementReturnPath } from '../utils/settlement-return';
import { PersonalExpenseDetailPage } from './personal-expense-detail-page';
import { ExternalLiabilityForm } from './external-liability-form';
import { ExpenseDisbursementForm } from './expense-disbursement-form';
import { ExpensePaymentHistory } from './expense-payment-history';
import { ObligationHistory } from './obligation-history';
import { ExternalLiabilityHistory } from './external-liability-history';
export function ExpenseDetailPage({
    spaceId,
    commitmentId,
    returnCycle,
}: {
    spaceId: string;
    commitmentId: string;
    returnCycle?: string;
}) {
    const auth = useAuthenticatedContext({ enabled: false }),
        space = useSpaceContext();
    if (
        !auth.data ||
        space.phase !== 'ready' ||
        space.activeSpaceId !== spaceId
    )
        return null;
    if (space.currentSpace?.type === 'PERSONAL')
        return (
            <PersonalExpenseDetailPage
                key={`${auth.data.person.id}:${spaceId}:${space.generation}:${commitmentId}`}
                personId={auth.data.person.id}
                spaceId={spaceId}
                commitmentId={commitmentId}
            />
        );
    return (
        <Detail
            key={`${auth.data.person.id}:${spaceId}:${space.generation}:${commitmentId}`}
            personId={auth.data.person.id}
            spaceId={spaceId}
            commitmentId={commitmentId}
            returnCycle={returnCycle}
        />
    );
}
function Detail({
    personId,
    spaceId,
    commitmentId,
    returnCycle,
}: {
    personId: string;
    spaceId: string;
    commitmentId: string;
    returnCycle?: string;
}) {
    const context = useSpaceContextInstance(),
        router = useRouter();
    const mounted = useRef(false);
    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);
    const query = useExpenseQuery(
        personId,
        spaceId,
        ['finances', personId, spaceId, 'financial-commitment', commitmentId],
        true,
        (signal) => getExpenseDetail(spaceId, commitmentId, signal),
    );
    function accessLost() {
        const capture = context.capture();
        if (!capture || capture.spaceId !== spaceId) return;
        const request = context.accessLost(spaceId),
            generation = context.getSnapshot().generation;
        void request.then((success) => {
            if (
                success &&
                mounted.current &&
                context.getSnapshot().generation === generation &&
                window.location.pathname ===
                    `/spaces/${spaceId}/expenses/${commitmentId}`
            )
                router.replace(
                    `/spaces/${context.getSnapshot().activeSpaceId}`,
                );
        });
    }
    useEffect(() => {
        if (
            query.error instanceof ApiError &&
            query.error.code === 'SPACE_NOT_FOUND'
        )
            accessLost();
    });
    return (
        <section className={styles.stack}>
            <h1>Despesa</h1>
            {query.isPending && <p role="status">Carregando despesa…</p>}
            {query.isError && (
                <>
                    <p role="alert">Não foi possível consultar esta despesa.</p>
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => void query.refetch()}
                    >
                        Tentar novamente a despesa
                    </Button>
                </>
            )}
            {query.data && !query.isError && (
                <>
                    <ExpenseSummary
                        value={query.data}
                        members={query.data.members}
                        personId={personId}
                    />

                    <p>
                        Registrada em:{' '}
                        {new Intl.DateTimeFormat('pt-BR', {
                            timeZone: 'America/Sao_Paulo',
                            dateStyle: 'short',
                            timeStyle: 'short',
                        }).format(new Date(query.data.commitment.registeredAt))}
                    </p>
                    <p>
                        Regra no registro:{' '}
                        {query.data.commitment.settlementRuleSnapshot
                            ? `dia ${query.data.commitment.settlementRuleSnapshot.dayOfMonth}`
                            : 'Sem regra padrão'}
                    </p>
                    <details className={styles.details}>
                        <summary>Identificação do registro</summary>
                        <p>Registro: {query.data.commitment.id}</p>
                        {query.data.disbursements[0] && (
                            <p>Desembolso: {query.data.disbursements[0].id}</p>
                        )}
                    </details>
                    <ExpensePaymentHistory
                        value={query.data}
                        personId={personId}
                        members={query.data.members}
                    />
                    <ObligationHistory
                        spaceId={spaceId}
                        obligations={query.data.obligations}
                        members={query.data.members}
                    />
                    <ExternalLiabilityHistory
                        value={query.data}
                        personId={personId}
                        members={query.data.members}
                        onAccessLost={accessLost}
                    />
                    {query.data.remainingAmountInCents > 0 && (
                        <ExternalLiabilityForm
                            personId={personId}
                            spaceId={spaceId}
                            commitmentId={commitmentId}
                            onAccessLost={accessLost}
                        />
                    )}
                    {query.data.remainingAmountInCents > 0 && (
                        <ExpenseDisbursementForm
                            personId={personId}
                            spaceId={spaceId}
                            commitmentId={commitmentId}
                            onAccessLost={accessLost}
                        />
                    )}
                </>
            )}
            <Link href={`/spaces/${spaceId}`}>Voltar ao espaço</Link>
            <p>
                {query.data &&
                    !query.isFetching &&
                    !query.isError &&
                    returnCycle === query.data.settlementCycle?.id &&
                    settlementReturnPath(spaceId, returnCycle) && (
                        <Link
                            href={settlementReturnPath(spaceId, returnCycle)!}
                        >
                            Voltar ao acerto
                        </Link>
                    )}
            </p>
            <p>
                <Link href={`/spaces/${spaceId}/finances`}>
                    Voltar às Finanças
                </Link>
            </p>
        </section>
    );
}
