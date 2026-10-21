'use client';
import { FinancialLoading } from './financial-loading';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ArrowLeft } from '@/components/ui/icons';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useSpaceContextInstance } from '@/features/spaces/context/space-context-provider';
import { getPersonalExpenseDetail } from '@/lib/api/personal-expense';
import { ApiError } from '@/lib/api/api-error';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { personalExpenseQueryKeys } from '../cache/personal-expense-query-keys';
import { PersonalExpenseSummary } from './personal-expense-summary';
import styles from './financial-records.module.css';
import { ExternalLiabilityForm } from './external-liability-form';
import { ExpenseDisbursementForm } from './expense-disbursement-form';
import { ExpensePaymentHistory } from './expense-payment-history';
import { ExternalLiabilityHistory } from './external-liability-history';
import personal from './personal-expense.module.css';

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
        personalExpenseQueryKeys.detail(personId, spaceId, commitmentId),
        true,
        (signal) => getPersonalExpenseDetail(spaceId, commitmentId, signal),
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
    const value =
        !query.isError && query.data?.spaceType === 'PERSONAL'
            ? query.data
            : undefined;
    return (
        <section className={`${styles.stack} ${personal.detail}`}>
            <Link
                className={personal.back}
                href={`/spaces/${spaceId}/finances`}
            >
                <ArrowLeft size={20} aria-hidden="true" /> Voltar às Finanças
            </Link>
            <header className={personal.detailHeading}>
                <h1>Despesa</h1>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="ghost" type="button">
                            Mais opções
                        </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                            <Link
                                href={`/spaces/${spaceId}/finances/commitments/${commitmentId}`}
                            >
                                Histórico e correções
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem asChild>
                            <Link href={`/spaces/${spaceId}`}>
                                Voltar ao espaço
                            </Link>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </header>
            {(query.isPending || query.isFetching) && (
                <FinancialLoading label="Carregando despesa…" />
            )}
            {query.isError && (
                <div className={styles.feedback}>
                    <p role="alert">Não foi possível consultar esta despesa.</p>
                    <Button
                        variant="outline"
                        type="button"
                        onClick={() => void query.refetch()}
                    >
                        Tentar novamente a despesa
                    </Button>
                </div>
            )}
            {value && (
                <>
                    <PersonalExpenseSummary value={value} />
                    <ExpensePaymentHistory value={value} personId={personId} />
                    <ExternalLiabilityHistory
                        value={value}
                        personId={personId}
                        onAccessLost={accessLost}
                    />
                    {value.remainingAmountInCents > 0 && (
                        <ExternalLiabilityForm
                            personId={personId}
                            spaceId={spaceId}
                            commitmentId={commitmentId}
                            onAccessLost={accessLost}
                        />
                    )}
                    {value.remainingAmountInCents > 0 && (
                        <ExpenseDisbursementForm
                            personId={personId}
                            spaceId={spaceId}
                            commitmentId={commitmentId}
                            onAccessLost={accessLost}
                        />
                    )}
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
                    <details className={styles.details}>
                        <summary>Identificação do registro</summary>
                        <p>Registro: {value.commitment.id}</p>
                        {value.disbursements[0] && (
                            <p>Desembolso: {value.disbursements[0].id}</p>
                        )}
                    </details>
                </>
            )}
        </section>
    );
}
