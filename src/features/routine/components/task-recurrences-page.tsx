'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    SpaceBoundary,
    QueryFeedback,
    CommandFeedback,
} from '@/features/spaces/components/space-operation-shared';
import { useSpaceQuery } from '@/features/spaces/hooks/use-space-query';
import { useSpaceOperation } from '@/features/spaces/hooks/use-space-operation';
import { useSpaceLeaveGuard } from '@/features/spaces/hooks/use-space-leave-guard';
import {
    getTaskRecurrences,
    getTaskRecurrence,
    getTaskOccurrences,
    routineRequest,
} from '@/lib/api/routine';
import type { TaskRecurrence } from '../types/routine';
import {
    Pagination,
    ReadOnlyNotice,
    RoutineHeading,
    RoutineHistory,
    TaskRows,
    dateLabel,
    participantLabel,
    recurrenceLabel,
    routineKey,
    statusLabels,
    urgencyLabels,
    useCursor,
    useRoutineContext,
} from './routine-shared';
import styles from './routine.module.css';

export function TaskRecurrencesPage({ spaceId }: { spaceId: string }) {
    return (
        <SpaceBoundary spaceId={spaceId}>
            {(personId) => (
                <RecurrencesContent spaceId={spaceId} personId={personId} />
            )}
        </SpaceBoundary>
    );
}
function RecurrencesContent({
    spaceId,
    personId,
}: {
    spaceId: string;
    personId: string;
}) {
    const page = useCursor(),
        context = useRoutineContext(personId, spaceId),
        query = useSpaceQuery(
            personId,
            spaceId,
            routineKey(personId, spaceId, 'recurrences', page.cursor),
            true,
            (signal) => getTaskRecurrences(spaceId, page.cursor, signal),
        );
    return (
        <div className={styles.page}>
            <RoutineHeading spaceId={spaceId} title="Tarefas recorrentes">
                Regras que repetem tarefas, com acompanhamento por ocorrência.
            </RoutineHeading>
            <QueryFeedback query={context} />
            <ReadOnlyNotice context={context.data} />
            {context.data?.status === 'ACTIVE' && (
                <div className={styles.actions}>
                    <Button asChild>
                        <Link
                            href={`/spaces/${spaceId}/routine/recurrences/new`}
                        >
                            Nova recorrência
                        </Link>
                    </Button>
                </div>
            )}
            <QueryFeedback query={query} />
            {query.data && (
                <>
                    {query.data.items.length ? (
                        <ul className={styles.list}>
                            {query.data.items.map((r) => (
                                <li key={r.id} className={styles.row}>
                                    <h2>
                                        <Link
                                            href={`/spaces/${spaceId}/routine/recurrences/${r.id}`}
                                        >
                                            {r.description}
                                        </Link>
                                    </h2>
                                    <p className={styles.help}>
                                        {recurrenceLabel(r)} ·{' '}
                                        {statusLabels[r.status]}
                                    </p>
                                    <p className={styles.help}>
                                        {participantLabel(
                                            r.assignee,
                                            context.data,
                                        )}{' '}
                                        · Início {dateLabel(r.startsOn)}
                                        {r.endsOn
                                            ? ` · Fim ${dateLabel(r.endsOn)}`
                                            : ''}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className={styles.notice}>
                            Ainda não há regras de tarefas recorrentes neste
                            espaço.
                        </p>
                    )}
                    <Pagination
                        page={page}
                        nextCursor={query.data.nextCursor}
                        busy={query.isFetching}
                    />
                </>
            )}
        </div>
    );
}
export function TaskRecurrencePage({
    spaceId,
    recurrenceId,
}: {
    spaceId: string;
    recurrenceId: string;
}) {
    return (
        <SpaceBoundary spaceId={spaceId}>
            {(personId) => (
                <RecurrenceContent
                    spaceId={spaceId}
                    personId={personId}
                    id={recurrenceId}
                />
            )}
        </SpaceBoundary>
    );
}
function RecurrenceContent({
    spaceId,
    personId,
    id,
}: {
    spaceId: string;
    personId: string;
    id: string;
}) {
    const context = useRoutineContext(personId, spaceId),
        query = useSpaceQuery(
            personId,
            spaceId,
            routineKey(personId, spaceId, 'recurrence', id),
            true,
            (signal) => getTaskRecurrence(spaceId, id, signal),
        ),
        r = query.data;
    const [confirm, setConfirm] = useState(false),
        [saved, setSaved] = useState(false);
    const command = useSpaceOperation<
        { expectedVersion: number },
        TaskRecurrence
    >({
        execute: (space, input, token, key, signal) =>
            routineRequest(
                space,
                `task-recurrences/${id}/cancel`,
                input,
                token,
                key,
                signal,
            ),
        onSuccess: () => {
            setConfirm(false);
            setSaved(true);
            void query.refetch();
        },
        onConflict: () => {
            setConfirm(false);
            void query.refetch();
            void context.refetch();
        },
    });
    const busy = command.isPending || command.canRetry;
    useSpaceLeaveGuard(confirm, busy, () => setConfirm(false));
    return (
        <div className={styles.page}>
            <RoutineHeading spaceId={spaceId} title="Detalhe da recorrência" />
            <QueryFeedback query={context} />
            <QueryFeedback query={query} />
            <ReadOnlyNotice context={context.data} />
            {saved && (
                <p role="status">
                    Recorrência cancelada. O histórico foi preservado.
                </p>
            )}
            {r && (
                <>
                    <section className={styles.section}>
                        <h2>{r.description}</h2>
                        <dl className={styles.details}>
                            <div>
                                <dt>Situação</dt>
                                <dd>{statusLabels[r.status]}</dd>
                            </div>
                            <div>
                                <dt>Repetição</dt>
                                <dd>{recurrenceLabel(r)}</dd>
                            </div>
                            <div>
                                <dt>Vigência</dt>
                                <dd>
                                    {dateLabel(r.startsOn)}
                                    {r.endsOn
                                        ? ` até ${dateLabel(r.endsOn)}`
                                        : '; sem fim definido'}
                                </dd>
                            </div>
                            <div>
                                <dt>Responsável</dt>
                                <dd>
                                    {participantLabel(r.assignee, context.data)}
                                </dd>
                            </div>
                            <div>
                                <dt>Urgência</dt>
                                <dd>{urgencyLabels[r.urgency]}</dd>
                            </div>
                            <div>
                                <dt>Prazo padrão</dt>
                                <dd>
                                    {r.deadline
                                        ? `Na data da ocorrência${r.deadline.time ? ` às ${r.deadline.time}` : ', sem horário'}`
                                        : 'Sem prazo'}
                                </dd>
                            </div>
                            {r.cancelledOn && (
                                <div>
                                    <dt>Corte do cancelamento</dt>
                                    <dd>{dateLabel(r.cancelledOn)}</dd>
                                </div>
                            )}
                        </dl>
                        <p className={styles.help}>
                            Para mudar a regra, cancele esta recorrência e crie
                            outra. Cada ocorrência preserva seu histórico.
                        </p>
                        {context.data?.status === 'ACTIVE' &&
                            r.status === 'ACTIVE' && (
                                <>
                                    <CommandFeedback command={command} />
                                    {!confirm ? (
                                        <div className={styles.actions}>
                                            <Button
                                                variant="outline"
                                                disabled={
                                                    busy ||
                                                    query.isFetching ||
                                                    query.isError ||
                                                    context.isFetching ||
                                                    context.isError
                                                }
                                                onClick={() => setConfirm(true)}
                                            >
                                                Cancelar recorrência
                                            </Button>
                                        </div>
                                    ) : (
                                        <div
                                            className={styles.notice}
                                            aria-label="Confirmar cancelamento da recorrência"
                                        >
                                            <h3>Encerrar a repetição</h3>
                                            <p
                                                className={`${styles.help} mt-3`}
                                            >
                                                Não haverá novas ocorrências
                                                após a data de hoje em São
                                                Paulo. Ocorrências anteriores e
                                                registros já materializados
                                                permanecem disponíveis.
                                            </p>
                                            <div
                                                className={`${styles.actions} mt-4`}
                                            >
                                                <Button
                                                    variant="destructive"
                                                    disabled={
                                                        busy ||
                                                        query.isFetching ||
                                                        query.isError ||
                                                        context.isFetching ||
                                                        context.isError
                                                    }
                                                    onClick={() =>
                                                        command.submit({
                                                            expectedVersion:
                                                                r.version,
                                                        })
                                                    }
                                                >
                                                    Confirmar cancelamento
                                                </Button>
                                                <Button
                                                    variant="outline"
                                                    disabled={busy}
                                                    onClick={() =>
                                                        setConfirm(false)
                                                    }
                                                >
                                                    Voltar
                                                </Button>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                    </section>
                    <Occurrences
                        key={id}
                        spaceId={spaceId}
                        personId={personId}
                        id={id}
                    />
                    <RoutineHistory
                        spaceId={spaceId}
                        personId={personId}
                        path={`task-recurrences/${id}`}
                        context={context.data}
                    />
                </>
            )}
        </div>
    );
}
function Occurrences({
    spaceId,
    personId,
    id,
}: {
    spaceId: string;
    personId: string;
    id: string;
}) {
    const page = useCursor(),
        context = useRoutineContext(personId, spaceId),
        [from, setFrom] = useState(''),
        [to, setTo] = useState('');
    const params = new URLSearchParams({
            limit: '20',
            ...(from ? { from } : {}),
            ...(to ? { to } : {}),
            ...(page.cursor ? { cursor: page.cursor } : {}),
        }).toString(),
        invalid =
            !!from &&
            !!to &&
            (from > to || (Date.parse(to) - Date.parse(from)) / 86400000 > 365);
    const query = useSpaceQuery(
        personId,
        spaceId,
        routineKey(personId, spaceId, 'occurrences', id, params),
        !invalid,
        (signal) => getTaskOccurrences(spaceId, id, params, signal),
    );
    return (
        <section className={styles.section}>
            <h2>Ocorrências</h2>
            <div className={styles.filters}>
                <label>
                    Período de
                    <Input
                        type="date"
                        value={from}
                        onChange={(e) => {
                            page.reset();
                            setFrom(e.target.value);
                        }}
                    />
                </label>
                <label>
                    Até
                    <Input
                        type="date"
                        min={from}
                        value={to}
                        onChange={(e) => {
                            page.reset();
                            setTo(e.target.value);
                        }}
                    />
                </label>
            </div>
            <p className={styles.help}>
                Cada consulta cobre até 366 dias. Sem período, mostramos a
                janela a partir de hoje. A consulta não cria registros.
            </p>
            {invalid && (
                <p role="alert">
                    Informe um período de até 366 dias, com fim igual ou
                    posterior ao início.
                </p>
            )}
            <QueryFeedback query={query} />
            {query.data && !invalid && (
                <>
                    <p className={styles.help}>
                        {dateLabel(query.data.window.from)} a{' '}
                        {dateLabel(query.data.window.to)}
                    </p>
                    {query.data.items.length ? (
                        <TaskRows
                            spaceId={spaceId}
                            items={query.data.items}
                            context={context.data}
                        />
                    ) : (
                        <p className={styles.notice}>
                            Nenhuma ocorrência neste período.
                        </p>
                    )}
                    <Pagination
                        page={page}
                        nextCursor={query.data.nextCursor}
                        busy={query.isFetching}
                    />
                </>
            )}
        </section>
    );
}
