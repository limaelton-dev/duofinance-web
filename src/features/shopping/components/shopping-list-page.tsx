'use client';
import { useState } from 'react';
import { useUrlPreferences } from '@/components/patterns/use-url-preferences';
import { Button } from '@/components/ui/button';
import { ChevronRight } from '@/components/ui/icons';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import {
    SpaceBoundary,
    QueryFeedback,
    CommandFeedback,
} from '@/features/spaces/components/space-operation-shared';
import { useSpaceContext } from '@/features/spaces/context/space-context-provider';
import { useSpaceQuery } from '@/features/spaces/hooks/use-space-query';
import { useSpaceLeaveGuard } from '@/features/spaces/hooks/use-space-leave-guard';
import { useSpaceOperation } from '@/features/spaces/hooks/use-space-operation';
import { getShopping, shoppingCommand } from '@/lib/api/shopping';
import type {
    LinkedShoppingTask,
    ShoppingDetail,
    ShoppingHistory,
    ShoppingItem,
} from '../types/shopping';
import {
    formatQuantity,
    shoppingDate,
    shoppingHistoryDetail,
    shoppingQuantity,
    shoppingStatus,
} from '../utils/shopping';
import {
    ShoppingHeading,
    ShoppingLink,
    shoppingKey,
    useShoppingPage,
} from './shopping-shared';
import styles from './shopping.module.css';

type ListAction = 'rename' | 'archive' | 'add';
type ListInput = { suffix: string; body: object };
export function ShoppingListPage({
    spaceId,
    listId,
}: {
    spaceId: string;
    listId: string;
}) {
    return (
        <SpaceBoundary spaceId={spaceId}>
            {(personId) => (
                <ListContent
                    key={listId}
                    spaceId={spaceId}
                    personId={personId}
                    listId={listId}
                />
            )}
        </SpaceBoundary>
    );
}
function ListContent({
    spaceId,
    personId,
    listId,
}: {
    spaceId: string;
    personId: string;
    listId: string;
}) {
    const space = useSpaceContext();
    const query = useSpaceQuery(
        personId,
        spaceId,
        shoppingKey(personId, spaceId, listId),
        true,
        (signal) => getShopping<ShoppingDetail>(spaceId, `/${listId}`, signal),
    );
    const [action, setAction] = useState<ListAction | null>(null);
    const [preferences, setPreferences] = useUrlPreferences(
        { items: 'ACTIVE' },
        {
            items: (value) =>
                ['ACTIVE', 'PURCHASED', 'PENDING', 'REMOVED', 'ALL'].includes(
                    value,
                ),
        },
    );
    const filter = preferences.items;
    const [conflict, setConflict] = useState(false),
        [notice, setNotice] = useState('');
    const command = useSpaceOperation<
        ListInput,
        { id: string; version: number }
    >({
        execute: shoppingCommand,
        onSuccess: () => {
            setAction(null);
            setNotice('Lista atualizada.');
        },
        onConflict: () => setConflict(true),
    });
    const busy = command.isPending || command.canRetry;
    useSpaceLeaveGuard(false, busy, () => setAction(null));
    const list = query.data,
        writable =
            space.currentSpace?.status === 'ACTIVE' &&
            list?.status === 'ACTIVE';
    const disabled = busy || query.isFetching || query.isError || conflict;
    return (
        <div className={styles.page}>
            <ShoppingHeading
                spaceId={spaceId}
                title={list?.name ?? 'Lista de compras'}
            >
                <p className={styles.help}>
                    Quantidades e compras permanecem registradas nesta lista.
                </p>
            </ShoppingHeading>
            <QueryFeedback query={query} />
            {notice && (
                <p role="status" className={styles.success}>
                    {notice}
                </p>
            )}
            {list && (
                <>
                    <section className={styles.section}>
                        <div className={styles.rowTitle}>
                            <h2>Resumo da lista</h2>
                            <span className={styles.state}>
                                {shoppingStatus[list.status]}
                            </span>
                        </div>
                        <div className={`${styles.surface} ${styles.row}`}>
                            <dl className={styles.summary}>
                                <div>
                                    <dt>Itens ativos</dt>
                                    <dd>{list.summary.activeItemCount}</dd>
                                </div>
                                <div>
                                    <dt>Com quantidade a comprar</dt>
                                    <dd>{list.summary.actionableItemCount}</dd>
                                </div>
                                <div>
                                    <dt>Com compra parcial</dt>
                                    <dd>
                                        {
                                            list.summary
                                                .partiallyPurchasedItemCount
                                        }
                                    </dd>
                                </div>
                                <div>
                                    <dt>Comprados</dt>
                                    <dd>{list.summary.purchasedItemCount}</dd>
                                </div>
                            </dl>
                            <p className={styles.help}>
                                Criada por {list.creator.displayName} ·{' '}
                                {shoppingDate(list.createdAt)}
                            </p>
                            {list.archivedAt && (
                                <p className={styles.help}>
                                    Arquivada em {shoppingDate(list.archivedAt)}
                                    . Histórico preservado para consulta.
                                </p>
                            )}
                            {list.summary.activeItemCount === 0 && (
                                <p className={styles.help}>
                                    A lista está sem itens ativos.
                                </p>
                            )}
                            {list.summary.canSuggestArchival && (
                                <p>
                                    Todos os itens ativos foram comprados. Você
                                    pode arquivar a lista quando quiser.
                                </p>
                            )}
                        </div>
                        {!writable && (
                            <p className={styles.notice}>
                                Esta lista está disponível apenas para consulta.
                            </p>
                        )}
                        {writable && !action && (
                            <div className={styles.actions}>
                                {list.allowedActions.includes('ADD_ITEM') && (
                                    <Button
                                        disabled={disabled}
                                        onClick={() => setAction('add')}
                                    >
                                        Adicionar item
                                    </Button>
                                )}
                                {list.allowedActions.some((value) =>
                                    ['RENAME', 'ARCHIVE'].includes(value),
                                ) && (
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                disabled={disabled}
                                                type="button"
                                                variant="ghost"
                                            >
                                                Opções da lista
                                            </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="start">
                                            {list.allowedActions.includes(
                                                'RENAME',
                                            ) && (
                                                <DropdownMenuItem
                                                    onSelect={() =>
                                                        setAction('rename')
                                                    }
                                                >
                                                    Renomear lista
                                                </DropdownMenuItem>
                                            )}
                                            {list.allowedActions.includes(
                                                'ARCHIVE',
                                            ) && (
                                                <DropdownMenuItem
                                                    onSelect={() =>
                                                        setAction('archive')
                                                    }
                                                >
                                                    Arquivar lista
                                                </DropdownMenuItem>
                                            )}
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                )}
                            </div>
                        )}
                        {action && writable && (
                            <ListEditor
                                key={action}
                                list={list}
                                action={action}
                                disabled={disabled}
                                onCancel={() => setAction(null)}
                                onSubmit={command.submit}
                            />
                        )}
                        <CommandFeedback command={command} />
                        {conflict && (
                            <Button
                                variant="outline"
                                disabled={busy || query.isFetching}
                                onClick={async () => {
                                    setAction(null);
                                    const result = await query.refetch();
                                    if (!result.isError) setConflict(false);
                                }}
                            >
                                Atualizar e revisar
                            </Button>
                        )}
                    </section>
                    <section className={styles.section}>
                        <h2>Itens</h2>
                        <label className={styles.field}>
                            Mostrar itens
                            <select
                                className={styles.select}
                                disabled={busy || action !== null}
                                value={filter}
                                onChange={(event) =>
                                    setPreferences({
                                        items: event.target.value,
                                    })
                                }
                            >
                                <option value="ACTIVE">Ativos</option>
                                <option value="PENDING">
                                    Com quantidade a comprar
                                </option>
                                <option value="PURCHASED">Comprados</option>
                                <option value="REMOVED">Removidos</option>
                                <option value="ALL">Todos</option>
                            </select>
                        </label>
                        <Items
                            key={filter}
                            {...{ spaceId, personId, listId, filter }}
                        />
                    </section>
                    <RelatedTasks {...{ spaceId, personId, listId }} />
                    <ListHistory {...{ spaceId, personId, listId }} />
                </>
            )}
        </div>
    );
}
function ListEditor({
    list,
    action,
    disabled,
    onCancel,
    onSubmit,
}: {
    list: ShoppingDetail;
    action: ListAction;
    disabled: boolean;
    onCancel: () => void;
    onSubmit: (input: ListInput) => void;
}) {
    const [version] = useState(list.version),
        [name, setName] = useState(list.name ?? '');
    const [description, setDescription] = useState(''),
        [quantity, setQuantity] = useState('1'),
        [unit, setUnit] = useState('');
    const [error, setError] = useState<string | null>(null),
        [dirty, setDirty] = useState(false);
    useSpaceLeaveGuard(dirty, false, onCancel);
    const title =
        action === 'rename'
            ? 'Renomear lista'
            : action === 'archive'
              ? 'Arquivar lista'
              : 'Adicionar item';
    return (
        <form
            className={styles.form}
            onChange={() => setDirty(true)}
            onSubmit={(event) => {
                event.preventDefault();
                setError(null);
                try {
                    const body =
                        action === 'rename'
                            ? {
                                  expectedVersion: version,
                                  name: name.trim() || null,
                              }
                            : action === 'archive'
                              ? { expectedVersion: version }
                              : {
                                    expectedVersion: version,
                                    description: description.trim(),
                                    desiredQuantity: shoppingQuantity(quantity),
                                    unit: unit.trim() || null,
                                };
                    onSubmit({
                        suffix: `/${list.id}${action === 'rename' ? '/name' : action === 'archive' ? '/archival' : '/items'}`,
                        body,
                    });
                } catch (failure) {
                    setError((failure as Error).message);
                }
            }}
        >
            <fieldset disabled={disabled}>
                <legend>{title}</legend>
                {action === 'rename' && (
                    <label>
                        Nome da lista (opcional)
                        <Input
                            autoFocus
                            maxLength={120}
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                        />
                    </label>
                )}
                {action === 'add' && (
                    <>
                        <label>
                            O que precisa comprar
                            <Input
                                autoFocus
                                required
                                maxLength={500}
                                value={description}
                                onChange={(event) =>
                                    setDescription(event.target.value)
                                }
                            />
                        </label>
                        <div className={styles.columns}>
                            <label>
                                Quantidade desejada
                                <Input
                                    required
                                    inputMode="decimal"
                                    value={quantity}
                                    onChange={(event) =>
                                        setQuantity(event.target.value)
                                    }
                                />
                            </label>
                            <label>
                                Unidade (opcional)
                                <Input
                                    maxLength={30}
                                    value={unit}
                                    onChange={(event) =>
                                        setUnit(event.target.value)
                                    }
                                    placeholder="Ex.: kg, pacote"
                                />
                            </label>
                        </div>
                        <p className={styles.help}>
                            Até três casas decimais. A unidade é informativa e
                            não converte quantidades.
                        </p>
                    </>
                )}
                {action === 'archive' && (
                    <p>
                        Arquivar “{list.name ?? 'Lista sem nome'}” retira a
                        lista das compras ativas, mesmo com itens pendentes. Os
                        itens, compras, correções e vínculos ficam disponíveis
                        para consulta. A lista não poderá ser reaberta.
                    </p>
                )}
                {error && <p role="alert">{error}</p>}
                <div className={styles.actions}>
                    <Button type="submit">
                        {action === 'archive'
                            ? 'Confirmar arquivamento'
                            : action === 'rename'
                              ? 'Salvar nome'
                              : 'Salvar item'}
                    </Button>
                    <Button type="button" variant="outline" onClick={onCancel}>
                        Cancelar
                    </Button>
                </div>
            </fieldset>
        </form>
    );
}
function Items({
    spaceId,
    personId,
    listId,
    filter,
}: {
    spaceId: string;
    personId: string;
    listId: string;
    filter: string;
}) {
    const { query, pagination } = useShoppingPage<ShoppingItem>(
        personId,
        spaceId,
        `/${listId}/items`,
        { status: filter },
    );
    return (
        <>
            <QueryFeedback query={query} />
            {query.data && (
                <>
                    <p className={styles.help}>
                        {query.data.totalCount}{' '}
                        {query.data.totalCount === 1
                            ? 'item encontrado'
                            : 'itens encontrados'}
                    </p>
                    <div className={styles.surface}>
                        {query.data.items.length === 0 ? (
                            <p className={styles.empty}>
                                Nenhum item neste filtro.
                            </p>
                        ) : (
                            query.data.items.map((item) => (
                                <article key={item.id} className={styles.row}>
                                    <div className={styles.rowTitle}>
                                        <h3>
                                            <ShoppingLink
                                                className={styles.rowLink}
                                                href={`/spaces/${spaceId}/shopping/lists/${listId}/items/${item.id}`}
                                            >
                                                <span>{item.description}</span>
                                                <ChevronRight
                                                    aria-hidden="true"
                                                    size={20}
                                                />
                                            </ShoppingLink>
                                        </h3>
                                        <span className={styles.state}>
                                            {shoppingStatus[item.status]}
                                        </span>
                                    </div>
                                    <p>
                                        {item.status === 'REMOVED'
                                            ? 'Restante histórico: '
                                            : 'Falta '}
                                        {formatQuantity(
                                            item.remainingQuantity,
                                            item.unit,
                                        )}
                                    </p>
                                    <p className={styles.help}>
                                        Desejado:{' '}
                                        {formatQuantity(
                                            item.desiredQuantity,
                                            item.unit,
                                        )}{' '}
                                        · Comprado:{' '}
                                        {formatQuantity(
                                            item.purchasedQuantity,
                                            item.unit,
                                        )}
                                    </p>
                                </article>
                            ))
                        )}
                    </div>
                    {pagination}
                </>
            )}
        </>
    );
}
function RelatedTasks({
    spaceId,
    personId,
    listId,
}: {
    spaceId: string;
    personId: string;
    listId: string;
}) {
    const { query, pagination } = useShoppingPage<LinkedShoppingTask>(
        personId,
        spaceId,
        `/${listId}/tasks`,
    );
    return (
        <section className={styles.section}>
            <h2>Tarefas vinculadas</h2>
            <p className={styles.help}>
                Comprar os itens ou arquivar a lista não conclui as tarefas.
            </p>
            <QueryFeedback query={query} />
            {query.data && (
                <>
                    <div className={styles.surface}>
                        {!query.data.items.length ? (
                            <p className={styles.empty}>
                                Nenhuma tarefa vinculada. Você pode escolher
                                esta lista no detalhe de uma tarefa.
                            </p>
                        ) : (
                            query.data.items.map((task) => (
                                <div className={styles.row} key={task.id}>
                                    <ShoppingLink
                                        href={`/spaces/${spaceId}/routine/tasks/${task.id}`}
                                    >
                                        {task.description}
                                    </ShoppingLink>
                                    <span className={styles.state}>
                                        {shoppingStatus[task.status]}
                                    </span>
                                </div>
                            ))
                        )}
                    </div>
                    {pagination}
                </>
            )}
        </section>
    );
}
function ListHistory({
    spaceId,
    personId,
    listId,
}: {
    spaceId: string;
    personId: string;
    listId: string;
}) {
    const { query, pagination } = useShoppingPage<ShoppingHistory>(
        personId,
        spaceId,
        `/${listId}/history`,
    );
    const titles: Record<string, string> = {
        CREATED: 'Lista criada',
        RENAMED: 'Nome alterado',
        ITEM_ADDED: 'Item adicionado',
        ITEM_NEED_CHANGED: 'Quantidade ou unidade alterada',
        PURCHASE_RECORDED: 'Compra registrada',
        PURCHASE_CORRECTED: 'Compra corrigida',
        ITEM_REMOVED: 'Item removido',
        ARCHIVED: 'Lista arquivada',
    };
    return (
        <section className={styles.section}>
            <h2>Histórico da lista</h2>
            <QueryFeedback query={query} />
            {query.data && (
                <>
                    <ol className={styles.surface}>
                        {query.data.items.map((event) => (
                            <li className={styles.row} key={event.id}>
                                <strong>
                                    {titles[event.type] ?? 'Lista atualizada'}
                                </strong>
                                {shoppingHistoryDetail(
                                    event.type,
                                    event.data,
                                ) && (
                                    <p>
                                        {shoppingHistoryDetail(
                                            event.type,
                                            event.data,
                                        )}
                                    </p>
                                )}
                                <p className={styles.help}>
                                    Registrado por {event.actor.displayName} ·{' '}
                                    {shoppingDate(event.registeredAt)}
                                </p>
                            </li>
                        ))}
                    </ol>
                    {pagination}
                </>
            )}
        </section>
    );
}
