'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    SpaceBoundary,
    CommandFeedback,
    QueryFeedback,
} from '@/features/spaces/components/space-operation-shared';
import { useSpaceOperation } from '@/features/spaces/hooks/use-space-operation';
import { useSpaceLeaveGuard } from '@/features/spaces/hooks/use-space-leave-guard';
import { routineRequest } from '@/lib/api/routine';
import { TaskLinkPicker } from '@/features/shopping/components/task-shopping-link';
import { businessToday } from '@/features/finances/utils/expense-money';
import type {
    CreateRecurrence,
    CreateTask,
    RecurrenceRule,
    TaskItem,
    TaskRecurrence,
    Urgency,
} from '../types/routine';
import {
    ReadOnlyNotice,
    RoutineHeading,
    dateLabel,
    deadlineLabel,
    participantLabel,
    recurrenceLabel,
    urgencyLabels,
    useRoutineContext,
} from './routine-shared';
import styles from './routine.module.css';

export function TaskComposer({
    spaceId,
    recurring = false,
}: {
    spaceId: string;
    recurring?: boolean;
}) {
    return (
        <SpaceBoundary spaceId={spaceId}>
            {(personId) => (
                <TaskForm
                    key={String(recurring)}
                    spaceId={spaceId}
                    personId={personId}
                    recurring={recurring}
                />
            )}
        </SpaceBoundary>
    );
}
function TaskForm({
    spaceId,
    personId,
    recurring,
}: {
    spaceId: string;
    personId: string;
    recurring: boolean;
}) {
    const context = useRoutineContext(personId, spaceId);
    const [description, setDescription] = useState(''),
        [assignee, setAssignee] = useState(''),
        [urgency, setUrgency] = useState<Urgency>('NORMAL'),
        [date, setDate] = useState(''),
        [time, setTime] = useState('');
    const [shoppingListId, setShoppingListId] = useState(''),
        [shoppingReady, setShoppingReady] = useState(false),
        [selectedList, setSelectedList] = useState<{
            id: string;
            name: string | null;
        } | null>(null);
    const [frequency, setFrequency] =
            useState<RecurrenceRule['frequency']>('DAILY'),
        [weekday, setWeekday] = useState('1'),
        [weekdays, setWeekdays] = useState<number[]>([1, 2, 3, 4, 5]),
        [day, setDay] = useState('1'),
        [month, setMonth] = useState('1'),
        [start, setStart] = useState(businessToday),
        [end, setEnd] = useState(''),
        [hasDeadline, setHasDeadline] = useState(true);
    const [dirty, setDirty] = useState(false),
        [review, setReview] = useState<CreateTask | CreateRecurrence | null>(
            null,
        ),
        [error, setError] = useState<string | null>(null),
        [created, setCreated] = useState<TaskItem | TaskRecurrence | null>(
            null,
        );
    const command = useSpaceOperation<
        CreateTask | CreateRecurrence,
        TaskItem | TaskRecurrence
    >({
        execute: (space, input, token, key, signal) =>
            routineRequest(
                space,
                recurring ? 'task-recurrences' : 'tasks',
                input,
                token,
                key,
                signal,
            ),
        onSuccess: (value) => {
            setDirty(false);
            setCreated(value);
        },
        onConflict: () => {
            setReview(null);
            void context.refetch();
        },
    });
    const busy = command.isPending || command.canRetry;
    useSpaceLeaveGuard(dirty, busy, () => setDirty(false));
    function change() {
        setDirty(true);
        setReview(null);
        setError(null);
    }
    function prepare(event: React.FormEvent<HTMLFormElement>) {
        event.preventDefault();
        if (
            context.isFetching ||
            context.isError ||
            context.data?.status !== 'ACTIVE'
        )
            return;
        const base = {
            description: description.trim(),
            urgency,
            ...(context.data.type === 'SHARED'
                ? { assigneeMemberId: assignee || null }
                : {}),
        };
        if (!base.description) {
            setError('Descreva o que precisa ser feito.');
            return;
        }
        if (!recurring) {
            if (shoppingListId && !shoppingReady) {
                setError(
                    'Atualize a consulta da lista de compras antes de confirmar o vínculo.',
                );
                return;
            }
            setReview({
                ...base,
                deadline: date ? { date, time: time || null } : null,
                ...(shoppingListId ? { shoppingListId } : {}),
            });
            return;
        }
        if (end && end < start) {
            setError('O fim deve ser igual ou posterior ao início.');
            return;
        }
        if (frequency === 'WEEKDAYS' && !weekdays.length) {
            setError('Selecione pelo menos um dia da semana.');
            return;
        }
        if (
            frequency === 'ANNUAL' &&
            Number(day) >
                new Date(Date.UTC(2024, Number(month), 0)).getUTCDate()
        ) {
            setError('Informe um dia válido para o mês escolhido.');
            return;
        }
        const rule: RecurrenceRule =
            frequency === 'DAILY'
                ? { frequency }
                : frequency === 'WEEKLY'
                  ? { frequency, weekday: Number(weekday) }
                  : frequency === 'WEEKDAYS'
                    ? {
                          frequency,
                          weekdays: [...weekdays].sort((a, b) => a - b),
                      }
                    : frequency === 'MONTHLY'
                      ? { frequency, day: Number(day) }
                      : { frequency, month: Number(month), day: Number(day) };
        setReview({
            ...base,
            deadline: hasDeadline ? { time: time || null } : null,
            rule,
            startsOn: start,
            endsOn: end || null,
        });
    }
    if (created)
        return (
            <div className={styles.page}>
                <RoutineHeading
                    spaceId={spaceId}
                    title={recurring ? 'Recorrência criada' : 'Tarefa criada'}
                />
                <section className={styles.notice}>
                    <h2>{created.description}</h2>
                    <p role="status">
                        {recurring
                            ? 'As ocorrências estão disponíveis para consulta.'
                            : 'O registro foi confirmado.'}
                    </p>
                    <div className={`${styles.actions} mt-4`}>
                        <Button asChild>
                            <Link
                                href={`/spaces/${spaceId}/routine/${recurring ? 'recurrences' : 'tasks'}/${created.id}`}
                            >
                                Ver {recurring ? 'recorrência' : 'tarefa'}
                            </Link>
                        </Button>
                        <Link href={`/spaces/${spaceId}/routine`}>
                            Voltar à rotina
                        </Link>
                    </div>
                </section>
            </div>
        );
    return (
        <div className={styles.page}>
            <RoutineHeading
                spaceId={spaceId}
                title={recurring ? 'Nova tarefa recorrente' : 'Nova tarefa'}
            >
                {recurring
                    ? 'Defina uma regra. Cada ocorrência terá sua própria conclusão e histórico.'
                    : 'Registre o que fazer. Prazo e urgência são independentes.'}
            </RoutineHeading>
            <QueryFeedback query={context} />
            <ReadOnlyNotice context={context.data} />
            {context.data?.status === 'ACTIVE' && (
                <form
                    className={styles.form}
                    onSubmit={prepare}
                    onChange={change}
                >
                    <fieldset
                        disabled={
                            busy ||
                            !!review ||
                            context.isFetching ||
                            context.isError
                        }
                    >
                        <legend>O que precisa ser feito</legend>
                        <label>
                            Descrição
                            <textarea
                                required
                                maxLength={500}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </label>
                        {context.data.type === 'SHARED' ? (
                            <label>
                                Responsável
                                <select
                                    aria-label="Responsável"
                                    aria-describedby="task-assignee-help"
                                    value={assignee}
                                    onChange={(e) =>
                                        setAssignee(e.target.value)
                                    }
                                >
                                    <option value="">Sem responsável</option>
                                    {context.data.participants.map((p) => (
                                        <option
                                            key={p.memberId}
                                            value={p.memberId!}
                                        >
                                            {p.displayName}
                                        </option>
                                    ))}
                                </select>
                                <span
                                    id="task-assignee-help"
                                    className={styles.help}
                                >
                                    A atribuição não exige aceite. Qualquer
                                    participante ativo pode concluir.
                                </span>
                            </label>
                        ) : (
                            <p className={styles.help}>
                                Responsável:{' '}
                                {context.data.participants[0]?.displayName}.
                                Este é seu espaço pessoal.
                            </p>
                        )}
                        <label>
                            Urgência
                            <select
                                aria-label="Urgência"
                                aria-describedby="task-urgency-help"
                                value={urgency}
                                onChange={(e) =>
                                    setUrgency(e.target.value as Urgency)
                                }
                            >
                                {Object.entries(urgencyLabels).map(
                                    ([key, label]) => (
                                        <option key={key} value={key}>
                                            {label}
                                        </option>
                                    ),
                                )}
                            </select>
                            <span
                                id="task-urgency-help"
                                className={styles.help}
                            >
                                Uma tarefa atrasada mantém a urgência que você
                                escolheu.
                            </span>
                        </label>
                        {!recurring ? (
                            <>
                                <label>
                                    Prazo (opcional)
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
                                        aria-label="Horário (opcional)"
                                        aria-describedby="task-deadline-help"
                                        value={time}
                                        disabled={!date}
                                        onChange={(e) =>
                                            setTime(e.target.value)
                                        }
                                    />
                                    <span
                                        id="task-deadline-help"
                                        className={styles.help}
                                    >
                                        Sem horário, o prazo vale até o fim do
                                        dia em São Paulo.
                                    </span>
                                </label>
                            </>
                        ) : (
                            <>
                                <label>
                                    Repetição
                                    <select
                                        value={frequency}
                                        onChange={(e) =>
                                            setFrequency(
                                                e.target
                                                    .value as RecurrenceRule['frequency'],
                                            )
                                        }
                                    >
                                        <option value="DAILY">
                                            Todos os dias
                                        </option>
                                        <option value="WEEKLY">
                                            Uma vez por semana
                                        </option>
                                        <option value="WEEKDAYS">
                                            Dias da semana
                                        </option>
                                        <option value="MONTHLY">
                                            Todo mês
                                        </option>
                                        <option value="ANNUAL">Todo ano</option>
                                    </select>
                                </label>
                                {frequency === 'WEEKLY' && (
                                    <label>
                                        Dia da semana
                                        <select
                                            value={weekday}
                                            onChange={(e) =>
                                                setWeekday(e.target.value)
                                            }
                                        >
                                            {[
                                                'Segunda-feira',
                                                'Terça-feira',
                                                'Quarta-feira',
                                                'Quinta-feira',
                                                'Sexta-feira',
                                                'Sábado',
                                                'Domingo',
                                            ].map((label, index) => (
                                                <option
                                                    key={label}
                                                    value={index + 1}
                                                >
                                                    {label}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                )}
                                {frequency === 'WEEKDAYS' && (
                                    <fieldset>
                                        <legend>Dias da semana</legend>
                                        {[
                                            'Segunda-feira',
                                            'Terça-feira',
                                            'Quarta-feira',
                                            'Quinta-feira',
                                            'Sexta-feira',
                                            'Sábado',
                                            'Domingo',
                                        ].map((label, index) => (
                                            <label
                                                className={styles.check}
                                                key={label}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={weekdays.includes(
                                                        index + 1,
                                                    )}
                                                    onChange={(e) =>
                                                        setWeekdays((values) =>
                                                            e.target.checked
                                                                ? [
                                                                      ...values,
                                                                      index + 1,
                                                                  ]
                                                                : values.filter(
                                                                      (v) =>
                                                                          v !==
                                                                          index +
                                                                              1,
                                                                  ),
                                                        )
                                                    }
                                                />
                                                {label}
                                            </label>
                                        ))}
                                    </fieldset>
                                )}
                                {(frequency === 'MONTHLY' ||
                                    frequency === 'ANNUAL') && (
                                    <label>
                                        Dia do mês
                                        <Input
                                            type="number"
                                            required
                                            min={1}
                                            max={31}
                                            value={day}
                                            onChange={(e) =>
                                                setDay(e.target.value)
                                            }
                                        />
                                    </label>
                                )}
                                {frequency === 'ANNUAL' && (
                                    <label>
                                        Mês do ano
                                        <Input
                                            type="number"
                                            required
                                            min={1}
                                            max={12}
                                            value={month}
                                            onChange={(e) =>
                                                setMonth(e.target.value)
                                            }
                                        />
                                    </label>
                                )}
                                {(frequency === 'MONTHLY' ||
                                    frequency === 'ANNUAL') && (
                                    <p className={styles.help}>
                                        Se o dia não existir no mês, vale o
                                        último dia desse mês.
                                    </p>
                                )}
                                <label>
                                    Início
                                    <Input
                                        type="date"
                                        required
                                        value={start}
                                        onChange={(e) =>
                                            setStart(e.target.value)
                                        }
                                    />
                                </label>
                                <label>
                                    Fim (opcional)
                                    <Input
                                        type="date"
                                        min={start}
                                        value={end}
                                        onChange={(e) => setEnd(e.target.value)}
                                    />
                                </label>
                                <label className={styles.check}>
                                    <input
                                        type="checkbox"
                                        checked={hasDeadline}
                                        onChange={(e) =>
                                            setHasDeadline(e.target.checked)
                                        }
                                    />
                                    Usar a data da ocorrência como prazo
                                </label>
                                {hasDeadline && (
                                    <label>
                                        Horário do prazo (opcional)
                                        <Input
                                            type="time"
                                            value={time}
                                            onChange={(e) =>
                                                setTime(e.target.value)
                                            }
                                        />
                                    </label>
                                )}
                            </>
                        )}
                        {!recurring && (
                            <TaskLinkPicker
                                spaceId={spaceId}
                                personId={personId}
                                selected={shoppingListId}
                                setSelected={(value) => {
                                    change();
                                    setShoppingListId(value);
                                }}
                                onSelected={setSelectedList}
                                onReady={setShoppingReady}
                            />
                        )}
                    </fieldset>
                    {error && <p role="alert">{error}</p>}
                    <CommandFeedback command={command} />
                    {!review ? (
                        <Button
                            type="submit"
                            disabled={
                                busy ||
                                context.isFetching ||
                                context.isError ||
                                (!!shoppingListId && !shoppingReady)
                            }
                        >
                            Revisar tarefa
                        </Button>
                    ) : (
                        <section
                            className={styles.notice}
                            aria-label="Confirmar tarefa"
                        >
                            <h2>Confira antes de criar</h2>
                            <p className="mt-3">{review.description}</p>
                            <p className={styles.help}>
                                Responsável:{' '}
                                {context.data.type === 'PERSONAL'
                                    ? context.data.participants[0]?.displayName
                                    : participantLabel(
                                          context.data.participants.find(
                                              (p) => p.memberId === assignee,
                                          ) ?? null,
                                          context.data,
                                      )}{' '}
                                · Urgência{' '}
                                {urgencyLabels[review.urgency].toLowerCase()}.
                            </p>
                            {'rule' in review ? (
                                <>
                                    <p className={styles.help}>
                                        {recurrenceLabel(review)}. De{' '}
                                        {dateLabel(review.startsOn)}
                                        {review.endsOn
                                            ? ` até ${dateLabel(review.endsOn)}`
                                            : '; sem fim definido'}
                                        .
                                    </p>
                                    <p className={styles.help}>
                                        {review.deadline
                                            ? `Prazo na data da ocorrência${review.deadline.time ? ` às ${review.deadline.time}` : ', sem horário'}.`
                                            : 'Ocorrências sem prazo.'}
                                    </p>
                                </>
                            ) : (
                                <p className={styles.help}>
                                    {deadlineLabel(review.deadline)}
                                </p>
                            )}
                            {!('rule' in review) && review.shoppingListId && (
                                <p className={styles.help}>
                                    Lista de compras:{' '}
                                    {selectedList?.name ?? 'Lista sem nome'}. A
                                    lista e a tarefa mantêm seu próprio
                                    progresso.
                                </p>
                            )}
                            <div className={`${styles.actions} mt-4`}>
                                <Button
                                    type="button"
                                    disabled={
                                        busy ||
                                        context.isFetching ||
                                        context.isError ||
                                        (!!shoppingListId && !shoppingReady)
                                    }
                                    onClick={() => command.submit(review)}
                                >
                                    Criar {recurring ? 'recorrência' : 'tarefa'}
                                </Button>
                                <Button
                                    type="button"
                                    variant="outline"
                                    disabled={busy}
                                    onClick={() => setReview(null)}
                                >
                                    Editar
                                </Button>
                            </div>
                        </section>
                    )}
                </form>
            )}
        </div>
    );
}
