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
import { TaskShoppingLink } from '@/features/shopping/components/task-shopping-link';
import { getTask, routineRequest } from '@/lib/api/routine';
import type { TaskItem, RoutineContext, Urgency } from '../types/routine';
import {
    ReadOnlyNotice,
    RoutineHeading,
    RoutineHistory,
    dateLabel,
    deadlineLabel,
    instantLabel,
    participantLabel,
    routineKey,
    statusLabels,
    urgencyLabels,
    useRoutineContext,
} from './routine-shared';
import styles from './routine.module.css';

export function TaskDetailPage({
    spaceId,
    taskId,
    recurrenceId,
    scheduledDate,
}: {
    spaceId: string;
    taskId?: string;
    recurrenceId?: string;
    scheduledDate?: string;
}) {
    const path = recurrenceId
        ? `task-recurrences/${encodeURIComponent(recurrenceId)}/occurrences/${encodeURIComponent(scheduledDate!)}`
        : `tasks/${encodeURIComponent(taskId!)}`;
    return (
        <SpaceBoundary spaceId={spaceId}>
            {(personId) => (
                <TaskDetailContent
                    key={path}
                    spaceId={spaceId}
                    personId={personId}
                    path={path}
                />
            )}
        </SpaceBoundary>
    );
}
function TaskDetailContent({
    spaceId,
    personId,
    path,
}: {
    spaceId: string;
    personId: string;
    path: string;
}) {
    const context = useRoutineContext(personId, spaceId),
        query = useSpaceQuery(
            personId,
            spaceId,
            routineKey(personId, spaceId, 'detail', path),
            true,
            (signal) => getTask(spaceId, path, signal),
        );
    const task = query.data;
    return (
        <div className={styles.page}>
            <RoutineHeading spaceId={spaceId} title="Detalhe da tarefa" />
            <QueryFeedback query={context} />
            <QueryFeedback query={query} />
            <ReadOnlyNotice context={context.data} />
            {task && (
                <>
                    <section className={styles.section}>
                        <h2>{task.description}</h2>
                        <dl className={styles.details}>
                            <div>
                                <dt>Situação</dt>
                                <dd>{statusLabels[task.status]}</dd>
                            </div>
                            <div>
                                <dt>Responsável atual</dt>
                                <dd>
                                    {participantLabel(
                                        task.assignee,
                                        context.data,
                                    )}
                                </dd>
                            </div>
                            <div>
                                <dt>Prazo</dt>
                                <dd>
                                    {deadlineLabel(task.deadline)}
                                    {task.conditions?.overdue
                                        ? ' · Atrasada'
                                        : ''}
                                </dd>
                            </div>
                            <div>
                                <dt>Urgência</dt>
                                <dd>{urgencyLabels[task.urgency]}</dd>
                            </div>
                            <div>
                                <dt>Criada por</dt>
                                <dd>
                                    {participantLabel(
                                        task.creator,
                                        context.data,
                                    )}
                                </dd>
                            </div>
                            <div>
                                <dt>Criada em</dt>
                                <dd>{instantLabel(task.createdAt)}</dd>
                            </div>
                            {task.kind === 'OCCURRENCE' && (
                                <div>
                                    <dt>Ocorrência</dt>
                                    <dd>
                                        {dateLabel(task.scheduledDate!)} ·{' '}
                                        {task.materialized
                                            ? 'Registrada'
                                            : 'Prevista'}
                                    </dd>
                                </div>
                            )}
                            {task.completion && (
                                <>
                                    <div>
                                        <dt>Executada por</dt>
                                        <dd>
                                            {participantLabel(
                                                task.completion.executor,
                                                context.data,
                                            )}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt>Concluída em</dt>
                                        <dd>
                                            {instantLabel(
                                                task.completion.completedAt,
                                            )}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt>Responsável na conclusão</dt>
                                        <dd>
                                            {participantLabel(
                                                task.completion.assignee,
                                                context.data,
                                            )}
                                        </dd>
                                    </div>
                                </>
                            )}
                        </dl>
                        {task.kind === 'OCCURRENCE' && (
                            <Link
                                href={`/spaces/${spaceId}/routine/recurrences/${task.recurrenceId}`}
                            >
                                Ver regra da recorrência
                            </Link>
                        )}
                    </section>
                    {context.data && (
                        <TaskActions
                            task={task}
                            path={path}
                            context={context.data}
                            stale={
                                query.isFetching ||
                                query.isError ||
                                context.isFetching ||
                                context.isError
                            }
                            refresh={() => {
                                void query.refetch();
                                void context.refetch();
                            }}
                        />
                    )}
                    {task.kind !== 'OCCURRENCE' && (
                        <TaskShoppingLink
                            spaceId={spaceId}
                            personId={personId}
                            task={task}
                            onChanged={() => void query.refetch()}
                            stale={
                                query.isFetching ||
                                query.isError ||
                                context.isFetching ||
                                context.isError
                            }
                        />
                    )}
                    <RoutineHistory
                        personId={personId}
                        spaceId={spaceId}
                        path={path}
                        context={context.data}
                    />
                </>
            )}
        </div>
    );
}
type ActionInput = { action: string; body: Record<string, unknown> };
function TaskActions({
    task,
    path,
    context,
    stale,
    refresh,
}: {
    task: TaskItem;
    path: string;
    context: RoutineContext;
    stale: boolean;
    refresh: () => void;
}) {
    const [action, setAction] = useState(''),
        [date, setDate] = useState(task.deadline?.date ?? ''),
        [time, setTime] = useState(task.deadline?.time ?? ''),
        [urgency, setUrgency] = useState(task.urgency),
        [member, setMember] = useState(task.assignee?.memberId ?? ''),
        [review, setReview] = useState<ActionInput | null>(null),
        [saved, setSaved] = useState(false),
        [dirty, setDirty] = useState(false);
    const command = useSpaceOperation<ActionInput, TaskItem>({
        execute: (space, input, token, key, signal) =>
            routineRequest(
                space,
                `${path}/${input.action === 'ASSIGN' ? 'assignment' : input.action.toLowerCase()}`,
                input.body,
                token,
                key,
                signal,
            ),
        onSuccess: () => {
            setDirty(false);
            setReview(null);
            setAction('');
            setSaved(true);
            refresh();
        },
        onConflict: () => {
            setDirty(false);
            setReview(null);
            refresh();
        },
    });
    const busy = command.isPending || command.canRetry;
    useSpaceLeaveGuard(dirty, busy, () => setDirty(false));
    const allowed = task.allowedActions.filter(
        (a) =>
            [
                'COMPLETE',
                'REOPEN',
                'SKIP',
                'ASSIGN',
                'DEADLINE',
                'URGENCY',
                'CANCEL',
            ].includes(a) && !(a === 'ASSIGN' && context.type === 'PERSONAL'),
    );
    const labels: Record<string, string> = {
        COMPLETE: 'Concluir tarefa',
        REOPEN: 'Reabrir tarefa',
        SKIP: 'Ignorar ocorrência',
        ASSIGN: 'Trocar responsável',
        DEADLINE: 'Alterar prazo',
        URGENCY: 'Alterar urgência',
        CANCEL: 'Cancelar tarefa',
    };
    if (context.status !== 'ACTIVE' || !allowed.length) return null;
    function prepare(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (stale || !allowed.includes(action)) return;
        const body: Record<string, unknown> =
            task.kind === 'OCCURRENCE'
                ? {
                      expectedRecurrenceVersion: task.recurrenceVersion,
                      expectedOccurrenceVersion: task.version,
                  }
                : { expectedVersion: task.version };
        if (action === 'ASSIGN') body.assigneeMemberId = member || null;
        if (action === 'DEADLINE')
            body.deadline = date ? { date, time: time || null } : null;
        if (action === 'URGENCY') body.urgency = urgency;
        setReview({ action, body });
    }
    return (
        <section className={styles.section}>
            <h2>Ações da tarefa</h2>
            {saved && <p role="status">Alteração confirmada.</p>}
            <form
                className={styles.form}
                onSubmit={prepare}
                onChange={() => {
                    setDirty(true);
                    setReview(null);
                    setSaved(false);
                }}
            >
                <fieldset disabled={busy || stale || !!review}>
                    <label>
                        Ação
                        <select
                            value={action}
                            onChange={(e) => setAction(e.target.value)}
                            required
                        >
                            <option value="">Escolha uma ação</option>
                            {allowed.map((a) => (
                                <option key={a} value={a}>
                                    {labels[a]}
                                </option>
                            ))}
                        </select>
                    </label>
                    {action === 'ASSIGN' && (
                        <label>
                            Novo responsável
                            <select
                                value={member}
                                onChange={(e) => setMember(e.target.value)}
                            >
                                <option value="">Sem responsável</option>
                                {context.participants.map((p) => (
                                    <option
                                        key={p.memberId}
                                        value={p.memberId!}
                                    >
                                        {p.displayName}
                                    </option>
                                ))}
                            </select>
                        </label>
                    )}
                    {action === 'DEADLINE' && (
                        <>
                            <label>
                                Novo prazo (deixe vazio para remover)
                                <Input
                                    type="date"
                                    value={date}
                                    onChange={(e) => {
                                        setDate(e.target.value);
                                        if (!e.target.value) setTime('');
                                    }}
                                />
                            </label>
                            <label>
                                Horário (opcional)
                                <Input
                                    type="time"
                                    disabled={!date}
                                    value={time}
                                    onChange={(e) => setTime(e.target.value)}
                                />
                            </label>
                            <p className={styles.help}>
                                Sem horário, vale até o fim do dia em São Paulo.
                                A urgência permanece a mesma.
                            </p>
                        </>
                    )}
                    {action === 'URGENCY' && (
                        <label>
                            Nova urgência
                            <select
                                aria-label="Nova urgência"
                                aria-describedby="task-new-urgency-help"
                                value={urgency}
                                onChange={(e) =>
                                    setUrgency(e.target.value as Urgency)
                                }
                            >
                                {Object.entries(urgencyLabels).map(([v, l]) => (
                                    <option key={v} value={v}>
                                        {l}
                                    </option>
                                ))}
                            </select>
                            <span
                                id="task-new-urgency-help"
                                className={styles.help}
                            >
                                Alterar a urgência preserva o prazo e a
                                responsabilidade.
                            </span>
                        </label>
                    )}
                </fieldset>
                <CommandFeedback command={command} />
                {action && !review && (
                    <Button type="submit" disabled={busy || stale}>
                        Revisar ação
                    </Button>
                )}
                {review && (
                    <div className={styles.notice} aria-label="Confirmar ação">
                        <h3>{labels[review.action]}</h3>
                        <p className={`${styles.help} mt-3`}>
                            {action === 'COMPLETE'
                                ? 'Sua conta será registrada como executora. A pessoa responsável não muda.'
                                : action === 'REOPEN'
                                  ? 'A tarefa voltará a ficar pendente. A conclusão anterior permanece no histórico.'
                                  : action === 'SKIP'
                                    ? 'Somente esta ocorrência será ignorada. A repetição continua.'
                                    : action === 'CANCEL'
                                      ? 'Esta tarefa será cancelada e continuará no histórico. Ela não poderá ser reaberta.'
                                      : action === 'ASSIGN'
                                        ? `Responsável: ${participantLabel(task.assignee, context)} → ${participantLabel(context.participants.find((p) => p.memberId === member) ?? null, context)}.`
                                        : action === 'DEADLINE'
                                          ? `${deadlineLabel(task.deadline)} → ${deadlineLabel(date ? { date, time: time || null } : null)}.`
                                          : `Urgência: ${urgencyLabels[task.urgency]} → ${urgencyLabels[urgency]}.`}
                        </p>
                        <div className={`${styles.actions} mt-4`}>
                            <Button
                                type="button"
                                variant={
                                    ['CANCEL', 'SKIP'].includes(action)
                                        ? 'destructive'
                                        : 'default'
                                }
                                disabled={busy || stale}
                                onClick={() => command.submit(review)}
                            >
                                Confirmar{' '}
                                {action === 'COMPLETE'
                                    ? 'conclusão'
                                    : action === 'REOPEN'
                                      ? 'reabertura'
                                      : action === 'CANCEL'
                                        ? 'cancelamento'
                                        : action === 'SKIP'
                                          ? 'ocorrência ignorada'
                                          : 'alteração'}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={busy}
                                onClick={() => setReview(null)}
                            >
                                Voltar
                            </Button>
                        </div>
                    </div>
                )}
            </form>
        </section>
    );
}
