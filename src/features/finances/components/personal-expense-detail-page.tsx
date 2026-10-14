'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { getPersonalExpenseDetail } from '@/lib/api/personal-expense';
import { ApiError } from '@/lib/api/api-error';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { personalExpenseQueryKeys } from '../cache/personal-expense-query-keys';
import { PersonalExpenseSummary } from './personal-expense-summary';
import styles from './expenses.module.css';

export function PersonalExpenseDetailPage({
    personId,
    spaceId,
    commitmentId,
}: {
    personId: string;
    spaceId: string;
    commitmentId: string;
}) {
    const context = useSpaceContextInstance(),
        router = useRouter();
    const query = useExpenseQuery(
        personId,
        spaceId,
        personalExpenseQueryKeys.detail(personId, spaceId, commitmentId),
        true,
        (signal) => getPersonalExpenseDetail(spaceId, commitmentId, signal),
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
                    `/spaces/${spaceId}/expenses/${commitmentId}`
            )
                router.replace(
                    `/spaces/${context.getSnapshot().activeSpaceId}`,
                );
        });
        return () => {
            active = false;
        };
    }, [query.error, context, router, spaceId, commitmentId]);
    const value =
        !query.isError &&
        !query.isFetching &&
        query.data?.spaceType === 'PERSONAL'
            ? query.data
            : undefined;
    return (
        <section className={styles.stack}>
            <h1>Despesa</h1>
            {(query.isPending || query.isFetching) && (
                <p role="status" aria-busy="true">
                    Carregando despesa…
                </p>
            )}
            {query.isError && (
                <div>
                    <p role="alert">Não foi possível consultar esta despesa.</p>
                    <button type="button" onClick={() => void query.refetch()}>
                        Tentar novamente a despesa
                    </button>
                </div>
            )}
            {value && (
                <>
                    <PersonalExpenseSummary value={value} />
                    <p>
                        Registrada em:{' '}
                        <time dateTime={value.commitment.registeredAt}>
                            {new Intl.DateTimeFormat('pt-BR', {
                                timeZone: 'America/Sao_Paulo',
                                dateStyle: 'short',
                                timeStyle: 'short',
                            }).format(new Date(value.commitment.registeredAt))}
                        </time>
                    </p>
                    <p>Registro: {value.commitment.id}</p>
                    <p>Desembolso: {value.disbursement.id}</p>
                </>
            )}
            <Link href={`/spaces/${spaceId}/finances`}>Voltar às Finanças</Link>
            <Link href={`/spaces/${spaceId}`}>Voltar ao espaço</Link>
        </section>
    );
}
