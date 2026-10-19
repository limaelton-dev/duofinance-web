import { apiRequest } from './api-client';
import type {
    PageResult,
    RoutineContext,
    RoutineEvent,
    TaskItem,
    TaskList,
    TaskRecurrence,
} from '@/features/routine/types/routine';

function scoped<T>(spaceId: string, value: T): T & { spaceId: string } {
    if (
        value &&
        typeof value === 'object' &&
        'spaceId' in value &&
        value.spaceId !== spaceId
    )
        throw new Error('A resposta pertence a outro espaço.');
    return { ...value, spaceId };
}
function pageScope<T extends { items: { spaceId: string }[] }>(
    spaceId: string,
    value: T,
) {
    value.items.forEach((item) => scoped(spaceId, item));
    return scoped(spaceId, value);
}
export function taskHref(
    spaceId: string,
    task: Pick<TaskItem, 'kind' | 'id' | 'recurrenceId' | 'scheduledDate'>,
) {
    return `/spaces/${spaceId}/routine/${task.kind === 'OCCURRENCE' ? `recurrences/${task.recurrenceId}/occurrences/${task.scheduledDate}` : `tasks/${task.id}`}`;
}
export const getRoutineContext = (spaceId: string, signal?: AbortSignal) =>
    apiRequest<RoutineContext>(`/spaces/${spaceId}/routine-context`, {
        signal,
    }).then((v) => scoped(spaceId, v));
export const getTasks = (
    spaceId: string,
    query: string,
    signal?: AbortSignal,
) =>
    apiRequest<TaskList>(`/spaces/${spaceId}/tasks?${query}`, { signal }).then(
        (v) => pageScope(spaceId, v),
    );
export const getTask = (spaceId: string, path: string, signal?: AbortSignal) =>
    apiRequest<TaskItem>(`/spaces/${spaceId}/${path}`, { signal }).then((v) => {
        const parts = path.split('/').map(decodeURIComponent);
        if (
            (parts[0] === 'tasks' && v.id !== parts[1]) ||
            (parts[0] === 'task-recurrences' &&
                (v.recurrenceId !== parts[1] || v.scheduledDate !== parts[3]))
        )
            throw new Error('A resposta não corresponde à tarefa consultada.');
        return scoped(spaceId, v);
    });
export const getRoutineHistory = (
    spaceId: string,
    path: string,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<PageResult<RoutineEvent>>(
        `/spaces/${spaceId}/${path}/history?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
    ).then((v) => pageScope(spaceId, v));
export const getTaskRecurrences = (
    spaceId: string,
    cursor: string | null,
    signal?: AbortSignal,
) =>
    apiRequest<PageResult<TaskRecurrence>>(
        `/spaces/${spaceId}/task-recurrences?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        { signal },
    ).then((v) => pageScope(spaceId, v));
export const getTaskRecurrence = (
    spaceId: string,
    id: string,
    signal?: AbortSignal,
) =>
    apiRequest<TaskRecurrence>(
        `/spaces/${spaceId}/task-recurrences/${encodeURIComponent(id)}`,
        { signal },
    ).then((v) => {
        if (v.id !== id)
            throw new Error(
                'A resposta não corresponde à recorrência consultada.',
            );
        return scoped(spaceId, v);
    });
export const getTaskOccurrences = (
    spaceId: string,
    id: string,
    query: string,
    signal?: AbortSignal,
) =>
    apiRequest<PageResult<TaskItem> & { window: { from: string; to: string } }>(
        `/spaces/${spaceId}/task-recurrences/${encodeURIComponent(id)}/occurrences?${query}`,
        { signal },
    ).then((v) => pageScope(spaceId, v));
export function routineRequest<T>(
    spaceId: string,
    suffix: string,
    body: unknown,
    csrfToken: string,
    idempotencyKey: string,
    signal?: AbortSignal,
) {
    return apiRequest<T>(`/spaces/${spaceId}/${suffix}`, {
        method: 'POST',
        body,
        csrfToken,
        idempotencyKey,
        signal,
    }).then((v) => scoped(spaceId, v));
}
