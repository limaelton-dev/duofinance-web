'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useSpaceQuery } from '@/features/spaces/hooks/use-space-query';
import { QueryFeedback } from '@/features/spaces/components/space-operation-shared';
import {
    getRoutineContext,
    getRoutineHistory,
    taskHref,
} from '@/lib/api/routine';
import type {
    Deadline,
    Participant,
    RoutineContext,
    RoutineEvent,
    TaskItem,
    TaskRecurrence,
    Urgency,
} from '../types/routine';
import styles from './routine.module.css';

export const routineKey = (
    personId: string,
    spaceId: string,
    ...parts: unknown[]
) => ['routine', personId, spaceId, ...parts] as const;
export const urgencyLabels: Record<Urgency, string> = {
    LOW: 'Baixa',
    NORMAL: 'Normal',
    HIGH: 'Alta',
    URGENT: 'Urgente',
};
export const statusLabels = {
    PENDING: 'Pendente',
    COMPLETED: 'Concluída',
    CANCELLED: 'Cancelada',
    SKIPPED: 'Ignorada',
    ACTIVE: 'Ativa',
};
export function dateLabel(date: string) {
    return date.split('-').reverse().join('/');
}
export function instantLabel(value: string) {
    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
    }).format(new Date(value));
}
export function deadlineLabel(deadline: Deadline) {
    return deadline
        ? `${dateLabel(deadline.date)}${deadline.time ? ` às ${deadline.time}` : ' · sem horário'}`
        : 'Sem prazo';
}
export function participantLabel(
    participant: Participant | null | undefined,
    context?: RoutineContext,
) {
    return participant
        ? (context?.participants.find(
              (p) => p.personId === participant.personId,
          )?.displayName ?? 'Participante anterior')
        : 'Sem responsável';
}
export function recurrenceLabel(recurrence: Pick<TaskRecurrence, 'rule'>) {
    const days = [
            'segunda-feira',
            'terça-feira',
            'quarta-feira',
            'quinta-feira',
            'sexta-feira',
            'sábado',
            'domingo',
        ],
        r = recurrence.rule;
    switch (r.frequency) {
        case 'DAILY':
            return 'Todos os dias';
        case 'WEEKLY':
            return `Toda ${days[r.weekday - 1]}`;
        case 'WEEKDAYS':
            return r.weekdays.map((d) => days[d - 1]).join(', ');
        case 'MONTHLY':
            return `Todo mês, dia ${r.day}`;
        case 'ANNUAL':
            return `Todo ano, dia ${r.day} do mês ${r.month}`;
    }
}
export function useRoutineContext(personId: string, spaceId: string) {
    return useSpaceQuery(
        personId,
        spaceId,
        routineKey(personId, spaceId, 'context'),
        true,
        (signal) => getRoutineContext(spaceId, signal),
    );
}
export function RoutineHeading({
    spaceId,
    title,
    children,
}: {
    spaceId: string;
    title: string;
    children?: React.ReactNode;
}) {
    return (
        <header className={styles.heading}>
            <Link href={`/spaces/${spaceId}/routine`}>Voltar à rotina</Link>
            <h1>{title}</h1>
            {children && <p className={styles.help}>{children}</p>}
        </header>
    );
}
export function ReadOnlyNotice({ context }: { context?: RoutineContext }) {
    return context && context.status !== 'ACTIVE' ? (
        <p className={styles.notice}>
            Este espaço está{' '}
            {context.status === 'CLOSING' ? 'em encerramento' : 'encerrado'}. A
            rotina permanece disponível para consulta.
        </p>
    ) : null;
}
export function useCursor() {
    const [cursors, setCursors] = useState<(string | null)[]>([null]);
    return {
        cursor: cursors.at(-1)!,
        previous: cursors.length > 1,
        back: () => setCursors((v) => v.slice(0, -1)),
        next: (cursor: string) => setCursors((v) => [...v, cursor]),
        reset: () => setCursors([null]),
    };
}
export function Pagination({
    page,
    nextCursor,
    busy,
}: {
    page: ReturnType<typeof useCursor>;
    nextCursor?: string | null;
    busy: boolean;
}) {
    return (
        (page.previous || nextCursor) && (
            <nav aria-label="Páginas da consulta" className={styles.actions}>
                <Button
                    variant="outline"
                    disabled={busy || !page.previous}
                    onClick={page.back}
                >
                    Página anterior
                </Button>
                <Button
                    variant="outline"
                    disabled={busy || !nextCursor}
                    onClick={() => nextCursor && page.next(nextCursor)}
                >
                    Próxima página
                </Button>
            </nav>
        )
    );
}
export function TaskRows({
    spaceId,
    items,
    context,
}: {
    spaceId: string;
    items: TaskItem[];
    context?: RoutineContext;
}) {
    return (
        <ul className={styles.list}>
            {items.map((task) => (
                <li
                    className={styles.row}
                    key={
                        task.kind === 'OCCURRENCE'
                            ? `${task.recurrenceId}/${task.scheduledDate}`
                            : task.id
                    }
                >
                    <h3>
                        <Link href={taskHref(spaceId, task)}>
                            {task.description}
                        </Link>
                    </h3>
                    <div className={styles.meta}>
                        <span>{statusLabels[task.status]}</span>
                        <span>{deadlineLabel(task.deadline)}</span>
                        <span>
                            Urgência {urgencyLabels[task.urgency].toLowerCase()}
                        </span>
                    </div>
                    <div className={styles.meta}>
                        <span>{participantLabel(task.assignee, context)}</span>
                        {task.conditions?.overdue && <span>Atrasada</span>}
                        {task.kind === 'OCCURRENCE' && (
                            <span>
                                Recorrente · {dateLabel(task.scheduledDate!)}
                            </span>
                        )}
                    </div>
                </li>
            ))}
        </ul>
    );
}
const eventLabels: Record<string, string> = {
    CREATED: 'Tarefa criada',
    ASSIGNED: 'Responsável alterado',
    COMPLETED: 'Tarefa concluída',
    REOPENED: 'Tarefa reaberta',
    DEADLINE_CHANGED: 'Prazo alterado',
    URGENCY_CHANGED: 'Urgência alterada',
    CANCELLED: 'Tarefa cancelada',
    RECURRENCE_CREATED: 'Recorrência criada',
    RECURRENCE_CANCELLED: 'Recorrência cancelada',
    SKIPPED: 'Ocorrência ignorada',
    SHOPPING_LIST_LINKED: 'Lista vinculada',
    SHOPPING_LIST_UNLINKED: 'Lista desvinculada',
};
function eventDetail(event: RoutineEvent, context?: RoutineContext) {
    const { before, after } = event.data;
    if (event.type === 'ASSIGNED')
        return `${participantLabel(before as Participant | null, context)} → ${participantLabel(after as Participant | null, context)}`;
    if (event.type === 'DEADLINE_CHANGED')
        return `${deadlineLabel(before as Deadline)} → ${deadlineLabel(after as Deadline)}`;
    if (event.type === 'URGENCY_CHANGED')
        return `${urgencyLabels[before as Urgency]} → ${urgencyLabels[after as Urgency]}`;
    if (
        event.type === 'RECURRENCE_CANCELLED' &&
        typeof event.data.cancelledOn === 'string'
    )
        return `Sem novas ocorrências após ${dateLabel(event.data.cancelledOn)}. O histórico foi preservado.`;
    if (event.type === 'COMPLETED' || event.type === 'REOPENED') {
        const completion = (
            event.type === 'COMPLETED' ? after : before
        ) as TaskItem['completion'];
        return completion
            ? `Execução por ${participantLabel(completion.executor, context)}, em ${instantLabel(completion.completedAt)}. Responsável naquele momento: ${participantLabel(completion.assignee, context)}.`
            : null;
    }
    return null;
}
export function RoutineHistory({
    personId,
    spaceId,
    path,
    context,
}: {
    personId: string;
    spaceId: string;
    path: string;
    context?: RoutineContext;
}) {
    const page = useCursor();
    const query = useSpaceQuery(
        personId,
        spaceId,
        routineKey(personId, spaceId, path, 'history', page.cursor),
        true,
        (signal) => getRoutineHistory(spaceId, path, page.cursor, signal),
    );
    return (
        <section className={styles.section}>
            <h2>Histórico</h2>
            <QueryFeedback query={query} />
            {query.data && (
                <>
                    {!query.data.items.length ? (
                        <p className={styles.help}>
                            Nenhum fato registrado nesta consulta.
                        </p>
                    ) : (
                        <ol className={styles.list}>
                            {query.data.items.map((event) => (
                                <li className={styles.row} key={event.id}>
                                    <h3>
                                        {eventLabels[event.type] ??
                                            'Alteração registrada'}
                                    </h3>
                                    <p className={styles.help}>
                                        {context?.participants.find(
                                            (p) => p.personId === event.actorId,
                                        )?.displayName ??
                                            'Participante anterior'}{' '}
                                        · {instantLabel(event.registeredAt)}
                                    </p>
                                    {eventDetail(event, context) && (
                                        <p>{eventDetail(event, context)}</p>
                                    )}
                                </li>
                            ))}
                        </ol>
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
