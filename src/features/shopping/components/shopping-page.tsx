'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    SpaceBoundary,
    QueryFeedback,
    CommandFeedback,
} from '@/features/spaces/components/space-operation-shared';
import { useSpaceContext } from '@/features/spaces/context/space-context-provider';
import { useSpaceLeaveGuard } from '@/features/spaces/hooks/use-space-leave-guard';
import { useSpaceOperation } from '@/features/spaces/hooks/use-space-operation';
import { shoppingCommand } from '@/lib/api/shopping';
import type { ShoppingList } from '../types/shopping';
import { shoppingDate, shoppingStatus } from '../utils/shopping';
import { ShoppingLink, useShoppingPage } from './shopping-shared';
import styles from './shopping.module.css';

export function ShoppingPage({
    spaceId,
    openNew = false,
}: {
    spaceId: string;
    openNew?: boolean;
}) {
    return (
        <SpaceBoundary spaceId={spaceId}>
            {(personId) => (
                <ShoppingContent
                    key={openNew ? 'new' : 'list'}
                    spaceId={spaceId}
                    personId={personId}
                    openNew={openNew}
                />
            )}
        </SpaceBoundary>
    );
}
function ShoppingContent({
    spaceId,
    personId,
    openNew,
}: {
    spaceId: string;
    personId: string;
    openNew: boolean;
}) {
    const [status, setStatus] = useState('ACTIVE');
    return (
        <div className={styles.page}>
            <header className={styles.heading}>
                <h1>Compras</h1>
                <p className={styles.help}>
                    Organize o que falta e acompanhe as compras de cada lista.
                </p>
            </header>
            <CreateList spaceId={spaceId} openNew={openNew} />
            <label className={styles.field}>
                Mostrar listas
                <select
                    className={styles.select}
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                >
                    <option value="ACTIVE">Ativas</option>
                    <option value="ARCHIVED">Arquivadas</option>
                    <option value="ALL">Todas</option>
                </select>
            </label>
            <ListResults
                key={status}
                personId={personId}
                spaceId={spaceId}
                status={status}
            />
        </div>
    );
}
function CreateList({
    spaceId,
    openNew,
}: {
    spaceId: string;
    openNew: boolean;
}) {
    const space = useSpaceContext(),
        router = useRouter();
    const [creating, setCreating] = useState(openNew),
        [name, setName] = useState('');
    const command = useSpaceOperation<
        { suffix: string; body: { name: string | null } },
        { id: string }
    >({
        execute: shoppingCommand,
        onSuccess: (result) => {
            setName('');
            setCreating(false);
            router.push(`/spaces/${spaceId}/shopping/lists/${result.id}`);
        },
    });
    const busy = command.isPending || command.canRetry;
    useSpaceLeaveGuard(creating && name.length > 0, busy, () => {
        setName('');
        setCreating(false);
    });
    if (space.currentSpace?.status !== 'ACTIVE')
        return (
            <p className={styles.notice}>
                Este espaço está disponível apenas para consulta de compras.
            </p>
        );
    return (
        <section className={styles.section}>
            {!creating ? (
                <div>
                    <Button onClick={() => setCreating(true)}>
                        Nova lista
                    </Button>
                </div>
            ) : (
                <form
                    className={styles.form}
                    onSubmit={(event) => {
                        event.preventDefault();
                        command.submit({
                            suffix: '',
                            body: { name: name.trim() || null },
                        });
                    }}
                >
                    <fieldset disabled={busy}>
                        <legend>Nova lista</legend>
                        <label>
                            Nome da lista (opcional)
                            <Input
                                autoFocus
                                maxLength={120}
                                value={name}
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
                            />
                        </label>
                        <p className={styles.help}>
                            Você pode começar sem nome e incluir os itens
                            depois.
                        </p>
                        <div className={styles.actions}>
                            <Button type="submit">Criar lista</Button>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => {
                                    setName('');
                                    setCreating(false);
                                }}
                            >
                                Cancelar
                            </Button>
                        </div>
                    </fieldset>
                    <CommandFeedback command={command} />
                </form>
            )}
        </section>
    );
}
function ListResults({
    spaceId,
    personId,
    status,
}: {
    spaceId: string;
    personId: string;
    status: string;
}) {
    const { query, pagination } = useShoppingPage<ShoppingList>(
        personId,
        spaceId,
        '',
        { status },
    );
    return (
        <section className={styles.section} aria-label="Listas de compras">
            <QueryFeedback query={query} />
            {query.data && (
                <>
                    <p className={styles.help}>
                        {query.data.totalCount}{' '}
                        {query.data.totalCount === 1 ? 'lista' : 'listas'}
                    </p>
                    <div className={styles.surface}>
                        {query.data.items.length === 0 ? (
                            <p className={styles.empty}>
                                {status === 'ARCHIVED'
                                    ? 'Nenhuma lista arquivada.'
                                    : 'Nenhuma lista por aqui. Crie uma lista para começar.'}
                            </p>
                        ) : (
                            query.data.items.map((list) => (
                                <article className={styles.row} key={list.id}>
                                    <div className={styles.rowTitle}>
                                        <h2>
                                            <ShoppingLink
                                                href={`/spaces/${spaceId}/shopping/lists/${list.id}`}
                                            >
                                                {list.name ?? 'Lista sem nome'}
                                            </ShoppingLink>
                                        </h2>
                                        <span className={styles.state}>
                                            {shoppingStatus[list.status]}
                                        </span>
                                    </div>
                                    <p className={styles.help}>
                                        {list.summary.activeItemCount === 0
                                            ? 'Sem itens ativos'
                                            : `${list.summary.actionableItemCount} de ${list.summary.activeItemCount} itens com quantidade a comprar`}
                                    </p>
                                    <p className={styles.help}>
                                        Criada em {shoppingDate(list.createdAt)}{' '}
                                        · {list.creator.displayName}
                                    </p>
                                    {list.summary.partiallyPurchasedItemCount >
                                        0 && (
                                        <p className={styles.help}>
                                            {
                                                list.summary
                                                    .partiallyPurchasedItemCount
                                            }{' '}
                                            com compra parcial
                                        </p>
                                    )}
                                </article>
                            ))
                        )}
                    </div>
                    {pagination}
                </>
            )}
        </section>
    );
}
