'use client';
import Link from 'next/link';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { ApiError } from '@/lib/api/api-error';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { getExpenseDetail } from '@/lib/api/shared-expense';
import { ExpenseSummary } from './expense-summary';
import { formatDate } from '../utils/expense-money';
export function ExpenseDetailPage({
    spaceId,
    commitmentId,
}: {
    spaceId: string;
    commitmentId: string;
}) {
    const auth = useAuthenticatedContext({ enabled: false }),
        space = useSpaceContext();
    if (
        !auth.data ||
        space.phase !== 'ready' ||
        space.activeSpaceId !== spaceId
    )
        return null;
    return (
        <Detail
            key={`${auth.data.person.id}:${spaceId}:${space.generation}:${commitmentId}`}
            personId={auth.data.person.id}
            spaceId={spaceId}
            commitmentId={commitmentId}
        />
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
        router = useRouter();
    const query = useExpenseQuery(
        personId,
        spaceId,
        ['finances', personId, spaceId, 'financial-commitment', commitmentId],
        true,
        (signal) => getExpenseDetail(spaceId, commitmentId, signal),
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
    return (
        <section>
            <h1>Despesa</h1>
            {query.isPending && <p role="status">Carregando despesa…</p>}
            {query.isError && (
                <>
                    <p role="alert">Não foi possível consultar esta despesa.</p>
                    <button type="button" onClick={() => void query.refetch()}>
                        Tentar novamente a despesa
                    </button>
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
                        Data do pagamento:{' '}
                        {formatDate(query.data.commitment.factDate)}
                    </p>
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
                    <p>Registro: {query.data.commitment.id}</p>
                    <p>Desembolso: {query.data.disbursement.id}</p>
                    {query.data.obligation && (
                        <p>
                            Pendência: {query.data.obligation.id} ·{' '}
                            {{
                                OPEN: 'Aberta',
                                PARTIALLY_SETTLED: 'Parcialmente acertada',
                                SETTLED: 'Acertada',
                                WAIVED: 'Dispensada',
                            }[query.data.obligation.status] ??
                                'Estado atualizado'}
                        </p>
                    )}
                </>
            )}
            <Link href={`/spaces/${spaceId}`}>Voltar ao espaço</Link>
        </section>
    );
}
