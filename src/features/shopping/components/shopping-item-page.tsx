'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
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
    ShoppingCorrection,
    ShoppingItem,
    ShoppingPurchase,
} from '../types/shopping';
import {
    formatQuantity,
    shoppingDate,
    shoppingQuantity,
    shoppingStatus,
} from '../utils/shopping';
import { ShoppingLink, shoppingKey, useShoppingPage } from './shopping-shared';
import styles from './shopping.module.css';

type Action =
    | { kind: 'purchase' | 'need' | 'remove' }
    | { kind: 'correct'; purchase: ShoppingPurchase };
type ItemDetail = { id: string; version: number; item: ShoppingItem };
type ItemInput = { suffix: string; body: object };
export function ShoppingItemPage({
    spaceId,
    listId,
    itemId,
}: {
    spaceId: string;
    listId: string;
    itemId: string;
}) {
    return (
        <SpaceBoundary spaceId={spaceId}>
            {(personId) => (
                <ItemContent
                    key={`${listId}:${itemId}`}
                    {...{ spaceId, listId, itemId, personId }}
                />
            )}
        </SpaceBoundary>
    );
}
function ItemContent({
    spaceId,
    listId,
    itemId,
    personId,
}: {
    spaceId: string;
    listId: string;
    itemId: string;
    personId: string;
}) {
    const space = useSpaceContext(),
        [action, setAction] = useState<Action | null>(null);
    const [conflict, setConflict] = useState(false),
        [notice, setNotice] = useState('');
    const suffix = `/${listId}/items/${itemId}`;
    const query = useSpaceQuery(
        personId,
        spaceId,
        shoppingKey(personId, spaceId, listId, itemId),
        true,
        (signal) => getShopping<ItemDetail>(spaceId, suffix, signal),
    );
    const command = useSpaceOperation<ItemInput, ItemDetail>({
        execute: shoppingCommand,
        onSuccess: () => {
            setAction(null);
            setNotice('Registro confirmado. As quantidades foram atualizadas.');
        },
        onConflict: () => setConflict(true),
    });
    const busy = command.isPending || command.canRetry;
    useSpaceLeaveGuard(false, busy, () => setAction(null));
    const item = query.data?.item,
        disabled = busy || query.isFetching || query.isError || conflict;
    const canWrite =
        space.currentSpace?.status === 'ACTIVE' &&
        Boolean(item?.allowedActions.length);
    return (
        <div className={styles.page}>
            <header className={styles.heading}>
                <ShoppingLink
                    href={`/spaces/${spaceId}/shopping/lists/${listId}`}
                >
                    Voltar à lista
                </ShoppingLink>
                <h1>{item?.description ?? 'Item de compras'}</h1>
            </header>
            <QueryFeedback query={query} />
            {notice && (
                <p role="status" className={styles.success}>
                    {notice}
                </p>
            )}
            {item && query.data && (
                <>
                    <section className={styles.section}>
                        <div className={styles.rowTitle}>
                            <h2>Quantidade e progresso</h2>
                            <span className={styles.state}>
                                {shoppingStatus[item.status]}
                            </span>
                        </div>
                        <div className={`${styles.surface} ${styles.row}`}>
                            <dl className={styles.summary}>
                                <div>
                                    <dt>Desejado</dt>
                                    <dd>
                                        {formatQuantity(
                                            item.desiredQuantity,
                                            item.unit,
                                        )}
                                    </dd>
                                </div>
                                <div>
                                    <dt>Comprado após correções</dt>
                                    <dd>
                                        {formatQuantity(
                                            item.purchasedQuantity,
                                            item.unit,
                                        )}
                                    </dd>
                                </div>
                                <div>
                                    <dt>
                                        {item.status === 'REMOVED'
                                            ? 'Restante histórico'
                                            : 'Falta comprar'}
                                    </dt>
                                    <dd>
                                        {formatQuantity(
                                            item.remainingQuantity,
                                            item.unit,
                                        )}
                                    </dd>
                                </div>
                            </dl>
                            <p className={styles.help}>
                                Item registrado por {item.creator.displayName} ·{' '}
                                {shoppingDate(item.createdAt)}
                            </p>
                            {item.removedAt && (
                                <p className={styles.help}>
                                    Removido em {shoppingDate(item.removedAt)}.
                                    As compras e correções foram preservadas.
                                </p>
                            )}
                        </div>
                        <p className={styles.help}>
                            Registrar uma compra nesta lista não gera despesa.
                            Para registrar o valor gasto, adicione uma despesa
                            em Finanças.
                        </p>
                        {!canWrite && (
                            <p className={styles.notice}>
                                Este item está disponível apenas para consulta.
                            </p>
                        )}
                        {!action && canWrite && (
                            <div className={styles.actions}>
                                {item.allowedActions.includes(
                                    'RECORD_PURCHASE',
                                ) && (
                                    <Button
                                        disabled={disabled}
                                        onClick={() =>
                                            setAction({ kind: 'purchase' })
                                        }
                                    >
                                        Registrar compra
                                    </Button>
                                )}
                                {item.allowedActions.includes(
                                    'CHANGE_NEED',
                                ) && (
                                    <Button
                                        variant="outline"
                                        disabled={disabled}
                                        onClick={() =>
                                            setAction({ kind: 'need' })
                                        }
                                    >
                                        Alterar quantidade ou unidade
                                    </Button>
                                )}
                                {item.allowedActions.includes('REMOVE') && (
                                    <Button
                                        variant="outline"
                                        disabled={disabled}
                                        onClick={() =>
                                            setAction({ kind: 'remove' })
                                        }
                                    >
                                        Remover item
                                    </Button>
                                )}
                            </div>
                        )}
                        {action && canWrite && (
                            <ItemEditor
                                key={
                                    action.kind === 'correct'
                                        ? action.purchase.id
                                        : action.kind
                                }
                                action={action}
                                item={item}
                                version={query.data.version}
                                disabled={disabled}
                                onCancel={() => setAction(null)}
                                onSubmit={(suffixPart, body) =>
                                    command.submit({
                                        suffix: `${suffix}${suffixPart}`,
                                        body,
                                    })
                                }
                            />
                        )}
                        <CommandFeedback command={command} />
                        {conflict && (
                            <Button
                                disabled={busy || query.isFetching}
                                variant="outline"
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
                    <Purchases
                        {...{ spaceId, personId, listId, itemId }}
                        canCorrect={
                            canWrite &&
                            item.allowedActions.includes('RECORD_PURCHASE') &&
                            !action
                        }
                        disabled={disabled}
                        onCorrect={(purchase) =>
                            setAction({ kind: 'correct', purchase })
                        }
                    />
                </>
            )}
        </div>
    );
}
function ItemEditor({
    item,
    action,
    version: currentVersion,
    disabled,
    onCancel,
    onSubmit,
}: {
    item: ShoppingItem;
    action: Action;
    version: number;
    disabled: boolean;
    onCancel: () => void;
    onSubmit: (suffix: string, body: object) => void;
}) {
    const [version] = useState(currentVersion);
    const [quantity, setQuantity] = useState(
        action.kind === 'correct'
            ? action.purchase.effectiveQuantity.replace('.', ',')
            : action.kind === 'need'
              ? item.desiredQuantity.replace('.', ',')
              : item.remainingQuantity === '0'
                ? ''
                : item.remainingQuantity.replace('.', ','),
    );
    const [unit, setUnit] = useState(item.unit ?? ''),
        [dirty, setDirty] = useState(false),
        [error, setError] = useState<string | null>(null);
    useSpaceLeaveGuard(dirty, false, onCancel);
    const title =
        action.kind === 'purchase'
            ? 'Registrar compra'
            : action.kind === 'need'
              ? 'Alterar quantidade ou unidade'
              : action.kind === 'correct'
                ? 'Corrigir registro de compra'
                : 'Remover item';
    return (
        <form
            className={styles.form}
            onChange={() => setDirty(true)}
            onSubmit={(event) => {
                event.preventDefault();
                setError(null);
                try {
                    const body =
                        action.kind === 'remove'
                            ? { expectedVersion: version }
                            : action.kind === 'need'
                              ? {
                                    expectedVersion: version,
                                    desiredQuantity: shoppingQuantity(quantity),
                                    unit: unit.trim() || null,
                                }
                              : {
                                    expectedVersion: version,
                                    quantity: shoppingQuantity(
                                        quantity,
                                        action.kind === 'correct',
                                    ),
                                };
                    const suffix =
                        action.kind === 'remove'
                            ? '/removal'
                            : action.kind === 'need'
                              ? '/need'
                              : action.kind === 'correct'
                                ? `/purchases/${action.purchase.id}/corrections`
                                : '/purchases';
                    onSubmit(suffix, body);
                } catch (failure) {
                    setError((failure as Error).message);
                }
            }}
        >
            <fieldset disabled={disabled}>
                <legend>{title}</legend>
                {action.kind === 'correct' && (
                    <>
                        <p>
                            Este registro foi feito por{' '}
                            {action.purchase.registeredBy.displayName} em{' '}
                            {shoppingDate(action.purchase.registeredAt)}.
                        </p>
                        <p className={styles.help}>
                            Original:{' '}
                            {formatQuantity(
                                action.purchase.quantity,
                                action.purchase.unit,
                            )}
                            . Quantidade efetiva atual:{' '}
                            {formatQuantity(
                                action.purchase.effectiveQuantity,
                                action.purchase.unit,
                            )}
                            . A correção substitui a quantidade efetiva deste
                            registro e preserva o original e as correções
                            anteriores.
                        </p>
                    </>
                )}
                {action.kind !== 'remove' && (
                    <label>
                        {action.kind === 'need'
                            ? 'Nova quantidade desejada'
                            : action.kind === 'correct'
                              ? 'Nova quantidade efetiva deste registro'
                              : 'Quantidade comprada agora'}
                        <Input
                            autoFocus
                            required
                            inputMode="decimal"
                            value={quantity}
                            onChange={(event) =>
                                setQuantity(event.target.value)
                            }
                        />
                    </label>
                )}
                {action.kind === 'need' && (
                    <>
                        <label>
                            Unidade (opcional)
                            <Input
                                maxLength={30}
                                value={unit}
                                onChange={(event) =>
                                    setUnit(event.target.value)
                                }
                            />
                        </label>
                        <p className={styles.help}>
                            Mudar a unidade não converte quantidades nem altera
                            a unidade das compras anteriores. Uma redução do
                            desejado não pode ficar abaixo do total já comprado.
                        </p>
                    </>
                )}
                {action.kind === 'purchase' && (
                    <p className={styles.help}>
                        Cada registro acrescenta a quantidade comprada. Você
                        pode registrar compras parciais e uma quantidade acima
                        do desejado.
                    </p>
                )}
                {action.kind === 'correct' && (
                    <p className={styles.help}>
                        Use zero para anular a quantidade efetiva deste
                        registro. O histórico fica preservado.
                    </p>
                )}
                {action.kind === 'remove' && (
                    <p>
                        Remover “{item.description}” retira este item das
                        pendências e preserva as compras e correções. Ele não
                        poderá ser reativado; você poderá adicionar um novo item
                        à lista.
                    </p>
                )}
                {error && <p role="alert">{error}</p>}
                <div className={styles.actions}>
                    <Button type="submit">
                        {action.kind === 'remove'
                            ? 'Confirmar remoção'
                            : action.kind === 'correct'
                              ? 'Confirmar correção'
                              : action.kind === 'need'
                                ? 'Salvar alteração'
                                : 'Confirmar compra'}
                    </Button>
                    <Button type="button" variant="outline" onClick={onCancel}>
                        Cancelar
                    </Button>
                </div>
            </fieldset>
        </form>
    );
}
function Purchases({
    spaceId,
    personId,
    listId,
    itemId,
    canCorrect,
    disabled,
    onCorrect,
}: {
    spaceId: string;
    personId: string;
    listId: string;
    itemId: string;
    canCorrect: boolean;
    disabled: boolean;
    onCorrect: (purchase: ShoppingPurchase) => void;
}) {
    const { query, pagination } = useShoppingPage<ShoppingPurchase>(
        personId,
        spaceId,
        `/${listId}/items/${itemId}/purchases`,
    );
    return (
        <section className={styles.section}>
            <h2>Compras registradas</h2>
            <QueryFeedback query={query} />
            {query.data && (
                <>
                    <div className={styles.surface}>
                        {!query.data.items.length ? (
                            <p className={styles.empty}>
                                Ainda não há compras registradas para este item.
                            </p>
                        ) : (
                            query.data.items.map((purchase) => (
                                <PurchaseRow
                                    key={purchase.id}
                                    {...{
                                        spaceId,
                                        personId,
                                        listId,
                                        itemId,
                                        purchase,
                                        onCorrect,
                                    }}
                                    canCorrect={
                                        canCorrect &&
                                        !query.isError &&
                                        !query.isFetching
                                    }
                                    disabled={disabled}
                                />
                            ))
                        )}
                    </div>
                    {pagination}
                </>
            )}
        </section>
    );
}
function PurchaseRow({
    spaceId,
    personId,
    listId,
    itemId,
    purchase,
    canCorrect,
    disabled,
    onCorrect,
}: {
    spaceId: string;
    personId: string;
    listId: string;
    itemId: string;
    purchase: ShoppingPurchase;
    canCorrect: boolean;
    disabled: boolean;
    onCorrect: (purchase: ShoppingPurchase) => void;
}) {
    const [history, setHistory] = useState(false);
    return (
        <article className={styles.row}>
            <h3>
                {formatQuantity(purchase.effectiveQuantity, purchase.unit)}{' '}
                efetivos
            </h3>
            <p className={styles.help}>
                Original: {formatQuantity(purchase.quantity, purchase.unit)}
            </p>
            <p className={styles.help}>
                Registrado por {purchase.registeredBy.displayName} ·{' '}
                {shoppingDate(purchase.registeredAt)}
            </p>
            <div className={styles.actions}>
                {canCorrect && (
                    <Button
                        variant="outline"
                        disabled={disabled}
                        onClick={() => onCorrect(purchase)}
                    >
                        Corrigir este registro
                    </Button>
                )}
                <Button
                    variant="ghost"
                    disabled={disabled}
                    aria-expanded={history}
                    onClick={() => setHistory(!history)}
                >
                    {history ? 'Ocultar correções' : 'Ver correções'}
                </Button>
            </div>
            {history && (
                <Corrections
                    {...{
                        spaceId,
                        personId,
                        listId,
                        itemId,
                        purchaseId: purchase.id,
                    }}
                />
            )}
        </article>
    );
}
function Corrections({
    spaceId,
    personId,
    listId,
    itemId,
    purchaseId,
}: {
    spaceId: string;
    personId: string;
    listId: string;
    itemId: string;
    purchaseId: string;
}) {
    const { query, pagination } = useShoppingPage<ShoppingCorrection>(
        personId,
        spaceId,
        `/${listId}/items/${itemId}/purchases/${purchaseId}/corrections`,
    );
    return (
        <div className={styles.section}>
            <h4>Histórico de correções</h4>
            <QueryFeedback query={query} />
            {query.data && (
                <>
                    {!query.data.items.length ? (
                        <p className={styles.help}>
                            Este registro ainda não foi corrigido.
                        </p>
                    ) : (
                        <ol>
                            {query.data.items.map((correction) => (
                                <li className={styles.row} key={correction.id}>
                                    <p>
                                        De{' '}
                                        {formatQuantity(
                                            correction.previousQuantity,
                                            correction.unit,
                                        )}{' '}
                                        para{' '}
                                        {formatQuantity(
                                            correction.quantity,
                                            correction.unit,
                                        )}
                                    </p>
                                    <p className={styles.help}>
                                        Registrado por{' '}
                                        {correction.correctedBy.displayName} ·{' '}
                                        {shoppingDate(correction.correctedAt)}
                                    </p>
                                </li>
                            ))}
                        </ol>
                    )}
                    {pagination}
                </>
            )}
        </div>
    );
}
