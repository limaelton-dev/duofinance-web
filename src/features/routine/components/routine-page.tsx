'use client';
import { useUrlPreferences } from '@/components/patterns/use-url-preferences';
import { civilDate } from '@/lib/civil-date';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    SpaceBoundary,
    QueryFeedback,
} from '@/features/spaces/components/space-operation-shared';
import { useSpaceQuery } from '@/features/spaces/hooks/use-space-query';
import { getTasks } from '@/lib/api/routine';
import {
    Pagination,
    ReadOnlyNotice,
    TaskRows,
    dateLabel,
    routineKey,
    useCursor,
    useRoutineContext,
} from './routine-shared';
import styles from './routine.module.css';

export function RoutinePage({ spaceId }: { spaceId: string }) {
    return (
        <SpaceBoundary spaceId={spaceId}>
            {(personId) => (
                <RoutineContent spaceId={spaceId} personId={personId} />
            )}
        </SpaceBoundary>
    );
}
function RoutineContent({
    spaceId,
    personId,
}: {
    spaceId: string;
    personId: string;
}) {
    const context = useRoutineContext(personId, spaceId),
        page = useCursor();
    const [filters, setFilters] = useUrlPreferences(
        { scope: 'ALL', status: 'PENDING', attention: '', from: '', to: '' },
        {
            scope: (value) => ['ALL', 'MINE'].includes(value),
            status: (value) =>
                [
                    'PENDING',
                    'COMPLETED',
                    'CANCELLED',
                    'SKIPPED',
                    'ALL',
                ].includes(value),
            attention: (value) =>
                [
                    '',
                    'OVERDUE',
                    'TODAY',
                    'URGENT',
                    'UPCOMING',
                    'NO_DEADLINE',
                ].includes(value),
            from: (value) =>
                value === '' || (value.length === 10 && !!civilDate(value)),
            to: (value) =>
                value === '' || (value.length === 10 && !!civilDate(value)),
        },
    );
    const { scope, status, attention, from, to } = filters;
    const queryText = new URLSearchParams({
        scope,
        status,
        limit: '20',
        ...(attention ? { attention } : {}),
        ...(from ? { from } : {}),
        ...(to ? { to } : {}),
        ...(page.cursor ? { cursor: page.cursor } : {}),
    }).toString();
    const invalidPeriod =
        !!from &&
        !!to &&
        (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 365);
    const query = useSpaceQuery(
        personId,
        spaceId,
        routineKey(personId, spaceId, 'list', queryText),
        !invalidPeriod,
        (signal) => getTasks(spaceId, queryText, signal),
    );
    function change(key: keyof typeof filters, value: string) {
        page.reset();
        setFilters({ [key]: value });
    }
    return (
        <div className={styles.page}>
            <header className={styles.heading}>
                <h1>Rotina</h1>
                <p className={styles.help}>
                    O que precisa ser feito, com prazo e responsabilidade
                    claros.
                </p>
                <div className={styles.actions}>
                    {context.data?.status === 'ACTIVE' && (
                        <Button asChild>
                            <Link href={`/spaces/${spaceId}/routine/new`}>
                                Nova tarefa
                            </Link>
                        </Button>
                    )}
                    <Button variant="outline" asChild>
                        <Link href={`/spaces/${spaceId}/routine/recurrences`}>
                            Recorrências
                        </Link>
                    </Button>
                </div>
            </header>
            <QueryFeedback query={context} />
            <ReadOnlyNotice context={context.data} />
            <section className={styles.section} aria-label="Consultar tarefas">
                <h2>Tarefas</h2>
                {query.data && !invalidPeriod && (
                    <p className={styles.help}>
                        {query.data.counts.overdue} atrasada(s) ·{' '}
                        {query.data.counts.today} para hoje ·{' '}
                        {query.data.counts.urgent} urgente(s). Uma tarefa pode
                        atender a mais de um filtro.
                    </p>
                )}
                <div className={styles.filters}>
                    <label>
                        Responsabilidade
                        <select
                            value={scope}
                            onChange={(e) => change('scope', e.target.value)}
                        >
                            <option value="ALL">Todas</option>
                            <option value="MINE">Minhas</option>
                        </select>
                    </label>
                    <label>
                        Situação
                        <select
                            value={status}
                            onChange={(e) => change('status', e.target.value)}
                        >
                            <option value="PENDING">Pendentes</option>
                            <option value="COMPLETED">Concluídas</option>
                            <option value="CANCELLED">Canceladas</option>
                            <option value="SKIPPED">Ignoradas</option>
                            <option value="ALL">Todas as situações</option>
                        </select>
                    </label>
                    <label>
                        Atenção
                        <select
                            value={attention}
                            onChange={(e) =>
                                change('attention', e.target.value)
                            }
                        >
                            <option value="">Todos os prazos</option>
                            <option value="OVERDUE">Atrasadas</option>
                            <option value="TODAY">Hoje</option>
                            <option value="URGENT">Urgentes</option>
                            <option value="UPCOMING">Próximas</option>
                            <option value="NO_DEADLINE">Sem prazo</option>
                        </select>
                    </label>
                </div>
                <details className={styles.period}>
                    <summary>Consultar por período</summary>
                    <div className={styles.filters}>
                        <label>
                            De
                            <Input
                                type="date"
                                value={from}
                                onChange={(e) => change('from', e.target.value)}
                            />
                        </label>
                        <label>
                            Até
                            <Input
                                type="date"
                                min={from}
                                value={to}
                                onChange={(e) => change('to', e.target.value)}
                            />
                        </label>
                    </div>
                    <p className={styles.help}>
                        Até 366 dias por consulta. Use o período para consultar
                        ocorrências futuras sem prazo.
                    </p>
                </details>
                {invalidPeriod && (
                    <p role="alert">
                        Informe um período de até 366 dias, com fim igual ou
                        posterior ao início.
                    </p>
                )}
                <QueryFeedback query={query} />
                {query.data && !invalidPeriod && (
                    <>
                        <p className={styles.help}>
                            {query.data.counts.totalCount} tarefa(s) ·
                            referência: {dateLabel(query.data.referenceDate)}.
                            Ordem: atrasadas, hoje, próximas e sem prazo.
                        </p>
                        {query.data.items.length ? (
                            <TaskRows
                                spaceId={spaceId}
                                items={query.data.items}
                                context={context.data}
                            />
                        ) : (
                            <div className={styles.notice}>
                                <h2>Nenhuma tarefa nesta consulta</h2>
                                <p className={styles.help}>
                                    Mude os filtros ou registre o que precisa
                                    ser feito.
                                </p>
                            </div>
                        )}
                        <Pagination
                            page={page}
                            nextCursor={query.data.nextCursor}
                            busy={query.isFetching}
                        />
                    </>
                )}
            </section>
        </div>
    );
}
