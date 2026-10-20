import { apiRequest } from './api-client';

type RecordValue = Record<string, unknown>;
const record = (value: unknown): RecordValue | null =>
    value !== null && typeof value === 'object' && !Array.isArray(value)
        ? (value as RecordValue)
        : null;

function verifyShoppingIdentity(
    result: unknown,
    spaceId: string,
    suffix: string,
) {
    const root = record(result);
    const [listId, resource, itemId, purchases, purchaseId] = suffix
        .split('?')[0]
        .split('/')
        .filter(Boolean);
    const mismatch = () => {
        throw new Error(
            'Os dados recebidos não correspondem a esta lista ou item. Atualize a consulta.',
        );
    };
    if (!root) return mismatch();
    function check(
        value: RecordValue,
        field: string,
        expected: string | undefined,
    ) {
        if (expected && field in value && value[field] !== expected) mismatch();
    }
    check(root, 'spaceId', spaceId);
    check(root, 'id', listId);
    check(root, 'listId', listId);
    check(root, 'itemId', resource === 'items' ? itemId : undefined);
    check(
        root,
        'purchaseId',
        purchases === 'purchases' ? purchaseId : undefined,
    );
    const validateItem = (value: unknown) => {
        const item = record(value);
        if (!item || item.listId !== listId) return mismatch();
        check(item, 'id', itemId);
    };
    if (root.item !== undefined) validateItem(root.item);
    for (const field of ['purchase', 'correction']) {
        const value = record(root[field]);
        if (value) {
            check(value, 'listId', listId);
            check(value, 'itemId', itemId);
            check(
                value,
                field === 'purchase' ? 'id' : 'purchaseId',
                purchaseId,
            );
        }
    }
    const nestedItems = record(root.items);
    if (nestedItems && Array.isArray(nestedItems.items))
        nestedItems.items.forEach(validateItem);
    if (Array.isArray(root.items)) {
        for (const value of root.items) {
            const row = record(value);
            if (!row) return mismatch();
            check(row, 'spaceId', spaceId);
            if (!listId && row.spaceId !== spaceId) mismatch();
            if (resource === 'items' && !itemId) validateItem(row);
            check(row, 'listId', listId);
            check(row, 'itemId', itemId);
            check(row, 'purchaseId', purchaseId);
            check(row, 'shoppingListId', listId);
        }
    }
}

export async function getShopping<T>(
    spaceId: string,
    suffix: string,
    signal?: AbortSignal,
): Promise<T & { spaceId: string }> {
    const result = await apiRequest<T>(
        `/spaces/${spaceId}/shopping-lists${suffix}`,
        { signal },
    );
    verifyShoppingIdentity(result, spaceId, suffix);
    return { spaceId, ...result };
}
export async function shoppingCommand<T>(
    spaceId: string,
    input: { suffix: string; body: object },
    csrfToken: string,
    idempotencyKey: string,
    signal: AbortSignal,
) {
    const result = await apiRequest<T>(
        `/spaces/${spaceId}/shopping-lists${input.suffix}`,
        {
            method: 'POST',
            body: input.body,
            csrfToken,
            idempotencyKey,
            signal,
        },
    );
    verifyShoppingIdentity(result, spaceId, input.suffix);
    return result;
}
export function shoppingTaskCommand<T>(
    spaceId: string,
    input: { taskId: string; body: object; remove: boolean },
    csrfToken: string,
    idempotencyKey: string,
    signal: AbortSignal,
) {
    return apiRequest<T>(
        `/spaces/${spaceId}/tasks/${input.taskId}/shopping-list${input.remove ? '/removal' : ''}`,
        { method: 'POST', body: input.body, csrfToken, idempotencyKey, signal },
    );
}
