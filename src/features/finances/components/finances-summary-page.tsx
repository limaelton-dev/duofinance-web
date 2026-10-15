'use client';

import Link from 'next/link';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAuthenticatedContext } from '@/features/auth/hooks/use-authenticated-context';
import { useSpaceContext } from '@/features/spaces/hooks/use-space-context';
import { getFinancialOverview } from '@/lib/api/financial-review';
import { millisecondsUntilBusinessDateChange } from '@/features/today/utils/business-date-change';
import { financesQueryKeys } from '../cache/finances-query-keys';
import { useExpenseQuery } from '../hooks/use-expense-query';
import { useFinancialReviewAccess } from '../hooks/use-financial-review-access';
import type { FinancialReviewView } from '../types/financial-review';
import { financialReferenceDate } from '../utils/financial-review';
import { FinancialOverviewSection } from './financial-overview-section';
import { FinancialTimelineSection } from './financial-timeline-section';
import { InterMemberPositionSection } from './inter-member-position-section';
import { PersonalExpenseHistoryPage } from './personal-expense-history-page';
import styles from './finances-summary.module.css';

export function FinancesSummaryPage({ spaceId }: { spaceId: string }) {
    const auth = useAuthenticatedContext({ enabled: false });
    const space = useSpaceContext();
    if (
        !auth.data ||
        space.phase !== 'ready' ||
        space.activeSpaceId !== spaceId
    )
        return null;
    return (
        <FinancialReviewPage
            key={`${auth.data.person.id}:${spaceId}:${space.generation}`}
            personId={auth.data.person.id}
            spaceId={spaceId}
            shared={space.currentSpace?.type === 'SHARED'}
        />
    );
}

function FinancialReviewPage({
    personId,
    spaceId,
    shared,
}: {
    personId: string;
    spaceId: string;
    shared: boolean;
}) {
    const [referenceDate, setReferenceDate] = useState(() =>
        financialReferenceDate(),
    );
    const [selection, setSelection] = useState({
        month: referenceDate.slice(0, 7),
        memberId: null as string | null,
    });
    const [view, setView] = useState<FinancialReviewView | 'FORECAST'>(
        'CALENDAR',
    );
    const [tab, setTab] = useState<'SUMMARY' | 'COMMITMENTS'>('SUMMARY');
    useEffect(() => {
        let timer: number;
        const update = () => {
            window.clearTimeout(timer);
            setReferenceDate(financialReferenceDate());
            timer = window.setTimeout(
                update,
                millisecondsUntilBusinessDateChange(),
            );
        };
        update();
        window.addEventListener('focus', update);
        document.addEventListener('visibilitychange', update);
        return () => {
            window.clearTimeout(timer);
            window.removeEventListener('focus', update);
            document.removeEventListener('visibilitychange', update);
        };
    }, []);
    return (
        <section className={styles.stack}>
            <h1>Finanças</h1>
            <nav className={styles.actions} aria-label="Navegação financeira">
                <button
                    type="button"
                    aria-current={tab === 'SUMMARY' ? 'page' : undefined}
                    onClick={() => setTab('SUMMARY')}
                >
                    Resumo
                </button>
                <button
                    type="button"
                    aria-current={tab === 'COMMITMENTS' ? 'page' : undefined}
                    onClick={() => setTab('COMMITMENTS')}
                >
                    Compromissos
                </button>
                {shared && (
                    <Link href={`/spaces/${spaceId}/finances/settlements`}>
                        Acertos
                    </Link>
                )}
                <Link href={`/spaces/${spaceId}/incomes`}>Receitas</Link>
                <Link href={`/spaces/${spaceId}`}>Voltar ao espaço</Link>
            </nav>
            <FinancialReviewContent
                key={referenceDate}
                personId={personId}
                spaceId={spaceId}
                shared={shared}
                referenceDate={referenceDate}
                selection={selection}
                onSelection={setSelection}
                tab={tab}
                view={view}
                onView={setView}
            />
        </section>
    );
}

type Selection = { month: string; memberId: string | null };
function FinancialReviewContent({
    personId,
    spaceId,
    shared,
    referenceDate,
    selection,
    onSelection,
    tab,
    view,
    onView,
}: {
    personId: string;
    spaceId: string;
    shared: boolean;
    referenceDate: string;
    selection: Selection;
    onSelection: (value: Selection) => void;
    tab: 'SUMMARY' | 'COMMITMENTS';
    view: FinancialReviewView | 'FORECAST';
    onView: (value: FinancialReviewView | 'FORECAST') => void;
}) {
    const space = useSpaceContext();
    const current = useRef<Selection | null>(selection);
    useLayoutEffect(() => {
        current.current = selection;
    }, [selection]);
    useEffect(
        () => () => {
            current.current = null;
        },
        [],
    );
    const overview = useExpenseQuery(
        personId,
        spaceId,
        financesQueryKeys.review(
            personId,
            spaceId,
            'OVERVIEW',
            selection.month,
            selection.memberId,
            null,
            referenceDate,
        ),
        true,
        (signal) =>
            getFinancialOverview(
                spaceId,
                selection.month,
                selection.memberId,
                signal,
            ),
        () => current.current === selection,
    );
    useFinancialReviewAccess(overview.error, spaceId);
    const value =
        !overview.isFetching && !overview.isError ? overview.data : undefined;
    return (
        <>
            <div className={styles.actions}>
                <label htmlFor="financial-month">Mês calendário</label>
                <input
                    id="financial-month"
                    type="month"
                    required
                    min="0001-01"
                    max="9999-12"
                    value={selection.month}
                    onChange={(event) => {
                        if (
                            /^(?!0000)\d{4}-(0[1-9]|1[0-2])$/.test(
                                event.target.value,
                            )
                        )
                            onSelection({
                                ...selection,
                                month: event.target.value,
                            });
                    }}
                />
                {shared && (
                    <>
                        <label htmlFor="financial-member">
                            Valores por membro
                        </label>
                        <select
                            id="financial-member"
                            value={selection.memberId ?? ''}
                            disabled={!value}
                            onChange={(event) =>
                                onSelection({
                                    ...selection,
                                    memberId: event.target.value || null,
                                })
                            }
                        >
                            <option value="">Todo o espaço</option>
                            {value?.members.map((member) => (
                                <option
                                    key={member.memberId}
                                    value={member.memberId}
                                >
                                    {member.displayName}
                                </option>
                            ))}
                        </select>
                    </>
                )}
                <button
                    type="button"
                    disabled={overview.isFetching}
                    onClick={() => void overview.refetch()}
                >
                    Atualizar resumo
                </button>
            </div>
            <p>
                O mês usa a data real de cada fato. Previsões usam a data
                prevista. O cadastro e a data-alvo de acerto têm seus próprios
                significados.
            </p>
            {(overview.isPending || overview.isFetching) && (
                <p role="status" aria-busy="true">
                    Carregando resumo financeiro…
                </p>
            )}
            {overview.isError && (
                <div>
                    <p role="alert">
                        Não foi possível consultar o resumo financeiro.
                    </p>
                    <button
                        type="button"
                        onClick={() => void overview.refetch()}
                    >
                        Tentar novamente o resumo
                    </button>
                </div>
            )}
            {tab === 'SUMMARY' ? (
                <>
                    {value && (
                        <FinancialOverviewSection
                            value={value}
                            shared={shared}
                        />
                    )}
                    <Link
                        href={`/spaces/${spaceId}/finances/external-liabilities`}
                    >
                        Obrigações externas em meu nome
                    </Link>
                    {shared ? (
                        <InterMemberPositionSection
                            personId={personId}
                            spaceId={spaceId}
                        />
                    ) : (
                        <PersonalExpenseHistoryPage
                            personId={personId}
                            spaceId={spaceId}
                            embedded
                        />
                    )}
                </>
            ) : (
                <>
                    <div className={styles.actions}>
                        {space.currentSpace?.status === 'ACTIVE' && (
                            <>
                                <Link href={`/spaces/${spaceId}/expenses/new`}>
                                    Adicionar despesa
                                </Link>
                                <Link href={`/spaces/${spaceId}/incomes/new`}>
                                    Adicionar receita
                                </Link>
                            </>
                        )}
                        <Link href={`/spaces/${spaceId}/incomes`}>
                            Histórico de receitas
                        </Link>
                    </div>
                    <FinancialTimelineSection
                        key={`${selection.month}:${selection.memberId}:${view}`}
                        personId={personId}
                        spaceId={spaceId}
                        month={selection.month}
                        memberId={selection.memberId}
                        referenceDate={referenceDate}
                        view={view}
                        onView={onView}
                    />
                </>
            )}
        </>
    );
}
