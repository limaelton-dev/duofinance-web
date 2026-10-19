'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    CommandFeedback,
    QueryFeedback,
} from '@/features/spaces/components/space-operation-shared';
import { useSpaceContext } from '@/features/spaces/context/space-context-provider';
import { useSpaceOperation } from '@/features/spaces/hooks/use-space-operation';
import { useSpaceLeaveGuard } from '@/features/spaces/hooks/use-space-leave-guard';
import { shoppingTaskCommand } from '@/lib/api/shopping';
import type { ShoppingList } from '../types/shopping';
import { ShoppingLink, useShoppingPage } from './shopping-shared';
import { shoppingStatus } from '../utils/shopping';
import styles from './shopping.module.css';

type TaskLink = {
    id: string;
    version: number | null;
    kind?: string;
    allowedActions?: string[];
    shoppingList?: {
        id: string;
        name: string | null;
        status: string;
        summary?: { actionableItemCount: number };
    } | null;
};
export function TaskShoppingLink({
    spaceId,
    personId,
    task,
    onChanged,
    stale = false,
}: {
    spaceId: string;
    personId: string;
    task: TaskLink;
    onChanged: () => void;
    stale?: boolean;
}) {
    const space = useSpaceContext(),
        [editing, setEditing] = useState<'link' | 'remove' | null>(null);
    const [version, setVersion] = useState<number | null>(null),
        [selected, setSelected] = useState('');
    const [conflict, setConflict] = useState(false),
        [notice, setNotice] = useState('');
    const [linksReady, setLinksReady] = useState(false);
    const command = useSpaceOperation<
        { taskId: string; body: object; remove: boolean },
        object
    >({
        execute: shoppingTaskCommand,
        onSuccess: () => {
            setEditing(null);
            setSelected('');
            setNotice(
                'Vínculo atualizado. A tarefa e a lista continuam independentes.',
            );
            onChanged();
        },
        onConflict: () => setConflict(true),
    });
    const busy = command.isPending || command.canRetry;
    useSpaceLeaveGuard(editing !== null && selected !== '', busy, () => {
        setEditing(null);
        setSelected('');
    });
    if (task.kind === 'OCCURRENCE') return null;
    const canWrite =
        space.currentSpace?.status === 'ACTIVE' && task.version !== null;
    const start = (action: 'link' | 'remove') => {
        setVersion(task.version);
        setEditing(action);
        setSelected('');
    };
    return (
        <section className={styles.section}>
            <h2>Lista de compras</h2>
            {task.shoppingList ? (
                <>
                    <ShoppingLink
                        href={`/spaces/${spaceId}/shopping/lists/${task.shoppingList.id}`}
                    >
                        {task.shoppingList.name ?? 'Lista sem nome'}
                    </ShoppingLink>
                    <p className={styles.help}>
                        {shoppingStatus[task.shoppingList.status]}
                        {task.shoppingList.summary
                            ? ` · ${task.shoppingList.summary.actionableItemCount} itens com quantidade a comprar`
                            : ''}
                    </p>
                </>
            ) : (
                <p className={styles.help}>
                    Esta tarefa não tem lista vinculada.
                </p>
            )}
            <p className={styles.help}>
                O vínculo facilita a navegação. Concluir ou cancelar a tarefa
                não altera a lista, e as compras não concluem a tarefa.
            </p>
            {notice && (
                <p role="status" className={styles.success}>
                    {notice}
                </p>
            )}
            {canWrite && !editing && (
                <div className={styles.actions}>
                    {task.allowedActions?.includes('LINK_SHOPPING_LIST') && (
                        <Button
                            variant="outline"
                            disabled={busy || conflict || stale}
                            onClick={() => start('link')}
                        >
                            {task.shoppingList
                                ? 'Trocar lista vinculada'
                                : 'Vincular lista'}
                        </Button>
                    )}
                    {task.shoppingList &&
                        task.allowedActions?.includes(
                            'UNLINK_SHOPPING_LIST',
                        ) && (
                            <Button
                                variant="outline"
                                disabled={busy || conflict || stale}
                                onClick={() => start('remove')}
                            >
                                Desvincular lista
                            </Button>
                        )}
                </div>
            )}
            {editing && canWrite && (
                <form
                    className={styles.form}
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (editing === 'link' && !linksReady) return;
                        command.submit({
                            taskId: task.id,
                            remove: editing === 'remove',
                            body:
                                editing === 'remove'
                                    ? { expectedVersion: version }
                                    : {
                                          expectedVersion: version,
                                          shoppingListId: selected,
                                      },
                        });
                    }}
                >
                    <fieldset disabled={busy || conflict || stale}>
                        <legend>
                            {editing === 'remove'
                                ? 'Desvincular lista'
                                : 'Escolher lista deste espaço'}
                        </legend>
                        {editing === 'link' ? (
                            <TaskLinkPicker
                                required
                                onReady={setLinksReady}
                                {...{
                                    spaceId,
                                    personId,
                                    selected,
                                    setSelected,
                                }}
                            />
                        ) : (
                            <p>
                                Retirar o vínculo com “
                                {task.shoppingList?.name ?? 'Lista sem nome'}”
                                preserva a tarefa, a lista e todas as compras.
                            </p>
                        )}
                        <div className={styles.actions}>
                            <Button
                                type="submit"
                                disabled={
                                    editing === 'link' &&
                                    (!selected || !linksReady)
                                }
                            >
                                {editing === 'remove'
                                    ? 'Confirmar desvínculo'
                                    : 'Confirmar vínculo'}
                            </Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setEditing(null)}
                            >
                                Cancelar
                            </Button>
                        </div>
                    </fieldset>
                </form>
            )}
            <CommandFeedback command={command} />
            {conflict && (
                <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                        setEditing(null);
                        setConflict(false);
                        onChanged();
                    }}
                >
                    Atualizar e revisar tarefa
                </Button>
            )}
        </section>
    );
}
export function TaskLinkPicker({
    spaceId,
    personId,
    selected,
    setSelected,
    required = false,
    onSelected,
    onReady,
}: {
    spaceId: string;
    personId: string;
    selected: string;
    setSelected: (id: string) => void;
    required?: boolean;
    onSelected?: (list: ShoppingList | null) => void;
    onReady?: (ready: boolean) => void;
}) {
    const { query, pagination } = useShoppingPage<ShoppingList>(
        personId,
        spaceId,
        '',
        { status: 'ACTIVE' },
    );
    const [retained, setRetained] = useState<ShoppingList | null>(null);
    useEffect(() => {
        onReady?.(Boolean(query.data) && !query.isFetching && !query.isError);
    }, [onReady, query.data, query.isFetching, query.isError]);
    return (
        <>
            <QueryFeedback query={query} />
            {query.data && (
                <>
                    <label>
                        {required
                            ? 'Lista ativa'
                            : 'Lista de compras (opcional)'}
                        <select
                            className={styles.select}
                            required={required}
                            value={selected}
                            disabled={query.isError || query.isFetching}
                            onChange={(event) => {
                                setSelected(event.target.value);
                                const choice =
                                    query.data.items.find(
                                        (list) =>
                                            list.id === event.target.value,
                                    ) ?? null;
                                setRetained(choice);
                                onSelected?.(choice);
                            }}
                        >
                            <option value="">Escolha uma lista</option>
                            {selected &&
                                !query.data.items.some(
                                    (list) => list.id === selected,
                                ) && (
                                    <option value={selected}>
                                        {retained?.id === selected
                                            ? (retained.name ??
                                              'Lista sem nome')
                                            : 'Lista selecionada anteriormente'}{' '}
                                        (selecionada)
                                    </option>
                                )}
                            {query.data.items.map((list) => (
                                <option key={list.id} value={list.id}>
                                    {list.name ?? 'Lista sem nome'} ·{' '}
                                    {list.summary.actionableItemCount}{' '}
                                    pendências
                                </option>
                            ))}
                        </select>
                    </label>
                    {!query.data.items.length && (
                        <p className={styles.help}>
                            Nenhuma lista ativa neste espaço. Crie uma lista em
                            Compras antes de vincular.
                        </p>
                    )}
                    {pagination}
                </>
            )}
        </>
    );
}
